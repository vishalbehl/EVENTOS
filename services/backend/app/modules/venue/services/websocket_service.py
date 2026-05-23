# =============================================================
# Conference Platform — WebSocket Service
# backend/app/services/websocket_service.py
#
# Real-time bidirectional communication via Socket.IO.
#
# Architecture:
#   - Single global Socket.IO server (AsyncServer)
#   - Rooms are keyed by event_id: "event:{event_id}"
#   - Organizer portal connects on login and joins its event room
#   - Station, Room, and Moderator apps join on device auth
#
# Room membership:
#   - Organizers join "event:{event_id}" for all organizer notifications
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
from typing import Any

import socketio
from loguru import logger

from app.config import settings


# ── Socket.IO server ──────────────────────────────────────────
# AsyncServer is compatible with FastAPI / ASGI via the ASGIApp wrapper.
# cors_allowed_origins="*" — tighten in production to your domain list.

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*" if settings.environment == "development" else [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://0.0.0.0:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:3002",
        "http://127.0.0.1:3002",
        "http://localhost:3003",
        "http://127.0.0.1:3003",
        "http://localhost:3004",
        "http://127.0.0.1:3004",
        "http://localhost:3005",
        "http://127.0.0.1:3005",
    ],
    logger=False,
    engineio_logger=False,
    ping_interval=settings.WS_HEARTBEAT_INTERVAL,
    ping_timeout=20,
)

# ASGI app wraps the Socket.IO server; mounted in main.py at /socket.io
socket_app = socketio.ASGIApp(sio, socketio_path="")


# ── Room name helpers ─────────────────────────────────────────

def event_room(event_id: uuid.UUID | str) -> str:
    """Socket.IO room for all organizers of an event."""
    return f"event:{event_id}"


def room_room(room_id: uuid.UUID | str) -> str:
    """Socket.IO room for devices in a specific conference room."""
    return f"room:{room_id}"


def srr_room(event_id: uuid.UUID | str) -> str:
    """Socket.IO room for Speaker Ready Room technicians."""
    return f"srr:{event_id}"


# ── Broadcast helpers ─────────────────────────────────────────

async def broadcast_to_event(
    event_id: uuid.UUID,
    payload: dict,
    event_name: str = "notification",
) -> None:
    """
    Emit an event to all clients in the event's organizer room.

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
async def connect(sid: str, environ: dict, auth: dict | None = None) -> None:
    """
    Called when a client connects.

    Client should pass auth data:
        { token: "<jwt>" }             for organizer portal
        { device_key: "<key>" }        for Electron apps
        { upload_token: "<token>" }    for speaker portal (SRR)

    We emit a 'connected' ack so the client knows the connection succeeded.
    In production, validate the token here and disconnect if invalid.
    """
    logger.info(f"WebSocket client connected: sid={sid}")
    await sio.emit("connected", {"sid": sid, "status": "ok"}, to=sid)


@sio.event
async def disconnect(sid: str) -> None:
    """Called when a client disconnects (intentional or network loss)."""
    logger.info(f"WebSocket client disconnected: sid={sid}")


@sio.event
async def join_event_room(sid: str, data: dict) -> None:
    """
    Client requests to join an event room.

    Expected data: { "event_id": "<uuid>" }

    In production: verify the client's JWT has access to this event_id.
    """
    event_id = data.get("event_id")
    if not event_id:
        await sio.emit("error", {"message": "event_id required"}, to=sid)
        return

    room = event_room(event_id)
    await sio.enter_room(sid, room)
    logger.info(f"sid={sid} joined event room: {room}")
    await sio.emit("room_joined", {"room": room}, to=sid)


@sio.event
async def join_room_room(sid: str, data: dict) -> None:
    """
    Client (Room App / Moderator) requests to join a conference room channel.
    Expected data: { "room_id": "<uuid>" }
    """
    room_id = data.get("room_id")
    if not room_id:
        await sio.emit("error", {"message": "room_id required"}, to=sid)
        return

    room = room_room(room_id)
    await sio.enter_room(sid, room)
    logger.info(f"sid={sid} joined conference room: {room}")
    await sio.emit("room_joined", {"room": room}, to=sid)


@sio.event
async def join_srr_room(sid: str, data: dict) -> None:
    """
    SRR technician / Kiosk joins the ready-room channel.
    Expected data: { "event_id": "<uuid>" }
    """
    event_id = data.get("event_id")
    if not event_id:
        await sio.emit("error", {"message": "event_id required"}, to=sid)
        return

    room = srr_room(event_id)
    await sio.enter_room(sid, room)
    logger.info(f"sid={sid} joined SRR room: {room}")
    await sio.emit("room_joined", {"room": room}, to=sid)


@sio.event
async def ping(sid: str, data: dict) -> dict:
    """
    Heartbeat handler. Client sends { ts: <unix_ms> }.
    Server echoes back with server_ts for latency measurement.
    """
    import time
    return {"status": "pong", "server_ts": int(time.time() * 1000)}


# ── Presentation control events (Moderator → Room App) ────────

@sio.event
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

    room = room_room(room_id)
    event_payload = {"command": command, "payload": payload, "from_sid": sid}
    await sio.emit("presentation_command", event_payload, room=room, skip_sid=sid)
    logger.debug(f"Moderator command '{command}' → room {room}")


@sio.event
async def station_heartbeat(sid: str, data: dict) -> dict:
    """
    SRR Station App sends periodic heartbeats so the backend
    can detect offline stations.

    Expected data: { "station_id": "<uuid>", "status": "idle" | ... }

    In production, update last_heartbeat_at in the DB here.
    Returns ack to the station.
    """
    station_id = data.get("station_id")
    status = data.get("status", "idle")
    logger.debug(f"Heartbeat from station {station_id}: {status}")
    return {"ack": True, "station_id": station_id}
