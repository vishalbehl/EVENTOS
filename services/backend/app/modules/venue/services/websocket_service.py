# =============================================================
# Conference Platform — WebSocket Service
# backend/app/services/websocket_service.py
#
# Real-time bidirectional communication via Socket.IO.
#
# Architecture:
#   - Single global Socket.IO server (AsyncServer)
#   - Rooms are keyed by event_id: "event:{event_id}"
#   - Command Center connects on login and joins its event room
#   - Station, Room, and Moderator apps join on device auth
#
# Room membership:
#   - Command Center connections join "event:{event_id}" for all notifications
#   - Room apps join "room:{room_id}" for room-specific commands
#   - SRR technicians join "srr:{event_id}" for ready-room live feed
#
# This module:
#   - Declares the AsyncServer and ASGI app (mounted in main.py)
#   - Provides broadcast helpers used by the notification service
#   - Handles client connect / disconnect events
# =============================================================

from __future__ import annotations

import uuid
from functools import wraps
from typing import Any

import socketio
from socketio.exceptions import ConnectionRefusedError
from loguru import logger

from app.config import settings
from app.database import AsyncSessionLocal
from app.websocket.protection import RealtimeQuotaError, ingress, acquire, control, watchdog, cleanup
from app.websocket.socket_manager import ScopedSocketManager
from app.websocket.auth import (
    RealtimeAuthError,
    RealtimePrincipal,
    authenticate_realtime,
    authorize_event,
    authorize_moderator_command,
    authorize_room,
    reauthorize_principal,
)


# ── Socket.IO server ──────────────────────────────────────────
# AsyncServer is compatible with FastAPI / ASGI via the ASGIApp wrapper.
# cors_allowed_origins="*" — tighten in production to your domain list.

sio = socketio.AsyncServer(
    client_manager=ScopedSocketManager(settings.redis_lock_url),
    async_mode="asgi",
    cors_allowed_origins="*" if not settings.is_production else settings.CORS_ORIGINS,
    logger=False,
    engineio_logger=False,
    ping_interval=settings.WS_HEARTBEAT_INTERVAL,
    ping_timeout=20,
    max_http_buffer_size=1024 * 1024,
)

# Process-local handles only; admission/capacity live in shared Redis. Each
# authenticated transport has one watchdog and the disconnect path removes it.
_connection_resources = {}
sio.manager.recipient_lease = lambda sid: _connection_resources.get(sid, (None, None))[0]


def _limited_control(handler):
    @wraps(handler)
    async def wrapped(sid, data):
        try:
            principal = await _principal_for(sid)
            await control(principal, data)
            if handler.__name__.startswith("join_") and len(sio.rooms(sid)) >= 101:
                raise RealtimeQuotaError(413, 0)
            async with AsyncSessionLocal() as db:
                await reauthorize_principal(db, principal)
        except RealtimeAuthError:
            await _emit_denied(sid)
            await sio.disconnect(sid)
            return {"ack": False, "code": "PERMISSION_DENIED"}
        except RealtimeQuotaError as exc:
            await sio.emit("error", {"code": exc.code, "retry_after": exc.retry_after}, to=sid)
            await sio.disconnect(sid)
            return {"ack": False, "code": exc.code, "retry_after": exc.retry_after}
        except Exception:
            try:
                await sio.emit("error", {"code": "REALTIME_UNAVAILABLE"}, to=sid)
            finally:
                await sio.disconnect(sid)
            return {"ack": False, "code": "REALTIME_UNAVAILABLE"}
        return await handler(sid, data)
    return wrapped

# We will wrap the FastAPI app in main.py directly using sio.

# ── Room name helpers ─────────────────────────────────────────

def event_room(event_id: uuid.UUID | str) -> str:
    """Socket.IO room for Command Center event connections."""
    return f"event:{event_id}"


def room_room(room_id: uuid.UUID | str) -> str:
    """Socket.IO room for devices in a specific conference room."""
    return f"room:{room_id}"


def srr_room(event_id: uuid.UUID | str) -> str:
    """Socket.IO room for Speaker Ready Room technicians."""
    return f"srr:{event_id}"


