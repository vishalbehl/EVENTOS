from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, require_roles
from app.modules.auth.models.user import User
from app.modules.rbac.models.system_setting import SystemSetting
from app.modules.rbac.schemas.settings import GlobalSettingsResponse, GlobalSettingsUpdate
from app.services.timezone_service import set_cached_timezone, get_cached_timezone

router = APIRouter(prefix="/global-settings", tags=["global-settings"])


@router.get("", response_model=GlobalSettingsResponse)
async def get_global_settings(
    db: AsyncSession = Depends(get_db)
) -> GlobalSettingsResponse:
    """Get global system configurations (e.g. timezone)."""
    # Fetch from database, or fallback to cache if not found
    result = await db.execute(select(SystemSetting).where(SystemSetting.key == "timezone"))
    setting = result.scalar_one_or_none()
    
    tz = setting.value if setting else get_cached_timezone()
    return GlobalSettingsResponse(timezone=tz)


@router.patch("", response_model=GlobalSettingsResponse)
async def update_global_settings(
    payload: GlobalSettingsUpdate,
    current_user: User = Depends(require_roles("super_admin")),
    db: AsyncSession = Depends(get_db)
) -> GlobalSettingsResponse:
    """Update global system configurations. Only accessible to Super Admin."""
    result = await db.execute(select(SystemSetting).where(SystemSetting.key == "timezone"))
    setting = result.scalar_one_or_none()

    if not setting:
        setting = SystemSetting(key="timezone", value=payload.timezone)
        db.add(setting)
    else:
        setting.value = payload.timezone

    await db.commit()
    await db.refresh(setting)

    # Sync cache in-memory
    set_cached_timezone(setting.value)

    return GlobalSettingsResponse(timezone=setting.value)
