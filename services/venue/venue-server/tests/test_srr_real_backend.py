import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException
from starlette.datastructures import Headers
from starlette.datastructures import UploadFile as StarletteUploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.event import Event
from app.models.speaker import Speaker
from app.models.srr_station import SRRStation
from app.models.session_speaker import SessionSpeaker
from app.models.presentation_file import PresentationFile
from app.models.presentation_queue import PresentationQueue
from app.models.room_device import RoomDevice
from app.models.venue_sync_job import VenueSyncJob
from app.node_replica import NodeReplica
from app.routers import srr, workstations


def result_with(*rows, scalar=None):
    result = MagicMock()
    result.scalar_one_or_none.return_value = scalar if scalar is not None else (rows[0] if rows else None)
    result.scalars.return_value.all.return_value = list(rows)
    return result


def make_event() -> Event:
    return Event(
        id=uuid.uuid4(),
        organization_id=uuid.uuid4(),
        created_by=uuid.uuid4(),
        name="Venue Test",
        short_code="VT26",
        start_date=datetime.now(timezone.utc).date(),
        end_date=datetime.now(timezone.utc).date(),
    )


def make_speaker(event_id: uuid.UUID) -> Speaker:
    return Speaker(
        id=uuid.uuid4(),
        event_id=event_id,
        first_name="Actual",
        last_name="Speaker",
        email="actual@example.com",
        affiliation="Conference Faculty",
        upload_token="speaker-token",
    )


def make_session_speaker(speaker_id: uuid.UUID) -> SessionSpeaker:
    return SessionSpeaker(id=uuid.uuid4(), session_id=uuid.uuid4(), speaker_id=speaker_id, presentation_title="Actual Talk")


def make_station(event_id: uuid.UUID, *, status="idle", seconds_ago=5) -> SRRStation:
    return SRRStation(
        id=uuid.uuid4(),
        event_id=event_id,
        station_number=1,
        device_name="SRR-WS-01",
        status=status,
        is_active=True,
        last_heartbeat_at=datetime.now(timezone.utc) - timedelta(seconds=seconds_ago),
    )


def upload_file(tmp_path: Path, name: str = "actual.pptx", content: bytes = b"real-presentation") -> StarletteUploadFile:
    source = tmp_path / name
    source.write_bytes(content)
    return StarletteUploadFile(filename=name, file=source.open("rb"), headers=Headers({"content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation"}))


def make_presentation_file(tmp_path: Path, event_id: uuid.UUID, speaker_id: uuid.UUID, slot_id: uuid.UUID) -> PresentationFile:
    binary = tmp_path / "ready.pptx"
    binary.write_bytes(b"ready")
    return PresentationFile(
        id=uuid.uuid4(),
        speaker_id=speaker_id,
        session_speaker_id=slot_id,
        event_id=event_id,
        original_filename="ready.pptx",
        stored_filename="ready.pptx",
        storage_path="presentations/ready.pptx",
        content_sha256=srr.hashlib.sha256(b"ready").hexdigest(),
        file_size_bytes=5,
        mime_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        file_format="pptx",
        local_cache_path=str(binary),
    )


@pytest.mark.asyncio
async def test_device_enroll_returns_secret_once_and_persists_hash(mocker):
    event = make_event()
    db = AsyncMock()
    db.add = MagicMock()
    db.get.return_value = event
    db.execute.return_value = result_with()

    response = await srr.enroll_device(
        srr.EnrollDeviceRequest(station_number=7, device_name="SRR-WS-07", role="workstation", event_id=str(event.id)),
        db=db,
    )

    station = db.add.call_args_list[0].args[0]
    assert response["secret_returned_once"] is True
    assert response["enrollment_token"].startswith("srrdev_")
    assert station.enrollment_token_prefix == response["token_prefix"]
    assert station.enrollment_token_hash == srr.hash_device_key(response["enrollment_token"])
    assert response["enrollment_token"] not in station.enrollment_token_hash
    executed_queries = [call.args[0] for call in db.execute.call_args_list]
    assert any("srr_stations.event_id" in str(query) for query in executed_queries)
    assert any("srr_stations.station_number" in str(query) for query in executed_queries)


