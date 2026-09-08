import asyncio
import hashlib
import json
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.models.operational_control import VenueAssetTransfer
from app.models.presentation_file import PresentationFile
from app.node_replica import NodeReplica
from app.models.venue_node import VenueNodeAssignment
from app.routers.node_sync import _authorize_node, _node_token
from app.routers import distribution
from app.workers.delivery_worker import expired_command_state, expired_transfer_state, heartbeat_is_stale


def result_with(*rows):
    result = MagicMock()
    result.scalars.return_value.all.return_value = list(rows)
    result.scalar_one_or_none.return_value = rows[0] if rows else None
    return result


def test_expired_delivery_becomes_permanent_failure_at_retry_limit():
    assert expired_transfer_state(4, 5) == ("pending", "Transfer lease expired; queued for retry.")
    assert expired_transfer_state(5, 5) == ("failed", "Transfer exceeded the configured delivery retry limit.")


def test_expired_room_command_is_terminal():
    assert expired_command_state() == ("expired", "Command expired before the target device acknowledged it.")


def test_room_device_heartbeat_staleness_is_evidence_based():
    now = datetime.now(timezone.utc)
    assert heartbeat_is_stale(None, now) is True
    assert heartbeat_is_stale(now - timedelta(seconds=61), now) is True
    assert heartbeat_is_stale(now - timedelta(seconds=59), now) is False


@pytest.mark.asyncio
async def test_node_enrollment_token_is_exchange_only():
    assignment = VenueNodeAssignment(id=uuid.uuid4(), event_id=uuid.uuid4(), device_id=uuid.uuid4(), status="active")
    db = AsyncMock()
    db.get.return_value = assignment
    enrollment = _node_token(assignment.id, assignment.event_id)
    access = _node_token(assignment.id, assignment.event_id, access=True)

    assert await _authorize_node(access, db) is assignment
    with pytest.raises(HTTPException) as exc:
        await _authorize_node(enrollment, db)
    assert exc.value.status_code == 403


def make_transfer(file_id: uuid.UUID) -> VenueAssetTransfer:
    return VenueAssetTransfer(
        id=uuid.uuid4(), file_id=file_id, filename="talk.pdf", version_number=2,
        source_node="venue_server", target_node="Room-Stage", target_type="presentation_pc",
        status="transferring", progress_pct=45, checksum_verified=False,
    )


def make_file(file_id: uuid.UUID) -> PresentationFile:
    return PresentationFile(
        id=file_id, speaker_id=uuid.uuid4(), session_speaker_id=uuid.uuid4(), event_id=uuid.uuid4(),
        original_filename="talk.pdf", stored_filename="talk.pdf", storage_path="talk.pdf",
        content_sha256=hashlib.sha256(b"real-bytes").hexdigest(), file_size_bytes=10,
        mime_type="application/pdf", file_format="pdf", version_number=2,
        upload_status="approved", local_sync_status="synced",
    )


@pytest.mark.asyncio
async def test_delivery_acknowledgement_requires_exact_checksum_and_size():
    file_id = uuid.uuid4()
    transfer = make_transfer(file_id)
    file = make_file(file_id)
    db = AsyncMock()
    db.get.side_effect = [transfer, file]

    response = await distribution.acknowledge(
        transfer.id,
        distribution.AcknowledgeRequest(
            target_node="Room-Stage", target_type="presentation_pc", file_id=file_id,
            version_number=2, sha256=file.content_sha256, size_bytes=10,
        ),
        True,
        db,
    )
    assert response["accepted"] is True
    assert transfer.status == "verified"
    assert transfer.checksum_verified is True
    assert transfer.progress_pct == 100


@pytest.mark.asyncio
async def test_delivery_acknowledgement_rejects_bad_checksum():
    file_id = uuid.uuid4()
    transfer = make_transfer(file_id)
    file = make_file(file_id)
    db = AsyncMock()
    db.get.side_effect = [transfer, file]

    with pytest.raises(HTTPException) as exc:
        await distribution.acknowledge(
            transfer.id,
            distribution.AcknowledgeRequest(
                target_node="Room-Stage", target_type="presentation_pc", file_id=file_id,
                version_number=2, sha256="0" * 64, size_bytes=10,
            ),
            True,
            db,
        )
    assert exc.value.status_code == 409
    assert transfer.status == "failed"
    assert transfer.checksum_verified is False


