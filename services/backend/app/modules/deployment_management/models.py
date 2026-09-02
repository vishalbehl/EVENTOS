import uuid
from typing import Any
from datetime import date
from sqlalchemy import Date, Float, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class _DeploymentModel(Base):
    __abstract__ = True
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    def __init__(self, **kwargs: Any) -> None:
        for key, value in kwargs.items():
            setattr(self, key, value)

def _model(name: str):
    return type(name, (_DeploymentModel,), {"__tablename__": name.lower(), "__table_args__": {"schema": "deployment_management"}, "__module__": __name__})

class ReadinessScore(_DeploymentModel):
    __tablename__ = "readiness_scores"
    __table_args__ = {"schema": "deployment_management"}
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    content_score: Mapped[float] = mapped_column(Float, default=0)
    venue_score: Mapped[float] = mapped_column(Float, default=0)
    compliance_score: Mapped[float] = mapped_column(Float, default=0)

class ProjectProfitability(_DeploymentModel):
    __tablename__ = "project_profitability"
    __table_args__ = {"schema": "deployment_management"}
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    total_revenue: Mapped[float] = mapped_column(Float, default=0)
    total_estimated_costs: Mapped[float] = mapped_column(Float, default=0)
    total_actual_costs: Mapped[float] = mapped_column(Float, default=0)
    gross_profit: Mapped[float] = mapped_column(Float, default=0)
    margin_percentage: Mapped[float] = mapped_column(Float, default=0)

class Deployment(_DeploymentModel):
    __tablename__ = "deployments"
    __table_args__ = {"schema": "deployment_management"}
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    deployment_number: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    deployment_date: Mapped[date] = mapped_column(Date, nullable=False)
    deployment_status: Mapped[str] = mapped_column(String(50), nullable=False)

class DeploymentChecklist(_DeploymentModel):
    __tablename__ = "deployment_checklists"
    __table_args__ = {"schema": "deployment_management"}
    deployment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="PENDING")

class Risk(_DeploymentModel):
    __tablename__ = "risks"
    __table_args__ = {"schema": "deployment_management"}
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    probability: Mapped[str] = mapped_column(String(20), nullable=False)
    mitigation_plan: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), nullable=False)

for _name in ("DeploymentLog", "DeploymentRunbook", "DeploymentStep", "Issue", "RiskAction", "ProjectCost", "ProjectActual", "ProjectActualCost"):
    globals()[_name] = _model(_name)
