import uuid
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
