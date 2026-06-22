import uuid
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import String, Text, DateTime, ForeignKey, Boolean, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, SoftDeleteMixin

class ApprovalWorkflow(Base, SoftDeleteMixin):
    __tablename__ = "approval_workflows"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    module: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    trigger_event: Mapped[str] = mapped_column(String(100), nullable=False, default="create")
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    steps: Mapped[List["ApprovalWorkflowStep"]] = relationship(
        "ApprovalWorkflowStep",
        back_populates="workflow",
        cascade="all, delete-orphan",
        order_by="ApprovalWorkflowStep.step_order.asc()"
    )
    conditions: Mapped[List["ApprovalWorkflowCondition"]] = relationship(
        "ApprovalWorkflowCondition",
        back_populates="workflow",
        cascade="all, delete-orphan"
    )
    instances: Mapped[List["ApprovalInstance"]] = relationship(
        "ApprovalInstance",
        back_populates="workflow",
        cascade="all, delete-orphan"
    )

class ApprovalWorkflowStep(Base):
    __tablename__ = "approval_workflow_steps"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workflow_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform_workflows.approval_workflows.id", ondelete="CASCADE"), index=True
    )
    step_order: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    approval_type: Mapped[str] = mapped_column(String(50), default="ANYONE")  # ANYONE, EVERYONE, MAJORITY, SEQUENTIAL, PARALLEL
    assignment_type: Mapped[str] = mapped_column(String(50), default="ROLE")  # USER, ROLE, TEAM, DEPARTMENT, MANAGER, DYNAMIC
    minimum_approvals: Mapped[int] = mapped_column(Integer, default=1)
    allow_rejection: Mapped[bool] = mapped_column(Boolean, default=True)
    allow_return: Mapped[bool] = mapped_column(Boolean, default=True)
    allow_skip: Mapped[bool] = mapped_column(Boolean, default=False)
    escalation_hours: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    timeout_hours: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_final: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    workflow: Mapped["ApprovalWorkflow"] = relationship("ApprovalWorkflow", back_populates="steps")
    approvers: Mapped[List["ApprovalStepApprover"]] = relationship(
        "ApprovalStepApprover",
        back_populates="step",
        cascade="all, delete-orphan"
    )
    instance_steps: Mapped[List["ApprovalInstanceStep"]] = relationship(
        "ApprovalInstanceStep",
        back_populates="workflow_step",
        cascade="all, delete-orphan"
    )

class ApprovalStepApprover(Base):
    __tablename__ = "approval_step_approvers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workflow_step_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform_workflows.approval_workflow_steps.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="CASCADE"), nullable=True)
    department_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.departments.id", ondelete="CASCADE"), nullable=True)
    team_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.teams.id", ondelete="CASCADE"), nullable=True)
    role_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.department_roles.id", ondelete="CASCADE"), nullable=True)

    # Relationships
    step: Mapped["ApprovalWorkflowStep"] = relationship("ApprovalWorkflowStep", back_populates="approvers")