@pytest.mark.asyncio
async def test_delivery_acknowledgement_cannot_bypass_claim_and_receive():
    file_id = uuid.uuid4()
    transfer = make_transfer(file_id)
    transfer.status = "pending"
    file = make_file(file_id)
    db = AsyncMock()
    db.get.side_effect = [transfer, file]

    with pytest.raises(HTTPException) as exc:
        await distribution.acknowledge(
            transfer.id,
            distribution.AcknowledgeRequest(
                target_node="Room-Stage", target_type="presentation_pc", file_id=file_id,
                version_number=2, sha256=file.content_sha256, size_bytes=10,
            ),
            True,
            db,
        )
    assert exc.value.status_code == 409
    assert transfer.status == "pending"
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_delivery_claim_retry_by_same_owner_is_idempotent():
    file_id = uuid.uuid4()
    transfer = make_transfer(file_id)
    file = make_file(file_id)
    transfer.lease_owner = "srr:station-1"
    transfer.lease_expires_at = datetime.now(timezone.utc) + timedelta(seconds=60)
    transfer.attempt_count = 2
    db = AsyncMock()
    db.get.side_effect = [transfer, file]

    response = await distribution.claim(
        transfer.id,
        distribution.ClaimRequest(owner="srr:station-1"),
        {"id": None, "kind": "local"},
        db,
    )
    assert response["accepted"] is True
    assert transfer.attempt_count == 2
    db.commit.assert_not_awaited()
    assert db.get.await_args_list[0].args == (VenueAssetTransfer, transfer.id)
    assert db.get.await_args_list[0].kwargs == {"with_for_update": True}


@pytest.mark.asyncio
async def test_obsolete_delivery_is_cancelled_before_claim():
    file_id = uuid.uuid4()
    transfer = make_transfer(file_id)
    file = make_file(file_id)
    file.is_current_version = False
    db = AsyncMock()
    db.get.return_value = transfer
    db.get.side_effect = [transfer, file]

    response = await distribution.claim(
        transfer.id,
        distribution.ClaimRequest(owner="srr:station-1"),
        {"id": None, "kind": "local"},
        db,
    )
    assert response["accepted"] is False
    assert transfer.status == "cancelled"
    assert transfer.lease_owner is None
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_delivery_progress_is_durable_but_never_verified():
    file_id = uuid.uuid4()
    transfer = make_transfer(file_id)
    file = make_file(file_id)
    transfer.lease_owner = "srr:station-1"
    old_expiry = datetime.now(timezone.utc) + timedelta(seconds=1)
    transfer.lease_expires_at = old_expiry
    db = AsyncMock()
    db.get.side_effect = [transfer, file]

    response = await distribution.progress(
        transfer.id,
        distribution.ProgressRequest(owner="srr:station-1", bytes_received=5, total_bytes=10),
        {"id": None, "kind": "local"},
        db,
    )
    assert response["accepted"] is True
    assert transfer.progress_pct == 50
    assert transfer.status == "transferring"
    assert transfer.lease_expires_at > old_expiry
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_complete_download_is_received_but_not_verified():
    file_id = uuid.uuid4()
    transfer = make_transfer(file_id)
    file = make_file(file_id)
    transfer.lease_owner = "srr:station-1"
    transfer.lease_expires_at = datetime.now(timezone.utc) + timedelta(seconds=60)
    db = AsyncMock()
    db.get.side_effect = [transfer, file]

    response = await distribution.progress(
        transfer.id,
        distribution.ProgressRequest(owner="srr:station-1", bytes_received=10, total_bytes=10),
        {"id": None, "kind": "local"},
        db,
    )
    assert response["accepted"] is True
    assert transfer.progress_pct == 100
    assert transfer.status == "received"
    assert transfer.checksum_verified is False


