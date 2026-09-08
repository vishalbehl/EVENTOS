import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.models.room import Room
from app.models.room_device import RoomDevice
from app.models.room_runtime_state import RoomRuntimeState
from app.routers import room_runtime


def _room() -> Room:
    return Room(id=uuid.uuid4(), event_id=uuid.uuid4(), name="Room A", is_active=True)


def _device(room_id: uuid.UUID, device_type: str, event_id: uuid.UUID | None = None) -> RoomDevice:
    return RoomDevice(
        id=uuid.uuid4(), event_id=event_id or room_id, room_id=room_id,
        device_type=device_type, device_name=f"{device_type}-01",
        enrollment_token_hash="enrolled", status="online",
    )


@pytest.mark.asyncio
async def test_stage_device_cannot_issue_technical_session_switch():
    room = _room()
    device = _device(room.id, "presentation_pc", room.event_id)
    db = AsyncMock()
    db.add = MagicMock()
    db.get.side_effect = [room, device]

    with pytest.raises(HTTPException) as exc:
        await room_runtime.create_room_command(
            room.id,
            room_runtime.RoomCommand(command="switch_session", reason="stage request"),
            authenticated_device_id=device.id,
            _=True,
            db=db,
        )

    assert exc.value.status_code == 403
    assert "role" in exc.value.detail
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_technical_device_can_issue_session_switch():
    room = _room()
    device = _device(room.id, "technician_tablet", room.event_id)
    db = AsyncMock()
    db.add = MagicMock()
    db.get.side_effect = [room, device]
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    db.execute.return_value = result
    room_runtime.record_runtime_event = MagicMock()
    db.refresh = AsyncMock()

    response = await room_runtime.create_room_command(
        room.id,
        room_runtime.RoomCommand(command="switch_session", reason="technical request", idempotency_key="switch-1"),
        authenticated_device_id=device.id,
        _=True,
        db=db,
    )

    assert response["accepted"] is True
    assert response["status"] == "queued"
    db.add.assert_called()


@pytest.mark.asyncio
async def test_switch_session_activates_authoritative_room_session():
    room = _room()
    device = _device(room.id, "technical_app", room.event_id)
    target_session_id = uuid.uuid4()
    previous_session_id = uuid.uuid4()
    target_session = MagicMock(id=target_session_id, room_id=room.id, event_id=room.event_id, status="scheduled")
    previous_session = MagicMock(id=previous_session_id, room_id=room.id, event_id=room.event_id, status="in_progress")
    queue_entry = MagicMock(id=uuid.uuid4(), session_id=target_session_id)
    db = AsyncMock()
    db.add = MagicMock()
    db.get.side_effect = [room, device, queue_entry, target_session]
    idempotency_result = MagicMock()
    idempotency_result.scalar_one_or_none.return_value = None
    sessions_result = MagicMock()
    sessions_result.scalars.return_value.all.return_value = [previous_session, target_session]
    db.execute.side_effect = [idempotency_result, sessions_result]
    room_runtime.record_runtime_event = MagicMock()
    db.refresh = AsyncMock()

    response = await room_runtime.create_room_command(
        room.id,
        room_runtime.RoomCommand(
            command="switch_session",
            payload={"queue_entry_id": str(queue_entry.id)},
            reason="make target current",
            idempotency_key="switch-authoritative-1",
        ),
        authenticated_device_id=device.id,
        _=True,
        db=db,
    )

    assert response["status"] == "executed"
    assert target_session.status == "in_progress"
    assert previous_session.status == "completed"
    event_types = [call.kwargs.get("event_type") for call in room_runtime.record_runtime_event.call_args_list]
    assert "session.switched" in event_types


@pytest.mark.asyncio
async def test_technical_device_can_target_stage_device():
    room = _room()
    technical = _device(room.id, "technical_app", room.event_id)
    stage = _device(room.id, "stage_app", room.event_id)
    db = AsyncMock()
    db.add = MagicMock()
    db.get.side_effect = [room, technical, stage]
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    db.execute.return_value = result
    room_runtime.record_runtime_event = MagicMock()
    db.refresh = AsyncMock()

    response = await room_runtime.create_room_command(
        room.id,
        room_runtime.RoomCommand(
            command="launch_presentation",
            device_id=stage.id,
            reason="technical launch",
            idempotency_key="launch-1",
        ),
        authenticated_device_id=technical.id,
        _=True,
        db=db,
    )

    assert response["accepted"] is True
    assert response["status"] == "queued"
    db.add.assert_called()