def venue_ops_room(event_id: uuid.UUID | str) -> str:
    """Organiser and Command Center workflow room for Venue Ops."""
    return f"venue-ops:{event_id}"


# ── Broadcast helpers ─────────────────────────────────────────

async def broadcast_to_event(
    event_id: uuid.UUID,
    payload: dict,
    event_name: str = "notification",
) -> None:
    """
    Emit an event to all clients in the event's Command Center room.

    Used by notification_service to push real-time alerts.

    Args:
        event_id:   Target event UUID
        payload:    Dict to serialise and send as JSON
        event_name: Socket.IO event name (client listens for this)
    """
    room = event_room(event_id)
    await sio.emit(event_name, payload, room=room)
    logger.debug(f"Broadcast '{event_name}' → room {room}")


async def broadcast_to_room(
    room_id: uuid.UUID,
    payload: dict,
    event_name: str = "room_event",
) -> None:
    """
    Emit a command/event to all devices in a specific conference room.
    Used by the Moderator App to control what's on screen.
    """
    room = room_room(room_id)
    await sio.emit(event_name, payload, room=room)
    logger.debug(f"Broadcast '{event_name}' → room {room}")


async def broadcast_to_srr(
    event_id: uuid.UUID,
    payload: dict,
    event_name: str = "srr_event",
) -> None:
    """
    Emit an event to all SRR technician clients for this event.
    Used for live speaker check-in / station status updates.
    """
    room = srr_room(event_id)
    await sio.emit(event_name, payload, room=room)
    logger.debug(f"Broadcast '{event_name}' → SRR room {room}")


async def emit_to_client(
    sid: str,
    payload: dict,
    event_name: str = "message",
) -> None:
    """Send a message directly to a single connected client by session ID."""
    await sio.emit(event_name, payload, to=sid)


# ── Event handlers ────────────────────────────────────────────

@sio.event
async def connect(sid: str, environ: dict, auth: dict | None = None) -> bool:
    """
    Called when a client connects.

    Client should pass auth data:
        { token: "<jwt>" }             for Command Center
        { device_key: "<key>" }        for Electron apps
        { upload_token: "<token>" }    for speaker portal (SRR)

    We emit a 'connected' ack so the client knows the connection succeeded.
    In production, validate the token here and disconnect if invalid.
    """
    try:
        await ingress(environ.get("asgi.scope"))
        async with AsyncSessionLocal() as db:
            principal = await authenticate_realtime(db, auth)
        lease = await acquire(principal)
    except RealtimeQuotaError as exc:
        raise ConnectionRefusedError({"code": exc.code, "retry_after": exc.retry_after}) from exc
    except RealtimeAuthError as exc:
        logger.warning(f"Rejected realtime connection sid={sid}: {exc}")
        raise ConnectionRefusedError({"code": "PERMISSION_DENIED"}) from exc
    except Exception as exc:
        raise ConnectionRefusedError({"code": "REALTIME_UNAVAILABLE", "retry_after": 5}) from exc

    async def validate():
        current = await _principal_for(sid)
        rooms = sorted(sio.rooms(sid))
        if len(rooms) > 101:
            raise RealtimeAuthError("Realtime subscription bound exceeded.")
        async with AsyncSessionLocal() as db:
            await reauthorize_principal(db, current)
            for room in rooms:
                if room == sid:
                    continue
                prefix, separator, identifier = room.partition(":")
                if not separator or prefix not in {"event", "room", "srr", "venue-ops"}:
                    raise RealtimeAuthError("Realtime resource is unavailable.")
                if prefix == "room":
                    await authorize_room(db, current, uuid.UUID(identifier))
                else:
                    await authorize_event(db, current, uuid.UUID(identifier))

    async def terminate(error):
        code = "PERMISSION_DENIED" if isinstance(error, RealtimeAuthError) else "REALTIME_UNAVAILABLE"
        try:
            await sio.emit("error", {"code": code}, to=sid)
        finally:
            await sio.disconnect(sid)

    try:
        await sio.save_session(sid, principal.to_session())
        task = watchdog(lease, validate, terminate)
        _connection_resources[sid] = (lease, task)
        logger.info(f"Authenticated realtime connection sid={sid} kind={principal.kind}")
        await sio.emit("connected", {"sid": sid, "status": "ok"}, to=sid)
    except BaseException:
        resources = _connection_resources.pop(sid, (lease, None))
        await cleanup(*resources)
        raise
    return True


