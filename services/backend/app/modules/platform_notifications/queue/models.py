import uuid
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
    queue_metadata: Mapped[dict] = mapped_column("metadata", JSONB, nullable=True)

    def __init__(self, **kwargs):
        if "metadata" in kwargs:
            kwargs["queue_metadata"] = kwargs.pop("metadata")
        super().__init__(**kwargs)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
