from __future__ import annotations

import html as html_lib
import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Iterable

import bleach
from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.billing.services.capability_service import CapabilityService
from app.modules.communications.models.email_template import EmailTemplate
from app.modules.communications.models.email_template_version import EmailTemplateVersion
from app.modules.notifications.services.email_renderer import render_template, substitute_registered_context


ALLOWED_BLOCK_TYPES = {
    "EmailLayout", "Avatar", "Button", "ColumnsContainer", "Container",
    "Divider", "Heading", "Html", "Image", "Spacer", "Text",
}
MAX_DOCUMENT_BYTES = 5 * 1024 * 1024
MAX_HTML_BYTES = 10 * 1024 * 1024
VARIABLE_REGISTRY: dict[str, set[str]] = {
    "speaker": {
        "EventName", "ConferenceName", "SpeakerName", "SpeakerEmail", "UploadLink",
        "EventDate", "EventVenue", "SessionTitle", "SessionDate", "SessionTime",
        "SessionRoom", "SessionTable", "RejectionReason", "SupportEmail", "RegistrationUrl",
        "EventWebsiteUrl", "AgendaUrl", "SupportUrl", "VenueAddress", "VenueMapUrl", "DaysUntilEvent",
        "QrBadgeUrl", "CertificateUrl", "EventDays", "SpeakerCount", "SessionCount",
        "OrganizationAddress", "UnsubscribeUrl", "FacebookUrl", "LinkedInUrl", "InstagramUrl",
    },
    "participant": {
        "EventName", "ConferenceName", "ParticipantName", "ParticipantEmail",
        "RegistrationId", "TicketName", "EventDate", "EventVenue", "SupportEmail", "RegistrationUrl",
        "EventWebsiteUrl", "AgendaUrl", "SupportUrl", "VenueAddress", "VenueMapUrl", "DaysUntilEvent",
        "QrBadgeUrl", "CertificateUrl", "EventDays", "SpeakerCount", "SessionCount", "AmountPaid",
        "OrganizationAddress", "UnsubscribeUrl", "FacebookUrl", "LinkedInUrl", "InstagramUrl",
    },
    "attendee": {
        "EventName", "ConferenceName", "ParticipantName", "ParticipantEmail",
        "RegistrationId", "TicketName", "EventDate", "EventVenue", "SupportEmail", "RegistrationUrl",
        "EventWebsiteUrl", "AgendaUrl", "SupportUrl", "VenueAddress", "VenueMapUrl", "DaysUntilEvent",
        "QrBadgeUrl", "CertificateUrl", "EventDays", "SpeakerCount", "SessionCount", "AmountPaid",
        "OrganizationAddress", "UnsubscribeUrl", "FacebookUrl", "LinkedInUrl", "InstagramUrl",
    },
}
REQUIRED_VARIABLES: dict[str, set[str]] = {
    "upload_invite": {"EventName", "SpeakerName", "UploadLink"},
    "reminder": {"EventName", "SpeakerName"},
    "approval": {"EventName", "SpeakerName"},
    "rejection": {"EventName", "SpeakerName"},
    "confirmation": {"EventName"},
}
VARIABLE_PATTERN = re.compile(r"\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}")
REPEATER_PATTERN = re.compile(
    r"\{\{#each\s+([A-Za-z][A-Za-z0-9_]*)\s+limit=(\d+)\s*\}\}(.*?)\{\{/each\}\}", re.S
)
REPEATER_REGISTRY = {
    "Speakers": (6, {"Name", "Title", "ImageUrl"}),
    "AgendaItems": (20, {"Time", "Title", "Room"}),
    "Sponsors": (12, {"Name", "LogoUrl"}),
}
SCHEMA_V4_ROLE_TYPES: dict[str, set[str]] = {
    "SOCIAL_GROUP": {"ColumnsContainer", "Container"},
    "SOCIAL_ICON": {"Image"},
    "STANDALONE_ICON": {"Image"},
    "MENU_GROUP": {"ColumnsContainer", "Container"},
    "MENU_ITEM": {"Text"},
    "MANAGED_LIST": {"Text"},
    "MANAGED_TABLE": {"Container"},
    "VIDEO": {"Container", "Image"},
    "GIF": {"Image"},
    "STICKER": {"Image"},
    "AVATAR": {"Avatar"},
    "QR_BADGE": {"Image", "Container", "ColumnsContainer"},
    "QUOTE": {"Container", "Text", "Heading"},
    "CARD": {"Container"},
    "IMAGE_GROUP": {"ColumnsContainer", "Container"},
}
SAFE_ACTION_TYPES = {"NONE", "WEB", "EMAIL", "PHONE", "SPECIAL", "FILE"}
REPRESENTATIVE_PREVIEW_DATA: dict[str, Any] = {
    "EventName": "Eventos Conference 2026", "ConferenceName": "EVENTOS",
    "SpeakerName": "Sarah Chen", "ParticipantName": "Alex Morgan",
    "EventDate": "15-17 May 2026", "EventVenue": "Grand Hyatt, Dubai, UAE",
    "VenueAddress": "Riyadh Street, Dubai", "RegistrationId": "REG-2026-78421",
    "TicketName": "Standard Pass", "AmountPaid": "$299.00 USD", "DaysUntilEvent": "18",
    "RegistrationUrl": "https://example.com/registration", "EventWebsiteUrl": "https://example.com/event",
    "AgendaUrl": "https://example.com/agenda", "VenueMapUrl": "https://example.com/map",
    "UploadLink": "https://example.com/upload", "QrBadgeUrl": "https://example.com/qr.png",
    "CertificateUrl": "https://example.com/certificate", "EventDays": "3", "SpeakerCount": "100",
    "SessionCount": "42", "OrganizationAddress": "Eventos, Dubai, UAE",
    "UnsubscribeUrl": "https://example.com/unsubscribe", "SupportEmail": "support@example.com",
    "Speakers": [{"Name": "Sarah Chen", "Title": "Research leader", "ImageUrl": "https://example.com/sarah.png"}],
    "AgendaItems": [{"Time": "09:00", "Title": "Opening keynote", "Room": "Grand Ballroom"}],
    "Sponsors": [{"Name": "Northstar", "LogoUrl": "https://example.com/northstar.png"}],
}


