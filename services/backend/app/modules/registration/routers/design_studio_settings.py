import uuid
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_user
from app.modules.identity.models.user import User
from app.modules.events.models.event import Event
from app.modules.registration.models.portal_theme_setting import PortalThemeSetting
from app.core.dependencies.feature_gate import enforce_event_operation
from app.core.cache import invalidate_event
from app.core.concurrency import raise_version_conflict, require_if_match
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response

router = APIRouter(prefix="/events/{event_id}/design-settings", tags=["Design Studio Settings"])


# ─────────────────────────────────────────────────────────────
# 1. PORTAL CAPABILITIES & SETTINGS SCHEMAS
# ─────────────────────────────────────────────────────────────

class PortalCapabilitiesSchema(BaseModel):
    show_registration: bool = True
    show_speakers: bool = True
    show_abstracts: bool = True
    show_agenda: bool = True
    show_badges: bool = True
    show_certificates: bool = True
    show_exhibitors: bool = True
    show_support: bool = True
    show_resources: bool = True

class PortalSettingsResponse(BaseModel):
    enabled: bool = True
    registration_allowed: bool = True
    participants_list_allowed: bool = True
    window_required: bool = True
    edit_cutoff_days: int = 0
    edit_cutoff_date: Optional[str] = None
    support_email: Optional[str] = None
    support_phone: Optional[str] = None
    additional_contacts: List[Dict[str, Any]] = Field(default_factory=list)
    terms_and_conditions: str = ""
    faqs: List[Dict[str, Any]] = Field(default_factory=list)
    include_default_faqs: bool = True
    capabilities: PortalCapabilitiesSchema = Field(default_factory=PortalCapabilitiesSchema)
    theme_preset: str = "dark-luxury"
    primary_color: str = "#6366F1"
    secondary_color: str = "#8B5CF6"
    tagline: Optional[str] = None
    hero_description: Optional[str] = None

class PortalSettingsUpdate(BaseModel):
    enabled: Optional[bool] = None
    registration_allowed: Optional[bool] = None
    participants_list_allowed: Optional[bool] = None
    window_required: Optional[bool] = None
    edit_cutoff_days: Optional[int] = None
    edit_cutoff_date: Optional[str] = None
    support_email: Optional[str] = None
    support_phone: Optional[str] = None
    additional_contacts: Optional[List[Dict[str, Any]]] = None
    terms_and_conditions: Optional[str] = None
    faqs: Optional[List[Dict[str, Any]]] = None
    include_default_faqs: Optional[bool] = None
    capabilities: Optional[PortalCapabilitiesSchema] = None
    theme_preset: Optional[str] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    tagline: Optional[str] = None
    hero_description: Optional[str] = None


# ─────────────────────────────────────────────────────────────
# 2. BADGE SETTINGS & ROLE MAPPING SCHEMAS
# ─────────────────────────────────────────────────────────────

class BadgeSettingsResponse(BaseModel):
    use_same_design_for_all_users: bool = True
    default_template_id: Optional[str] = None
    role_template_assignments: Dict[str, str] = Field(default_factory=dict)
    paper_size: str = "badge"
    orientation: str = "portrait"
    dpi: int = 300
    double_sided: bool = False
    show_cut_marks: bool = True
    show_qr_code: bool = True
    show_barcode: bool = False
    auto_print_on_checkin: bool = True

class BadgeSettingsUpdate(BaseModel):
    use_same_design_for_all_users: Optional[bool] = None
    default_template_id: Optional[str] = None
    role_template_assignments: Optional[Dict[str, str]] = None
    paper_size: Optional[str] = None
    orientation: Optional[str] = None
    dpi: Optional[int] = None
    double_sided: Optional[bool] = None
    show_cut_marks: Optional[bool] = None
    show_qr_code: Optional[bool] = None
    show_barcode: Optional[bool] = None
    auto_print_on_checkin: Optional[bool] = None


# ─────────────────────────────────────────────────────────────
# 3. CERTIFICATE SETTINGS & ROLE MAPPING SCHEMAS
# ─────────────────────────────────────────────────────────────