@pytest.mark.asyncio
async def test_verified_delivery_acknowledgement_replay_is_idempotent():
    file_id = uuid.uuid4()
    transfer = make_transfer(file_id)
    file = make_file(file_id)
    transfer.status = "verified"
    transfer.progress_pct = 100
    transfer.checksum_verified = True
    transfer.acknowledged_sha256 = file.content_sha256
    db = AsyncMock()
    db.get.side_effect = [transfer, file]

    response = await distribution.acknowledge(
        transfer.id,
        distribution.AcknowledgeRequest(
            target_node="Room-Stage", target_type="presentation_pc", file_id=file_id,
            version_number=2, sha256=file.content_sha256, size_bytes=10,
        ),
        True,
        db,
    )
    assert response["accepted"] is True
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_delivery_chunk_returns_authoritative_range_and_checksum(tmp_path):
    file_id = uuid.uuid4()
    transfer = make_transfer(file_id)
    file = make_file(file_id)
    path = tmp_path / "talk.pdf"
    path.write_bytes(b"real-bytes")
    file.local_cache_path = str(path)
    db = AsyncMock()
    db.get.side_effect = [transfer, file]

    response = await distribution.download_transfer_chunk(
        transfer.id,
        offset=5,
        chunk_size=5,
        identity={"id": None, "kind": "local"},
        db=db,
    )
    assert response.body == b"bytes"
    assert response.headers["content-range"] == "bytes 5-9/10"
    assert response.headers["x-file-sha256"] == file.content_sha256


def test_srr_replica_persists_runtime_tables_and_offline_assignment(tmp_path):
    replica = NodeReplica(tmp_path / "srr.sqlite")
    canonical = {
        "event": {"id": "event-1"},
        "assignment": {"id": "assignment-1", "mode": "srr_checkin", "permissions": {}},
        "speakers": [{"id": "speaker-1", "full_name": "Actual Speaker", "email": "actual@example.com"}],
        "srr_stations": [{"id": "station-1", "station_number": 1, "status": "idle"}],
    }
    canonical["snapshot"] = {"version": 1, "sha256": hashlib.sha256(json.dumps(canonical, sort_keys=True, separators=(",", ":")).encode()).hexdigest(), "generated_at": datetime.now(timezone.utc).isoformat()}
    replica.load_snapshot(canonical)

    result = replica.local_srr_assignment("actual@example.com", "operation-123")
    assert result["station_number"] == 1
    assert result["operation_id"] == "operation-123"
    assert replica.connection.execute("SELECT status FROM srr_stations WHERE station_number=1").fetchone()[0] == "occupied"
    assert replica.pending_operations()[0]["action"] == "srr_checkin"
    replica.close()


def test_srr_replica_persists_server_events_before_advancing_cursor(tmp_path):
    replica = NodeReplica(tmp_path / "runtime-events.sqlite")
    events = [
        {"sequence": 12, "event_id": "event-1", "event_type": "srr.speaker_assigned", "entity_type": "srr_station", "entity_id": "station-1", "payload": {"station_number": 1}, "created_at": datetime.now(timezone.utc).isoformat()},
        {"sequence": 14, "event_id": "event-1", "event_type": "presentation.file_finalized", "entity_type": "presentation_file", "entity_id": "file-1", "payload": {"version": 2}, "created_at": datetime.now(timezone.utc).isoformat()},
    ]
    assert replica.server_sequence() == 0
    assert replica.record_server_events(events) == 14
    assert replica.server_sequence() == 14
    row = replica.connection.execute("SELECT event_type,payload FROM incoming_server_events WHERE sequence=14").fetchone()
    assert row["event_type"] == "presentation.file_finalized"
    assert json.loads(row["payload"])["version"] == 2
    replica.close()


