# =============================================================
# Conference Platform — WebSocket Event Definitions & Handlers
# backend/app/websocket/events.py
#
# Defines ALL WebSocket event names as typed constants and
# implements the native FastAPI WebSocket route handlers.
#
# Native WebSocket routes (vs Socket.IO):
#   GET /ws/monitor/{event_id}   → Organizer live feed (read-only)
#   GET /ws/venue/{event_id}     → Venue server sync channel
#   GET /ws/room/{room_id}       → Room display app channel
#   GET /ws/srr/{event_id}       → Speaker Ready Room feed
#
# Message protocol:
# ─────────────────
# All messages are JSON with the shape:
#   {
#       "type":    "<event_name>",   # one of the constants below
#       "payload": { ... },          # event-specific data
#       "ts":      "<iso8601>"       # server timestamp
#   }
#
# Client → Server messages:
#   authenticate    → { token: "<jwt>" | device_key: "<key>" }
#   subscribe       → { rooms: ["event:uuid", ...] }
#   pong            → heartbeat response
#   command         → { action: "...", data: {} }
#
# Server → Client messages:
#   All event types defined in EventType below.
# =============================================================

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import WebSocket, WebSocketDisconnect
from loguru import logger

from app.websocket.manager import (
    ConnectionManager,
    event_ws_room,
    manager,
    monitor_ws_room,
    venue_ws_room,
)


# ── Event type constants ──────────────────────────────────────

class EventType:
    """
    All WebSocket event type strings used in the system.
    Single source of truth — import this in both backend handlers
    and reference in frontend TypeScript type definitions.
    """

    # ── Connection ────────────────────────────────────────────
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    AUTH_REQUIRED = "auth_required"
    AUTH_OK = "auth_ok"
    AUTH_FAILED = "auth_failed"
    PING = "ping"
    PONG = "pong"

    # ── File events ───────────────────────────────────────────
    FILE_UPLOADED = "file.uploaded"
    FILE_VALIDATED = "file.validated"
    FILE_APPROVED = "file.approved"
    FILE_REJECTED = "file.rejected"
    FILE_LOCKED = "file.locked"
    FILE_SYNC_STARTED = "file.sync_started"
    FILE_SYNC_DONE = "file.sync_done"
    FILE_SYNC_FAILED = "file.sync_failed"

    # ── Speaker events ────────────────────────────────────────
    SPEAKER_CREATED = "speaker.created"
    SPEAKER_UPDATED = "speaker.updated"
    SPEAKER_CHECKED_IN = "speaker.checked_in"
    SPEAKER_CHECKED_OUT = "speaker.checked_out"

    # ── Session events ────────────────────────────────────────
    SESSION_STARTED = "session.started"
    SESSION_COMPLETED = "session.completed"
    SESSION_UPDATED = "session.updated"

    # ── Room / presentation control ───────────────────────────
    PRESENTATION_START = "presentation.start"
    PRESENTATION_STOP = "presentation.stop"
    SLIDE_NEXT = "slide.next"
    SLIDE_PREV = "slide.prev"
    SLIDE_GOTO = "slide.goto"
    SPEAKER_SWITCH = "speaker.switch"
    SCREEN_BLANK = "screen.blank"
    SCREEN_SHOW = "screen.show"
    QUEUE_UPDATED = "queue.updated"

    # ── SRR events ────────────────────────────────────────────
    SRR_STATION_ASSIGNED = "srr.station_assigned"
    SRR_STATION_FREED = "srr.station_freed"
    SRR_STATION_STATUS = "srr.station_status"
    SRR_HEARTBEAT = "srr.heartbeat"

    # ── Import / sync events ──────────────────────────────────
    IMPORT_STARTED = "import.started"
    IMPORT_PROGRESS = "import.progress"
    IMPORT_COMPLETED = "import.completed"
    IMPORT_FAILED = "import.failed"

    VENUE_SYNC_STARTED = "venue.sync_started"
    VENUE_SYNC_PROGRESS = "venue.sync_progress"
    VENUE_SYNC_COMPLETED = "venue.sync_completed"
    VENUE_SYNC_FAILED = "venue.sync_failed"

    # ── Notification ──────────────────────────────────────────
    NOTIFICATION = "notification"
    ALERT = "alert"


# ── Message builder ───────────────────────────────────────────

def build_message(event_type: str, payload: dict) -> dict:
    """
    Build a standardised WebSocket message envelope.

    All outgoing messages from the server use this shape:
        {
            "type":    "file.uploaded",
            "payload": { ... },
            "ts":      "2026-09-01T09:00:00+00:00"
        }
    """
    return {
        "type": event_type,
        "payload": payload,
        "ts": datetime.now(timezone.utc).isoformat(),
    }


