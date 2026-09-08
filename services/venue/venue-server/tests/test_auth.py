import pytest
import uuid
import hashlib
from unittest.mock import AsyncMock
from app.config import settings
from app.models.room_device import RoomDevice
from app.routers.auth import create_device_access_token, decode_token, validate_room_device_credential

def test_verify_connection_success(test_client):
    response = test_client.get("/api/v1/auth/verify", headers={"X-Venue-Key": settings.VENUE_AUTH_KEY})
    assert response.status_code == 200
    assert response.json()["authenticated"] is True

def test_verify_connection_missing_key(test_client):
    response = test_client.get("/api/v1/auth/verify")
    assert response.status_code == 401

def test_verify_connection_invalid_key(test_client):
    response = test_client.get("/api/v1/auth/verify", headers={"X-Venue-Key": "wrong_key"})
    assert response.status_code == 401


def test_device_access_token_contains_event_and_room_scope():
    device = RoomDevice(
        id=uuid.uuid4(), event_id=uuid.uuid4(), room_id=uuid.uuid4(),
        device_type="presentation_pc", device_name="Stage-01",
        enrollment_token_hash="enrolled", status="online",
    )
    token = create_device_access_token(device)
    payload = decode_token(token, "device_access")
    assert payload["sub"] == str(device.id)
    assert payload["event_id"] == str(device.event_id)
    assert payload["room_id"] == str(device.room_id)
    assert payload["device_type"] == "presentation_pc"


@pytest.mark.asyncio
async def test_device_access_token_rejects_wrong_scope():
    device = RoomDevice(
        id=uuid.uuid4(), event_id=uuid.uuid4(), room_id=uuid.uuid4(),
        device_type="presentation_pc", device_name="Stage-01",
        enrollment_token_hash="enrolled", status="online",
    )
    token = create_device_access_token(device)
    db = AsyncMock()
    db.get.return_value = device
    other_device_id = uuid.uuid4()
    assert await validate_room_device_credential(db, other_device_id, token) is None


@pytest.mark.asyncio
async def test_long_lived_enrollment_secret_is_exchange_only():
    device = RoomDevice(
        id=uuid.uuid4(), event_id=uuid.uuid4(), room_id=uuid.uuid4(),
        device_type="technician_tablet", device_name="Tech-01",
        enrollment_token_hash="", status="online",
    )
    device.enrollment_token_hash = hashlib.sha256(b"enrollment-secret-123456").hexdigest()
    db = AsyncMock()
    db.get.return_value = device
    assert await validate_room_device_credential(db, device.id, "enrollment-secret-123456") is None
    assert await validate_room_device_credential(db, device.id, "enrollment-secret-123456", allow_enrollment_token=True) is device
