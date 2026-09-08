import json
import asyncio
import socketio
import redis.asyncio as redis
from http.cookies import SimpleCookie
from typing import Dict, List
from fastapi import APIRouter

from app.config import settings
from loguru import logger
from socketio.exceptions import ConnectionRefusedError

# We keep the router for dependency injection compatibility, but it will be empty
router = APIRouter(prefix="/ws", tags=["websocket"])

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*" if settings.DEPLOYMENT_PROFILE == "local" else [origin.strip() for origin in settings.CORS_ORIGINS.split(",") if origin.strip()],
    logger=False,
    engineio_logger=False,
)

class ConnectionManager:
    def __init__(self, redis_url: str | None = None):
        configured_url = settings.REDIS_URL if redis_url is None else redis_url
        self.redis = redis.from_url(configured_url, decode_responses=True) if configured_url else None
        self.pubsub = self.redis.pubsub() if self.redis else None
    
    async def publish(self, channel: str, message: dict):
        """Publish a message to Redis so all instances get it"""
        if self.redis:
            await self.redis.publish(channel, json.dumps(message))
            return
        event_name = message.get("event")
        if event_name:
            await sio.emit(event_name, message, room=message.get("room"))

    async def _redis_listener(self):
        """Listens to Redis Pub/Sub and routes messages to local WebSockets"""
        try:
            if not self.pubsub:
                return
            await self.pubsub.subscribe("venue_events")
            async for message in self.pubsub.listen():
                if message["type"] == "message":
                    data = json.loads(message["data"])
                    
                    event_name = data.get("event")
                    room = data.get("room")
                    if event_name:
                        # Broadcast via Socket.IO
                        if room:
                            await sio.emit(event_name, data, room=room)
                        else:
                            await sio.emit(event_name, data)
        except (TimeoutError, OSError, redis.ConnectionError) as e:
            logger.warning(f"Redis listener unavailable; realtime pub/sub is disabled for this local run: {e}")
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error(f"Redis listener error: {e}")

    async def close(self):
        """Cleanly close PubSub subscriptions and Redis connection pool before event loop terminates"""
        try:
            if self.pubsub:
                await self.pubsub.unsubscribe()
                await self.pubsub.close()
        except Exception:
            pass
        try:
            if self.redis:
                await self.redis.aclose()
        except Exception:
            pass

manager = ConnectionManager()

# Background task to start the redis listener
async def start_redis_listener():
    await manager._redis_listener()

import subprocess
import re
from sqlalchemy import select

