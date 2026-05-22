import uuid
from typing import Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.dependencies import get_db, get_current_event, CurrentEvent
from app.models.event import Event
from app.models.registration_form_config import RegistrationFormConfig
from app.models.participant import Participant
from app.models.participant_registration import ParticipantRegistration
from app.models.capacity_rule import CapacityRule
from app.schemas.registration_form_config import (
    RegistrationFormConfigResponse,
    RegistrationFormConfigUpdate
)
from app.schemas.common import MessageResponse
from app.routers.participants import generate_next_regno
from app.services import upload_service
from app.config import settings

router = APIRouter(tags=["registration_portal"])

DEFAULT_FIELDS = [
    {
        "id": "name",
        "name": "name",
        "label": "Full Name",
        "type": "text",
        "is_default": True,
        "is_required": True,
        "is_active": True,
        "placeholder": "Enter your full name"
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

    return config


@router.post("/events/{event_id}/registration/form-config", response_model=RegistrationFormConfigResponse)
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

    await db.commit()
    await db.refresh(config)
    return config


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
    from app.models.participant_role import ParticipantRole
    roles_stmt = select(ParticipantRole).where(
        ParticipantRole.event_id == event_id
    ).order_by(ParticipantRole.sort_order, ParticipantRole.name)
    roles_res = await db.execute(roles_stmt)
    roles = roles_res.scalars().all()

    # Auto-seed if empty
    if not roles:
        from app.routers.participant_roles import seed_default_roles
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

    return {
        "event_name": event.name,
        "theme_color": event.theme_color or "#1A73E8",
        "logo_url": event.logo_url,
        "is_live": is_live,
        "fields": fields_copy
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

    # 3. Check email presence if email field is active
    email_val = payload.get("email", "").strip()
    if email_val:
        # Check if already registered
        existing_stmt = select(Participant).where(
            Participant.event_id == event_id,
            Participant.email == email_val
        )
        existing_result = await db.execute(existing_stmt)
        if existing_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This email address is already registered for this event."
            )

    # 3.5 Validate the role/category belongs to active roles and is not in disabled categories
    from app.models.participant_role import ParticipantRole
    roles_stmt = select(ParticipantRole).where(
        ParticipantRole.event_id == event_id
    )
    roles_res = await db.execute(roles_stmt)
    roles = roles_res.scalars().all()

    if not roles:
        from app.routers.participant_roles import seed_default_roles
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
    default_fields = ["name", "email", "phone", "company", "designation", "country", "role"]
    participant_data: Dict[str, Any] = {
        "event_id": event_id,
        "name": payload.get("name", "Unnamed Participant").strip(),
        "email": email_val or None,
        "phone": payload.get("phone", "").strip() or None,
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
                allowed_countries = ["India", "United States", "United Kingdom", "Canada", "Australia", "Germany"]
                if stripped_val not in allowed_countries:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Selected country '{stripped_val}' for '{field_label}' is not supported."
                    )
                
                # Check for country's state input
                state_key = f"{field_id}_state"
                state_val = payload.get(state_key, "").strip()
                if not state_val and is_required:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"State/Province is required for country '{stripped_val}'."
                    )
                
                if state_val:
                    country_states = {
                        "India": ["Andhra Pradesh", "Delhi", "Gujarat", "Karnataka", "Kerala", "Maharashtra", "Tamil Nadu", "Telangana", "Uttar Pradesh", "West Bengal"],
                        "United States": ["California", "Florida", "Georgia", "Illinois", "New York", "North Carolina", "Ohio", "Pennsylvania", "Texas", "Washington"],
                        "United Kingdom": ["England", "Northern Ireland", "Scotland", "Wales"],
                        "Canada": ["Alberta", "British Columbia", "Manitoba", "Nova Scotia", "Ontario", "Quebec", "Saskatchewan"],
                        "Australia": ["New South Wales", "Queensland", "South Australia", "Tasmania", "Victoria", "Western Australia"],
                        "Germany": ["Bavaria", "Berlin", "Hamburg", "Hesse", "North Rhine-Westphalia", "Saxony"]
                    }
                    allowed_states = country_states.get(stripped_val, [])
                    if state_val not in allowed_states:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"State '{state_val}' is not valid for country '{stripped_val}'."
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
    file: UploadFile = File(...)
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

    # 2. Construct safe storage filename
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "bin"
    stored_filename = f"{uuid.uuid4()}.{ext}"
    storage_path = f"{event_id}/{stored_filename}"

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
