from __future__ import annotations

import uuid
import base64
from datetime import datetime, timedelta, timezone
import hashlib
import html
import json
import re
from typing import Any

import httpx
from fastapi import APIRouter, File, Header, HTTPException, Request, UploadFile, status
from fastapi.responses import HTMLResponse, RedirectResponse
from lxml import etree
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select, text, update
from starlette.concurrency import run_in_threadpool

from app.core.dependencies.feature_gate import enforce_event_operation, require_event_operation
from app.dependencies import ActiveUser, CurrentEvent, DB, SuperAdminOnly
from app.modules.audit.models.audit_log import AuditLog
from app.modules.agenda.models import Session
from app.modules.events.models.speaker import Speaker
from app.modules.sponsors.models.sponsor import Sponsor
from app.modules.templates.models import WebsiteTemplate, WebsiteTemplateDraft, WebsiteTemplatePreview, WebsiteTemplateVersion
from app.modules.events.models.event import Event
from app.modules.files.models.file import Asset
from app.modules.files.services.file_service import FileService
from app.modules.presentations.services.upload_service import create_presigned_download, get_object_bytes, upload_bytes
from app.modules.website_builder.models import WebsiteEditorSession, WebsiteFormSubmission, WebsiteMutationRequest, WebsiteSite, WebsiteSiteAssetRef, WebsiteSiteDeployment, WebsiteSiteDomain, WebsiteSiteDraft, WebsiteSiteLinkIndex, WebsiteSiteRevision
from app.modules.website_builder.published_runtime import PUBLISHED_RUNTIME_CHECKSUM, PUBLISHED_RUNTIME_CSS, PUBLISHED_RUNTIME_SCRIPT
from app.modules.website_builder.application.queries import WebsiteEventSnapshotQueryService
from app.config import settings
from app.modules.platform.application.governed_mutation_commands import commit_transaction
from app.core.cache import cache_service
from app.core.cache_keys import TenantCacheKey
from app.core.cache_policy import CacheTTL, ttl


platform_website_template_router = APIRouter(
    prefix="/platform/website-templates",
    tags=["Platform Website Templates"],
)

event_website_router = APIRouter(
    prefix="/events/{event_id}/website",
    tags=["Event Website Builder"],
    dependencies=[require_event_operation("website.manage")],
)

public_website_runtime_router = APIRouter(
    prefix="/public/events/{event_id}/website",
    tags=["Public Website Runtime"],
)

public_website_slug_router = APIRouter(
    prefix="/public/sites",
    tags=["Public Website Runtime"],
)

public_website_template_preview_router = APIRouter(
    prefix="/public/website-template-previews",
    tags=["Public Website Runtime"],
)


class WebsiteDocumentEnvelope(BaseModel):
    document: dict[str, Any] = Field(default_factory=dict)
    schema_version: int = Field(default=1, ge=1)
    checksum: str | None = None


class WebsiteRollbackRequest(BaseModel):
    revision_id: uuid.UUID


class WebsitePublishRequest(BaseModel):
    slug: str | None = Field(default=None, min_length=2, max_length=120, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    custom_domain: str | None = Field(default=None, max_length=255)


class WebsitePreviewRequest(WebsiteDocumentEnvelope):
    preview_id: uuid.UUID | None = None


class WebsitePreviewResponse(BaseModel):
    preview_id: uuid.UUID
    url: str
    checksum: str
    expires_at: datetime


class WebsiteFormSubmissionRequest(BaseModel):
    component_instance_id: str = Field(min_length=1, max_length=120)
    payload: dict[str, Any] = Field(default_factory=dict)
    consent: dict[str, Any] = Field(default_factory=dict)
    honeypot: str | None = Field(default=None, max_length=200)


class WebsiteFormSubmissionResponse(BaseModel):
    submission_id: uuid.UUID | None = None
    status: str


class WebsiteAssetReferencePayload(BaseModel):
    kind: str = Field(pattern="^(image|svg|icon|download)$")
    source: str = Field(default="manual", max_length=40)
    url: str | None = None
    storage_path: str | None = None
    creator: str | None = None
    license: str | None = None
    attribution: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class WebsiteAssetReferenceResponse(BaseModel):
    id: uuid.UUID
    kind: str
    source: str
    url: str | None = None
    storage_path: str | None = None
    creator: str | None = None
    license: str | None = None
    attribution: str | None = None
    metadata: dict[str, Any]
    created_at: datetime


class WebsiteDomainCreateRequest(BaseModel):
    domain: str = Field(min_length=4, max_length=255)


class WebsiteDomainResponse(BaseModel):
    id: uuid.UUID
    domain: str
    verification_token: str
    verification_record_name: str
    verification_record_value: str
    dns_state: str
    tls_state: str
    active_deployment_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime


class OpenverseImageResult(BaseModel):
    id: str
    title: str
    url: str | None = None
    thumbnail: str | None = None
    creator: str | None = None
    source: str | None = None
    license: str | None = None
    attribution: str | None = None


class WebsiteDraftResponse(BaseModel):
    site_id: uuid.UUID
    site_slug: str
    draft_id: uuid.UUID
    event_id: uuid.UUID
    organization_id: uuid.UUID
    document: dict[str, Any]
    schema_version: int
    checksum: str
    version: int
    updated_at: datetime


class WebsiteTemplateDraftResponse(BaseModel):
    template_id: uuid.UUID
    draft_id: uuid.UUID
    name: str
    slug: str
    document: dict[str, Any]
    schema_version: int
    checksum: str
    version: int
    updated_at: datetime


class WebsiteTemplatePublishResponse(BaseModel):
    template_id: uuid.UUID
    version_id: uuid.UUID
    version_number: int
    checksum: str


class WebsiteValidationResponse(BaseModel):
    valid: bool
    diagnostics: list[dict[str, Any]]


class WebsiteCheckpointResponse(BaseModel):
    revision_id: uuid.UUID
    revision_number: int
    checksum: str


class WebsiteDeploymentResponse(BaseModel):
    deployment_id: uuid.UUID
    revision_id: uuid.UUID
    site_id: uuid.UUID
    status: str
    storage_prefix: str
    manifest: dict[str, Any]
    diagnostics: list[dict[str, Any]]
    activated_at: datetime | None = None
    public_url: str | None = None


class WebsiteRevisionSummary(BaseModel):
    revision_id: uuid.UUID
    revision_number: int
    reason: str
    checksum: str
    diagnostics: list[dict[str, Any]]
    created_at: datetime


class WebsiteEditorSessionResponse(BaseModel):
    session_id: uuid.UUID
    site_id: uuid.UUID
    mode: str
    heartbeat_at: datetime
    expires_at: datetime


class WebsiteEventSnapshotResponse(BaseModel):
    snapshotId: str
    snapshotCreatedAt: datetime
    dataStatus: str
    mockFallback: dict[str, bool]
    eventName: str
    shortCode: str | None = None
    startDate: str | None = None
    endDate: str | None = None
    timezone: str | None = None
    venue: dict[str, Any]
    organizer: dict[str, Any]
    speakers: list[dict[str, Any]]
    sessions: list[dict[str, Any]]
    sponsors: list[dict[str, Any]]
    stats: dict[str, Any]


def _starter_document(
    *,
    site_name: str,
    event_date: str,
    event_location: str,
    binding_source: str,
) -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    root_id = "root_home"
    instances: dict[str, Any] = {}

    def add(
        instance_id: str,
        component_type: str,
        parent_id: str,
        *,
        tag_name: str = "div",
        content: str | None = None,
        attributes: dict[str, Any] | None = None,
        styles: dict[str, Any] | None = None,
        children: list[str] | None = None,
        bindings: list[dict[str, Any]] | None = None,
        states: dict[str, Any] | None = None,
    ) -> str:
        props: dict[str, Any] = {"tagName": tag_name, "attributes": {"data-gjs-type": component_type, **(attributes or {})}}
        if content is not None:
            props["content"] = content
        instances[instance_id] = {
            "id": instance_id,
            "componentType": component_type,
            "componentVersion": 1,
            "parentId": parent_id,
            "children": children or [],
            "props": props,
            "styles": {"desktop": styles or {}},
            "bindings": bindings or [],
            "states": states or {},
        }
        return instance_id

    header_children = ["starter_logo", "starter_nav", "starter_header_cta"]
    add("starter_header", "header", root_id, tag_name="header", children=header_children, attributes={"data-logo-text": "EVENTOS", "data-cta-text": "Register"}, styles={"position": "sticky", "top": "0", "z-index": "80", "display": "flex", "align-items": "center", "justify-content": "space-between", "gap": "24px", "padding": "16px 32px", "background": "color-mix(in srgb,var(--background) 88%,transparent)", "backdrop-filter": "blur(16px)", "border-bottom": "1px solid var(--border)"})
    add("starter_logo", "button", "starter_header", tag_name="a", content="EVENTOS", attributes={"data-role": "logo", "href": "/"}, styles={"color": "var(--foreground)", "font-size": "18px", "font-weight": "900", "text-decoration": "none"})
    add("starter_nav", "button-group", "starter_header", children=["starter_nav_home", "starter_nav_agenda", "starter_nav_venue"], styles={"display": "flex", "align-items": "center", "gap": "24px"})
    add("starter_nav_home", "button", "starter_nav", tag_name="a", content="Home", attributes={"href": "/", "data-link-type": "page", "data-page-id": "page_home"}, styles={"color": "var(--muted-foreground)", "text-decoration": "none", "font-weight": "700"})
    add("starter_nav_agenda", "button", "starter_nav", tag_name="a", content="Agenda", attributes={"href": "#agenda", "data-link-type": "section", "data-anchor-id": "agenda"}, styles={"color": "var(--muted-foreground)", "text-decoration": "none", "font-weight": "700"})
    add("starter_nav_venue", "button", "starter_nav", tag_name="a", content="Venue", attributes={"href": "#venue", "data-link-type": "section", "data-anchor-id": "venue"}, styles={"color": "var(--muted-foreground)", "text-decoration": "none", "font-weight": "700"})
    add("starter_header_cta", "button", "starter_header", tag_name="a", content="Register", attributes={"data-role": "cta", "href": "#register", "data-link-type": "section", "data-anchor-id": "register"}, styles={"display": "inline-flex", "padding": "11px 20px", "border-radius": "9px", "background": "var(--primary)", "color": "#fff", "font-weight": "800", "text-decoration": "none"})

    hero_children = ["starter_hero_content"]
    add("starter_hero", "hero", root_id, tag_name="section", children=hero_children, attributes={"data-event-name": site_name, "data-date": event_date, "data-location": event_location, "data-tagline": "Ideas, people, and experiences shaping what comes next."}, styles={"position": "relative", "min-height": "82vh", "display": "flex", "align-items": "center", "justify-content": "center", "padding": "96px 32px", "overflow": "hidden", "text-align": "center", "background": "radial-gradient(circle at 50% 15%,color-mix(in srgb,var(--primary) 20%,transparent),transparent 38%),var(--background)"}, bindings=[{"id": "binding_event_identity", "source": binding_source, "fieldPath": "eventName", "fallbackStatus": "mock" if binding_source == "mock" else "resolved"}])
    add("starter_hero_content", "container", "starter_hero", children=["starter_event_meta", "starter_event_title", "starter_event_tagline", "starter_hero_actions"], attributes={"data-role": "hero-content"}, styles={"width": "100%", "max-width": "980px", "margin": "0 auto"})
    add("starter_event_meta", "subheading", "starter_hero_content", tag_name="p", content=f"{event_date}  |  {event_location}", attributes={"data-role": "event-date"}, styles={"display": "inline-flex", "padding": "8px 16px", "border": "1px solid var(--border)", "border-radius": "999px", "color": "var(--primary)", "font-weight": "800"})
    add("starter_event_title", "heading", "starter_hero_content", tag_name="h1", content=site_name, attributes={"data-role": "event-name"}, styles={"margin": "24px 0 18px", "color": "var(--foreground)", "font-size": "64px", "line-height": "1.05", "font-weight": "900"})
    add("starter_event_tagline", "paragraph", "starter_hero_content", tag_name="p", content="Ideas, people, and experiences shaping what comes next.", attributes={"data-role": "tagline"}, styles={"max-width": "720px", "margin": "0 auto 34px", "color": "var(--muted-foreground)", "font-size": "20px", "line-height": "1.65"})
    add("starter_hero_actions", "button-group", "starter_hero_content", children=["starter_primary_cta", "starter_secondary_cta"], styles={"display": "flex", "justify-content": "center", "gap": "12px", "flex-wrap": "wrap"})
    add("starter_primary_cta", "button", "starter_hero_actions", tag_name="a", content="Register Now", attributes={"data-role": "primary-cta", "href": "#register", "data-link-type": "section", "data-anchor-id": "register"}, styles={"display": "inline-flex", "padding": "15px 30px", "border-radius": "10px", "background": "var(--primary)", "color": "#fff", "font-weight": "800", "text-decoration": "none"})
    add("starter_secondary_cta", "button", "starter_hero_actions", tag_name="a", content="View Agenda", attributes={"data-role": "secondary-cta", "href": "#agenda", "data-link-type": "section", "data-anchor-id": "agenda"}, styles={"display": "inline-flex", "padding": "15px 30px", "border-radius": "10px", "border": "1px solid var(--border)", "color": "var(--foreground)", "font-weight": "800", "text-decoration": "none"})

    add("starter_overview", "event-overview", root_id, tag_name="section", children=["starter_overview_title", "starter_overview_copy"], attributes={"id": "about"}, styles={"padding": "88px 32px", "background": "var(--surface)", "text-align": "center"})
    add("starter_overview_title", "heading", "starter_overview", tag_name="h2", content="Where Ideas Become Impact", styles={"margin": "0 auto 18px", "font-size": "42px", "font-weight": "900", "color": "var(--foreground)"})
    add("starter_overview_copy", "paragraph", "starter_overview", tag_name="p", content="Meet the people building the future through an event designed for meaningful learning and connection.", styles={"max-width": "760px", "margin": "0 auto", "font-size": "18px", "line-height": "1.7", "color": "var(--muted-foreground)"})

    add("starter_stats", "statistics", root_id, tag_name="section", children=["starter_stats_title", "starter_stats_grid"], styles={"padding": "80px 32px", "background": "var(--background)"})
    add("starter_stats_title", "heading", "starter_stats", tag_name="h2", content="By The Numbers", attributes={"data-role": "stats-title"}, styles={"margin": "0 0 34px", "font-size": "38px", "font-weight": "900", "text-align": "center", "color": "var(--foreground)"})
    add("starter_stats_grid", "grid", "starter_stats", children=["starter_stat_1", "starter_stat_2", "starter_stat_3", "starter_stat_4"], attributes={"data-role": "stats-grid", "data-columns": "4"}, styles={"display": "grid", "grid-template-columns": "repeat(4,minmax(0,1fr))", "gap": "16px", "max-width": "1100px", "margin": "0 auto"})
    for index, (value, label) in enumerate((("2,500+", "Attendees"), ("150+", "Speakers"), ("50+", "Sessions"), ("40+", "Countries")), 1):
        card_id = f"starter_stat_{index}"
        add(card_id, "counter", "starter_stats_grid", children=[f"{card_id}_value", f"{card_id}_label"], attributes={"data-end": re.sub(r"\D", "", value), "data-suffix": "+"}, styles={"padding": "28px", "border": "1px solid var(--border)", "border-radius": "12px", "background": "var(--card)", "text-align": "center"})
        add(f"{card_id}_value", "heading", card_id, tag_name="div", content=value, attributes={"data-role": "counter-value"}, styles={"font-size": "38px", "font-weight": "900", "color": "var(--primary)"})
        add(f"{card_id}_label", "paragraph", card_id, tag_name="div", content=label, styles={"margin-top": "8px", "color": "var(--muted-foreground)"})

    add("starter_agenda", "agenda", root_id, tag_name="section", children=["starter_agenda_title", "starter_agenda_card"], attributes={"id": "agenda"}, styles={"padding": "88px 32px", "background": "var(--surface)"})
    add("starter_agenda_title", "heading", "starter_agenda", tag_name="h2", content="Event Agenda", attributes={"data-role": "section-title"}, styles={"margin": "0 0 30px", "font-size": "42px", "font-weight": "900", "text-align": "center", "color": "var(--foreground)"})
    add("starter_agenda_card", "card", "starter_agenda", children=["starter_agenda_time", "starter_agenda_name"], attributes={"data-role": "card"}, styles={"max-width": "900px", "margin": "0 auto", "padding": "28px", "border": "1px solid var(--border)", "border-radius": "12px", "background": "var(--card)"})
    add("starter_agenda_time", "subheading", "starter_agenda_card", tag_name="p", content="09:00 - 10:00", styles={"margin": "0 0 8px", "color": "var(--primary)", "font-weight": "800"})
    add("starter_agenda_name", "heading", "starter_agenda_card", tag_name="h3", content="Opening Keynote: Building What Matters", styles={"margin": "0", "font-size": "24px", "color": "var(--foreground)"})

    add("starter_venue", "venue", root_id, tag_name="section", children=["starter_venue_title", "starter_venue_address"], attributes={"id": "venue", "data-layout": "stacked"}, styles={"padding": "80px 32px", "background": "var(--background)", "text-align": "center"})
    add("starter_venue_title", "heading", "starter_venue", tag_name="h2", content="Venue", attributes={"data-role": "section-title"}, styles={"margin": "0 0 14px", "font-size": "40px", "font-weight": "900", "color": "var(--foreground)"})
    add("starter_venue_address", "paragraph", "starter_venue", tag_name="p", content=event_location, attributes={"data-role": "address"}, styles={"margin": "0", "font-size": "18px", "color": "var(--muted-foreground)"})

    add("starter_register", "registration-cta", root_id, tag_name="section", children=["starter_register_title", "starter_register_copy", "starter_register_button"], attributes={"id": "register"}, styles={"padding": "88px 32px", "background": "linear-gradient(135deg,var(--primary),var(--secondary))", "text-align": "center"})
    add("starter_register_title", "heading", "starter_register", tag_name="h2", content="Ready To Join Us?", styles={"margin": "0 0 14px", "font-size": "42px", "font-weight": "900", "color": "#fff"})
    add("starter_register_copy", "paragraph", "starter_register", tag_name="p", content="Reserve your place and be part of the conversation.", styles={"margin": "0 0 28px", "font-size": "18px", "color": "rgba(255,255,255,.84)"})
    add("starter_register_button", "button", "starter_register", tag_name="a", content="Register Now", attributes={"href": "/registration", "data-link-type": "registration"}, styles={"display": "inline-flex", "padding": "15px 30px", "border-radius": "10px", "background": "#fff", "color": "#111827", "font-weight": "900", "text-decoration": "none"})

    add("starter_footer", "footer", root_id, tag_name="footer", children=["starter_footer_brand", "starter_footer_links", "starter_socials"], attributes={"data-logo-text": "EVENTOS", "data-layout": "columns"}, styles={"display": "grid", "grid-template-columns": "1fr auto auto", "align-items": "center", "gap": "32px", "padding": "48px 32px", "background": "var(--background)", "border-top": "1px solid var(--border)"})
    add("starter_footer_brand", "heading", "starter_footer", tag_name="div", content=site_name, attributes={"data-role": "footer-logo"}, styles={"font-size": "20px", "font-weight": "900", "color": "var(--foreground)"})
    add("starter_footer_links", "button-group", "starter_footer", children=["starter_footer_home", "starter_footer_agenda"], styles={"display": "flex", "gap": "18px"})
    add("starter_footer_home", "button", "starter_footer_links", tag_name="a", content="Home", attributes={"href": "/", "data-link-type": "page", "data-page-id": "page_home"}, styles={"color": "var(--muted-foreground)", "text-decoration": "none"})
    add("starter_footer_agenda", "button", "starter_footer_links", tag_name="a", content="Agenda", attributes={"href": "#agenda", "data-link-type": "section", "data-anchor-id": "agenda"}, styles={"color": "var(--muted-foreground)", "text-decoration": "none"})
    add("starter_socials", "social-icons", "starter_footer", attributes={"data-platforms": '[{"platform":"linkedin","label":"LinkedIn","url":"https://linkedin.com/"},{"platform":"instagram","label":"Instagram","url":"https://instagram.com/"}]'}, styles={"display": "flex", "gap": "10px"})

    root_children = ["starter_header", "starter_hero", "starter_overview", "starter_stats", "starter_agenda", "starter_venue", "starter_register", "starter_footer"]
    instances[root_id] = {
        "id": root_id,
        "componentType": "page-root",
        "componentVersion": 1,
        "children": root_children,
        "props": {"pageId": "page_home"},
        "styles": {},
        "bindings": [],
        "states": {"locked": True, "name": "Home"},
    }
    return {
        "schemaVersion": 1,
        "site": {"siteName": site_name, "publishMode": "static-resolved"},
        "pages": [{
            "id": "page_home",
            "name": "Home",
            "slug": "",
            "isHomePage": True,
            "rootInstanceId": root_id,
            "createdAt": now,
            "updatedAt": now,
        }],
        "instances": instances,
        "tokens": {"theme": {"primary": "#7c3aed", "secondary": "#22d3ee", "background": "#080912", "surface": "#10131f", "card": "#151827", "foreground": "#f8fafc", "mutedForeground": "#94a3b8", "border": "#273044"}},
        "menus": [{"id": "main", "name": "Main navigation", "items": [{"type": "page", "pageId": "page_home", "label": "Home"}, {"type": "section", "pageId": "page_home", "anchorId": "agenda", "label": "Agenda"}]}],
        "assets": [],
        "dataSources": [{
            "id": "mock_event" if binding_source == "mock" else "current_event",
            "type": "mock" if binding_source == "mock" else "event-snapshot",
            "label": "Mock event data" if binding_source == "mock" else "Current Event",
            "status": "mock" if binding_source == "mock" else "connected",
        }],
        "createdAt": now,
        "updatedAt": now,
    }


def _default_document(event: CurrentEvent) -> dict[str, Any]:
    return _starter_document(
        site_name=event.name,
        event_date=f"{event.start_date.isoformat()} - {event.end_date.isoformat()}",
        event_location=event.location or event.venue_name or "Event venue",
        binding_source="current-event",
    )


def _default_platform_template_document() -> dict[str, Any]:
    return _starter_document(
        site_name="Global Tech Summit 2026",
        event_date="October 24 - 26, 2026",
        event_location="San Francisco, CA",
        binding_source="mock",
    )


def _is_legacy_empty_starter(document: Any) -> bool:
    """Recognize only the pre-canonical placeholder so edited drafts are never replaced."""
    if not isinstance(document, dict):
        return True
    pages = document.get("pages")
    instances = document.get("instances")
    if not isinstance(pages, list) or len(pages) != 1 or not isinstance(instances, dict):
        return False
    if len(instances) > 4:
        return False
    component_types = {
        str(instance.get("componentType") or "")
        for instance in instances.values()
        if isinstance(instance, dict)
    }
    return component_types.issubset({"", "page-root", "hero", "heading", "paragraph"})


def _checksum(document: dict[str, Any]) -> str:
    payload = json.dumps(document, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _mutation_hash(payload: Any) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


async def _transaction_lock(db: DB, key: str) -> None:
    bind = db.get_bind()
    if bind is not None and bind.dialect.name == "postgresql":
        await db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:lock_key))"), {"lock_key": key})


