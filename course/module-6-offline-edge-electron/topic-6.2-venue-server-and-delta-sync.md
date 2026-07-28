# Module 6 - Topic 6.2: Offline Venue Edge Server & Bi-Directional Delta Sync Engine

## 1. Introduction & Learning Objectives
Welcome to **Topic 6.2**. In this chapter, you will master offline-first edge architecture, local venue server deployment, and bi-directional delta synchronization engines ([services/venue-server](file:///d:/DEV/conf-platform/services/venue-server)).

### Learning Outcomes:
- Deploy local FastAPI edge servers capable of operating during internet outages.
- Design offline transaction queuing mechanisms in SQLite/IndexedDB.
- Implement conflict-free bi-directional delta synchronization engines.

---

## 2. Hybrid Cloud + Offline Edge Architecture

```
Cloud API Gateway (port 8000) <─── Cloud Database (port 5432)
       │
       │ Internet Connection Restored (Sync Payload Batching)
       ▼
Local Venue Server (port 8001) <─── Local Edge Database (port 5433)
       │
       ├── LAN Check-in Kiosks (port 3005)
       └── LAN Station App Scanners
```

---

## 3. Bi-Directional Delta Sync Engine

### 3.1 Local Transaction Queueing Model
When offline, attendee check-in scans are queued locally in SQLite with a `synced=False` flag:

```python
from uuid import UUID, uuid4
from datetime import datetime
from pydantic import BaseModel

class OfflineCheckinTransaction(BaseModel):
    id: UUID = uuid4()
    ticket_id: str
    scanned_at: datetime
    synced: bool = False

# Local Edge Sync Engine
async def sync_offline_checkins_to_cloud(cloud_client: AsyncClient, db_session: AsyncSession):
    # Select unsynced local transactions
    unsynced = await db_session.execute(
        select(CheckinModel).where(CheckinModel.synced == False)
    )
    records = unsynced.scalars().all()
    
    if not records:
        return
        
    payload = [r.to_dict() for r in records]
    
    try:
        # POST batch delta payload to cloud backend API
        response = await cloud_client.post("/api/v1/venue/sync-batch", json={"transactions": payload})
        if response.status_code == 200:
            # Mark local transactions as synced
            for r in records:
                r.synced = True
            await db_session.commit()
    except Exception as err:
        print("Cloud sync failed, will retry on next poll cycle:", err)
```

---

## 4. Practical Exercise & Self-Assessment

### Hands-On Exercise:
1. Run `services/venue-server` locally (`python -m uvicorn app.main:app --port 8001`).
2. Simulate internet disconnection by stopping cloud backend API (port 8000).
3. Perform local check-in scans on port 8001 and observe that records are saved locally with `synced=False`.
4. Restart cloud backend and verify sync worker automatically uploads batched transactions and updates `synced=True`.

---

## 5. Chapter Summary & Next Steps
You have completed Module 6! You have mastered Electron main/renderer architectures, IPC bridges, local edge servers, and bi-directional delta synchronization. Next, move to **[Module 7 - Topic 7.1: Multi-Stage Dockerfiles](../module-7-infrastructure-devops/topic-7.1-docker-containerization.md)**.
