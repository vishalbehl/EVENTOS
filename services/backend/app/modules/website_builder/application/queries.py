from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from types import SimpleNamespace

from sqlalchemy import select

from app.database import AsyncSession
from app.modules.agenda.models import Session
from app.modules.events.models.speaker import Speaker
from app.modules.events.models.event import Event
from app.modules.sponsors.models.sponsor import Sponsor
from app.modules.files.models.file import Asset
from app.modules.website_builder.models import WebsiteSiteAssetRef, WebsiteSiteDomain, WebsiteSiteRevision
from app.modules.templates.models import WebsiteTemplate, WebsiteTemplateDraft


@dataclass(frozen=True)
class WebsiteAssetDiagnosticRow:
    id: uuid.UUID
    asset_id: uuid.UUID | None
    url: str | None
    storage_path: str | None
    processing_status: str


@dataclass(frozen=True)
class PublicWebsiteAssetRow:
    storage_path: str
    asset_metadata: dict
    processing_status: str


class WebsiteEventSnapshotQueryService:
    """Tenant/event-scoped read boundary for published website event data."""

    @staticmethod
    async def list_speakers(db: AsyncSession, event_id: uuid.UUID):
        return (
            await db.execute(
                select(
                    Speaker.id,
                    Speaker.first_name,
                    Speaker.last_name,
                    Speaker.designation,
                    Speaker.affiliation,
                    Speaker.photo_url,
                    Speaker.bio,
                )
                .where(Speaker.event_id == event_id)
                .order_by(Speaker.created_at.asc(), Speaker.id.asc())
                .limit(24)
            )
        ).all()

    @staticmethod
    async def list_sessions(db: AsyncSession, event_id: uuid.UUID):
        return (
            await db.execute(
                select(Session.id, Session.title, Session.start_time, Session.end_time)
                .where(
                    Session.event_id == event_id,
                    Session.is_published.is_(True),
                    Session.deleted_at.is_(None),
                )
                .order_by(Session.start_time.asc(), Session.id.asc())
                .limit(50)
            )
        ).all()

    @staticmethod
    async def list_sponsors(db: AsyncSession, organization_id: uuid.UUID):
        return (
            await db.execute(
                select(Sponsor.id, Sponsor.name, Sponsor.logo_url, Sponsor.website_url)
                .where(Sponsor.organization_id == organization_id)
                .order_by(Sponsor.created_at.asc(), Sponsor.id.asc())
                .limit(24)
            )
        ).all()

    @staticmethod
    async def list_asset_diagnostics(db: AsyncSession, site_id: uuid.UUID) -> list[WebsiteAssetDiagnosticRow]:
        rows = (
            await db.execute(
                select(
                    WebsiteSiteAssetRef.id,
                    WebsiteSiteAssetRef.asset_id,
                    WebsiteSiteAssetRef.url,
                    WebsiteSiteAssetRef.storage_path,
                    Asset.processing_status,
                )
                .outerjoin(Asset, Asset.id == WebsiteSiteAssetRef.asset_id)
                .where(WebsiteSiteAssetRef.site_id == site_id)
                .order_by(WebsiteSiteAssetRef.created_at.asc(), WebsiteSiteAssetRef.id.asc())
                .limit(200)
            )
        ).all()
        return [
            WebsiteAssetDiagnosticRow(
                id=row.id,
                asset_id=row.asset_id,
                url=row.url,
                storage_path=row.storage_path,
                processing_status=row.processing_status or "MISSING",
            )
            for row in rows
        ]

    @staticmethod
    async def get_public_asset(
        db: AsyncSession, site_id: uuid.UUID, asset_ref_id: uuid.UUID
    ) -> PublicWebsiteAssetRow | None:
        row = (
            await db.execute(
                select(
                    WebsiteSiteAssetRef.storage_path,
                    WebsiteSiteAssetRef.asset_metadata,
                    WebsiteSiteAssetRef.asset_id,
                    Asset.processing_status,
                )
                .outerjoin(Asset, Asset.id == WebsiteSiteAssetRef.asset_id)
                .where(
                    WebsiteSiteAssetRef.id == asset_ref_id,
                    WebsiteSiteAssetRef.site_id == site_id,
                )
                .execution_options(skip_tenant_filter=True)
            )
        ).one_or_none()
        if row is None:
            return None
        return PublicWebsiteAssetRow(
            storage_path=row.storage_path,
            asset_metadata=row.asset_metadata or {},
            processing_status=(row.processing_status or ("MISSING" if row.asset_id else "READY")),
        )

    @staticmethod
    async def list_asset_references(db: AsyncSession, site_id: uuid.UUID):
        return (
            await db.execute(
                select(
                    WebsiteSiteAssetRef.id,
                    WebsiteSiteAssetRef.kind,
                    WebsiteSiteAssetRef.source,
                    WebsiteSiteAssetRef.url,
                    WebsiteSiteAssetRef.storage_path,
                    WebsiteSiteAssetRef.creator,
                    WebsiteSiteAssetRef.license,
                    WebsiteSiteAssetRef.attribution,
                    WebsiteSiteAssetRef.asset_metadata,
                    WebsiteSiteAssetRef.created_at,
                ).where(WebsiteSiteAssetRef.site_id == site_id)
                .order_by(WebsiteSiteAssetRef.created_at.desc(), WebsiteSiteAssetRef.id.desc())
                .limit(200)
            )
        ).all()

    @staticmethod
    async def list_domains(db: AsyncSession, site_id: uuid.UUID):
        return (
            await db.execute(
                select(
                    WebsiteSiteDomain.id,
                    WebsiteSiteDomain.domain,
                    WebsiteSiteDomain.verification_token,
                    WebsiteSiteDomain.dns_state,
                    WebsiteSiteDomain.tls_state,
                    WebsiteSiteDomain.active_deployment_id,
                    WebsiteSiteDomain.created_at,
                    WebsiteSiteDomain.updated_at,
                ).where(WebsiteSiteDomain.site_id == site_id)
                .order_by(WebsiteSiteDomain.created_at.desc(), WebsiteSiteDomain.id.desc())
            )
        ).all()

    @staticmethod
    async def list_revisions(db: AsyncSession, site_id: uuid.UUID):
        return (
            await db.execute(
                select(
                    WebsiteSiteRevision.id,
                    WebsiteSiteRevision.revision_number,
                    WebsiteSiteRevision.reason,
                    WebsiteSiteRevision.checksum,
                    WebsiteSiteRevision.diagnostics,
                    WebsiteSiteRevision.created_at,
                ).where(WebsiteSiteRevision.site_id == site_id)
                .order_by(WebsiteSiteRevision.created_at.desc(), WebsiteSiteRevision.id.desc())
                .limit(50)
            )
        ).all()

    @staticmethod
    async def get_event_draft(db: AsyncSession, event_id: uuid.UUID, organization_id: uuid.UUID):
        # Keep lightweight read-only doubles compatible with the non-provisioning
        # fallback used by callers that do not expose an async execute method.
        if not hasattr(db, "execute"):
            return None
        row = (
            await db.execute(
                select(
                    WebsiteSite.id.label("site_id"), WebsiteSite.slug, WebsiteSite.event_id,
                    WebsiteSite.organization_id, WebsiteSiteDraft.id.label("draft_id"),
                    WebsiteSiteDraft.document, WebsiteSiteDraft.schema_version,
                    WebsiteSiteDraft.checksum, WebsiteSiteDraft.revision_counter,
                    WebsiteSiteDraft.updated_at,
                )
                .outerjoin(WebsiteSiteDraft, WebsiteSiteDraft.site_id == WebsiteSite.id)
                .where(WebsiteSite.event_id == event_id, WebsiteSite.organization_id == organization_id)
                .limit(1)
            )
        ).one_or_none()
        if row is None:
            return None
        site = SimpleNamespace(id=row.site_id, slug=row.slug, event_id=row.event_id, organization_id=row.organization_id)
        draft = None if row.draft_id is None else SimpleNamespace(
            id=row.draft_id, site_id=row.site_id, document=row.document,
            schema_version=row.schema_version, checksum=row.checksum,
            revision_counter=row.revision_counter, updated_at=row.updated_at,
        )
        return site, draft

    @staticmethod
    async def get_current_deployment(db: AsyncSession, site_id: uuid.UUID, deployment_id: uuid.UUID):
        row = (
            await db.execute(
                select(
                    WebsiteSiteDeployment.id,
                    WebsiteSiteDeployment.revision_id,
                    WebsiteSiteDeployment.site_id,
                    WebsiteSiteDeployment.status,
                    WebsiteSiteDeployment.storage_prefix,
                    WebsiteSiteDeployment.rendered_manifest,
                    WebsiteSiteDeployment.diagnostics,
                    WebsiteSiteDeployment.activated_at,
                ).where(
                    WebsiteSiteDeployment.id == deployment_id,
                    WebsiteSiteDeployment.site_id == site_id,
                )
            )
        ).one_or_none()
        return None if row is None else SimpleNamespace(**row._mapping)

    @staticmethod
    async def get_master_template_draft(db: AsyncSession):
        if not hasattr(db, "execute"):
            return None
        row = (
            await db.execute(
                select(
                    WebsiteTemplate.id.label("template_id"), WebsiteTemplate.name,
                    WebsiteTemplate.slug, WebsiteTemplateDraft.id.label("draft_id"),
                    WebsiteTemplateDraft.document, WebsiteTemplateDraft.schema_version,
                    WebsiteTemplateDraft.checksum, WebsiteTemplateDraft.optimistic_version,
                    WebsiteTemplateDraft.updated_at,
                )
                .outerjoin(WebsiteTemplateDraft, WebsiteTemplateDraft.template_id == WebsiteTemplate.id)
                .where(
                    WebsiteTemplate.template_type == "WEBSITE",
                    WebsiteTemplate.slug == "master-event-website",
                    WebsiteTemplate.is_system.is_(True),
                ).limit(1)
            )
        ).one_or_none()
        if row is None:
            return None
        template = SimpleNamespace(id=row.template_id, name=row.name, slug=row.slug)
        draft = None if row.draft_id is None else SimpleNamespace(
            id=row.draft_id, document=row.document, schema_version=row.schema_version,
            checksum=row.checksum, optimistic_version=row.optimistic_version,
            updated_at=row.updated_at,
        )
        return template, draft

    @staticmethod
    async def get_public_preview(db: AsyncSession, event_id: uuid.UUID, preview_id: uuid.UUID):
        row = (
            await db.execute(
                select(
                    WebsiteSite.id.label("site_id"), WebsiteSiteDeployment.id,
                    WebsiteSiteDeployment.rendered_manifest, WebsiteSiteDeployment.expires_at,
                ).join(WebsiteSiteDeployment, WebsiteSiteDeployment.site_id == WebsiteSite.id)
                .where(
                    WebsiteSite.event_id == event_id,
                    WebsiteSiteDeployment.id == preview_id,
                    WebsiteSiteDeployment.status == "PREVIEW",
                    WebsiteSiteDeployment.expires_at > datetime.now(timezone.utc),
                ).execution_options(skip_tenant_filter=True).limit(1)
            )
        ).one_or_none()
        if row is not None:
            return True, SimpleNamespace(**row._mapping)
        site_exists = (await db.execute(
            select(WebsiteSite.id).where(WebsiteSite.event_id == event_id)
            .execution_options(skip_tenant_filter=True).limit(1)
        )).scalar_one_or_none() is not None
        return site_exists, None

    @staticmethod
    async def get_published_site_by_slug(db: AsyncSession, site_slug: str):
        row = (
            await db.execute(
                select(
                    WebsiteSite.id.label("site_id"), WebsiteSite.current_deployment_id,
                    WebsiteSite.organization_id, WebsiteSite.status,
                    WebsiteSiteDeployment.id, WebsiteSiteDeployment.rendered_manifest,
                    WebsiteSiteDeployment.storage_prefix, WebsiteSiteDeployment.status.label("deployment_status"),
                ).outerjoin(
                    WebsiteSiteDeployment,
                    (WebsiteSiteDeployment.id == WebsiteSite.current_deployment_id)
                    & (WebsiteSiteDeployment.site_id == WebsiteSite.id)
                    & (WebsiteSiteDeployment.status == "ACTIVE"),
                ).where(
                    WebsiteSite.slug == site_slug,
                    WebsiteSite.status == "PUBLISHED",
                ).execution_options(skip_tenant_filter=True).limit(1)
            )
        ).one_or_none()
        return None if row is None else SimpleNamespace(
            id=row.id, site_id=row.site_id, organization_id=row.organization_id,
            current_deployment_id=row.current_deployment_id,
            rendered_manifest=row.rendered_manifest, storage_prefix=row.storage_prefix,
            status=row.deployment_status,
        )

    @staticmethod
    async def get_public_active_deployment(db: AsyncSession, event_id: uuid.UUID):
        rows = (
            await db.execute(
                select(
                    Event.id.label("event_id"), WebsiteSite.id.label("site_id"),
                    WebsiteSite.current_deployment_id,
                    WebsiteSiteDeployment.id, WebsiteSiteDeployment.revision_id,
                    WebsiteSiteDeployment.status, WebsiteSiteDeployment.storage_prefix,
                    WebsiteSiteDeployment.rendered_manifest, WebsiteSiteDeployment.diagnostics,
                    WebsiteSiteDeployment.activated_at,
                ).outerjoin(
                    WebsiteSite, (WebsiteSite.event_id == Event.id)
                    & (WebsiteSite.organization_id == Event.organization_id)
                    & (WebsiteSite.status == "PUBLISHED")
                    & (WebsiteSite.current_deployment_id.is_not(None)),
                ).outerjoin(
                    WebsiteSiteDeployment,
                    (WebsiteSiteDeployment.id == WebsiteSite.current_deployment_id)
                    & (WebsiteSiteDeployment.site_id == WebsiteSite.id)
                    & (WebsiteSiteDeployment.status == "ACTIVE"),
                ).where(Event.id == event_id, Event.deleted_at.is_(None))
                .execution_options(skip_tenant_filter=True).limit(1)
            )
        ).one_or_none()
        if rows is None:
            return False, None
        if rows.site_id is None or rows.id is None:
            return True, None
        return True, SimpleNamespace(
            id=rows.id, revision_id=rows.revision_id, site_id=rows.site_id,
            status=rows.status, storage_prefix=rows.storage_prefix,
            rendered_manifest=rows.rendered_manifest, diagnostics=rows.diagnostics,
            activated_at=rows.activated_at,
        )