def _changed_instance_ids(left: dict[str, Any], right: dict[str, Any]) -> list[str]:
    left_instances = left.get("instances") if isinstance(left.get("instances"), dict) else {}
    right_instances = right.get("instances") if isinstance(right.get("instances"), dict) else {}
    return sorted(
        instance_id
        for instance_id in set(left_instances) | set(right_instances)
        if _mutation_hash(left_instances.get(instance_id)) != _mutation_hash(right_instances.get(instance_id))
    )


async def _find_mutation_replay(
    db: DB,
    *,
    scope_type: str,
    scope_id: uuid.UUID,
    operation: str,
    idempotency_key: str,
    request_payload: Any,
) -> WebsiteMutationRequest | None:
    await _transaction_lock(db, f"website-mutation:{scope_type}:{scope_id}:{operation}:{idempotency_key}")
    request_hash = _mutation_hash(request_payload)
    row = await db.scalar(
        select(WebsiteMutationRequest).where(
            WebsiteMutationRequest.scope_type == scope_type,
            WebsiteMutationRequest.scope_id == scope_id,
            WebsiteMutationRequest.operation == operation,
            WebsiteMutationRequest.idempotency_key == idempotency_key,
        )
    )
    if row and row.request_hash != request_hash:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "IDEMPOTENCY_CONFLICT", "message": "The idempotency key was already used with a different request."},
        )
    return row


def _record_mutation(
    db: DB,
    *,
    scope_type: str,
    scope_id: uuid.UUID,
    operation: str,
    idempotency_key: str,
    request_payload: Any,
    response_type: str,
    response_id: uuid.UUID | None,
    response_payload: dict[str, Any],
    actor_id: uuid.UUID | None,
) -> None:
    db.add(WebsiteMutationRequest(
        id=uuid.uuid4(),
        scope_type=scope_type,
        scope_id=scope_id,
        operation=operation,
        idempotency_key=idempotency_key,
        request_hash=_mutation_hash(request_payload),
        response_type=response_type,
        response_id=response_id,
        response_payload=response_payload,
        created_by=actor_id,
    ))


def _website_audit(
    actor: Any,
    *,
    organization_id: uuid.UUID | None,
    site_id: uuid.UUID,
    action: str,
    state: dict[str, Any],
) -> AuditLog:
    return AuditLog(
        organization_id=organization_id,
        actor_user_id=actor.id,
        actor_role=getattr(actor, "platform_role", None) or getattr(actor, "role", None),
        resource_type="website_site",
        resource_id=site_id,
        action_type=action,
        new_state=state,
        is_sensitive=False,
    )


def _template_audit(actor: Any, *, template_id: uuid.UUID, action: str, state: dict[str, Any]) -> AuditLog:
    return AuditLog(
        organization_id=None,
        actor_user_id=actor.id,
        actor_role=getattr(actor, "platform_role", None) or getattr(actor, "role", None),
        resource_type="website_template",
        resource_id=template_id,
        action_type=action,
        new_state=state,
        is_sensitive=False,
    )


async def _next_revision_number(db: DB, site_id: uuid.UUID) -> int:
    latest = await db.scalar(
        select(func.max(WebsiteSiteRevision.revision_number)).where(WebsiteSiteRevision.site_id == site_id)
    )
    return int(latest or 0) + 1


async def _supersede_active_deployments(db: DB, site_id: uuid.UUID) -> None:
    await db.execute(
        update(WebsiteSiteDeployment)
        .where(WebsiteSiteDeployment.site_id == site_id, WebsiteSiteDeployment.status == "ACTIVE")
        .values(status="SUPERSEDED")
    )


def _instance_attributes(instance: dict[str, Any]) -> dict[str, Any]:
    props = instance.get("props") if isinstance(instance.get("props"), dict) else {}
    attributes = props.get("attributes") if isinstance(props.get("attributes"), dict) else {}
    adapter = props.get("adapter") if isinstance(props.get("adapter"), dict) else {}
    grapesjs = adapter.get("grapesjs") if isinstance(adapter.get("grapesjs"), dict) else {}
    adapter_attributes = grapesjs.get("attributes") if isinstance(grapesjs.get("attributes"), dict) else {}
    return {**adapter_attributes, **attributes}


def _page_instance_map(document: dict[str, Any]) -> dict[str, str]:
    pages = document.get("pages") if isinstance(document.get("pages"), list) else []
    instances = document.get("instances") if isinstance(document.get("instances"), dict) else {}
    result: dict[str, str] = {}

    def visit(instance_id: str, page_id: str, seen: set[str]) -> None:
        if instance_id in seen:
            return
        seen.add(instance_id)
        result[instance_id] = page_id
        instance = instances.get(instance_id)
        if not isinstance(instance, dict):
            return
        for child_id in instance.get("children", []):
            if isinstance(child_id, str):
                visit(child_id, page_id, seen)

    for page in pages:
        if not isinstance(page, dict) or not isinstance(page.get("id"), str):
            continue
        root_id = page.get("rootInstanceId")
        if isinstance(root_id, str):
            visit(root_id, page["id"], set())
    return result


def _derive_link_index(document: dict[str, Any]) -> list[dict[str, Any]]:
    pages = [page for page in document.get("pages", []) if isinstance(page, dict)]
    instances = document.get("instances") if isinstance(document.get("instances"), dict) else {}
    page_ids = {str(page.get("id")) for page in pages if page.get("id")}
    page_by_route = {
        "/" if page.get("isHomePage") else f"/{str(page.get('slug') or '').strip('/')}": str(page.get("id"))
        for page in pages
        if page.get("id")
    }
    instance_pages = _page_instance_map(document)
    anchors_by_page: dict[str, set[str]] = {page_id: set() for page_id in page_ids}
    for instance_id, instance in instances.items():
        if not isinstance(instance, dict):
            continue
        anchor = str(_instance_attributes(instance).get("id") or "").strip()
        page_id = instance_pages.get(str(instance_id))
        if anchor and page_id:
            anchors_by_page.setdefault(page_id, set()).add(anchor)

    links: list[dict[str, Any]] = []

    def add_link(source_id: str, source_page_id: str | None, attributes: dict[str, Any]) -> None:
        href = str(attributes.get("href") or attributes.get("data-link") or "").strip()
        structured_type = str(attributes.get("data-link-type") or "").strip().lower()
        target_page_id = str(attributes.get("data-page-id") or "").strip() or None
        target_anchor_id = str(attributes.get("data-anchor-id") or "").strip().lstrip("#") or None
        if not href and not structured_type:
            return

        target_type = structured_type or "external"
        target_value = href or None
        link_status = "OK"
        if structured_type == "page" and target_page_id:
            if target_page_id not in page_ids:
                link_status = "BROKEN_PAGE"
        elif structured_type in {"anchor", "section"} and target_anchor_id:
            target_type = "anchor"
            target_page_id = target_page_id or source_page_id
            if not target_page_id or target_anchor_id not in anchors_by_page.get(target_page_id, set()):
                link_status = "BROKEN_ANCHOR"
        elif structured_type in {"registration", "speaker-portal", "file", "external", "email", "phone", "custom-route"}:
            target_type = structured_type
        elif href.startswith("#"):
            target_type = "anchor"
            target_page_id = source_page_id
            target_anchor_id = href[1:]
            if not target_page_id or target_anchor_id not in anchors_by_page.get(target_page_id, set()):
                link_status = "BROKEN_ANCHOR"
        elif href.startswith("mailto:"):
            target_type = "email"
        elif href.startswith("tel:"):
            target_type = "phone"
        elif href.startswith("/"):
            route, _, anchor = href.partition("#")
            target_type = "page"
            target_page_id = page_by_route.get(route.rstrip("/") or "/")
            target_anchor_id = anchor or None
            if not target_page_id:
                link_status = "BROKEN_PAGE"
            elif target_anchor_id and target_anchor_id not in anchors_by_page.get(target_page_id, set()):
                link_status = "BROKEN_ANCHOR"
        elif href.startswith(("http://", "https://")):
            target_type = "external"
        elif href:
            target_type = structured_type or "custom-route"

        links.append({
            "source_instance_id": source_id,
            "source_page_id": source_page_id,
            "target_type": target_type,
            "target_value": target_value,
            "target_page_id": target_page_id,
            "target_anchor_id": target_anchor_id,
            "status": link_status,
        })

    for instance_id, instance in instances.items():
        if isinstance(instance, dict):
            add_link(str(instance_id), instance_pages.get(str(instance_id)), _instance_attributes(instance))
    for menu in document.get("menus", []):
        if not isinstance(menu, dict):
            continue
        for index, item in enumerate(menu.get("items", [])):
            if not isinstance(item, dict):
                continue
            attributes = {
                "href": item.get("href"),
                "data-link-type": item.get("type"),
                "data-page-id": item.get("pageId"),
                "data-anchor-id": item.get("anchorId"),
            }
            add_link(f"menu:{menu.get('id') or 'unknown'}:{index}", None, attributes)
    return links


