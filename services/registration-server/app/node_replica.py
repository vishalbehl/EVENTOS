"""Small embedded SQLite replica used by Registration/Scanning edge clients.

The UI clients can use this module from their desktop wrapper; the Venue Server
only remains the authoritative PostgreSQL store. SQLite is intentionally used
here instead of a second PostgreSQL service on every workstation.
"""
from __future__ import annotations

import json
import hashlib
import secrets
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import httpx


class NodeReplica:
    def __init__(self, database_path: str | Path):
        self.path = str(database_path)
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(self.path, check_same_thread=False)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA journal_mode=WAL")
        self.connection.execute("PRAGMA foreign_keys=ON")
        self.connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS replica_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS participants (id TEXT PRIMARY KEY, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS registrations (id TEXT PRIMARY KEY, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS companions (id TEXT PRIMARY KEY, participant_id TEXT NOT NULL, data TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS ix_companions_participant_id ON companions(participant_id);
            CREATE TABLE IF NOT EXISTS badges (id TEXT PRIMARY KEY, participant_id TEXT NOT NULL, badge_code TEXT NOT NULL, data TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS ix_badges_participant_id ON badges(participant_id);
            CREATE INDEX IF NOT EXISTS ix_badges_badge_code ON badges(badge_code);
            CREATE TABLE IF NOT EXISTS capacity_rules (id TEXT PRIMARY KEY, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS kits (id TEXT PRIMARY KEY, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS participant_kits (id TEXT PRIMARY KEY, participant_id TEXT NOT NULL, kit_id TEXT NOT NULL, data TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS ix_participant_kits_participant_id ON participant_kits(participant_id);
            CREATE TABLE IF NOT EXISTS local_users (
              id TEXT PRIMARY KEY,
              username TEXT NOT NULL UNIQUE,
              email TEXT,
              password_hash TEXT NOT NULL,
              role TEXT NOT NULL,
              allowed_modes TEXT NOT NULL,
              data TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS venue_scan_events (id TEXT PRIMARY KEY, event_id TEXT NOT NULL, participant_id TEXT, companion_id TEXT, gate_id TEXT, operation_id TEXT, status TEXT NOT NULL, data TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS ix_local_scan_identity ON venue_scan_events(event_id, participant_id, companion_id, gate_id, status);
            CREATE TABLE IF NOT EXISTS venue_checkins (id TEXT PRIMARY KEY, event_id TEXT NOT NULL, participant_id TEXT, companion_id TEXT, gate_id TEXT, operation_id TEXT, status TEXT NOT NULL, data TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS ix_local_checkin_identity ON venue_checkins(event_id, participant_id, companion_id, gate_id, status);
            CREATE TABLE IF NOT EXISTS node_outbox (
              operation_id TEXT PRIMARY KEY, action TEXT NOT NULL, payload TEXT NOT NULL,
              occurred_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', server_error TEXT
            );
            """
        )
        self.connection.commit()

    @staticmethod
    def _password_hash(password: str, salt: str | None = None) -> str:
        salt = salt or secrets.token_hex(16)
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), 240_000)
        return f"pbkdf2_sha256${salt}${digest.hex()}"

    @staticmethod
    def _verify_password(password: str, stored_hash: str) -> bool:
        try:
            algorithm, salt, expected = stored_hash.split("$", 2)
            if algorithm != "pbkdf2_sha256":
                return False
            actual = NodeReplica._password_hash(password, salt).split("$", 2)[2]
            return secrets.compare_digest(actual, expected)
        except ValueError:
            return False

    def verify_local_admin(self, username: str, password: str) -> dict[str, Any] | None:
        identifier = username.strip().lower()
        row = self.connection.execute(
            """
            SELECT id,username,email,password_hash,role,allowed_modes,created_at,updated_at
            FROM local_users
            WHERE lower(username)=? OR lower(coalesce(email,''))=?
            """,
            (identifier, identifier),
        ).fetchone()
        if not row or row["role"] not in {"admin", "super_admin"}:
            return None
        if "admin" not in (json.loads(row["allowed_modes"]) if row["allowed_modes"] else []):
            return None
        if not self._verify_password(password, row["password_hash"]):
            return None
        return {
            "id": row["id"],
            "username": row["username"],
            "email": row["email"],
            "role": row["role"],
            "allowed_modes": json.loads(row["allowed_modes"]),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def ensure_default_admin(self, username: str, password: str, email: str) -> dict[str, Any]:
        """Create the first local admin account in an empty workstation DB.

        This is intentionally scoped to the embedded SQLite replica so a fresh
        desktop install can open with an admin login/import screen even before
        it reaches the shared venue PostgreSQL database.
        """
        existing = self.connection.execute("SELECT id,username,email,role,allowed_modes,created_at,updated_at FROM local_users WHERE username=?", (username,)).fetchone()
        if existing:
            return {
                "id": existing["id"],
                "username": existing["username"],
                "email": existing["email"],
                "role": existing["role"],
                "allowed_modes": json.loads(existing["allowed_modes"]),
                "created_at": existing["created_at"],
                "updated_at": existing["updated_at"],
            }

        now = datetime.now(timezone.utc).isoformat()
        user = {
            "id": str(uuid.uuid4()),
            "username": username,
            "email": email,
            "role": "super_admin",
            "allowed_modes": ["admin"],
            "created_at": now,
            "updated_at": now,
        }
        with self.connection:
            self.connection.execute(
                """
                INSERT INTO local_users(id,username,email,password_hash,role,allowed_modes,data,created_at,updated_at)
                VALUES(?,?,?,?,?,?,?,?,?)
                """,
                (
                    user["id"],
                    username,
                    email,
                    self._password_hash(password),
                    user["role"],
                    json.dumps(user["allowed_modes"]),
                    json.dumps(user),
                    now,
                    now,
                ),
            )
            self.connection.executemany("INSERT OR REPLACE INTO replica_meta(key,value) VALUES(?,?)", [
                ("local_bootstrap_admin", username),
                ("local_bootstrap_admin_created_at", now),
            ])
        return user

    def load_snapshot(self, snapshot: dict[str, Any]) -> None:
        """Atomically replace the event-scoped read model after hash verification."""
        expected_hash = snapshot.get("snapshot", {}).get("sha256")
        canonical = dict(snapshot)
        canonical.pop("snapshot", None)
        actual_hash = hashlib.sha256(json.dumps(canonical, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        if not expected_hash or expected_hash != actual_hash:
            raise ValueError("Venue snapshot integrity check failed")
        with self.connection:
            self.connection.execute("DELETE FROM participants")
            self.connection.execute("DELETE FROM registrations")
            self.connection.execute("DELETE FROM companions")
            self.connection.execute("DELETE FROM badges")
            self.connection.execute("DELETE FROM capacity_rules")
            self.connection.execute("DELETE FROM kits")
            self.connection.execute("DELETE FROM participant_kits")
            self.connection.execute("DELETE FROM venue_scan_events")
            self.connection.execute("DELETE FROM venue_checkins")
            for row in snapshot.get("participants", []):
                self.connection.execute("INSERT INTO participants(id,data) VALUES(?,?)", (row["id"], json.dumps(row)))
            for row in snapshot.get("registrations", []):
                self.connection.execute("INSERT INTO registrations(id,data) VALUES(?,?)", (row["id"], json.dumps(row)))
            for row in snapshot.get("companions", []):
                self.connection.execute("INSERT INTO companions(id,participant_id,data) VALUES(?,?,?)", (row["id"], row["primary_participant_id"], json.dumps(row)))
            for row in snapshot.get("badges", []):
                self.connection.execute("INSERT INTO badges(id,participant_id,badge_code,data) VALUES(?,?,?,?)", (row["id"], row["participant_id"], row.get("badge_code") or "", json.dumps(row)))
            for row in snapshot.get("capacity_rules", []):
                self.connection.execute("INSERT INTO capacity_rules(id,data) VALUES(?,?)", (row["id"], json.dumps(row)))
            for row in snapshot.get("kits", []):
                self.connection.execute("INSERT INTO kits(id,data) VALUES(?,?)", (row["id"], json.dumps(row)))
            for row in snapshot.get("participant_kits", []):
                self.connection.execute("INSERT INTO participant_kits(id,participant_id,kit_id,data) VALUES(?,?,?,?)", (row["id"], row["participant_id"], row["kit_id"], json.dumps(row)))
            for row in snapshot.get("venue_scan_events", []):
                self._insert_scan_event(row)
            for row in snapshot.get("venue_checkins", []):
                self._insert_checkin(row)
            event_id = snapshot.get("event", {}).get("id", "")
            assignment = snapshot.get("assignment", {})
            permissions = assignment.get("permissions") if isinstance(assignment.get("permissions"), dict) else {}
            allowed_modes = permissions.get("allowed_modes") if isinstance(permissions.get("allowed_modes"), list) else [assignment.get("mode", "")]
            self.connection.executemany("INSERT OR REPLACE INTO replica_meta(key,value) VALUES(?,?)", [
                ("event_id", event_id),
                ("assignment_id", assignment.get("id", "")),
                ("mode", assignment.get("mode", "")),
                ("allowed_modes", json.dumps(allowed_modes)),
                ("station_id", assignment.get("station_id") or ""),
                ("capacity_rule_id", assignment.get("capacity_rule_id") or ""),
                ("snapshot_version", str(snapshot.get("snapshot", {}).get("version", 0))),
                ("snapshot_sha256", snapshot.get("snapshot", {}).get("sha256", "")),
                ("last_snapshot_at", snapshot.get("snapshot", {}).get("generated_at", "")),
            ])

    def queue_operation(self, action: str, payload: dict[str, Any], operation_id: str | None = None) -> str:
        operation_id = operation_id or str(uuid.uuid4())
        occurred_at = datetime.now(timezone.utc).isoformat()
        with self.connection:
            self.connection.execute("INSERT OR IGNORE INTO node_outbox(operation_id,action,payload,occurred_at) VALUES(?,?,?,?)", (operation_id, action, json.dumps(payload), occurred_at))
        return operation_id

    def _insert_scan_event(self, row: dict[str, Any]) -> None:
        self.connection.execute(
            "INSERT OR REPLACE INTO venue_scan_events(id,event_id,participant_id,companion_id,gate_id,operation_id,status,data) VALUES(?,?,?,?,?,?,?,?)",
            (
                row["id"],
                row.get("event_id") or "",
                row.get("participant_id"),
                row.get("companion_id"),
                row.get("checkin_gate_id") or row.get("station_id"),
                row.get("operation_id"),
                row.get("status") or "success",
                json.dumps(row),
            ),
        )

    def _insert_checkin(self, row: dict[str, Any]) -> None:
        self.connection.execute(
            "INSERT OR REPLACE INTO venue_checkins(id,event_id,participant_id,companion_id,gate_id,operation_id,status,data) VALUES(?,?,?,?,?,?,?,?)",
            (
                row["id"],
                row.get("event_id") or "",
                row.get("participant_id"),
                row.get("companion_id"),
                row.get("checkin_gate_id") or row.get("station_id"),
                row.get("operation_id"),
                row.get("status") or "success",
                json.dumps(row),
            ),
        )

    def record_local_checkin(self, participant: dict[str, Any], gate: dict[str, Any], operation_id: str, method: str = "qr", companion: dict[str, Any] | None = None) -> dict[str, Any]:
        event_id = self.assignment().get("event_id", "")
        now = datetime.now(timezone.utc).isoformat()
        badge_code = (companion or participant).get("badge_code") or participant.get("regno") or ""
        scan = {
            "id": str(uuid.uuid4()),
            "event_id": event_id,
            "participant_id": participant.get("id"),
            "companion_id": companion.get("id") if companion else None,
            "checkin_gate_id": gate.get("id"),
            "station_name": gate.get("station_name") or gate.get("gate_name"),
            "station_type": gate.get("station_type") or gate.get("gate_type"),
            "badge_code": badge_code,
            "scan_type": "check_in",
            "status": "success",
            "operation_id": operation_id,
            "created_at": now,
            "sync_status": "pending",
        }
        checkin = {
            **scan,
            "id": str(uuid.uuid4()),
            "gate_name": scan["station_name"],
            "gate_type": scan["station_type"],
            "gate_capacity": gate.get("station_capacity") or gate.get("gate_capacity") or 0,
            "checkin_time": now,
            "checkout_time": None,
            "duration": None,
            "method": method,
            "device_id": self.assignment().get("assignment_id", "offline-node"),
        }
        with self.connection:
            self._insert_scan_event(scan)
            self._insert_checkin(checkin)
        return {"scan": scan, "checkin": checkin}

    def local_successful_checkin_count(self, participant_id: str, gate_id: str, companion_id: str | None = None) -> int:
        event_id = self.assignment().get("event_id", "")
        row = self.connection.execute(
            """
            SELECT COUNT(*) FROM venue_scan_events
            WHERE event_id=? AND participant_id=? AND gate_id=? AND status IN ('success','admin_overridden')
            AND ((companion_id IS NULL AND ? IS NULL) OR companion_id=?)
            """,
            (event_id, participant_id, gate_id, companion_id, companion_id),
        ).fetchone()
        return int(row[0] if row else 0)

    def pending_operations(self, limit: int = 500) -> list[dict[str, Any]]:
        rows = self.connection.execute("SELECT operation_id,action,payload,occurred_at FROM node_outbox WHERE status='pending' ORDER BY occurred_at LIMIT ?", (limit,)).fetchall()
        return [{"operation_id": row[0], "action": row[1], "payload": json.loads(row[2]), "occurred_at": row[3]} for row in rows]

    def participant_by_query(self, query: str) -> dict[str, Any] | None:
        query = query.strip().lower()
        for row in self.connection.execute("SELECT data FROM participants"):
            participant = json.loads(row[0])
            values = [participant.get("id"), participant.get("regno"), participant.get("name"), participant.get("email"), participant.get("phone"), participant.get("badge_code")]
            if any(query and query in str(value or "").lower() for value in values):
                return participant
        return None

    def companion_by_query(self, query: str) -> tuple[dict[str, Any], dict[str, Any]] | None:
        query = query.strip().lower()
        for row in self.connection.execute("SELECT data FROM companions"):
            companion = json.loads(row[0])
            full_name = f"{companion.get('first_name') or ''} {companion.get('last_name') or ''}".strip()
            values = [companion.get("id"), companion.get("badge_code"), companion.get("email"), companion.get("phone"), full_name]
            if any(query and query in str(value or "").lower() for value in values):
                participant_row = self.connection.execute("SELECT data FROM participants WHERE id=?", (companion["primary_participant_id"],)).fetchone()
                if participant_row:
                    return json.loads(participant_row[0]), companion
        return None

    def identity_by_query(self, query: str) -> tuple[dict[str, Any], dict[str, Any] | None] | None:
        companion = self.companion_by_query(query)
        if companion:
            return companion
        participant = self.participant_by_query(query)
        return (participant, None) if participant else None

    def capacity_rule(self, rule_id: str) -> dict[str, Any] | None:
        row = self.connection.execute("SELECT data FROM capacity_rules WHERE id=?", (rule_id,)).fetchone()
        return json.loads(row[0]) if row else None

    def assignment(self) -> dict[str, str]:
        rows = self.connection.execute("SELECT key,value FROM replica_meta WHERE key IN ('assignment_id','mode','allowed_modes','station_id','capacity_rule_id','event_id')").fetchall()
        return {row[0]: row[1] for row in rows}

    def mark_uploaded(self, operation_ids: list[str]) -> None:
        with self.connection:
            self.connection.executemany("UPDATE node_outbox SET status='uploaded' WHERE operation_id=?", ((item,) for item in operation_ids))

    def mark_conflicted(self, conflicts: list[dict[str, Any]]) -> None:
        with self.connection:
            self.connection.executemany("UPDATE node_outbox SET status='conflict', server_error=? WHERE operation_id=?", ((item.get("reason"), item.get("operation_id")) for item in conflicts))

    def close(self) -> None:
        self.connection.close()


class VenueNodeClient:
    """Sync adapter used by a workstation wrapper (Electron/service) on the venue LAN."""

    def __init__(self, base_url: str, assignment_id: str, token: str, replica: NodeReplica):
        self.base_url = base_url.rstrip("/")
        self.assignment_id = assignment_id
        self.token = token
        self.replica = replica

    @property
    def headers(self) -> dict[str, str]:
        return {"X-Venue-Node-Token": self.token}

    async def bootstrap(self) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(f"{self.base_url}/api/v1/venue/nodes/{self.assignment_id}/bootstrap", headers=self.headers)
            response.raise_for_status()
            snapshot = response.json()
        self.replica.load_snapshot(snapshot)
        return snapshot

    async def synchronize(self) -> dict[str, Any]:
        pending = self.replica.pending_operations()
        result: dict[str, Any] = {"accepted": [], "duplicates": [], "conflicts": []}
        async with httpx.AsyncClient(timeout=30) as client:
            if pending:
                response = await client.post(f"{self.base_url}/api/v1/venue/nodes/{self.assignment_id}/operations", headers=self.headers, json={"operations": pending})
                response.raise_for_status()
                result = response.json()
                self.replica.mark_uploaded(result.get("accepted", []) + result.get("duplicates", []))
                self.replica.mark_conflicted(result.get("conflicts", []))
            heartbeat = await client.post(f"{self.base_url}/api/v1/venue/nodes/{self.assignment_id}/heartbeat", headers=self.headers)
            heartbeat.raise_for_status()
        return result