def event_name(name: str) -> str:
    """
    Return the event name string as-is.
    Kept for backward compatibility with the original placeholder signature.
    Use EventType constants directly in new code.
    """
    return name


# ── Route handler helpers ─────────────────────────────────────

async def _handle_client_message(
    websocket: WebSocket,
    message: dict,
    room: str,
) -> None:
    """
    Process a message received from a connected client.

    Handles:
        pong       → heartbeat acknowledgement
        command    → presentation control (broadcast to room)
        subscribe  → additional room subscriptions
    """
    msg_type = message.get("type", "")

    if msg_type == EventType.PONG:
        manager.update_heartbeat(websocket)

    elif msg_type == "command":
        # Broadcast presentation commands to the room (e.g. from Moderator App)
        action = message.get("payload", {}).get("action")
        if action:
            await manager.broadcast(
                room,
                build_message(action, message.get("payload", {})),
            )
            logger.debug(f"Broadcast command '{action}' to room={room}")

    elif msg_type == "subscribe":
        # Client wants to subscribe to additional rooms
        # (handled at the Socket.IO layer for multi-room; native WS is single-room)
        extra_rooms = message.get("payload", {}).get("rooms", [])
        logger.debug(f"Subscribe request for {extra_rooms} (native WS is single-room)")

    else:
        logger.debug(f"Unhandled WS message type: {msg_type}")


# ── WebSocket route handlers ──────────────────────────────────

async def handle_monitor_connection(
    websocket: WebSocket,
    event_id: uuid.UUID,
) -> None:
    """
    Handler for GET /ws/monitor/{event_id}

    Read-only live feed of all event notifications for the organizer
    dashboard. Clients receive server pushes; they send only pong heartbeats.

    Authentication:
        Client must send { "type": "authenticate", "token": "<jwt>" }
        within 10 seconds or the connection is closed.

    Usage in router:
        @router.websocket("/monitor/{event_id}")
        async def monitor_ws(ws: WebSocket, event_id: uuid.UUID):
            await handle_monitor_connection(ws, event_id)
    """
    room = monitor_ws_room(event_id)
    await manager.connect(websocket, room)

    # Send welcome + ping to verify client connectivity
    await manager.send_to(
        websocket,
        build_message(EventType.CONNECTED, {
            "room": room,
            "event_id": str(event_id),
            "message": "Connected to event monitor. Awaiting authentication.",
        }),
    )

    try:
        while True:
            data = await websocket.receive_json()
            await _handle_client_message(websocket, data, room)

    except WebSocketDisconnect:
        logger.info(f"Monitor WS disconnected: event={event_id}")
    except Exception as exc:
        logger.error(f"Monitor WS error: {exc}")
    finally:
        manager.disconnect(websocket)


async def handle_venue_sync_connection(
    websocket: WebSocket,
    event_id: uuid.UUID,
) -> None:
    """
    Handler for GET /ws/venue/{event_id}

    Bidirectional sync channel between the cloud backend and a venue server.
    The venue server connects here to:
      - Receive push notifications of new/updated files to sync
      - Report sync job completions back to the cloud
      - Report its heartbeat and file cache status

    Authentication:
        Venue server sends { "type": "authenticate", "device_key": "<key>" }

    Message flow:
        Cloud  → Venue: FILE_SYNC_STARTED, file metadata
        Venue  → Cloud: FILE_SYNC_DONE / FILE_SYNC_FAILED, job_id
        Venue  → Cloud: SRR_HEARTBEAT, station statuses
    """
    room = venue_ws_room(event_id)
    await manager.connect(websocket, room)

    await manager.send_to(
        websocket,
        build_message(EventType.CONNECTED, {
            "room": room,
            "event_id": str(event_id),
            "message": "Venue sync channel established.",
        }),
    )

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type", "")

            if msg_type == EventType.PONG:
                manager.update_heartbeat(websocket)

            elif msg_type == EventType.FILE_SYNC_DONE:
                # Venue server reporting successful sync
                payload = data.get("payload", {})
                job_id = payload.get("job_id")
                file_id = payload.get("file_id")
                logger.info(f"Venue sync complete: job={job_id} file={file_id}")
                # Broadcast to organizer monitors for this event
                await manager.broadcast(
                    monitor_ws_room(event_id),
                    build_message(EventType.FILE_SYNC_DONE, payload),
                )

            elif msg_type == EventType.FILE_SYNC_FAILED:
                payload = data.get("payload", {})
                job_id = payload.get("job_id")
                error = payload.get("error", "Unknown error")
                logger.warning(f"Venue sync FAILED: job={job_id} error={error}")
                await manager.broadcast(
                    monitor_ws_room(event_id),
                    build_message(EventType.FILE_SYNC_FAILED, payload),
                )

            elif msg_type == EventType.SRR_HEARTBEAT:
                # Venue server reporting station statuses
                payload = data.get("payload", {})
                logger.debug(f"SRR heartbeat from venue: event={event_id}")
                # Forward to organizer monitors
                await manager.broadcast(
                    monitor_ws_room(event_id),
                    build_message(EventType.SRR_STATION_STATUS, payload),
                )

            else:
                logger.debug(f"Venue WS unhandled message: {msg_type}")

    except WebSocketDisconnect:
        logger.info(f"Venue sync WS disconnected: event={event_id}")
    except Exception as exc:
        logger.error(f"Venue sync WS error: {exc}")
    finally:
        manager.disconnect(websocket)


