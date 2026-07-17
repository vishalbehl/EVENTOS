import uuid
from datetime import date, datetime, timezone
from typing import Optional, List
from sqlalchemy import String, Text, DateTime, Date, ForeignKey, Index, Numeric, Boolean, Integer
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

class Deployment(Base):
    __tablename__ = "deployments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("operations_planning.projects.id", ondelete="CASCADE"), nullable=False)
    deployment_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    deployment_date: Mapped[date] = mapped_column(Date, nullable=False)
    deployment_status: Mapped[str] = mapped_column(String(50), default="PLANNED") # PLANNED, IN_PROGRESS, SUCCESS, FAILED

    project: Mapped["app.modules.operations_planning.models.Project"] = relationship("Project", back_populates="deployments")
    checklists: Mapped[List["DeploymentChecklist"]] = relationship("DeploymentChecklist", back_populates="deployment", cascade="all, delete-orphan")
    logs: Mapped[List["DeploymentLog"]] = relationship("DeploymentLog", back_populates="deployment", cascade="all, delete-orphan")

class DeploymentChecklist(Base):
    __tablename__ = "deployment_checklists"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    deployment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("deployment_management.deployments.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="PENDING") # PENDING, COMPLETED

    deployment: Mapped["Deployment"] = relationship("Deployment", back_populates="checklists")

class DeploymentLog(Base):
    __tablename__ = "deployment_logs"
    __table_args__ = (
        {"postgresql_partition_by": "RANGE (created_at)"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    deployment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("deployment_management.deployments.id", ondelete="CASCADE"), nullable=False)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    performed_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="RESTRICT"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True, default=lambda: datetime.now(timezone.utc))

    deployment: Mapped["Deployment"] = relationship("Deployment", back_populates="logs")
    performer: Mapped["app.modules.identity.models.user.User"] = relationship("User")

class ReadinessScore(Base):
    __tablename__ = "readiness_scores"
    __table_args__ = (
        Index("idx_readiness_score", "overall_score"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("operations_planning.projects.id", ondelete="CASCADE"), nullable=False)
    technology_score: Mapped[float] = mapped_column(Numeric(5, 2), default=0.0)
    network_score: Mapped[float] = mapped_column(Numeric(5, 2), default=0.0)
    staff_score: Mapped[float] = mapped_column(Numeric(5, 2), default=0.0)
    equipment_score: Mapped[float] = mapped_column(Numeric(5, 2), default=0.0)
    content_score: Mapped[float] = mapped_column(Numeric(5, 2), default=0.0)
    venue_score: Mapped[float] = mapped_column(Numeric(5, 2), default=0.0)
    compliance_score: Mapped[float] = mapped_column(Numeric(5, 2), default=0.0)
    overall_score: Mapped[float] = mapped_column(Numeric(5, 2), default=0.0)
    last_calculated: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    project: Mapped["app.modules.operations_planning.models.Project"] = relationship("Project", back_populates="readiness_scores")

class Risk(Base):
    __tablename__ = "risks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("operations_planning.projects.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    severity: Mapped[str] = mapped_column(String(20), default="MEDIUM") # LOW, MEDIUM, HIGH, CRITICAL
    probability: Mapped[str] = mapped_column(String(20), default="MEDIUM") # LOW, MEDIUM, HIGH
    mitigation_plan: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="IDENTIFIED") # IDENTIFIED, MITIGATED, OCCURRED, RESOLVED
    category: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    impact: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    owner_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True, index=True)
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    accepted_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True)
    accepted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    acceptance_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    project: Mapped["app.modules.operations_planning.models.Project"] = relationship("Project", back_populates="risks")
    actions: Mapped[List["RiskAction"]] = relationship("RiskAction", back_populates="risk", cascade="all, delete-orphan")
    comments: Mapped[List["RiskComment"]] = relationship("RiskComment", back_populates="risk", cascade="all, delete-orphan")
    escalations: Mapped[List["RiskEscalation"]] = relationship("RiskEscalation", back_populates="risk", cascade="all, delete-orphan")
    evidence: Mapped[List["RiskEvidence"]] = relationship("RiskEvidence", back_populates="risk", cascade="all, delete-orphan")


class RiskEvidence(Base):
    __tablename__ = "risk_evidence"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    risk_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("deployment_management.risks.id", ondelete="CASCADE"), nullable=False, index=True)
    asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("files.assets.id", ondelete="RESTRICT"), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="RESTRICT"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    risk: Mapped["Risk"] = relationship("Risk", back_populates="evidence")

class DeploymentRunbook(Base):
    __tablename__ = "deployment_runbooks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("operations_planning.projects.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    project: Mapped["app.modules.operations_planning.models.Project"] = relationship("Project")
    steps: Mapped[List["DeploymentStep"]] = relationship("DeploymentStep", back_populates="runbook", cascade="all, delete-orphan")

class DeploymentStep(Base):
    __tablename__ = "deployment_steps"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    runbook_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("deployment_management.deployment_runbooks.id", ondelete="CASCADE"), nullable=False)
    step_number: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    assigned_to: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="PENDING") # PENDING, IN_PROGRESS, COMPLETED, FAILED
    depends_on_step_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)

    runbook: Mapped["DeploymentRunbook"] = relationship("DeploymentRunbook", back_populates="steps")
    assignee: Mapped[Optional["app.modules.identity.models.user.User"]] = relationship("User")

