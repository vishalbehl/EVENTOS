"""Operational access records; deliberately independent of commercial workspaces."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint, Index, Integer, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def now() -> datetime:
    return datetime.now(timezone.utc)


class OperationalWorkspace(Base):
    __tablename__ = "operational_workspaces"
    __table_args__ = (
        UniqueConstraint("organization_id", "id", name="uq_operational_workspace_owner"),
        Index("uq_operational_workspace_default", "organization_id", unique=True, postgresql_where=text("is_default = true")),
        CheckConstraint("status IN ('ACTIVE', 'ARCHIVED')", name="ck_operational_workspace_status"),
        Index("ix_operational_workspace_page", "organization_id", "status", "id"),
        {"schema": "organizer_access"},
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVE", server_default="ACTIVE")
    is_default: Mapped[bool] = mapped_column(default=False, server_default="false")
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, nullable=False)


class WorkspaceRoleBinding(Base):
    __tablename__ = "workspace_role_bindings"
    __table_args__ = (
        UniqueConstraint("organization_id", "workspace_id", "member_id", name="uq_workspace_member_binding"),
        ForeignKeyConstraint(["organization_id", "workspace_id"], ["organizer_access.operational_workspaces.organization_id", "organizer_access.operational_workspaces.id"]),
        ForeignKeyConstraint(["organization_id", "member_id"], ["organizer_access.organization_members.organization_id", "organizer_access.organization_members.id"]),
        CheckConstraint("role IN ('admin', 'member', 'viewer')", name="ck_workspace_binding_role"),
        Index("ix_workspace_binding_subject", "member_id", "workspace_id"),
        {"schema": "organizer_access"},
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    member_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    is_active: Mapped[bool] = mapped_column(default=True, server_default="true", nullable=False)


class ClientRelationship(Base):
    __tablename__ = "emc_client_relationships"
    __table_args__ = (
        UniqueConstraint("id", "client_organization_id", "emc_organization_id", name="uq_relationship_parties"),
        CheckConstraint("emc_organization_id <> client_organization_id", name="ck_client_relationship_distinct"),
        CheckConstraint("status IN ('REQUESTED', 'ACTIVE', 'SUSPENDED', 'REJECTED', 'DETACHED')", name="ck_client_relationship_status"),
        Index("uq_client_managing_emc", "client_organization_id", unique=True, postgresql_where=text("status IN ('ACTIVE', 'SUSPENDED')")),
        Index("ix_client_relationship_portfolio", "emc_organization_id", "status", "id"),
        Index("ix_client_relationship_inbox", "client_organization_id", "status", "id"),
        {"schema": "organizer_access"},
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    emc_organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id"), nullable=False)
    client_organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id"), nullable=False)
    requested_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id"), nullable=False)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id"))
    status: Mapped[str] = mapped_column(String(20), default="REQUESTED", nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    # Requested scopes are immutable after activation; expansion requires new consent.
    scopes: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, nullable=False)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now, nullable=False)
    policy_revision: Mapped[int] = mapped_column(BigInteger, default=1, server_default="1", nullable=False)


class ClientDelegation(Base):
    """Approved immutable scope; live relationship/membership remain authority."""
    __tablename__ = "emc_client_delegations"
    __table_args__ = (
        CheckConstraint("jsonb_typeof(actions) = 'array' AND jsonb_array_length(actions) BETWEEN 1 AND 32", name="ck_delegation_actions"),
        ForeignKeyConstraint(["relationship_id", "client_organization_id", "emc_organization_id"],
            ["organizer_access.emc_client_relationships.id", "organizer_access.emc_client_relationships.client_organization_id",
             "organizer_access.emc_client_relationships.emc_organization_id"]),
        ForeignKeyConstraint(["client_organization_id", "workspace_id"],
            ["organizer_access.operational_workspaces.organization_id", "organizer_access.operational_workspaces.id"]),
        ForeignKeyConstraint(["emc_organization_id", "member_id"],
            ["organizer_access.organization_members.organization_id", "organizer_access.organization_members.id"]),
        Index("ix_delegation_member_context", "member_id", "client_organization_id", "workspace_id", "event_id"),
        ForeignKeyConstraint(["client_organization_id", "event_id"],
            ["events.events.organization_id", "events.events.id"],
            name="fk_delegation_event_tenant"),
        Index("ix_delegation_event_owner", "client_organization_id", "event_id"),
        Index("ix_delegation_relationship", "relationship_id"),
        {"schema": "organizer_access"},
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    relationship_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    client_organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    emc_organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    member_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    event_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("events.events.id"))
    actions: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now)


class OrganizationAccessRevision(Base):
    __tablename__ = "organization_access_revisions"
    __table_args__ = {"schema": "organizer_access"}
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id"), primary_key=True)
    revision: Mapped[int] = mapped_column(BigInteger, nullable=False, default=1, server_default="1")


class ClientProvisioning(Base):
    """Status-only provisioning link; never a client operational membership."""
    __tablename__ = "emc_client_provisioning"
    __table_args__ = (
        ForeignKeyConstraint(["relationship_id", "client_organization_id", "emc_organization_id"],
            ["organizer_access.emc_client_relationships.id", "organizer_access.emc_client_relationships.client_organization_id",
             "organizer_access.emc_client_relationships.emc_organization_id"]),
        ForeignKeyConstraint(["client_organization_id", "owner_member_id"],
            ["organizer_access.organization_members.organization_id", "organizer_access.organization_members.id"]),
        UniqueConstraint("client_organization_id", name="uq_provisioned_client"),
        Index("ix_client_provisioning_emc", "emc_organization_id", "id"),
        {"schema": "organizer_access"},
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    emc_organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    client_organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    relationship_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    owner_member_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, nullable=False)


class AccessMutation(Base):
    """Payload-bound replay record, committed with the mutation and audit."""
    __tablename__ = "access_mutations"
    __table_args__ = {"schema": "organizer_access"}
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id"), primary_key=True)
    actor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id"), primary_key=True)
    operation: Mapped[str] = mapped_column(String(80), primary_key=True)
    key: Mapped[str] = mapped_column(String(200), primary_key=True)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    result: Mapped[dict] = mapped_column(JSONB, nullable=False)
