# =============================================================
# Conference Platform — WebSocket Connection Manager
# backend/app/websocket/manager.py
#
# Manages the lifecycle of all active WebSocket connections and
# provides the room-based broadcast infrastructure.
#
# Architecture note:
# ─────────────────
# The system uses TWO WebSocket layers:
#
#   1. Socket.IO (services/websocket_service.py)
#      → Full-featured: rooms, namespaces, reconnect, binary.
#      → Used by Command Center, Room Apps, Moderator App.
#      → Mounted at /ws.
#
#   2. Native FastAPI WebSockets (this module)
#      → Lightweight: used for venue-server-to-cloud sync channels
#        and internal monitoring endpoints.
#      → Used by: /ws/monitor/{event_id} (live admin dashboard feed)
#                 /ws/venue-sync (venue server registration)
#
# ConnectionManager is a singleton that holds all native WS
# connections grouped by "room" key (e.g. "event:{uuid}").
# =============================================================

from __future__ import annotations

import asyncio
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Optional

from fastapi import WebSocket, WebSocketDisconnect
from loguru import logger


class ConnectionManager:
    """
    Thread-safe* async WebSocket connection manager.

    (*) Python's asyncio event loop is single-threaded, so dict
    operations here are safe within the async context.

    Rooms:
        "event:{event_id}"      → organizer dashboard live feed
        "venue:{event_id}"      → venue server sync channel
        "monitor:{event_id}"    → read-only monitoring websocket

    Features:
        - connect / disconnect lifecycle
        - room-based broadcast (emit to all in a room)
        - direct unicast to a single connection
        - heartbeat tracking per connection
        - graceful disconnect on send failure
    """

    def __init__(self) -> None:
        # room_key → set of active WebSocket connections
        self._rooms: dict[str, set[WebSocket]] = defaultdict(set)
        # ws → room_key (reverse lookup for disconnect cleanup)
        self._ws_room: dict[WebSocket, str] = {}
        # ws → last heartbeat timestamp
        self._heartbeats: dict[WebSocket, datetime] = {}

    # ── Connection lifecycle ──────────────────────────────────

    async def connect(self, websocket: WebSocket, room: str) -> None:
        """
        Accept a WebSocket connection and add it to a room.

        Args:
            websocket: The FastAPI WebSocket instance
            room:      Room key string (e.g. "event:uuid")
        """
        await websocket.accept()
        self.register(websocket, room)

    def register(self, websocket: WebSocket, room: str) -> None:
        """Register an already accepted and authenticated connection."""
        self._rooms[room].add(websocket)
        self._ws_room[websocket] = room
        self._heartbeats[websocket] = datetime.now(timezone.utc)
        logger.info(
            f"WebSocket connected: room={room} "
            f"total_in_room={len(self._rooms[room])}"
        )

    def disconnect(self, websocket: WebSocket) -> None:
        """
        Remove a WebSocket from its room on disconnect.
        Safe to call even if the connection was never registered.
        """
        room = self._ws_room.pop(websocket, None)
        self._heartbeats.pop(websocket, None)

        if room:
            self._rooms[room].discard(websocket)
            # Clean up empty rooms to prevent memory leaks
            if not self._rooms[room]:
                del self._rooms[room]
            logger.info(
                f"WebSocket disconnected: room={room} "
                f"remaining={len(self._rooms.get(room, set()))}"
            )

    # ── Broadcasting ──────────────────────────────────────────

    async def broadcast(self, room: str, payload: dict) -> int:
        """
        Send a JSON payload to all connections in a room.

        Dead connections are automatically removed on send failure.
        Returns the number of successful sends.
        """
        connections = list(self._rooms.get(room, set()))
        if not connections:
            return 0

        dead: list[WebSocket] = []
        sent = 0

        for ws in connections:
            try:
                await ws.send_json(payload)
                sent += 1
            except Exception as exc:
                logger.debug(f"WebSocket send failed (removing dead connection): {exc}")
                dead.append(ws)

        for ws in dead:
            self.disconnect(ws)

        return sent

    async def broadcast_to_all(self, payload: dict) -> int:
        """Broadcast to every connected client across all rooms."""
        total = 0
        for room in list(self._rooms.keys()):
            total += await self.broadcast(room, payload)
        return total

    async def send_to(self, websocket: WebSocket, payload: dict) -> bool:
        """
        Send a payload to a single specific WebSocket connection.
        Returns True on success, False if send failed.
        """
        try:
            await websocket.send_json(payload)
            return True
        except Exception as exc:
            logger.debug(f"Unicast send failed: {exc}")
            self.disconnect(websocket)
            return False

    async def send_text_to(self, websocket: WebSocket, text: str) -> bool:
        """Send raw text to a single WebSocket."""
        try:
            await websocket.send_text(text)
            return True
        except Exception:
            self.disconnect(websocket)
            return False

    # ── Heartbeat ─────────────────────────────────────────────

    def update_heartbeat(self, websocket: WebSocket) -> None:
        """Record a heartbeat timestamp for a connection."""
        self._heartbeats[websocket] = datetime.now(timezone.utc)

    async def ping_all(self, room: Optional[str] = None) -> None:
        """
        Send a ping to all connections (or all in a room).
        Used by a periodic background task to detect stale connections.
        """
        rooms = [room] if room else list(self._rooms.keys())
        for r in rooms:
            await self.broadcast(r, {
                "type": "ping",
                "ts": datetime.now(timezone.utc).isoformat(),
            })

    # ── Introspection ─────────────────────────────────────────

    def get_room_count(self, room: str) -> int:
        """Return the number of active connections in a room."""
        return len(self._rooms.get(room, set()))

    def get_all_rooms(self) -> dict[str, int]:
        """Return a snapshot of {room: connection_count} for all rooms."""
        return {room: len(conns) for room, conns in self._rooms.items()}

    def total_connections(self) -> int:
        """Return total active native WebSocket connections."""
        return len(self._ws_room)


# ── Module-level singleton ────────────────────────────────────
# Import and use this instance everywhere — do not instantiate
# ConnectionManager directly in route handlers.

manager = ConnectionManager()


# ── Room key builders (shared with websocket/events.py) ───────

def event_ws_room(event_id: uuid.UUID | str) -> str:
    """Room key for organizer dashboard live feed."""
    return f"event:{event_id}"


def venue_ws_room(event_id: uuid.UUID | str) -> str:
    """Room key for venue server sync channel."""
    return f"venue:{event_id}"


def monitor_ws_room(event_id: uuid.UUID | str) -> str:
    """Room key for read-only monitoring websocket."""
    return f"monitor:{event_id}"


def user_ws_room(user_id: uuid.UUID | str) -> str:
    """Room key for individual user updates (e.g. permissions)."""
    return f"user:{user_id}"