@pytest.mark.asyncio
async def test_srr_device_key_can_authorize_workstation_file_actions():
    station = make_station(uuid.uuid4())
    device_key = "srrdev_real-device-key"
    station.enrollment_token_hash = srr.hash_device_key(device_key)
    db = AsyncMock()
    db.execute.return_value = result_with(station)

    actor = await srr.require_srr_operator_or_device(credentials=None, venue_access_token=None, x_device_key=device_key, db=db)

    assert actor is station


@pytest.mark.asyncio
async def test_srr_device_key_rejects_revoked_station():
    station = make_station(uuid.uuid4())
    device_key = "srrdev_revoked-device-key"
    station.enrollment_token_hash = srr.hash_device_key(device_key)
    station.enrollment_token_revoked_at = datetime.now(timezone.utc)
    db = AsyncMock()
    db.execute.return_value = result_with()

    with pytest.raises(HTTPException) as exc:
        await srr.require_srr_operator_or_device(credentials=None, venue_access_token=None, x_device_key=device_key, db=db)

    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_checkin_unknown_speaker_returns_404_without_seeded_fallback(mocker):
    db = AsyncMock()
    db.add = MagicMock()
    db.execute.return_value = result_with()

    with pytest.raises(HTTPException) as exc:
        await srr.srr_speaker_checkin(srr.CheckinRequest(qr_code="missing@example.com"), db=db)

    assert exc.value.status_code == 404
    assert db.add.call_count == 0
    assert "Speaker not found" in exc.value.detail


@pytest.mark.asyncio
async def test_checkin_rejects_when_station_is_offline(mocker):
    event = make_event()
    speaker = make_speaker(event.id)
    offline_station = make_station(event.id, seconds_ago=90)
    db = AsyncMock()
    db.add = MagicMock()
    db.execute.side_effect = [
        result_with(speaker, scalar=speaker),
        result_with(offline_station),
    ]

    with pytest.raises(HTTPException) as exc:
        await srr.srr_speaker_checkin(srr.CheckinRequest(qr_code=speaker.email), db=db)

    assert exc.value.status_code == 409
    assert "busy, offline, or locked" in exc.value.detail


@pytest.mark.asyncio
async def test_checkin_assigns_lowest_online_idle_station(mocker):
    mocker.patch.object(srr, "broadcast_srr", AsyncMock())
    mocker.patch.object(srr, "get_speaker_sessions_helper", AsyncMock(return_value=[]))
    event = make_event()
    speaker = make_speaker(event.id)
    busy_station = make_station(event.id, status="occupied")
    busy_station.station_number = 1
    ready_station = make_station(event.id)
    ready_station.station_number = 2
    db = AsyncMock()
    db.add = MagicMock()
    db.execute.side_effect = [
        result_with(speaker, scalar=speaker),
        result_with(ready_station),
    ]

    response = await srr.srr_speaker_checkin(srr.CheckinRequest(qr_code=speaker.email), db=db)

    assert response["station_number"] == 2
    assert ready_station.assigned_speaker_id == speaker.id
    assert ready_station.status == "occupied"
    assert db.add.call_count >= 2


@pytest.mark.asyncio
async def test_workstation_device_cannot_perform_srr_checkin():
    station = make_station(uuid.uuid4())
    station.device_role = "workstation"
    db = AsyncMock()

    with pytest.raises(HTTPException) as exc:
        await srr.srr_speaker_checkin(
            srr.CheckinRequest(qr_code="speaker@example.com"),
            db=db,
            actor=station,
        )

    assert exc.value.status_code == 403
    assert "check-in node or master" in exc.value.detail