def render_draft_snapshot(
    *, designer_json: dict, body_html: str, subject: str, preheader: str,
    template_type: str, target_type: str, branding_policy: dict | None = None,
) -> tuple[str, str, str]:
    """Validate and render exactly the snapshot supplied by the visual editor."""
    validate_designer_payload(
        designer_json=designer_json, body_html=body_html, subject=subject,
        template_type=template_type, target_type=target_type,
    )
    rendered_subject = html_lib.unescape(bleach.clean(substitute_registered_context(subject, REPRESENTATIVE_PREVIEW_DATA), tags=[], strip=True))
    rendered_html, plain_text = render_template(
        body_html, REPRESENTATIVE_PREVIEW_DATA, branding_policy=branding_policy
    )
    if preheader:
        safe_preheader = bleach.clean(substitute_registered_context(preheader, REPRESENTATIVE_PREVIEW_DATA), tags=[], strip=True)
        hidden = f'<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">{safe_preheader}</div>'
        rendered_html = hidden + rendered_html
    return rendered_subject, rendered_html, plain_text


def _walk_block_types(designer_json: dict[str, Any]) -> Iterable[str]:
    for node in designer_json.values():
        if isinstance(node, dict):
            block_type = node.get("type")
            if isinstance(block_type, str):
                yield block_type


def _plain_text(html: str) -> str:
    text = re.sub(r"<(br|/p|/div|/h[1-6]|/li)>\s*", "\n", html, flags=re.I)
    return re.sub(r"\n{3,}", "\n\n", bleach.clean(text, tags=[], strip=True)).strip()


