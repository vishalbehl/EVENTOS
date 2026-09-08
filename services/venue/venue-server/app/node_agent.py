"""Local workstation agent.

Run on every installed Registration or Scanning computer. It owns a local
SQLite replica, serves the workstation UI when the Venue Server is unavailable,
and synchronizes its durable outbox once LAN connectivity returns.
"""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.node_replica import NodeReplica, VenueNodeClient


class AgentConfiguration(BaseModel):
    venue_server: str
    assignment_id: str
    enrollment_token: str
    replica_path: str = "venue-node.db"


class OfflineScanRequest(BaseModel):
    query: str = Field(min_length=1, max_length=320)
    method: str = "qr"
    station_id: str | None = None
    operation_id: str | None = None


class OfflineOperationRequest(BaseModel):
    action: str
    payload: dict[str, Any] = Field(default_factory=dict)


def build_agent(configuration: AgentConfiguration) -> FastAPI:
    replica = NodeReplica(configuration.replica_path)
    client = VenueNodeClient(configuration.venue_server, configuration.assignment_id, configuration.enrollment_token, replica)
    app = FastAPI(title="Venue Workstation Node", version="1.0.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://127.0.0.1:3005",
            "http://localhost:3005",
            "http://127.0.0.1:3007",
            "http://localhost:3007",
            "http://127.0.0.1:3000",
            "http://localhost:3000",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.state.replica, app.state.client = replica, client
    app.state.sync_status = {"state": "starting", "last_success_at": None, "last_error": None, "runtime_events": 0, "server_sequence": replica.server_sequence()}

    @app.on_event("startup")
    async def start_background_sync() -> None:
        try:
            await client.bootstrap()
        except Exception:
            pass  # Offline startup is valid when a replica was already provisioned.
        app.state.sync_task = asyncio.create_task(sync_forever(client, app.state.sync_status))

    @app.on_event("shutdown")
    async def stop_background_sync() -> None:
        task = getattr(app.state, "sync_task", None)
        if task:
            task.cancel()
        replica.close()

    @app.get("/health")
    async def health() -> dict[str, Any]:
        sync = dict(app.state.sync_status)
        return {"status": "ok", "assignment": replica.assignment(), "pending_operations": len(replica.pending_operations()), "sync": sync, "local_schema_version": replica.connection.execute("PRAGMA user_version").fetchone()[0]}

    @app.post("/bootstrap")
    async def bootstrap() -> dict[str, Any]:
        try:
            snapshot = await client.bootstrap()
            return {"status": "ready", "snapshot": snapshot.get("snapshot"), "assignment": snapshot.get("assignment")}
        except Exception as exc:
            raise HTTPException(503, f"Venue Server bootstrap unavailable: {exc}")

    @app.post("/sync")
    async def sync() -> dict[str, Any]:
        try:
            return await client.synchronize()
        except Exception as exc:
            raise HTTPException(503, f"Venue Server sync unavailable: {exc}")

    @app.post("/scan")
    async def scan(payload: OfflineScanRequest) -> dict[str, Any]:
        assignment = replica.assignment()
        if assignment.get("mode") != "scanning" or not assignment.get("capacity_rule_id"):
            raise HTTPException(403, "This node is not provisioned as a scanning workstation")
        identity = replica.identity_by_query(payload.query)
        if not identity:
            raise HTTPException(404, "Participant or companion is not in the local event replica")
        participant, companion = identity
        # Offline nodes are also bound to their Admin-assigned gate. The local
        # client cannot bypass that binding by posting another gate id.
        selected_gate_id = assignment["capacity_rule_id"]
        gate = replica.capacity_rule(selected_gate_id)
        if not gate:
            raise HTTPException(409, "Assigned check-in gate is missing from the local replica")
        allowed_roles = gate.get("allowed_roles") or []
        if allowed_roles and "All" not in allowed_roles and participant.get("role") not in allowed_roles:
            raise HTTPException(403, f"Role '{participant.get('role')}' is not permitted at this gate")
        companion_id = companion.get("id") if companion else None
        max_checkins = int(gate.get("max_checkins_per_delegate") or 0)
        if max_checkins > 0 and replica.local_successful_checkin_count(participant["id"], selected_gate_id, companion_id) >= max_checkins:
            raise HTTPException(409, "Already checked in")
        operation_id = replica.queue_operation(
            "check_in",
            {
                "participant_id": participant["id"],
                "companion_id": companion_id,
                "registration_code": participant.get("regno"),
                "badge_code": (companion or participant).get("badge_code") or participant.get("regno"),
                "method": payload.method,
                "capacity_rule_id": selected_gate_id,
            },
        )
        local_record = replica.record_local_checkin(participant, gate, operation_id, payload.method, companion)
        scanned_identity = participant
        if companion:
            companion_name = f"{companion.get('first_name') or ''} {companion.get('last_name') or ''}".strip() or companion.get("name") or "Companion"
            scanned_identity = {
                **participant,
                "id": companion.get("id"),
                "name": companion_name,
                "regno": companion.get("badge_code") or participant.get("regno"),
                "role": f"Companion{f' ({companion.get('relationship')})' if companion.get('relationship') else ''}",
                "email": companion.get("email") or participant.get("email"),
                "phone": companion.get("phone") or participant.get("phone"),
                "is_companion": True,
                "primary_participant_id": participant.get("id"),
            }
        return {
            "status": "success",
            "offline": True,
            "operation_id": operation_id,
            "participant": scanned_identity,
            "companion": companion,
            "capacity_rule_id": selected_gate_id,
            "station_id": selected_gate_id,
            "station_name": gate.get("station_name") or gate.get("gate_name"),
            "scan_time": local_record["scan"].get("created_at"),
            "local_record": local_record,
        }

    @app.post("/srr/checkin")
    async def srr_checkin(payload: OfflineScanRequest) -> dict[str, Any]:
        assignment = replica.assignment()
        if assignment.get("mode") not in {"srr_checkin", "srr_master"}:
            raise HTTPException(403, "This node is not provisioned as an SRR check-in workstation")
        try:
            return replica.local_srr_assignment(payload.query, payload.operation_id)
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc

    @app.get("/api/v1/venue/scanning/stations")
    async def scanning_stations() -> list[dict[str, Any]]:
        assignment = replica.assignment()
        rule_id = assignment.get("capacity_rule_id")
        if assignment.get("mode") != "scanning" or not rule_id:
            return []
        rows = replica.connection.execute("SELECT data FROM capacity_rules WHERE id=?", (rule_id,)).fetchall()
        count_row = replica.connection.execute(
            "SELECT COUNT(*) FROM venue_scan_events WHERE event_id=? AND gate_id=? AND status IN ('success','admin_overridden')",
            (assignment.get("event_id", ""), rule_id),
        ).fetchone()
        current_count = int(count_row[0] if count_row else 0)
        return [{**json.loads(row[0]), "current_count": current_count} for row in rows]

    @app.get("/api/v1/venue/scanning/recent")
    async def recent_scans(limit: int = 30, station_id: Optional[str] = None) -> list[dict[str, Any]]:
        if station_id:
            rows = replica.connection.execute(
                "SELECT data FROM venue_scan_events WHERE json_extract(data, '$.gate_id')=? OR json_extract(data, '$.checkin_gate_id')=? ORDER BY json_extract(data, '$.created_at') DESC LIMIT ?",
                (station_id, station_id, limit)
            ).fetchall()
        else:
            rows = []
        scans = []
        for row in rows:
            scan = json.loads(row[0])
            participant = None
            companion = None
            if scan.get("participant_id"):
                participant_row = replica.connection.execute("SELECT data FROM participants WHERE id=?", (scan["participant_id"],)).fetchone()
                participant = json.loads(participant_row[0]) if participant_row else None
            if scan.get("companion_id"):
                companion_row = replica.connection.execute("SELECT data FROM companions WHERE id=?", (scan["companion_id"],)).fetchone()
                companion = json.loads(companion_row[0]) if companion_row else None
            companion_name = None
            if companion:
                companion_name = f"{companion.get('first_name') or ''} {companion.get('last_name') or ''}".strip() or companion.get("name")
            scans.append({
                "id": scan.get("id"),
                "participant_name": companion_name or (participant or {}).get("name") or "Unknown",
                "regno": companion.get("badge_code") if companion else scan.get("badge_code") or (participant or {}).get("regno") or "",
                "role": f"Companion{f' ({companion.get('relationship')})' if companion and companion.get('relationship') else ''}" if companion else (participant or {}).get("role") or "Delegate",
                "company": (participant or {}).get("company") or "",
                "station_name": scan.get("station_name") or scan.get("gate_name") or "Assigned gate",
                "station_id": scan.get("checkin_gate_id") or scan.get("gate_id"),
                "status": scan.get("status") or "success",
                "scan_type": scan.get("scan_type") or "check_in",
                "rejection_reason": scan.get("rejection_reason"),
                "created_at": scan.get("created_at"),
                "offline": True,
            })
        return scans

    @app.post("/api/v1/venue/scanning/scan")
    async def scanning_scan(payload: OfflineScanRequest) -> dict[str, Any]:
        return await scan(payload)

    @app.get("/api/v1/venue/registration/participants")
    async def registration_participants(limit: int = 5000) -> dict[str, Any]:
        rows = replica.connection.execute("SELECT data FROM participants LIMIT ?", (limit,)).fetchall()
        return {"items": [json.loads(row[0]) for row in rows], "total": len(rows)}

    @app.get("/api/v1/venue/registration/summary")
    async def registration_summary() -> dict[str, int]:
        count = replica.connection.execute("SELECT COUNT(*) FROM participants").fetchone()[0]
        checked_in = replica.connection.execute(
            "SELECT COUNT(*) FROM venue_scan_events WHERE status IN ('success','admin_overridden')"
        ).fetchone()[0]
        badges_printed = replica.connection.execute(
            "SELECT COUNT(*) FROM badges WHERE json_extract(data, '$.status') IN ('issued','printed') OR json_extract(data, '$.issued_at') IS NOT NULL"
        ).fetchone()[0]
        kits_distributed = replica.connection.execute(
            "SELECT COUNT(*) FROM participant_kits WHERE json_extract(data, '$.status') IN ('Issued','issued','distributed')"
        ).fetchone()[0]
        return {
            "total_participants": int(count),
            "checked_in": int(checked_in),
            "badges_printed": int(badges_printed),
            "kits_distributed": int(kits_distributed),
        }

    @app.post("/api/v1/venue/registration/participants")
    async def create_registration(payload: dict[str, Any]) -> dict[str, Any]:
        if replica.assignment().get("mode") != "registration":
            raise HTTPException(403, "This node is not provisioned as a registration workstation")
        first_name = str(payload.get("first_name") or "").strip()
        if not first_name:
            raise HTTPException(422, "first_name is required")
        operation_id = replica.queue_operation("registration_create", payload)
        participant = {"id": f"offline-{operation_id}", "regno": f"OFF-{operation_id[:8].upper()}", "name": f"{first_name} {payload.get('last_name') or 'Delegate'}", **payload, "sync_status": "queued_offline"}
        registration = {"id": f"offline-registration-{operation_id}", "participant_id": participant["id"], "registration_status": payload.get("registration_status") or "submitted", "registration_data": payload, "submitted_at": participant.get("registered_at")}
        with replica.connection:
            replica.connection.execute("INSERT OR REPLACE INTO participants(id,data) VALUES(?,?)", (participant["id"], json.dumps(participant)))
            replica.connection.execute("INSERT OR REPLACE INTO registrations(id,data) VALUES(?,?)", (registration["id"], json.dumps(registration)))
        return {"participant": participant, "status": "queued_offline", "operation_id": operation_id}

    @app.post("/operations")
    async def queue_operation(payload: OfflineOperationRequest) -> dict[str, str]:
        mode = replica.assignment().get("mode")
        allowed = {"scanning": {"check_in", "check_out"}, "registration": {"badge_issue", "badge_reprint", "kit_issue", "registration_update"}}
        if payload.action not in allowed.get(mode, set()):
            raise HTTPException(403, "Operation is not allowed for this workstation mode")
        return {"status": "queued_offline", "operation_id": replica.queue_operation(payload.action, payload.payload)}

    return app


def load_agent(config_path: str) -> FastAPI:
    return build_agent(AgentConfiguration.model_validate(json.loads(Path(config_path).read_text(encoding="utf-8"))))


async def sync_forever(client: VenueNodeClient, status: dict[str, Any] | None = None, interval_seconds: int = 15) -> None:
    while True:
        try:
            result = await client.synchronize()
            if status is not None:
                status.update({"state": "online", "last_success_at": datetime.now(timezone.utc).isoformat(), "last_error": None, "runtime_events": result.get("runtime_events", 0), "server_sequence": result.get("server_sequence", client.replica.server_sequence())})
        except Exception as exc:
            if status is not None:
                status.update({"state": "offline", "last_error": str(exc)})
        await asyncio.sleep(interval_seconds)