async def _rebuild_link_index(db: DB, site_id: uuid.UUID, document: dict[str, Any]) -> None:
    await db.execute(delete(WebsiteSiteLinkIndex).where(WebsiteSiteLinkIndex.site_id == site_id))
    for link in _derive_link_index(document):
        db.add(WebsiteSiteLinkIndex(id=uuid.uuid4(), site_id=site_id, **link))


def _document_uses_asset(document: dict[str, Any], asset: WebsiteSiteAssetRef) -> bool:
    searchable = {
        "instances": document.get("instances", {}),
        "menus": document.get("menus", []),
        "site": document.get("site", {}),
    }
    serialized = json.dumps(searchable, sort_keys=True, separators=(",", ":"))
    candidates = [str(asset.id), str(asset.asset_id or ""), str(asset.url or ""), str(asset.storage_path or "")]
    return any(candidate and candidate in serialized for candidate in candidates)


def _approved_form_instances(document: dict[str, Any]) -> list[dict[str, Any]]:
    approved_types = {"contact-form", "newsletter", "sponsor-inquiry", "registration-interest-form"}
    instances = document.get("instances") if isinstance(document.get("instances"), dict) else {}
    approved: list[dict[str, Any]] = []
    for instance_id, instance in instances.items():
        if not isinstance(instance, dict) or instance.get("componentType") not in approved_types:
            continue
        attributes = _instance_attributes(instance)
        approved.append({
            "instanceId": str(instance_id),
            "componentType": str(instance.get("componentType")),
            "requiresConsent": str(attributes.get("data-require-consent") or "").lower() in {"true", "1", "yes"},
        })
    return approved


def _validate_form_payload(payload: WebsiteFormSubmissionRequest) -> None:
    if len(payload.payload) > 50:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail={"code": "FORM_TOO_MANY_FIELDS"})
    encoded = json.dumps(payload.payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    if len(encoded) > 64 * 1024:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail={"code": "FORM_PAYLOAD_TOO_LARGE"})
    for key, value in payload.payload.items():
        if not isinstance(key, str) or not key or len(key) > 100:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail={"code": "FORM_FIELD_NAME_INVALID"})
        if isinstance(value, (dict, list)):
            value_size = len(json.dumps(value, ensure_ascii=False).encode("utf-8"))
        else:
            value_size = len(str(value).encode("utf-8"))
        if value_size > 10 * 1024:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail={"code": "FORM_FIELD_TOO_LARGE", "field": key})


def _validate_document(document: dict[str, Any], *, publish: bool = False) -> list[dict[str, Any]]:
    diagnostics: list[dict[str, Any]] = []
    required = ["schemaVersion", "site", "pages", "instances"]
    for key in required:
        if key not in document:
            diagnostics.append({"severity": "error", "code": "MISSING_FIELD", "message": f"Missing document.{key}"})
    pages = document.get("pages")
    instances = document.get("instances")
    if not isinstance(pages, list) or not pages:
        diagnostics.append({"severity": "error", "code": "NO_PAGES", "message": "Website must contain at least one page."})
    if not isinstance(instances, dict):
        diagnostics.append({"severity": "error", "code": "NO_INSTANCES", "message": "Website instances must be an object."})
    site = document.get("site") if isinstance(document.get("site"), dict) else {}
    global_css = site.get("globalCSS")
    if isinstance(global_css, str) and _has_unsafe_css(global_css):
        diagnostics.append({"severity": "error", "code": "UNSAFE_CUSTOM_CSS", "message": "Site custom CSS contains a prohibited construct."})
    if isinstance(pages, list) and isinstance(instances, dict):
        seen_slugs: set[str] = set()
        home_pages = [page for page in pages if isinstance(page, dict) and page.get("isHomePage")]
        if len(home_pages) != 1:
            diagnostics.append({"severity": "error", "code": "HOME_PAGE_COUNT", "message": "Website must contain exactly one home page."})
        for page in pages:
            if not isinstance(page, dict):
                continue
            slug = "" if page.get("isHomePage") else str(page.get("slug") or "").strip("/")
            if slug in seen_slugs:
                diagnostics.append({"severity": "error", "code": "DUPLICATE_PAGE_ROUTE", "message": f"Duplicate page route: /{slug}"})
            seen_slugs.add(slug)
            if isinstance(page, dict) and page.get("rootInstanceId") not in instances:
                diagnostics.append({"severity": "error", "code": "MISSING_ROOT", "message": f"Missing root instance for page {page.get('name') or page.get('id')}."})
        for instance_id, instance in instances.items():
            if not isinstance(instance, dict):
                diagnostics.append({"severity": "error", "code": "INVALID_INSTANCE", "message": f"Invalid instance {instance_id}."})
                continue
            props = instance.get("props") if isinstance(instance.get("props"), dict) else {}
            raw_html = props.get("html")
            if isinstance(raw_html, str) and re.search(r"<\s*script\b|<\s*iframe\b[^>]*\bsrcdoc\s*=|\bon[a-z]+\s*=|javascript\s*:", raw_html, re.IGNORECASE):
                diagnostics.append({"severity": "error", "code": "UNSAFE_COMPONENT_HTML", "message": f"Unsafe HTML on instance {instance_id}."})
            attrs = props.get("attributes") if isinstance(props.get("attributes"), dict) else {}
            for attr_name in ("href", "src"):
                raw = str(attrs.get(attr_name) or "").strip().lower()
                if raw.startswith(("javascript:", "data:text/html", "vbscript:")):
                    diagnostics.append({"severity": "error", "code": "UNSAFE_URL", "message": f"Unsafe {attr_name} on instance {instance_id}."})
            for child_id in instance.get("children", []):
                if isinstance(child_id, str) and child_id in instances and isinstance(instances[child_id], dict) and instances[child_id].get("parentId") != instance_id:
                    diagnostics.append({"severity": "error", "code": "PARENT_MISMATCH", "message": f"Parent mismatch for instance {child_id}."})
                if isinstance(child_id, str) and child_id not in instances:
                    diagnostics.append({"severity": "error", "code": "MISSING_CHILD", "message": f"Missing child instance {child_id}."})
            if publish:
                bindings = instance.get("bindings") if isinstance(instance.get("bindings"), list) else []
                for binding in bindings:
                    if not isinstance(binding, dict):
                        continue
                    if binding.get("source") == "mock" or binding.get("fallbackStatus") == "mock":
                        diagnostics.append({"severity": "error", "code": "UNRESOLVED_MOCK_BINDING", "message": f"Mock data binding remains on instance {instance_id}."})
        for link in _derive_link_index(document):
            if link["status"] == "BROKEN_PAGE":
                diagnostics.append({"severity": "error", "code": "BROKEN_PAGE_LINK", "message": f"Instance {link['source_instance_id']} links to a missing page."})
            elif link["status"] == "BROKEN_ANCHOR":
                diagnostics.append({"severity": "error", "code": "BROKEN_ANCHOR_LINK", "message": f"Instance {link['source_instance_id']} links to a missing section anchor."})
    return diagnostics


def _has_unsafe_css(value: str) -> bool:
    return bool(re.search(r"</?\s*style\b|@import\b|expression\s*\(|javascript\s*:|vbscript\s*:|data\s*:\s*text/html", value, re.IGNORECASE))


def _safe_url(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    lowered = raw.lower()
    if lowered.startswith(("javascript:", "data:text/html", "vbscript:")):
        return "#"
    return raw


def _style_attr(styles: dict[str, Any] | None) -> str:
    if not isinstance(styles, dict) or not styles:
        return ""
    css = "; ".join(f"{html.escape(str(key), quote=True)}: {html.escape(str(value), quote=True)}" for key, value in styles.items() if value is not None)
    return f' style="{css}"' if css else ""


def _attrs_attr(attrs: dict[str, Any] | None) -> str:
    if not isinstance(attrs, dict):
        return ""
    rendered: list[str] = []
    for key, value in attrs.items():
        if value is None or value is False:
            continue
        safe_key = html.escape(str(key), quote=True)
        if value is True:
            rendered.append(safe_key)
            continue
        safe_value = _safe_url(value) if str(key).lower() in {"href", "src"} else str(value)
        rendered.append(f'{safe_key}="{html.escape(safe_value, quote=True)}"')
    return f" {' '.join(rendered)}" if rendered else ""


def _render_instance(document: dict[str, Any], instance_id: str) -> str:
    instances = document.get("instances") if isinstance(document.get("instances"), dict) else {}
    instance = instances.get(instance_id) if isinstance(instances, dict) else None
    if not isinstance(instance, dict):
        return ""
    props = instance.get("props") if isinstance(instance.get("props"), dict) else {}
    attrs = dict(props.get("attributes")) if isinstance(props.get("attributes"), dict) else {}
    tag = str(props.get("tagName") or "").lower()
    component_type = str(instance.get("componentType") or "div")
    if component_type == "page-root":
        return "".join(_render_instance(document, child_id) for child_id in instance.get("children", []) if isinstance(child_id, str))
    if not tag:
        tag = {
            "heading": "h1",
            "paragraph": "p",
            "image": "img",
            "button": "a",
            "navigation": "nav",
            "footer": "footer",
            "section": "section",
            "container": "div",
        }.get(component_type, "div")
    attrs.setdefault("data-wb-instance-id", instance_id)
    attrs.setdefault("data-gjs-type", component_type)
    desktop_styles = {}
    styles = instance.get("styles")
    if isinstance(styles, dict) and isinstance(styles.get("desktop"), dict):
        desktop_styles = styles["desktop"]
    children_html = "".join(_render_instance(document, child_id) for child_id in instance.get("children", []) if isinstance(child_id, str))
    content = html.escape(str(props.get("content") or ""), quote=False)
    if isinstance(props.get("html"), str):
        content = str(props["html"])
    body = children_html or content
    attr_text = _attrs_attr(attrs)
    style_text = _style_attr(desktop_styles)
    if tag in {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}:
        return f"<{tag}{attr_text}{style_text}>"
    return f"<{tag}{attr_text}{style_text}>{body}</{tag}>"


def _safe_css_value(value: Any, fallback: str) -> str:
    raw = str(value or fallback).strip()
    if not raw or re.search(r"[{}<>]|url\s*\(|@import|expression\s*\(", raw, re.IGNORECASE):
        return fallback
    return raw


def _theme_css(document: dict[str, Any]) -> str:
    tokens = document.get("tokens") if isinstance(document.get("tokens"), dict) else {}
    theme = tokens.get("theme") if isinstance(tokens.get("theme"), dict) else {}
    values = {
        "--pri": _safe_css_value(theme.get("primary"), "#7c3aed"),
        "--pri-hover": _safe_css_value(theme.get("primaryHover"), "#6d28d9"),
        "--sec": _safe_css_value(theme.get("secondary"), "#f43f5e"),
        "--base": _safe_css_value(theme.get("background"), "#080912"),
        "--surf": _safe_css_value(theme.get("surface"), "#0b1017"),
        "--card": _safe_css_value(theme.get("card"), "rgba(255,255,255,0.03)"),
        "--border": _safe_css_value(theme.get("border"), "rgba(148,163,184,0.18)"),
        "--primary": _safe_css_value(theme.get("primary"), "#7c3aed"),
        "--primary-hover": _safe_css_value(theme.get("primaryHover"), "#6d28d9"),
        "--secondary": _safe_css_value(theme.get("secondary"), "#f43f5e"),
        "--background": _safe_css_value(theme.get("background"), "#080912"),
        "--surface": _safe_css_value(theme.get("surface"), "#0b1017"),
        "--foreground": "#f8fafc",
        "--muted": "#1f2937",
        "--muted-foreground": "#94a3b8",
        "--border-subtle": "rgba(148,163,184,0.12)",
        "--border-default": "rgba(148,163,184,0.18)",
        "--border-strong": "rgba(148,163,184,0.32)",
        "--text-secondary": "#94a3b8",
        "--success": "#22c55e",
        "--font-heading": _safe_css_value(theme.get("fontHeading"), "'Inter', sans-serif"),
        "--font-body": _safe_css_value(theme.get("fontBody"), "'Inter', sans-serif"),
        "--radius": _safe_css_value(theme.get("radius"), "12px"),
    }
    declarations = ";".join(f"{key}:{value}" for key, value in values.items())
    return (
        f":root,body{{{declarations}}}"
        "*,*::before,*::after{box-sizing:border-box}"
        "html,body{margin:0;width:100%;min-height:100%;background:var(--background);color:var(--foreground);font-family:var(--font-body);overflow-x:hidden}"
        "body{min-height:100vh}h1,h2,h3,h4,h5,h6{font-family:var(--font-heading)}"
        "img,video,svg{max-width:100%}a{color:inherit}"
    )


def _responsive_css(document: dict[str, Any]) -> str:
    instances = document.get("instances") if isinstance(document.get("instances"), dict) else {}
    tablet: list[str] = []
    mobile: list[str] = []
    for instance_id, instance in instances.items():
        if not isinstance(instance, dict):
            continue
        safe_id = str(instance_id).replace("\\", "\\\\").replace('"', '\\"')
        selector = f'[data-wb-instance-id="{safe_id}"]'
        styles = instance.get("styles") if isinstance(instance.get("styles"), dict) else {}
        for device, bucket in (("tablet", tablet), ("mobile", mobile)):
            device_styles = styles.get(device)
            if not isinstance(device_styles, dict):
                continue
            declarations = ";".join(f"{key}:{value}" for key, value in device_styles.items() if value is not None and str(value) != "")
            if declarations:
                bucket.append(f"{selector}{{{declarations}}}")
    chunks: list[str] = []
    if tablet:
        chunks.append(f"@media (max-width:1024px){{{''.join(tablet)}}}")
    if mobile:
        chunks.append(f"@media (max-width:767px){{{''.join(mobile)}}}")
    return "\n".join(chunks)


def _script_hash(value: str) -> str:
    digest = hashlib.sha256(value.encode("utf-8")).digest()
    return base64.b64encode(digest).decode("ascii")


def _render_deployment_manifest(document: dict[str, Any], site: WebsiteSite, revision: WebsiteSiteRevision) -> dict[str, Any]:
    pages = document.get("pages") if isinstance(document.get("pages"), list) else []
    rendered_pages: list[dict[str, Any]] = []
    for page in pages:
        if not isinstance(page, dict):
            continue
        slug = str(page.get("slug") or "")
        route = "/" if page.get("isHomePage") else f"/{slug.strip('/')}"
        root_id = page.get("rootInstanceId")
        body = _render_instance(document, root_id) if isinstance(root_id, str) else ""
        title = str(page.get("seoTitle") or document.get("site", {}).get("siteName") or site.name)
        site_settings = document.get("site") if isinstance(document.get("site"), dict) else {}
        global_css = site_settings.get("globalCSS") if isinstance(site_settings.get("globalCSS"), str) else ""
        if _has_unsafe_css(global_css):
            global_css = ""
        rendered_css = "\n".join((_theme_css(document), global_css, _responsive_css(document), PUBLISHED_RUNTIME_CSS))
        runtime_script = PUBLISHED_RUNTIME_SCRIPT.replace("</script", "<\\/script")
        rendered_pages.append({
            "pageId": page.get("id"),
            "name": page.get("name"),
            "slug": slug,
            "route": route,
            "artifactPath": "index.html" if route == "/" else f"{route.strip('/')}/index.html",
            "html": (
                "<!doctype html><html lang=\"en\"><head>"
                "<meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
                f"<title>{html.escape(title)}</title>"
                f"<style>{rendered_css}</style>"
                f"</head><body data-wb-form-endpoint=\"{html.escape(f'/api/v1/public/events/{site.event_id}/website/form-submissions', quote=True)}\">"
                f"{body}"
                f"<script>{runtime_script}</script>"
                "</body></html>"
            ),
        })
    return {
        "schemaVersion": 1,
        "siteId": str(site.id),
        "siteSlug": site.slug,
        "eventId": str(site.event_id),
        "organizationId": str(site.organization_id),
        "revisionId": str(revision.id),
        "checksum": revision.checksum,
        "pages": rendered_pages,
        "assets": document.get("assets", []),
        "runtime": {
            "checksum": PUBLISHED_RUNTIME_CHECKSUM,
            "scriptSha256": _script_hash(PUBLISHED_RUNTIME_SCRIPT),
            "formSubmissionEndpoint": f"/api/v1/public/events/{site.event_id}/website/form-submissions",
            "approvedComponents": ["contact-form", "newsletter", "sponsor-inquiry"],
            "approvedFormInstances": _approved_form_instances(document),
        },
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }


async def _store_deployment_artifacts(storage_prefix: str, manifest: dict[str, Any], organization_id: uuid.UUID) -> None:
    manifest_bytes = json.dumps(manifest, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    await run_in_threadpool(
        lambda: upload_bytes(
            settings.S3_BUCKET_EXPORTS,
            f"{storage_prefix}/manifest.json",
            manifest_bytes,
            "application/json",
            verified_organization_id=organization_id,
        )
    )
    for page in manifest.get("pages", []):
        if not isinstance(page, dict) or not isinstance(page.get("html"), str):
            continue
        artifact_path = str(page.get("artifactPath") or "index.html").strip("/")
        await run_in_threadpool(
            lambda path=artifact_path, content=page["html"]: upload_bytes(
                settings.S3_BUCKET_EXPORTS,
                f"{storage_prefix}/{path}",
                content.encode("utf-8"),
                "text/html; charset=utf-8",
                verified_organization_id=organization_id,
            )
        )


def _hash_ip(raw_ip: str | None) -> str | None:
    if not raw_ip:
        return None
    return hashlib.sha256(raw_ip.encode("utf-8")).hexdigest()


def _asset_response(row: WebsiteSiteAssetRef) -> WebsiteAssetReferenceResponse:
    return WebsiteAssetReferenceResponse(
        id=row.id,
        kind=row.kind,
        source=row.source,
        url=row.url,
        storage_path=row.storage_path,
        creator=row.creator,
        license=row.license,
        attribution=row.attribution,
        metadata=row.asset_metadata,
        created_at=row.created_at,
    )


def _normalize_domain(value: str) -> str:
    domain = value.strip().lower().removeprefix("https://").removeprefix("http://").strip("/")
    allowed = set("abcdefghijklmnopqrstuvwxyz0123456789-.")
    if not domain or any(char not in allowed for char in domain) or "." not in domain or domain.startswith(".") or domain.endswith("."):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"code": "INVALID_WEBSITE_DOMAIN"})
    return domain