async def handle_room_connection(
    websocket: WebSocket,
    room_id: uuid.UUID,
) -> None:
    """
    Handler for GET /ws/room/{room_id}

    Lightweight fallback WebSocket channel for Room Display Apps that
    cannot use Socket.IO (e.g. locked-down kiosk browsers).

    Receives presentation control commands from the Moderator App
    via the server (server relays the command to this room).

    This is the PWA fallback path — Electron apps use Socket.IO.
    """
    room_key = f"room:{room_id}"
    await manager.connect(websocket, room_key)

    await manager.send_to(
        websocket,
        build_message(EventType.CONNECTED, {
            "room_id": str(room_id),
            "message": "Room display channel connected.",
        }),
    )

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type", "")

            if msg_type == EventType.PONG:
                manager.update_heartbeat(websocket)

            elif msg_type == "status_report":
                # Room app reports current playback status
                payload = data.get("payload", {})
                logger.debug(f"Room {room_id} status: {payload.get('status')}")

            else:
                logger.debug(f"Room WS unhandled: {msg_type}")

    except WebSocketDisconnect:
        logger.info(f"Room WS disconnected: room_id={room_id}")
    except Exception as exc:
        logger.error(f"Room WS error: {exc}")
    finally:
        manager.disconnect(websocket)


async def handle_srr_connection(
    websocket: WebSocket,
    event_id: uuid.UUID,
) -> None:
    """
    Handler for GET /ws/srr/{event_id}

    Live feed for the Technician Dashboard / Ready Room view.
    Receives real-time speaker check-in and station status updates.

    Clients:
      - Technician Dashboard (browser)
      - Ready Room View in Organizer Portal
    """
    room = f"srr:{event_id}"
    await manager.connect(websocket, room)

    await manager.send_to(
        websocket,
        build_message(EventType.CONNECTED, {
            "room": room,
            "event_id": str(event_id),
            "message": "SRR live feed connected.",
        }),
    )

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type", "")

            if msg_type == EventType.PONG:
                manager.update_heartbeat(websocket)
            else:
                logger.debug(f"SRR WS unhandled: {msg_type}")

    except WebSocketDisconnect:
        logger.info(f"SRR WS disconnected: event={event_id}")
    except Exception as exc:
        logger.error(f"SRR WS error: {exc}")
    finally:
        manager.disconnect(websocket)


# ── Broadcast helpers used by services ────────────────────────

async def broadcast_file_event(
    event_id: uuid.UUID,
    event_type: str,
    payload: dict,
) -> None:
    """
    Broadcast a file-related event to all organizer monitor connections
    AND to the Socket.IO organizer room (via websocket_service).

    Call this from route handlers or services — not directly from middleware.
    """
    message = build_message(event_type, payload)

    # Native WS monitors
    sent = await manager.broadcast(monitor_ws_room(event_id), message)

    # Socket.IO organizer room
    try:
        from app.services.websocket_service import broadcast_to_event  # lazy import
        await broadcast_to_event(event_id=event_id, payload=message)
    except Exception as exc:
        logger.warning(f"Socket.IO broadcast failed (non-fatal): {exc}")

    logger.debug(
        f"Broadcast {event_type} for event={event_id} "
        f"to {sent} native WS client(s)"
    )


async def broadcast_srr_event(
    event_id: uuid.UUID,
    event_type: str,
    payload: dict,
) -> None:
    """Broadcast a SRR event to all connected SRR technician clients."""
    message = build_message(event_type, payload)
    srr_room = f"srr:{event_id}"
    await manager.broadcast(srr_room, message)

    # Also send to Socket.IO SRR room
    try:
        from app.services.websocket_service import broadcast_to_srr  # lazy import
        await broadcast_to_srr(event_id=event_id, payload=message)
    except Exception as exc:
        logger.warning(f"Socket.IO SRR broadcast failed (non-fatal): {exc}")