@pytest.mark.asyncio
async def test_timer_command_persists_runtime_state_for_reconnect():
    room = _room()
    device = _device(room.id, "technical_app", room.event_id)
    state = RoomRuntimeState(event_id=room.event_id, room_id=room.id)
    db = AsyncMock()
    db.add = MagicMock()
    db.get.side_effect = [room, device]
    idempotency_result = MagicMock()
    idempotency_result.scalar_one_or_none.return_value = None
    db.execute.return_value = idempotency_result
    db.scalar.return_value = state
    room_runtime.record_runtime_event = MagicMock()
    db.refresh = AsyncMock()

    response = await room_runtime.create_room_command(
        room.id,
        room_runtime.RoomCommand(
            command="start_timer",
            payload={"duration_seconds": 900},
            reason="start talk timer",
            idempotency_key="timer-start-1",
        ),
        authenticated_device_id=device.id,
        _=True,
        db=db,
    )

    assert response["status"] == "queued"
    assert state.timer_status == "running"
    assert state.timer_duration_seconds == 900
    assert state.timer_remaining_seconds == 900
    assert state.timer_started_at is not None


def test_elapsed_timer_is_not_reported_as_running():
    state = RoomRuntimeState(
        timer_status="running",
        timer_remaining_seconds=30,
        timer_duration_seconds=30,
        timer_started_at=datetime.now(timezone.utc) - timedelta(seconds=45),
    )
    payload = room_runtime._timer_payload(state, datetime.now(timezone.utc))
    assert payload["remaining_seconds"] == 0
    assert payload["status"] == "expired"
    assert payload["running"] is False


@pytest.mark.asyncio
async def test_stage_device_receives_only_commands_targeted_to_it():
    room = _room()
    stage = _device(room.id, "presentation_pc", room.event_id)
    other = _device(room.id, "technician_tablet", room.event_id)
    targeted = room_runtime.VenueCommand(
        id=uuid.uuid4(), event_id=room.event_id, room_id=room.id,
        payload={"device_id": str(stage.id), "queue_entry_id": "entry-1"},
        status="queued", command="launch_presentation", reason="launch",
    )
    unrelated = room_runtime.VenueCommand(
        id=uuid.uuid4(), event_id=room.event_id, room_id=room.id,
        payload={"device_id": str(other.id)}, status="queued", command="switch_session", reason="switch",
    )
    db = AsyncMock()
    db.get.side_effect = [room, stage]
    result = MagicMock()
    result.scalars.return_value.all.return_value = [targeted, unrelated]
    db.execute.return_value = result
    room_runtime.record_runtime_event = MagicMock()

    response = await room_runtime.get_room_device_commands(
        room.id, device_id=stage.id, _=True, db=db,
    )

    assert [item["id"] for item in response["commands"]] == [str(targeted.id)]
    assert targeted.status == "delivered"
    assert unrelated.status == "queued"
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_command_idempotency_key_cannot_cross_room_scope():
    room = _room()
    device = _device(room.id, "technician_tablet", room.event_id)
    existing = room_runtime.VenueCommand(
        id=uuid.uuid4(), event_id=room.event_id, room_id=uuid.uuid4(),
        idempotency_key="same-operation", status="queued", command="stop",
    )
    db = AsyncMock()
    db.get.side_effect = [room, device]
    result = MagicMock()
    result.scalar_one_or_none.return_value = existing
    db.execute.return_value = result

    with pytest.raises(HTTPException) as exc:
        await room_runtime.create_room_command(
            room.id,
            room_runtime.RoomCommand(command="stop", idempotency_key="same-operation"),
            authenticated_device_id=device.id,
            _=True,
            db=db,
        )

    assert exc.value.status_code == 409
    assert "another room or event" in exc.value.detail


@pytest.mark.asyncio
async def test_command_acknowledgement_records_completion_and_replay_is_idempotent():
    room = _room()
    device = _device(room.id, "presentation_pc", room.event_id)
    command = room_runtime.VenueCommand(
        id=uuid.uuid4(), event_id=room.event_id, room_id=room.id,
        payload={"device_id": str(device.id)}, status="queued", command="launch_presentation",
    )
    db = AsyncMock()
    async def get_model(model, identifier):
        return room if model is room_runtime.Room else command
    db.get.side_effect = get_model
    db.add = MagicMock()
    room_runtime.record_runtime_event = MagicMock()

    response = await room_runtime.acknowledge_room_command(
        room.id, command.id,
        room_runtime.CommandAcknowledgement(status="executed", result={"file_version": 2}),
        authenticated_device_id=device.id,
        _=True,
        db=db,
    )

    assert response["accepted"] is True
    assert command.completed_at is not None
    first_event_count = room_runtime.record_runtime_event.call_count

    replay = await room_runtime.acknowledge_room_command(
        room.id, command.id,
        room_runtime.CommandAcknowledgement(status="executed", result={"file_version": 2}),
        authenticated_device_id=device.id,
        _=True,
        db=db,
    )
    assert replay["duplicate"] is True
    assert room_runtime.record_runtime_event.call_count == first_event_count
