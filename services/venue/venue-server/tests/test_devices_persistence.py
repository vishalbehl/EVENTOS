import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.room_device import RoomDevice
from app.models.event import Event
from app.models.room import Room
from app.routers import devices


def result_with(*rows):
    result = MagicMock()
    result.scalars.return_value.all.return_value = list(rows)
    return result


@pytest.mark.asyncio
async def test_scan_mode_is_persisted_on_enrolled_device():
    device = RoomDevice(id=uuid.uuid4(), event_id=uuid.uuid4(), room_id=uuid.uuid4(), device_name="Scanner", device_type="scanner")
    db = AsyncMock()
    db.get.return_value = device

    response = await devices.configure_device_scan_mode(
        devices.ScannerModeConfig(device_id=str(device.id), scan_mode="workshop"),
        db=db,
        _=True,
    )

    assert response["scan_mode"] == "workshop"
    assert device.scan_mode == "workshop"
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_online_devices_require_recent_persisted_heartbeat():
    recent = RoomDevice(id=uuid.uuid4(), event_id=uuid.uuid4(), room_id=uuid.uuid4(), device_name="Recent", device_type="scanner", status="online", last_heartbeat_at=datetime.now(timezone.utc), scan_mode="entry")
    stale = RoomDevice(id=uuid.uuid4(), event_id=recent.event_id, room_id=recent.room_id, device_name="Stale", device_type="scanner", status="online", last_heartbeat_at=datetime.now(timezone.utc) - timedelta(seconds=61))
    db = AsyncMock()
    db.execute.return_value = result_with(recent, stale)

    response = await devices.get_online_devices(db=db, _=True)

    assert response["count"] == 1
    assert response["devices"] == [{"device_id": str(recent.id), "last_seen": recent.last_heartbeat_at.isoformat(), "status": "online", "scan_mode": "entry"}]


@pytest.mark.asyncio
async def test_register_device_issues_scoped_secret_without_exposing_hash(monkeypatch):
    event_id = uuid.uuid4()
    room_id = uuid.uuid4()
    event = Event(id=event_id, organization_id=uuid.uuid4(), name="Test", short_code="TEST", start_date=datetime.now(timezone.utc).date(), end_date=datetime.now(timezone.utc).date())
    room = Room(id=room_id, event_id=event_id, name="Room 1")
    db = AsyncMock()
    db.get.side_effect = [event, room]
    db.add = MagicMock()
    monkeypatch.setattr("app.routers.workstations._backfill_room_delivery_intents", AsyncMock(return_value=0))

    response = await devices.register_device(
        devices.RegisterDeviceRequest(name="Stage 1", mac_address="00:11:22:33:44:55", device_type="stage_app", event_id=event_id, room_id=room_id),
        db=db,
        _=True,
    )

    assert response["device_token"] == response["enrollment_token"]
    assert response["secret_returned_once"] is True
    assert response["device"]["enrollment_token_prefix"] == response["device_token"][:20]
    assert "enrollment_token_hash" not in response["device"]
    db.refresh.assert_awaited_once()


@pytest.mark.asyncio
async def test_revoke_device_invalidates_credential_and_records_offline_state():
    device = RoomDevice(id=uuid.uuid4(), event_id=uuid.uuid4(), room_id=uuid.uuid4(), device_name="Stage 1", device_type="stage_app", status="online", enrollment_token_hash="hash")
    db = AsyncMock()
    db.get.return_value = device
    db.add = MagicMock()

    response = await devices.revoke_device(str(device.id), db=db, _=True)

    assert response["revoked"] is True
    assert device.status == "offline"
    assert device.enrollment_token_revoked_at is not None
    db.commit.assert_awaited_once()
