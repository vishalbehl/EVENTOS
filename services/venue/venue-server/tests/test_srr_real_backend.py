import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException
from starlette.datastructures import Headers
from starlette.datastructures import UploadFile as StarletteUploadFile

from app.models.event import Event
from app.models.speaker import Speaker
from app.models.srr_station import SRRStation
from app.models.session_speaker import SessionSpeaker
from app.models.presentation_file import PresentationFile
from app.models.presentation_queue import PresentationQueue
from app.models.venue_sync_job import VenueSyncJob
from app.routers import srr


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


def test_enrolled_station_requires_matching_device_key():
    station = make_station(uuid.uuid4())
    station.enrollment_token_hash = srr.hash_device_key("correct-key")

    with pytest.raises(HTTPException) as exc:
        srr.verify_station_device_key(station, "wrong-key")

    assert exc.value.status_code == 403
    srr.verify_station_device_key(station, "correct-key")


@pytest.mark.asyncio
async def test_unknown_station_heartbeat_returns_not_configured_without_auto_enroll(mocker):
    mocker.patch.object(srr, "broadcast_srr", AsyncMock())
    db = AsyncMock()
    db.add = MagicMock()
    db.execute.return_value = result_with()

    with pytest.raises(HTTPException) as exc:
        await srr.station_heartbeat(srr.StationHeartbeatRequest(station_number=88, device_name="Unenrolled"), db=db)

    assert exc.value.status_code == 404
    assert "not configured" in exc.value.detail
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
    finally:
        connection.close()


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
async def test_finalize_creates_delivery_queue_and_upload_sync_job(mocker, tmp_path):
    mocker.patch.object(srr, "broadcast_srr", AsyncMock())
    event = make_event()
    speaker = make_speaker(event.id)
    slot = make_session_speaker(speaker.id)
    file = make_presentation_file(tmp_path, event.id, speaker.id, slot.id)
    db = AsyncMock()
    db.add = MagicMock()
    db.get.side_effect = [file, slot]
    db.execute.side_effect = [result_with(), result_with(), result_with(), result_with()]

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
