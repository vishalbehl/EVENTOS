from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class RequirementTemplate(Base):
    __tablename__ = "requirement_templates"
    __table_args__ = {"schema": "technology_services"}
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)


class RequirementFormTemplate(Base):
    __tablename__ = "requirement_form_templates"
    __table_args__ = {"schema": "technology_services"}
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("technology_services.requirement_templates.id"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class RequirementFormField(Base):
    __tablename__ = "requirement_form_fields"
    __table_args__ = {"schema": "technology_services"}
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    form_template_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("technology_services.requirement_form_templates.id"), nullable=False)
    field_name: Mapped[str] = mapped_column(String(100), nullable=False)
    label: Mapped[str] = mapped_column(String(150), nullable=False)
    field_type: Mapped[str] = mapped_column(String(50), nullable=False)
    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    field_config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class ServiceLevel(Base):
    __tablename__ = "service_levels"
    __table_args__ = {"schema": "technology_services"}
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)


class ServiceSlaPolicy(Base):
    __tablename__ = "service_sla_policies"
    __table_args__ = {"schema": "technology_services"}
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    service_level_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("technology_services.service_levels.id"), nullable=False)
    request_priority: Mapped[str] = mapped_column(String(20), nullable=False)
    response_time_hours: Mapped[int] = mapped_column(Integer, nullable=False)
    resolution_time_hours: Mapped[int] = mapped_column(Integer, nullable=False)


class ServiceRequest(Base):
    __tablename__ = "service_requests"
    __table_args__ = {"schema": "technology_services"}
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    request_number: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="SUBMITTED", index=True)
    priority: Mapped[str] = mapped_column(String(20), nullable=False, default="NORMAL")
    request_type: Mapped[str] = mapped_column(String(50), nullable=False)
    requested_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class ServiceRequestItem(Base):
    __tablename__ = "service_request_items"
    __table_args__ = {"schema": "technology_services"}
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("technology_services.service_requests.id"), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class RequirementResponse(Base):
    __tablename__ = "requirement_responses"
    __table_args__ = {"schema": "technology_services"}
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("technology_services.service_requests.id"), nullable=False)
    field_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("technology_services.requirement_form_fields.id"), nullable=False)
    value_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)


class RequestAssignment(Base):
    __tablename__ = "request_assignments"
    __table_args__ = {"schema": "technology_services"}
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("technology_services.service_requests.id"), nullable=False)
    assigned_to: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    assigned_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    role: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="ACTIVE")


class ServiceSlaTarget(Base):
    __tablename__ = "service_sla_targets"
    __table_args__ = {"schema": "technology_services"}
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("technology_services.service_requests.id"), nullable=False)
    policy_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("technology_services.service_sla_policies.id"), nullable=False)
    response_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    resolution_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class ServiceSlaBreach(Base):
    __tablename__ = "service_sla_breaches"
    __table_args__ = {"schema": "technology_services"}
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("technology_services.service_requests.id"), nullable=False)
    breach_type: Mapped[str] = mapped_column(String(30), nullable=False)
    breached_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