def test_offline_assignment_skips_snapshot_unhealthy_station(tmp_path):
    replica = NodeReplica(tmp_path / "offline-health.sqlite")
    canonical = {
        "event": {"id": "event-1"},
        "assignment": {"id": "assignment-1", "mode": "srr_checkin", "permissions": {}},
        "speakers": [{"id": "speaker-1", "full_name": "Actual Speaker", "email": "actual@example.com"}],
        "srr_stations": [
            {"id": "station-1", "station_number": 1, "status": "offline", "is_online": False},
            {"id": "station-2", "station_number": 2, "status": "idle", "is_online": True},
        ],
    }
    canonical["snapshot"] = {"version": 1, "sha256": hashlib.sha256(json.dumps(canonical, sort_keys=True, separators=(",", ":")).encode()).hexdigest(), "generated_at": datetime.now(timezone.utc).isoformat()}
    replica.load_snapshot(canonical)

    result = replica.local_srr_assignment("actual@example.com", "healthy-station-operation")
    assert result["station_number"] == 2
    replica.close()


def test_offline_reconciliation_persists_conflict_diagnostics(tmp_path):
    replica = NodeReplica(tmp_path / "conflict.sqlite")
    operation_id = replica.queue_operation("srr_checkin", {"speaker_id": "speaker-1"})
    replica.mark_conflicted([{
        "conflict_id": "conflict-1",
        "operation_id": operation_id,
        "entity_id": "station-1",
        "reason": "Station was assigned by another node.",
    }])

    outbox = replica.connection.execute("SELECT status,server_error FROM node_outbox WHERE operation_id=?", (operation_id,)).fetchone()
    conflict = replica.connection.execute("SELECT operation_id,entity_id,reason,data FROM replica_conflicts WHERE id='conflict-1'").fetchone()
    assert outbox["status"] == "conflict"
    assert conflict["operation_id"] == operation_id
    assert conflict["entity_id"] == "station-1"
    assert conflict["reason"] == "Station was assigned by another node."
    assert json.loads(conflict["data"])["conflict_id"] == "conflict-1"
    replica.close()


def test_srr_replica_migration_keeps_recovery_backup(tmp_path):
    database = tmp_path / "legacy-srr.sqlite"
    connection = sqlite3.connect(database)
    connection.execute("CREATE TABLE replica_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    connection.execute("INSERT INTO replica_meta(key,value) VALUES('fixture','preserved')")
    connection.execute("PRAGMA user_version = 3")
    connection.commit()
    connection.close()

    replica = NodeReplica(database)
    assert replica.connection.execute("PRAGMA user_version").fetchone()[0] == 4
    assert replica.connection.execute(
        "SELECT value FROM replica_meta WHERE key='local_schema_migration_status'"
    ).fetchone()[0] == "ready"
    assert (tmp_path / "legacy-srr.sqlite.pre-migration-v4.bak").exists()
    assert replica.connection.execute("SELECT value FROM replica_meta WHERE key='fixture'").fetchone()[0] == "preserved"
    replica.close()


def test_srr_snapshot_reload_preserves_pending_offline_station_reservation(tmp_path):
    replica = NodeReplica(tmp_path / "offline-reservation.sqlite")

    def snapshot(status: str):
        canonical = {
            "event": {"id": "event-1"},
            "assignment": {"id": "assignment-1", "mode": "srr_checkin", "permissions": {}},
            "speakers": [{"id": "speaker-1", "full_name": "Actual Speaker", "email": "actual@example.com"}],
            "srr_stations": [{"id": "station-1", "station_number": 1, "status": status}],
        }
        canonical["snapshot"] = {"version": 1, "sha256": hashlib.sha256(json.dumps(canonical, sort_keys=True, separators=(",", ":")).encode()).hexdigest(), "generated_at": datetime.now(timezone.utc).isoformat()}
        return canonical

    replica.load_snapshot(snapshot("idle"))
    result = replica.local_srr_assignment("actual@example.com", "offline-operation-1")
    replica.load_snapshot(snapshot("idle"))

    station = replica.connection.execute("SELECT status,data FROM srr_stations WHERE id='station-1'").fetchone()
    assert station[0] == "occupied"
    assert json.loads(station[1])["operation_id"] == result["operation_id"]
    assert replica.pending_operations()[0]["operation_id"] == "offline-operation-1"
    replica.close()
