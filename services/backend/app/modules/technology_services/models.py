import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from sqlalchemy import String, Text, DateTime, ForeignKey, Index, Integer, Boolean, JSON, Numeric
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

class ServiceRequest(Base):
    __tablename__ = "service_requests"
    __table_args__ = (
        Index("idx_request_status", "status"),
        Index("idx_request_org_event", "organization_id", "event_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="CASCADE"), nullable=False, index=True)
    request_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Statuses: DRAFT, SUBMITTED, TRIAGED, IN_REVIEW, ESTIMATING, QUOTED, AWAITING_APPROVAL, APPROVED, PLANNING, IN_EXECUTION, READY, COMPLETED, CANCELLED, REJECTED
    status: Mapped[str] = mapped_column(String(50), default="DRAFT", index=True) 
    priority: Mapped[str] = mapped_column(String(20), default="MEDIUM") # LOW, MEDIUM, HIGH, CRITICAL
    request_type: Mapped[str] = mapped_column(String(50), default="CUSTOM")
    requested_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="RESTRICT"), nullable=False)
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    items: Mapped[List["ServiceRequestItem"]] = relationship("ServiceRequestItem", back_populates="service_request", cascade="all, delete-orphan")
    requirements: Mapped[List["Requirement"]] = relationship("Requirement", back_populates="service_request", cascade="all, delete-orphan")
    comments: Mapped[List["RequestComment"]] = relationship("RequestComment", back_populates="service_request", cascade="all, delete-orphan")
    history: Mapped[List["RequestHistory"]] = relationship("RequestHistory", back_populates="service_request", cascade="all, delete-orphan")
    assignments: Mapped[List["RequestAssignment"]] = relationship("RequestAssignment", back_populates="service_request", cascade="all, delete-orphan")
    projects: Mapped[List["app.modules.operations_planning.models.Project"]] = relationship("Project", back_populates="service_request")

class ServiceRequestItem(Base):
    __tablename__ = "service_request_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    service_request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("technology_services.service_requests.id", ondelete="CASCADE"), nullable=False)
    service_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("commercial.services.id", ondelete="RESTRICT"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    configuration: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    service_request: Mapped["ServiceRequest"] = relationship("ServiceRequest", back_populates="items")
    service: Mapped["app.modules.commercial.models.Service"] = relationship("Service")

class Requirement(Base):
    __tablename__ = "requirements"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    service_request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("technology_services.service_requests.id", ondelete="CASCADE"), nullable=False)
    requirement_type: Mapped[str] = mapped_column(String(50), nullable=False) # e.g. REGISTRATION, SRR, ROOM, SIGNAGE, NETWORK, CUSTOM
    requirement_data: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict)

    service_request: Mapped["ServiceRequest"] = relationship("ServiceRequest", back_populates="requirements")
    documents: Mapped[List["RequirementDocument"]] = relationship("RequirementDocument", back_populates="requirement", cascade="all, delete-orphan")

class RequirementDocument(Base):
    __tablename__ = "requirement_documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    requirement_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("technology_services.requirements.id", ondelete="CASCADE"), nullable=False)
    file_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("files.assets.id", ondelete="CASCADE"), nullable=False)
    uploaded_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="RESTRICT"), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    requirement: Mapped["Requirement"] = relationship("Requirement", back_populates="documents")
    asset: Mapped["app.modules.files.models.file.Asset"] = relationship("Asset")

class RequestComment(Base):
    __tablename__ = "request_comments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("technology_services.service_requests.id", ondelete="CASCADE"), nullable=False)
    comment: Mapped[str] = mapped_column(Text, nullable=False)
    is_internal: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="RESTRICT"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    service_request: Mapped["ServiceRequest"] = relationship("ServiceRequest", back_populates="comments")
    creator: Mapped["app.modules.identity.models.user.User"] = relationship("User")

