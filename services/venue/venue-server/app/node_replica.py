"""Small embedded SQLite replica used by Registration/Scanning edge clients.

The UI clients can use this module from their desktop wrapper; the Venue Server
only remains the authoritative PostgreSQL store. SQLite is intentionally used
here instead of a second PostgreSQL service on every workstation.
"""
from __future__ import annotations

import json
import hashlib
import secrets
import shutil
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import httpx


class NodeReplica:
    def __init__(self, database_path: str | Path):
        self.path = str(database_path)
        database_file = Path(self.path)
        database_file.parent.mkdir(parents=True, exist_ok=True)
        had_database = database_file.exists() and database_file.stat().st_size > 0
        self.connection = sqlite3.connect(self.path, check_same_thread=False)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA journal_mode=WAL")
        self.connection.execute("PRAGMA foreign_keys=ON")
        existing_schema_version = int(self.connection.execute("PRAGMA user_version").fetchone()[0] or 0)
        backup_path = Path(f"{self.path}.pre-migration-v4.bak")
        needs_migration = existing_schema_version < 4

        # A workstation database is user state, not disposable cache. Keep a
        # consistent SQLite backup before changing its schema so an interrupted
        # desktop upgrade can be recovered on the next launch.
        if had_database and needs_migration and not backup_path.exists():
            backup_connection = sqlite3.connect(str(backup_path))
            try:
                self.connection.backup(backup_connection)
            finally:
                backup_connection.close()

        # If the previous process died after recording that migration started,
        # restore the last consistent backup before retrying the ordered steps.
        meta_exists = self.connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='replica_meta'"
        ).fetchone()
        migration_in_progress = False
        if meta_exists:
            migration_in_progress = self.connection.execute(
                "SELECT value FROM replica_meta WHERE key='local_schema_migration_status'"
            ).fetchone()
            migration_in_progress = bool(migration_in_progress and migration_in_progress[0] == "applying")
        if migration_in_progress and backup_path.exists():
            self.connection.close()
            shutil.copy2(backup_path, self.path)
            for suffix in ("-wal", "-shm"):
                Path(f"{self.path}{suffix}").unlink(missing_ok=True)
            self.connection = sqlite3.connect(self.path, check_same_thread=False)
            self.connection.row_factory = sqlite3.Row
            self.connection.execute("PRAGMA journal_mode=WAL")
            self.connection.execute("PRAGMA foreign_keys=ON")
            existing_schema_version = int(self.connection.execute("PRAGMA user_version").fetchone()[0] or 0)
            needs_migration = existing_schema_version < 4

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
            CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, room_id TEXT, data TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS ix_local_sessions_room_id ON sessions(room_id);
            CREATE TABLE IF NOT EXISTS session_speakers (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, speaker_id TEXT NOT NULL, data TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS ix_local_session_speakers_session_id ON session_speakers(session_id);
            CREATE TABLE IF NOT EXISTS speakers (id TEXT PRIMARY KEY, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS presentation_files (id TEXT PRIMARY KEY, session_speaker_id TEXT NOT NULL, version_number INTEGER NOT NULL, checksum TEXT, local_path TEXT, status TEXT NOT NULL, data TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS ix_local_presentation_files_session_speaker ON presentation_files(session_speaker_id, version_number);
            CREATE TABLE IF NOT EXISTS delivery_acknowledgements (transfer_id TEXT PRIMARY KEY, file_id TEXT NOT NULL, version_number INTEGER NOT NULL, checksum TEXT NOT NULL, acknowledged_at TEXT NOT NULL, status TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS incoming_server_events (sequence INTEGER PRIMARY KEY, event_id TEXT NOT NULL, event_type TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, received_at TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS ix_local_incoming_server_events_event_id ON incoming_server_events(event_id);
            CREATE TABLE IF NOT EXISTS replica_conflicts (id TEXT PRIMARY KEY, operation_id TEXT, entity_id TEXT, reason TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS srr_stations (id TEXT PRIMARY KEY, station_number INTEGER NOT NULL UNIQUE, status TEXT NOT NULL, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS node_outbox (
              operation_id TEXT PRIMARY KEY, action TEXT NOT NULL, payload TEXT NOT NULL,
              occurred_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', server_error TEXT
            );
            """
        )
        schema_version = int(self.connection.execute("PRAGMA user_version").fetchone()[0] or 0)
        try:
            if schema_version < 4:
                self.connection.execute("INSERT OR REPLACE INTO replica_meta(key,value) VALUES('local_schema_migration_status','applying')")
                self.connection.execute("INSERT OR REPLACE INTO replica_meta(key,value) VALUES('local_schema_target','4')")
                self.connection.commit()
            if schema_version < 2:
                # The DDL above is idempotent, so interrupted upgrades can safely
                # resume before the version marker is advanced.
                self.connection.execute("PRAGMA user_version = 2")
                self.connection.execute("INSERT OR REPLACE INTO replica_meta(key,value) VALUES('local_schema_version','2')")
                schema_version = 2
            if schema_version < 3:
                # Version 3 formalizes the SRR/room delivery replica contract.
                self.connection.execute("CREATE INDEX IF NOT EXISTS ix_local_delivery_file_version ON delivery_acknowledgements(file_id, version_number, status)")
                self.connection.execute("CREATE INDEX IF NOT EXISTS ix_local_conflicts_operation ON replica_conflicts(operation_id, created_at)")
                self.connection.execute("PRAGMA user_version = 3")
                self.connection.execute("INSERT OR REPLACE INTO replica_meta(key,value) VALUES('local_schema_version','3')")
            if schema_version < 4:
                self.connection.execute("CREATE INDEX IF NOT EXISTS ix_local_incoming_server_events_sequence ON incoming_server_events(sequence)")
                self.connection.execute("PRAGMA user_version = 4")
                self.connection.execute("INSERT OR REPLACE INTO replica_meta(key,value) VALUES('local_schema_version','4')")
            self.connection.execute("INSERT OR REPLACE INTO replica_meta(key,value) VALUES('local_schema_migration_status','ready')")
            self.connection.execute("INSERT OR REPLACE INTO replica_meta(key,value) VALUES('local_schema_target','4')")
            self.connection.commit()
        except Exception:
            self.connection.rollback()
            if backup_path.exists():
                self.connection.close()
                shutil.copy2(backup_path, self.path)
                for suffix in ("-wal", "-shm"):
                    Path(f"{self.path}{suffix}").unlink(missing_ok=True)
            raise

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

    def ensure_default_admin(
        self,
        username: str = "admin",
        password: str = "admin123",
        email: str = "admin@eventos.com",
    ) -> dict[str, Any]:
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
        pending_operation_ids = {row[0] for row in self.connection.execute("SELECT operation_id FROM node_outbox WHERE status IN ('pending','conflict')")}
        locally_reserved_station_ids: set[str] = set()
        for row in self.connection.execute("SELECT id,data FROM srr_stations WHERE status='occupied'"):
            try:
                if json.loads(row[1]).get("operation_id") in pending_operation_ids:
                    locally_reserved_station_ids.add(str(row[0]))
            except (TypeError, json.JSONDecodeError):
                continue
        with self.connection:
            self.connection.execute("DELETE FROM participants")
            self.connection.execute("DELETE FROM registrations")
            self.connection.execute("DELETE FROM companions")
            self.connection.execute("DELETE FROM badges")
            self.connection.execute("DELETE FROM capacity_rules")
            self.connection.execute("DELETE FROM kits")
            self.connection.execute("DELETE FROM participant_kits")
            self.connection.execute("DELETE FROM rooms")
            self.connection.execute("DELETE FROM sessions")
            self.connection.execute("DELETE FROM session_speakers")
            self.connection.execute("DELETE FROM speakers")
            self.connection.execute("DELETE FROM presentation_files")
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
            for row in snapshot.get("rooms", []):
                self.connection.execute("INSERT OR REPLACE INTO rooms(id,data) VALUES(?,?)", (row["id"], json.dumps(row)))
            for row in snapshot.get("sessions", []):
                self.connection.execute("INSERT OR REPLACE INTO sessions(id,room_id,data) VALUES(?,?,?)", (row["id"], row.get("room_id"), json.dumps(row)))
            for row in snapshot.get("session_speakers", []):
                self.connection.execute("INSERT OR REPLACE INTO session_speakers(id,session_id,speaker_id,data) VALUES(?,?,?,?)", (row["id"], row["session_id"], row["speaker_id"], json.dumps(row)))
            for row in snapshot.get("speakers", []):
                self.connection.execute("INSERT OR REPLACE INTO speakers(id,data) VALUES(?,?)", (row["id"], json.dumps(row)))
            for row in snapshot.get("presentation_files", []):
                self.connection.execute("INSERT OR REPLACE INTO presentation_files(id,session_speaker_id,version_number,checksum,local_path,status,data) VALUES(?,?,?,?,?,?,?)", (row["id"], row["session_speaker_id"], row.get("version_number") or 1, row.get("content_sha256"), row.get("local_path"), row.get("local_sync_status") or "pending", json.dumps(row)))
            for row in snapshot.get("srr_stations", []):
                # A reconnecting snapshot must not erase an offline station
                # reservation that is still represented in the outbox. The
                # server reconciliation response decides whether it wins.
                if str(row["id"]) in locally_reserved_station_ids:
                    continue
                self.connection.execute("INSERT OR REPLACE INTO srr_stations(id,station_number,status,data) VALUES(?,?,?,?)", (row["id"], row["station_number"], row.get("status") or "idle", json.dumps(row)))
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
                ("server_sequence", str(snapshot.get("snapshot", {}).get("server_sequence", 0))),
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

    def speaker_by_query(self, query: str) -> dict[str, Any] | None:
        term = query.strip().lower()
        for row in self.connection.execute("SELECT data FROM speakers"):
            speaker = json.loads(row[0])
            values = [speaker.get("id"), speaker.get("email"), speaker.get("full_name"), speaker.get("first_name"), speaker.get("last_name")]
            if any(term and term in str(value or "").lower() for value in values):
                return speaker
        return None

    def local_srr_assignment(self, query: str, operation_id: str | None = None) -> dict[str, Any]:
        speaker = self.speaker_by_query(query)
        if not speaker:
            raise ValueError("Speaker is not in the local event snapshot")
        candidates = self.connection.execute(
            "SELECT id,station_number,data FROM srr_stations WHERE status IN ('idle','completed') ORDER BY station_number"
        ).fetchall()
        station = None
        for candidate in candidates:
            try:
                candidate_data = json.loads(candidate["data"])
            except (TypeError, json.JSONDecodeError):
                candidate_data = {}
            reported_status = str(candidate_data.get("reported_status") or candidate_data.get("status") or "idle").lower()
            if candidate_data.get("is_active") is False:
                continue
            if candidate_data.get("is_online") is False or reported_status in {"offline", "error", "locked", "maintenance"}:
                continue
            station = candidate
            break
        if not station:
            raise ValueError("No local SRR workstation is available")
        operation_id = self.queue_operation("srr_checkin", {"speaker_id": speaker["id"]}, operation_id)
        data = json.loads(station["data"])
        data.update({"status": "occupied", "assigned_speaker_id": speaker["id"], "operation_id": operation_id})
        with self.connection:
            self.connection.execute("UPDATE srr_stations SET status='occupied',data=? WHERE id=?", (json.dumps(data), station["id"]))
        return {"speaker": speaker, "station_number": station["station_number"], "station_id": station["id"], "operation_id": operation_id, "offline": True}

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
        now = datetime.now(timezone.utc).isoformat()
        with self.connection:
            self.connection.executemany("UPDATE node_outbox SET status='conflict', server_error=? WHERE operation_id=?", ((item.get("reason"), item.get("operation_id")) for item in conflicts))
            self.connection.executemany(
                "INSERT OR REPLACE INTO replica_conflicts(id,operation_id,entity_id,reason,data,created_at) VALUES(?,?,?,?,?,?)",
                (
                    (
                        str(item.get("conflict_id") or uuid.uuid4()),
                        item.get("operation_id"),
                        item.get("entity_id"),
                        str(item.get("reason") or "Server rejected offline operation."),
                        json.dumps(item, sort_keys=True),
                        now,
                    )
                    for item in conflicts
                ),
            )

    def server_sequence(self) -> int:
        row = self.connection.execute("SELECT value FROM replica_meta WHERE key='server_sequence'").fetchone()
        return int(row[0]) if row and str(row[0]).isdigit() else 0

    def record_server_events(self, events: list[dict[str, Any]]) -> int:
        """Persist the server stream before advancing the local cursor."""
        if not events:
            return self.server_sequence()
        received_at = datetime.now(timezone.utc).isoformat()
        with self.connection:
            for event in events:
                sequence = int(event["sequence"])
                self.connection.execute(
                    "INSERT OR IGNORE INTO incoming_server_events(sequence,event_id,event_type,entity_type,entity_id,payload,created_at,received_at) VALUES(?,?,?,?,?,?,?,?)",
                    (sequence, str(event.get("event_id") or ""), str(event.get("event_type") or ""), str(event.get("entity_type") or ""), str(event.get("entity_id") or ""), json.dumps(event.get("payload") or {}, sort_keys=True), str(event.get("created_at") or received_at), received_at),
                )
            latest = max(int(event["sequence"]) for event in events)
            self.connection.execute("INSERT OR REPLACE INTO replica_meta(key,value) VALUES('server_sequence',?)", (str(latest),))
        return self.server_sequence()

    def close(self) -> None:
        self.connection.close()


class VenueNodeClient:
    """Sync adapter used by a workstation wrapper (Electron/service) on the venue LAN."""

    def __init__(self, base_url: str, assignment_id: str, token: str, replica: NodeReplica):
        self.base_url = base_url.rstrip("/")
        self.assignment_id = assignment_id
        self.enrollment_token = token
        self.access_token: str | None = None
        self.replica = replica

    @property
    def headers(self) -> dict[str, str]:
        return {"X-Venue-Node-Token": self.access_token or self.enrollment_token}

    async def ensure_access_token(self, client: httpx.AsyncClient) -> None:
        if self.access_token:
            return
        response = await client.post(
            f"{self.base_url}/api/v1/venue/nodes/{self.assignment_id}/token",
            headers={"X-Venue-Node-Token": self.enrollment_token},
        )
        response.raise_for_status()
        self.access_token = response.json()["access_token"]

    async def request(self, client: httpx.AsyncClient, method: str, url: str, **kwargs: Any) -> httpx.Response:
        await self.ensure_access_token(client)
        response = await client.request(method, url, headers=self.headers, **kwargs)
        if response.status_code == 401:
            self.access_token = None
            await self.ensure_access_token(client)
            response = await client.request(method, url, headers=self.headers, **kwargs)
        response.raise_for_status()
        return response

    async def bootstrap(self) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await self.request(client, "GET", f"{self.base_url}/api/v1/venue/nodes/{self.assignment_id}/bootstrap")
            snapshot = response.json()
        self.replica.load_snapshot(snapshot)
        return snapshot

    async def synchronize(self) -> dict[str, Any]:
        pending = self.replica.pending_operations()
        result: dict[str, Any] = {"accepted": [], "duplicates": [], "conflicts": []}
        async with httpx.AsyncClient(timeout=30) as client:
            if pending:
                response = await self.request(client, "POST", f"{self.base_url}/api/v1/venue/nodes/{self.assignment_id}/operations", json={"operations": pending})
                result = response.json()
                self.replica.mark_uploaded(result.get("accepted", []) + result.get("duplicates", []))
                self.replica.mark_conflicted(result.get("conflicts", []))
            heartbeat = await self.request(client, "POST", f"{self.base_url}/api/v1/venue/nodes/{self.assignment_id}/heartbeat")
            event_id = self.replica.assignment().get("event_id")
            runtime = {"events": [], "cursor": self.replica.server_sequence()}
            if event_id:
                stream = await self.request(client, "GET", f"{self.base_url}/api/v1/venue/runtime/{event_id}/events", params={"after": self.replica.server_sequence()})
                runtime = stream.json()
                self.replica.record_server_events(runtime.get("events", []))
            result["runtime_events"] = len(runtime.get("events", []))
            result["server_sequence"] = self.replica.server_sequence()
        return result