@sio.event
async def disconnect(sid: str, reason=None) -> None:
    """Called when a client disconnects (intentional or network loss)."""
    logger.info(f"WebSocket client disconnected: sid={sid}")
    resources = _connection_resources.pop(sid, None)
    if resources is not None:
        await cleanup(*resources)


async def _principal_for(sid: str) -> RealtimePrincipal:
    try:
        return RealtimePrincipal.from_session(await sio.get_session(sid))
    except (KeyError, TypeError, ValueError) as exc:
        raise RealtimeAuthError("Authenticated realtime session is required.") from exc


async def _emit_denied(sid: str) -> None:
    await sio.emit("error", {"code": "PERMISSION_DENIED", "message": "Access denied."}, to=sid)


@_limited_control
async def _unknown_control(sid, data):
    return {"ack": False, "code": "UNSUPPORTED_REALTIME_OPERATION"}


@sio.on("*")
async def unknown_control(event, sid, *data):
    # Unsupported event names still consume the authenticated control budget.
    # Names/payloads are bounded together and never become Redis key segments.
    return await _unknown_control(sid, {"event": event, "data": data})


@sio.event
@_limited_control
async def leave_resource_room(sid: str, data: dict) -> dict:
    """Remove only this connection's bounded resource subscription."""
    if set(data) != {"room"} or not isinstance(data.get("room"), str):
        return {"ack": False, "code": "INVALID_REALTIME_OPERATION"}
    room = data["room"]
    family, separator, identifier = room.partition(":")
    if not separator or family not in {"event", "venueops", "room", "srr"}:
        return {"ack": False, "code": "INVALID_REALTIME_OPERATION"}
    try:
        canonical = f"{family}:{uuid.UUID(identifier)}"
    except (TypeError, ValueError):
        return {"ack": False, "code": "INVALID_REALTIME_OPERATION"}
    # Never accept a caller-supplied SID or invoke cross-replica room mutations.
    await sio.leave_room(sid, canonical)
    return {"ack": True}


@sio.event
@_limited_control
async def join_event_room(sid: str, data: dict) -> None:
    """
    Client requests to join an event room.

    Expected data: { "event_id": "<uuid>" }

    In production: verify the client's JWT has access to this event_id.
    """
    try:
        event_id = uuid.UUID(str(data.get("event_id")))
        principal = await _principal_for(sid)
        async with AsyncSessionLocal() as db:
            await authorize_event(db, principal, event_id)
    except (RealtimeAuthError, TypeError, ValueError):
        await _emit_denied(sid)
        return
    if not event_id:
        await sio.emit("error", {"message": "event_id required"}, to=sid)
        return

    room = event_room(event_id)
    await sio.enter_room(sid, room)
    logger.info(f"sid={sid} joined event room: {room}")
    await sio.emit("room_joined", {"room": room}, to=sid)


@sio.event
@_limited_control
async def join_room_room(sid: str, data: dict) -> None:
    """
    Client (Room App / Moderator) requests to join a conference room channel.
    Expected data: { "room_id": "<uuid>" }
    """
    try:
        room_id = uuid.UUID(str(data.get("room_id")))
        principal = await _principal_for(sid)
        async with AsyncSessionLocal() as db:
            await authorize_room(db, principal, room_id)
    except (RealtimeAuthError, TypeError, ValueError):
        await _emit_denied(sid)
        return

    room = room_room(room_id)
    await sio.enter_room(sid, room)
    logger.info(f"sid={sid} joined conference room: {room}")
    await sio.emit("room_joined", {"room": room}, to=sid)


