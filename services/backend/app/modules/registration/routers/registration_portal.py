import uuid
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Response, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.dependencies import get_db, get_current_event, CurrentEvent
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

router = APIRouter(tags=["registration_portal"])

DEFAULT_FIELDS = [
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
        "is_required": False,
        "is_active": True,
        "placeholder": "Enter your phone number"
    },
    {
        "id": "company",
        "name": "company",
        "label": "Company/Affiliation",
        "type": "text",
        "is_default": True,
        "is_required": False,
        "is_active": True,
        "placeholder": "Enter your company name"
    },
    {
        "id": "designation",
        "name": "designation",
        "label": "Job Title/Designation",
        "type": "text",
        "is_default": True,
        "is_required": False,
        "is_active": True,
        "placeholder": "Enter your job title"
    },
    {
        "id": "country",
        "name": "country",
        "label": "Country",
        "type": "country",
        "is_default": True,
        "is_required": False,
        "is_active": True,
        "placeholder": "Select your country"
    },
    {
        "id": "role",
        "name": "role",
        "label": "Registration Category",
        "type": "select",
        "is_default": True,
        "is_required": True,
        "is_active": True,
        "placeholder": "Select your category",
        "options": ["Delegate", "VIP", "Speaker", "Faculty"]
    }
]

from app.services.template_defaults import get_default_registration_terms, get_default_registration_faqs

DEFAULT_TERMS = get_default_registration_terms()
DEFAULT_FAQS = get_default_registration_faqs()


# ── Organizer Endpoints ───────────────────────────────────────────

@router.get("/events/{event_id}/registration/form-config", response_model=RegistrationFormConfigResponse)
async def get_registration_form_config(
    event: CurrentEvent,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    """
    Get the registration form configuration for the event.
    Creates a default configuration if none exists.
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
            is_live=False,
            fields=DEFAULT_FIELDS
        )
        db.add(config)
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
    Update the registration form configuration for the event.
    """
    stmt = select(RegistrationFormConfig).where(RegistrationFormConfig.event_id == event.id)
    result = await db.execute(stmt)
    config = result.scalar_one_or_none()

    if not config:
        config = RegistrationFormConfig(event_id=event.id)
        db.add(config)

    if payload.is_live is not None:
        config.is_live = payload.is_live
    if payload.fields is not None:
        # Convert pydantic models to dictionaries
        config.fields = [f.model_dump() for f in payload.fields]
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
    # Load form config
    config_stmt = select(RegistrationFormConfig).where(RegistrationFormConfig.event_id == event_id)
    config_result = await db.execute(config_stmt)
    config = config_result.scalar_one_or_none()

    is_live = False
    fields = DEFAULT_FIELDS

    if config:
        is_live = config.is_live
        fields = config.fields

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
    disabled_categories = reg_settings.get("disabled_categories", [])

    allowed_roles = [
        r.name for r in roles
        if r.is_active and r.category not in disabled_categories
    ]

    # Map form fields and dynamically assign roles to select options
    import copy
    fields_copy = copy.deepcopy(fields)
    for field in fields_copy:
        if field.get("id") == "role":
            field["options"] = allowed_roles

    reg_settings = event.registration_settings or {}
    payment_enabled = reg_settings.get("payment_enabled", False)
    active_gateway = reg_settings.get("active_gateway", "simulated")
    
    stripe_pub_key = ""
    if active_gateway == "stripe":
        stripe_pub_key = reg_settings.get("stripe_credentials", {}).get("publishable_key", "")
        
    active_tier = get_active_tier(event)
    active_prices = await get_active_prices_for_event(db, event)

    terms = reg_settings.get("terms_and_conditions") or DEFAULT_TERMS
    include_default = reg_settings.get("include_default_faqs", True)
    custom_faqs = reg_settings.get("faqs", [])
    
    if include_default:
        existing_questions = {f.get("q", "").strip().lower() for f in custom_faqs}
        faqs = list(custom_faqs)
        for df in DEFAULT_FAQS:
            if df["q"].strip().lower() not in existing_questions:
                faqs.append(df)
    else:
        faqs = custom_faqs

    return {
        "event_name": event.name,
        "theme_color": event.theme_color or "#1A73E8",
        "logo_url": event.logo_url,
        "is_live": is_live,
        "fields": fields_copy,
        "currency": event.currency or "INR",
        "payment_enabled": payment_enabled,
        "active_gateway": active_gateway,
        "stripe_publishable_key": stripe_pub_key,
        "active_tier": active_tier,
        "active_prices": active_prices,
        "tier_cutoffs": reg_settings.get("tier_cutoffs", {}),
        "terms_and_conditions": terms,
        "faqs": faqs,
        "include_default_faqs": include_default,
        "branding_settings": event.branding_settings,
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
    """
    Publicly submit registration data for an event.
    """
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
    default_fields = ["name", "first_name", "last_name", "email", "phone", "company", "designation", "country", "role"]
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
        "role": payload.get("role", "Delegate").strip(),
        "paid_status": "Unpaid",
        "source": "public_portal",
        "custom_fields": {}
    }

    form_fields = config.fields
    
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
    db: AsyncSession = Depends(get_db)
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

    # 2. Query event to get event name
    import re
    event = None
    try:
        event_result = await db.execute(select(Event).where(Event.id == event_id))
        event = event_result.scalar_one_or_none()
    except Exception as e:
        pass

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
        base_filename = str(uuid.uuid4())

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "bin"
    stored_filename = f"{base_filename}.{ext}"
    storage_path = f"{event_name_clean}/registration_upload/{field_folder}/{stored_filename}"

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
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Storage upload failed: {str(e)}"
        )

    # 4. Construct accessibility URL
    if settings.STORAGE_MODE == "local":
        url = f"{settings.API_BASE_URL}{settings.api_v1_prefix}/storage/{bucket}/{storage_path}"
    else:
        # In S3 mode, return a download URL (or direct public URL if bucket is public)
        url = upload_service.create_presigned_download(
            bucket=bucket,
            storage_path=storage_path,
            expiry_seconds=31536000 # 1 year expiry for registration documents
        )

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
        raise HTTPException(status_code=400, detail=f"No pricing configured for role '{payload.role}' under active tier '{active_tier}'.")
        
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
        
    reg_settings = event.registration_settings or {}
    payment_enabled = reg_settings.get("payment_enabled", False)
    active_gateway = reg_settings.get("active_gateway", "simulated")
    if payment_enabled:
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