def _validate_schema_v4_metadata(designer_json: dict[str, Any]) -> None:
    for node_id, node in designer_json.items():
        if not isinstance(node, dict) or not isinstance(node.get("data"), dict):
            continue
        data = node["data"]
        role = data.get("editorRole")
        schema_version = data.get("editorSchemaVersion")
        if schema_version is not None and (not isinstance(schema_version, int) or not 1 <= schema_version <= 4):
            raise HTTPException(status_code=422, detail={"code": "UNSUPPORTED_EMAIL_SCHEMA_VERSION", "node": node_id})
        if schema_version != 4:
            continue
        if role is None:
            continue
        if not isinstance(role, str) or role not in SCHEMA_V4_ROLE_TYPES:
            raise HTTPException(status_code=422, detail={"code": "UNSUPPORTED_EMAIL_EDITOR_ROLE", "node": node_id, "role": role})
        if node.get("type") not in SCHEMA_V4_ROLE_TYPES[role]:
            raise HTTPException(status_code=422, detail={"code": "INVALID_EMAIL_ROLE_NODE", "node": node_id, "role": role, "type": node.get("type")})
        metadata = data.get("editorMetadata") or {}
        if not isinstance(metadata, dict):
            raise HTTPException(status_code=422, detail={"code": "INVALID_EMAIL_EDITOR_METADATA", "node": node_id})
        responsive = metadata.get("responsiveStyle") or {}
        if not isinstance(responsive, dict) or any(viewport not in {"desktop", "mobile"} for viewport in responsive):
            raise HTTPException(status_code=422, detail={"code": "INVALID_EMAIL_RESPONSIVE_VALUES", "node": node_id})
        for viewport in responsive.values():
            if not isinstance(viewport, dict):
                raise HTTPException(status_code=422, detail={"code": "INVALID_EMAIL_RESPONSIVE_VALUES", "node": node_id})
            padding = viewport.get("padding") or {}
            if not isinstance(padding, dict) or any(not isinstance(value, (int, float)) or value < 0 or value > 120 for value in padding.values()):
                raise HTTPException(status_code=422, detail={"code": "INVALID_EMAIL_RESPONSIVE_PADDING", "node": node_id})
        action = metadata.get("action")
        if action is not None:
            if not isinstance(action, dict) or action.get("type", "NONE") not in SAFE_ACTION_TYPES:
                raise HTTPException(status_code=422, detail={"code": "INVALID_EMAIL_ACTION", "node": node_id})
        if role == "MANAGED_LIST":
            items = metadata.get("items")
            if not isinstance(items, list) or not 1 <= len(items) <= 100 or any(not isinstance(item, str) or len(item) > 2000 for item in items):
                raise HTTPException(status_code=422, detail={"code": "INVALID_EMAIL_LIST", "node": node_id})
        if role == "MANAGED_TABLE":
            table = metadata.get("table")
            rows = table.get("rows") if isinstance(table, dict) else None
            if not isinstance(rows, list) or not 1 <= len(rows) <= 20:
                raise HTTPException(status_code=422, detail={"code": "INVALID_EMAIL_TABLE_ROWS", "node": node_id})
            width = len(rows[0]) if isinstance(rows[0], list) else 0
            if not 1 <= width <= 10 or any(not isinstance(row, list) or len(row) != width or any(not isinstance(cell, str) or len(cell) > 5000 for cell in row) for row in rows):
                raise HTTPException(status_code=422, detail={"code": "INVALID_EMAIL_TABLE_CELLS", "node": node_id})


