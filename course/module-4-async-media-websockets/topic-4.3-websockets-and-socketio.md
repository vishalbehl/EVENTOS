# Module 4 - Topic 4.3: Real-Time Socket.IO Gateways & Native WebSockets

## 1. Introduction & Learning Objectives
Welcome to **Topic 4.3**. In this chapter, you will master real-time bidirectional communication using **Socket.IO** servers and native **WebSockets** ([services/backend/app/modules/notifications](file:///d:/DEV/conf-platform/services/backend/app/modules/notifications)).

### Learning Outcomes:
- Build Socket.IO event servers supporting namespace partitioning and room broadcasts.
- Implement native WebSocket gateways for streaming live room metrics.
- Connect frontend React components to real-time event notifications.

---

## 2. Socket.IO Server Implementation

In EventOS, real-time file upload status and approval alerts are delivered via Socket.IO (`python-socketio`):

```python
import socketio

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")
socket_app = socketio.ASGIApp(sio, socketio_path="/socket.io")

@sio.event
async def connect(sid, environ):
    print(f"Client connected: {sid}")

@sio.event
async def join_event_room(sid, data):
    event_id = data.get("event_id")
    sio.enter_room(sid, f"event_{event_id}")
    await sio.emit("room_joined", {"room": f"event_{event_id}"}, to=sid)

async def notify_file_approval(event_id: str, file_info: dict):
    # Broadcast to all clients in event_{event_id} room
    await sio.emit("file.approved", file_info, room=f"event_{event_id}")
```

---

## 3. Native WebSockets for Live Metric Dashboards

For low-overhead metric telemetry ([services/backend/CLAUDE.md](file:///d:/DEV/conf-platform/CLAUDE.md#L121)):

```python
from fastapi import WebSocket, WebSocketDisconnect

@app.websocket("/ws/dashboard/{event_id}")
async def websocket_dashboard_endpoint(websocket: WebSocket, event_id: str):
    await websocket.accept()
    try:
        while True:
            # Stream live attendee metrics every 2 seconds
            metrics = {"event_id": event_id, "active_attendees": 1420, "checkins_per_min": 45}
            await websocket.send_json(metrics)
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        print(f"Client disconnected from dashboard: {event_id}")
```

---

## 4. Practical Exercise & Self-Assessment

### Hands-On Exercise:
1. Connect to `ws://127.0.0.1:8000/ws/dashboard/evt_123` using Postman or a browser WebSocket client.
2. Observe live JSON metric broadcasts streaming every 2 seconds.

---

## 5. Chapter Summary & Next Steps
You have completed Module 4! You have mastered Celery background queues, Redis task brokers, document parsing, FFmpeg video transcoding, Socket.IO rooms, and WebSockets. Next, move to **[Module 5 - Topic 5.1: Next.js 14 App Router](../module-5-frontend-nextjs/topic-5.1-nextjs-app-router.md)**.