class CertificateSettingsResponse(BaseModel):
    use_same_design_for_all_users: bool = True
    default_template_id: Optional[str] = None
    role_template_assignments: Dict[str, str] = Field(default_factory=dict)
    auto_issue_on_checkin: bool = False
    auto_issue_on_session_complete: bool = True
    enable_public_verification: bool = True
    allow_download: bool = True
    download_cutoff_date: Optional[str] = None
    paper_size: str = "a4"
    orientation: str = "landscape"

class CertificateSettingsUpdate(BaseModel):
    use_same_design_for_all_users: Optional[bool] = None
    default_template_id: Optional[str] = None
    role_template_assignments: Optional[Dict[str, str]] = None
    auto_issue_on_checkin: Optional[bool] = None
    auto_issue_on_session_complete: Optional[bool] = None
    enable_public_verification: Optional[bool] = None
    allow_download: Optional[bool] = None
    download_cutoff_date: Optional[str] = None
    paper_size: Optional[str] = None
    orientation: Optional[str] = None


# ─────────────────────────────────────────────────────────────
# 4. WEBSITE SETTINGS SCHEMAS
# ─────────────────────────────────────────────────────────────

class WebsiteSettingsResponse(BaseModel):
    is_published: bool = True
    custom_domain: Optional[str] = None
    subdomain: Optional[str] = None
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    favicon_url: Optional[str] = None
    og_image_url: Optional[str] = None
    ga_tracking_id: Optional[str] = None
    meta_pixel_id: Optional[str] = None
    custom_head_scripts: Optional[str] = None
    custom_body_scripts: Optional[str] = None
    maintenance_mode: bool = False

class WebsiteSettingsUpdate(BaseModel):
    is_published: Optional[bool] = None
    custom_domain: Optional[str] = None
    subdomain: Optional[str] = None
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    favicon_url: Optional[str] = None
    og_image_url: Optional[str] = None
    ga_tracking_id: Optional[str] = None
    meta_pixel_id: Optional[str] = None
    custom_head_scripts: Optional[str] = None
    custom_body_scripts: Optional[str] = None
    maintenance_mode: Optional[bool] = None


# ─────────────────────────────────────────────────────────────
# 5. EMAIL SETTINGS SCHEMAS
# ─────────────────────────────────────────────────────────────

class EmailSettingsResponse(BaseModel):
    from_name: str = "Conference Operations"
    from_email: Optional[str] = None
    reply_to: Optional[str] = None
    brand_logo_url: Optional[str] = None
    brand_primary_color: str = "#6366F1"
    footer_text: Optional[str] = None
    company_address: Optional[str] = None
    enable_registration_trigger: bool = True
    enable_payment_trigger: bool = True
    enable_speaker_trigger: bool = True
    enable_abstract_trigger: bool = True
    enable_certificate_trigger: bool = True

class EmailSettingsUpdate(BaseModel):
    from_name: Optional[str] = None
    from_email: Optional[str] = None
    reply_to: Optional[str] = None
    brand_logo_url: Optional[str] = None
    brand_primary_color: Optional[str] = None
    footer_text: Optional[str] = None
    company_address: Optional[str] = None
    enable_registration_trigger: Optional[bool] = None
    enable_payment_trigger: Optional[bool] = None
    enable_speaker_trigger: Optional[bool] = None
    enable_abstract_trigger: Optional[bool] = None
    enable_certificate_trigger: Optional[bool] = None


# ─────────────────────────────────────────────────────────────
# ROUTE HANDLERS
# ─────────────────────────────────────────────────────────────

async def _get_event_or_404(
    event_id: uuid.UUID, db: AsyncSession, *, for_update: bool = False
) -> Event:
    stmt = select(Event).where(Event.id == event_id)
    if for_update:
        stmt = stmt.with_for_update()
    res = await db.execute(stmt)
    event = res.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event


def _advance_event_settings_version(
    event: Event, *, actor_user_id: uuid.UUID, if_match: Optional[str]
) -> None:
    """Serialize settings writes and optionally reject stale clients."""
    if if_match is not None:
        expected_version = require_if_match(if_match)
        current_version = int(event.version or 1)
        if current_version != expected_version:
            raise_version_conflict(current_version)
    event.version = int(event.version or 1) + 1
    event.updated_by = actor_user_id


