import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, String, Text, Integer
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

class NotificationEvent(Base):
    """
    Unified telemetry for communication delivery (Email, WebSocket, Push).
    """
    __tablename__ = "notification_delivery_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    correlation_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), index=True
    )
    
    channel: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    recipient_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), index=True
    )
    
    status: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    
    provider_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    provider_response: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    latency_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    def __repr__(self) -> str:
        return f"<NotificationEvent id={self.id} channel={self.channel} status={self.status}>"

NotificationDeliveryLog = NotificationEvent
