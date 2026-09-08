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
from app.modules.notifications.application.queries import EmailTemplateVersionQueryService
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


async def _duplicate_template_record(
    db: AsyncSession,
    *,
    source_id: uuid.UUID,
    actor_id: uuid.UUID,
    new_scope_type: str | None = None,
    new_org_id: uuid.UUID | None = None,
    new_event_id: uuid.UUID | None = None,
) -> EmailTemplate:
    source = await db.scalar(
        select(EmailTemplate).where(
            EmailTemplate.id == source_id,
            EmailTemplate.deleted_at.is_(None),
        ).execution_options(skip_tenant_filter=True)
    )
    if source is None:
        raise HTTPException(status_code=404, detail={"code": "EMAIL_TEMPLATE_NOT_FOUND"})

    unique_suffix = uuid.uuid4().hex[:6]
    copy_name = f"{source.name} (Copy)"
    copy_key = f"{source.stable_key}-copy-{unique_suffix}"

    new_scope = new_scope_type or source.scope_type
    target_org = new_org_id if new_scope == "ORGANIZATION" else (source.organization_id if new_scope != "PLATFORM" else None)
    target_event = new_event_id if new_scope == "EVENT" else None

    draft = await db.scalar(select(EmailTemplateVersion).where(
        EmailTemplateVersion.template_id == source.id,
        EmailTemplateVersion.lifecycle_state == "DRAFT",
    ))

    subject = draft.subject if draft else source.subject
    preheader = draft.preheader if draft else source.preheader
    body_html = draft.body_html if draft else source.body_html
    body_text = draft.body_text if draft else source.body_text
    designer_json = draft.designer_json if draft else source.designer_json

    new_family = EmailTemplate(
        id=uuid.uuid4(),
        scope_type=new_scope,
        organization_id=target_org,
        event_id=target_event,
        parent_template_id=source.id,
        name=copy_name,
        stable_key=copy_key,
        template_type=source.template_type,
        target_type=source.target_type,
        subject=subject,
        preheader=preheader,
        body_html=body_html,
        body_text=body_text,
        designer_json=designer_json or {},
        version=1,
        created_by=actor_id,
    )
    db.add(new_family)
    await db.flush()

    new_version = EmailTemplateVersion(
        id=uuid.uuid4(),
        template_id=new_family.id,
        version_number=1,
        lifecycle_state="DRAFT",
        subject=subject,
        preheader=preheader,
        body_html=body_html,
        body_text=body_text,
        designer_json=designer_json or {},
        created_by=actor_id,
    )
    db.add(new_version)
    await db.commit()
    return new_family


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


