import uuid
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
    notification_metadata: Mapped[dict] = mapped_column("metadata", JSONB, nullable=True)

    def __init__(self, **kwargs):
        if "metadata" in kwargs:
            kwargs["notification_metadata"] = kwargs.pop("metadata")
        super().__init__(**kwargs)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, index=True)

class NotificationAttachment(Base):
    __tablename__ = "notification_attachments"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    notification_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform_notifications.notification_queue.id", ondelete="CASCADE"), index=True)
    file_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("presentations.files.id", ondelete="CASCADE"))