@sio.event
@_limited_control
async def join_srr_room(sid: str, data: dict) -> None:
    """
    SRR technician / Kiosk joins the ready-room channel.
    Expected data: { "event_id": "<uuid>" }
    """
    try:
        event_id = uuid.UUID(str(data.get("event_id")))
        principal = await _principal_for(sid)
        async with AsyncSessionLocal() as db:
            await authorize_event(db, principal, event_id)
    except (RealtimeAuthError, TypeError, ValueError):
        await _emit_denied(sid)
        return

    room = srr_room(event_id)
    await sio.enter_room(sid, room)
    logger.info(f"sid={sid} joined SRR room: {room}")
    await sio.emit("room_joined", {"room": room}, to=sid)


@sio.event
@_limited_control
async def join_venue_ops_room(sid: str, data: dict) -> None:
    """Join the authenticated organiser/Command Center Venue Ops workflow room."""
    try:
        event_id = uuid.UUID(str(data.get("event_id")))
        principal = await _principal_for(sid)
        if principal.kind != "user":
            raise RealtimeAuthError("Venue Ops requires a user session.")
        async with AsyncSessionLocal() as db:
            await authorize_event(db, principal, event_id)
    except (RealtimeAuthError, TypeError, ValueError):
        await _emit_denied(sid)
        return
    room = venue_ops_room(event_id)
    await sio.enter_room(sid, room)
    logger.info(f"sid={sid} joined Venue Ops room: {room}")
    await sio.emit("room_joined", {"room": room}, to=sid)


@sio.event
@_limited_control
async def ping(sid: str, data: dict) -> dict:
    """
    Heartbeat handler. Client sends { ts: <unix_ms> }.
    Server echoes back with server_ts for latency measurement.
    """
    import time
    return {"status": "pong", "server_ts": int(time.time() * 1000)}


# ── Presentation control events (Moderator → Room App) ────────

@sio.event
@_limited_control
async def moderator_command(sid: str, data: dict) -> None:
    """
    Moderator App sends a presentation control command.

    Expected data:
        {
            "room_id":  "<uuid>",
            "command":  "next_slide" | "prev_slide" | "goto_slide" |
                        "start_presentation" | "stop_presentation" |
                        "switch_speaker",
            "payload":  { ... }    # command-specific
        }

    Broadcasts to all devices in the room channel.
    """
    room_id = data.get("room_id")
    command = data.get("command")
    payload = data.get("payload", {})

    if not room_id or not command:
        await sio.emit("error", {"message": "room_id and command required"}, to=sid)
        return

    ALLOWED_COMMANDS = {
        "next_slide", "prev_slide", "goto_slide",
        "start_presentation", "stop_presentation",
        "switch_speaker", "blank_screen", "show_screen",
    }
    if command not in ALLOWED_COMMANDS:
        await sio.emit("error", {"message": f"Unknown command: {command}"}, to=sid)
        return

    try:
        parsed_room_id = uuid.UUID(str(room_id))
        principal = await _principal_for(sid)
        async with AsyncSessionLocal() as db:
            target = await authorize_room(db, principal, parsed_room_id)
            await authorize_moderator_command(db, principal, target.event_id)
    except (RealtimeAuthError, TypeError, ValueError):
        await _emit_denied(sid)
        return

    room = room_room(parsed_room_id)
    event_payload = {"command": command, "payload": payload, "from_sid": sid}
    await sio.emit("presentation_command", event_payload, room=room, skip_sid=sid)
    logger.debug(f"Moderator command '{command}' → room {room}")


@sio.event
@_limited_control
async def station_heartbeat(sid: str, data: dict) -> dict:
    """
    SRR Station App sends periodic heartbeats so the backend
    can detect offline stations.

    Expected data: { "station_id": "<uuid>", "status": "idle" | ... }

    In production, update last_heartbeat_at in the DB here.
    Returns ack to the station.
    """
    try:
        principal = await _principal_for(sid)
        if principal.kind != "device":
            raise RealtimeAuthError("Device authentication is required.")
    except RealtimeAuthError:
        return {"ack": False, "code": "PERMISSION_DENIED"}
    station_id = data.get("station_id")
    status = data.get("status", "idle")
    logger.debug(f"Heartbeat from station {station_id}: {status}")
    return {"ack": True, "station_id": station_id}