def validate_designer_payload(
    *, designer_json: dict, body_html: str, subject: str, template_type: str, target_type: str
) -> str:
    encoded = json.dumps(designer_json, separators=(",", ":")).encode("utf-8")
    if len(encoded) > MAX_DOCUMENT_BYTES:
        raise HTTPException(status_code=413, detail={"code": "EMAIL_DOCUMENT_TOO_LARGE"})
    if len(body_html.encode("utf-8")) > MAX_HTML_BYTES:
        raise HTTPException(status_code=413, detail={"code": "EMAIL_HTML_TOO_LARGE"})
    root = designer_json.get("root")
    if not isinstance(root, dict) or root.get("type") != "EmailLayout":
        raise HTTPException(status_code=422, detail={"code": "INVALID_EMAIL_DOCUMENT_ROOT"})
    unsupported = sorted(set(_walk_block_types(designer_json)) - ALLOWED_BLOCK_TYPES)
    if unsupported:
        raise HTTPException(
            status_code=422,
            detail={"code": "UNSUPPORTED_EMAIL_BLOCKS", "blocks": unsupported},
        )
    _validate_schema_v4_metadata(designer_json)
    if re.search(r"(?i)<\s*(script|iframe|object|embed|form)\b", body_html):
        raise HTTPException(status_code=422, detail={"code": "UNSAFE_EMAIL_HTML"})
    if re.search(
        r"(?i)(javascript:|data:text/html|\bon(?:click|load|error|mouse|focus|blur|change|submit|key|touch|pointer|animation|drag|scroll|select)\w*\s*=)",
        body_html,
    ):
        raise HTTPException(status_code=422, detail={"code": "UNSAFE_EMAIL_URL_OR_HANDLER"})
    for raw_url in re.findall(r"(?i)(?:href|src)\s*=\s*[\"']\s*([^\"']+)", body_html):
        if raw_url.startswith(("{{", "#", "/")):
            continue
        scheme = raw_url.split(":", 1)[0].lower() if ":" in raw_url else ""
        if scheme and scheme not in {"http", "https", "mailto", "tel", "data"}:
            raise HTTPException(status_code=422, detail={"code": "UNSAFE_EMAIL_URL_PROTOCOL", "protocol": scheme})
    if body_html.count("{{#each") != body_html.count("{{/each}}"):
        raise HTTPException(status_code=422, detail={"code": "INVALID_EMAIL_REPEATER"})
    matched_repeaters = list(REPEATER_PATTERN.finditer(body_html))
    if len(matched_repeaters) != body_html.count("{{#each"):
        raise HTTPException(status_code=422, detail={"code": "UNSUPPORTED_OR_NESTED_EMAIL_REPEATER"})
    for match in matched_repeaters:
        collection, raw_limit, repeat_body = match.groups()
        definition = REPEATER_REGISTRY.get(collection)
        if definition is None or "{{#each" in repeat_body:
            raise HTTPException(status_code=422, detail={"code": "UNSUPPORTED_EMAIL_REPEATER", "collection": collection})
        maximum, fields = definition
        if int(raw_limit) > maximum:
            raise HTTPException(status_code=422, detail={"code": "EMAIL_REPEATER_LIMIT_EXCEEDED", "collection": collection, "maximum": maximum})
        expressions = re.findall(r"\{\{\s*([A-Za-z][A-Za-z0-9_]*\.[A-Za-z][A-Za-z0-9_]*)\s*\}\}", repeat_body)
        allowed_prefix = collection[:-1]
        invalid = sorted(expr for expr in expressions if expr.split(".", 1)[0] != allowed_prefix or expr.split(".", 1)[1] not in fields)
        if invalid:
            raise HTTPException(status_code=422, detail={"code": "UNSUPPORTED_EMAIL_REPEATER_FIELDS", "fields": invalid})
    variables = set(VARIABLE_PATTERN.findall(subject + "\n" + body_html))
    allowed = VARIABLE_REGISTRY.get(target_type, VARIABLE_REGISTRY["speaker"])
    unsupported_variables = sorted(variables - allowed)
    if unsupported_variables:
        raise HTTPException(
            status_code=422,
            detail={"code": "UNSUPPORTED_EMAIL_VARIABLES", "variables": unsupported_variables},
        )
    missing = sorted(REQUIRED_VARIABLES.get(template_type, set()) - variables)
    if missing:
        raise HTTPException(
            status_code=422,
            detail={"code": "MISSING_REQUIRED_EMAIL_VARIABLES", "variables": missing},
        )
    return _plain_text(body_html)


