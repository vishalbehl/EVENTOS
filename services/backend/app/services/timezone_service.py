from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session
from loguru import logger

# Cache timezone to avoid DB queries on every time formatting
_cached_timezone = "Asia/Kolkata"

def get_cached_timezone() -> str:
    """Return the cached timezone or default 'Asia/Kolkata'."""
    return _cached_timezone

def set_cached_timezone(tz: str) -> None:
    """Update the in-memory timezone cache."""
    global _cached_timezone
    _cached_timezone = tz
    logger.info(f"System timezone cache updated to: {_cached_timezone}")

async def fetch_system_timezone_async(db: AsyncSession) -> str:
    """Query system settings for timezone asynchronously and update cache."""
    try:
        from app.modules.platform.models.system_setting import SystemSetting
        result = await db.execute(select(SystemSetting).where(SystemSetting.key == "timezone"))
        setting = result.scalar_one_or_none()
        if setting:
            set_cached_timezone(setting.value)
            return setting.value
    except Exception as e:
        logger.warning(f"Failed to fetch system timezone asynchronously (DB might be migrating): {e}")
    return _cached_timezone

def fetch_system_timezone_sync(db: Session) -> str:
    """Query system settings for timezone synchronously and update cache."""
    try:
        from app.modules.platform.models.system_setting import SystemSetting
        setting = db.query(SystemSetting).filter(SystemSetting.key == "timezone").first()
        if setting:
            set_cached_timezone(setting.value)
            return setting.value
    except Exception as e:
        logger.warning(f"Failed to fetch system timezone synchronously: {e}")
    return _cached_timezone
