from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import secrets
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import CurrentEvent, StepUpAuth, SuperAdminOnly, get_current_user, get_db
from app.modules.audit.models.audit_log import AuditLog
from app.modules.billing.services.capability_service import CapabilityService
from app.modules.communications.models.email_template import EmailTemplate
from app.modules.communications.models.email_template_version import EmailTemplateVersion
from app.modules.communications.models.email_component import EmailComponent
from app.modules.communications.models.email_asset import EmailAsset
from app.modules.communications.models.email_branding_policy import EmailBrandingPolicy
from app.modules.notifications.schemas.email_asset import (
    EmailAssetResponse,
    EmailBrandingPolicyResponse,
    EmailBrandingPolicyUpdate,
)
from app.modules.billing.services.usage_reservation_service import UsageReservationService
from app.config import settings
from app.services import upload_service
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.identity.models.user import User
from app.modules.notifications.schemas.email_template_studio import (
    TemplateDraftWrite,
    EmailFragmentCreate,
    EmailFragmentResponse,
    TemplateFamilyCreate,
    TemplatePublishRequest,
    TemplatePreviewRequest,
    TemplatePreviewResponse,
    TemplateRollbackRequest,
    TemplateTestSendRequest,
    TemplateStudioResponse,
    TemplateVersionResponse,
)
from app.modules.notifications.services.email_template_studio_service import (
    create_family,
    designer_enabled_for_event,
    designer_enabled_for_organization,
    list_effective_templates,
    publish_draft,
    render_draft_snapshot,
    rollback_to_version,
    save_draft,
)
from app.core.dependencies.feature_gate import enforce_event_operation, require_event_operation
from app.modules.notifications.services.email_service import send_email


platform_router = APIRouter(
    prefix="/platform/communications/email-templates",
    tags=["Platform Email Templates"],
)
organization_router = APIRouter(
    prefix="/organizations/{organization_id}/email-templates",
    tags=["Organization Email Templates"],
)
event_router = APIRouter(
    prefix="/events/{event_id}/notifications/template-studio",
    tags=["Event Email Templates"],
)
platform_component_router = APIRouter(prefix="/platform/communications/email-components", tags=["Platform Email Components"])
organization_component_router = APIRouter(prefix="/organizations/{organization_id}/email-components", tags=["Organization Email Components"])
event_component_router = APIRouter(prefix="/events/{event_id}/notifications/email-components", tags=["Event Email Components"])
platform_asset_router = APIRouter(prefix="/platform/communications/email-assets", tags=["Platform Email Assets"])
organization_asset_router = APIRouter(prefix="/organizations/{organization_id}/email-assets", tags=["Organization Email Assets"])
event_asset_router = APIRouter(prefix="/events/{event_id}/notifications/email-assets", tags=["Event Email Assets"])
email_asset_delivery_router = APIRouter(prefix="/communications/email-assets", tags=["Email Asset Delivery"])
branding_policy_router = APIRouter(prefix="/communications/email-branding-policy", tags=["Email Branding Policy"])
platform_branding_policy_router = APIRouter(prefix="/platform/communications/email-branding-policy", tags=["Platform Email Branding Policy"])

EMAIL_ASSET_TYPES = {
    "image/png": ("png", lambda value: value.startswith(b"\x89PNG\r\n\x1a\n")),
    "image/jpeg": ("jpg", lambda value: value.startswith(b"\xff\xd8\xff")),
    "image/gif": ("gif", lambda value: value.startswith((b"GIF87a", b"GIF89a"))),
    "image/webp": ("webp", lambda value: len(value) >= 12 and value[:4] == b"RIFF" and value[8:12] == b"WEBP"),
}
MAX_EMAIL_ASSET_BYTES = 5 * 1024 * 1024


def _branding_response(row: EmailBrandingPolicy, *, editable: bool) -> EmailBrandingPolicyResponse:
    return EmailBrandingPolicyResponse(
        enabled=row.enabled, text=row.text, icon_url=row.icon_url,
        destination_url=row.destination_url, version=row.version, editable=editable,
    )


async def _branding_policy(db: AsyncSession) -> EmailBrandingPolicy:
    row = await db.get(EmailBrandingPolicy, 1)
    if row is None:
        # Fail closed: a missing singleton still produces the locked mark.
        row = EmailBrandingPolicy(id=1, enabled=True, text="In collaboration with EventOS", version=1)
        db.add(row)
        await db.flush()
    return row


async def _latest_state(db: AsyncSession, family: EmailTemplate) -> tuple[str, dict | None]:
    draft = await db.scalar(
        select(EmailTemplateVersion).where(
            EmailTemplateVersion.template_id == family.id,
            EmailTemplateVersion.lifecycle_state == "DRAFT",
        )
    )
    if draft:
        return "DRAFT", draft.designer_json
    current = None
    if family.current_published_version_id:
        current = await db.get(EmailTemplateVersion, family.current_published_version_id)
    return (current.lifecycle_state if current else "DRAFT"), (current.designer_json if current else family.designer_json)


async def _response(
    db: AsyncSession,
    family: EmailTemplate,
    *,
    editable: bool,
    effective_origin: str | None = None,
    fallback_reason: str | None = None,
) -> TemplateStudioResponse:
    lifecycle, designer_json = await _latest_state(db, family)
    draft = await db.scalar(select(EmailTemplateVersion).where(
        EmailTemplateVersion.template_id == family.id,
        EmailTemplateVersion.lifecycle_state == "DRAFT",
    ))
    return TemplateStudioResponse(
        id=family.id,
        name=family.name,
        stable_key=family.stable_key,
        template_type=family.template_type,
        target_type=family.target_type,
        scope_type=family.scope_type,
        organization_id=family.organization_id,
        event_id=family.event_id,
        parent_template_id=family.parent_template_id,
        subject=draft.subject if draft else family.subject,
        preheader=draft.preheader if draft else family.preheader,
        body_html=draft.body_html if draft else family.body_html,
        body_text=draft.body_text if draft else family.body_text,
        designer_json=designer_json,
        version=family.version,
        lifecycle_state=lifecycle,
        current_published_version_id=family.current_published_version_id,
        effective_origin=effective_origin or family.scope_type,
        editable=editable,
        fallback_reason=fallback_reason,
    )


def _audit(
    *, actor: User, family: EmailTemplate, action: str, reason: str, version_id: uuid.UUID | None = None
) -> AuditLog:
    return AuditLog(
        organization_id=family.organization_id or actor.organization_id,
        actor_user_id=actor.id,
        resource_type="email_template",
        resource_id=family.id,
        action_type=action,
        actor_role=actor.platform_role or actor.role,
        new_state={
            "scope_type": family.scope_type,
            "stable_key": family.stable_key,
            "version": family.version,
            "published_version_id": str(version_id) if version_id else None,
        },
        change_diff={"reason": reason},
        is_sensitive=False,
    )