def _domain_token() -> str:
    return f"eventos-site-verification-{uuid.uuid4().hex}"


def _domain_response(row: WebsiteSiteDomain) -> WebsiteDomainResponse:
    return WebsiteDomainResponse(
        id=row.id,
        domain=row.domain,
        verification_token=row.verification_token,
        verification_record_name=f"_eventos-verify.{row.domain}",
        verification_record_value=f"eventos-site-verification={row.verification_token}",
        dns_state=row.dns_state,
        tls_state=row.tls_state,
        active_deployment_id=row.active_deployment_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


async def _verify_domain_txt(domain: str, token: str) -> bool:
    record_name = f"_eventos-verify.{domain}"
    expected = f"eventos-site-verification={token}"
    async with httpx.AsyncClient(timeout=httpx.Timeout(6.0, connect=3.0)) as client:
        response = await client.get(
            "https://cloudflare-dns.com/dns-query",
            params={"name": record_name, "type": "TXT"},
            headers={"Accept": "application/dns-json"},
        )
        response.raise_for_status()
        payload = response.json()
    answers = payload.get("Answer") if isinstance(payload, dict) else []
    for answer in answers if isinstance(answers, list) else []:
        if not isinstance(answer, dict):
            continue
        value = str(answer.get("data") or "").strip().strip('"').replace('" "', "")
        if value in {expected, token}:
            return True
    return False


def _public_url(event_id: uuid.UUID) -> str:
    return f"/api/v1/public/events/{event_id}/website"


def _public_site_url(slug: str) -> str:
    return f"{settings.API_BASE_URL.rstrip('/')}{settings.api_v1_prefix}/public/sites/{slug}"


def _public_asset_url(event_id: uuid.UUID, asset_ref_id: uuid.UUID) -> str:
    return f"/api/v1/public/events/{event_id}/website/assets/{asset_ref_id}"


def _validate_upload_file(file: UploadFile, file_size: int) -> None:
    if file_size > settings.MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={"code": "WEBSITE_ASSET_TOO_LARGE", "message": f"File exceeds {settings.MAX_FILE_SIZE_MB}MB."},
        )
    filename = file.filename or "asset"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    restricted = {"exe", "msi", "bat", "cmd", "ps1", "vbs", "sh", "bin", "com", "scr", "pif", "js", "jar", "app", "dmg", "pkg", "html", "htm"}
    if ext in restricted:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"code": "WEBSITE_ASSET_TYPE_RESTRICTED"})
    content_type = (file.content_type or "").lower()
    allowed = content_type.startswith("image/") or content_type in {"application/pdf", "application/octet-stream"}
    if not allowed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"code": "WEBSITE_ASSET_MIME_RESTRICTED"})


def _sanitize_uploaded_svg(content: bytes) -> bytes:
    try:
        parser = etree.XMLParser(resolve_entities=False, no_network=True, recover=False, huge_tree=False)
        root = etree.fromstring(content, parser=parser)
    except (etree.XMLSyntaxError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"code": "WEBSITE_SVG_INVALID"}) from exc
    if etree.QName(root).localname.lower() != "svg":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"code": "WEBSITE_SVG_INVALID_ROOT"})
    nodes = list(root.iter())
    if len(nodes) > 10_000:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"code": "WEBSITE_SVG_TOO_COMPLEX"})
    prohibited = {"script", "foreignobject", "iframe", "object", "embed", "audio", "video"}
    for node in nodes:
        if etree.QName(node).localname.lower() in prohibited:
            parent = node.getparent()
            if parent is not None:
                parent.remove(node)
            continue
        for attribute_name in list(node.attrib):
            local_name = etree.QName(attribute_name).localname.lower()
            value = str(node.attrib.get(attribute_name) or "").strip()
            lowered = value.lower()
            if local_name.startswith("on") or local_name in {"src", "srcdoc"}:
                del node.attrib[attribute_name]
            elif local_name in {"href"} and value and not value.startswith("#"):
                del node.attrib[attribute_name]
            elif local_name == "style" and re.search(r"url\s*\(|@import|expression\s*\(|javascript\s*:|vbscript\s*:", lowered):
                del node.attrib[attribute_name]
    return etree.tostring(root, encoding="utf-8", xml_declaration=False)


async def _asset_publish_diagnostics(db: DB, site_id: uuid.UUID, document: dict[str, Any]) -> list[dict[str, Any]]:
    diagnostics: list[dict[str, Any]] = []
    rows = await WebsiteEventSnapshotQueryService.list_asset_diagnostics(db, site_id)
    for row in rows:
        if not _document_uses_asset(document, row) or not row.asset_id:
            continue
        processing_status = row.processing_status
        if processing_status != "READY":
            diagnostics.append({
                "severity": "error",
                "code": "ASSET_NOT_READY",
                "message": f"Asset {row.id} cannot be published while its processing status is {processing_status}.",
            })
    return diagnostics


def _deployment_response(deployment: WebsiteSiteDeployment) -> WebsiteDeploymentResponse:
    site_slug = str(deployment.rendered_manifest.get("siteSlug") or "").strip()
    return WebsiteDeploymentResponse(
        deployment_id=deployment.id,
        revision_id=deployment.revision_id,
        site_id=deployment.site_id,
        status=deployment.status,
        storage_prefix=deployment.storage_prefix,
        manifest=deployment.rendered_manifest,
        diagnostics=deployment.diagnostics,
        activated_at=deployment.activated_at,
        public_url=_public_site_url(site_slug) if site_slug else (_public_url(uuid.UUID(str(deployment.rendered_manifest.get("eventId")))) if deployment.rendered_manifest.get("eventId") else None),
    )


async def _get_or_create_site(db: DB, event: CurrentEvent) -> WebsiteSite:
    site = await db.scalar(
        select(WebsiteSite).where(
            WebsiteSite.event_id == event.id,
            WebsiteSite.organization_id == event.organization_id,
        )
    )
    if site:
        return site
    event_code = (event.short_code or event.name or str(event.id)).lower()
    slug = f"{event_code.replace(' ', '-')}-website"
    site = WebsiteSite(
        id=uuid.uuid4(),
        organization_id=event.organization_id,
        event_id=event.id,
        name=f"{event.name} Website",
        slug=slug,
        status="DRAFT",
        settings={},
    )
    db.add(site)
    await db.flush()
    return site


async def _get_public_active_deployment(db: DB, event_id: uuid.UUID) -> WebsiteSiteDeployment:
    event_exists, deployment = await WebsiteEventSnapshotQueryService.get_public_active_deployment(db, event_id)
    if not event_exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "EVENT_NOT_FOUND"})
    if not deployment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "WEBSITE_NOT_PUBLISHED"})
    return deployment


async def _get_or_create_draft(db: DB, site: WebsiteSite, event: CurrentEvent) -> WebsiteSiteDraft:
    draft = await db.scalar(select(WebsiteSiteDraft).where(WebsiteSiteDraft.site_id == site.id))
    if draft:
        if draft.revision_counter == 1 and _is_legacy_empty_starter(draft.document):
            document = _default_document(event)
            draft.document = document
            draft.schema_version = 1
            draft.checksum = _checksum(document)
        return draft
    document = _default_document(event)
    draft = WebsiteSiteDraft(
        id=uuid.uuid4(),
        site_id=site.id,
        document=document,
        schema_version=1,
        checksum=_checksum(document),
        revision_counter=1,
    )
    db.add(draft)
    await db.flush()
    site.current_draft_id = draft.id
    return draft


async def _get_readonly_site_and_draft(db: DB, event: CurrentEvent) -> tuple[WebsiteSite, WebsiteSiteDraft]:
    """Read website state without provisioning records during a GET."""
    existing = await WebsiteEventSnapshotQueryService.get_event_draft(db, event.id, event.organization_id)
    site, draft = existing if existing else (None, None)
    now = datetime.now(timezone.utc)
    if site is None:
        event_code = (event.short_code or event.name or str(event.id)).lower()
        site = WebsiteSite(
            id=uuid.uuid4(),
            organization_id=event.organization_id,
            event_id=event.id,
            name=f"{event.name} Website",
            slug=f"{event_code.replace(' ', '-')}-website",
            status="DRAFT",
            settings={},
            editor_schema_version=1,
            created_at=now,
            updated_at=now,
        )
        document = _default_document(event)
        draft = WebsiteSiteDraft(
            id=uuid.uuid4(),
            site_id=site.id,
            document=document,
            schema_version=1,
            checksum=_checksum(document),
            revision_counter=1,
            editor_schema_version=1,
            created_at=now,
            updated_at=now,
        )
        return site, draft

    if draft is None:
        document = _default_document(event)
        draft = WebsiteSiteDraft(
            id=uuid.uuid4(),
            site_id=site.id,
            document=document,
            schema_version=1,
            checksum=_checksum(document),
            revision_counter=1,
            editor_schema_version=1,
            created_at=now,
            updated_at=now,
        )
    return site, draft


def _response(site: WebsiteSite, draft: WebsiteSiteDraft) -> WebsiteDraftResponse:
    return WebsiteDraftResponse(
        site_id=site.id,
        site_slug=site.slug,
        draft_id=draft.id,
        event_id=site.event_id,
        organization_id=site.organization_id,
        document=draft.document,
        schema_version=draft.schema_version,
        checksum=draft.checksum,
        version=draft.revision_counter,
        updated_at=draft.updated_at,
    )


async def _get_or_create_master_template(db: DB, actor: SuperAdminOnly) -> WebsiteTemplate:
    template = await db.scalar(
        select(WebsiteTemplate).where(
            WebsiteTemplate.template_type == "WEBSITE",
            WebsiteTemplate.slug == "master-event-website",
            WebsiteTemplate.is_system.is_(True),
        )
    )
    if template:
        return template
    template = WebsiteTemplate(
        id=uuid.uuid4(),
        name="Master Event Website Template",
        slug="master-event-website",
        description="Global master website template for event websites.",
        template_type="WEBSITE",
        status="DRAFT",
        visibility="PUBLIC",
        is_system=True,
        is_marketplace=False,
        created_by=actor.id,
        updated_by=actor.id,
    )
    db.add(template)
    await db.flush()
    return template


async def _get_or_create_template_draft(db: DB, template: WebsiteTemplate) -> WebsiteTemplateDraft:
    draft = await db.scalar(select(WebsiteTemplateDraft).where(WebsiteTemplateDraft.template_id == template.id))
    if draft:
        if draft.optimistic_version == 1 and _is_legacy_empty_starter(draft.document):
            document = _default_platform_template_document()
            draft.document = document
            draft.schema_version = 1
            draft.checksum = _checksum(document)
        return draft
    document = _default_platform_template_document()
    draft = WebsiteTemplateDraft(
        id=uuid.uuid4(),
        template_id=template.id,
        document=document,
        schema_version=1,
        checksum=_checksum(document),
        optimistic_version=1,
    )
    db.add(draft)
    await db.flush()
    return draft