class RequestHistory(Base):
    __tablename__ = "request_history"
    __table_args__ = (
        {"postgresql_partition_by": "RANGE (performed_at)"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("technology_services.service_requests.id", ondelete="CASCADE"), nullable=False)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    old_status: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    new_status: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    performed_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="RESTRICT"), nullable=False)
    performed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True, default=lambda: datetime.now(timezone.utc))
    metadata_json: Mapped[Optional[Dict[str, Any]]] = mapped_column("metadata", JSONB, nullable=True)

    service_request: Mapped["ServiceRequest"] = relationship("ServiceRequest", back_populates="history")
    performer: Mapped["app.modules.identity.models.user.User"] = relationship("User")

class RequestAssignment(Base):
    __tablename__ = "request_assignments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("technology_services.service_requests.id", ondelete="CASCADE"), nullable=False)
    assigned_to: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="RESTRICT"), nullable=False)
    assigned_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="RESTRICT"), nullable=False)
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    role: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="ACTIVE")

    service_request: Mapped["ServiceRequest"] = relationship("ServiceRequest", back_populates="assignments")
    assignee: Mapped["app.modules.identity.models.user.User"] = relationship("User", foreign_keys=[assigned_to])
    assigner: Mapped["app.modules.identity.models.user.User"] = relationship("User", foreign_keys=[assigned_by])

class ServiceLevel(Base):
    __tablename__ = "service_levels"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class ServiceSlaPolicy(Base):
    __tablename__ = "service_sla_policies"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    service_level_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("technology_services.service_levels.id", ondelete="CASCADE"), nullable=False)
    request_priority: Mapped[str] = mapped_column(String(50), nullable=False)
    response_time_hours: Mapped[int] = mapped_column(Integer, nullable=False)
    resolution_time_hours: Mapped[int] = mapped_column(Integer, nullable=False)

    service_level: Mapped["ServiceLevel"] = relationship("ServiceLevel")

class ServiceSlaTarget(Base):
    __tablename__ = "service_sla_targets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("technology_services.service_requests.id", ondelete="CASCADE"), nullable=False)
    policy_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("technology_services.service_sla_policies.id", ondelete="RESTRICT"), nullable=False)
    response_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    resolution_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    responded_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    service_request: Mapped["ServiceRequest"] = relationship("ServiceRequest")
    policy: Mapped["ServiceSlaPolicy"] = relationship("ServiceSlaPolicy")

class ServiceSlaBreach(Base):
    __tablename__ = "service_sla_breaches"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    target_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("technology_services.service_sla_targets.id", ondelete="CASCADE"), nullable=False)
    breach_type: Mapped[str] = mapped_column(String(50), nullable=False)
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    target: Mapped["ServiceSlaTarget"] = relationship("ServiceSlaTarget")

class RequirementTemplate(Base):
    __tablename__ = "requirement_templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class RequirementFormTemplate(Base):
    __tablename__ = "requirement_form_templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("technology_services.requirement_templates.id", ondelete="CASCADE"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    template: Mapped["RequirementTemplate"] = relationship("RequirementTemplate")
    fields: Mapped[List["RequirementFormField"]] = relationship("RequirementFormField", back_populates="form_template", cascade="all, delete-orphan")

class RequirementFormField(Base):
    __tablename__ = "requirement_form_fields"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    form_template_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("technology_services.requirement_form_templates.id", ondelete="CASCADE"), nullable=False)
    field_name: Mapped[str] = mapped_column(String(100), nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    field_type: Mapped[str] = mapped_column(String(50), nullable=False)
    is_required: Mapped[bool] = mapped_column(Boolean, default=False)
    field_config: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    form_template: Mapped["RequirementFormTemplate"] = relationship("RequirementFormTemplate", back_populates="fields")

class RequirementResponse(Base):
    __tablename__ = "requirement_responses"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("technology_services.service_requests.id", ondelete="CASCADE"), nullable=False)
    field_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("technology_services.requirement_form_fields.id", ondelete="CASCADE"), nullable=False)
    value_json: Mapped[Dict[str, Any]] = mapped_column("value", JSONB, default=dict)

    service_request: Mapped["ServiceRequest"] = relationship("ServiceRequest")
    field: Mapped["RequirementFormField"] = relationship("RequirementFormField")