@pytest.mark.asyncio
async def test_manual_assignment_rejects_cross_event_speaker():
    event_id = uuid.uuid4()
    station = make_station(event_id)
    speaker = make_speaker(uuid.uuid4())
    db = AsyncMock()
    db.get.side_effect = [station, speaker]

    with pytest.raises(HTTPException) as exc:
        await srr.assign_speaker_to_station(
            str(station.id),
            srr.AssignStationRequest(speaker_id=str(speaker.id)),
            db=db,
            _=None,
        )

    assert exc.value.status_code == 403
    assert "event scope" in exc.value.detail
    assert db.commit.call_count == 0


@pytest.mark.asyncio
async def test_manual_assignment_does_not_overwrite_occupied_station():
    event = make_event()
    station = make_station(event.id, status="occupied")
    station.assigned_speaker_id = uuid.uuid4()
    speaker = make_speaker(event.id)
    db = AsyncMock()
    db.get.side_effect = [station, speaker]

    with pytest.raises(HTTPException) as exc:
        await srr.assign_speaker_to_station(
            str(station.id),
            srr.AssignStationRequest(speaker_id=str(speaker.id)),
            db=db,
            _=None,
        )

    assert exc.value.status_code == 409
    assert "already assigned" in exc.value.detail
    assert db.commit.call_count == 0


@pytest.mark.asyncio
async def test_manual_assignment_replays_idempotently():
    event = make_event()
    station = make_station(event.id)
    speaker = make_speaker(event.id)
    previous = MagicMock(station_id=station.id, speaker_id=speaker.id)
    db = AsyncMock()
    db.get.return_value = station
    db.execute.return_value = result_with(previous)

    response = await srr.assign_speaker_to_station(
        str(station.id),
        srr.AssignStationRequest(speaker_id=str(speaker.id), operation_id="manual-assignment-1"),
        db=db,
        _=None,
    )

    assert response["duplicate"] is True
    assert response["station_number"] == station.station_number
    db.commit.assert_not_called()


@pytest.mark.asyncio
async def test_checkin_replay_rejects_operation_from_another_event():
    requested_event = make_event()
    other_event = make_event()
    previous = MagicMock(event_id=other_event.id, station_id=None, speaker_id=uuid.uuid4())
    db = AsyncMock()
    db.execute.return_value = result_with(previous)

    with pytest.raises(HTTPException) as exc:
        await srr.srr_speaker_checkin(
            srr.CheckinRequest(operation_id="offline-op-1", event_id=str(requested_event.id)),
            db=db,
            actor=MagicMock(),
        )

    assert exc.value.status_code == 403
    assert "event scope" in exc.value.detail


def test_enrolled_station_requires_matching_device_key():
    station = make_station(uuid.uuid4())
    station.enrollment_token_hash = srr.hash_device_key("correct-key")

    with pytest.raises(HTTPException) as missing:
        srr.verify_station_device_key(station, None)
    assert missing.value.status_code == 401

    with pytest.raises(HTTPException) as wrong:
        srr.verify_station_device_key(station, "any-key")
    assert wrong.value.status_code == 401

    srr.verify_station_device_key(station, "correct-key")


@pytest.mark.asyncio
async def test_unknown_station_heartbeat_requires_enrolled_device_without_auto_enroll(mocker):
    mocker.patch.object(srr, "broadcast_srr", AsyncMock())
    db = AsyncMock()
    db.add = MagicMock()
    db.execute.return_value = result_with()

    with pytest.raises(HTTPException) as exc:
        await srr.station_heartbeat(srr.StationHeartbeatRequest(station_number=88, device_name="Unenrolled"), db=db)

    assert exc.value.status_code == 401
    assert "enrolled SRR station key" in exc.value.detail
    assert db.add.call_count == 0


