import uuid
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