async def build_event_preview_context(db: AsyncSession, event: Any) -> dict[str, Any]:
    from datetime import date
    from app.modules.events.models.speaker import Speaker
    from app.modules.agenda.models.session import AgendaSession
    from app.modules.sponsors.models.sponsor import Sponsor
    from app.modules.registration.models.participant import Participant
    from sqlalchemy.orm import selectinload

    start_str = event.start_date.strftime("%d %b %Y") if getattr(event, "start_date", None) else ""
    end_str = event.end_date.strftime("%d %b %Y") if getattr(event, "end_date", None) else ""
    date_str = f"{start_str} – {end_str}" if (start_str and end_str and start_str != end_str) else (start_str or end_str or "TBD")
    days_until = max(0, (event.start_date - date.today()).days) if getattr(event, "start_date", None) else 0
    event_days = max(1, (event.end_date - event.start_date).days + 1) if (getattr(event, "start_date", None) and getattr(event, "end_date", None)) else 1

    org_details = getattr(event, "organizer_details", {}) or {}
    if not isinstance(org_details, dict):
        org_details = {}
    support_email = org_details.get("email") or "support@eventos.com"
    short_code = getattr(event, "short_code", "") or str(event.id)[:8]
    event_website = org_details.get("website") or f"https://eventos.com/events/{short_code}"
    
    venue_name = getattr(event, "venue_name", "") or getattr(event, "location", "") or "Event Venue"
    venue_address = getattr(event, "location", "") or getattr(event, "venue_name", "") or "Venue Address"

    # Fetch speakers
    speakers = []
    speaker_count = 0
    try:
        speakers_res = await db.execute(
            select(Speaker).where(
                Speaker.event_id == event.id,
                Speaker.deleted_at.is_(None)
            ).limit(10)
        )
        speakers = list(speakers_res.scalars().all())
        speaker_count = len(speakers)
    except Exception:
        pass

    # Fetch sessions
    sessions = []
    session_count = 0
    try:
        sessions_res = await db.execute(
            select(AgendaSession).where(
                AgendaSession.event_id == event.id
            ).options(selectinload(AgendaSession.room)).limit(20)
        )
        sessions = list(sessions_res.scalars().all())
        session_count = len(sessions)
    except Exception:
        pass

    # Fetch sponsors
    sponsors = []
    try:
        sponsors_res = await db.execute(
            select(Sponsor).where(
                Sponsor.event_id == event.id
            ).limit(12)
        )
        sponsors = list(sponsors_res.scalars().all())
    except Exception:
        pass

    # Fetch first participant if available
    participant = None
    try:
        part_res = await db.execute(
            select(Participant).where(
                Participant.event_id == event.id
            ).limit(1)
        )
        participant = part_res.scalars().first()
    except Exception:
        pass

    first_speaker = speakers[0] if speakers else None
    first_session = sessions[0] if sessions else None

    first_speaker_fname = getattr(first_speaker, "first_name", "") if first_speaker else ""
    first_speaker_lname = getattr(first_speaker, "last_name", "") if first_speaker else ""
    speaker_name = f"{first_speaker_fname} {first_speaker_lname}".strip() if first_speaker else "Sarah Chen"
    speaker_first_name = first_speaker_fname if first_speaker else "Sarah"
    speaker_email = getattr(first_speaker, "email", "speaker@example.com") if first_speaker else "speaker@example.com"
    upload_token = getattr(first_speaker, "upload_token", "token") if first_speaker else "token"
    upload_link = f"{settings.SPEAKER_PORTAL_BASE_URL}/{event.id}/{upload_token}" if first_speaker else f"https://eventos.com/events/{short_code}/upload"

    session_title = getattr(first_session, "name", "Keynote Presentation") if first_session else "Keynote Presentation"
    session_time = first_session.start_time.strftime("%I:%M %p") if (first_session and getattr(first_session, "start_time", None)) else "09:00 AM"
    session_date = first_session.start_time.strftime("%d %b %Y") if (first_session and getattr(first_session, "start_time", None)) else date_str
    session_room = getattr(getattr(first_session, "room", None), "name", "Main Hall") if first_session else "Main Hall"

    speakers_list = [
        {
            "Name": f"{getattr(s, 'first_name', '')} {getattr(s, 'last_name', '')}".strip() or "Speaker",
            "Title": getattr(s, "affiliation", "") or getattr(s, "bio", "") or "Speaker",
            "ImageUrl": getattr(s, "photo_url", "") or getattr(s, "avatar_url", "") or f"https://placehold.co/92x92/png?text={getattr(s, 'first_name', 'S')[:1]}",
        }
        for s in speakers
    ] if speakers else [
        {"Name": "Sarah Chen", "Title": "Quantum systems researcher", "ImageUrl": "https://placehold.co/92x92/png?text=SC"},
        {"Name": "Omar Rahman", "Title": "Product and AI leader", "ImageUrl": "https://placehold.co/92x92/png?text=OR"},
    ]

    agenda_list = [
        {
            "Time": s.start_time.strftime("%I:%M %p") if getattr(s, "start_time", None) else "09:00 AM",
            "Title": getattr(s, "name", "Session"),
            "Room": getattr(getattr(s, "room", None), "name", "Main Hall") or "Main Hall",
        }
        for s in sessions
    ] if sessions else [
        {"Time": "09:00 AM", "Title": "Opening Keynote", "Room": "Grand Ballroom"},
        {"Time": "11:30 AM", "Title": "Technical Deep Dive", "Room": "Hall A"},
    ]

    sponsors_list = [
        {
            "Name": getattr(sp, "name", "Sponsor"),
            "LogoUrl": getattr(sp, "logo_url", "") or f"https://placehold.co/220x80/png?text={getattr(sp, 'name', 'Sponsor')}",
        }
        for sp in sponsors
    ] if sponsors else [
        {"Name": "Northstar", "LogoUrl": "https://placehold.co/220x80/png?text=Northstar"},
        {"Name": "Orbit", "LogoUrl": "https://placehold.co/220x80/png?text=Orbit"},
    ]

    return {
        "EventName": getattr(event, "name", "Event"),
        "ConferenceName": getattr(event, "name", "Event"),
        "EventCode": short_code,
        "ConferenceCode": short_code,
        "EventDate": date_str,
        "EventVenue": venue_name,
        "Venue": venue_name,
        "VenueAddress": venue_address,
        "Location": venue_address,
        "DaysUntilEvent": str(days_until),
        "EventDays": str(event_days),
        "SupportEmail": support_email,
        "EventWebsiteUrl": event_website,
        "AgendaUrl": f"https://eventos.com/events/{short_code}/agenda",
        "RegistrationUrl": f"https://eventos.com/events/{short_code}/register",
        "UploadLink": upload_link,
        "VenueMapUrl": f"https://maps.google.com/?q={venue_address}",
        "OrganizationAddress": f"{venue_address}, {getattr(event, 'country', '') or ''}".strip(", "),
        "UnsubscribeUrl": f"https://eventos.com/events/{short_code}/unsubscribe",
        "SpeakerName": speaker_name,
        "SpeakerFirstName": speaker_first_name,
        "SpeakerEmail": speaker_email,
        "SpeakerCount": str(max(speaker_count, 1)),
        "SessionTitle": session_title,
        "SessionName": session_title,
        "SessionDate": session_date,
        "SessionTime": session_time,
        "SessionRoom": session_room,
        "RoomName": session_room,
        "SessionCount": str(max(session_count, 1)),
        "ParticipantName": getattr(participant, "name", "Alex Morgan") if participant else "Alex Morgan",
        "ParticipantEmail": getattr(participant, "email", "attendee@example.com") if participant else "attendee@example.com",
        "RegistrationId": getattr(participant, "regno", "REG-2026-78421") if participant else "REG-2026-78421",
        "TicketName": "Standard Pass",
        "AmountPaid": "$299.00 USD",
        "QrBadgeUrl": "https://placehold.co/180x180/png?text=QR",
        "CertificateUrl": f"https://eventos.com/events/{short_code}/certificate",
        "Speakers": speakers_list,
        "AgendaItems": agenda_list,
        "Sponsors": sponsors_list,
    }


