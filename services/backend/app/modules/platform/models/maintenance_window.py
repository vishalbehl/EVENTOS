import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import ARRAY, Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.identity.models.user import User


class MaintenanceWindow(Base):
    """
    Scheduled maintenance window for platform services.
    Used by the super-admin to plan, announce, and track downtime.

    status values:
        'SCHEDULED'   – upcoming, not yet started
        'IN_PROGRESS' – currently active
        'COMPLETED'   – finished successfully
        'CANCELLED'   – cancelled before or during execution
    """
    __tablename__ = "maintenance_windows"
    __table_args__ = {"schema": "platform"}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    starts_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    ends_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    # List of affected service names e.g. ['registration', 'billing', 'api']
    affected_services: Mapped[Optional[List[str]]] = mapped_column(
        ARRAY(Text), nullable=True
    )

    # 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
    status: Mapped[str] = mapped_column(
        String(20), default="SCHEDULED", server_default="SCHEDULED"
    )
    notification_sent: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )

    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("identity.users.id", ondelete="SET NULL"),
        nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc)
    )

    # ── Relationships ──────────────────────────────────────────────────────
    creator: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[created_by]
    )

    def __repr__(self) -> str:
        return (
            f"<MaintenanceWindow title={self.title!r} "
            f"status={self.status} "
            f"starts={self.starts_at}>"
        )