async def _require_org_admin(db: AsyncSession, actor: User, organization_id: uuid.UUID) -> None:
    if actor.organization_id != organization_id:
        raise HTTPException(status_code=404, detail={"code": "ORGANIZATION_NOT_FOUND"})
    membership = await db.scalar(select(OrganizationMember).where(
        OrganizationMember.organization_id == organization_id,
        OrganizationMember.user_id == actor.id,
        OrganizationMember.is_active.is_(True),
    ))
    role = membership.org_role if membership else actor.role
    if role not in {"owner", "admin", "organiser", "organizer"}:
        raise HTTPException(status_code=403, detail={"code": "ORGANIZATION_ADMIN_REQUIRED"})


async def _render_preview(db: AsyncSession, family: EmailTemplate, payload: TemplatePreviewRequest) -> TemplatePreviewResponse:
    branding = await _branding_policy(db)
    subject, html, plain_text = render_draft_snapshot(
        designer_json=payload.designer_json, body_html=payload.body_html,
        subject=payload.subject, preheader=payload.preheader,
        template_type=family.template_type, target_type=family.target_type,
        branding_policy={
            "enabled": branding.enabled, "text": branding.text,
            "icon_url": branding.icon_url, "destination_url": branding.destination_url,
        },
    )
    return TemplatePreviewResponse(subject=subject, html=html, plain_text=plain_text, diagnostics=[])


def _validate_fragment(payload: EmailFragmentCreate) -> None:
    if len(json.dumps(payload.document_fragment, separators=(",", ":")).encode()) > 256 * 1024:
        raise HTTPException(status_code=413, detail={"code": "EMAIL_COMPONENT_TOO_LARGE"})
    nodes = payload.document_fragment.get("nodes")
    roots = payload.document_fragment.get("rootIds")
    if not isinstance(nodes, dict) or not isinstance(roots, list) or not roots or any(root not in nodes for root in roots):
        raise HTTPException(status_code=422, detail={"code": "INVALID_EMAIL_COMPONENT_FRAGMENT"})


def _fragment_response(row: EmailComponent, editable: bool) -> EmailFragmentResponse:
    return EmailFragmentResponse(
        id=row.id, name=row.name, stable_key=row.stable_key, component_kind=row.component_kind,
        category=row.category, scope_type=row.scope_type, organization_id=row.organization_id,
        event_id=row.event_id, document_fragment=row.document_fragment,
        preview_metadata=row.preview_metadata, version=row.version, created_at=row.created_at,
        updated_at=row.updated_at, editable=editable,
    )


async def _create_fragment(
    db: AsyncSession, *, payload: EmailFragmentCreate, scope_type: str,
    actor: User, organization_id: uuid.UUID | None = None, event_id: uuid.UUID | None = None,
) -> EmailComponent:
    _validate_fragment(payload)
    duplicate = await db.scalar(select(EmailComponent.id).where(
        EmailComponent.scope_type == scope_type, EmailComponent.organization_id == organization_id,
        EmailComponent.event_id == event_id, EmailComponent.stable_key == payload.stable_key,
        EmailComponent.deleted_at.is_(None),
    ).execution_options(skip_tenant_filter=True))
    if duplicate:
        raise HTTPException(status_code=409, detail={"code": "EMAIL_COMPONENT_EXISTS"})
    row = EmailComponent(
        scope_type=scope_type, organization_id=organization_id, event_id=event_id,
        component_type=payload.category, name=payload.name, default_config=payload.document_fragment,
        is_global=scope_type == "PLATFORM", stable_key=payload.stable_key,
        component_kind=payload.component_kind, category=payload.category,
        document_fragment=payload.document_fragment, preview_metadata=payload.preview_metadata,
        created_by=actor.id,
    )
    db.add(row)
    await db.flush()
    return row


async def _update_fragment(
    db: AsyncSession, *, row: EmailComponent, payload: EmailFragmentCreate, expected_version: int,
) -> EmailComponent:
    _validate_fragment(payload)
    if row.version != expected_version:
        raise HTTPException(status_code=409, detail={"code": "EMAIL_COMPONENT_VERSION_CONFLICT", "current_version": row.version})
    row.name = payload.name; row.stable_key = payload.stable_key; row.component_kind = payload.component_kind
    row.category = payload.category; row.component_type = payload.category
    row.document_fragment = payload.document_fragment; row.default_config = payload.document_fragment
    row.preview_metadata = payload.preview_metadata; row.version += 1; row.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return row


