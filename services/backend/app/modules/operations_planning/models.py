import uuid
from datetime import datetime, date, timezone
from typing import Optional, List
from sqlalchemy import String, Text, DateTime, Date, ForeignKey, Index, Numeric, Boolean, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

class Project(Base):
    __tablename__ = "projects"
    __table_args__ = (
        Index("idx_project_status", "status"),
        Index("idx_project_org_event", "organization_id", "event_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="CASCADE"), nullable=False, index=True)
    project_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="INITIATED", index=True) # INITIATED, PLANNING, ACTIVE, COMPLETED, ON_HOLD, CANCELLED
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    project_manager_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True)
    completion_percentage: Mapped[float] = mapped_column(Numeric(5, 2), default=0.0)

    # Relationships
    project_manager: Mapped[Optional["app.modules.identity.models.user.User"]] = relationship("User")
    milestones: Mapped[List["Milestone"]] = relationship("Milestone", back_populates="project", cascade="all, delete-orphan")
    tasks: Mapped[List["ProjectTask"]] = relationship("ProjectTask", back_populates="project", cascade="all, delete-orphan")
    resource_plans: Mapped[List["app.modules.resource_management.models.ResourcePlan"]] = relationship("ResourcePlan", back_populates="project", cascade="all, delete-orphan")
    allocations: Mapped[List["app.modules.resource_management.models.ResourceAllocation"]] = relationship("ResourceAllocation", back_populates="project", cascade="all, delete-orphan")
    staff_assignments: Mapped[List["app.modules.resource_management.models.StaffAssignment"]] = relationship("StaffAssignment", back_populates="project", cascade="all, delete-orphan")
    equipment_assignments: Mapped[List["app.modules.resource_management.models.EquipmentAssignment"]] = relationship("EquipmentAssignment", back_populates="project", cascade="all, delete-orphan")
    travel_plans: Mapped[List["app.modules.resource_management.models.TravelPlan"]] = relationship("TravelPlan", back_populates="project", cascade="all, delete-orphan")
    deployments: Mapped[List["app.modules.deployment_management.models.Deployment"]] = relationship("Deployment", back_populates="project", cascade="all, delete-orphan")
    readiness_scores: Mapped[List["app.modules.deployment_management.models.ReadinessScore"]] = relationship("ReadinessScore", back_populates="project", cascade="all, delete-orphan")
    risks: Mapped[List["app.modules.deployment_management.models.Risk"]] = relationship("Risk", back_populates="project", cascade="all, delete-orphan")

class Milestone(Base):
    __tablename__ = "milestones"
    __table_args__ = (
        Index("idx_milestone_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("operations_planning.projects.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="PLANNED", index=True) # PLANNED, IN_PROGRESS, COMPLETED, DELAYED
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    project: Mapped["Project"] = relationship("Project", back_populates="milestones")
    tasks: Mapped[List["ProjectTask"]] = relationship("ProjectTask", back_populates="milestone", cascade="all, delete-orphan")

class ProjectTask(Base):
    __tablename__ = "project_tasks"
    __table_args__ = (
        Index("idx_task_status", "status"),
        {"postgresql_partition_by": "RANGE (created_at)"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("operations_planning.projects.id", ondelete="CASCADE"), nullable=False)
    milestone_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("operations_planning.milestones.id", ondelete="SET NULL"), nullable=True)
    assigned_to: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="TODO", index=True) # TODO, IN_PROGRESS, BLOCKED, COMPLETED
    priority: Mapped[str] = mapped_column(String(20), default="MEDIUM") # LOW, MEDIUM, HIGH, CRITICAL
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True, default=lambda: datetime.now(timezone.utc))

    project: Mapped["Project"] = relationship("Project", back_populates="tasks")
    milestone: Mapped[Optional["Milestone"]] = relationship("Milestone", back_populates="tasks")
    assignee: Mapped[Optional["app.modules.identity.models.user.User"]] = relationship("User")

class TaskDependency(Base):
    __tablename__ = "task_dependencies"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    depends_on_task_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)

class ProjectTemplate(Base):
    __tablename__ = "project_templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class ProjectTemplateTask(Base):
    __tablename__ = "project_template_tasks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("operations_planning.project_templates.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    relative_due_days: Mapped[int] = mapped_column(Integer, default=7)
    priority: Mapped[str] = mapped_column(String(20), default="MEDIUM")

class EventTimeline(Base):
    __tablename__ = "event_timelines"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class TimelineMilestone(Base):
    __tablename__ = "timeline_milestones"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    timeline_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("operations_planning.event_timelines.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    target_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="PLANNED")

class TimelineDependency(Base):
    __tablename__ = "timeline_dependencies"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    milestone_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("operations_planning.timeline_milestones.id", ondelete="CASCADE"), nullable=False)
    depends_on_milestone_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("operations_planning.timeline_milestones.id", ondelete="CASCADE"), nullable=False)

class ProjectVendor(Base):
    __tablename__ = "project_vendors"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("operations_planning.projects.id", ondelete="CASCADE"), nullable=False)
    vendor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("procurement.vendors.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[str] = mapped_column(String(100), nullable=False)
    contract_value: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)

class VendorAssignment(Base):
    __tablename__ = "vendor_assignments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_vendor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("operations_planning.project_vendors.id", ondelete="CASCADE"), nullable=False)
    task_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)

class ProjectDependency(Base):
    __tablename__ = "project_dependencies"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("operations_planning.projects.id", ondelete="CASCADE"), nullable=False)
    depends_on_project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("operations_planning.projects.id", ondelete="CASCADE"), nullable=False)

class ProjectBlocker(Base):
    __tablename__ = "project_blockers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("operations_planning.projects.id", ondelete="CASCADE"), nullable=False)
    blocker_description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="ACTIVE")