async def designer_enabled_for_event(
    db: AsyncSession, organization_id: uuid.UUID, event_id: uuid.UUID, user_id: uuid.UUID | None = None
) -> tuple[bool, str | None]:
    try:
        resolved = await CapabilityService.resolve_event(db, organization_id, event_id, user_id=user_id)
    except Exception:
        return False, "RESOLUTION_UNAVAILABLE"
    feature = resolved.get("features", {}).get("FEAT_EMAIL_DESIGNER", {})
    return bool(feature.get("enabled", feature.get("value", False))), feature.get("reason_code") or feature.get("reason")


async def designer_enabled_for_organization(
    db: AsyncSession, organization_id: uuid.UUID, user_id: uuid.UUID | None = None
) -> tuple[bool, str | None]:
    try:
        resolved = await CapabilityService.resolve_organization(db, organization_id, user_id=user_id)
    except Exception:
        return False, "RESOLUTION_UNAVAILABLE"
    feature = resolved.get("features", {}).get("FEAT_EMAIL_DESIGNER", {})
    return bool(feature.get("enabled", feature.get("value", False))), feature.get("reason_code") or feature.get("reason")


async def list_effective_templates(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    event_id: uuid.UUID | None,
    target_type: str,
    designer_enabled: bool,
) -> list[tuple[EmailTemplate, str]]:
    conditions = [
        EmailTemplate.scope_type == "PLATFORM",
        (EmailTemplate.scope_type == "ORGANIZATION") & (EmailTemplate.organization_id == organization_id),
    ]
    if event_id is not None:
        conditions.append((EmailTemplate.scope_type == "EVENT") & (EmailTemplate.event_id == event_id))
    rows = (
        await db.scalars(
            select(EmailTemplate)
            .where(
                or_(*conditions),
                EmailTemplate.target_type == target_type,
                EmailTemplate.deleted_at.is_(None),
            )
            .order_by(EmailTemplate.scope_type, EmailTemplate.updated_at.desc())
            .execution_options(skip_tenant_filter=True)
        )
    ).all()
    result: list[tuple[EmailTemplate, str]] = []
    for row in rows:
        if not designer_enabled and row.scope_type != "PLATFORM":
            continue
        result.append((row, row.scope_type))
    return result


async def resolve_template(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    event_id: uuid.UUID,
    stable_key: str,
    target_type: str,
    user_id: uuid.UUID | None = None,
) -> tuple[EmailTemplate | None, str | None]:
    enabled, reason = await designer_enabled_for_event(db, organization_id, event_id, user_id)
    rows = await list_effective_templates(
        db,
        organization_id=organization_id,
        event_id=event_id,
        target_type=target_type,
        designer_enabled=enabled,
    )
    row = next((item for item, _ in rows if item.stable_key == stable_key), None)
    return row, None if enabled else reason or "NOT_ENTITLED"


async def resolve_template_type(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    event_id: uuid.UUID,
    template_type: str,
    target_type: str,
    user_id: uuid.UUID | None = None,
) -> tuple[EmailTemplate | None, str | None]:
    """Resolve transactional templates during the stable-key migration window."""
    enabled, reason = await designer_enabled_for_event(db, organization_id, event_id, user_id)
    rows = await list_effective_templates(
        db,
        organization_id=organization_id,
        event_id=event_id,
        target_type=target_type,
        designer_enabled=enabled,
    )
    candidates = [row for row, _ in rows if row.template_type == template_type]
    return (candidates[0] if candidates else None), (None if enabled else reason or "NOT_ENTITLED")