async def _store_asset(
    db: AsyncSession, *, file: UploadFile, actor: User, scope_type: str,
    organization_id: uuid.UUID | None, idempotency_key: str,
    event_id: uuid.UUID | None = None, asset_kind: str = "IMAGE",
) -> EmailAsset:
    name = (file.filename or "").strip()
    content_type = (file.content_type or "").lower()
    rule = EMAIL_ASSET_TYPES.get(content_type)
    if not name or len(name) > 255:
        raise HTTPException(status_code=422, detail={"code": "INVALID_FILE_NAME"})
    if rule is None:
        raise HTTPException(status_code=415, detail={"code": "UNSUPPORTED_EMAIL_ASSET_TYPE"})
    contents = await file.read(MAX_EMAIL_ASSET_BYTES + 1)
    if not contents:
        raise HTTPException(status_code=422, detail={"code": "EMPTY_FILE"})
    if len(contents) > MAX_EMAIL_ASSET_BYTES:
        raise HTTPException(status_code=413, detail={"code": "EMAIL_ASSET_TOO_LARGE", "max_bytes": MAX_EMAIL_ASSET_BYTES})
    extension, signature_matches = rule
    if not signature_matches(contents):
        raise HTTPException(status_code=415, detail={"code": "INVALID_EMAIL_ASSET_CONTENT"})
    reservation = None
    if scope_type == "ORGANIZATION" and organization_id:
        reservation = await UsageReservationService.reserve(
            db, organization_id=organization_id, event_id=None, limit_key="storage_quota_mb",
            quantity=max(1, (len(contents) + 1024 * 1024 - 1) // (1024 * 1024)), unit="megabyte",
            idempotency_key=f"email-asset-upload:{idempotency_key}", metadata={"file_name": name},
        )
    asset_id = uuid.uuid4()
    scope_path = "platform" if scope_type == "PLATFORM" else f"{organization_id}/{event_id or 'organization'}"
    storage_path = f"{scope_path}/email_assets/{asset_id}.{extension}"
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    public_url = f"{settings.API_BASE_URL.rstrip('/')}{settings.api_v1_prefix}/communications/email-assets/{asset_id}/download?token={token}"
    try:
        await asyncio.to_thread(
            upload_service.upload_bytes,
            bucket=settings.S3_BUCKET_ASSETS,
            storage_path=storage_path,
            data=contents,
            content_type=content_type,
            verified_organization_id=organization_id,
            allow_platform=scope_type == "PLATFORM",
        )
    except Exception as exc:
        if reservation:
            await UsageReservationService.release(db, reservation.id)
            await db.commit()
        raise HTTPException(status_code=503, detail={"code": "ASSET_STORAGE_UNAVAILABLE"}) from exc
    row = EmailAsset(
        id=asset_id, scope_type=scope_type, organization_id=organization_id, event_id=event_id,
        user_id=actor.id, name=name, url=public_url, storage_path=storage_path,
        access_token_hash=token_hash, file_type=content_type, size_bytes=len(contents),
        asset_kind=asset_kind, source_type="UPLOAD", checksum=hashlib.sha256(contents).hexdigest(),
    )
    db.add(row)
    if reservation:
        await UsageReservationService.consume(db, reservation.id, source="email_studio.asset_upload", actor_user_id=actor.id)
    await db.commit()
    await db.refresh(row)
    return row


@platform_router.get("", response_model=list[TemplateStudioResponse])
async def list_platform_templates(
    current_user: SuperAdminOnly,
    target_type: str = Query("speaker", pattern="^(speaker|participant|attendee)$"),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.scalars(select(EmailTemplate).where(
        EmailTemplate.scope_type == "PLATFORM",
        EmailTemplate.target_type == target_type,
        EmailTemplate.deleted_at.is_(None),
    ).order_by(EmailTemplate.name).execution_options(skip_tenant_filter=True))).all()
    return [await _response(db, row, editable=True) for row in rows]


@platform_router.post("", response_model=TemplateStudioResponse, status_code=status.HTTP_201_CREATED)
async def create_platform_template(
    payload: TemplateFamilyCreate,
    current_user: SuperAdminOnly,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    db: AsyncSession = Depends(get_db),
):
    del idempotency_key
    parent = await db.get(EmailTemplate, payload.parent_template_id) if payload.parent_template_id else None
    family = await create_family(
        db,
        scope_type="PLATFORM",
        organization_id=None,
        event_id=None,
        parent=parent,
        name=payload.name,
        stable_key=payload.stable_key,
        template_type=payload.template_type,
        target_type=payload.target_type,
        actor_user_id=current_user.id,
    )
    db.add(_audit(actor=current_user, family=family, action="PLATFORM_EMAIL_TEMPLATE_CREATED", reason="Platform template draft created"))
    await db.commit()
    return await _response(db, family, editable=True)


@platform_router.put("/{template_id}/draft", response_model=TemplateStudioResponse)
async def save_platform_draft(
    template_id: uuid.UUID,
    payload: TemplateDraftWrite,
    current_user: SuperAdminOnly,
    expected_version: int = Header(..., alias="If-Match", ge=1),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    db: AsyncSession = Depends(get_db),
):
    del idempotency_key
    family, _ = await save_draft(
        db,
        template_id=template_id,
        actor_user_id=current_user.id,
        expected_version=expected_version,
        **payload.model_dump(),
    )
    if family.scope_type != "PLATFORM":
        raise HTTPException(status_code=404, detail={"code": "PLATFORM_TEMPLATE_NOT_FOUND"})
    await db.commit()
    return await _response(db, family, editable=True)


@platform_router.post("/{template_id}/publish", response_model=TemplateStudioResponse)
async def publish_platform_template(
    template_id: uuid.UUID,
    payload: TemplatePublishRequest,
    current_user: SuperAdminOnly,
    step_up: StepUpAuth,
    expected_version: int = Header(..., alias="If-Match", ge=1),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    db: AsyncSession = Depends(get_db),
):
    del step_up, idempotency_key
    family, published = await publish_draft(
        db, template_id=template_id, actor_user_id=current_user.id, expected_version=expected_version
    )
    if family.scope_type != "PLATFORM":
        raise HTTPException(status_code=404, detail={"code": "PLATFORM_TEMPLATE_NOT_FOUND"})
    db.add(_audit(actor=current_user, family=family, action="PLATFORM_EMAIL_TEMPLATE_PUBLISHED", reason=payload.reason, version_id=published.id))
    await db.commit()
    return await _response(db, family, editable=True)


@platform_router.post("/{template_id}/preview", response_model=TemplatePreviewResponse)
async def preview_platform_template(
    template_id: uuid.UUID, payload: TemplatePreviewRequest,
    current_user: SuperAdminOnly, db: AsyncSession = Depends(get_db),
):
    family = await db.scalar(select(EmailTemplate).where(
        EmailTemplate.id == template_id, EmailTemplate.scope_type == "PLATFORM",
    ).execution_options(skip_tenant_filter=True))
    if family is None:
        raise HTTPException(status_code=404, detail={"code": "PLATFORM_TEMPLATE_NOT_FOUND"})
    return await _render_preview(db, family, payload)


@platform_router.post("/{template_id}/test-send", status_code=status.HTTP_202_ACCEPTED)
async def test_platform_template(
    template_id: uuid.UUID, payload: TemplateTestSendRequest,
    current_user: SuperAdminOnly,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    db: AsyncSession = Depends(get_db),
):
    del idempotency_key
    family = await db.scalar(select(EmailTemplate).where(
        EmailTemplate.id == template_id, EmailTemplate.scope_type == "PLATFORM",
    ).execution_options(skip_tenant_filter=True))
    if family is None:
        raise HTTPException(status_code=404, detail={"code": "PLATFORM_TEMPLATE_NOT_FOUND"})
    preview = await _render_preview(db, family, payload)
    await send_email(to_email=str(payload.recipient_email), subject=f"[TEST] {preview.subject}", html_body=preview.html, text_body=preview.plain_text)
    return {"status": "accepted"}


@platform_router.get("/{template_id}/versions", response_model=list[TemplateVersionResponse])
async def list_platform_versions(
    template_id: uuid.UUID,
    current_user: SuperAdminOnly,
    db: AsyncSession = Depends(get_db),
):
    family = await db.scalar(select(EmailTemplate).where(
        EmailTemplate.id == template_id
    ).execution_options(skip_tenant_filter=True))
    if family is None or family.scope_type != "PLATFORM":
        raise HTTPException(status_code=404, detail={"code": "PLATFORM_TEMPLATE_NOT_FOUND"})
    return (await db.scalars(select(EmailTemplateVersion).where(
        EmailTemplateVersion.template_id == template_id
    ).order_by(EmailTemplateVersion.version_number.desc()))).all()


@platform_router.post("/{template_id}/rollback", response_model=TemplateStudioResponse)
async def rollback_platform_template(
    template_id: uuid.UUID,
    payload: TemplateRollbackRequest,
    current_user: SuperAdminOnly,
    step_up: StepUpAuth,
    expected_version: int = Header(..., alias="If-Match", ge=1),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    db: AsyncSession = Depends(get_db),
):
    del step_up, idempotency_key
    family, restored = await rollback_to_version(
        db,
        template_id=template_id,
        source_version_id=payload.version_id,
        actor_user_id=current_user.id,
        expected_version=expected_version,
    )
    db.add(_audit(actor=current_user, family=family, action="PLATFORM_EMAIL_TEMPLATE_ROLLED_BACK", reason=payload.reason, version_id=restored.id))
    await db.commit()
    return await _response(db, family, editable=True)


@organization_router.get("", response_model=list[TemplateStudioResponse])
async def list_organization_templates(
    organization_id: uuid.UUID,
    actor: User = Depends(get_current_user),
    target_type: str = Query("speaker", pattern="^(speaker|participant|attendee)$"),
    db: AsyncSession = Depends(get_db),
):
    await _require_org_admin(db, actor, organization_id)
    enabled, reason = await designer_enabled_for_organization(db, organization_id, actor.id)
    rows = await list_effective_templates(
        db,
        organization_id=organization_id,
        event_id=None,
        target_type=target_type,
        designer_enabled=enabled,
    )
    return [await _response(db, row, editable=enabled, effective_origin=origin, fallback_reason=None if enabled else reason or "NOT_ENTITLED") for row, origin in rows]


@organization_router.put("/{template_id}/draft", response_model=TemplateStudioResponse)
async def save_organization_draft(
    organization_id: uuid.UUID,
    template_id: uuid.UUID,
    payload: TemplateDraftWrite,
    actor: User = Depends(get_current_user),
    expected_version: int = Header(..., alias="If-Match", ge=1),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    db: AsyncSession = Depends(get_db),
):
    del idempotency_key
    await _require_org_admin(db, actor, organization_id)
    enabled, _ = await designer_enabled_for_organization(db, organization_id, actor.id)
    if not enabled:
        raise HTTPException(status_code=402, detail={"code": "FEAT_EMAIL_DESIGNER_REQUIRED"})
    source = await db.scalar(select(EmailTemplate).where(
        EmailTemplate.id == template_id,
        or_(
            EmailTemplate.scope_type == "PLATFORM",
            (EmailTemplate.scope_type == "ORGANIZATION") & (EmailTemplate.organization_id == organization_id),
        ),
    ).execution_options(skip_tenant_filter=True))
    if source is None:
        raise HTTPException(status_code=404, detail={"code": "EMAIL_TEMPLATE_NOT_FOUND"})
    family = source
    if source.scope_type == "PLATFORM":
        family = await create_family(
            db,
            scope_type="ORGANIZATION",
            organization_id=organization_id,
            event_id=None,
            parent=source,
            name=payload.name,
            stable_key=source.stable_key,
            template_type=source.template_type,
            target_type=source.target_type,
            actor_user_id=actor.id,
        )
        expected_version = family.version
    elif source.scope_type != "ORGANIZATION" or source.organization_id != organization_id:
        raise HTTPException(status_code=404, detail={"code": "EMAIL_TEMPLATE_NOT_EDITABLE"})
    family, _ = await save_draft(db, template_id=family.id, actor_user_id=actor.id, expected_version=expected_version, **payload.model_dump())
    await db.commit()
    return await _response(db, family, editable=True)


@organization_router.post("/{template_id}/publish", response_model=TemplateStudioResponse)
async def publish_organization_template(
    organization_id: uuid.UUID,
    template_id: uuid.UUID,
    payload: TemplatePublishRequest,
    actor: User = Depends(get_current_user),
    expected_version: int = Header(..., alias="If-Match", ge=1),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    db: AsyncSession = Depends(get_db),
):
    del idempotency_key
    await _require_org_admin(db, actor, organization_id)
    enabled, _ = await designer_enabled_for_organization(db, organization_id, actor.id)
    if not enabled:
        raise HTTPException(status_code=402, detail={"code": "FEAT_EMAIL_DESIGNER_REQUIRED"})
    family, published = await publish_draft(
        db, template_id=template_id, actor_user_id=actor.id, expected_version=expected_version
    )
    if family.scope_type != "ORGANIZATION" or family.organization_id != organization_id:
        raise HTTPException(status_code=404, detail={"code": "EMAIL_TEMPLATE_NOT_EDITABLE"})
    db.add(_audit(actor=actor, family=family, action="ORGANIZATION_EMAIL_TEMPLATE_PUBLISHED", reason=payload.reason, version_id=published.id))
    await db.commit()
    return await _response(db, family, editable=True)


@organization_router.post("/{template_id}/preview", response_model=TemplatePreviewResponse)
async def preview_organization_template(
    organization_id: uuid.UUID, template_id: uuid.UUID, payload: TemplatePreviewRequest,
    actor: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    await _require_org_admin(db, actor, organization_id)
    family = await db.scalar(select(EmailTemplate).where(
        EmailTemplate.id == template_id,
        or_(EmailTemplate.scope_type == "PLATFORM", EmailTemplate.organization_id == organization_id),
    ).execution_options(skip_tenant_filter=True))
    if family is None:
        raise HTTPException(status_code=404, detail={"code": "EMAIL_TEMPLATE_NOT_FOUND"})
    return await _render_preview(db, family, payload)


@organization_router.post("/{template_id}/test-send", status_code=status.HTTP_202_ACCEPTED)
async def test_organization_template(
    organization_id: uuid.UUID, template_id: uuid.UUID, payload: TemplateTestSendRequest,
    actor: User = Depends(get_current_user),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    db: AsyncSession = Depends(get_db),
):
    del idempotency_key
    await _require_org_admin(db, actor, organization_id)
    enabled, _ = await designer_enabled_for_organization(db, organization_id, actor.id)
    if not enabled:
        raise HTTPException(status_code=402, detail={"code": "FEAT_EMAIL_DESIGNER_REQUIRED"})
    family = await db.scalar(select(EmailTemplate).where(
        EmailTemplate.id == template_id,
        or_(EmailTemplate.scope_type == "PLATFORM", EmailTemplate.organization_id == organization_id),
    ).execution_options(skip_tenant_filter=True))
    if family is None:
        raise HTTPException(status_code=404, detail={"code": "EMAIL_TEMPLATE_NOT_FOUND"})
    preview = await _render_preview(db, family, payload)
    await send_email(to_email=str(payload.recipient_email), subject=f"[TEST] {preview.subject}", html_body=preview.html, text_body=preview.plain_text)
    return {"status": "accepted"}


@organization_router.get("/{template_id}/versions", response_model=list[TemplateVersionResponse])
async def list_organization_template_versions(
    organization_id: uuid.UUID,
    template_id: uuid.UUID,
    actor: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_org_admin(db, actor, organization_id)
    family = await db.scalar(select(EmailTemplate).where(
        EmailTemplate.id == template_id,
        EmailTemplate.organization_id == organization_id,
    ).execution_options(skip_tenant_filter=True))
    if family is None or family.organization_id != organization_id:
        raise HTTPException(status_code=404, detail={"code": "EMAIL_TEMPLATE_NOT_FOUND"})
    return (await db.scalars(select(EmailTemplateVersion).where(
        EmailTemplateVersion.template_id == template_id
    ).order_by(EmailTemplateVersion.version_number.desc()))).all()


@organization_router.post("/{template_id}/rollback", response_model=TemplateStudioResponse)
async def rollback_organization_template(
    organization_id: uuid.UUID,
    template_id: uuid.UUID,
    payload: TemplateRollbackRequest,
    actor: User = Depends(get_current_user),
    expected_version: int = Header(..., alias="If-Match", ge=1),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    db: AsyncSession = Depends(get_db),
):
    del idempotency_key
    await _require_org_admin(db, actor, organization_id)
    enabled, _ = await designer_enabled_for_organization(db, organization_id, actor.id)
    if not enabled:
        raise HTTPException(status_code=402, detail={"code": "FEAT_EMAIL_DESIGNER_REQUIRED"})
    family = await db.scalar(select(EmailTemplate).where(
        EmailTemplate.id == template_id,
        EmailTemplate.scope_type == "ORGANIZATION",
        EmailTemplate.organization_id == organization_id,
    ).execution_options(skip_tenant_filter=True))
    if family is None:
        raise HTTPException(status_code=404, detail={"code": "EMAIL_TEMPLATE_NOT_FOUND"})
    family, restored = await rollback_to_version(
        db, template_id=template_id, source_version_id=payload.version_id,
        actor_user_id=actor.id, expected_version=expected_version,
    )
    db.add(_audit(actor=actor, family=family, action="ORGANIZATION_EMAIL_TEMPLATE_ROLLED_BACK", reason=payload.reason, version_id=restored.id))
    await db.commit()
    return await _response(db, family, editable=True)


@event_router.get("", response_model=list[TemplateStudioResponse], dependencies=[require_event_operation("communications.email.read")])
async def list_event_studio_templates(
    event_id: uuid.UUID,
    event: CurrentEvent,
    actor: User = Depends(get_current_user),
    target_type: str = Query("speaker", pattern="^(speaker|participant|attendee)$"),
    db: AsyncSession = Depends(get_db),
):
    enabled, reason = await designer_enabled_for_event(db, event.organization_id, event_id, actor.id)
    rows = await list_effective_templates(
        db,
        organization_id=event.organization_id,
        event_id=event_id,
        target_type=target_type,
        designer_enabled=enabled,
    )
    return [await _response(db, row, editable=enabled, effective_origin=origin, fallback_reason=None if enabled else reason or "NOT_ENTITLED") for row, origin in rows]


@event_router.put("/{template_id}/draft", response_model=TemplateStudioResponse)
async def save_event_studio_draft(
    event_id: uuid.UUID,
    template_id: uuid.UUID,
    payload: TemplateDraftWrite,
    event: CurrentEvent,
    actor: User = Depends(get_current_user),
    expected_version: int = Header(..., alias="If-Match", ge=1),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    db: AsyncSession = Depends(get_db),
):
    del idempotency_key
    await enforce_event_operation(db, event.organization_id, event_id, "communications.email_designer.manage", user_id=actor.id)
    source = await db.scalar(select(EmailTemplate).where(
        EmailTemplate.id == template_id,
        or_(
            EmailTemplate.scope_type == "PLATFORM",
            (EmailTemplate.scope_type == "ORGANIZATION") & (EmailTemplate.organization_id == event.organization_id),
            (EmailTemplate.scope_type == "EVENT") & (EmailTemplate.event_id == event_id),
        ),
    ).execution_options(skip_tenant_filter=True))
    if source is None:
        raise HTTPException(status_code=404, detail={"code": "EMAIL_TEMPLATE_NOT_FOUND"})
    family = source
    if source.scope_type != "EVENT":
        family = await create_family(
            db,
            scope_type="EVENT",
            organization_id=None,
            event_id=event_id,
            parent=source,
            name=payload.name,
            stable_key=source.stable_key,
            template_type=source.template_type,
            target_type=source.target_type,
            actor_user_id=actor.id,
        )
        expected_version = family.version
    elif source.event_id != event_id:
        raise HTTPException(status_code=404, detail={"code": "EMAIL_TEMPLATE_NOT_EDITABLE"})
    family, _ = await save_draft(db, template_id=family.id, actor_user_id=actor.id, expected_version=expected_version, **payload.model_dump())
    await db.commit()
    return await _response(db, family, editable=True)


@event_router.post("/{template_id}/publish", response_model=TemplateStudioResponse)
async def publish_event_studio_template(
    event_id: uuid.UUID,
    template_id: uuid.UUID,
    payload: TemplatePublishRequest,
    event: CurrentEvent,
    actor: User = Depends(get_current_user),
    expected_version: int = Header(..., alias="If-Match", ge=1),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    db: AsyncSession = Depends(get_db),
):
    del idempotency_key
    await enforce_event_operation(db, event.organization_id, event_id, "communications.email_designer.manage", user_id=actor.id)
    family, published = await publish_draft(db, template_id=template_id, actor_user_id=actor.id, expected_version=expected_version)
    if family.event_id != event_id:
        raise HTTPException(status_code=404, detail={"code": "EMAIL_TEMPLATE_NOT_EDITABLE"})
    db.add(_audit(actor=actor, family=family, action="EVENT_EMAIL_TEMPLATE_PUBLISHED", reason=payload.reason, version_id=published.id))
    await db.commit()
    return await _response(db, family, editable=True)


@event_router.post("/{template_id}/preview", response_model=TemplatePreviewResponse, dependencies=[require_event_operation("communications.email.read")])
async def preview_event_template(
    event_id: uuid.UUID, template_id: uuid.UUID, payload: TemplatePreviewRequest,
    event: CurrentEvent, db: AsyncSession = Depends(get_db),
):
    family = await db.scalar(select(EmailTemplate).where(
        EmailTemplate.id == template_id,
        or_(
            EmailTemplate.scope_type == "PLATFORM",
            (EmailTemplate.scope_type == "ORGANIZATION") & (EmailTemplate.organization_id == event.organization_id),
            (EmailTemplate.scope_type == "EVENT") & (EmailTemplate.event_id == event_id),
        ),
    ).execution_options(skip_tenant_filter=True))
    if family is None:
        raise HTTPException(status_code=404, detail={"code": "EMAIL_TEMPLATE_NOT_FOUND"})
    return await _render_preview(db, family, payload)


@event_router.post("/{template_id}/test-send", status_code=status.HTTP_202_ACCEPTED)
async def test_event_template(
    event_id: uuid.UUID, template_id: uuid.UUID, payload: TemplateTestSendRequest,
    event: CurrentEvent, actor: User = Depends(get_current_user),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    db: AsyncSession = Depends(get_db),
):
    del idempotency_key
    await enforce_event_operation(db, event.organization_id, event_id, "communications.email_designer.manage", user_id=actor.id)
    family = await db.scalar(select(EmailTemplate).where(
        EmailTemplate.id == template_id,
        or_(
            EmailTemplate.scope_type == "PLATFORM",
            (EmailTemplate.scope_type == "ORGANIZATION") & (EmailTemplate.organization_id == event.organization_id),
            (EmailTemplate.scope_type == "EVENT") & (EmailTemplate.event_id == event_id),
        ),
    ).execution_options(skip_tenant_filter=True))
    if family is None:
        raise HTTPException(status_code=404, detail={"code": "EMAIL_TEMPLATE_NOT_FOUND"})
    preview = await _render_preview(db, family, payload)
    await send_email(to_email=str(payload.recipient_email), subject=f"[TEST] {preview.subject}", html_body=preview.html, text_body=preview.plain_text, event_id=event_id, db=db)
    await db.commit()
    return {"status": "accepted"}


@event_router.get("/{template_id}/versions", response_model=list[TemplateVersionResponse], dependencies=[require_event_operation("communications.email.read")])
async def list_event_template_versions(
    event_id: uuid.UUID,
    template_id: uuid.UUID,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
):
    family = await db.scalar(select(EmailTemplate).where(
        EmailTemplate.id == template_id,
        EmailTemplate.event_id == event_id,
    ).execution_options(skip_tenant_filter=True))
    if family is None or family.event_id != event_id:
        raise HTTPException(status_code=404, detail={"code": "EMAIL_TEMPLATE_NOT_FOUND"})
    return (await db.scalars(select(EmailTemplateVersion).where(
        EmailTemplateVersion.template_id == template_id
    ).order_by(EmailTemplateVersion.version_number.desc()))).all()


@event_router.post("/{template_id}/rollback", response_model=TemplateStudioResponse)
async def rollback_event_template(
    event_id: uuid.UUID,
    template_id: uuid.UUID,
    payload: TemplateRollbackRequest,
    event: CurrentEvent,
    actor: User = Depends(get_current_user),
    expected_version: int = Header(..., alias="If-Match", ge=1),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    db: AsyncSession = Depends(get_db),
):
    del idempotency_key
    await enforce_event_operation(db, event.organization_id, event_id, "communications.email_designer.manage", user_id=actor.id)
    family = await db.scalar(select(EmailTemplate).where(
        EmailTemplate.id == template_id,
        EmailTemplate.scope_type == "EVENT",
        EmailTemplate.event_id == event_id,
    ).execution_options(skip_tenant_filter=True))
    if family is None:
        raise HTTPException(status_code=404, detail={"code": "EMAIL_TEMPLATE_NOT_FOUND"})
    family, restored = await rollback_to_version(
        db, template_id=template_id, source_version_id=payload.version_id,
        actor_user_id=actor.id, expected_version=expected_version,
    )
    db.add(_audit(actor=actor, family=family, action="EVENT_EMAIL_TEMPLATE_ROLLED_BACK", reason=payload.reason, version_id=restored.id))
    await db.commit()
    return await _response(db, family, editable=True)


@platform_component_router.get("", response_model=list[EmailFragmentResponse])
async def list_platform_components(current_user: SuperAdminOnly, db: AsyncSession = Depends(get_db)):
    rows = (await db.scalars(select(EmailComponent).where(
        EmailComponent.scope_type == "PLATFORM", EmailComponent.deleted_at.is_(None),
    ).order_by(EmailComponent.category, EmailComponent.name).execution_options(skip_tenant_filter=True))).all()
    return [_fragment_response(row, True) for row in rows]


@platform_component_router.post("", response_model=EmailFragmentResponse, status_code=status.HTTP_201_CREATED)
async def create_platform_component(
    payload: EmailFragmentCreate, current_user: SuperAdminOnly,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    db: AsyncSession = Depends(get_db),
):
    del idempotency_key
    row = await _create_fragment(db, payload=payload, scope_type="PLATFORM", actor=current_user)
    await db.commit()
    return _fragment_response(row, True)


@platform_component_router.delete("/{component_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_platform_component(component_id: uuid.UUID, current_user: SuperAdminOnly, db: AsyncSession = Depends(get_db)):
    row = await db.scalar(select(EmailComponent).where(
        EmailComponent.id == component_id, EmailComponent.scope_type == "PLATFORM", EmailComponent.deleted_at.is_(None),
    ).execution_options(skip_tenant_filter=True))
    if row is None:
        raise HTTPException(status_code=404, detail={"code": "EMAIL_COMPONENT_NOT_FOUND"})
    row.deleted_at = datetime.now(timezone.utc); row.deleted_by = current_user.id
    await db.commit()


@platform_component_router.put("/{component_id}", response_model=EmailFragmentResponse)
async def update_platform_component(
    component_id: uuid.UUID, payload: EmailFragmentCreate, current_user: SuperAdminOnly,
    expected_version: int = Header(..., alias="If-Match", ge=1), db: AsyncSession = Depends(get_db),
):
    row = await db.scalar(select(EmailComponent).where(
        EmailComponent.id == component_id, EmailComponent.scope_type == "PLATFORM", EmailComponent.deleted_at.is_(None),
    ).with_for_update().execution_options(skip_tenant_filter=True))
    if row is None:
        raise HTTPException(status_code=404, detail={"code": "EMAIL_COMPONENT_NOT_FOUND"})
    await _update_fragment(db, row=row, payload=payload, expected_version=expected_version); await db.commit()
    return _fragment_response(row, True)


@organization_component_router.get("", response_model=list[EmailFragmentResponse])
async def list_organization_components(
    organization_id: uuid.UUID, actor: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    await _require_org_admin(db, actor, organization_id)
    enabled, _ = await designer_enabled_for_organization(db, organization_id, actor.id)
    rows = (await db.scalars(select(EmailComponent).where(
        or_(EmailComponent.scope_type == "PLATFORM", EmailComponent.organization_id == organization_id),
        EmailComponent.deleted_at.is_(None),
    ).order_by(EmailComponent.scope_type, EmailComponent.category, EmailComponent.name).execution_options(skip_tenant_filter=True))).all()
    effective: dict[str, EmailComponent] = {}
    precedence = {"PLATFORM": 0, "ORGANIZATION": 1, "EVENT": 2}
    for row in rows:
        if row.scope_type == "PLATFORM" or enabled:
            current = effective.get(row.stable_key)
            if current is None or precedence[row.scope_type] > precedence[current.scope_type]:
                effective[row.stable_key] = row
    return [_fragment_response(row, enabled and row.scope_type == "ORGANIZATION") for row in effective.values()]


@organization_component_router.post("", response_model=EmailFragmentResponse, status_code=status.HTTP_201_CREATED)
async def create_organization_component(
    organization_id: uuid.UUID, payload: EmailFragmentCreate, actor: User = Depends(get_current_user),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    db: AsyncSession = Depends(get_db),
):
    del idempotency_key
    await _require_org_admin(db, actor, organization_id)
    enabled, _ = await designer_enabled_for_organization(db, organization_id, actor.id)
    if not enabled:
        raise HTTPException(status_code=402, detail={"code": "FEAT_EMAIL_DESIGNER_REQUIRED"})
    row = await _create_fragment(db, payload=payload, scope_type="ORGANIZATION", organization_id=organization_id, actor=actor)
    await db.commit()
    return _fragment_response(row, True)


@organization_component_router.put("/{component_id}", response_model=EmailFragmentResponse)
async def update_organization_component(
    organization_id: uuid.UUID, component_id: uuid.UUID, payload: EmailFragmentCreate,
    actor: User = Depends(get_current_user), expected_version: int = Header(..., alias="If-Match", ge=1),
    db: AsyncSession = Depends(get_db),
):
    await _require_org_admin(db, actor, organization_id)
    enabled, _ = await designer_enabled_for_organization(db, organization_id, actor.id)
    if not enabled:
        raise HTTPException(status_code=402, detail={"code": "FEAT_EMAIL_DESIGNER_REQUIRED"})
    row = await db.scalar(select(EmailComponent).where(
        EmailComponent.id == component_id, EmailComponent.scope_type == "ORGANIZATION",
        EmailComponent.organization_id == organization_id, EmailComponent.deleted_at.is_(None),
    ).with_for_update().execution_options(skip_tenant_filter=True))
    if row is None:
        raise HTTPException(status_code=404, detail={"code": "EMAIL_COMPONENT_NOT_FOUND"})
    await _update_fragment(db, row=row, payload=payload, expected_version=expected_version); await db.commit()
    return _fragment_response(row, True)


@organization_component_router.delete("/{component_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_organization_component(
    organization_id: uuid.UUID, component_id: uuid.UUID, actor: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    await _require_org_admin(db, actor, organization_id)
    row = await db.scalar(select(EmailComponent).where(
        EmailComponent.id == component_id, EmailComponent.organization_id == organization_id,
        EmailComponent.scope_type == "ORGANIZATION", EmailComponent.deleted_at.is_(None),
    ).execution_options(skip_tenant_filter=True))
    if row is None:
        raise HTTPException(status_code=404, detail={"code": "EMAIL_COMPONENT_NOT_FOUND"})
    row.deleted_at = datetime.now(timezone.utc); row.deleted_by = actor.id; await db.commit()


@event_component_router.get("", response_model=list[EmailFragmentResponse], dependencies=[require_event_operation("communications.email.read")])
async def list_event_components(
    event_id: uuid.UUID, event: CurrentEvent, actor: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    enabled, _ = await designer_enabled_for_event(db, event.organization_id, event_id, actor.id)
    rows = (await db.scalars(select(EmailComponent).where(
        or_(
            EmailComponent.scope_type == "PLATFORM",
            EmailComponent.organization_id == event.organization_id,
            EmailComponent.event_id == event_id,
        ), EmailComponent.deleted_at.is_(None),
    ).order_by(EmailComponent.scope_type, EmailComponent.category, EmailComponent.name).execution_options(skip_tenant_filter=True))).all()
    effective: dict[str, EmailComponent] = {}
    precedence = {"PLATFORM": 0, "ORGANIZATION": 1, "EVENT": 2}
    for row in rows:
        if row.scope_type == "PLATFORM" or enabled:
            current = effective.get(row.stable_key)
            if current is None or precedence[row.scope_type] > precedence[current.scope_type]:
                effective[row.stable_key] = row
    return [_fragment_response(row, enabled and row.scope_type == "EVENT") for row in effective.values()]


@event_component_router.post("", response_model=EmailFragmentResponse, status_code=status.HTTP_201_CREATED)
async def create_event_component(
    event_id: uuid.UUID, payload: EmailFragmentCreate, event: CurrentEvent,
    actor: User = Depends(get_current_user),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    db: AsyncSession = Depends(get_db),
):
    del idempotency_key
    await enforce_event_operation(db, event.organization_id, event_id, "communications.email_designer.manage", user_id=actor.id)
    row = await _create_fragment(
        db, payload=payload, scope_type="EVENT", organization_id=event.organization_id,
        event_id=event_id, actor=actor,
    )
    await db.commit()
    return _fragment_response(row, True)


@event_component_router.put("/{component_id}", response_model=EmailFragmentResponse)
async def update_event_component(
    event_id: uuid.UUID, component_id: uuid.UUID, payload: EmailFragmentCreate, event: CurrentEvent,
    actor: User = Depends(get_current_user), expected_version: int = Header(..., alias="If-Match", ge=1),
    db: AsyncSession = Depends(get_db),
):
    await enforce_event_operation(db, event.organization_id, event_id, "communications.email_designer.manage", user_id=actor.id)
    row = await db.scalar(select(EmailComponent).where(
        EmailComponent.id == component_id, EmailComponent.scope_type == "EVENT",
        EmailComponent.event_id == event_id, EmailComponent.deleted_at.is_(None),
    ).with_for_update().execution_options(skip_tenant_filter=True))
    if row is None:
        raise HTTPException(status_code=404, detail={"code": "EMAIL_COMPONENT_NOT_FOUND"})
    await _update_fragment(db, row=row, payload=payload, expected_version=expected_version); await db.commit()
    return _fragment_response(row, True)


@event_component_router.delete("/{component_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event_component(
    event_id: uuid.UUID, component_id: uuid.UUID, event: CurrentEvent,
    actor: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    await enforce_event_operation(db, event.organization_id, event_id, "communications.email_designer.manage", user_id=actor.id)
    row = await db.scalar(select(EmailComponent).where(
        EmailComponent.id == component_id, EmailComponent.scope_type == "EVENT",
        EmailComponent.event_id == event_id, EmailComponent.deleted_at.is_(None),
    ).execution_options(skip_tenant_filter=True))
    if row is None:
        raise HTTPException(status_code=404, detail={"code": "EMAIL_COMPONENT_NOT_FOUND"})
    row.deleted_at = datetime.now(timezone.utc); row.deleted_by = actor.id; await db.commit()


@branding_policy_router.get("", response_model=EmailBrandingPolicyResponse)
async def get_email_branding_policy(
    actor: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    del actor
    return _branding_response(await _branding_policy(db), editable=False)


@platform_branding_policy_router.put("", response_model=EmailBrandingPolicyResponse)
async def update_email_branding_policy(
    payload: EmailBrandingPolicyUpdate,
    current_user: SuperAdminOnly,
    step_up: StepUpAuth,
    expected_version: int = Header(..., alias="If-Match", ge=1),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    db: AsyncSession = Depends(get_db),
):
    del step_up, idempotency_key
    row = await _branding_policy(db)
    if row.version != expected_version:
        raise HTTPException(status_code=409, detail={"code": "EMAIL_BRANDING_POLICY_VERSION_CONFLICT", "current_version": row.version})
    old_state = {"enabled": row.enabled, "text": row.text, "icon_url": row.icon_url, "destination_url": row.destination_url, "version": row.version}
    row.enabled = payload.enabled
    row.text = payload.text
    row.icon_url = str(payload.icon_url) if payload.icon_url else None
    row.destination_url = str(payload.destination_url) if payload.destination_url else None
    row.version += 1
    row.updated_by = current_user.id
    row.updated_at = datetime.now(timezone.utc)
    db.add(AuditLog(
        organization_id=current_user.organization_id, actor_user_id=current_user.id,
        resource_type="email_branding_policy", resource_id=uuid.UUID(int=1),
        action_type="EMAIL_BRANDING_POLICY_UPDATED", actor_role=current_user.platform_role or current_user.role,
        old_state=old_state,
        new_state={"enabled": row.enabled, "text": row.text, "icon_url": row.icon_url, "destination_url": row.destination_url, "version": row.version},
        change_diff={"reason": payload.reason}, is_sensitive=False,
    ))
    await db.commit()
    return _branding_response(row, editable=True)


@platform_asset_router.get("", response_model=list[EmailAssetResponse])
async def list_platform_assets(current_user: SuperAdminOnly, db: AsyncSession = Depends(get_db)):
    return (await db.scalars(select(EmailAsset).where(
        EmailAsset.scope_type == "PLATFORM",
    ).order_by(EmailAsset.created_at.desc()).execution_options(skip_tenant_filter=True))).all()


@platform_asset_router.post("", response_model=EmailAssetResponse, status_code=status.HTTP_201_CREATED)
async def upload_platform_asset(
    current_user: SuperAdminOnly, file: UploadFile = File(...),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    asset_kind: Literal["IMAGE", "ICON"] = Query("IMAGE"),
    db: AsyncSession = Depends(get_db),
):
    return await _store_asset(db, file=file, actor=current_user, scope_type="PLATFORM", organization_id=None, asset_kind=asset_kind, idempotency_key=idempotency_key)


@organization_asset_router.get("", response_model=list[EmailAssetResponse])
async def list_organization_assets(
    organization_id: uuid.UUID, actor: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    await _require_org_admin(db, actor, organization_id)
    return (await db.scalars(select(EmailAsset).where(
        or_(EmailAsset.scope_type == "PLATFORM", EmailAsset.organization_id == organization_id),
    ).order_by(EmailAsset.created_at.desc()).execution_options(skip_tenant_filter=True))).all()


@organization_asset_router.post("", response_model=EmailAssetResponse, status_code=status.HTTP_201_CREATED)
async def upload_organization_asset(
    organization_id: uuid.UUID, actor: User = Depends(get_current_user), file: UploadFile = File(...),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    asset_kind: Literal["IMAGE", "ICON"] = Query("IMAGE"),
    db: AsyncSession = Depends(get_db),
):
    await _require_org_admin(db, actor, organization_id)
    enabled, _ = await designer_enabled_for_organization(db, organization_id, actor.id)
    if not enabled:
        raise HTTPException(status_code=402, detail={"code": "FEAT_EMAIL_DESIGNER_REQUIRED"})
    return await _store_asset(db, file=file, actor=actor, scope_type="ORGANIZATION", organization_id=organization_id, asset_kind=asset_kind, idempotency_key=idempotency_key)


@event_asset_router.get("", response_model=list[EmailAssetResponse], dependencies=[require_event_operation("communications.email.read")])
async def list_event_assets(
    event_id: uuid.UUID, event: CurrentEvent, actor: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    enabled, _ = await designer_enabled_for_event(db, event.organization_id, event_id, actor.id)
    rows = (await db.scalars(select(EmailAsset).where(
        or_(
            EmailAsset.scope_type == "PLATFORM",
            EmailAsset.organization_id == event.organization_id,
            EmailAsset.event_id == event_id,
        ),
        EmailAsset.deleted_at.is_(None),
    ).order_by(EmailAsset.created_at.desc()).execution_options(skip_tenant_filter=True))).all()
    return rows if enabled else [row for row in rows if row.scope_type == "PLATFORM"]


@event_asset_router.post("", response_model=EmailAssetResponse, status_code=status.HTTP_201_CREATED)
async def upload_event_asset(
    event_id: uuid.UUID, event: CurrentEvent, actor: User = Depends(get_current_user), file: UploadFile = File(...),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    asset_kind: Literal["IMAGE", "ICON"] = Query("IMAGE"), db: AsyncSession = Depends(get_db),
):
    await enforce_event_operation(db, event.organization_id, event_id, "communications.email_designer.manage", user_id=actor.id)
    return await _store_asset(
        db, file=file, actor=actor, scope_type="EVENT", organization_id=event.organization_id,
        event_id=event_id, asset_kind=asset_kind, idempotency_key=idempotency_key,
    )


@email_asset_delivery_router.get("/{asset_id}/download")
async def deliver_scoped_email_asset(
    asset_id: uuid.UUID, token: str = Query(..., min_length=32, max_length=200), db: AsyncSession = Depends(get_db),
):
    asset = await db.scalar(select(EmailAsset).where(EmailAsset.id == asset_id).execution_options(skip_tenant_filter=True))
    supplied_hash = hashlib.sha256(token.encode()).hexdigest()
    if asset is None or not hmac.compare_digest(asset.access_token_hash, supplied_hash):
        raise HTTPException(status_code=404, detail={"code": "EMAIL_ASSET_NOT_FOUND"})
    try:
        contents = await asyncio.to_thread(
            upload_service.get_object_bytes,
            settings.S3_BUCKET_ASSETS,
            asset.storage_path,
            verified_organization_id=asset.organization_id,
            allow_platform=asset.scope_type == "PLATFORM",
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=404, detail={"code": "EMAIL_ASSET_NOT_FOUND"}) from exc
    safe_name = asset.name.replace('"', "").replace("\r", "").replace("\n", "")
    return Response(content=contents, media_type=asset.file_type, headers={"Cache-Control": "public, max-age=31536000, immutable", "Content-Disposition": f'inline; filename="{safe_name}"'})