async def _begin_settings_command(db: AsyncSession, *, event: Event, actor: User, operation: str, key: str | None, payload: dict[str, Any]):
    return await begin_idempotent(
        db,
        organization_id=event.organization_id,
        actor_id=actor.id,
        operation=operation,
        key=key or f"legacy-{uuid.uuid4()}",
        payload=payload,
    )


# ── 1. PORTAL SETTINGS ───────────────────────────────────────

@router.get("/portal", response_model=PortalSettingsResponse)
async def get_portal_settings(
    event_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    event = await _get_event_or_404(event_id, db)
    pts_stmt = select(PortalThemeSetting).where(PortalThemeSetting.event_id == event_id)
    pts_res = await db.execute(pts_stmt)
    pts = pts_res.scalar_one_or_none()

    extra = pts.extra_settings if pts else {}
    capabilities_dict = extra.get("portal_capabilities", {})
    reg_settings = getattr(event, "registration_settings", {}) or {}

    return PortalSettingsResponse(
        enabled=pts.enabled if pts else True,
        registration_allowed=pts.registration_allowed if pts else True,
        participants_list_allowed=pts.participants_list_allowed if pts else True,
        window_required=pts.window_required if pts else True,
        edit_cutoff_days=reg_settings.get("edit_cutoff_days", 0),
        edit_cutoff_date=reg_settings.get("edit_cutoff_date"),
        support_email=pts.support_email if pts and pts.support_email else reg_settings.get("support_email"),
        support_phone=pts.support_phone if pts and pts.support_phone else reg_settings.get("support_phone"),
        additional_contacts=pts.additional_contacts if pts and pts.additional_contacts else reg_settings.get("additional_contacts", []),
        terms_and_conditions=pts.terms_and_conditions if pts else reg_settings.get("terms_and_conditions", ""),
        faqs=pts.faqs if pts and pts.faqs else reg_settings.get("faqs", []),
        include_default_faqs=pts.include_default_faqs if pts else reg_settings.get("include_default_faqs", True),
        capabilities=PortalCapabilitiesSchema(**capabilities_dict),
        theme_preset=pts.theme_preset if pts else "dark-luxury",
        primary_color=pts.primary_color if pts else "#6366F1",
        secondary_color=pts.secondary_color if pts else "#8B5CF6",
        tagline=pts.tagline if pts else "Shape the future of intelligence.",
        hero_description=pts.hero_description if pts else "Join industry leaders and innovators.",
    )


@router.put("/portal", response_model=PortalSettingsResponse)
async def update_portal_settings(
    event_id: uuid.UUID,
    payload: PortalSettingsUpdate,
    if_match: Optional[str] = Header(None, alias="If-Match"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    event = await _get_event_or_404(event_id, db, for_update=True)
    idem = await _begin_settings_command(db, event=event, actor=current_user, operation="registration.settings.portal.update", key=idempotency_key, payload={"event_id": str(event_id), "if_match": if_match, **payload.model_dump(mode="json", exclude_unset=True)})
    replay = replay_response(idem)
    if replay is not None:
        return PortalSettingsResponse.model_validate(replay[1])
    await enforce_event_operation(db, event.organization_id, event.id, "branding.theme.manage", user_id=current_user.id)
    pts_stmt = select(PortalThemeSetting).where(PortalThemeSetting.event_id == event_id)
    pts_res = await db.execute(pts_stmt)
    pts = pts_res.scalar_one_or_none()

    if not pts:
        pts = PortalThemeSetting(event_id=event_id)
        db.add(pts)

    reg_settings = dict(getattr(event, "registration_settings", {}) or {})

    if payload.enabled is not None:
        pts.enabled = payload.enabled
    if payload.registration_allowed is not None:
        pts.registration_allowed = payload.registration_allowed
    if payload.participants_list_allowed is not None:
        pts.participants_list_allowed = payload.participants_list_allowed
    if payload.window_required is not None:
        pts.window_required = payload.window_required
    if payload.support_email is not None:
        pts.support_email = payload.support_email
        reg_settings["support_email"] = payload.support_email
    if payload.support_phone is not None:
        pts.support_phone = payload.support_phone
        reg_settings["support_phone"] = payload.support_phone
    if payload.additional_contacts is not None:
        pts.additional_contacts = payload.additional_contacts
        reg_settings["additional_contacts"] = payload.additional_contacts
    if payload.terms_and_conditions is not None:
        pts.terms_and_conditions = payload.terms_and_conditions
        reg_settings["terms_and_conditions"] = payload.terms_and_conditions
    if payload.faqs is not None:
        pts.faqs = payload.faqs
        reg_settings["faqs"] = payload.faqs
    if payload.include_default_faqs is not None:
        pts.include_default_faqs = payload.include_default_faqs
        reg_settings["include_default_faqs"] = payload.include_default_faqs
    if payload.theme_preset is not None:
        pts.theme_preset = payload.theme_preset
    if payload.primary_color is not None:
        pts.primary_color = payload.primary_color
    if payload.secondary_color is not None:
        pts.secondary_color = payload.secondary_color
    if payload.tagline is not None:
        pts.tagline = payload.tagline
    if payload.hero_description is not None:
        pts.hero_description = payload.hero_description
    if payload.edit_cutoff_days is not None:
        reg_settings["edit_cutoff_days"] = payload.edit_cutoff_days
    if payload.edit_cutoff_date is not None:
        reg_settings["edit_cutoff_date"] = payload.edit_cutoff_date

    if payload.capabilities is not None:
        extra = dict(pts.extra_settings or {})
        extra["portal_capabilities"] = payload.capabilities.model_dump()
        pts.extra_settings = extra

    event.registration_settings = reg_settings
    _advance_event_settings_version(event, actor_user_id=current_user.id, if_match=if_match)
    await db.commit()
    await invalidate_event(event.organization_id, event.id)
    await db.refresh(pts)

    response = await get_portal_settings(event_id, db, current_user)
    await complete_idempotent(db, idem, response_status=200, response_body=response.model_dump(mode="json"), resource_id=event.id)
    await db.commit()
    return response


# ── 2. BADGE SETTINGS ────────────────────────────────────────

@router.get("/badges", response_model=BadgeSettingsResponse)
async def get_badge_settings(
    event_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    event = await _get_event_or_404(event_id, db)
    reg_settings = getattr(event, "registration_settings", {}) or {}
    badge_design = reg_settings.get("badge_design", {})

    return BadgeSettingsResponse(
        use_same_design_for_all_users=badge_design.get("use_same_design_for_all_users", True),
        default_template_id=badge_design.get("default_template_id"),
        role_template_assignments=badge_design.get("role_template_assignments", {}),
        paper_size=badge_design.get("paper_size", "badge"),
        orientation=badge_design.get("orientation", "portrait"),
        dpi=badge_design.get("dpi", 300),
        double_sided=badge_design.get("double_sided", False),
        show_cut_marks=badge_design.get("show_cut_marks", True),
        show_qr_code=badge_design.get("show_qr_code", True),
        show_barcode=badge_design.get("show_barcode", False),
        auto_print_on_checkin=badge_design.get("auto_print_on_checkin", True),
    )


@router.put("/badges", response_model=BadgeSettingsResponse)
async def update_badge_settings(
    event_id: uuid.UUID,
    payload: BadgeSettingsUpdate,
    if_match: Optional[str] = Header(None, alias="If-Match"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    event = await _get_event_or_404(event_id, db, for_update=True)
    idem = await _begin_settings_command(db, event=event, actor=current_user, operation="registration.settings.badges.update", key=idempotency_key, payload={"event_id": str(event_id), "if_match": if_match, **payload.model_dump(mode="json", exclude_unset=True)})
    replay = replay_response(idem)
    if replay is not None:
        return BadgeSettingsResponse.model_validate(replay[1])
    await enforce_event_operation(db, event.organization_id, event.id, "badges.custom_design.manage", user_id=current_user.id)
    reg_settings = dict(getattr(event, "registration_settings", {}) or {})
    badge_design = dict(reg_settings.get("badge_design", {}))

    for key, val in payload.model_dump(exclude_unset=True).items():
        badge_design[key] = val

    reg_settings["badge_design"] = badge_design
    event.registration_settings = reg_settings
    _advance_event_settings_version(event, actor_user_id=current_user.id, if_match=if_match)

    await db.commit()
    await invalidate_event(event.organization_id, event.id)
    response = await get_badge_settings(event_id, db, current_user)
    await complete_idempotent(db, idem, response_status=200, response_body=response.model_dump(mode="json"), resource_id=event.id)
    await db.commit()
    return response


# ── 3. CERTIFICATE SETTINGS ──────────────────────────────────

@router.get("/certificates", response_model=CertificateSettingsResponse)
async def get_certificate_settings(
    event_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    event = await _get_event_or_404(event_id, db)
    reg_settings = getattr(event, "registration_settings", {}) or {}
    cert_design = reg_settings.get("certificate_design", {})

    return CertificateSettingsResponse(
        use_same_design_for_all_users=cert_design.get("use_same_design_for_all_users", True),
        default_template_id=cert_design.get("default_template_id"),
        role_template_assignments=cert_design.get("role_template_assignments", {}),
        auto_issue_on_checkin=cert_design.get("auto_issue_on_checkin", False),
        auto_issue_on_session_complete=cert_design.get("auto_issue_on_session_complete", True),
        enable_public_verification=cert_design.get("enable_public_verification", True),
        allow_download=cert_design.get("allow_download", True),
        download_cutoff_date=cert_design.get("download_cutoff_date"),
        paper_size=cert_design.get("paper_size", "a4"),
        orientation=cert_design.get("orientation", "landscape"),
    )


@router.put("/certificates", response_model=CertificateSettingsResponse)
async def update_certificate_settings(
    event_id: uuid.UUID,
    payload: CertificateSettingsUpdate,
    if_match: Optional[str] = Header(None, alias="If-Match"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    event = await _get_event_or_404(event_id, db, for_update=True)
    idem = await _begin_settings_command(db, event=event, actor=current_user, operation="registration.settings.certificates.update", key=idempotency_key, payload={"event_id": str(event_id), "if_match": if_match, **payload.model_dump(mode="json", exclude_unset=True)})
    replay = replay_response(idem)
    if replay is not None:
        return CertificateSettingsResponse.model_validate(replay[1])
    await enforce_event_operation(db, event.organization_id, event.id, "certificates.custom_design.manage", user_id=current_user.id)
    reg_settings = dict(getattr(event, "registration_settings", {}) or {})
    cert_design = dict(reg_settings.get("certificate_design", {}))

    for key, val in payload.model_dump(exclude_unset=True).items():
        cert_design[key] = val

    reg_settings["certificate_design"] = cert_design
    event.registration_settings = reg_settings
    _advance_event_settings_version(event, actor_user_id=current_user.id, if_match=if_match)

    await db.commit()
    await invalidate_event(event.organization_id, event.id)
    response = await get_certificate_settings(event_id, db, current_user)
    await complete_idempotent(db, idem, response_status=200, response_body=response.model_dump(mode="json"), resource_id=event.id)
    await db.commit()
    return response


# ── 4. WEBSITE SETTINGS ──────────────────────────────────────

@router.get("/website", response_model=WebsiteSettingsResponse)
async def get_website_settings(
    event_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    event = await _get_event_or_404(event_id, db)
    reg_settings = getattr(event, "registration_settings", {}) or {}
    web_settings = reg_settings.get("website_settings", {})

    return WebsiteSettingsResponse(
        is_published=web_settings.get("is_published", True),
        custom_domain=web_settings.get("custom_domain"),
        subdomain=web_settings.get("subdomain", event.short_code.lower() if event.short_code else None),
        meta_title=web_settings.get("meta_title", f"{event.name} — Official Event Website"),
        meta_description=web_settings.get("meta_description", event.tagline or event.name),
        favicon_url=web_settings.get("favicon_url"),
        og_image_url=web_settings.get("og_image_url"),
        ga_tracking_id=web_settings.get("ga_tracking_id"),
        meta_pixel_id=web_settings.get("meta_pixel_id"),
        custom_head_scripts=web_settings.get("custom_head_scripts"),
        custom_body_scripts=web_settings.get("custom_body_scripts"),
        maintenance_mode=web_settings.get("maintenance_mode", False),
    )


@router.put("/website", response_model=WebsiteSettingsResponse)
async def update_website_settings(
    event_id: uuid.UUID,
    payload: WebsiteSettingsUpdate,
    if_match: Optional[str] = Header(None, alias="If-Match"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    event = await _get_event_or_404(event_id, db, for_update=True)
    idem = await _begin_settings_command(db, event=event, actor=current_user, operation="registration.settings.website.update", key=idempotency_key, payload={"event_id": str(event_id), "if_match": if_match, **payload.model_dump(mode="json", exclude_unset=True)})
    replay = replay_response(idem)
    if replay is not None:
        return WebsiteSettingsResponse.model_validate(replay[1])
    await enforce_event_operation(db, event.organization_id, event.id, "website.manage", user_id=current_user.id)
    reg_settings = dict(getattr(event, "registration_settings", {}) or {})
    web_settings = dict(reg_settings.get("website_settings", {}))

    for key, val in payload.model_dump(exclude_unset=True).items():
        web_settings[key] = val

    reg_settings["website_settings"] = web_settings
    event.registration_settings = reg_settings
    _advance_event_settings_version(event, actor_user_id=current_user.id, if_match=if_match)

    await db.commit()
    await invalidate_event(event.organization_id, event.id)
    response = await get_website_settings(event_id, db, current_user)
    await complete_idempotent(db, idem, response_status=200, response_body=response.model_dump(mode="json"), resource_id=event.id)
    await db.commit()
    return response


# ── 5. EMAIL SETTINGS ────────────────────────────────────────

@router.get("/emails", response_model=EmailSettingsResponse)
async def get_email_settings(
    event_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    event = await _get_event_or_404(event_id, db)
    reg_settings = getattr(event, "registration_settings", {}) or {}
    email_settings = reg_settings.get("email_settings", {})

    return EmailSettingsResponse(
        from_name=email_settings.get("from_name", f"{event.name} Organizing Team"),
        from_email=email_settings.get("from_email"),
        reply_to=email_settings.get("reply_to"),
        brand_logo_url=email_settings.get("brand_logo_url"),
        brand_primary_color=email_settings.get("brand_primary_color", "#6366F1"),
        footer_text=email_settings.get("footer_text", f"© {event.start_date.year if event.start_date else 2026} {event.name}. All rights reserved."),
        company_address=email_settings.get("company_address", event.venue_name or event.location or ""),
        enable_registration_trigger=email_settings.get("enable_registration_trigger", True),
        enable_payment_trigger=email_settings.get("enable_payment_trigger", True),
        enable_speaker_trigger=email_settings.get("enable_speaker_trigger", True),
        enable_abstract_trigger=email_settings.get("enable_abstract_trigger", True),
        enable_certificate_trigger=email_settings.get("enable_certificate_trigger", True),
    )


@router.put("/emails", response_model=EmailSettingsResponse)
async def update_email_settings(
    event_id: uuid.UUID,
    payload: EmailSettingsUpdate,
    if_match: Optional[str] = Header(None, alias="If-Match"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    event = await _get_event_or_404(event_id, db, for_update=True)
    idem = await _begin_settings_command(db, event=event, actor=current_user, operation="registration.settings.emails.update", key=idempotency_key, payload={"event_id": str(event_id), "if_match": if_match, **payload.model_dump(mode="json", exclude_unset=True)})
    replay = replay_response(idem)
    if replay is not None:
        return EmailSettingsResponse.model_validate(replay[1])
    await enforce_event_operation(db, event.organization_id, event.id, "communications.email_designer.manage", user_id=current_user.id)
    reg_settings = dict(getattr(event, "registration_settings", {}) or {})
    email_settings = dict(reg_settings.get("email_settings", {}))

    for key, val in payload.model_dump(exclude_unset=True).items():
        email_settings[key] = val

    reg_settings["email_settings"] = email_settings
    event.registration_settings = reg_settings
    _advance_event_settings_version(event, actor_user_id=current_user.id, if_match=if_match)

    await db.commit()
    await invalidate_event(event.organization_id, event.id)
    response = await get_email_settings(event_id, db, current_user)
    await complete_idempotent(db, idem, response_status=200, response_body=response.model_dump(mode="json"), resource_id=event.id)
    await db.commit()
    return response