async def _render_preview(
    db: AsyncSession,
    family: EmailTemplate,
    payload: TemplatePreviewRequest,
    event: Any = None,
) -> TemplatePreviewResponse:
    branding = await _branding_policy(db)
    context_data = None
    if event is not None:
        context_data = await build_event_preview_context(db, event)
    subject, html, plain_text = render_draft_snapshot(
        designer_json=payload.designer_json, body_html=payload.body_html,
        subject=payload.subject, preheader=payload.preheader,
        template_type=family.template_type, target_type=family.target_type,
        branding_policy={
            "enabled": branding.enabled, "text": branding.text,
            "icon_url": branding.icon_url, "destination_url": branding.destination_url,
        },
        context_data=context_data,
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
    return await EmailTemplateVersionQueryService(db).list_for_template(template_id=template_id, scope_type="PLATFORM")


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


@platform_router.get("/organizations-list")
async def list_all_platform_organizations(
    current_user: SuperAdminOnly,
    db: AsyncSession = Depends(get_db),
):
    from app.modules.platform.models.organization import Organization
    rows = (await db.scalars(
        select(Organization)
        .where(Organization.is_active.is_(True))
        .order_by(Organization.name)
        .execution_options(skip_tenant_filter=True)
    )).all()
    return [{"id": str(org.id), "name": org.name, "slug": org.slug} for org in rows]


@platform_router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_platform_template(
    template_id: uuid.UUID,
    current_user: SuperAdminOnly,
    db: AsyncSession = Depends(get_db),
):
    template = await db.scalar(
        select(EmailTemplate).where(
            EmailTemplate.id == template_id,
            EmailTemplate.deleted_at.is_(None),
        ).execution_options(skip_tenant_filter=True)
    )
    if template is None:
        raise HTTPException(status_code=404, detail={"code": "EMAIL_TEMPLATE_NOT_FOUND"})

    template.deleted_at = datetime.now(timezone.utc)
    template.deleted_by = current_user.id
    await db.commit()
    return None


@platform_router.post("/{template_id}/duplicate", response_model=TemplateStudioResponse)
async def duplicate_platform_template(
    template_id: uuid.UUID,
    current_user: SuperAdminOnly,
    db: AsyncSession = Depends(get_db),
):
    new_family = await _duplicate_template_record(
        db, source_id=template_id, actor_id=current_user.id, new_scope_type="PLATFORM"
    )
    return await _response(db, new_family, editable=True)


@platform_router.put("/{template_id}/scope", response_model=TemplateStudioResponse)
async def update_platform_template_scope(
    template_id: uuid.UUID,
    payload: dict,
    current_user: SuperAdminOnly,
    db: AsyncSession = Depends(get_db),
):
    template = await db.scalar(
        select(EmailTemplate).where(
            EmailTemplate.id == template_id,
            EmailTemplate.deleted_at.is_(None),
        ).execution_options(skip_tenant_filter=True)
    )
    if template is None:
        raise HTTPException(status_code=404, detail={"code": "EMAIL_TEMPLATE_NOT_FOUND"})

    scope_type = payload.get("scope_type", "PLATFORM")
    organization_id_raw = payload.get("organization_id")
    target_org_id = uuid.UUID(str(organization_id_raw)) if organization_id_raw else None

    if scope_type == "ORGANIZATION":
        if not target_org_id:
            from app.modules.platform.models.organization import Organization
            target_org_id = await db.scalar(select(Organization.id).where(Organization.is_active.is_(True)).execution_options(skip_tenant_filter=True))
            if not target_org_id:
                raise HTTPException(status_code=400, detail={"code": "NO_ORGANIZATION_AVAILABLE"})
        template.scope_type = "ORGANIZATION"
        template.organization_id = target_org_id
        template.event_id = None
    else:
        template.scope_type = "PLATFORM"
        template.organization_id = None
        template.event_id = None

    await db.commit()
    return await _response(db, template, editable=True)


@platform_router.put("/{template_id}/active-status", response_model=TemplateStudioResponse)
async def update_platform_template_active_status(
    template_id: uuid.UUID,
    payload: dict,
    current_user: SuperAdminOnly,
    db: AsyncSession = Depends(get_db),
):
    template = await db.scalar(
        select(EmailTemplate).where(
            EmailTemplate.id == template_id,
            EmailTemplate.deleted_at.is_(None),
        ).execution_options(skip_tenant_filter=True)
    )
    if template is None:
        raise HTTPException(status_code=404, detail={"code": "EMAIL_TEMPLATE_NOT_FOUND"})
    template.is_active = bool(payload.get("is_active", True))
    await db.commit()
    return await _response(db, template, editable=True)


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


@organization_router.post("", response_model=TemplateStudioResponse, status_code=status.HTTP_201_CREATED)
async def create_organization_template(
    organization_id: uuid.UUID,
    payload: TemplateFamilyCreate,
    actor: User = Depends(get_current_user),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    db: AsyncSession = Depends(get_db),
):
    del idempotency_key
    await _require_org_admin(db, actor, organization_id)
    enabled, _ = await designer_enabled_for_organization(db, organization_id, actor.id)
    if not enabled:
        raise HTTPException(status_code=402, detail={"code": "FEAT_EMAIL_DESIGNER_REQUIRED"})
    family = await create_family(
        db, scope_type="ORGANIZATION", organization_id=organization_id, event_id=None,
        parent=None, name=payload.name, stable_key=payload.stable_key,
        template_type=payload.template_type, target_type=payload.target_type, actor_user_id=actor.id,
    )
    db.add(_audit(actor=actor, family=family, action="ORGANIZATION_EMAIL_TEMPLATE_CREATED", reason="Organisation template draft created"))
    await db.commit()
    return await _response(db, family, editable=True)


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
    return await EmailTemplateVersionQueryService(db).list_for_template(template_id=template_id, scope_type="ORGANIZATION", organization_id=organization_id)


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


@organization_router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_organization_template(
    organization_id: uuid.UUID,
    template_id: uuid.UUID,
    actor: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_org_admin(db, actor, organization_id)
    template = await db.scalar(
        select(EmailTemplate).where(
            EmailTemplate.id == template_id,
            EmailTemplate.deleted_at.is_(None),
        ).execution_options(skip_tenant_filter=True)
    )
    if template is None:
        raise HTTPException(status_code=404, detail={"code": "EMAIL_TEMPLATE_NOT_FOUND"})

    if template.scope_type == "PLATFORM":
        raise HTTPException(
            status_code=403,
            detail={"code": "CANNOT_DELETE_PLATFORM_DEFAULT", "message": "Platform default templates cannot be deleted by organization users."}
        )

    if template.scope_type == "ORGANIZATION" and template.organization_id != organization_id:
        raise HTTPException(status_code=404, detail={"code": "EMAIL_TEMPLATE_NOT_FOUND"})

    template.deleted_at = datetime.now(timezone.utc)
    template.deleted_by = actor.id
    await db.commit()
    return None


@organization_router.post("/{template_id}/duplicate", response_model=TemplateStudioResponse)
async def duplicate_organization_template(
    organization_id: uuid.UUID,
    template_id: uuid.UUID,
    actor: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_org_admin(db, actor, organization_id)
    new_family = await _duplicate_template_record(
        db,
        source_id=template_id,
        actor_id=actor.id,
        new_scope_type="ORGANIZATION",
        new_org_id=organization_id,
    )
    return await _response(db, new_family, editable=True)


@organization_router.put("/{template_id}/scope", response_model=TemplateStudioResponse)
async def update_org_template_scope(
    organization_id: uuid.UUID,
    template_id: uuid.UUID,
    payload: dict,
    actor: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_org_admin(db, actor, organization_id)
    template = await db.scalar(
        select(EmailTemplate).where(
            EmailTemplate.id == template_id,
            EmailTemplate.organization_id == organization_id,
            EmailTemplate.deleted_at.is_(None),
        ).execution_options(skip_tenant_filter=True)
    )
    if template is None:
        raise HTTPException(status_code=404, detail={"code": "EMAIL_TEMPLATE_NOT_FOUND"})
    scope_type = payload.get("scope_type", "ORGANIZATION")
    template.scope_type = scope_type
    await db.commit()
    return await _response(db, template, editable=True)


@organization_router.put("/{template_id}/active-status", response_model=TemplateStudioResponse)
async def update_org_template_active_status(
    organization_id: uuid.UUID,
    template_id: uuid.UUID,
    payload: dict,
    actor: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_org_admin(db, actor, organization_id)
    template = await db.scalar(
        select(EmailTemplate).where(
            EmailTemplate.id == template_id,
            EmailTemplate.organization_id == organization_id,
            EmailTemplate.deleted_at.is_(None),
        ).execution_options(skip_tenant_filter=True)
    )
    if template is None:
        raise HTTPException(status_code=404, detail={"code": "EMAIL_TEMPLATE_NOT_FOUND"})
    template.is_active = bool(payload.get("is_active", True))
    await db.commit()
    return await _response(db, template, editable=True)


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


@event_router.post("", response_model=TemplateStudioResponse, status_code=status.HTTP_201_CREATED)
async def create_event_studio_template(
    event_id: uuid.UUID,
    payload: TemplateFamilyCreate,
    event: CurrentEvent,
    actor: User = Depends(get_current_user),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    db: AsyncSession = Depends(get_db),
):
    del idempotency_key
    await enforce_event_operation(db, event.organization_id, event_id, "communications.email_designer.manage", user_id=actor.id)
    family = await create_family(
        db, scope_type="EVENT", organization_id=event.organization_id, event_id=event_id,
        parent=None, name=payload.name, stable_key=payload.stable_key,
        template_type=payload.template_type, target_type=payload.target_type, actor_user_id=actor.id,
    )
    db.add(_audit(actor=actor, family=family, action="EVENT_EMAIL_TEMPLATE_CREATED", reason="Event template draft created"))
    await db.commit()
    return await _response(db, family, editable=True)


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


@event_router.get("/preview-context", dependencies=[require_event_operation("communications.email.read")])
async def get_event_preview_context(
    event_id: uuid.UUID,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
):
    """Return real-time dynamic variables and preview data for this event."""
    context = await build_event_preview_context(db, event)
    variables = [
        {"key": "{{EventName}}", "label": "Event name", "required": True, "sampleValue": context.get("EventName", "")},
        {"key": "{{ConferenceName}}", "label": "Conference name", "sampleValue": context.get("ConferenceName", "")},
        {"key": "{{EventCode}}", "label": "Event code", "sampleValue": context.get("EventCode", "")},
        {"key": "{{EventDate}}", "label": "Event date", "sampleValue": context.get("EventDate", "")},
        {"key": "{{EventVenue}}", "label": "Venue", "sampleValue": context.get("EventVenue", "")},
        {"key": "{{VenueAddress}}", "label": "Venue address", "sampleValue": context.get("VenueAddress", "")},
        {"key": "{{DaysUntilEvent}}", "label": "Days until event", "sampleValue": context.get("DaysUntilEvent", "")},
        {"key": "{{SpeakerName}}", "label": "Speaker name", "sampleValue": context.get("SpeakerName", "")},
        {"key": "{{SpeakerFirstName}}", "label": "Speaker first name", "sampleValue": context.get("SpeakerFirstName", "")},
        {"key": "{{SpeakerEmail}}", "label": "Speaker email", "sampleValue": context.get("SpeakerEmail", "")},
        {"key": "{{UploadLink}}", "label": "Upload link", "sampleValue": context.get("UploadLink", "")},
        {"key": "{{SessionTitle}}", "label": "Session title", "sampleValue": context.get("SessionTitle", "")},
        {"key": "{{SessionDate}}", "label": "Session date", "sampleValue": context.get("SessionDate", "")},
        {"key": "{{SessionTime}}", "label": "Session time", "sampleValue": context.get("SessionTime", "")},
        {"key": "{{SessionRoom}}", "label": "Session room", "sampleValue": context.get("SessionRoom", "")},
        {"key": "{{ParticipantName}}", "label": "Participant name", "sampleValue": context.get("ParticipantName", "")},
        {"key": "{{ParticipantEmail}}", "label": "Participant email", "sampleValue": context.get("ParticipantEmail", "")},
        {"key": "{{RegistrationId}}", "label": "Registration ID", "sampleValue": context.get("RegistrationId", "")},
        {"key": "{{TicketName}}", "label": "Ticket name", "sampleValue": context.get("TicketName", "")},
        {"key": "{{AmountPaid}}", "label": "Amount paid", "sampleValue": context.get("AmountPaid", "")},
        {"key": "{{SupportEmail}}", "label": "Support email", "sampleValue": context.get("SupportEmail", "")},
        {"key": "{{EventWebsiteUrl}}", "label": "Event website", "sampleValue": context.get("EventWebsiteUrl", "")},
        {"key": "{{AgendaUrl}}", "label": "Agenda link", "sampleValue": context.get("AgendaUrl", "")},
        {"key": "{{RegistrationUrl}}", "label": "Registration link", "sampleValue": context.get("RegistrationUrl", "")},
        {"key": "{{VenueMapUrl}}", "label": "Venue map link", "sampleValue": context.get("VenueMapUrl", "")},
        {"key": "{{QrBadgeUrl}}", "label": "QR badge URL", "sampleValue": context.get("QrBadgeUrl", "")},
        {"key": "{{CertificateUrl}}", "label": "Certificate URL", "sampleValue": context.get("CertificateUrl", "")},
        {"key": "{{SpeakerCount}}", "label": "Speaker count", "sampleValue": context.get("SpeakerCount", "")},
        {"key": "{{SessionCount}}", "label": "Session count", "sampleValue": context.get("SessionCount", "")},
    ]
    return {
        "variables": variables,
        "sample_values": context,
        "sample_collections": {
            "Speakers": context.get("Speakers", []),
            "AgendaItems": context.get("AgendaItems", []),
            "Sponsors": context.get("Sponsors", []),
        },
    }


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
    return await _render_preview(db, family, payload, event=event)


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
    preview = await _render_preview(db, family, payload, event=event)
    try:
        msg_id = await send_email(
            to_email=str(payload.recipient_email),
            subject=f"[TEST] {preview.subject}",
            html_body=preview.html,
            text_body=preview.plain_text,
            event_id=event_id,
            db=db,
            raise_on_failure=True,
        )
    except Exception as exc:
        logger.error("Failed to send test email: {}", exc)
        raise HTTPException(
            status_code=502,
            detail={"code": "EMAIL_DELIVERY_FAILED", "message": str(exc)},
        )
    await db.commit()
    return {"status": "sent", "message_id": msg_id}


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
    return await EmailTemplateVersionQueryService(db).list_for_template(template_id=template_id, scope_type="EVENT", event_id=event_id)


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


@event_router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event_template(
    event_id: uuid.UUID,
    template_id: uuid.UUID,
    event: CurrentEvent,
    actor: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await enforce_event_operation(db, event.organization_id, event_id, "communications.email_designer.manage", user_id=actor.id)
    template = await db.scalar(
        select(EmailTemplate).where(
            EmailTemplate.id == template_id,
            EmailTemplate.deleted_at.is_(None),
        ).execution_options(skip_tenant_filter=True)
    )
    if template is None:
        raise HTTPException(status_code=404, detail={"code": "EMAIL_TEMPLATE_NOT_FOUND"})

    if template.scope_type == "PLATFORM":
        raise HTTPException(
            status_code=403,
            detail={"code": "CANNOT_DELETE_PLATFORM_DEFAULT", "message": "Platform default templates cannot be deleted by event users."}
        )

    if template.scope_type == "EVENT" and template.event_id != event_id:
        raise HTTPException(status_code=404, detail={"code": "EMAIL_TEMPLATE_NOT_FOUND"})

    template.deleted_at = datetime.now(timezone.utc)
    template.deleted_by = actor.id
    await db.commit()
    return None


@event_router.post("/{template_id}/duplicate", response_model=TemplateStudioResponse)
async def duplicate_event_template(
    event_id: uuid.UUID,
    template_id: uuid.UUID,
    event: CurrentEvent,
    actor: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await enforce_event_operation(db, event.organization_id, event_id, "communications.email_designer.manage", user_id=actor.id)
    new_family = await _duplicate_template_record(
        db,
        source_id=template_id,
        actor_id=actor.id,
        new_scope_type="EVENT",
        new_org_id=event.organization_id,
        new_event_id=event_id,
    )
    return await _response(db, new_family, editable=True)


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