async def create_family(
    db: AsyncSession,
    *,
    scope_type: str,
    organization_id: uuid.UUID | None,
    event_id: uuid.UUID | None,
    parent: EmailTemplate | None,
    name: str,
    stable_key: str,
    template_type: str,
    target_type: str,
    actor_user_id: uuid.UUID,
) -> EmailTemplate:
    duplicate = await db.scalar(
        select(EmailTemplate.id).where(
            EmailTemplate.scope_type == scope_type,
            EmailTemplate.organization_id == organization_id,
            EmailTemplate.event_id == event_id,
            EmailTemplate.stable_key == stable_key,
            EmailTemplate.target_type == target_type,
            EmailTemplate.deleted_at.is_(None),
        ).execution_options(skip_tenant_filter=True)
    )
    if duplicate:
        raise HTTPException(status_code=409, detail={"code": "EMAIL_TEMPLATE_FAMILY_EXISTS"})
    source = parent
    row = EmailTemplate(
        scope_type=scope_type,
        organization_id=organization_id,
        event_id=event_id,
        parent_template_id=source.id if source else None,
        name=name,
        stable_key=stable_key,
        template_type=template_type,
        target_type=target_type,
        subject=source.subject if source else "{{EventName}} update",
        preheader=source.preheader if source else "",
        body_html=source.body_html if source else "<div><p>{{EventName}}</p></div>",
        body_text=source.body_text if source else "{{EventName}}",
        designer_json=source.designer_json if source else {"root": {"type": "EmailLayout", "data": {"childrenIds": []}}},
        is_default=scope_type == "PLATFORM",
        created_by=actor_user_id,
        version=1,
    )
    db.add(row)
    await db.flush()
    draft = EmailTemplateVersion(
        template_id=row.id,
        version_number=1,
        lifecycle_state="DRAFT",
        subject=row.subject,
        preheader=row.preheader,
        body_html=row.body_html,
        body_text=row.body_text,
        designer_json=row.designer_json,
        editor_schema_version=1,
        created_by=actor_user_id,
    )
    db.add(draft)
    await db.flush()
    return row


async def save_draft(
    db: AsyncSession,
    *,
    template_id: uuid.UUID,
    actor_user_id: uuid.UUID,
    expected_version: int,
    name: str,
    subject: str,
    preheader: str,
    body_html: str,
    designer_json: dict,
    editor_schema_version: int,
) -> tuple[EmailTemplate, EmailTemplateVersion]:
    family = await db.scalar(
        select(EmailTemplate)
        .where(EmailTemplate.id == template_id, EmailTemplate.deleted_at.is_(None))
        .with_for_update()
        .execution_options(skip_tenant_filter=True)
    )
    if family is None:
        raise HTTPException(status_code=404, detail={"code": "EMAIL_TEMPLATE_NOT_FOUND"})
    if family.version != expected_version:
        raise HTTPException(status_code=409, detail={"code": "EMAIL_TEMPLATE_VERSION_CONFLICT", "current_version": family.version})
    body_text = validate_designer_payload(
        designer_json=designer_json,
        body_html=body_html,
        subject=subject,
        template_type=family.template_type,
        target_type=family.target_type,
    )
    draft = await db.scalar(
        select(EmailTemplateVersion)
        .where(EmailTemplateVersion.template_id == family.id, EmailTemplateVersion.lifecycle_state == "DRAFT")
        .with_for_update()
    )
    if draft is None:
        next_number = (await db.scalar(select(func.max(EmailTemplateVersion.version_number)).where(EmailTemplateVersion.template_id == family.id)) or 0) + 1
        draft = EmailTemplateVersion(
            template_id=family.id,
            version_number=next_number,
            lifecycle_state="DRAFT",
            subject=subject,
            preheader=preheader,
            body_html=body_html,
            body_text=body_text,
            designer_json=designer_json,
            editor_schema_version=editor_schema_version,
            created_by=actor_user_id,
        )
        db.add(draft)
    else:
        draft.subject = subject
        draft.preheader = preheader
        draft.body_html = body_html
        draft.body_text = body_text
        draft.designer_json = designer_json
        draft.editor_schema_version = editor_schema_version
    family.name = name
    family.version += 1
    family.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return family, draft


