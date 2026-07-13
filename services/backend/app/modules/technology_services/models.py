from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class RequirementTemplate(Base):
    __tablename__ = "requirement_templates"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    description: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class RequirementFormTemplate(Base):
    __tablename__ = "requirement_form_templates"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("technology_services.requirement_templates.id", ondelete="CASCADE"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class RequirementFormField(Base):
    __tablename__ = "requirement_form_fields"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    form_template_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("technology_services.requirement_form_templates.id", ondelete="CASCADE"), nullable=False)
    field_name: Mapped[str] = mapped_column(String(100), nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    field_type: Mapped[str] = mapped_column(String(50), nullable=False)
    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    field_config: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class ServiceLevel(Base):
    __tablename__ = "service_levels"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    description: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ServiceSlaPolicy(Base):
    __tablename__ = "service_sla_policies"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    service_level_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("technology_services.service_levels.id", ondelete="CASCADE"), nullable=False)
    request_priority: Mapped[str] = mapped_column(String(50), nullable=False)
    response_time_hours: Mapped[int] = mapped_column(Integer, nullable=False)
    resolution_time_hours: Mapped[int] = mapped_column(Integer, nullable=False)


class ServiceRequest(Base):
    __tablename__ = "service_requests"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="CASCADE"), nullable=False, index=True)
    request_number: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    priority: Mapped[str] = mapped_column(String(20), nullable=False)
    request_type: Mapped[str] = mapped_column(String(50), nullable=False)
    requested_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="RESTRICT"), nullable=False)
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    items: Mapped[list["ServiceRequestItem"]] = relationship(
        back_populates="service_request", cascade="all, delete-orphan"
    )
    requirements: Mapped[list["Requirement"]] = relationship(
        back_populates="service_request", cascade="all, delete-orphan"
    )


class ServiceRequestItem(Base):
    __tablename__ = "service_request_items"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    service_request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("technology_services.service_requests.id", ondelete="CASCADE"), nullable=False)
    service_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("commercial.services.id", ondelete="RESTRICT"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    configuration: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    service_request: Mapped["ServiceRequest"] = relationship(back_populates="items")


class Requirement(Base):
    __tablename__ = "requirements"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    service_request_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("technology_services.service_requests.id", ondelete="CASCADE"),
        nullable=False,
    )
    requirement_type: Mapped[str] = mapped_column(String(50), nullable=False)
    requirement_data: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    service_request: Mapped["ServiceRequest"] = relationship(back_populates="requirements")


class RequirementResponse(Base):
    __tablename__ = "requirement_responses"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("technology_services.service_requests.id", ondelete="CASCADE"), nullable=False)
    field_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("technology_services.requirement_form_fields.id", ondelete="CASCADE"), nullable=False)
    value_json: Mapped[dict[str, Any]] = mapped_column("value", JSONB, nullable=False, default=dict)


class RequestAssignment(Base):
    __tablename__ = "request_assignments"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("technology_services.service_requests.id", ondelete="CASCADE"), nullable=False)
    assigned_to: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="RESTRICT"), nullable=False)
    assigned_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="RESTRICT"), nullable=False)
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    role: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False)


class ServiceSlaTarget(Base):
    __tablename__ = "service_sla_targets"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("technology_services.service_requests.id", ondelete="CASCADE"), nullable=False)
    policy_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("technology_services.service_sla_policies.id", ondelete="RESTRICT"), nullable=False)
    response_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    resolution_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    responded_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class ServiceSlaBreach(Base):
    __tablename__ = "service_sla_breaches"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    target_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("technology_services.service_sla_targets.id", ondelete="CASCADE"), nullable=False)
    breach_type: Mapped[str] = mapped_column(String(50), nullable=False)
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    notes: Mapped[Optional[str]] = mapped_column(Text)