def test_build_srr_replica_creates_sqlite_tables(tmp_path):
    event = make_event()
    speaker = make_speaker(event.id)
    station = make_station(event.id)
    slot = make_session_speaker(speaker.id)
    target = tmp_path / "srr.sqlite"

    srr.build_srr_replica(event=event, stations=[station], speakers=[speaker], sessions=[slot], files=[], target_path=target)

    connection = srr.sqlite3.connect(target)
    try:
        assert connection.execute("SELECT value FROM replica_meta WHERE key='replica_type'").fetchone()[0] == "srr_preview"
        assert connection.execute("SELECT COUNT(*) FROM srr_stations").fetchone()[0] == 1
        assert connection.execute("SELECT COUNT(*) FROM srr_speakers").fetchone()[0] == 1
        assert connection.execute("SELECT COUNT(*) FROM srr_sessions").fetchone()[0] == 1
        assert connection.execute("PRAGMA user_version").fetchone()[0] == 4
        assert connection.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='node_outbox'").fetchone()[0] == "node_outbox"
        assert connection.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='delivery_acknowledgements'").fetchone()[0] == "delivery_acknowledgements"
    finally:
        connection.close()

    replica = NodeReplica(target)
    try:
        station_row = replica.connection.execute("SELECT station_number,status FROM srr_stations").fetchone()
        assert station_row[0] == 1
        assert station_row[1] == "idle"
        assert replica.connection.execute("PRAGMA user_version").fetchone()[0] == 4
    finally:
        replica.close()


@pytest.mark.asyncio
async def test_upload_persists_binary_checksum_and_version(mocker, tmp_path):
    mocker.patch.object(srr, "broadcast_srr", AsyncMock())
    event = make_event()
    speaker = make_speaker(event.id)
    slot = make_session_speaker(speaker.id)
    install = MagicMock(storage_path=str(tmp_path / "content"), created_at=datetime.now(timezone.utc))
    db = AsyncMock()
    db.add = MagicMock()
    db.get.side_effect = [speaker, slot]
    db.execute.side_effect = [result_with(), result_with(install, scalar=install)]

    response = await srr.upload_presentation_file(
        speaker_id=str(speaker.id),
        session_speaker_id=str(slot.id),
        filename="actual.pptx",
        file_size_bytes=len(b"real-presentation"),
        file=upload_file(tmp_path),
        db=db,
    )

    created = db.add.call_args_list[0].args[0]
    assert response["file"]["content_sha256"] == srr.hashlib.sha256(b"real-presentation").hexdigest()
    assert Path(created.local_cache_path).exists()
    assert Path(created.local_cache_path).read_bytes() == b"real-presentation"
    assert created.local_sync_status == "synced"


@pytest.mark.asyncio
async def test_upload_rejects_cross_event_session_assignment(mocker, tmp_path):
    event = make_event()
    other_event = make_event()
    speaker = make_speaker(event.id)
    slot = make_session_speaker(speaker.id)
    db = MagicMock()
    mocker.patch.object(srr, "AsyncSession", type(db))
    db.get.side_effect = [speaker, slot]
    db.get = AsyncMock(side_effect=[speaker, slot])
    db.execute = AsyncMock(return_value=result_with(scalar=slot))
    db.scalar = AsyncMock(return_value=other_event.id)

    with pytest.raises(HTTPException) as exc:
        await srr.upload_presentation_file(
            speaker_id=str(speaker.id),
            session_speaker_id=str(slot.id),
            filename="cross-event.pptx",
            file_size_bytes=len(b"real-presentation"),
            file=upload_file(tmp_path, name="cross-event.pptx"),
            db=db,
        )

    assert exc.value.status_code == 409
    assert "different events" in exc.value.detail


@pytest.mark.asyncio
async def test_upload_rejects_unsupported_format_before_storage(tmp_path):
    event = make_event()
    speaker = make_speaker(event.id)
    slot = make_session_speaker(speaker.id)
    db = AsyncMock()
    db.get.side_effect = [speaker, slot]
    db.execute.side_effect = [result_with(), result_with()]

    with pytest.raises(HTTPException) as exc:
        await srr.upload_presentation_file(
            speaker_id=str(speaker.id),
            session_speaker_id=str(slot.id),
            filename="malware.exe",
            file_size_bytes=len(b"real-presentation"),
            file=upload_file(tmp_path, name="malware.exe"),
            db=db,
        )

    assert exc.value.status_code == 415


