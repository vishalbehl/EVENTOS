"""Small, explicit ORM boundary for planning records.

The database schema is migration-owned; these models provide the application
mapping used by services and integration tests without embedding workflow logic.
"""
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Date, DateTime, Float, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class _PlanningModel(Base):
    __abstract__ = True
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    def __init__(self, **kwargs: Any) -> None:
        for key, value in kwargs.items():
            setattr(self, key, value)


class ProjectTemplate(_PlanningModel):
    __tablename__ = "project_templates"
    __table_args__ = {"schema": "operations_planning"}
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)


class ProjectTemplateTask(_PlanningModel):
    __tablename__ = "project_template_tasks"
    __table_args__ = {"schema": "operations_planning"}
    template_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    relative_due_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    priority: Mapped[str] = mapped_column(String(20), nullable=False, default="NORMAL")


class Project(_PlanningModel):
    __tablename__ = "projects"
    __table_args__ = {"schema": "operations_planning"}
    organization_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    event_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)
    service_request_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    project_code: Mapped[str | None] = mapped_column(String(100))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="PLANNING")
    start_date: Mapped[Any | None] = mapped_column(Date)
    end_date: Mapped[Any | None] = mapped_column(Date)
    project_manager_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    completion_percentage: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)


class ProjectTask(_PlanningModel):
    __tablename__ = "project_tasks"
    __table_args__ = {"schema": "operations_planning"}
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    assigned_to: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="TODO")
    priority: Mapped[str] = mapped_column(String(20), nullable=False, default="NORMAL")
    start_date: Mapped[Any | None] = mapped_column(Date)
    due_date: Mapped[Any | None] = mapped_column(Date)


class Milestone(_PlanningModel):
    __tablename__ = "milestones"
    __table_args__ = {"schema": "operations_planning"}
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="TODO")
    start_date: Mapped[Any | None] = mapped_column(Date)
    due_date: Mapped[Any | None] = mapped_column(Date)
    completed_at: Mapped[Any | None] = mapped_column(DateTime(timezone=True))


def _simple_model(name: str):
    return type(name, (_PlanningModel,), {"__tablename__": name.lower(), "__table_args__": {"schema": "operations_planning"}, "__module__": __name__})


for _name in ("EventTimeline", "TimelineMilestone", "ProjectVendor", "ProjectBlocker"):
    globals()[_name] = _simple_model(_name)
