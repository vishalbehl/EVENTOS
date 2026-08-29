from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class WebsiteSiteDraft(Base):
    __tablename__ = "site_drafts"
    __table_args__ = (
        Index("ix_site_drafts_site_id", "site_id"),
        UniqueConstraint("site_id", name="uq_website_site_drafts_site_id"),
        {"schema": "websites"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    site_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("websites.sites.id", ondelete="CASCADE"), nullable=False)
    document: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    schema_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    checksum: Mapped[str] = mapped_column(String(80), nullable=False)
    revision_counter: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    editor_schema_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class WebsiteSite(Base):
    __tablename__ = "sites"
    __table_args__ = (
        Index("ix_website_builder_sites_event_id", "event_id"),
        Index("ix_website_builder_sites_status", "status"),
        Index("ix_website_builder_sites_slug", "slug", unique=True),
        {"schema": "websites"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="CASCADE"), nullable=False)
    template_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False)
    domain: Mapped[Optional[str]] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="DRAFT")
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    current_draft_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    current_deployment_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    settings: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    editor_schema_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class WebsiteSiteRevision(Base):
    __tablename__ = "site_revisions"
    __table_args__ = (
        Index("ix_site_revisions_site_id", "site_id"),
        UniqueConstraint("site_id", "revision_number", name="uq_website_site_revisions_number"),
        {"schema": "websites"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    site_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("websites.sites.id", ondelete="CASCADE"), nullable=False)
    revision_number: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(String(40), nullable=False)
    document: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    schema_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    checksum: Mapped[str] = mapped_column(String(80), nullable=False)
    diagnostics: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class WebsiteSiteDeployment(Base):
    __tablename__ = "site_deployments"
    __table_args__ = (
        Index("ix_site_deployments_site_id", "site_id"),
        {"schema": "websites"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    site_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("websites.sites.id", ondelete="CASCADE"), nullable=False)
    revision_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("websites.site_revisions.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="PENDING")
    storage_prefix: Mapped[str] = mapped_column(Text, nullable=False)
    rendered_manifest: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    diagnostics: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    activated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class WebsiteEditorSession(Base):
    __tablename__ = "site_editor_sessions"
    __table_args__ = (
        Index("ix_site_editor_sessions_site_id", "site_id"),
        {"schema": "websites"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    site_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("websites.sites.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="CASCADE"), nullable=False)
    mode: Mapped[str] = mapped_column(String(20), nullable=False, default="EDITOR")
    heartbeat_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    session_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class WebsiteSiteAssetRef(Base):
    __tablename__ = "site_asset_refs"
    __table_args__ = (
        Index("ix_site_asset_refs_site_id", "site_id"),
        {"schema": "websites"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    site_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("websites.sites.id", ondelete="CASCADE"), nullable=False)
    asset_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    kind: Mapped[str] = mapped_column(String(30), nullable=False)
    source: Mapped[str] = mapped_column(String(40), nullable=False, default="upload")
    url: Mapped[Optional[str]] = mapped_column(Text)
    storage_path: Mapped[Optional[str]] = mapped_column(Text)
    creator: Mapped[Optional[str]] = mapped_column(Text)
    license: Mapped[Optional[str]] = mapped_column(Text)
    attribution: Mapped[Optional[str]] = mapped_column(Text)
    asset_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class WebsiteSiteLinkIndex(Base):
    __tablename__ = "site_link_index"
    __table_args__ = (
        Index("ix_site_link_index_site_id", "site_id"),
        {"schema": "websites"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    site_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("websites.sites.id", ondelete="CASCADE"), nullable=False)
    source_instance_id: Mapped[str] = mapped_column(String(120), nullable=False)
    source_page_id: Mapped[Optional[str]] = mapped_column(String(120))
    target_type: Mapped[str] = mapped_column(String(40), nullable=False)
    target_value: Mapped[Optional[str]] = mapped_column(Text)
    target_page_id: Mapped[Optional[str]] = mapped_column(String(120))
    target_anchor_id: Mapped[Optional[str]] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="OK")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class WebsiteSiteDomain(Base):
    __tablename__ = "site_domains"
    __table_args__ = (
        Index("ix_site_domains_site_id", "site_id"),
        Index("ix_site_domains_domain", "domain", unique=True),
        {"schema": "websites"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    site_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("websites.sites.id", ondelete="CASCADE"), nullable=False)
    domain: Mapped[str] = mapped_column(String(255), nullable=False)
    verification_token: Mapped[str] = mapped_column(String(120), nullable=False)
    dns_state: Mapped[str] = mapped_column(String(30), nullable=False, default="PENDING")
    tls_state: Mapped[str] = mapped_column(String(30), nullable=False, default="PENDING")
    active_deployment_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("websites.site_deployments.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class WebsiteFormSubmission(Base):
    __tablename__ = "form_submissions"
    __table_args__ = (
        Index("ix_form_submissions_site_id", "site_id"),
        {"schema": "websites"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    site_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("websites.sites.id", ondelete="CASCADE"), nullable=False)
    event_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="CASCADE"))
    component_instance_id: Mapped[str] = mapped_column(String(120), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    consent: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    spam_status: Mapped[str] = mapped_column(String(30), nullable=False, default="PENDING")
    ip_hash: Mapped[Optional[str]] = mapped_column(String(128))
    user_agent: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class WebsiteMutationRequest(Base):
    __tablename__ = "mutation_requests"
    __table_args__ = (
        Index("ix_website_mutation_requests_scope", "scope_type", "scope_id"),
        UniqueConstraint("scope_type", "scope_id", "operation", "idempotency_key", name="uq_website_mutation_request_key"),
        {"schema": "websites"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scope_type: Mapped[str] = mapped_column(String(20), nullable=False)
    scope_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    operation: Mapped[str] = mapped_column(String(60), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(200), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(80), nullable=False)
    response_type: Mapped[Optional[str]] = mapped_column(String(60))
    response_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    response_payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