@pytest.mark.asyncio
async def test_upload_rejects_declared_size_mismatch(tmp_path):
    event = make_event()
    speaker = make_speaker(event.id)
    slot = make_session_speaker(speaker.id)
    install = MagicMock(storage_path=str(tmp_path / "content"), created_at=datetime.now(timezone.utc))
    db = AsyncMock()
    db.add = MagicMock()
    db.get.side_effect = [speaker, slot]
    db.execute.side_effect = [result_with(), result_with(install, scalar=install)]

    with pytest.raises(HTTPException) as exc:
        await srr.upload_presentation_file(
            speaker_id=str(speaker.id),
            session_speaker_id=str(slot.id),
            filename="wrong-size.pptx",
            file_size_bytes=999,
            file=upload_file(tmp_path, name="wrong-size.pptx"),
            db=db,
        )

    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_upload_idempotency_replays_existing_version_without_new_file(tmp_path):
    event = make_event()
    speaker = make_speaker(event.id)
    slot = make_session_speaker(speaker.id)
    previous = make_presentation_file(tmp_path, event.id, speaker.id, slot.id)
    previous.upload_idempotency_key = "upload-op-1"
    db = AsyncMock()
    db.get.side_effect = [speaker, slot]
    db.execute.return_value = result_with(previous)

    response = await srr.upload_presentation_file(
        speaker_id=str(speaker.id),
        session_speaker_id=str(slot.id),
        filename="replacement.pptx",
        file_size_bytes=5,
        operation_id="upload-op-1",
        file=upload_file(tmp_path, name="replacement.pptx"),
        db=db,
    )

    assert response["idempotent"] is True
    assert response["version"] == previous.version_number
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_finalize_fails_when_binary_missing():
    file = PresentationFile(
        id=uuid.uuid4(),
        speaker_id=uuid.uuid4(),
        session_speaker_id=uuid.uuid4(),
        event_id=uuid.uuid4(),
        original_filename="missing.pptx",
        stored_filename="missing.pptx",
        storage_path="presentations/missing.pptx",
        file_size_bytes=10,
        mime_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        file_format="pptx",
        local_cache_path="Z:/does/not/exist/missing.pptx",
    )
    db = AsyncMock()
    db.get.return_value = file

    with pytest.raises(HTTPException) as exc:
        await srr.finalize_presentation(str(file.id), srr.FinalizeFileRequest(), db=db)

    assert exc.value.status_code == 409
    assert "binary is missing" in exc.value.detail


@pytest.mark.asyncio
async def test_station_cannot_finalize_or_download_another_speakers_file(tmp_path):
    event = make_event()
    speaker = make_speaker(event.id)
    other_speaker = make_speaker(event.id)
    slot = make_session_speaker(speaker.id)
    file = make_presentation_file(tmp_path, event.id, other_speaker.id, slot.id)
    station = make_station(event.id)
    station.assigned_speaker_id = speaker.id
    db = AsyncMock()
    db.get.return_value = file

    with pytest.raises(HTTPException) as finalize_error:
        await srr.finalize_presentation(
            str(file.id), srr.FinalizeFileRequest(), db=db, actor=station
        )
    assert finalize_error.value.status_code == 403

    with pytest.raises(HTTPException) as download_error:
        await srr.download_file(str(file.id), db=db, actor=station)
    assert download_error.value.status_code == 403


@pytest.mark.asyncio
async def test_finalize_creates_delivery_queue_and_upload_sync_job(mocker, tmp_path):
    mocker.patch.object(srr, "broadcast_srr", AsyncMock())
    event = make_event()
    speaker = make_speaker(event.id)
    slot = make_session_speaker(speaker.id)
    file = make_presentation_file(tmp_path, event.id, speaker.id, slot.id)
    db = AsyncMock()
    db.add = MagicMock()
    db.get.side_effect = [file, slot, None]
    db.execute.side_effect = [result_with(), result_with(), result_with(), result_with(), result_with(), result_with()]

    response = await srr.finalize_presentation(str(file.id), srr.FinalizeFileRequest(notes="checked"), db=db)

    added_types = [type(call.args[0]) for call in db.add.call_args_list]
    assert PresentationQueue in added_types
    assert VenueSyncJob in added_types
    assert response["queue_entry_id"]
    assert response["sync_job_id"]
    assert file.upload_status == "approved"


