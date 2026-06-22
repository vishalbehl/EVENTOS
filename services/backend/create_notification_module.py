import os

BASE_DIR = os.path.join("app", "modules", "platform_notifications")

submodules = [
    "events",
    "templates",
    "preferences",
    "queue",
    "deliveries",
    "announcements",
    "webhooks",
    "subscriptions",
    "digests",
    "logs",
]

# Ensure main directory exists
os.makedirs(BASE_DIR, exist_ok=True)

# Write main __init__.py
with open(os.path.join(BASE_DIR, "__init__.py"), "w") as f:
    f.write("# platform_notifications module\n")

# Iterate and build each submodule files
for sub in submodules:
    sub_dir = os.path.join(BASE_DIR, sub)
    os.makedirs(sub_dir, exist_ok=True)
    os.makedirs(os.path.join(sub_dir, "tests"), exist_ok=True)
    
    # __init__.py
    with open(os.path.join(sub_dir, "__init__.py"), "w") as f:
        f.write(f"# {sub} submodule\n")
        
    # constants.py
    with open(os.path.join(sub_dir, "constants.py"), "w") as f:
        f.write(f"MODULE_NAME = '{sub}'\n")

    # dependencies.py
    with open(os.path.join(sub_dir, "dependencies.py"), "w") as f:
        f.write("""from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_database_async

async def get_db(db: AsyncSession = Depends(get_database_async)) -> AsyncSession:
    return db
""")

    # models.py
    # Each submodule gets its specific models
    models_content = ""
    if sub == "events":
        models_content = """import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, Boolean, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class NotificationEvent(Base):
    __tablename__ = "notification_events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    event_key: Mapped[str] = mapped_column(String(150), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, nullable=True)
    module: Mapped[str] = mapped_column(String(100), index=True)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )
"""
    elif sub == "templates":
        models_content = """import uuid
from datetime import datetime
from sqlalchemy import String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base, SoftDeleteMixin

class NotificationTemplate(Base, SoftDeleteMixin):
    __tablename__ = "notification_templates"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=True, index=True)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform_notifications.notification_events.id", ondelete="CASCADE"), index=True)
    channel: Mapped[str] = mapped_column(String(50), index=True)
    name: Mapped[str] = mapped_column(String(200))
    subject: Mapped[str] = mapped_column(String(200), nullable=True)
    body: Mapped[str] = mapped_column(Text)
    variables: Mapped[dict] = mapped_column(JSONB, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    version: Mapped[int] = mapped_column(default=1)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True)
    updated_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
"""
    elif sub == "preferences":
        models_content = """import uuid
from sqlalchemy import String, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class NotificationPreference(Base):
    __tablename__ = "notification_preferences"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="CASCADE"), index=True)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform_notifications.notification_events.id", ondelete="CASCADE"), index=True)
    email_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    sms_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    push_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    in_app_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    whatsapp_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    digest_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    quiet_hours_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    quiet_start_time: Mapped[str] = mapped_column(String(10), nullable=True)
    quiet_end_time: Mapped[str] = mapped_column(String(10), nullable=True)
    timezone: Mapped[str] = mapped_column(String(50), default="UTC")
"""
    elif sub == "queue":
        models_content = """import uuid
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class NotificationQueue(Base):
    __tablename__ = "notification_queue"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), index=True)
    notification_event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform_notifications.notification_events.id", ondelete="CASCADE"))
    template_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform_notifications.notification_templates.id", ondelete="SET NULL"), nullable=True)
    recipient_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="CASCADE"), index=True)
    channel: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(50), default="PENDING", index=True)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    priority: Mapped[int] = mapped_column(Integer, default=0, index=True)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=True)
    metadata: Mapped[dict] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
"""
    elif sub == "deliveries":
        models_content = """import uuid
from datetime import datetime
from sqlalchemy import String, Text, Boolean, DateTime, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class NotificationDelivery(Base):
    __tablename__ = "notification_deliveries"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    queue_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform_notifications.notification_queue.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = mapped_column(String(100))
    provider_message_id: Mapped[str] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(50))
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    read_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    failure_reason: Mapped[str] = mapped_column(Text, nullable=True)
    response_payload: Mapped[dict] = mapped_column(JSONB, nullable=True)

class InAppNotification(Base):
    __tablename__ = "in_app_notifications"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    message: Mapped[str] = mapped_column(Text)
    type: Mapped[str] = mapped_column(String(50), default="INFO")
    priority: Mapped[int] = mapped_column(Integer, default=0)
    icon: Mapped[str] = mapped_column(String(100), nullable=True)
    action_url: Mapped[str] = mapped_column(String(255), nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    read_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    metadata: Mapped[dict] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, index=True)

class NotificationAttachment(Base):
    __tablename__ = "notification_attachments"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    notification_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform_notifications.notification_queue.id", ondelete="CASCADE"), index=True)
    file_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("presentations.files.id", ondelete="CASCADE"))
"""
    elif sub == "announcements":
        models_content = """import uuid
from datetime import datetime
from sqlalchemy import String, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class SystemAnnouncement(Base):
    __tablename__ = "system_announcements"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(250))
    message: Mapped[str] = mapped_column(Text)
    type: Mapped[str] = mapped_column(String(50), default="INFO")
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    target_roles: Mapped[dict] = mapped_column(JSONB, nullable=True)
    target_departments: Mapped[dict] = mapped_column(JSONB, nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
"""
    elif sub == "webhooks":
        models_content = """import uuid
from sqlalchemy import String, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class NotificationWebhook(Base):
    __tablename__ = "notification_webhooks"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    url: Mapped[str] = mapped_column(String(500))
    secret: Mapped[str] = mapped_column(String(255))
    events: Mapped[dict] = mapped_column(JSONB)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
"""
    elif sub == "subscriptions":
        models_content = """import uuid
from sqlalchemy import String, Text, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class NotificationGroup(Base):
    __tablename__ = "notification_groups"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, nullable=True)

class NotificationGroupMember(Base):
    __tablename__ = "notification_group_members"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    group_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform_communications.notification_groups.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="CASCADE"), index=True)

class NotificationSubscription(Base):
    __tablename__ = "notification_subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="CASCADE"), index=True)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform_notifications.notification_events.id", ondelete="CASCADE"), index=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
"""
    elif sub == "digests":
        models_content = """import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class NotificationDigest(Base):
    __tablename__ = "notification_digests"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="CASCADE"), index=True)
    frequency: Mapped[str] = mapped_column(String(50))  # HOURLY, DAILY, WEEKLY
    next_run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    last_run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
"""
    elif sub == "logs":
        models_content = """import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class NotificationLog(Base):
    __tablename__ = "notification_logs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    notification_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform_notifications.notification_queue.id", ondelete="CASCADE"), index=True)
    channel: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(50))
    provider: Mapped[str] = mapped_column(String(100), nullable=True)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=True)
    response: Mapped[dict] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
"""

    with open(os.path.join(sub_dir, "models.py"), "w") as f:
        f.write(models_content)

    # schemas.py
    # Simple Pydantic models for validation
    schemas_content = f"""from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime
import uuid

class {sub.capitalize()}Base(BaseModel):
    pass

class {sub.capitalize()}Create({sub.capitalize()}Base):
    pass

class {sub.capitalize()}Response({sub.capitalize()}Base):
    id: uuid.UUID
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
"""
    with open(os.path.join(sub_dir, "schemas.py"), "w") as f:
        f.write(schemas_content)

    # repository.py
    repository_content = f"""from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
import uuid
from .models import *

class {sub.capitalize()}Repository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, id: uuid.UUID):
        # Dynamically find the primary model
        pass
"""
    # Customize Repository slightly
    if sub == "events":
        repository_content = """from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid
from .models import NotificationEvent

class EventsRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, id: uuid.UUID) -> NotificationEvent:
        res = await self.db.execute(select(NotificationEvent).where(NotificationEvent.id == id))
        return res.scalar_one_or_none()

    async def get_by_key(self, event_key: str) -> NotificationEvent:
        res = await self.db.execute(select(NotificationEvent).where(NotificationEvent.event_key == event_key))
        return res.scalar_one_or_none()

    async def list_all(self) -> list[NotificationEvent]:
        res = await self.db.execute(select(NotificationEvent))
        return list(res.scalars().all())

    async def create(self, event: NotificationEvent) -> NotificationEvent:
        self.db.add(event)
        await self.db.flush()
        return event
"""
    elif sub == "templates":
        repository_content = """from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid
from .models import NotificationTemplate

class TemplatesRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, id: uuid.UUID) -> NotificationTemplate:
        res = await self.db.execute(select(NotificationTemplate).where(NotificationTemplate.id == id))
        return res.scalar_one_or_none()

    async def list_for_event(self, event_id: uuid.UUID) -> list[NotificationTemplate]:
        res = await self.db.execute(select(NotificationTemplate).where(NotificationTemplate.event_id == event_id))
        return list(res.scalars().all())

    async def create(self, template: NotificationTemplate) -> NotificationTemplate:
        self.db.add(template)
        await self.db.flush()
        return template
"""
    with open(os.path.join(sub_dir, "repository.py"), "w") as f:
        f.write(repository_content)

    # service.py
    service_content = f"""from sqlalchemy.ext.asyncio import AsyncSession
from .repository import *
from .models import *
import uuid

class {sub.capitalize()}Service:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = {sub.capitalize()}Repository(db)
"""
    # Customize Service logic
    if sub == "events":
        service_content = """from sqlalchemy.ext.asyncio import AsyncSession
from .repository import EventsRepository
from .models import NotificationEvent
import uuid

class EventsService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = EventsRepository(db)

    async def register_event(self, event_key: str, name: str, description: str, module: str, is_system: bool = False) -> NotificationEvent:
        existing = await self.repo.get_by_key(event_key)
        if existing:
            return existing
        evt = NotificationEvent(
            event_key=event_key,
            name=name,
            description=description,
            module=module,
            is_system=is_system
        )
        return await self.repo.create(evt)

    async def get_event(self, id: uuid.UUID) -> NotificationEvent:
        return await self.repo.get_by_id(id)

    async def get_event_by_key(self, event_key: str) -> NotificationEvent:
        return await self.repo.get_by_key(event_key)

    async def list_events(self) -> list[NotificationEvent]:
        return await self.repo.list_all()
"""
    elif sub == "templates":
        service_content = """from sqlalchemy.ext.asyncio import AsyncSession
from .repository import TemplatesRepository
from .models import NotificationTemplate
import uuid

class TemplatesService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = TemplatesRepository(db)

    async def create_template(self, org_id: uuid.UUID, event_id: uuid.UUID, channel: str, name: str, subject: str, body: str, variables: dict = None) -> NotificationTemplate:
        tmpl = NotificationTemplate(
            organization_id=org_id,
            event_id=event_id,
            channel=channel,
            name=name,
            subject=subject,
            body=body,
            variables=variables or {}
        )
        return await self.repo.create(tmpl)

    async def get_template(self, id: uuid.UUID) -> NotificationTemplate:
        return await self.repo.get_by_id(id)

    async def render_template(self, body: str, context: dict) -> str:
        # Simple string formatting for testing, Jinja2 can be imported if needed
        from jinja2 import Template
        return Template(body).render(**context)
"""
    elif sub == "queue":
        service_content = """from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid
from datetime import datetime
from .models import NotificationQueue

class QueueService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def push_to_queue(self, org_id: uuid.UUID, event_id: uuid.UUID, recipient_id: uuid.UUID, channel: str, payload: dict, template_id: uuid.UUID = None, scheduled_at: datetime = None, priority: int = 0) -> NotificationQueue:
        q_item = NotificationQueue(
            organization_id=org_id,
            notification_event_id=event_id,
            recipient_id=recipient_id,
            channel=channel,
            payload=payload,
            template_id=template_id,
            scheduled_at=scheduled_at,
            priority=priority,
            status="PENDING"
        )
        self.db.add(q_item)
        await self.db.flush()
        return q_item

    async def get_pending(self, limit: int = 100) -> list[NotificationQueue]:
        res = await self.db.execute(
            select(NotificationQueue)
            .where(NotificationQueue.status == "PENDING")
            .order_by(NotificationQueue.priority.desc(), NotificationQueue.created_at.asc())
            .limit(limit)
        )
        return list(res.scalars().all())
"""
    elif sub == "preferences":
        service_content = """from sqlalchemy.ext.asyncio import AsyncSession
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
"""
    elif sub == "deliveries":
        service_content = """from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid
from datetime import datetime
from .models import NotificationDelivery, InAppNotification

class DeliveriesService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def record_delivery(self, queue_id: uuid.UUID, provider: str, status: str, provider_message_id: str = None, failure_reason: str = None) -> NotificationDelivery:
        deliv = NotificationDelivery(
            queue_id=queue_id,
            provider=provider,
            status=status,
            provider_message_id=provider_message_id,
            failure_reason=failure_reason,
            sent_at=datetime.utcnow()
        )
        self.db.add(deliv)
        await self.db.flush()
        return deliv

    async def send_in_app(self, org_id: uuid.UUID, user_id: uuid.UUID, title: str, message: str, type: str = "INFO", action_url: str = None) -> InAppNotification:
        notif = InAppNotification(
            organization_id=org_id,
            user_id=user_id,
            title=title,
            message=message,
            type=type,
            action_url=action_url,
            is_read=False
        )
        self.db.add(notif)
        await self.db.flush()
        return notif

    async def get_user_in_app(self, user_id: uuid.UUID) -> list[InAppNotification]:
        res = await self.db.execute(
            select(InAppNotification)
            .where(InAppNotification.user_id == user_id)
            .order_by(InAppNotification.created_at.desc())
        )
        return list(res.scalars().all())
"""
    elif sub == "announcements":
        service_content = """from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid
from datetime import datetime
from .models import SystemAnnouncement

class AnnouncementsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_announcement(self, org_id: uuid.UUID | None, title: str, message: str, type: str = "INFO", target_roles: list = None, target_departments: list = None, expires_at: datetime = None) -> SystemAnnouncement:
        ann = SystemAnnouncement(
            organization_id=org_id,
            title=title,
            message=message,
            type=type,
            target_roles=target_roles or [],
            target_departments=target_departments or [],
            expires_at=expires_at
        )
        self.db.add(ann)
        await self.db.flush()
        return ann

    async def get_active_announcements(self, org_id: uuid.UUID | None) -> list[SystemAnnouncement]:
        now = datetime.utcnow()
        query = select(SystemAnnouncement).where(SystemAnnouncement.starts_at <= now)
        if org_id:
            query = query.where((SystemAnnouncement.organization_id == org_id) | (SystemAnnouncement.organization_id.is_(None)))
        else:
            query = query.where(SystemAnnouncement.organization_id.is_(None))
        res = await self.db.execute(query)
        active = []
        for ann in res.scalars().all():
            if not ann.expires_at or ann.expires_at > now:
                active.append(ann)
        return active
"""
    elif sub == "webhooks":
        service_content = """from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid
import hmac
import hashlib
import json
from .models import NotificationWebhook

class WebhooksService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def register_webhook(self, org_id: uuid.UUID, name: str, url: str, secret: str, events: list[str]) -> NotificationWebhook:
        wh = NotificationWebhook(
            organization_id=org_id,
            name=name,
            url=url,
            secret=secret,
            events=events
        )
        self.db.add(wh)
        await self.db.flush()
        return wh

    async def get_active_webhooks(self, org_id: uuid.UUID) -> list[NotificationWebhook]:
        res = await self.db.execute(
            select(NotificationWebhook)
            .where(NotificationWebhook.organization_id == org_id, NotificationWebhook.is_active == True)
        )
        return list(res.scalars().all())

    def sign_payload(self, secret: str, payload: dict) -> str:
        data_str = json.dumps(payload, sort_keys=True)
        return hmac.new(secret.encode(), data_str.encode(), hashlib.sha256).hexdigest()
"""
    elif sub == "subscriptions":
        service_content = """from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid
from .models import NotificationGroup, NotificationGroupMember, NotificationSubscription

class SubscriptionsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_group(self, org_id: uuid.UUID, name: str, description: str = None) -> NotificationGroup:
        grp = NotificationGroup(organization_id=org_id, name=name, description=description)
        self.db.add(grp)
        await self.db.flush()
        return grp

    async def add_member(self, group_id: uuid.UUID, user_id: uuid.UUID) -> NotificationGroupMember:
        member = NotificationGroupMember(group_id=group_id, user_id=user_id)
        self.db.add(member)
        await self.db.flush()
        return member

    async def subscribe(self, org_id: uuid.UUID, user_id: uuid.UUID, event_id: uuid.UUID) -> NotificationSubscription:
        sub = NotificationSubscription(organization_id=org_id, user_id=user_id, event_id=event_id, is_enabled=True)
        self.db.add(sub)
        await self.db.flush()
        return sub
"""
    elif sub == "digests":
        service_content = """from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid
from datetime import datetime
from .models import NotificationDigest

class DigestsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def configure_digest(self, org_id: uuid.UUID, user_id: uuid.UUID, frequency: str, next_run_at: datetime) -> NotificationDigest:
        dig = NotificationDigest(
            organization_id=org_id,
            user_id=user_id,
            frequency=frequency,
            next_run_at=next_run_at
        )
        self.db.add(dig)
        await self.db.flush()
        return dig
"""
    elif sub == "logs":
        service_content = """from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid
from .models import NotificationLog

class LogsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def log_delivery(self, notif_id: uuid.UUID, channel: str, status: str, provider: str, payload: dict, response: dict = None) -> NotificationLog:
        log = NotificationLog(
            notification_id=notif_id,
            channel=channel,
            status=status,
            provider=provider,
            payload=payload,
            response=response
        )
        self.db.add(log)
        await self.db.flush()
        return log

    async def list_logs(self, limit: int = 100) -> list[NotificationLog]:
        res = await self.db.execute(select(NotificationLog).order_by(NotificationLog.created_at.desc()).limit(limit))
        return list(res.scalars().all())
"""

    with open(os.path.join(sub_dir, "service.py"), "w") as f:
        f.write(service_content)

    # router.py
    # API endpoints
    router_content = f"""from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from .dependencies import get_db
from .service import {sub.capitalize()}Service
import uuid

router = APIRouter(prefix="/{sub}", tags=["{sub}"])
"""
    if sub == "events":
        router_content = """from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from .dependencies import get_db
from .service import EventsService
import uuid

router = APIRouter(prefix="/events", tags=["events"])

@router.post("")
async def register_event(event_key: str, name: str, description: str, module: str, is_system: bool = False, db: AsyncSession = Depends(get_db)):
    srv = EventsService(db)
    evt = await srv.register_event(event_key, name, description, module, is_system)
    await db.commit()
    return evt

@router.get("")
async def list_events(db: AsyncSession = Depends(get_db)):
    srv = EventsService(db)
    return await srv.list_events()

@router.get("/{event_id}")
async def get_event(event_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    srv = EventsService(db)
    evt = await srv.get_event(event_id)
    if not evt:
        raise HTTPException(status_code=404, detail="Event not found")
    return evt
"""
    elif sub == "templates":
        router_content = """from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from .dependencies import get_db
from .service import TemplatesService
import uuid

router = APIRouter(prefix="/templates", tags=["templates"])

@router.post("")
async def create_template(org_id: uuid.UUID, event_id: uuid.UUID, channel: str, name: str, subject: str, body: str, variables: dict = None, db: AsyncSession = Depends(get_db)):
    srv = TemplatesService(db)
    tmpl = await srv.create_template(org_id, event_id, channel, name, subject, body, variables)
    await db.commit()
    return tmpl

@router.get("/{template_id}")
async def get_template(template_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    srv = TemplatesService(db)
    tmpl = await srv.get_template(template_id)
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    return tmpl
"""
    elif sub == "preferences":
        router_content = """from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from .dependencies import get_db
from .service import PreferencesService
import uuid

router = APIRouter(prefix="/preferences", tags=["preferences"])

@router.get("/{user_id}/{event_id}")
async def get_preferences(user_id: uuid.UUID, event_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    srv = PreferencesService(db)
    return await srv.get_user_preferences(user_id, event_id)

@router.patch("/{user_id}/{event_id}")
async def update_preferences(user_id: uuid.UUID, event_id: uuid.UUID, updates: dict, db: AsyncSession = Depends(get_db)):
    srv = PreferencesService(db)
    pref = await srv.update_preferences(user_id, event_id, updates)
    await db.commit()
    return pref
"""
    elif sub == "announcements":
        router_content = """from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from .dependencies import get_db
from .service import AnnouncementsService
import uuid

router = APIRouter(prefix="/announcements", tags=["announcements"])

@router.post("")
async def create_announcement(title: str, message: str, org_id: uuid.UUID = None, type: str = "INFO", target_roles: list = None, target_departments: list = None, db: AsyncSession = Depends(get_db)):
    srv = AnnouncementsService(db)
    ann = await srv.create_announcement(org_id, title, message, type, target_roles, target_departments)
    await db.commit()
    return ann

@router.get("")
async def list_active_announcements(org_id: uuid.UUID = None, db: AsyncSession = Depends(get_db)):
    srv = AnnouncementsService(db)
    return await srv.get_active_announcements(org_id)
"""
    elif sub == "webhooks":
        router_content = """from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from .dependencies import get_db
from .service import WebhooksService
import uuid

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

@router.post("")
async def register_webhook(org_id: uuid.UUID, name: str, url: str, secret: str, events: list[str], db: AsyncSession = Depends(get_db)):
    srv = WebhooksService(db)
    wh = await srv.register_webhook(org_id, name, url, secret, events)
    await db.commit()
    return wh

@router.get("")
async def list_active_webhooks(org_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    srv = WebhooksService(db)
    return await srv.get_active_webhooks(org_id)
"""
    elif sub == "logs":
        router_content = """from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from .dependencies import get_db
from .service import LogsService
import uuid

router = APIRouter(prefix="/logs", tags=["logs"])

@router.get("")
async def list_logs(db: AsyncSession = Depends(get_db)):
    srv = LogsService(db)
    return await srv.list_logs()
"""

    with open(os.path.join(sub_dir, "router.py"), "w") as f:
        f.write(router_content)

    # tests subfolder tests/test_module.py
    test_content = f"""import pytest
from sqlalchemy.ext.asyncio import AsyncSession

@pytest.mark.asyncio
async def test_{sub}_placeholder():
    assert True
"""
    with open(os.path.join(sub_dir, "tests", "test_module.py"), "w") as f:
        f.write(test_content)
    with open(os.path.join(sub_dir, "tests", "__init__.py"), "w") as f:
        f.write("")

print("Submodules template structure generated successfully!")