async def _get_readonly_master_template_and_draft(
    db: DB,
    actor: SuperAdminOnly,
) -> tuple[WebsiteTemplate, WebsiteTemplateDraft]:
    """Read the master template without creating defaults during a GET."""
    existing = await WebsiteEventSnapshotQueryService.get_master_template_draft(db)
    template, draft = existing if existing else (None, None)
    now = datetime.now(timezone.utc)
    if template is None:
        template = WebsiteTemplate(
            id=uuid.uuid4(),
            name="Master Event Website Template",
            slug="master-event-website",
            description="Global master website template for event websites.",
            template_type="WEBSITE",
            status="DRAFT",
            visibility="PUBLIC",
            is_system=True,
            is_marketplace=False,
            created_by=actor.id,
            updated_by=actor.id,
            created_at=now,
            updated_at=now,
        )
    if draft is None:
        document = _default_platform_template_document()
        draft = WebsiteTemplateDraft(
            id=uuid.uuid4(),
            template_id=template.id,
            document=document,
            schema_version=1,
            checksum=_checksum(document),
            optimistic_version=1,
            created_at=now,
            updated_at=now,
        )
    return template, draft


def _template_response(template: WebsiteTemplate, draft: WebsiteTemplateDraft) -> WebsiteTemplateDraftResponse:
    return WebsiteTemplateDraftResponse(
        template_id=template.id,
        draft_id=draft.id,
        name=template.name,
        slug=template.slug,
        document=draft.document,
        schema_version=draft.schema_version,
        checksum=draft.checksum,
        version=draft.optimistic_version,
        updated_at=draft.updated_at,
    )


async def _event_snapshot(db: DB, event: CurrentEvent) -> WebsiteEventSnapshotResponse:
    speakers = await WebsiteEventSnapshotQueryService.list_speakers(db, event.id)
    sessions = await WebsiteEventSnapshotQueryService.list_sessions(db, event.id)
    sponsors = await WebsiteEventSnapshotQueryService.list_sponsors(db, event.organization_id)

    mock_fallback = {
        "speakers": not bool(speakers),
        "sessions": not bool(sessions),
        "sponsors": not bool(sponsors),
        "venue": not bool(event.venue_name or event.location),
    }
    return WebsiteEventSnapshotResponse(
        snapshotId=f"event-{event.id}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
        snapshotCreatedAt=datetime.now(timezone.utc),
        dataStatus="connected",
        mockFallback=mock_fallback,
        eventName=event.name,
        shortCode=event.short_code,
        startDate=event.start_date.isoformat() if event.start_date else None,
        endDate=event.end_date.isoformat() if event.end_date else None,
        timezone=event.timezone,
        venue={
            "name": event.venue_name or "",
            "address": event.location or "",
            "city": event.state or "",
            "country": event.country or "",
        },
        organizer={
            "name": event.organizer_name or event.organizer_details.get("name") or "",
            "email": event.organizer_details.get("email") or "",
            "phone": event.organizer_details.get("phone") or "",
            "website": event.organizer_details.get("website") or "",
        },
        speakers=[
            {
                "id": str(speaker.id),
                "name": f"{speaker.first_name} {speaker.last_name}".strip(),
                "designation": speaker.designation or "",
                "organization": speaker.affiliation or "",
                "photo": speaker.photo_url,
                "speakerType": "INVITED",
                "bio": speaker.bio,
            }
            for speaker in speakers
        ],
        sessions=[
            {
                "id": str(session.id),
                "title": session.name,
                "date": session.start_time.date().isoformat(),
                "startTime": session.start_time.time().isoformat(timespec="minutes"),
                "endTime": session.end_time.time().isoformat(timespec="minutes"),
                "sessionType": session.session_type.upper(),
                "track": session.session_code,
                "description": session.description,
            }
            for session in sessions
        ],
        sponsors=[
            {
                "id": str(sponsor.id),
                "name": sponsor.name,
                "tier": sponsor.tier.upper(),
                "logoUrl": None,
            }
            for sponsor in sponsors
        ],
        stats={
            "totalSpeakers": len(speakers),
            "totalSessions": len(sessions),
            "totalSponsors": len(sponsors),
        },
    )


@platform_website_template_router.get("/master/draft", response_model=WebsiteTemplateDraftResponse)
async def get_master_website_template_draft(actor: SuperAdminOnly, db: DB):
    template, draft = await _get_readonly_master_template_and_draft(db, actor)
    return _template_response(template, draft)


@platform_website_template_router.put("/master/draft", response_model=WebsiteTemplateDraftResponse)
async def save_master_website_template_draft(
    payload: WebsiteDocumentEnvelope,
    actor: SuperAdminOnly,
    db: DB,
    if_match: int = Header(..., alias="If-Match", ge=1),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
):
    if not idempotency_key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"code": "IDEMPOTENCY_KEY_REQUIRED"})
    template = await _get_or_create_master_template(db, actor)
    draft = await _get_or_create_template_draft(db, template)
    mutation_payload = {"ifMatch": if_match, "document": payload.document, "schemaVersion": payload.schema_version}
    replay = await _find_mutation_replay(
        db,
        scope_type="TEMPLATE",
        scope_id=template.id,
        operation="SAVE_DRAFT",
        idempotency_key=idempotency_key,
        request_payload=mutation_payload,
    )
    if replay:
        return WebsiteTemplateDraftResponse.model_validate(replay.response_payload)
    if draft.optimistic_version != if_match:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "WEBSITE_TEMPLATE_DRAFT_CONFLICT", "serverVersion": draft.optimistic_version, "checksum": draft.checksum},
        )
    diagnostics = _validate_document(payload.document)
    if any(item["severity"] == "error" for item in diagnostics):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail={"code": "INVALID_WEBSITE_DOCUMENT", "diagnostics": diagnostics})
    draft.document = payload.document
    draft.schema_version = payload.schema_version
    draft.checksum = payload.checksum or _checksum(payload.document)
    draft.optimistic_version += 1
    draft.updated_by = actor.id
    template.updated_by = actor.id
    template.updated_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(draft)
    response = _template_response(template, draft)
    _record_mutation(
        db,
        scope_type="TEMPLATE",
        scope_id=template.id,
        operation="SAVE_DRAFT",
        idempotency_key=idempotency_key,
        request_payload=mutation_payload,
        response_type="TEMPLATE_DRAFT",
        response_id=draft.id,
        response_payload=response.model_dump(mode="json"),
        actor_id=actor.id,
    )
    db.add(_template_audit(
        actor,
        template_id=template.id,
        action="WEBSITE_TEMPLATE_DRAFT_SAVED",
        state={"draftId": str(draft.id), "version": draft.optimistic_version, "checksum": draft.checksum},
    ))
    await commit_transaction(db)
    return response


@platform_website_template_router.post("/master/validate", response_model=WebsiteValidationResponse)
async def validate_master_website_template(payload: WebsiteDocumentEnvelope, actor: SuperAdminOnly):
    _ = actor
    diagnostics = _validate_document(payload.document)
    return WebsiteValidationResponse(valid=not any(item["severity"] == "error" for item in diagnostics), diagnostics=diagnostics)


@platform_website_template_router.post("/master/preview", response_model=WebsitePreviewResponse)
async def create_or_update_master_website_template_preview(
    payload: WebsitePreviewRequest,
    actor: SuperAdminOnly,
    db: DB,
):
    template = await _get_or_create_master_template(db, actor)
    now = datetime.now(timezone.utc)
    await db.execute(delete(WebsiteTemplatePreview).where(WebsiteTemplatePreview.expires_at <= now))
    diagnostics = _validate_document(payload.document)
    if any(item["severity"] == "error" for item in diagnostics):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail={"code": "INVALID_WEBSITE_DOCUMENT", "diagnostics": diagnostics})
    preview = None
    if payload.preview_id:
        preview = await db.scalar(
            select(WebsiteTemplatePreview).where(
                WebsiteTemplatePreview.id == payload.preview_id,
                WebsiteTemplatePreview.template_id == template.id,
                WebsiteTemplatePreview.created_by == actor.id,
            )
        )
    preview_id = preview.id if preview else uuid.uuid4()
    checksum = payload.checksum or _checksum(payload.document)
    preview_site = type("TemplatePreviewSite", (), {
        "id": template.id,
        "slug": template.slug,
        "event_id": uuid.UUID(int=0),
        "organization_id": template.organization_id or uuid.UUID(int=0),
        "name": template.name,
    })()
    preview_revision = type("TemplatePreviewRevision", (), {"id": preview_id, "checksum": checksum})()
    manifest = _render_deployment_manifest(payload.document, preview_site, preview_revision)
    expires_at = now + timedelta(hours=2)
    if preview:
        preview.checksum = checksum
        preview.rendered_manifest = manifest
        preview.expires_at = expires_at
    else:
        preview = WebsiteTemplatePreview(
            id=preview_id,
            template_id=template.id,
            checksum=checksum,
            rendered_manifest=manifest,
            created_by=actor.id,
            expires_at=expires_at,
        )
        db.add(preview)
    await commit_transaction(db)
    preview_path = f"{settings.api_v1_prefix}/public/website-template-previews/{preview_id}"
    return WebsitePreviewResponse(
        preview_id=preview_id,
        url=f"{settings.API_BASE_URL.rstrip('/')}{preview_path}",
        checksum=checksum,
        expires_at=expires_at,
    )


@platform_website_template_router.post("/master/publish", response_model=WebsiteTemplatePublishResponse)
async def publish_master_website_template(
    actor: SuperAdminOnly,
    db: DB,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
):
    if not idempotency_key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"code": "IDEMPOTENCY_KEY_REQUIRED"})
    template = await _get_or_create_master_template(db, actor)
    draft = await _get_or_create_template_draft(db, template)
    mutation_payload = {"draftId": str(draft.id), "version": draft.optimistic_version, "checksum": draft.checksum}
    replay = await _find_mutation_replay(
        db,
        scope_type="TEMPLATE",
        scope_id=template.id,
        operation="PUBLISH",
        idempotency_key=idempotency_key,
        request_payload=mutation_payload,
    )
    if replay:
        return WebsiteTemplatePublishResponse.model_validate(replay.response_payload)
    diagnostics = _validate_document(draft.document)
    if any(item["severity"] == "error" for item in diagnostics):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail={"code": "INVALID_WEBSITE_DOCUMENT", "diagnostics": diagnostics})
    latest = await db.scalar(
        select(WebsiteTemplateVersion.version_number)
        .where(WebsiteTemplateVersion.template_id == template.id)
        .order_by(WebsiteTemplateVersion.version_number.desc())
        .limit(1)
    )
    version_number = int(latest or 0) + 1
    version = WebsiteTemplateVersion(
        id=uuid.uuid4(),
        template_id=template.id,
        version_number=version_number,
        description="Published from Command Center website builder",
        content={"document": draft.document},
        schema={"schemaVersion": draft.schema_version},
        assets={"assets": draft.document.get("assets", [])},
        document=draft.document,
        schema_version=draft.schema_version,
        checksum=draft.checksum,
        published_by=actor.id,
    )
    db.add(version)
    await db.flush()
    template.status = "PUBLISHED"
    template.current_version_id = version.id
    template.updated_by = actor.id
    response = WebsiteTemplatePublishResponse(template_id=template.id, version_id=version.id, version_number=version_number, checksum=draft.checksum)
    _record_mutation(
        db,
        scope_type="TEMPLATE",
        scope_id=template.id,
        operation="PUBLISH",
        idempotency_key=idempotency_key,
        request_payload=mutation_payload,
        response_type="TEMPLATE_VERSION",
        response_id=version.id,
        response_payload=response.model_dump(mode="json"),
        actor_id=actor.id,
    )
    db.add(_template_audit(
        actor,
        template_id=template.id,
        action="WEBSITE_TEMPLATE_PUBLISHED",
        state={"versionId": str(version.id), "versionNumber": version.version_number, "checksum": version.checksum},
    ))
    await commit_transaction(db)
    return response


@event_website_router.get("", response_model=WebsiteDraftResponse)
async def get_event_website(event: CurrentEvent, db: DB):
    site, draft = await _get_readonly_site_and_draft(db, event)
    return _response(site, draft)


@event_website_router.post("/editor-session", response_model=WebsiteEditorSessionResponse)
async def acquire_event_website_editor_session(event: CurrentEvent, db: DB, actor: ActiveUser):
    site = await _get_or_create_site(db, event)
    await _transaction_lock(db, f"website-editor:{site.id}")
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=60)
    await db.execute(
        delete(WebsiteEditorSession).where(
            WebsiteEditorSession.site_id == site.id,
            WebsiteEditorSession.expires_at <= now,
        )
    )
    own_session = await db.scalar(
        select(WebsiteEditorSession).where(
            WebsiteEditorSession.site_id == site.id,
            WebsiteEditorSession.user_id == actor.id,
            WebsiteEditorSession.expires_at > now,
        ).order_by(WebsiteEditorSession.created_at.asc()).limit(1)
    )
    if own_session:
        own_session.heartbeat_at = now
        own_session.expires_at = expires_at
        await commit_transaction(db)
        return WebsiteEditorSessionResponse(
            session_id=own_session.id,
            site_id=site.id,
            mode=own_session.mode,
            heartbeat_at=own_session.heartbeat_at,
            expires_at=own_session.expires_at,
        )

    active_editor = await db.scalar(
        select(WebsiteEditorSession).where(
            WebsiteEditorSession.site_id == site.id,
            WebsiteEditorSession.mode == "EDITOR",
            WebsiteEditorSession.expires_at > now,
        ).order_by(WebsiteEditorSession.created_at.asc()).limit(1)
    )
    session = WebsiteEditorSession(
        id=uuid.uuid4(),
        site_id=site.id,
        user_id=actor.id,
        mode="VIEWER" if active_editor else "EDITOR",
        heartbeat_at=now,
        expires_at=expires_at,
        session_metadata={"leaseSeconds": 60, "heartbeatSeconds": 20},
    )
    db.add(session)
    await commit_transaction(db)
    return WebsiteEditorSessionResponse(
        session_id=session.id,
        site_id=site.id,
        mode=session.mode,
        heartbeat_at=session.heartbeat_at,
        expires_at=session.expires_at,
    )


@event_website_router.delete("/editor-session", status_code=status.HTTP_204_NO_CONTENT)
async def release_event_website_editor_session(event: CurrentEvent, db: DB, actor: ActiveUser):
    # Cleanup can race with the initial acquire during a React remount. Use
    # the same per-site transaction lock as acquisition, and do not create a
    # site just because an unmount cleanup ran before acquisition completed.
    site = await db.scalar(
        select(WebsiteSite).where(
            WebsiteSite.event_id == event.id,
            WebsiteSite.organization_id == event.organization_id,
        )
    )
    if not site:
        return None
    await _transaction_lock(db, f"website-editor:{site.id}")
    await db.execute(
        delete(WebsiteEditorSession).where(
            WebsiteEditorSession.site_id == site.id,
            WebsiteEditorSession.user_id == actor.id,
        )
    )
    await commit_transaction(db)
    return None


