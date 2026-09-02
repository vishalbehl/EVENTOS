from fastapi import APIRouter, Depends
from typing import Dict, Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_database
from app.models.operational_control import VenueServiceInstance
from app.models.venue_user import VenueUser
from app.routers.auth import require_viewer
from app.routers.operational_control import observed_state, utcnow

router = APIRouter(
    prefix="/venue/admin/command-center",
    tags=["command_center"],
)

@router.get("/status", response_model=Dict[str, Any])
async def get_command_center_status(
    db: AsyncSession = Depends(get_database),
    _: VenueUser = Depends(require_viewer),
):
    """Report only service states backed by persisted heartbeat evidence."""
    rows = list((await db.execute(select(VenueServiceInstance))).scalars().all())
    by_type: dict[str, list[str]] = {}
    for row in rows:
        by_type.setdefault(row.service_type, []).append(observed_state(row.last_heartbeat_at, row.status))
    services = {
        key: ("not_configured" if not states else ("degraded" if "degraded" in states else states[0]))
        for key, states in by_type.items()
    }
    values = list(services.values())
    if not values or all(value == "not_configured" for value in values):
        overall = "not_configured"
    elif any(value in {"degraded", "offline", "stale", "maintenance"} for value in values):
        overall = "degraded"
    else:
        overall = "healthy"
    return {"generated_at": utcnow().isoformat(), "status": overall, "services": services}
