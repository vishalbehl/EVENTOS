import json
import asyncio
from typing import Dict, List
import redis.asyncio as redis
from fastapi import WebSocket, WebSocketDisconnect, APIRouter, Depends

from app.config import settings

router = APIRouter(prefix="/ws", tags=["websocket"])

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
        # Connect to the local Redis instance
        self.redis = redis.from_url(settings.REDIS_URL, decode_responses=True)
        self.pubsub = self.redis.pubsub()
    
    async def connect(self, websocket: WebSocket, room: str = "global"):
        await websocket.accept()
        if room not in self.active_connections:
            self.active_connections[room] = []
        self.active_connections[room].append(websocket)
        
    def disconnect(self, websocket: WebSocket, room: str = "global"):
        if room in self.active_connections:
            self.active_connections[room].remove(websocket)

    async def broadcast_local(self, message: dict, room: str = "global"):
        """Broadcasts to websockets connected directly to this server instance"""
        if room in self.active_connections:
            disconnected = []
            for connection in self.active_connections[room]:
                try:
                    await connection.send_json(message)
                except Exception:
                    disconnected.append(connection)
            for d in disconnected:
                self.disconnect(d, room)

    async def publish(self, channel: str, message: dict):
        """Publish a message to Redis so all instances get it"""
        await self.redis.publish(channel, json.dumps(message))

    async def _redis_listener(self):
        """Listens to Redis Pub/Sub and routes messages to local WebSockets"""
        await self.pubsub.subscribe("venue_events")
        try:
            async for message in self.pubsub.listen():
                if message["type"] == "message":
                    data = json.loads(message["data"])
                    await self.broadcast_local(data)
        except Exception as e:
            print(f"Redis listener error: {e}")

manager = ConnectionManager()

# Background task to start the redis listener
async def start_redis_listener():
    await manager._redis_listener()

@router.websocket("/venue")
async def venue_websocket_endpoint(websocket: WebSocket):
    """
    The main WebSocket endpoint for venue apps (Technician, Display, Kiosk).
    Expects a JSON message with `{ "auth_key": "..." }` as the first message to authenticate.
    """
    await manager.connect(websocket)
    try:
        # Require auth packet within 5 seconds
        auth_message = await asyncio.wait_for(websocket.receive_json(), timeout=5.0)
        if auth_message.get("auth_key") != settings.VENUE_AUTH_KEY:
            await websocket.close(code=1008, reason="Invalid Auth Key")
            return
            
        await websocket.send_json({"event": "connected", "message": "Authenticated"})
        
        while True:
            data = await websocket.receive_text()
            # Handle incoming heartbeats from devices (Phase 4)
            if data == "ping":
                await websocket.send_text("pong")
                
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)
        await websocket.close()

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
        "event_id": event_id
    })