@event_website_router.put("/draft", response_model=WebsiteDraftResponse)
async def save_event_website_draft(
    payload: WebsiteDocumentEnvelope,
    event: CurrentEvent,
    db: DB,
    actor: ActiveUser,
    if_match: int = Header(..., alias="If-Match", ge=1),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
):
    if not idempotency_key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"code": "IDEMPOTENCY_KEY_REQUIRED"})
    site = await _get_or_create_site(db, event)
    draft = await _get_or_create_draft(db, site, event)
    mutation_payload = {"ifMatch": if_match, "document": payload.document, "schemaVersion": payload.schema_version}
    replay = await _find_mutation_replay(
        db,
        scope_type="SITE",
        scope_id=site.id,
        operation="SAVE_DRAFT",
        idempotency_key=idempotency_key,
        request_payload=mutation_payload,
    )
    if replay:
        return WebsiteDraftResponse.model_validate(replay.response_payload)
    if draft.revision_counter != if_match:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "WEBSITE_DRAFT_CONFLICT",
                "serverVersion": draft.revision_counter,
                "checksum": draft.checksum,
                "changedInstanceIds": _changed_instance_ids(payload.document, draft.document),
            },
        )
    diagnostics = _validate_document(payload.document)
    if any(item["severity"] == "error" for item in diagnostics):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail={"code": "INVALID_WEBSITE_DOCUMENT", "diagnostics": diagnostics})
    draft.document = payload.document
    draft.schema_version = payload.schema_version
    draft.checksum = payload.checksum or _checksum(payload.document)
    draft.revision_counter += 1
    draft.updated_by = actor.id
    site.updated_at = datetime.now(timezone.utc)
    await _rebuild_link_index(db, site.id, payload.document)
    await db.flush()
    await db.refresh(draft)
    response = _response(site, draft)
    _record_mutation(
        db,
        scope_type="SITE",
        scope_id=site.id,
        operation="SAVE_DRAFT",
        idempotency_key=idempotency_key,
        request_payload=mutation_payload,
        response_type="DRAFT",
        response_id=draft.id,
        response_payload=response.model_dump(mode="json"),
        actor_id=actor.id,
    )
    db.add(_website_audit(
        actor,
        organization_id=event.organization_id,
        site_id=site.id,
        action="WEBSITE_DRAFT_SAVED",
        state={"draftId": str(draft.id), "revision": draft.revision_counter, "checksum": draft.checksum},
    ))
    await commit_transaction(db)
    return response


@event_website_router.post("/validate", response_model=WebsiteValidationResponse)
async def validate_event_website(payload: WebsiteDocumentEnvelope, event: CurrentEvent, db: DB):
    site = await _get_or_create_site(db, event)
    diagnostics = _validate_document(payload.document)
    diagnostics.extend(await _asset_publish_diagnostics(db, site.id, payload.document))
    return WebsiteValidationResponse(valid=not any(item["severity"] == "error" for item in diagnostics), diagnostics=diagnostics)


@event_website_router.post("/preview", response_model=WebsitePreviewResponse)
async def create_or_update_event_website_preview(
    payload: WebsitePreviewRequest,
    event: CurrentEvent,
    db: DB,
    actor: ActiveUser,
):
    site = await _get_or_create_site(db, event)
    now = datetime.now(timezone.utc)
    await db.execute(
        delete(WebsiteSiteDeployment).where(
            WebsiteSiteDeployment.site_id == site.id,
            WebsiteSiteDeployment.status == "PREVIEW",
            WebsiteSiteDeployment.expires_at <= now,
        )
    )
    diagnostics = _validate_document(payload.document)
    if any(item["severity"] == "error" for item in diagnostics):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail={"code": "INVALID_WEBSITE_DOCUMENT", "diagnostics": diagnostics})
    preview = None
    if payload.preview_id:
        preview = await db.scalar(
            select(WebsiteSiteDeployment).where(
                WebsiteSiteDeployment.id == payload.preview_id,
                WebsiteSiteDeployment.site_id == site.id,
                WebsiteSiteDeployment.status == "PREVIEW",
                WebsiteSiteDeployment.created_by == actor.id,
            )
        )
    preview_id = preview.id if preview else uuid.uuid4()
    checksum = payload.checksum or _checksum(payload.document)
    preview_revision = type("PreviewRevision", (), {"id": preview_id, "checksum": checksum})()
    manifest = _render_deployment_manifest(payload.document, site, preview_revision)
    expires_at = now + timedelta(hours=2)
    if preview:
        preview.rendered_manifest = manifest
        preview.diagnostics = diagnostics
        preview.expires_at = expires_at
    else:
        preview = WebsiteSiteDeployment(
            id=preview_id,
            site_id=site.id,
            revision_id=None,
            status="PREVIEW",
            storage_prefix=f"{site.organization_id}/website-sites/{site.id}/previews/{preview_id}",
            rendered_manifest=manifest,
            diagnostics=diagnostics,
            expires_at=expires_at,
            created_by=actor.id,
        )
        db.add(preview)
    await commit_transaction(db)
    preview_path = f"{settings.api_v1_prefix}/public/events/{event.id}/website/preview/{preview_id}"
    return WebsitePreviewResponse(
        preview_id=preview_id,
        url=f"{settings.API_BASE_URL.rstrip('/')}{preview_path}",
        checksum=checksum,
        expires_at=expires_at,
    )


@event_website_router.post("/checkpoint", response_model=WebsiteCheckpointResponse)
async def checkpoint_event_website(
    event: CurrentEvent,
    db: DB,
    actor: ActiveUser,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
):
    if not idempotency_key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"code": "IDEMPOTENCY_KEY_REQUIRED"})
    site = await _get_or_create_site(db, event)
    draft = await _get_or_create_draft(db, site, event)
    mutation_payload = {"draftChecksum": draft.checksum}
    replay = await _find_mutation_replay(
        db,
        scope_type="SITE",
        scope_id=site.id,
        operation="CHECKPOINT",
        idempotency_key=idempotency_key,
        request_payload=mutation_payload,
    )
    if replay:
        return WebsiteCheckpointResponse.model_validate(replay.response_payload)
    revision_number = await _next_revision_number(db, site.id)
    revision = WebsiteSiteRevision(
        id=uuid.uuid4(),
        site_id=site.id,
        revision_number=revision_number,
        reason="MANUAL_SAVE",
        document=draft.document,
        schema_version=draft.schema_version,
        checksum=draft.checksum,
        diagnostics=_validate_document(draft.document),
        created_by=actor.id,
    )
    db.add(revision)
    await db.flush()
    response = WebsiteCheckpointResponse(revision_id=revision.id, revision_number=revision_number, checksum=revision.checksum)
    _record_mutation(
        db,
        scope_type="SITE",
        scope_id=site.id,
        operation="CHECKPOINT",
        idempotency_key=idempotency_key,
        request_payload=mutation_payload,
        response_type="REVISION",
        response_id=revision.id,
        response_payload=response.model_dump(mode="json"),
        actor_id=actor.id,
    )
    db.add(_website_audit(
        actor,
        organization_id=site.organization_id,
        site_id=site.id,
        action="WEBSITE_CHECKPOINT_CREATED",
        state={"revisionId": str(revision.id), "revisionNumber": revision_number, "checksum": revision.checksum},
    ))
    await commit_transaction(db)
    return response


@event_website_router.post("/publish", response_model=WebsiteDeploymentResponse)
async def publish_event_website(
    payload: WebsitePublishRequest,
    event: CurrentEvent,
    db: DB,
    actor: ActiveUser,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
):
    if not idempotency_key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"code": "IDEMPOTENCY_KEY_REQUIRED"})
    site = await _get_or_create_site(db, event)
    draft = await _get_or_create_draft(db, site, event)
    requested_slug = payload.slug or site.slug
    conflicting_site = await db.scalar(
        select(WebsiteSite).where(WebsiteSite.slug == requested_slug, WebsiteSite.id != site.id)
    )
    if conflicting_site:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": "WEBSITE_SLUG_ALREADY_EXISTS"})
    requested_domain = _normalize_domain(payload.custom_domain) if payload.custom_domain else None
    if requested_domain:
        await enforce_event_operation(
            db,
            event.organization_id,
            event.id,
            "branding.custom_domain.manage",
            user_id=actor.id,
        )
    mutation_payload = {"draftChecksum": draft.checksum, "slug": requested_slug, "customDomain": requested_domain}
    replay = await _find_mutation_replay(
        db,
        scope_type="SITE",
        scope_id=site.id,
        operation="PUBLISH",
        idempotency_key=idempotency_key,
        request_payload=mutation_payload,
    )
    if replay:
        return WebsiteDeploymentResponse.model_validate(replay.response_payload)
    diagnostics = _validate_document(draft.document, publish=True)
    diagnostics.extend(await _asset_publish_diagnostics(db, site.id, draft.document))
    if any(item["severity"] == "error" for item in diagnostics):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail={"code": "INVALID_WEBSITE_DOCUMENT", "diagnostics": diagnostics})

    revision = WebsiteSiteRevision(
        id=uuid.uuid4(),
        site_id=site.id,
        revision_number=await _next_revision_number(db, site.id),
        reason="PUBLISH",
        document=draft.document,
        schema_version=draft.schema_version,
        checksum=draft.checksum,
        diagnostics=diagnostics,
        created_by=actor.id,
    )
    db.add(revision)
    await db.flush()

    await _supersede_active_deployments(db, site.id)
    site.slug = requested_slug
    storage_prefix = f"{site.organization_id}/website-sites/{site.id}/deployments/{revision.id}"
    manifest = _render_deployment_manifest(draft.document, site, revision)
    deployment = WebsiteSiteDeployment(
        id=uuid.uuid4(),
        site_id=site.id,
        revision_id=revision.id,
        status="PENDING",
        storage_prefix=storage_prefix,
        rendered_manifest=manifest,
        diagnostics=diagnostics,
        activated_at=None,
        created_by=actor.id,
    )
    db.add(deployment)
    await db.flush()
    await _store_deployment_artifacts(storage_prefix, manifest, site.organization_id)
    deployment.status = "ACTIVE"
    deployment.activated_at = datetime.now(timezone.utc)

    site.status = "PUBLISHED"
    site.published_at = deployment.activated_at
    site.current_deployment_id = deployment.id
    site.updated_at = datetime.now(timezone.utc)
    if requested_domain:
        domain = await db.scalar(select(WebsiteSiteDomain).where(WebsiteSiteDomain.domain == requested_domain))
        if domain and domain.site_id != site.id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": "WEBSITE_DOMAIN_ALREADY_EXISTS"})
        if not domain:
            domain = WebsiteSiteDomain(
                id=uuid.uuid4(),
                site_id=site.id,
                domain=requested_domain,
                verification_token=_domain_token(),
                dns_state="PENDING",
                tls_state="PENDING",
            )
            db.add(domain)
        domain.active_deployment_id = deployment.id
    response = _deployment_response(deployment)
    _record_mutation(
        db,
        scope_type="SITE",
        scope_id=site.id,
        operation="PUBLISH",
        idempotency_key=idempotency_key,
        request_payload=mutation_payload,
        response_type="DEPLOYMENT",
        response_id=deployment.id,
        response_payload=response.model_dump(mode="json"),
        actor_id=actor.id,
    )
    db.add(_website_audit(
        actor,
        organization_id=site.organization_id,
        site_id=site.id,
        action="WEBSITE_PUBLISHED",
        state={"deploymentId": str(deployment.id), "revisionId": str(revision.id), "slug": site.slug, "customDomain": requested_domain},
    ))
    await commit_transaction(db)
    await cache_service.invalidate_domain("published_website", site.organization_id, event.id)
    return response


@event_website_router.get("/deployments/current", response_model=WebsiteDeploymentResponse)
async def get_current_event_website_deployment(event: CurrentEvent, db: DB):
    site = await _get_or_create_site(db, event)
    if not site.current_deployment_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "NO_ACTIVE_WEBSITE_DEPLOYMENT"})
    deployment = await WebsiteEventSnapshotQueryService.get_current_deployment(
        db, site.id, site.current_deployment_id
    )
    if not deployment or not deployment.revision_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "NO_ACTIVE_WEBSITE_DEPLOYMENT"})
    return _deployment_response(deployment)


@event_website_router.post("/rollback", response_model=WebsiteDeploymentResponse)
async def rollback_event_website(
    payload: WebsiteRollbackRequest,
    event: CurrentEvent,
    db: DB,
    actor: ActiveUser,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
):
    if not idempotency_key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"code": "IDEMPOTENCY_KEY_REQUIRED"})
    site = await _get_or_create_site(db, event)
    source_revision = await db.scalar(
        select(WebsiteSiteRevision).where(
            WebsiteSiteRevision.id == payload.revision_id,
            WebsiteSiteRevision.site_id == site.id,
        )
    )
    if not source_revision:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "WEBSITE_REVISION_NOT_FOUND"})
    mutation_payload = {"revisionId": str(payload.revision_id)}
    replay = await _find_mutation_replay(
        db,
        scope_type="SITE",
        scope_id=site.id,
        operation="ROLLBACK",
        idempotency_key=idempotency_key,
        request_payload=mutation_payload,
    )
    if replay:
        return WebsiteDeploymentResponse.model_validate(replay.response_payload)

    diagnostics = _validate_document(source_revision.document, publish=True)
    diagnostics.extend(await _asset_publish_diagnostics(db, site.id, source_revision.document))
    if any(item["severity"] == "error" for item in diagnostics):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail={"code": "INVALID_WEBSITE_REVISION", "diagnostics": diagnostics})

    rollback_revision = WebsiteSiteRevision(
        id=uuid.uuid4(),
        site_id=site.id,
        revision_number=await _next_revision_number(db, site.id),
        reason="ROLLBACK",
        document=source_revision.document,
        schema_version=source_revision.schema_version,
        checksum=source_revision.checksum,
        diagnostics=diagnostics,
        created_by=actor.id,
    )
    db.add(rollback_revision)
    await db.flush()

    await _supersede_active_deployments(db, site.id)
    storage_prefix = f"{site.organization_id}/website-sites/{site.id}/deployments/{rollback_revision.id}"
    manifest = _render_deployment_manifest(source_revision.document, site, rollback_revision)
    deployment = WebsiteSiteDeployment(
        id=uuid.uuid4(),
        site_id=site.id,
        revision_id=rollback_revision.id,
        status="PENDING",
        storage_prefix=storage_prefix,
        rendered_manifest=manifest,
        diagnostics=diagnostics,
        activated_at=None,
        created_by=actor.id,
    )
    db.add(deployment)
    await db.flush()
    await _store_deployment_artifacts(storage_prefix, manifest, site.organization_id)
    deployment.status = "ACTIVE"
    deployment.activated_at = datetime.now(timezone.utc)
    site.status = "PUBLISHED"
    site.current_deployment_id = deployment.id
    site.published_at = deployment.activated_at
    site.updated_at = datetime.now(timezone.utc)
    response = _deployment_response(deployment)
    _record_mutation(
        db,
        scope_type="SITE",
        scope_id=site.id,
        operation="ROLLBACK",
        idempotency_key=idempotency_key,
        request_payload=mutation_payload,
        response_type="DEPLOYMENT",
        response_id=deployment.id,
        response_payload=response.model_dump(mode="json"),
        actor_id=actor.id,
    )
    db.add(_website_audit(
        actor,
        organization_id=site.organization_id,
        site_id=site.id,
        action="WEBSITE_ROLLED_BACK",
        state={"deploymentId": str(deployment.id), "sourceRevisionId": str(source_revision.id), "revisionId": str(rollback_revision.id)},
    ))
    await commit_transaction(db)
    await cache_service.invalidate_domain("published_website", site.organization_id, event.id)
    return response


