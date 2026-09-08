from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, Index
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class RequirementTemplate(Base):
    __tablename__ = "requirement_templates"
    __table_args__ = {"schema": "technology_services"}
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)


class VenueOpsServiceDefinition(Base):
    __tablename__ = "venue_ops_service_definitions"
    __table_args__ = {"schema": "technology_services"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    category: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    unit_type: Mapped[str] = mapped_column(String(30), nullable=False, default="event")
    requirement_schema: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    dependencies: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    template_refs: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class VenueOpsRecommendationRule(Base):
    __tablename__ = "venue_ops_recommendation_rules"
    __table_args__ = (
        Index("ix_venue_ops_rules_service_active", "service_definition_id", "is_active"),
        {"schema": "technology_services"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    service_definition_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("technology_services.venue_ops_service_definitions.id", ondelete="CASCADE"), nullable=False)
    metric: Mapped[str] = mapped_column(String(80), nullable=False)
    operator: Mapped[str] = mapped_column(String(10), nullable=False, default=">=")
    threshold: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    quantity_formula: Mapped[dict] = mapped_column(JSONB, nullable=False, default=lambda: {"type": "constant", "value": 1})
    priority: Mapped[str] = mapped_column(String(20), nullable=False, default="RECOMMENDED")
    explanation: Mapped[str] = mapped_column(String(500), nullable=False)
    requires_confirmation: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


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
    event_snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    planning_overrides: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    submitted_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    items: Mapped[list["ServiceRequestItem"]] = relationship(cascade="all, delete-orphan", order_by="ServiceRequestItem.id", lazy="selectin")
    comments: Mapped[list["ServiceRequestComment"]] = relationship(cascade="all, delete-orphan", order_by="ServiceRequestComment.created_at", lazy="selectin")


class ServiceRequestItem(Base):
    __tablename__ = "service_request_items"
    __table_args__ = {"schema": "technology_services"}
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("technology_services.service_requests.id"), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    service_definition_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("technology_services.venue_ops_service_definitions.id", ondelete="SET NULL"), nullable=True)
    template_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    template_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    template_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    source: Mapped[str] = mapped_column(String(30), nullable=False, default="ORGANISER_ADDED")
    duration_days: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    room_scope: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    configuration: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    included_scope: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    excluded_scope: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)


class ServiceRequestComment(Base):
    __tablename__ = "service_request_comments"
    __table_args__ = {"schema": "technology_services"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("technology_services.service_requests.id", ondelete="CASCADE"), nullable=False, index=True)
    author_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    author_type: Mapped[str] = mapped_column(String(20), nullable=False, default="ORGANISER")
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class ServiceRequestEventSnapshot(Base):
    __tablename__ = "request_event_snapshots"
    __table_args__ = {"schema": "technology_services"}
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("technology_services.service_requests.id", ondelete="CASCADE"), nullable=False, index=True)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    run_number: Mapped[int] = mapped_column(Integer, nullable=False)
    facts: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    overrides: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class ServiceRequestAttachment(Base):
    __tablename__ = "service_request_attachments"
    __table_args__ = {"schema": "technology_services"}
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("technology_services.service_requests.id", ondelete="CASCADE"), nullable=False, index=True)
    uploaded_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    content_type: Mapped[str] = mapped_column(String(120), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class VenueOpsOutboxEvent(Base):
    __tablename__ = "venue_ops_outbox_events"
    __table_args__ = {"schema": "technology_services"}
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    event_name: Mapped[str] = mapped_column(String(100), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="PENDING", index=True)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    dispatched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class VenueOpsFulfilmentHandoff(Base):
    __tablename__ = "venue_ops_fulfilment_handoffs"
    __table_args__ = {"schema": "technology_services"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("technology_services.service_requests.id", ondelete="CASCADE"), nullable=False, unique=True)
    quote_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, unique=True)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="PLANNING")
    approved_version: Mapped[int] = mapped_column(Integer, nullable=False)
    locked_scope: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


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
