import uuid
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import String, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

class ApprovalInstance(Base):
    __tablename__ = "approval_instances"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), index=True
    )
    workflow_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform_workflows.approval_workflows.id", ondelete="CASCADE"), index=True
    )
    entity_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(50), default="PENDING", index=True)  # PENDING, APPROVED, REJECTED, etc.
    current_step_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform_workflows.approval_workflow_steps.id", ondelete="SET NULL"), nullable=True, index=True
    )
    started_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    workflow: Mapped["ApprovalWorkflow"] = relationship("ApprovalWorkflow", back_populates="instances")
    steps: Mapped[List["ApprovalInstanceStep"]] = relationship(
        "ApprovalInstanceStep",
        back_populates="instance",
        cascade="all, delete-orphan"
    )
    attachments: Mapped[List["ApprovalAttachment"]] = relationship(
        "ApprovalAttachment",
        back_populates="instance",
        cascade="all, delete-orphan"
    )
    history: Mapped[List["ApprovalHistory"]] = relationship(
        "ApprovalHistory",
        back_populates="instance",
        cascade="all, delete-orphan"
    )

class ApprovalInstanceStep(Base):
    __tablename__ = "approval_instance_steps"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    instance_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform_workflows.approval_instances.id", ondelete="CASCADE"), index=True
    )
    workflow_step_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform_workflows.approval_workflow_steps.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[str] = mapped_column(String(50), default="PENDING", index=True)  # PENDING, APPROVED, REJECTED, etc.
    assigned_to: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True)
    approved_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    rejected_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True)
    rejected_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    returned_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True)
    returned_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    comments: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    due_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    instance: Mapped["ApprovalInstance"] = relationship("ApprovalInstance", back_populates="steps")
    workflow_step: Mapped["ApprovalWorkflowStep"] = relationship("ApprovalWorkflowStep", back_populates="instance_steps")
    comments_list: Mapped[List["ApprovalComment"]] = relationship(
        "ApprovalComment",
        back_populates="instance_step",
        cascade="all, delete-orphan"
    )
    escalations: Mapped[List["ApprovalEscalation"]] = relationship(
        "ApprovalEscalation",
        back_populates="instance_step",
        cascade="all, delete-orphan"
    )

class ApprovalAttachment(Base):
    __tablename__ = "approval_attachments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    instance_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform_workflows.approval_instances.id", ondelete="CASCADE"), index=True
    )
    file_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("presentations.files.id", ondelete="CASCADE"), index=True)
    uploaded_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="CASCADE"))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    instance: Mapped["ApprovalInstance"] = relationship("ApprovalInstance", back_populates="attachments")