@event_website_router.get("/revisions", response_model=list[WebsiteRevisionSummary])
async def list_event_website_revisions(event: CurrentEvent, db: DB):
    site = await _get_or_create_site(db, event)
    rows = await WebsiteEventSnapshotQueryService.list_revisions(db, site.id)
    return [
        WebsiteRevisionSummary(
            revision_id=row.id,
            revision_number=row.revision_number,
            reason=row.reason,
            checksum=row.checksum,
            diagnostics=row.diagnostics,
            created_at=row.created_at,
        )
        for row in rows
    ]


@event_website_router.post("/event-snapshot", response_model=WebsiteEventSnapshotResponse)
async def fetch_event_website_snapshot(event: CurrentEvent, db: DB):
    return await _event_snapshot(db, event)


@event_website_router.get("/assets", response_model=list[WebsiteAssetReferenceResponse])
async def list_event_website_assets(event: CurrentEvent, db: DB):
    site = await _get_or_create_site(db, event)
    rows = await WebsiteEventSnapshotQueryService.list_asset_references(db, site.id)
    return [_asset_response(row) for row in rows]


@event_website_router.post("/assets", response_model=WebsiteAssetReferenceResponse)
async def save_event_website_asset(
    payload: WebsiteAssetReferencePayload,
    event: CurrentEvent,
    db: DB,
    actor: ActiveUser,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
):
    if not idempotency_key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"code": "IDEMPOTENCY_KEY_REQUIRED"})
    site = await _get_or_create_site(db, event)
    mutation_payload = payload.model_dump(mode="json")
    replay = await _find_mutation_replay(db, scope_type="SITE", scope_id=site.id, operation="SAVE_ASSET", idempotency_key=idempotency_key, request_payload=mutation_payload)
    if replay:
        return WebsiteAssetReferenceResponse.model_validate(replay.response_payload)
    row = WebsiteSiteAssetRef(
        id=uuid.uuid4(),
        site_id=site.id,
        kind=payload.kind,
        source=payload.source,
        url=_safe_url(payload.url),
        storage_path=payload.storage_path,
        creator=payload.creator,
        license=payload.license,
        attribution=payload.attribution,
        asset_metadata=payload.metadata,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    response = _asset_response(row)
    _record_mutation(
        db,
        scope_type="SITE",
        scope_id=site.id,
        operation="SAVE_ASSET",
        idempotency_key=idempotency_key,
        request_payload=mutation_payload,
        response_type="ASSET",
        response_id=row.id,
        response_payload=response.model_dump(mode="json"),
        actor_id=actor.id,
    )
    db.add(_website_audit(
        actor,
        organization_id=event.organization_id,
        site_id=site.id,
        action="WEBSITE_ASSET_SAVED",
        state={"assetRefId": str(row.id), "kind": row.kind, "source": row.source},
    ))
    await commit_transaction(db)
    return response


@event_website_router.post("/assets/upload", response_model=WebsiteAssetReferenceResponse, status_code=status.HTTP_201_CREATED)
async def upload_event_website_asset(
    event: CurrentEvent,
    db: DB,
    actor: ActiveUser,
    file: UploadFile = File(...),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
):
    if not idempotency_key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"code": "IDEMPOTENCY_KEY_REQUIRED"})
    file_bytes = await file.read()
    _validate_upload_file(file, len(file_bytes))
    if (file.content_type or "").lower() == "image/svg+xml":
        file_bytes = _sanitize_uploaded_svg(file_bytes)
    site = await _get_or_create_site(db, event)
    mutation_payload = {
        "filename": file.filename or "website-asset",
        "contentType": file.content_type or "application/octet-stream",
        "sha256": hashlib.sha256(file_bytes).hexdigest(),
    }
    replay = await _find_mutation_replay(db, scope_type="SITE", scope_id=site.id, operation="UPLOAD_ASSET", idempotency_key=idempotency_key, request_payload=mutation_payload)
    if replay:
        return WebsiteAssetReferenceResponse.model_validate(replay.response_payload)
    asset = await FileService.upload_asset(
        db=db,
        org_id=event.organization_id,
        user_id=actor.id,
        filename=file.filename or "website-asset",
        content_type=file.content_type or "application/octet-stream",
        file_data=file_bytes,
        tags=["website-builder", f"event:{event.id}", f"site:{site.id}"],
    )
    row = WebsiteSiteAssetRef(
        id=uuid.uuid4(),
        site_id=site.id,
        asset_id=asset.id,
        kind="svg" if (file.content_type or "").lower().endswith("svg+xml") else "image",
        source="upload",
        url=_public_asset_url(event.id, uuid.uuid4()),
        storage_path=asset.file_path,
        creator=None,
        license=None,
        attribution=None,
        asset_metadata={
            "title": asset.name,
            "mimeType": asset.mime_type,
            "fileSizeBytes": asset.file_size_bytes,
            "processingStatus": asset.processing_status,
        },
    )
    row.url = _public_asset_url(event.id, row.id)
    db.add(row)
    await db.flush()
    await db.refresh(row)
    response = _asset_response(row)
    _record_mutation(
        db,
        scope_type="SITE",
        scope_id=site.id,
        operation="UPLOAD_ASSET",
        idempotency_key=idempotency_key,
        request_payload=mutation_payload,
        response_type="ASSET",
        response_id=row.id,
        response_payload=response.model_dump(mode="json"),
        actor_id=actor.id,
    )
    db.add(_website_audit(
        actor,
        organization_id=event.organization_id,
        site_id=site.id,
        action="WEBSITE_ASSET_UPLOADED",
        state={"assetRefId": str(row.id), "assetId": str(row.asset_id), "kind": row.kind},
    ))
    await commit_transaction(db)
    return response


@event_website_router.delete("/assets/{asset_ref_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event_website_asset(
    asset_ref_id: uuid.UUID,
    event: CurrentEvent,
    db: DB,
    actor: ActiveUser,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
):
    site = await _get_or_create_site(db, event)
    mutation_payload = {"assetRefId": str(asset_ref_id)}
    replay = await _find_mutation_replay(
        db,
        scope_type="SITE",
        scope_id=site.id,
        operation="DELETE_ASSET",
        idempotency_key=idempotency_key,
        request_payload=mutation_payload,
    )
    if replay:
        return None
    row = await db.scalar(
        select(WebsiteSiteAssetRef).where(
            WebsiteSiteAssetRef.id == asset_ref_id,
            WebsiteSiteAssetRef.site_id == site.id,
        )
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "WEBSITE_ASSET_NOT_FOUND"})
    draft = await db.scalar(select(WebsiteSiteDraft).where(WebsiteSiteDraft.site_id == site.id))
    if draft and _document_uses_asset(draft.document, row):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "WEBSITE_ASSET_IN_USE", "message": "Remove this asset from website components before deleting it."},
        )
    audit_state = {"assetRefId": str(row.id), "assetId": str(row.asset_id) if row.asset_id else None, "kind": row.kind}
    await db.delete(row)
    _record_mutation(
        db,
        scope_type="SITE",
        scope_id=site.id,
        operation="DELETE_ASSET",
        idempotency_key=idempotency_key,
        request_payload=mutation_payload,
        response_type="DELETED",
        response_id=asset_ref_id,
        response_payload={"deleted": True},
        actor_id=actor.id,
    )
    db.add(_website_audit(
        actor,
        organization_id=event.organization_id,
        site_id=site.id,
        action="WEBSITE_ASSET_DELETED",
        state=audit_state,
    ))
    await commit_transaction(db)
    return None


async def _search_openverse_images(q: str, page_size: int) -> list[OpenverseImageResult]:
    query = q.strip()
    if not query:
        return []
    page_size = max(1, min(page_size, 24))
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(8.0, connect=4.0)) as client:
            response = await client.get(
                "https://api.openverse.org/v1/images/",
                params={"q": query, "page_size": page_size},
                headers={"User-Agent": "Eventos Website Builder/1.0"},
            )
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail={"code": "OPENVERSE_UNAVAILABLE", "message": str(exc)}) from exc
    results = []
    for item in payload.get("results", []):
        if not isinstance(item, dict):
            continue
        title = item.get("title") or query
        creator = item.get("creator")
        license_name = item.get("license")
        results.append(
            OpenverseImageResult(
                id=str(item.get("id") or item.get("url") or uuid.uuid4()),
                title=str(title),
                url=_safe_url(item.get("url")),
                thumbnail=_safe_url(item.get("thumbnail")),
                creator=creator,
                source=item.get("foreign_landing_url") or item.get("source"),
                license=license_name,
                attribution=item.get("attribution") or " - ".join(str(part) for part in [title, creator, license_name] if part),
            )
        )
    return results


@platform_website_template_router.get("/assets/openverse", response_model=list[OpenverseImageResult])
async def search_platform_website_openverse_assets(actor: SuperAdminOnly, q: str, page_size: int = 12):
    _ = actor
    return await _search_openverse_images(q, page_size)


@event_website_router.get("/assets/openverse", response_model=list[OpenverseImageResult])
async def search_event_website_openverse_assets(event: CurrentEvent, q: str, page_size: int = 12):
    _ = event
    return await _search_openverse_images(q, page_size)


@event_website_router.get("/domains", response_model=list[WebsiteDomainResponse])
async def list_event_website_domains(event: CurrentEvent, db: DB):
    site = await _get_or_create_site(db, event)
    rows = await WebsiteEventSnapshotQueryService.list_domains(db, site.id)
    return [_domain_response(row) for row in rows]


@event_website_router.post("/domains", response_model=WebsiteDomainResponse, status_code=status.HTTP_201_CREATED)
async def create_event_website_domain(
    payload: WebsiteDomainCreateRequest,
    event: CurrentEvent,
    db: DB,
    actor: ActiveUser,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
):
    if not idempotency_key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"code": "IDEMPOTENCY_KEY_REQUIRED"})
    await enforce_event_operation(
        db,
        event.organization_id,
        event.id,
        "branding.custom_domain.manage",
        user_id=actor.id,
    )
    site = await _get_or_create_site(db, event)
    domain = _normalize_domain(payload.domain)
    mutation_payload = {"domain": domain}
    replay = await _find_mutation_replay(db, scope_type="SITE", scope_id=site.id, operation="CREATE_DOMAIN", idempotency_key=idempotency_key, request_payload=mutation_payload)
    if replay:
        return WebsiteDomainResponse.model_validate(replay.response_payload)
    existing = await db.scalar(select(WebsiteSiteDomain).where(WebsiteSiteDomain.domain == domain))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": "WEBSITE_DOMAIN_ALREADY_EXISTS"})
    row = WebsiteSiteDomain(
        id=uuid.uuid4(),
        site_id=site.id,
        domain=domain,
        verification_token=_domain_token(),
        dns_state="PENDING",
        tls_state="PENDING",
        active_deployment_id=site.current_deployment_id,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    response = _domain_response(row)
    _record_mutation(
        db,
        scope_type="SITE",
        scope_id=site.id,
        operation="CREATE_DOMAIN",
        idempotency_key=idempotency_key,
        request_payload=mutation_payload,
        response_type="DOMAIN",
        response_id=row.id,
        response_payload=response.model_dump(mode="json"),
        actor_id=actor.id,
    )
    db.add(_website_audit(
        actor,
        organization_id=event.organization_id,
        site_id=site.id,
        action="WEBSITE_DOMAIN_CREATED",
        state={"domainId": str(row.id), "domain": row.domain, "dnsState": row.dns_state, "tlsState": row.tls_state},
    ))
    await commit_transaction(db)
    return response


@event_website_router.post("/domains/{domain_id}/refresh", response_model=WebsiteDomainResponse)
async def refresh_event_website_domain(
    domain_id: uuid.UUID,
    event: CurrentEvent,
    db: DB,
    actor: ActiveUser,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
):
    if not idempotency_key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"code": "IDEMPOTENCY_KEY_REQUIRED"})
    await enforce_event_operation(
        db,
        event.organization_id,
        event.id,
        "branding.custom_domain.manage",
        user_id=actor.id,
    )
    site = await _get_or_create_site(db, event)
    row = await db.scalar(
        select(WebsiteSiteDomain).where(
            WebsiteSiteDomain.id == domain_id,
            WebsiteSiteDomain.site_id == site.id,
        )
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "WEBSITE_DOMAIN_NOT_FOUND"})
    mutation_payload = {"domainId": str(domain_id), "dnsState": row.dns_state, "tlsState": row.tls_state}
    replay = await _find_mutation_replay(db, scope_type="SITE", scope_id=site.id, operation="REFRESH_DOMAIN", idempotency_key=idempotency_key, request_payload=mutation_payload)
    if replay:
        return WebsiteDomainResponse.model_validate(replay.response_payload)
    row.active_deployment_id = site.current_deployment_id
    try:
        row.dns_state = "VERIFIED" if await _verify_domain_txt(row.domain, row.verification_token) else "PENDING"
    except (httpx.HTTPError, ValueError):
        row.dns_state = "PENDING"
    # TLS remains pending until the hosting provider confirms certificate activation.
    if row.dns_state != "VERIFIED":
        row.tls_state = "PENDING"
    row.updated_at = datetime.now(timezone.utc)
    await db.flush()
    response = _domain_response(row)
    _record_mutation(
        db,
        scope_type="SITE",
        scope_id=site.id,
        operation="REFRESH_DOMAIN",
        idempotency_key=idempotency_key,
        request_payload=mutation_payload,
        response_type="DOMAIN",
        response_id=row.id,
        response_payload=response.model_dump(mode="json"),
        actor_id=actor.id,
    )
    db.add(_website_audit(
        actor,
        organization_id=event.organization_id,
        site_id=site.id,
        action="WEBSITE_DOMAIN_REFRESHED",
        state={"domainId": str(row.id), "domain": row.domain, "dnsState": row.dns_state, "tlsState": row.tls_state},
    ))
    await commit_transaction(db)
    return response


@event_website_router.delete("/domains/{domain_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event_website_domain(
    domain_id: uuid.UUID,
    event: CurrentEvent,
    db: DB,
    actor: ActiveUser,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
):
    await enforce_event_operation(
        db,
        event.organization_id,
        event.id,
        "branding.custom_domain.manage",
        user_id=actor.id,
    )
    site = await _get_or_create_site(db, event)
    mutation_payload = {"domainId": str(domain_id)}
    replay = await _find_mutation_replay(
        db,
        scope_type="SITE",
        scope_id=site.id,
        operation="DELETE_DOMAIN",
        idempotency_key=idempotency_key,
        request_payload=mutation_payload,
    )
    if replay:
        return None
    row = await db.scalar(
        select(WebsiteSiteDomain).where(
            WebsiteSiteDomain.id == domain_id,
            WebsiteSiteDomain.site_id == site.id,
        )
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "WEBSITE_DOMAIN_NOT_FOUND"})
    audit_state = {"domainId": str(row.id), "domain": row.domain, "dnsState": row.dns_state, "tlsState": row.tls_state}
    await db.delete(row)
    _record_mutation(
        db,
        scope_type="SITE",
        scope_id=site.id,
        operation="DELETE_DOMAIN",
        idempotency_key=idempotency_key,
        request_payload=mutation_payload,
        response_type="DELETED",
        response_id=domain_id,
        response_payload={"deleted": True},
        actor_id=actor.id,
    )
    db.add(_website_audit(
        actor,
        organization_id=event.organization_id,
        site_id=site.id,
        action="WEBSITE_DOMAIN_DELETED",
        state=audit_state,
    ))
    await commit_transaction(db)
    return None