@pytest.mark.asyncio
async def test_ensure_delivery_records_reuses_existing_pending_sync_job(tmp_path):
    event = make_event()
    speaker = make_speaker(event.id)
    slot = make_session_speaker(speaker.id)
    file = make_presentation_file(tmp_path, event.id, speaker.id, slot.id)
    queue = PresentationQueue(id=uuid.uuid4(), session_id=slot.session_id, session_speaker_id=slot.id, file_id=file.id, queue_order=4, status="queued")
    job = VenueSyncJob(id=uuid.uuid4(), event_id=event.id, file_id=file.id, sync_type="upload", priority=1, status="pending")
    db = AsyncMock()
    db.get.return_value = slot
    db.add = MagicMock()
    db.execute.side_effect = [result_with(queue, scalar=queue), result_with(job, scalar=job)]

    returned_queue, returned_job = await srr.ensure_delivery_records(db, file)

    assert returned_queue is queue
    assert returned_job is job
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_delivery_intents_target_only_stage_and_technical_devices(tmp_path):
    event = make_event()
    speaker = make_speaker(event.id)
    slot = make_session_speaker(speaker.id)
    file = make_presentation_file(tmp_path, event.id, speaker.id, slot.id)
    session = type("SessionStub", (), {"room_id": uuid.uuid4()})()
    stage = RoomDevice(id=uuid.uuid4(), event_id=event.id, room_id=session.room_id, device_type="presentation_pc", device_name="Stage", enrollment_token_hash="stage-enrolled")
    technical = RoomDevice(id=uuid.uuid4(), event_id=event.id, room_id=session.room_id, device_type="technician_tablet", device_name="Technical", enrollment_token_hash="technical-enrolled")
    signage = RoomDevice(id=uuid.uuid4(), event_id=event.id, room_id=session.room_id, device_type="signage", device_name="Signage", enrollment_token_hash="signage-enrolled")
    un_enrolled_stage = RoomDevice(id=uuid.uuid4(), event_id=event.id, room_id=session.room_id, device_type="stage_app", device_name="Unenrolled Stage")
    revoked_technical = RoomDevice(id=uuid.uuid4(), event_id=event.id, room_id=session.room_id, device_type="technical_app", device_name="Revoked Technical", enrollment_token_hash="revoked", enrollment_token_revoked_at=datetime.now(timezone.utc))
    db = AsyncMock()
    db.add = MagicMock()
    db.get.return_value = session
    db.execute.side_effect = [result_with(), result_with(stage, technical, signage, un_enrolled_stage, revoked_technical), result_with()]

    await srr.create_asset_transfer_intents(db, file, session.id if hasattr(session, "id") else uuid.uuid4())

    transfers = [call.args[0] for call in db.add.call_args_list if isinstance(call.args[0], srr.VenueAssetTransfer)]
    assert {transfer.target_type for transfer in transfers} == {"presentation_pc", "technician_tablet"}
    assert all(transfer.target_type not in {"signage", "stage_app", "technical_app"} for transfer in transfers)


@pytest.mark.asyncio
async def test_new_room_device_backfills_existing_current_files(monkeypatch):
    event_id = uuid.uuid4()
    room_id = uuid.uuid4()
    device = RoomDevice(
        id=uuid.uuid4(), event_id=event_id, room_id=room_id,
        device_type="stage_app", device_name="Stage", enrollment_token_hash="enrolled",
    )
    presentation_file = MagicMock(
        event_id=event_id, room_id=room_id, session_id=uuid.uuid4(),
        is_current_version=True,
    )
    db = AsyncMock()
    db.execute.return_value = result_with(presentation_file)
    create_intents = AsyncMock()
    monkeypatch.setattr(srr, "create_asset_transfer_intents", create_intents)

    count = await workstations._backfill_room_delivery_intents(db, device)

    assert count == 1
    create_intents.assert_awaited_once_with(db, presentation_file, presentation_file.session_id)
    db.commit.assert_awaited_once()