async def publish_draft(
    db: AsyncSession, *, template_id: uuid.UUID, actor_user_id: uuid.UUID, expected_version: int
) -> tuple[EmailTemplate, EmailTemplateVersion]:
    family = await db.scalar(
        select(EmailTemplate)
        .where(EmailTemplate.id == template_id)
        .with_for_update()
        .execution_options(skip_tenant_filter=True)
    )
    if family is None:
        raise HTTPException(status_code=404, detail={"code": "EMAIL_TEMPLATE_NOT_FOUND"})
    if family.version != expected_version:
        raise HTTPException(status_code=409, detail={"code": "EMAIL_TEMPLATE_VERSION_CONFLICT", "current_version": family.version})
    draft = await db.scalar(
        select(EmailTemplateVersion).where(
            EmailTemplateVersion.template_id == family.id,
            EmailTemplateVersion.lifecycle_state == "DRAFT",
        ).with_for_update()
    )
    if draft is None:
        raise HTTPException(status_code=409, detail={"code": "EMAIL_TEMPLATE_DRAFT_REQUIRED"})
    validate_designer_payload(
        designer_json=draft.designer_json,
        body_html=draft.body_html,
        subject=draft.subject,
        template_type=family.template_type,
        target_type=family.target_type,
    )
    now = datetime.now(timezone.utc)
    draft.lifecycle_state = "PUBLISHED"
    draft.published_by = actor_user_id
    draft.published_at = now
    family.subject = draft.subject
    family.preheader = draft.preheader
    family.body_html = draft.body_html
    family.body_text = draft.body_text
    family.designer_json = draft.designer_json
    family.current_published_version_id = draft.id
    family.version += 1
    family.updated_at = now
    await db.flush()
    return family, draft


async def rollback_to_version(
    db: AsyncSession,
    *,
    template_id: uuid.UUID,
    source_version_id: uuid.UUID,
    actor_user_id: uuid.UUID,
    expected_version: int,
) -> tuple[EmailTemplate, EmailTemplateVersion]:
    family = await db.scalar(
        select(EmailTemplate)
        .where(EmailTemplate.id == template_id)
        .with_for_update()
        .execution_options(skip_tenant_filter=True)
    )
    source = await db.scalar(select(EmailTemplateVersion).where(
        EmailTemplateVersion.id == source_version_id,
        EmailTemplateVersion.template_id == template_id,
        EmailTemplateVersion.lifecycle_state.in_(("PUBLISHED", "LEGACY")),
    ))
    if family is None or source is None:
        raise HTTPException(status_code=404, detail={"code": "EMAIL_TEMPLATE_VERSION_NOT_FOUND"})
    if family.version != expected_version:
        raise HTTPException(status_code=409, detail={"code": "EMAIL_TEMPLATE_VERSION_CONFLICT", "current_version": family.version})
    next_number = (await db.scalar(select(func.max(EmailTemplateVersion.version_number)).where(EmailTemplateVersion.template_id == family.id)) or 0) + 1
    now = datetime.now(timezone.utc)
    restored = EmailTemplateVersion(
        template_id=family.id,
        version_number=next_number,
        lifecycle_state="PUBLISHED",
        subject=source.subject,
        preheader=source.preheader,
        body_html=source.body_html,
        body_text=source.body_text,
        designer_json=source.designer_json,
        editor_schema_version=source.editor_schema_version,
        created_by=actor_user_id,
        published_by=actor_user_id,
        published_at=now,
    )
    db.add(restored)
    await db.flush()
    family.subject = restored.subject
    family.preheader = restored.preheader
    family.body_html = restored.body_html
    family.body_text = restored.body_text
    family.designer_json = restored.designer_json
    family.current_published_version_id = restored.id
    family.version += 1
    family.updated_at = now
    await db.flush()
    return family, restored