@sio.event
async def connect(sid: str, environ: dict, auth: dict | None = None) -> bool:
    """
    Called when a client connects.
    """
    logger.info(f"WebSocket client connected: sid={sid}")
    
    # Get client IP address
    client_ip = (environ.get("REMOTE_ADDR") or environ.get("HTTP_X_FORWARDED_FOR", "")).split(",")[0].strip()
    is_loopback = client_ip in ["127.0.0.1", "::1", "localhost", "::ffff:127.0.0.1", ""]
    
    # Resolve the credential before accepting a non-local connection. Browser
    # clients use the HttpOnly venue cookie; installed devices may provide a
    # short-lived access token in Socket.IO auth. Store only the validated
    # scope in the Socket.IO session.
    token = str((auth or {}).get("token") or (auth or {}).get("auth") or "").strip()
    if token.lower().startswith("bearer "):
        token = token[7:].strip()
    if not token:
        cookie = SimpleCookie()
        cookie.load(environ.get("HTTP_COOKIE", ""))
        token = cookie.get("venue_access_token").value if cookie.get("venue_access_token") else ""

    scope: dict[str, str | None] = {"kind": "anonymous", "event_id": None, "room_id": None}
    if token:
        try:
            from app.database import AsyncSessionLocal
            from app.routers.auth import decode_token, validate_room_device_credential, resolve_srr_device_credential
            from app.models.venue_user import VenueUser
            import uuid

            async with AsyncSessionLocal() as db:
                try:
                    payload = decode_token(token, "access")
                    user = await db.get(VenueUser, uuid.UUID(str(payload.get("sub"))))
                    if user and user.is_active:
                        scope = {"kind": "user", "event_id": None, "room_id": None}
                except Exception:
                    try:
                        device_id = uuid.UUID(str((auth or {}).get("device_id")))
                        device = await validate_room_device_credential(db, device_id, token)
                        if device:
                            scope = {"kind": "room_device", "event_id": str(device.event_id), "room_id": str(device.room_id)}
                    except Exception:
                        station = await resolve_srr_device_credential(db, token)
                        if station:
                            scope = {"kind": "srr_station", "event_id": str(station.event_id), "room_id": None}
        except Exception as exc:
            logger.warning(f"Socket.IO credential validation failed: {exc}")

    if scope["kind"] == "anonymous" and not is_loopback:
        # Lookup MAC address using ARP for unauthenticated edge hardware
        mac_address = None
        try:
            result = subprocess.run(["arp", "-a"], capture_output=True, text=True)
            for line in result.stdout.splitlines():
                if client_ip in line:
                    mac_match = re.search(r'\b([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})\b', line)
                    if mac_match:
                        mac_address = mac_match.group(0).replace('-', ':').lower()
                        break
        except Exception as e:
            logger.error(f"Error checking ARP table for IP {client_ip}: {e}")
            
        if mac_address:
            try:
                from app.database import AsyncSessionLocal
                from app.models.room_device import RoomDevice
                async with AsyncSessionLocal() as db:
                    result = await db.execute(select(RoomDevice).where(RoomDevice.mac_address == mac_address))
                    device = result.scalar_one_or_none()
                    if not device:
                        logger.warning(f"Connection rejected: MAC address {mac_address} not authorized.")
                        raise ConnectionRefusedError(f"Device {mac_address} not authorized.")
            except ConnectionRefusedError:
                raise
            except Exception as e:
                logger.error(f"Error checking database for MAC {mac_address}: {e}")

        # MAC discovery is diagnostic only; it is not an authentication
        # mechanism. Production/staging clients must present a credential.
        if settings.DEPLOYMENT_PROFILE != "local":
            raise ConnectionRefusedError("A valid Venue Server credential is required.")

    await sio.save_session(sid, scope)
    
    # We emit a 'connected' ack so the client knows the connection succeeded.
    await sio.emit("connected", {"sid": sid, "status": "ok"}, to=sid)
    return True

@sio.event
async def disconnect(sid: str) -> None:
    logger.info(f"WebSocket client disconnected: sid={sid}")

@sio.event
async def join_event_room(sid: str, data: dict) -> None:
    """
    Client requests to join an event room.
    Expected data: { "event_id": "<uuid>" }
    """
    event_id = data.get("event_id")
    if not event_id:
        await sio.emit("error", {"message": "event_id required"}, to=sid)
        return

    try:
        scope = await sio.get_session(sid)
    except Exception:
        scope = {"kind": "anonymous", "event_id": None}
    if settings.DEPLOYMENT_PROFILE != "local" and scope.get("kind") == "anonymous":
        await sio.emit("error", {"message": "A valid Venue Server credential is required"}, to=sid)
        return
    if scope.get("event_id") and scope["event_id"] != str(event_id):
        await sio.emit("error", {"message": "Credential is not scoped to this event"}, to=sid)
        return

    room = f"event_{event_id}"
    await sio.enter_room(sid, room)
    logger.info(f"sid={sid} joined event room: {room}")
    await sio.emit("room_joined", {"room": room}, to=sid)

@sio.event
async def ping(sid: str, data: dict) -> dict:
    import time
    return {"status": "pong", "server_ts": int(time.time() * 1000)}

# Export helper functions for the rest of the app
async def broadcast_session_lock(session_id: str):
    await manager.publish("venue_events", {
        "event": "session_locked",
        "session_id": session_id,
        "action": "preload_snapshot"
    })

async def broadcast_queue_update(event_id: str):
    await manager.publish("venue_events", {
        "event": "queue_updated",
        "room": f"event_{event_id}",
        "event_id": event_id
    })
