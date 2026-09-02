from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.database import get_database
from app.routers.auth import require_admin
from app.models.srr_activity_log import SRRActivityLog
from app.models.venue_sync_job import VenueSyncJob

router = APIRouter(prefix="/api/v1/venue/admin/logs", tags=["admin_logs"])

class LogResponse(BaseModel):
    id: str
    timestamp: datetime
    type: str # "activity" or "sync"
    action: str
    details: str
    status: str

@router.get("/", response_model=List[LogResponse])
async def get_logs(limit: int = 50, db: AsyncSession = Depends(get_database), _=Depends(require_admin)):
    logs = []
    
    # 1. Fetch Activity Logs
    activity_stmt = select(SRRActivityLog).order_by(desc(SRRActivityLog.occurred_at)).limit(limit)
    activity_result = await db.execute(activity_stmt)
    activities = activity_result.scalars().all()
    
    for a in activities:
        logs.append(LogResponse(
            id=str(a.id),
            timestamp=a.occurred_at,
            type="activity",
            action=a.action,
            details=f"Station: {a.station_id}",
            status="success"
        ))
        
    # 2. Fetch Sync Jobs
    sync_stmt = select(VenueSyncJob).order_by(desc(VenueSyncJob.created_at)).limit(limit)
    sync_result = await db.execute(sync_stmt)
    syncs = sync_result.scalars().all()
    
    for s in syncs:
        logs.append(LogResponse(
            id=str(s.id),
            timestamp=s.created_at,
            type="sync",
            action=s.sync_type,
            details=s.error_message or "Sync Job",
            status=s.status
        ))
        
    # Sort combined by timestamp descending
    logs.sort(key=lambda x: x.timestamp, reverse=True)
    return logs[:limit]
