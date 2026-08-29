import app.models
import hashlib
import uuid
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Response, Form, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from app.modules.registration.models.registration_domain_tables import FormField

from app.dependencies import get_db, get_current_event, CurrentEvent
from app.modules.registration.models.registration_theme_setting import RegistrationThemeSetting
from app.modules.events.models.event import Event
from app.modules.registration.models.registration_form_config import RegistrationFormConfig
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.participant_registration import ParticipantRegistration
from app.modules.events.models.capacity_rule import CapacityRule
from app.modules.registration.schemas.registration_form_config import (
    RegistrationFormConfigResponse,
    RegistrationFormConfigUpdate
)
from app.schemas.common import MessageResponse
from app.modules.registration.routers.participants import generate_next_regno
from app.services import upload_service
from app.config import settings

from app.modules.registration.models.promo_code import PromoCode
from app.modules.registration.models.payment_transaction import PaymentTransaction
from app.modules.registration.services.payment_service import PaymentService
from app.modules.registration.services.pricing_service import (
    get_active_tier,
    get_active_prices_for_event,
    get_ticket_price
)
from app.modules.registration.routers.registrations import helper_approve_registration
from app.modules.registration.services.portal_service import verify_and_resolve_registration
from app.core.dependencies.feature_gate import enforce_event_feature, enforce_event_operation, require_event_operation
from app.modules.platform.services.metering_service import MeteringService
from app.modules.billing.services.usage_reservation_service import UsageReservationService
from app.modules.billing.services.capability_service import CapabilityService
from app.modules.platform.models.organization_console import UsageReservation

router = APIRouter(tags=["registration_portal"])

PUBLIC_REGISTRATION_CAPABILITIES = (
    "FEAT_REGISTRATION_PORTAL", "FEAT_REGISTRATION_FORMS",
    "FEAT_TICKET_CATEGORIES", "FEAT_COUPON_CODES",
    "FEAT_PAYMENT_GATEWAY", "FEAT_QR_CONFIRMATION",
)
PUBLIC_REGISTRATION_LIMITS = ("max_registrations", "max_ticket_categories")


async def _public_capability_result(db: AsyncSession, event: Event) -> dict[str, Any]:
    """Resolve public registration access without exposing commercial lineage."""
    try:
        return await CapabilityService.resolve_event(
            db, event.organization_id, event.id, environment=settings.environment.upper()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "RESOLUTION_UNAVAILABLE"},
        ) from exc


async def _require_public_registration(db: AsyncSession, event: Event) -> dict[str, Any]:
    capabilities = await _public_capability_result(db, event)
    feature = capabilities.get("features", {}).get("FEAT_REGISTRATION_PORTAL")
    if feature and not feature.get("enabled", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "FEATURE_DISABLED",
                "message": "Registration portal is not enabled for this event.",
                "reason_code": feature.get("reason_code"),
            }
        )
    return capabilities


DEFAULT_FIELDS = [
    {
        "id": "title",
        "name": "title",
        "label": "Title / Prefix",
        "type": "select",
        "is_default": True,
        "is_required": False,
        "is_active": True,
        "placeholder": "Select title",
        "options": ["Dr.", "Prof.", "Mr.", "Ms.", "Mrs."]
    },
    {
        "id": "first_name",
        "name": "first_name",
        "label": "First Name",
        "type": "text",
        "is_default": True,
        "is_required": True,
        "is_active": True,
        "placeholder": "Enter your first name"
    },
    {
        "id": "last_name",
        "name": "last_name",
        "label": "Last Name",
        "type": "text",
        "is_default": True,
        "is_required": True,
        "is_active": True,
        "placeholder": "Enter your last name"
    },
    {
        "id": "email",
        "name": "email",
        "label": "Email Address",
        "type": "email",
        "is_default": True,
        "is_required": True,
        "is_active": True,
        "placeholder": "Enter your email address"
    },
    {
        "id": "phone",
        "name": "phone",
        "label": "Phone Number",
        "type": "phone",
        "is_default": True,
        "is_required": True,
        "is_active": True,
        "placeholder": "Enter phone number"
    },
    {
        "id": "company",
        "name": "company",
        "label": "Institution / Organization",
        "type": "text",
        "is_default": True,
        "is_required": True,
        "is_active": True,
        "placeholder": "Enter institution, hospital, or organization"
    },
    {
        "id": "designation",
        "name": "designation",
        "label": "Job Title / Designation",
        "type": "text",
        "is_default": True,
        "is_required": True,
        "is_active": True,
        "placeholder": "Enter your job title or designation"
    },
    {
        "id": "country",
        "name": "country",
        "label": "Country",
        "type": "country",
        "is_default": True,
        "is_required": True,
        "is_active": True,
        "placeholder": "Select your country"
    },
    {
        "id": "role",
        "name": "role",
        "label": "Registration Role / Category",
        "type": "select",
        "is_default": True,
        "is_required": True,
        "is_active": True,
        "placeholder": "Select your role category",
        "options": []
    }
]

from app.services.template_defaults import get_default_registration_terms, get_default_registration_faqs

DEFAULT_TERMS = get_default_registration_terms()
DEFAULT_FAQS = get_default_registration_faqs()

REMOVED_DEFAULT_IDS = {"council_number", "postal_code", "dietary_preference", "emergency_contact", "state", "city"}


# ── Organizer Endpoints ───────────────────────────────────────────

