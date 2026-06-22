from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid
from .models import NotificationPreference

class PreferencesService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_user_preferences(self, user_id: uuid.UUID, event_id: uuid.UUID) -> NotificationPreference:
        res = await self.db.execute(
            select(NotificationPreference)
            .where(NotificationPreference.user_id == user_id, NotificationPreference.event_id == event_id)
        )
        pref = res.scalar_one_or_none()
        if not pref:
            # Default preferences
            pref = NotificationPreference(
                user_id=user_id,
                event_id=event_id,
                email_enabled=True,
                sms_enabled=True,
                push_enabled=True,
                in_app_enabled=True,
                whatsapp_enabled=True,
                digest_enabled=False
            )
            self.db.add(pref)
            await self.db.flush()
        return pref

    async def update_preferences(self, user_id: uuid.UUID, event_id: uuid.UUID, updates: dict) -> NotificationPreference:
        pref = await self.get_user_preferences(user_id, event_id)
        for key, val in updates.items():
            if hasattr(pref, key):
                setattr(pref, key, val)
        await self.db.flush()
        return pref

    async def is_in_quiet_hours(self, user_id: uuid.UUID, event_id: uuid.UUID, current_time_utc = None) -> bool:
        from datetime import datetime, time
        import pytz
        pref = await self.get_user_preferences(user_id, event_id)
        if not pref.quiet_hours_enabled or not pref.quiet_start_time or not pref.quiet_end_time:
            return False
        
        if not current_time_utc:
            current_time_utc = datetime.utcnow()
            
        try:
            tz = pytz.timezone(pref.timezone or "UTC")
        except Exception:
            tz = pytz.UTC
            
        local_now = current_time_utc.replace(tzinfo=pytz.UTC).astimezone(tz)
        local_time = local_now.time()
        
        try:
            start_parts = [int(p) for p in pref.quiet_start_time.split(":")]
            end_parts = [int(p) for p in pref.quiet_end_time.split(":")]
            start_time = time(start_parts[0], start_parts[1])
            end_time = time(end_parts[0], end_parts[1])
        except Exception:
            return False
            
        if start_time <= end_time:
            return start_time <= local_time <= end_time
        else:
            return local_time >= start_time or local_time <= end_time
