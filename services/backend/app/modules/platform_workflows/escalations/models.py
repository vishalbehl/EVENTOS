import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import Text, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

class ApprovalEscalation(Base):
    __tablename__ = "approval_escalations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    instance_step_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform_workflows.approval_instance_steps.id", ondelete="CASCADE"), index=True
    )
    escalated_to: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="CASCADE"), index=True)
    escalated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    instance_step: Mapped["ApprovalInstanceStep"] = relationship("ApprovalInstanceStep", back_populates="escalations")
