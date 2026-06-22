import uuid
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