@public_website_runtime_router.post("/form-submissions", response_model=WebsiteFormSubmissionResponse)
async def submit_public_website_form(
    event_id: uuid.UUID,
    payload: WebsiteFormSubmissionRequest,
    request: Request,
    db: DB,
):
    if payload.honeypot:
        return WebsiteFormSubmissionResponse(status="accepted")

    deployment = await _get_public_active_deployment(db, event_id)
    _validate_form_payload(payload)
    runtime = deployment.rendered_manifest.get("runtime") if isinstance(deployment.rendered_manifest.get("runtime"), dict) else {}
    approved_forms = runtime.get("approvedFormInstances") if isinstance(runtime.get("approvedFormInstances"), list) else []
    approved_form = next(
        (item for item in approved_forms if isinstance(item, dict) and item.get("instanceId") == payload.component_instance_id),
        None,
    )
    if not approved_form:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "FORM_COMPONENT_NOT_PUBLISHED"})
    if approved_form.get("requiresConsent") and not any(value is True for value in payload.consent.values()):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail={"code": "FORM_CONSENT_REQUIRED"})

    ip_hash = _hash_ip(request.client.host if request.client else None)
    if ip_hash:
        recent_count = await db.scalar(
            select(func.count(WebsiteFormSubmission.id)).where(
                WebsiteFormSubmission.site_id == deployment.site_id,
                WebsiteFormSubmission.ip_hash == ip_hash,
                WebsiteFormSubmission.created_at >= datetime.now(timezone.utc) - timedelta(minutes=15),
            )
        )
        if int(recent_count or 0) >= 10:
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail={"code": "FORM_RATE_LIMITED"})

    submission = WebsiteFormSubmission(
        id=uuid.uuid4(),
        site_id=deployment.site_id,
        event_id=event_id,
        component_instance_id=payload.component_instance_id,
        payload=payload.payload,
        consent=payload.consent,
        spam_status="PENDING",
        ip_hash=ip_hash,
        user_agent=(request.headers.get("user-agent") or "")[:1000] or None,
    )
    db.add(submission)
    await commit_transaction(db)
    return WebsiteFormSubmissionResponse(submission_id=submission.id, status="accepted")


@public_website_runtime_router.get("/assets/{asset_ref_id}")
async def serve_public_website_asset(event_id: uuid.UUID, asset_ref_id: uuid.UUID, db: DB):
    deployment = await _get_public_active_deployment(db, event_id)
    asset_ref = await WebsiteEventSnapshotQueryService.get_public_asset(db, deployment.site_id, asset_ref_id)
    if not asset_ref or not asset_ref.storage_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "WEBSITE_ASSET_NOT_FOUND"})
    if asset_ref.processing_status is not None and asset_ref.processing_status != "READY":
            raise HTTPException(status_code=status.HTTP_423_LOCKED, detail={"code": "WEBSITE_ASSET_NOT_READY"})
    url = await run_in_threadpool(create_presigned_download,
        bucket=settings.S3_BUCKET_ASSETS,
        storage_path=asset_ref.storage_path,
        filename=str(asset_ref.asset_metadata.get("title") or "website-asset"),
    )
    return RedirectResponse(url)


async def _get_public_preview(db: DB, event_id: uuid.UUID, preview_id: uuid.UUID) -> WebsiteSiteDeployment:
    site_exists, preview = await WebsiteEventSnapshotQueryService.get_public_preview(db, event_id, preview_id)
    if not site_exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "WEBSITE_PREVIEW_NOT_FOUND"})
    if not preview:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "WEBSITE_PREVIEW_EXPIRED"})
    return preview


@public_website_runtime_router.get("/preview/{preview_id}/manifest")
async def get_public_website_preview_manifest(event_id: uuid.UUID, preview_id: uuid.UUID, db: DB):
    preview = await _get_public_preview(db, event_id, preview_id)
    return {
        "checksum": preview.rendered_manifest.get("checksum"),
        "pages": [page.get("route") for page in preview.rendered_manifest.get("pages", []) if isinstance(page, dict)],
        "expiresAt": preview.expires_at,
    }


@public_website_runtime_router.get("/preview/{preview_id}", response_class=HTMLResponse)
@public_website_runtime_router.get("/preview/{preview_id}/{route_path:path}", response_class=HTMLResponse)
async def serve_public_website_preview_page(event_id: uuid.UUID, preview_id: uuid.UUID, db: DB, route_path: str = ""):
    preview = await _get_public_preview(db, event_id, preview_id)
    preview_prefix = f"{settings.api_v1_prefix}/public/events/{event_id}/website/preview/{preview_id}"
    manifest_url = f"{preview_prefix}/manifest"
    return _serve_preview_page(preview.rendered_manifest, route_path, preview_prefix, manifest_url, preview.id)


def _serve_preview_page(
    manifest: dict[str, Any],
    route_path: str,
    preview_prefix: str,
    manifest_url: str,
    preview_id: uuid.UUID,
) -> HTMLResponse:
    route = f"/{route_path.strip('/')}" if route_path else "/"
    page = next(
        (item for item in manifest.get("pages", []) if isinstance(item, dict) and item.get("route") == route),
        None,
    )
    if not page or not isinstance(page.get("html"), str):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "WEBSITE_PREVIEW_PAGE_NOT_FOUND"})
    checksum = str(manifest.get("checksum") or "")
    navigation_script = f"""
(() => {{
  const previewPrefix = {json.dumps(preview_prefix)};
  document.addEventListener('click', event => {{
    const link = event.target?.closest?.('a[href]');
    const href = link?.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    if (!href.startsWith('/') || href.startsWith('//') || href.startsWith(previewPrefix)) return;
    event.preventDefault();
    window.top.location.href = previewPrefix + (href === '/' ? '' : href);
  }});
}})();
""".strip()
    page_html = page["html"].replace("</body>", f"<script>{navigation_script}</script></body>")
    sync_script = f"""
(() => {{
  const initialChecksum = {json.dumps(checksum)};
  window.setInterval(async () => {{
    try {{
      const response = await fetch({json.dumps(manifest_url)}, {{ cache: 'no-store' }});
      if (!response.ok) return;
      const latest = await response.json();
      if (latest.checksum && latest.checksum !== initialChecksum) window.location.reload();
    }} catch {{}}
  }}, 1200);
  document.querySelectorAll('[data-preview-device]').forEach(button => {{
    button.addEventListener('click', () => {{
      const device = button.dataset.previewDevice;
      document.body.dataset.device = device;
      document.querySelectorAll('[data-preview-device]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    }});
  }});
}})();
""".strip()
    title = html.escape(str(manifest.get("siteName") or manifest.get("name") or "Website preview"))
    shell_html = f"""<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title} preview</title><style>
:root{{color-scheme:dark}}*{{box-sizing:border-box}}body{{margin:0;min-height:100vh;overflow:hidden;background:#05070d;color:#f8fafc;font-family:Inter,ui-sans-serif,system-ui,sans-serif}}
.preview-shell{{display:grid;grid-template-rows:56px 1fr;height:100vh}}.preview-toolbar{{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:0 18px;border-bottom:1px solid rgba(148,163,184,.18);background:#080b13}}
.preview-title{{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:800}}.preview-title span{{color:#94a3b8;font-size:10px;font-weight:600}}
.preview-devices{{display:inline-flex;overflow:hidden;border:1px solid rgba(148,163,184,.2);border-radius:8px}}.preview-devices button{{height:34px;padding:0 16px;border:0;border-right:1px solid rgba(148,163,184,.16);background:transparent;color:#cbd5e1;font:700 11px inherit;cursor:pointer}}.preview-devices button:last-child{{border-right:0}}.preview-devices button[aria-pressed=true]{{background:#7c3aed;color:#fff}}
.preview-stage{{display:flex;min-height:0;justify-content:center;overflow:auto;background:#05070d}}iframe{{display:block;width:100%;height:calc(100vh - 56px);border:0;background:#080912;transition:width .18s ease,border-radius .18s ease,margin .18s ease}}
body[data-device=tablet] iframe{{width:768px;height:calc(100vh - 88px);margin:16px;border:1px solid rgba(148,163,184,.2);border-radius:10px}}body[data-device=mobile] iframe{{width:390px;height:calc(100vh - 88px);margin:16px;border:1px solid rgba(148,163,184,.2);border-radius:10px}}
</style></head><body data-device="desktop"><div class="preview-shell"><header class="preview-toolbar"><div class="preview-title">{title} <span>temporary preview link</span></div><div class="preview-devices" role="group" aria-label="Preview device"><button type="button" data-preview-device="desktop" aria-pressed="true">Desktop</button><button type="button" data-preview-device="tablet" aria-pressed="false">Tablet</button><button type="button" data-preview-device="mobile" aria-pressed="false">Mobile</button></div></header><main class="preview-stage"><iframe title="{title} website" srcdoc="{html.escape(page_html, quote=True)}"></iframe></main></div><script>{sync_script}</script></body></html>"""
    return HTMLResponse(
        content=shell_html,
        headers={
            "Cache-Control": "private, no-store",
            "X-Website-Preview": str(preview_id),
            "Content-Security-Policy": (
                "default-src 'self'; img-src 'self' https: data: blob:; "
                "style-src 'self' 'unsafe-inline'; "
                f"script-src 'self' 'sha256-{_script_hash(PUBLISHED_RUNTIME_SCRIPT)}' 'sha256-{_script_hash(navigation_script)}' 'sha256-{_script_hash(sync_script)}'; "
                "connect-src 'self'; frame-src https:; font-src 'self' https: data:; "
                "object-src 'none'; base-uri 'self'; form-action 'self'"
            ),
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer",
        },
    )


async def _get_public_template_preview(db: DB, preview_id: uuid.UUID) -> WebsiteTemplatePreview:
    preview = await db.scalar(
        select(WebsiteTemplatePreview)
        .where(
            WebsiteTemplatePreview.id == preview_id,
            WebsiteTemplatePreview.expires_at > datetime.now(timezone.utc),
        )
        .execution_options(skip_tenant_filter=True)
    )
    if not preview:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "WEBSITE_TEMPLATE_PREVIEW_EXPIRED"})
    return preview


@public_website_template_preview_router.get("/{preview_id}/manifest")
async def get_public_website_template_preview_manifest(preview_id: uuid.UUID, db: DB):
    preview = await _get_public_template_preview(db, preview_id)
    return {
        "checksum": preview.checksum,
        "pages": [page.get("route") for page in preview.rendered_manifest.get("pages", []) if isinstance(page, dict)],
        "expiresAt": preview.expires_at,
    }


@public_website_template_preview_router.get("/{preview_id}", response_class=HTMLResponse)
@public_website_template_preview_router.get("/{preview_id}/{route_path:path}", response_class=HTMLResponse)
async def serve_public_website_template_preview_page(preview_id: uuid.UUID, db: DB, route_path: str = ""):
    preview = await _get_public_template_preview(db, preview_id)
    preview_prefix = f"{settings.api_v1_prefix}/public/website-template-previews/{preview_id}"
    manifest_url = f"{preview_prefix}/manifest"
    return _serve_preview_page(preview.rendered_manifest, route_path, preview_prefix, manifest_url, preview.id)


async def _serve_deployment_page(deployment: WebsiteSiteDeployment, route_path: str, url_prefix: str) -> HTMLResponse:
    route = f"/{route_path.strip('/')}" if route_path else "/"
    organization_id = deployment.rendered_manifest.get("organizationId")
    try:
        organization_uuid = uuid.UUID(str(organization_id))
    except (TypeError, ValueError, AttributeError):
        organization_uuid = None
    cache_key = None
    if organization_uuid:
        cache_key = TenantCacheKey.event(
            deployment.site_id,
            "published-website",
            deployment.id,
            hashlib.sha256(route.encode("utf-8")).hexdigest(),
            organization_id=organization_uuid,
        )
        cached_html = await cache_service.get_json(cache_key)
        if isinstance(cached_html, str):
            return HTMLResponse(content=cached_html, headers={
                "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
                "X-Website-Deployment": str(deployment.id),
            })
    pages = deployment.rendered_manifest.get("pages", [])
    if not isinstance(pages, list):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "WEBSITE_PAGE_NOT_FOUND"})
    for page in pages:
        if isinstance(page, dict) and page.get("route") == route:
            page_html = page.get("html")
            organization_id = deployment.rendered_manifest.get("organizationId")
            artifact_path = page.get("artifactPath")
            if organization_id and isinstance(artifact_path, str) and deployment.storage_prefix:
                try:
                    page_html = (
                        await run_in_threadpool(
                            lambda: get_object_bytes(
                                settings.S3_BUCKET_EXPORTS,
                                f"{deployment.storage_prefix}/{artifact_path.strip('/')}",
                                verified_organization_id=uuid.UUID(str(organization_id)),
                            )
                        )
                    ).decode("utf-8")
                except (RuntimeError, UnicodeDecodeError, ValueError):
                    # Legacy deployments remain available from their immutable database manifest.
                    page_html = page.get("html")
            if isinstance(page_html, str):
                page_html = re.sub(r'href="/(?!/)', f'href="{url_prefix.rstrip("/")}/', page_html)
                if cache_key:
                    await cache_service.set_json(cache_key, page_html, ttl(CacheTTL.PUBLISHED_WEBSITE))
                return HTMLResponse(
                    content=page_html,
                    headers={
                        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
                        "X-Website-Deployment": str(deployment.id),
                        "Content-Security-Policy": (
                            "default-src 'self'; img-src 'self' https: data: blob:; "
                            "style-src 'self' 'unsafe-inline'; "
                            f"script-src 'self' 'sha256-{_script_hash(PUBLISHED_RUNTIME_SCRIPT)}'; "
                            "connect-src 'self'; frame-src https:; font-src 'self' https: data:; "
                            "object-src 'none'; base-uri 'self'; form-action 'self'"
                        ),
                        "X-Content-Type-Options": "nosniff",
                        "Referrer-Policy": "strict-origin-when-cross-origin",
                    },
                )
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "WEBSITE_PAGE_NOT_FOUND"})


@public_website_runtime_router.get("", response_class=HTMLResponse)
@public_website_runtime_router.get("/{route_path:path}", response_class=HTMLResponse)
async def serve_public_website_page(event_id: uuid.UUID, db: DB, route_path: str = ""):
    deployment = await _get_public_active_deployment(db, event_id)
    prefix = f"{settings.api_v1_prefix}/public/events/{event_id}/website"
    return await _serve_deployment_page(deployment, route_path, prefix)


@public_website_slug_router.get("/{site_slug}", response_class=HTMLResponse)
@public_website_slug_router.get("/{site_slug}/{route_path:path}", response_class=HTMLResponse)
async def serve_public_website_by_slug(site_slug: str, db: DB, route_path: str = ""):
    deployment = await WebsiteEventSnapshotQueryService.get_published_site_by_slug(db, site_slug)
    if not deployment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "WEBSITE_NOT_PUBLISHED"})
    return await _serve_deployment_page(
        deployment,
        route_path,
        f"{settings.api_v1_prefix}/public/sites/{site_slug}",
    )