@router.get("/events/{event_id}/registration/form-config", response_model=RegistrationFormConfigResponse)
async def get_registration_form_config(
    event: CurrentEvent,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    """
    Get the registration form configuration for the event.
    Creates a default configuration and populates registration.form_fields if none exists.
    """
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"

    stmt = select(RegistrationFormConfig).where(RegistrationFormConfig.event_id == event.id)
    result = await db.execute(stmt)
    config = result.scalar_one_or_none()

    if not config:
        config = RegistrationFormConfig(
            event_id=event.id,
            is_live=True,
            fields=DEFAULT_FIELDS
        )
        db.add(config)
        await db.commit()
        await db.refresh(config)

    # Check registration.form_fields table
    ff_stmt = select(FormField).where(FormField.form_id == config.id).order_by(FormField.sort_order)
    ff_res = await db.execute(ff_stmt)
    db_form_fields = ff_res.scalars().all()

    REMOVED_DEFAULT_IDS = {"council_number", "postal_code", "dietary_preference", "emergency_contact", "state", "city"}

    if not db_form_fields:
        base_fields = config.fields if config.fields else DEFAULT_FIELDS
        cleaned_fields = [
            f for f in base_fields
            if not (f.get("is_default") and (f.get("id") in REMOVED_DEFAULT_IDS or f.get("name") in REMOVED_DEFAULT_IDS))
        ]
        
        # Ensure all 11 default fields exist
        existing_ids = {f.get("id") or f.get("name") for f in cleaned_fields}
        for df in DEFAULT_FIELDS:
            if df["id"] not in existing_ids and df["name"] not in existing_ids:
                cleaned_fields.append(df)

        for idx, f in enumerate(cleaned_fields):
            ff = FormField(
                id=uuid.uuid4(),
                form_id=config.id,
                field_name=f.get("name") or f.get("id") or f"field_{idx}",
                field_type=f.get("type", "text"),
                is_required=f.get("is_required", False),
                sort_order=idx,
                label=f.get("label", ""),
                is_active=f.get("is_active", True),
                is_default=f.get("is_default", False),
                placeholder=f.get("placeholder", ""),
                options=f.get("options", [])
            )
            db.add(ff)
        config.fields = cleaned_fields
        await db.commit()
        await db.refresh(config)
    else:
        loaded_fields = []
        for ff in db_form_fields:
            if ff.is_default and (ff.field_name in REMOVED_DEFAULT_IDS):
                continue
            loaded_fields.append({
                "id": ff.field_name,
                "name": ff.field_name,
                "label": ff.label or ff.field_name,
                "type": ff.field_type,
                "is_default": ff.is_default,
                "is_required": ff.is_required,
                "is_active": ff.is_active,
                "placeholder": ff.placeholder or "",
                "options": ff.options or []
            })
        
        # Ensure all default fields are present
        existing_ids = {f.get("id") or f.get("name") for f in loaded_fields}
        updated = False
        for df in DEFAULT_FIELDS:
            if df["id"] not in existing_ids and df["name"] not in existing_ids:
                loaded_fields.append(df)
                ff_new = FormField(
                    id=uuid.uuid4(),
                    form_id=config.id,
                    field_name=df["name"],
                    field_type=df["type"],
                    is_required=df["is_required"],
                    sort_order=len(loaded_fields),
                    label=df["label"],
                    is_active=df["is_active"],
                    is_default=df["is_default"],
                    placeholder=df.get("placeholder", ""),
                    options=df.get("options", [])
                )
                db.add(ff_new)
                updated = True
        
        config.fields = loaded_fields
        if updated:
            await db.commit()
            await db.refresh(config)

    terms = event.registration_settings.get("terms_and_conditions", "") if event.registration_settings else ""
    faqs = event.registration_settings.get("faqs", DEFAULT_FAQS) if event.registration_settings else DEFAULT_FAQS
    include_default = event.registration_settings.get("include_default_faqs", True) if event.registration_settings else True
    return {
        "id": config.id,
        "event_id": config.event_id,
        "is_live": config.is_live,
        "fields": config.fields,
        "terms_and_conditions": terms,
        "faqs": faqs,
        "include_default_faqs": include_default
    }


@router.post(
    "/events/{event_id}/registration/form-config",
    response_model=RegistrationFormConfigResponse,
    dependencies=[require_event_operation("registration.forms.manage")],
)
async def update_registration_form_config(
    payload: RegistrationFormConfigUpdate,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db)
):
    """
    Update the registration form configuration and synchronize with registration.form_fields.
    """
    stmt = select(RegistrationFormConfig).where(RegistrationFormConfig.event_id == event.id)
    result = await db.execute(stmt)
    config = result.scalar_one_or_none()

    if not config:
        config = RegistrationFormConfig(event_id=event.id)
        db.add(config)
        await db.flush()

    if payload.is_live is not None:
        config.is_live = payload.is_live
        
    if payload.fields is not None:
        dict_fields = [f.model_dump() for f in payload.fields]
        config.fields = dict_fields
        
        # Synchronize with registration.form_fields table
        await db.execute(delete(FormField).where(FormField.form_id == config.id))
        sort_idx = 0
        has_state = False
        for f in dict_fields:
            fname = f.get("name") or f.get("id") or f"field_{sort_idx}"
            ftype = f.get("type", "text")
            db.add(FormField(
                id=uuid.uuid4(),
                form_id=config.id,
                field_name=fname,
                field_type=ftype,
                is_required=f.get("is_required", False),
                sort_order=sort_idx,
                label=f.get("label", ""),
                is_active=f.get("is_active", True),
                is_default=f.get("is_default", False),
                placeholder=f.get("placeholder", ""),
                options=f.get("options", [])
            ))
            sort_idx += 1
            if fname == "state":
                has_state = True
            elif ftype == "country" or fname == "country":
                # Ensure state exists as companion in form_fields table
                if not has_state:
                    db.add(FormField(
                        id=uuid.uuid4(),
                        form_id=config.id,
                        field_name="state",
                        field_type="state",
                        is_required=f.get("is_required", False),
                        sort_order=sort_idx,
                        label="State / Province",
                        is_active=f.get("is_active", True),
                        is_default=True,
                        placeholder="Select state / province",
                        options=[]
                    ))
                    sort_idx += 1
                    has_state = True

    if payload.terms_and_conditions is not None:
        reg_settings = dict(event.registration_settings or {})
        reg_settings["terms_and_conditions"] = payload.terms_and_conditions
        event.registration_settings = reg_settings
    if payload.faqs is not None:
        reg_settings = dict(event.registration_settings or {})
        reg_settings["faqs"] = [faq.model_dump() for faq in payload.faqs]
        event.registration_settings = reg_settings
    if payload.include_default_faqs is not None:
        reg_settings = dict(event.registration_settings or {})
        reg_settings["include_default_faqs"] = payload.include_default_faqs
        event.registration_settings = reg_settings

    await db.commit()
    await db.refresh(config)
    
    terms = event.registration_settings.get("terms_and_conditions", "") if event.registration_settings else ""
    faqs = event.registration_settings.get("faqs", DEFAULT_FAQS) if event.registration_settings else DEFAULT_FAQS
    include_default = event.registration_settings.get("include_default_faqs", True) if event.registration_settings else True
    return {
        "id": config.id,
        "event_id": config.event_id,
        "is_live": config.is_live,
        "fields": config.fields,
        "terms_and_conditions": terms,
        "faqs": faqs,
        "include_default_faqs": include_default
    }


# ── Public Registration Portal Endpoints ─────────────────────────

@router.get("/portal/registration/{event_id}/capabilities")
async def public_registration_capabilities(
    event_id: uuid.UUID,
    response: Response,
    if_none_match: Optional[str] = Header(None, alias="If-None-Match"),
    db: AsyncSession = Depends(get_db),
):
    event = await db.scalar(select(Event).where(Event.id == event_id))
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found.")
    result = await _public_capability_result(db, event)
    feature_rows = {
        key: {
            "enabled": bool(result.get("features", {}).get(key, {}).get("enabled")),
            "reason_code": result.get("features", {}).get(key, {}).get("reason_code"),
            "value": result.get("features", {}).get(key, {}).get("value"),
        }
        for key in PUBLIC_REGISTRATION_CAPABILITIES
    }
    limit_rows = {
        key: {
            "allowed": result.get("limits", {}).get(key, {}).get("allowed"),
            "remaining": result.get("limits", {}).get(key, {}).get("remaining"),
            "reason_code": result.get("limits", {}).get(key, {}).get("reason_code"),
        }
        for key in PUBLIC_REGISTRATION_LIMITS
    }
    etag = f'"{result["resolution_version"]}"'
    if if_none_match == etag:
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers={"ETag": etag})
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "public, max-age=30, must-revalidate"
    return {
        "event_id": str(event.id),
        "resolution_version": result["resolution_version"],
        "availability": result.get("availability", {}),
        "features": feature_rows,
        "limits": limit_rows,
        "freshness_at": result.get("freshness_at"),
    }


