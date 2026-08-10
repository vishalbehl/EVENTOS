import json
import asyncio
import socketio
import redis.asyncio as redis
from typing import Dict, List
from fastapi import APIRouter

from app.config import settings
from loguru import logger
from socketio.exceptions import ConnectionRefusedError

# We keep the router for dependency injection compatibility, but it will be empty
router = APIRouter(prefix="/ws", tags=["websocket"])

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    logger=False,
    engineio_logger=False,
)

class ConnectionManager:
    def __init__(self):
        # Connect to the local Redis instance
        self.redis = redis.from_url(settings.REDIS_URL, decode_responses=True)
        self.pubsub = self.redis.pubsub()
    
    async def publish(self, channel: str, message: dict):
        """Publish a message to Redis so all instances get it"""
        await self.redis.publish(channel, json.dumps(message))

    async def _redis_listener(self):
        """Listens to Redis Pub/Sub and routes messages to local WebSockets"""
        try:
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
    
    # Authenticated frontend users and local clients are always allowed
    has_auth_token = bool(auth and (auth.get("token") or auth.get("auth")))
    if not is_loopback and not has_auth_token:
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