class Issue(Base):
    __tablename__ = "issues"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("operations_planning.projects.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    severity: Mapped[str] = mapped_column(String(20), default="MEDIUM")
    status: Mapped[str] = mapped_column(String(50), default="OPEN")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    project: Mapped["app.modules.operations_planning.models.Project"] = relationship("Project")

class RiskAction(Base):
    __tablename__ = "risk_actions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    risk_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("deployment_management.risks.id", ondelete="CASCADE"), nullable=False)
    action_description: Mapped[str] = mapped_column(Text, nullable=False)
    assigned_to: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="RESTRICT"), nullable=False)
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="PENDING")

    risk: Mapped["Risk"] = relationship("Risk", back_populates="actions")
    assignee: Mapped["app.modules.identity.models.user.User"] = relationship("User")

class RiskEscalation(Base):
    __tablename__ = "risk_escalations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    risk_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("deployment_management.risks.id", ondelete="CASCADE"), nullable=False)
    escalated_to: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="RESTRICT"), nullable=False)
    escalated_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="RESTRICT"), nullable=False)
    escalated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="OPEN")

    risk: Mapped["Risk"] = relationship("Risk", back_populates="escalations")
    escalator_target: Mapped["app.modules.identity.models.user.User"] = relationship("User", foreign_keys=[escalated_to])
    escalated_by_user: Mapped["app.modules.identity.models.user.User"] = relationship("User", foreign_keys=[escalated_by])

class RiskComment(Base):
    __tablename__ = "risk_comments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    risk_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("deployment_management.risks.id", ondelete="CASCADE"), nullable=False)
    comment: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="RESTRICT"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    risk: Mapped["Risk"] = relationship("Risk", back_populates="comments")
    creator: Mapped["app.modules.identity.models.user.User"] = relationship("User")

class ProjectCost(Base):
    __tablename__ = "project_costs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("operations_planning.projects.id", ondelete="CASCADE"), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    estimated_amount: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)
    actual_amount: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    project: Mapped["app.modules.operations_planning.models.Project"] = relationship("Project")

class ProjectActual(Base):
    __tablename__ = "project_actuals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("operations_planning.projects.id", ondelete="CASCADE"), nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)
    spent_at: Mapped[date] = mapped_column(Date, nullable=False)
    spent_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="RESTRICT"), nullable=False)

    project: Mapped["app.modules.operations_planning.models.Project"] = relationship("Project")

class ProjectProfitability(Base):
    __tablename__ = "project_profitability"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("operations_planning.projects.id", ondelete="CASCADE"), nullable=False)
    total_revenue: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)
    total_estimated_costs: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)
    total_actual_costs: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)
    gross_profit: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)
    margin_percentage: Mapped[float] = mapped_column(Numeric(5, 2), default=0.0)
    calculated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    project: Mapped["app.modules.operations_planning.models.Project"] = relationship("Project")

class ProjectActualCost(Base):
    __tablename__ = "project_actual_costs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("operations_planning.projects.id", ondelete="CASCADE"), nullable=False)
    cost_item: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)
    invoice_reference: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    paid_at: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    project: Mapped["app.modules.operations_planning.models.Project"] = relationship("Project")

class ServiceMetric(Base):
    __tablename__ = "service_metrics"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="CASCADE"), nullable=False)
    total_requests: Mapped[int] = mapped_column(Integer, default=0)
    completed_requests: Mapped[int] = mapped_column(Integer, default=0)
    average_resolution_time_hours: Mapped[float] = mapped_column(Numeric(6, 2), default=0.0)
    sla_breaches_count: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class ProjectMetric(Base):
    __tablename__ = "project_metrics"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("operations_planning.projects.id", ondelete="CASCADE"), nullable=False)
    task_count: Mapped[int] = mapped_column(Integer, default=0)
    completed_task_count: Mapped[int] = mapped_column(Integer, default=0)
    milestones_completed: Mapped[int] = mapped_column(Integer, default=0)
    milestones_total: Mapped[int] = mapped_column(Integer, default=0)
    days_to_deadline: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class ResourceMetric(Base):
    __tablename__ = "resource_metrics"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="CASCADE"), nullable=False)
    staff_allocated_count: Mapped[int] = mapped_column(Integer, default=0)
    equipment_allocated_count: Mapped[int] = mapped_column(Integer, default=0)
    conflicts_unresolved: Mapped[int] = mapped_column(Integer, default=0)
    crew_utilization_rate: Mapped[float] = mapped_column(Numeric(5, 2), default=0.0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class DeploymentMetric(Base):
    __tablename__ = "deployment_metrics"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    deployment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("deployment_management.deployments.id", ondelete="CASCADE"), nullable=False)
    runbook_steps_total: Mapped[int] = mapped_column(Integer, default=0)
    runbook_steps_completed: Mapped[int] = mapped_column(Integer, default=0)
    active_blockers_count: Mapped[int] = mapped_column(Integer, default=0)
    readiness_percentage: Mapped[float] = mapped_column(Numeric(5, 2), default=0.0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