@router.get("/portal/registration/{event_id}/form")
async def get_public_registration_form(
    event_id: uuid.UUID,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieve event details and form config for public registration.
    """
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"

    # Load event
    event_stmt = select(Event).where(Event.id == event_id)
    event_result = await db.execute(event_stmt)
    event = event_result.scalar_one_or_none()

    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found."
        )
    capabilities = await _require_public_registration(db, event)
    # Load form config
    config_stmt = select(RegistrationFormConfig).where(RegistrationFormConfig.event_id == event_id)
    config_result = await db.execute(config_stmt)
    config = config_result.scalar_one_or_none()

    is_live = False
    fields = DEFAULT_FIELDS

    if config:
        is_live = config.is_live
        fields = [
            f for f in (config.fields or DEFAULT_FIELDS)
            if not (f.get("is_default") and (f.get("id") in REMOVED_DEFAULT_IDS or f.get("name") in REMOVED_DEFAULT_IDS))
        ]

    # Load active roles and apply category filters
    from app.modules.registration.models.participant_role import ParticipantRole
    roles_stmt = select(ParticipantRole).where(
        ParticipantRole.event_id == event_id
    ).order_by(ParticipantRole.sort_order, ParticipantRole.name)
    roles_res = await db.execute(roles_stmt)
    roles = roles_res.scalars().all()

    # Auto-seed if empty
    if not roles:
        from app.modules.registration.routers.participant_roles import seed_default_roles
        await seed_default_roles(event_id, db)
        roles_res = await db.execute(roles_stmt)
        roles = roles_res.scalars().all()

    reg_settings = event.registration_settings or {}

    # All active participant roles set by organizer
    allowed_roles = [
        r.name for r in roles
        if r.is_active
    ]

    # Map form fields and dynamically assign roles to select options
    import copy
    fields_copy = copy.deepcopy(fields)
    for field in fields_copy:
        if field.get("id") == "role":
            field["options"] = allowed_roles

    pts = event.portal_theme_setting
    active_gateway = (
        (pts.active_gateway if pts and pts.active_gateway else None)
        or reg_settings.get("active_gateway")
        or "simulated"
    )
    payment_enabled = (
        (pts.payment_enabled if pts and pts.payment_enabled is not None else None)
        if (pts and pts.payment_enabled is not None)
        else bool(reg_settings.get("payment_enabled", False))
    )
    coupon_enabled = bool(
        capabilities["features"].get("FEAT_COUPON_CODES", {}).get("enabled")
    )
    uploads_enabled = bool(
        capabilities["features"].get("FEAT_REGISTRATION_FORMS", {}).get("enabled")
    )
    
    stripe_pub_key = ""
    if active_gateway == "stripe":
        stripe_creds = (pts.stripe_credentials if pts and pts.stripe_credentials else None) or reg_settings.get("stripe_credentials", {})
        stripe_pub_key = stripe_creds.get("publishable_key", "")
        
    active_tier = get_active_tier(event)
    raw_active_prices = await get_active_prices_for_event(db, event)
    # Explicitly ensure every active role has a price entry (0.0 if free/unpriced)
    active_prices = {}
    for r_name in allowed_roles:
        if r_name in raw_active_prices:
            active_prices[r_name] = float(raw_active_prices[r_name])
        else:
            matched_p = next(
                (v for k, v in raw_active_prices.items() if k.strip().lower() == r_name.strip().lower()),
                0.0
            )
            active_prices[r_name] = float(matched_p)

    raw_terms = reg_settings.get("terms_and_conditions")
    if not raw_terms or len(raw_terms.strip()) < 100 or "1. All registrations are subject to verification" in raw_terms:
        terms = DEFAULT_TERMS
    else:
        terms = raw_terms

    include_default = reg_settings.get("include_default_faqs", True)
    custom_faqs = reg_settings.get("faqs", [])
    
    if not custom_faqs or (len(custom_faqs) <= 4 and any("registration fee include" in f.get("q", "").lower() for f in custom_faqs)):
        faqs = DEFAULT_FAQS
    elif include_default:
        existing_questions = {f.get("q", "").strip().lower() for f in custom_faqs}
        faqs = list(custom_faqs)
        for df in DEFAULT_FAQS:
            if df["q"].strip().lower() not in existing_questions:
                faqs.append(df)
    else:
        faqs = custom_faqs

    # Dynamic live stats calculation from database (if organizer hasn't overridden with custom stats)
    custom_stats = reg_settings.get("stats")
    if custom_stats and isinstance(custom_stats, list) and len(custom_stats) > 0:
        stats_to_return = custom_stats
    else:
        from app.modules.agenda.models import Session as AgendaSessionModel, Track as AgendaTrackModel
        from app.modules.events.models.speaker import Speaker as SpeakerModel

        days_count = 1
        if event.start_date and event.end_date:
            try:
                days_count = max(1, (event.end_date - event.start_date).days + 1)
            except Exception:
                days_count = 1

        track_count = (await db.execute(
            select(func.count(AgendaTrackModel.id)).where(AgendaTrackModel.event_id == event_id)
        )).scalar() or 0

        session_count = (await db.execute(
            select(func.count(AgendaSessionModel.id)).where(
                AgendaSessionModel.event_id == event_id,
                AgendaSessionModel.deleted_at.is_(None)
            )
        )).scalar() or 0

        speaker_count = (await db.execute(
            select(func.count(SpeakerModel.id)).where(
                SpeakerModel.event_id == event_id,
                SpeakerModel.deleted_at.is_(None)
            )
        )).scalar() or 0

        stats_to_return = [
            {"label": f"{days_count} {'Day' if days_count == 1 else 'Days'} Conference", "icon": "calendar"}
        ]
        if track_count > 0:
            stats_to_return.append({"label": f"{track_count} {'Track' if track_count == 1 else 'Tracks'}", "icon": "tracks"})
        if session_count > 0:
            stats_to_return.append({"label": f"{session_count} {'Session' if session_count == 1 else 'Sessions'}", "icon": "sessions"})
        if speaker_count > 0:
            stats_to_return.append({"label": f"{speaker_count} {'Speaker' if speaker_count == 1 else 'Speakers'}", "icon": "speakers"})

    pts = event.portal_theme_setting
    primary_color = (pts.primary_color if pts and pts.primary_color else None) or event.theme_color or "#6366F1"
    secondary_color = (pts.secondary_color if pts and pts.secondary_color else None) or "#A855F7"
    theme_preset = (pts.theme_preset if pts and pts.theme_preset else None) or "dark-luxury"
    svg_pattern = (pts.svg_pattern if pts and pts.svg_pattern else None) or "glow-wave"
    dark_mode_default = pts.dark_mode_default if pts and pts.dark_mode_default is not None else True
    font_family = (pts.font_family if pts and pts.font_family else None) or "Inter"
    custom_css = (pts.custom_css if pts and pts.custom_css else "") or ""
    program_url = (pts.program_url if pts and pts.program_url else "") or reg_settings.get("program_url") or ""
    speaker_guidelines_url = (pts.speaker_guidelines_url if pts and pts.speaker_guidelines_url else "") or reg_settings.get("speaker_guidelines_url") or ""
    presentation_template_url = (pts.presentation_template_url if pts and pts.presentation_template_url else "") or reg_settings.get("presentation_template_url") or ""
    support_email = (pts.support_email if pts and pts.support_email else "") or reg_settings.get("support_email") or event.support_email or "support@eventos.io"
    support_phone = (pts.support_phone if pts and pts.support_phone else "") or reg_settings.get("support_phone") or event.support_phone or ""
    additional_contacts = (pts.additional_contacts if pts and pts.additional_contacts else []) or reg_settings.get("additional_contacts") or []

    bg_mode = (pts.extra_settings.get("bg_mode") if pts and pts.extra_settings else None) or reg_settings.get("bg_mode") or "pattern"
    bg_image_url = (pts.extra_settings.get("bg_image_url") if pts and pts.extra_settings else None) or reg_settings.get("bg_image_url") or ""
    bg_blur = (pts.extra_settings.get("bg_blur") if pts and pts.extra_settings and "bg_blur" in pts.extra_settings else None) if (pts and pts.extra_settings and "bg_blur" in pts.extra_settings) else reg_settings.get("bg_blur", 0)
    bg_overlay_opacity = (pts.extra_settings.get("bg_overlay_opacity") if pts and pts.extra_settings and "bg_overlay_opacity" in pts.extra_settings else None) if (pts and pts.extra_settings and "bg_overlay_opacity" in pts.extra_settings) else reg_settings.get("bg_overlay_opacity", 0.4)
    bg_solid_color = (pts.extra_settings.get("bg_solid_color") if pts and pts.extra_settings else None) or reg_settings.get("bg_solid_color") or "#000000"

    return {
        "event_name": event.name,
        "short_code": event.short_code or "",
        "theme_color": primary_color,
        "primary_color": primary_color,
        "secondary_color": secondary_color,
        "theme_preset": theme_preset,
        "svg_pattern": svg_pattern,
        "dark_mode_default": dark_mode_default,
        "font_family": font_family,
        "custom_css": custom_css,
        "bg_mode": bg_mode,
        "bg_image_url": bg_image_url,
        "bg_blur": bg_blur,
        "bg_overlay_opacity": bg_overlay_opacity,
        "bg_solid_color": bg_solid_color,
        "tagline": reg_settings.get("tagline") or (pts.tagline if pts else "") or "",
        "description": event.description or reg_settings.get("description") or (pts.hero_description if pts else "") or "",
        "stats": stats_to_return,
        "theme_config": {
            "preset": theme_preset,
            "primary_color": primary_color,
            "secondary_color": secondary_color,
            "dark_mode_default": dark_mode_default,
            "svg_pattern": svg_pattern,
            "font_family": font_family,
            "custom_css": custom_css,
            "bg_mode": bg_mode,
            "bg_image_url": bg_image_url,
            "bg_blur": bg_blur,
            "bg_overlay_opacity": bg_overlay_opacity,
            "bg_solid_color": bg_solid_color,
        },
        "program_url": program_url,
        "speaker_guidelines_url": speaker_guidelines_url,
        "presentation_template_url": presentation_template_url,
        "support_email": support_email,
        "support_phone": support_phone,
        "additional_contacts": additional_contacts,
        "logo_url": event.logo_url or (pts.logo_url if pts else None),
        "banner_url": (pts.banner_url if pts else None),
        "favicon_url": (pts.favicon_url if pts else None),
        "is_live": is_live,
        "fields": fields_copy,
        "currency": event.currency or "INR",
        "payment_enabled": payment_enabled,
        "coupon_enabled": coupon_enabled,
        "uploads_enabled": uploads_enabled,
        "active_gateway": active_gateway,
        "stripe_publishable_key": stripe_pub_key,
        "active_tier": active_tier,
        "active_prices": active_prices,
        "tier_cutoffs": reg_settings.get("tier_cutoffs", {}),
        "tier_schedules": reg_settings.get("tier_schedules", {}),
        "terms_and_conditions": terms,
        "faqs": faqs,
        "include_default_faqs": include_default,
        "branding_settings": event.branding_settings,
        "registration_settings": reg_settings,
        "start_date": event.start_date,
        "end_date": event.end_date,
        "location": event.location,
        "venue_name": event.venue_name,
        "state": event.state,
        "country": event.country,
        "organizer_name": event.organizer_name
    }


@router.post("/portal/registration/{event_id}/register")
async def public_register_participant(
    event_id: uuid.UUID,
    payload: Dict[str, Any],
    db: AsyncSession = Depends(get_db)
):
    # 1. Fetch form config and check if registration is live
    config_stmt = select(RegistrationFormConfig).where(RegistrationFormConfig.event_id == event_id)
    config_result = await db.execute(config_stmt)
    config = config_result.scalar_one_or_none()

    if not config or not config.is_live:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registration is currently closed for this event."
        )

    # 2. Validate event exists
    event_stmt = select(Event).where(Event.id == event_id)
    event_result = await db.execute(event_stmt)
    event = event_result.scalar_one_or_none()
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found."
        )
    await enforce_event_operation(db, event.organization_id, event.id, "registration.submit")

    # 3. Check email presence and verify duplicate / merging logic
    email_val = payload.get("email", "").strip()
    first_name_val = payload.get("first_name", "").strip()
    last_name_val = payload.get("last_name", "").strip()
    name_val = payload.get("name", "").strip()
    if not first_name_val and not last_name_val and name_val:
        parts = name_val.split(" ", 1)
        first_name_val = parts[0]
        last_name_val = parts[1] if len(parts) > 1 else ""
    elif not name_val:
        name_val = f"{first_name_val} {last_name_val}".strip()

    phone_val = payload.get("phone", "").strip()
    confirm_merge = payload.get("confirm_merge", False)
    if email_val:
        merged_participant = await verify_and_resolve_registration(
            db=db,
            event_id=event_id,
            email=email_val,
            name=name_val,
            phone=phone_val,
            confirm_merge=confirm_merge
        )
        if merged_participant:
            return {
                "status": "approved",
                "message": "Profiles successfully merged! Your registration is verified.",
                "regno": merged_participant.regno or "",
                "name": merged_participant.name,
                "role": merged_participant.role
            }

    # 3.5 Validate the role/category belongs to active roles and is not in disabled categories
    from app.modules.registration.models.participant_role import ParticipantRole
    roles_stmt = select(ParticipantRole).where(
        ParticipantRole.event_id == event_id
    )
    roles_res = await db.execute(roles_stmt)
    roles = roles_res.scalars().all()

    if not roles:
        from app.modules.registration.routers.participant_roles import seed_default_roles
        await seed_default_roles(event_id, db)
        roles_res = await db.execute(roles_stmt)
        roles = roles_res.scalars().all()

    reg_settings = event.registration_settings or {}
    disabled_categories = reg_settings.get("disabled_categories", [])

    allowed_roles = [
        r.name for r in roles
        if r.is_active and r.category not in disabled_categories
    ]

    submitted_role = payload.get("role", "").strip()
    if not submitted_role:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registration category (role) is required."
        )

    if submitted_role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Registration category '{submitted_role}' is not available for this event."
        )

    # 4. Validate and map form submissions into default fields and custom fields
    import re
    default_fields = ["name", "first_name", "last_name", "email", "phone", "company", "designation", "country", "state", "role"]
    state_input = str(payload.get("state") or payload.get("country_state") or "").strip() or None
    participant_data: Dict[str, Any] = {
        "event_id": event_id,
        "name": name_val or "Unnamed Participant",
        "first_name": first_name_val,
        "last_name": last_name_val,
        "email": email_val or None,
        "phone": phone_val or None,
        "company": payload.get("company", "").strip() or None,
        "designation": payload.get("designation", "").strip() or None,
        "country": payload.get("country", "").strip() or None,
        "state": state_input,
        "role": payload.get("role", "Delegate").strip(),
        "paid_status": "Unpaid",
        "source": "public_portal",
        "custom_fields": {}
    }

    form_fields = [
        f for f in (config.fields or DEFAULT_FIELDS)
        if not (f.get("is_default") and (f.get("id") in REMOVED_DEFAULT_IDS or f.get("name") in REMOVED_DEFAULT_IDS))
    ]
    
    # Validation Loop
    for field in form_fields:
        field_id = field.get("id")
        field_type = field.get("type", "text")
        field_label = field.get("label", field_id)
        is_required = field.get("is_required", False)
        is_active = field.get("is_active", True)
        
        if not is_active:
            continue
            
        val = payload.get(field_id)
        
        # Check requirement
        if is_required:
            if val is None or (isinstance(val, str) and not val.strip()) or (isinstance(val, list) and not val):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Field '{field_label}' is required."
                )
        
        # Format validation for non-empty string values
        if val is not None and isinstance(val, str) and val.strip():
            stripped_val = val.strip()
            
            # Email validation
            if field_type == "email" or field_id == "email":
                email_regex = r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"
                if not re.match(email_regex, stripped_val):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Field '{field_label}' must be a valid email address."
                    )
            
            # Phone validation
            elif field_type == "phone" or field_id == "phone":
                phone_regex = r"^\+?[0-9\s\-()]{7,20}$"
                if not re.match(phone_regex, stripped_val):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Field '{field_label}' must be a valid phone number."
                    )
            
            # Country and dynamic state validation
            elif field_type == "country" or field_id == "country":
                allowed_countries = [
                    str(country).strip()
                    for country in (field.get("options") or [])
                    if str(country).strip()
                ]
                if allowed_countries and stripped_val not in allowed_countries:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Selected country '{stripped_val}' for '{field_label}' is not allowed for this event."
                    )
                
                # Check for country's state input
                state_key = f"{field_id}_state"
                state_val = str(payload.get(state_key) or "").strip()
                if not state_val and is_required:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"State/Province is required for country '{stripped_val}'."
                    )

    # Gather custom fields and state keys
    for field in form_fields:
        field_id = field.get("id")
        field_type = field.get("type", "text")
        
        # Capture state if country type
        if field_type == "country" or field_id == "country":
            state_key = f"{field_id}_state"
            if state_key in payload:
                participant_data["custom_fields"][state_key] = payload.get(state_key)
                
        if field_id not in default_fields:
            val = payload.get(field_id)
            participant_data["custom_fields"][field_id] = val

    # Check event capacity
    q_rule = select(CapacityRule).where(
        CapacityRule.event_id == event_id,
        CapacityRule.session_id.is_(None),
        CapacityRule.room_id.is_(None)
    )
    rule = (await db.execute(q_rule)).scalar_one_or_none()

    # Get current approved count (participants registered)
    q_count = select(func.count(Participant.id)).where(Participant.event_id == event_id)
    current_approved = (await db.execute(q_count)).scalar() or 0

    status_str = "submitted"
    waitlist_pos = None

    if rule and current_approved >= rule.capacity:
        if rule.waitlist_enabled:
            status_str = "waitlisted"
            # Determine next waitlist position
            q_wl = select(func.max(ParticipantRegistration.waitlist_position)).where(
                ParticipantRegistration.event_id == event_id,
                ParticipantRegistration.registration_status == "waitlisted"
            )
            max_pos = (await db.execute(q_wl)).scalar()
            waitlist_pos = (max_pos or 0) + 1
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This event is at full capacity and waitlisting is disabled."
            )

    registration_data = {
        "name": participant_data["name"],
        "first_name": participant_data["first_name"],
        "last_name": participant_data["last_name"],
        "email": participant_data["email"],
        "phone": participant_data["phone"],
        "company": participant_data["company"],
        "designation": participant_data["designation"],
        "country": participant_data["country"],
        "state": participant_data["state"],
        "role": participant_data["role"],
        "custom_fields": participant_data["custom_fields"]
    }

    reg = ParticipantRegistration(
        event_id=event_id,
        registration_status=status_str,
        registration_data=registration_data,
        approval_source="portal",
        waitlist_position=waitlist_pos
    )
    db.add(reg)
    await db.flush()
    await MeteringService.record(db, organization_id=event.organization_id, event_id=event.id, metric_key="registration_submissions", quantity=1, unit="count", source="registration.portal.register", idempotency_key=f"registration-submit:{reg.id}", metadata={"registration_id": str(reg.id), "status": status_str})
    await db.commit()
    await db.refresh(reg)

    if status_str == "waitlisted":
        return {
            "status": "waitlisted",
            "message": "The event is at capacity. You have been added to the waitlist.",
            "regno": "",
            "name": reg.registration_data.get("name"),
            "role": reg.registration_data.get("role"),
            "waitlist_position": reg.waitlist_position
        }
    else:
        return {
            "status": "submitted",
            "message": "Registration submitted successfully! Your registration is pending review.",
            "regno": "",
            "name": reg.registration_data.get("name"),
            "role": reg.registration_data.get("role")
        }


@router.post("/portal/registration/{event_id}/upload")
async def public_registration_upload(
    event_id: uuid.UUID,
    file: UploadFile = File(...),
    field_name: Optional[str] = Form(None),
    regno: Optional[str] = Form(None),
    username: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
):
    """
    Public upload endpoint for files/images in custom fields.
    Returns direct URL.
    """
    # 1. Read bytes
    try:
        contents = await file.read()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not read upload file: {str(e)}"
        )

    event = await db.scalar(select(Event).where(Event.id == event_id))
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    await enforce_event_operation(
        db,
        event.organization_id,
        event.id,
        "registration.forms.manage",
    )

    request_fingerprint = hashlib.sha256(
        b"|".join(
            [
                str(event_id).encode(),
                (field_name or "").encode(),
                (regno or "").encode(),
                (username or "").encode(),
                (file.filename or "").encode(),
                contents,
            ]
        )
    ).hexdigest()
    reservation_key = f"registration-upload:{idempotency_key}"
    existing_reservation = await db.scalar(
        select(UsageReservation).where(
            UsageReservation.organization_id == event.organization_id,
            UsageReservation.idempotency_key == reservation_key,
        )
    )
    if existing_reservation and existing_reservation.status == "CONSUMED":
        metadata = existing_reservation.metadata_json or {}
        if metadata.get("request_fingerprint") != request_fingerprint:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "IDEMPOTENCY_CONFLICT"},
            )
        return {
            "status": "success",
            "url": metadata["url"],
            "filename": metadata["filename"],
        }

    # 2. Query event to get event name
    import re

    def sanitize_path_part(text: str, is_file: bool = False) -> str:
        if not text:
            return "default"
        pattern = r'[^A-Za-z0-9\-\.]+' if is_file else r'[^A-Za-z0-9\-]+'
        cleaned = re.sub(pattern, '_', text.strip())
        return cleaned.strip('_')

    event_name_clean = sanitize_path_part(event.name) if event else str(event_id)
    field_folder = sanitize_path_part(field_name).lower() if field_name else "general"

    r_part = sanitize_path_part(regno).upper() if regno else ""
    u_part = sanitize_path_part(username).upper() if username else ""

    if r_part and u_part:
        base_filename = f"{r_part}_{u_part}"
    elif r_part:
        base_filename = r_part
    elif u_part:
        base_filename = u_part
    else:
        base_filename = str(uuid.uuid5(uuid.NAMESPACE_URL, reservation_key))

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "bin"
    stored_filename = f"{base_filename}.{ext}"
    storage_path = f"{event_name_clean}/registration_upload/{field_folder}/{stored_filename}"
    if settings.STORAGE_MODE == "local":
        url = f"{settings.API_BASE_URL}{settings.api_v1_prefix}/storage/registration_uploads/{storage_path}"
    else:
        url = upload_service.create_presigned_download(
            bucket="registration_uploads",
            storage_path=storage_path,
            expiry_seconds=31536000,
        )

    reservation = await UsageReservationService.reserve(
        db,
        organization_id=event.organization_id,
        event_id=event.id,
        limit_key="storage_quota_mb",
        quantity=max(1, (len(contents) + 1024 * 1024 - 1) // (1024 * 1024)),
        unit="megabyte",
        idempotency_key=reservation_key,
        metadata={
            "request_fingerprint": request_fingerprint,
            "storage_path": storage_path,
            "filename": file.filename,
            "url": url,
            "consumption_quantity": len(contents),
            "consumption_unit": "bytes",
        },
    )

    # 3. Upload bytes to S3 or local bucket 'registration_uploads'
    bucket = "registration_uploads"
    try:
        upload_service.upload_bytes(
            bucket=bucket,
            storage_path=storage_path,
            data=contents,
            content_type=file.content_type or "application/octet-stream"
        )
    except Exception as e:
        await UsageReservationService.release(db, reservation.id)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Storage upload failed: {str(e)}"
        )

    # 4. Construct accessibility URL
    await UsageReservationService.consume(
        db,
        reservation.id,
        source="registration.portal.upload",
    )
    await db.commit()

    return {
        "status": "success",
        "url": url,
        "filename": file.filename
    }


# ── Payments & Promo Codes Public Endpoints ──

class PromoValidateRequest(BaseModel):
    code: str
    role: str


class CheckoutRequest(BaseModel):
    formData: Dict[str, Any]
    promo_code: Optional[str] = None
    redirect_base_url: str
    confirm_merge: Optional[bool] = False


class PaymentVerifyRequest(BaseModel):
    gateway: str
    session_id: Optional[str] = None
    razorpay_order_id: Optional[str] = None
    razorpay_payment_id: Optional[str] = None
    razorpay_signature: Optional[str] = None


@router.post("/portal/registration/{event_id}/promo/validate")
async def validate_public_promo(
    event_id: uuid.UUID,
    payload: PromoValidateRequest,
    db: AsyncSession = Depends(get_db)
):
    event_stmt = select(Event).where(Event.id == event_id)
    event = (await db.execute(event_stmt)).scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    await enforce_event_operation(db, event.organization_id, event.id, "registration.coupons.manage")
    code_upper = payload.code.strip().upper()
    promo_stmt = select(PromoCode).where(
        PromoCode.event_id == event_id,
        PromoCode.code == code_upper
    )
    promo = (await db.execute(promo_stmt)).scalar_one_or_none()
    
    if not promo:
        raise HTTPException(status_code=400, detail="Invalid promo code.")
        
    if not promo.is_active:
        raise HTTPException(status_code=400, detail="Promo code is inactive.")
        
    if promo.expiry_date and promo.expiry_date < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Promo code has expired.")
        
    if promo.max_uses is not None and promo.used_count >= promo.max_uses:
        raise HTTPException(status_code=400, detail="Promo code usage limit reached.")
        
    # Resolve base price
    active_tier = get_active_tier(event)
    base_price = await get_ticket_price(db, event_id, payload.role, active_tier)
    
    if base_price is None:
        raw_prices = await get_active_prices_for_event(db, event)
        base_price = float(raw_prices.get(payload.role, 0.0))
        
    discount = 0.0
    if promo.discount_type == "percentage":
        discount = base_price * (promo.discount_value / 100.0)
    elif promo.discount_type == "fixed":
        discount = promo.discount_value
        
    discount = min(discount, base_price)
    total = base_price - discount
    
    return {
        "valid": True,
        "code": promo.code,
        "discount_type": promo.discount_type,
        "discount_value": promo.discount_value,
        "base_price": base_price,
        "discount_amount": discount,
        "total_price": total,
        "promo_code_id": str(promo.id)
    }


@router.post("/portal/registration/{event_id}/payment/checkout")
async def public_checkout_payment(
    event_id: uuid.UUID,
    payload: CheckoutRequest,
    db: AsyncSession = Depends(get_db)
):
    # 1. Fetch form config and check if live
    config_stmt = select(RegistrationFormConfig).where(RegistrationFormConfig.event_id == event_id)
    config = (await db.execute(config_stmt)).scalar_one_or_none()
    if not config or not config.is_live:
        raise HTTPException(status_code=400, detail="Registration is closed.")
        
    # 2. Fetch event
    event_stmt = select(Event).where(Event.id == event_id)
    event = (await db.execute(event_stmt)).scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    await enforce_event_operation(db, event.organization_id, event.id, "registration.submit")
    capabilities = await _public_capability_result(db, event)
        
    reg_settings = event.registration_settings or {}
    payment_configured = bool(reg_settings.get("payment_enabled", False))
    payment_enabled = payment_configured and bool(
        capabilities["features"].get("FEAT_PAYMENT_GATEWAY", {}).get("enabled")
    )
    active_gateway = reg_settings.get("active_gateway", "simulated")
    # A commercially disabled payment feature must never silently turn a paid
    # event into a free registration.  The operation gate returns the stable
    # entitlement denial used by the public capability response.
    if payment_configured:
        await enforce_event_operation(db, event.organization_id, event.id, "registration.payments.manage")
    if payload.promo_code:
        await enforce_event_operation(db, event.organization_id, event.id, "registration.coupons.manage")
    
    # Check duplicate email and verify merging logic
    email_val = payload.formData.get("email", "").strip()
    first_name_val = payload.formData.get("first_name", "").strip()
    last_name_val = payload.formData.get("last_name", "").strip()
    name_val = payload.formData.get("name", "").strip()
    if not first_name_val and not last_name_val and name_val:
        parts = name_val.split(" ", 1)
        first_name_val = parts[0]
        last_name_val = parts[1] if len(parts) > 1 else ""
    elif not name_val:
        name_val = f"{first_name_val} {last_name_val}".strip()

    phone_val = payload.formData.get("phone", "").strip()
    confirm_merge = payload.confirm_merge or False
    if email_val:
        merged_participant = await verify_and_resolve_registration(
            db=db,
            event_id=event_id,
            email=email_val,
            name=name_val,
            phone=phone_val,
            confirm_merge=confirm_merge
        )
        if merged_participant:
            return {
                "checkout_required": False,
                "status": "approved",
                "message": "Profiles successfully merged! Your registration is verified.",
                "regno": merged_participant.regno or "",
                "name": merged_participant.name,
                "role": merged_participant.role
            }
            
    # Resolve Price
    role = payload.formData.get("role", "").strip()
    if not role:
        raise HTTPException(status_code=400, detail="Role/Category is required.")
        
    base_price = 0.0
    discount_applied = 0.0
    total_price = 0.0
    promo_code_obj = None
    
    if payment_enabled:
        active_tier = get_active_tier(event)
        price_val = await get_ticket_price(db, event_id, role, active_tier)
        if price_val is not None:
            base_price = price_val
            total_price = price_val
            
            # Apply promo code if present
            if payload.promo_code:
                code_upper = payload.promo_code.strip().upper()
                promo_stmt = select(PromoCode).where(
                    PromoCode.event_id == event_id,
                    PromoCode.code == code_upper
                )
                promo_code_obj = (await db.execute(promo_stmt)).scalar_one_or_none()
                if promo_code_obj and promo_code_obj.is_active:
                    valid = True
                    if promo_code_obj.expiry_date and promo_code_obj.expiry_date < datetime.now(timezone.utc):
                        valid = False
                    if promo_code_obj.max_uses is not None and promo_code_obj.used_count >= promo_code_obj.max_uses:
                        valid = False
                        
                    if valid:
                        if promo_code_obj.discount_type == "percentage":
                            discount_applied = base_price * (promo_code_obj.discount_value / 100.0)
                        elif promo_code_obj.discount_type == "fixed":
                            discount_applied = promo_code_obj.discount_value
                            
                        discount_applied = min(discount_applied, base_price)
                        total_price = base_price - discount_applied

    # Check capacity rules
    q_count = select(func.count(Participant.id)).where(Participant.event_id == event_id)
    current_approved = (await db.execute(q_count)).scalar() or 0
    
    q_rule = select(CapacityRule).where(
        CapacityRule.event_id == event_id,
        CapacityRule.session_id.is_(None),
        CapacityRule.room_id.is_(None)
    )
    rule = (await db.execute(q_rule)).scalar_one_or_none()
    
    status_str = "pending_payment" if payment_enabled and total_price > 0 else "submitted"
    waitlist_pos = None
    
    if rule and current_approved >= rule.capacity:
        if rule.waitlist_enabled:
            status_str = "waitlisted"
            q_wl = select(func.max(ParticipantRegistration.waitlist_position)).where(
                ParticipantRegistration.event_id == event_id,
                ParticipantRegistration.registration_status == "waitlisted"
            )
            max_pos = (await db.execute(q_wl)).scalar()
            waitlist_pos = (max_pos or 0) + 1
        else:
            raise HTTPException(status_code=400, detail="Event is at capacity.")
            
    # Setup registration data
    custom_fields = dict(payload.formData.get("custom_fields", {}))
    if config:
        form_fields = config.fields
        default_fields = {"name", "first_name", "last_name", "email", "phone", "company", "designation", "country", "role"}
        for field in form_fields:
            field_id = field.get("id")
            field_type = field.get("type", "text")
            
            if field_type == "country" or field_id == "country":
                state_key = f"{field_id}_state"
                if state_key in payload.formData:
                    custom_fields[state_key] = payload.formData.get(state_key)
                elif state_key in payload.formData.get("custom_fields", {}):
                    custom_fields[state_key] = payload.formData.get("custom_fields", {}).get(state_key)
                    
            if field_id not in default_fields:
                if field_id in payload.formData:
                    custom_fields[field_id] = payload.formData.get(field_id)

    registration_data = {
        "name": name_val or "Unnamed Participant",
        "first_name": first_name_val,
        "last_name": last_name_val,
        "email": email_val or None,
        "phone": phone_val or None,
        "company": payload.formData.get("company", "").strip() or None,
        "designation": payload.formData.get("designation", "").strip() or None,
        "country": payload.formData.get("country", "").strip() or None,
        "role": role,
        "custom_fields": custom_fields,
        "paid_status": "Unpaid" if (payment_enabled and total_price > 0) else "Paid"
    }
    
    reg = ParticipantRegistration(
        event_id=event_id,
        registration_status=status_str,
        registration_data=registration_data,
        approval_source="portal",
        waitlist_position=waitlist_pos
    )
    db.add(reg)
    await db.flush()  # get reg.id
    await MeteringService.record(db, organization_id=event.organization_id, event_id=event.id, metric_key="registration_submissions", quantity=1, unit="count", source="registration.portal.checkout", idempotency_key=f"registration-submit:{reg.id}", metadata={"registration_id": str(reg.id), "status": status_str})
    
    # If waitlisted or free checkout
    if status_str == "waitlisted":
        await db.commit()
        return {
            "checkout_required": False,
            "status": "waitlisted",
            "message": "The event is at capacity. You have been added to the waitlist.",
            "regno": "",
            "name": reg.registration_data["name"],
            "role": reg.registration_data["role"],
            "waitlist_position": reg.waitlist_position
        }
        
    if not payment_enabled or total_price <= 0:
        auto_approve = reg_settings.get("auto_approve_paid", True)
        if auto_approve:
            reg.registration_data = {**reg.registration_data, "paid_status": "Paid"}
            tx = PaymentTransaction(
                event_id=event_id,
                registration_id=reg.id,
                amount=0.0,
                currency=event.currency or "INR",
                status="completed",
                payment_method="simulated",
                discount_applied=discount_applied,
                promo_code_id=promo_code_obj.id if promo_code_obj else None
            )
            db.add(tx)
            
            reviewer_id = event.created_by
            if not reviewer_id:
                from app.modules.identity.models.user import User
                stmt_user = select(User.id).limit(1)
                reviewer_id = (await db.execute(stmt_user)).scalar()
                
            await helper_approve_registration(db, reg, reviewer_id, "Auto-approved (Free)")
            await db.commit()
            
            # Fetch participant regno
            await db.refresh(reg)
            part_stmt = select(Participant).where(Participant.id == reg.participant_id)
            part = (await db.execute(part_stmt)).scalar_one_or_none()
            regno = part.regno if part else ""
            
            return {
                "checkout_required": False,
                "status": "approved",
                "message": "Registration successful!",
                "regno": regno,
                "name": reg.registration_data["name"],
                "role": reg.registration_data["role"]
            }
        else:
            await db.commit()
            return {
                "checkout_required": False,
                "status": "submitted",
                "message": "Registration submitted successfully! Pending review.",
                "regno": "",
                "name": reg.registration_data["name"],
                "role": reg.registration_data["role"]
            }
            
    # Create Payment transaction
    tx = PaymentTransaction(
        event_id=event_id,
        registration_id=reg.id,
        amount=total_price,
        currency=event.currency or "INR",
        status="pending",
        payment_method=active_gateway,
        discount_applied=discount_applied,
        promo_code_id=promo_code_obj.id if promo_code_obj else None
    )
    db.add(tx)
    await db.flush()
    
    # Create Gateway Order
    try:
        checkout_details = await PaymentService.create_order(
            event=event,
            registration=reg,
            amount=total_price,
            currency=event.currency or "INR",
            gateway=active_gateway,
            redirect_base_url=payload.redirect_base_url
        )
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to initialize payment gateway: {str(e)}")
        
    tx.gateway_order_id = checkout_details.get("gateway_order_id")
    await db.commit()
    
    return {
        "checkout_required": True,
        "payment_details": checkout_details,
        "transaction_id": str(tx.id),
        "registration_id": str(reg.id)
    }


@router.post("/portal/registration/{event_id}/payment/verify")
async def verify_public_payment(
    event_id: uuid.UUID,
    payload: PaymentVerifyRequest,
    db: AsyncSession = Depends(get_db)
):
    event_stmt = select(Event).where(Event.id == event_id)
    event = (await db.execute(event_stmt)).scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    await enforce_event_operation(db, event.organization_id, event.id, "registration.payments.manage")
        
    reg_settings = event.registration_settings or {}
    
    gateway = payload.gateway
    gateway_order_id = None
    if gateway == "stripe":
        gateway_order_id = payload.session_id
    elif gateway == "razorpay":
        gateway_order_id = payload.razorpay_order_id
    elif gateway == "simulated":
        gateway_order_id = payload.session_id
        
    if not gateway_order_id:
        raise HTTPException(status_code=400, detail="Missing checkout session / order details.")
        
    tx_stmt = select(PaymentTransaction).where(
        PaymentTransaction.event_id == event_id,
        PaymentTransaction.gateway_order_id == gateway_order_id
    )
    tx = (await db.execute(tx_stmt)).scalar_one_or_none()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found.")
        
    if tx.status == "completed":
        reg_stmt = select(ParticipantRegistration).where(ParticipantRegistration.id == tx.registration_id)
        reg = (await db.execute(reg_stmt)).scalar_one_or_none()
        
        regno = ""
        if reg and reg.participant_id:
            part_stmt = select(Participant).where(Participant.id == reg.participant_id)
            part = (await db.execute(part_stmt)).scalar_one_or_none()
            regno = part.regno if part else ""
            
        return {
            "status": "success",
            "message": "Payment verified successfully!",
            "regno": regno,
            "name": reg.registration_data["name"] if reg else "",
            "role": reg.registration_data["role"] if reg else ""
        }
        
    try:
        verification = await PaymentService.verify_payment(
            event=event,
            gateway=gateway,
            payload=payload.model_dump()
        )
    except Exception as e:
        tx.status = "failed"
        reg_stmt = select(ParticipantRegistration).where(ParticipantRegistration.id == tx.registration_id)
        reg = (await db.execute(reg_stmt)).scalar_one_or_none()
        if reg:
            reg.registration_status = "failed"
            reg.registration_data = {
                **reg.registration_data,
                "paid_status": "Failed",
                "payment_error": str(e)
            }
        await db.commit()
        raise HTTPException(status_code=400, detail=f"Payment verification failed: {str(e)}")
        
    if not verification.get("success"):
        tx.status = "failed"
        reg_stmt = select(ParticipantRegistration).where(ParticipantRegistration.id == tx.registration_id)
        reg = (await db.execute(reg_stmt)).scalar_one_or_none()
        if reg:
            reg.registration_status = "failed"
            reg.registration_data = {
                **reg.registration_data,
                "paid_status": "Failed",
                "payment_error": verification.get("error", "Payment verification not successful"),
                "payment_details": verification.get("details", {})
            }
        await db.commit()
        raise HTTPException(status_code=400, detail="Payment has not been completed.")
        
    tx.status = "completed"
    tx.gateway_payment_id = verification.get("gateway_payment_id")
    
    if tx.promo_code_id:
        promo_stmt = select(PromoCode).where(PromoCode.id == tx.promo_code_id)
        promo = (await db.execute(promo_stmt)).scalar_one_or_none()
        if promo:
            promo.used_count += 1
            
    reg_stmt = select(ParticipantRegistration).where(ParticipantRegistration.id == tx.registration_id)
    reg = (await db.execute(reg_stmt)).scalar_one_or_none()
    if not reg:
        raise HTTPException(status_code=404, detail="Registration record not found.")
        
    reg.registration_data = {
        **reg.registration_data,
        "paid_status": "Paid",
        "payment_details": verification.get("details", {})
    }
    
    auto_approve = reg_settings.get("auto_approve_paid", True)
    regno = ""
    
    if reg.registration_status == "approved" or auto_approve:
        if reg.participant_id:
            # Already approved, update participant status to Paid and generate regno
            part_stmt = select(Participant).where(Participant.id == reg.participant_id)
            part = (await db.execute(part_stmt)).scalar_one_or_none()
            if part:
                part.paid_status = "Paid"
                part.custom_fields = {
                    **(part.custom_fields or {}),
                    "payment_details": verification.get("details", {})
                }
                if not part.regno:
                    from app.modules.registration.routers.registrations import generate_next_regno
                    part.regno = await generate_next_regno(db, event_id, part.role)
                regno = part.regno
        else:
            reviewer_id = event.created_by
            if not reviewer_id:
                from app.modules.identity.models.user import User
                stmt_user = select(User.id).limit(1)
                reviewer_id = (await db.execute(stmt_user)).scalar()
                
            await helper_approve_registration(db, reg, reviewer_id, f"Auto-approved (Paid via {gateway})")
            
            await db.flush()
            part_stmt = select(Participant).where(Participant.id == reg.participant_id)
            part = (await db.execute(part_stmt)).scalar_one_or_none()
            if part:
                part.custom_fields = {
                    **(part.custom_fields or {}),
                    "payment_details": verification.get("details", {})
                }
                regno = part.regno
            
        status_result = "approved"
        message_result = "Registration successful! Welcome aboard."
    else:
        reg.registration_status = "submitted"
        status_result = "submitted"
        message_result = "Payment verified successfully! Registration is pending review."
        
    await db.commit()
    
    return {
        "status": status_result,
        "message": message_result,
        "regno": regno,
        "name": reg.registration_data["name"],
        "role": reg.registration_data["role"]
    }

