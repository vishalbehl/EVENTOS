import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint, Index, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CatalogueDocumentReconciliation(Base):
    """Immutable validation evidence for non-template form aggregates."""
    __tablename__ = "catalogue_document_reconciliations"
    __table_args__ = (
        UniqueConstraint("resource_type", "resource_id", "resource_version", "operation",
            name="uq_catalogue_document_reconciliation_resource_version_operation"),
        {"schema": "design"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True),
        ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=True, index=True)
    event_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    resource_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    resource_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    resource_version: Mapped[int] = mapped_column(Integer, nullable=False)
    operation: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    reason: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    details: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    actor_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True),
        ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc), index=True)


class CatalogueReconciliationRun(Base):
    """Durable dispatch authority for a bounded whole-cohort reconciliation."""
    __tablename__ = "catalogue_reconciliation_runs"
    __table_args__ = (
        UniqueConstraint("id", "organization_id", name="uq_catalogue_run_owner"),
        Index("ix_catalogue_reconciliation_runs_dispatch",
            "status", "next_dispatch_at", "created_at"),
        CheckConstraint("status IN ('PENDING','RUNNING','DISPATCHED','FAILED')",
            name="ck_catalogue_reconciliation_run_status"),
        CheckConstraint("dispatch_attempts >= 0",
            name="ck_catalogue_reconciliation_run_dispatch_attempts"),
        {"schema": "design"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True),
        ForeignKey("platform.organizations.id", ondelete="RESTRICT"), nullable=False)
    actor_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True),
        ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True)
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="PENDING")
    dispatch_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    next_dispatch_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc))
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    dispatched_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    failure_code: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    enumeration_cursor: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    enumeration_complete: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class CatalogueReconciliationWork(Base):
    """One durable, cursor-paged stream per run/target; queue is only a nudge."""
    __tablename__ = "catalogue_reconciliation_work"
    __table_args__ = (
        ForeignKeyConstraint(["run_id", "organization_id"],
            ["design.catalogue_reconciliation_runs.id", "design.catalogue_reconciliation_runs.organization_id"],
            ondelete="RESTRICT", name="fk_catalogue_work_run_owner"),
        UniqueConstraint("run_id", "target_organization_id", "kind", name="uq_catalogue_work_stream"),
        CheckConstraint("kind IN ('GLOBAL','TENANT')", name="ck_catalogue_work_kind"),
        CheckConstraint("status IN ('PENDING','RUNNING','COMPLETED','FAILED')", name="ck_catalogue_work_status"),
        CheckConstraint("generation >= 0 AND dispatch_attempts >= 0 AND pages_completed >= 0 AND checked_count >= 0 AND blocked_count >= 0",
            name="ck_catalogue_work_counters"),
        CheckConstraint("coverage_version IN (1,2)", name="ck_catalogue_work_coverage"),
        CheckConstraint("status<>'COMPLETED' OR (kind='GLOBAL' AND stage='GLOBAL_TEMPLATE' AND pages_completed>=2) OR "
            "(kind='TENANT' AND coverage_version=1 AND stage='ABSTRACT_FORM' AND pages_completed>=4) OR "
            "(kind='TENANT' AND coverage_version=2 AND stage='PROGRAMME_RUBRIC' AND pages_completed>=5)", name="ck_catalogue_work_completion"),
        CheckConstraint("(kind='GLOBAL' AND stage IN ('GLOBAL_CATEGORY','GLOBAL_TEMPLATE') AND target_organization_id=organization_id) OR "
            "(kind='TENANT' AND (stage IN ('FORM_CATEGORY','FORM_TEMPLATE','REGISTRATION_FORM','ABSTRACT_FORM') OR "
            "(coverage_version=2 AND stage='PROGRAMME_RUBRIC')) AND target_organization_id<>organization_id)",
            name="ck_catalogue_work_stage"),
        Index("ix_catalogue_work_dispatch", "organization_id", "status", "next_dispatch_at", "id"),
        Index("ix_catalogue_work_run_status", "run_id", "status"),
        {"schema": "design"},
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    target_organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True),
        ForeignKey("platform.organizations.id", ondelete="RESTRICT"), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    stage: Mapped[str] = mapped_column(String(32), nullable=False)
    coverage_version: Mapped[int] = mapped_column(Integer, nullable=False, default=2, server_default="2")
    cursor: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING")
    generation: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    dispatch_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    next_dispatch_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc))
    pages_completed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    checked_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    blocked_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failure_code: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
