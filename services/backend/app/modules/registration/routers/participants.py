# backend/app/routers/participants.py
from __future__ import annotations

import csv
import hashlib
import io
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status, UploadFile, File
from loguru import logger
from openpyxl import Workbook, load_workbook
from sqlalchemy import func, select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import get_db, get_current_event, CurrentEvent, get_current_user
from app.modules.identity.models.user import User
from app.modules.events.models.event import Event
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.check_in import AttendanceMutation, CheckIn
from app.modules.audit.models.audit_log import AuditLog
from app.modules.events.models.session import Session
from app.modules.registration.models.registration_form_config import RegistrationFormConfig
from app.modules.registration.models.participant_role import ParticipantRole
from app.modules.registration.schemas.participant import (
    ParticipantCreate, ParticipantUpdate, ParticipantResponse,
    CheckInCreate, CheckInResponse, ExcelImportResponse, SkippedImportRow,
    PublicRegistrationConfirmationResponse,
    RegistrationConfirmationQRRequest,
    RegistrationConfirmationQRResponse,
)
from app.schemas.common import MessageResponse
from app.modules.registration.services.portal_service import (
    phone_numbers_match,
)
from app.modules.events.services import EventParticipantMutationService
from app.core.dependencies.feature_gate import (
    enforce_event_feature,
    enforce_event_operation,
)
from app.modules.audit.services.audit_service import AuditContext, AuditService
from app.modules.registration.models.confirmation_qr import RegistrationConfirmationQR
from app.modules.registration.services.confirmation_qr_service import (
    ConfirmationQRCredentialError,
    build_confirmation_image_url,
    build_confirmation_token,
    build_confirmation_verification_url,
    parse_and_verify_confirmation_token,
    RegistrationConfirmationQRService,
)
from app.modules.registration.services.qr_service import generate_qr_code
from app.modules.billing.services.usage_reservation_service import UsageReservationService

router = APIRouter(prefix="/events/{event_id}/participants", tags=["participants"])
public_confirmation_router = APIRouter(
    prefix="/public/registration-confirmations",
    tags=["public-registration-confirmations"],
)


def get_role_prefix(role: str) -> str:
    compact = re.sub(r"[^A-Za-z0-9]", "", role or "REG").upper()
    return compact[:3] or "REG"


async def get_role_prefix_for_event(db: AsyncSession, event_id: uuid.UUID, role: str) -> str:
    result = await db.execute(
        select(ParticipantRole.role_code).where(
            ParticipantRole.event_id == event_id,
            ParticipantRole.name == role
        )
    )
    configured = result.scalar_one_or_none()
    return (configured or get_role_prefix(role)).strip().upper()


async def get_used_numbers_for_prefix(db: AsyncSession, event_id: uuid.UUID, prefix: str) -> set[int]:
    result = await db.execute(
        select(Participant.regno).where(
            Participant.event_id == event_id,
            Participant.regno.like(f"{prefix}-%")
        )
    )
    used: set[int] = set()
    pattern = re.compile(rf"^{re.escape(prefix)}-(\d+)$", re.IGNORECASE)
    for regno in result.scalars().all():
        match = pattern.match(regno or "")
        if match:
            used.add(int(match.group(1)))
    return used


def smallest_available_number(used: set[int]) -> int:
    next_number = 1
    while next_number in used:
        next_number += 1
    return next_number


async def get_role_by_name(db: AsyncSession, event_id: uuid.UUID, role_name: str) -> Optional[ParticipantRole]:
    stmt = select(ParticipantRole).where(
        ParticipantRole.event_id == event_id,
        ParticipantRole.name == role_name
    )
    res = await db.execute(stmt)
    return res.scalar_one_or_none()


async def generate_next_regno(db: AsyncSession, event_id: uuid.UUID, role: str) -> str:
    prefix = await get_role_prefix_for_event(db, event_id, role)
    used = await get_used_numbers_for_prefix(db, event_id, prefix)
    return f"{prefix}-{smallest_available_number(used):04d}"


DEFAULT_PARTICIPANT_FIELDS = {"name", "first_name", "last_name", "email", "phone", "company", "designation", "country", "role"}
DEFAULT_REGISTRATION_FIELDS = [
    {"id": "first_name", "name": "first_name", "label": "First Name", "type": "text", "is_default": True, "is_required": True, "is_active": True},
    {"id": "last_name", "name": "last_name", "label": "Last Name", "type": "text", "is_default": True, "is_required": True, "is_active": True},
    {"id": "email", "name": "email", "label": "Email Address", "type": "email", "is_default": True, "is_required": True, "is_active": True},
    {"id": "phone", "name": "phone", "label": "Phone Number", "type": "phone", "is_default": True, "is_required": False, "is_active": True},
    {"id": "company", "name": "company", "label": "Company/Affiliation", "type": "text", "is_default": True, "is_required": False, "is_active": True},
    {"id": "designation", "name": "designation", "label": "Job Title/Designation", "type": "text", "is_default": True, "is_required": False, "is_active": True},
    {"id": "country", "name": "country", "label": "Country", "type": "country", "is_default": True, "is_required": False, "is_active": True},
    {"id": "role", "name": "role", "label": "Registration Category", "type": "select", "is_default": True, "is_required": True, "is_active": True, "options": ["Delegate", "VIP", "Speaker", "Faculty"]},
]


async def get_registration_fields(db: AsyncSession, event_id: uuid.UUID) -> List[Dict[str, Any]]:
    result = await db.execute(
        select(RegistrationFormConfig).where(RegistrationFormConfig.event_id == event_id)
    )
    config = result.scalar_one_or_none()
    fields = config.fields if config and config.fields else DEFAULT_REGISTRATION_FIELDS
    return [field for field in fields if field.get("is_active", True)]


def normalise_header(value: str) -> str:
    return " ".join((value or "").strip().lower().replace("_", " ").split())


def build_field_header(field: Dict[str, Any]) -> str:
    label = (field.get("label") or field.get("name") or field.get("id") or "").strip()
    required = " *" if field.get("is_required") else ""
    return f"{label}{required}"


def build_header_field_map(fields: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    header_map: Dict[str, Dict[str, Any]] = {}
    for field in fields:
        for key in {
            build_field_header(field),
            field.get("label") or "",
            field.get("name") or "",
            field.get("id") or "",
        }:
            if key:
                header_map[normalise_header(key)] = field
    header_map[normalise_header("first_name")] = {"id": "first_name", "name": "first_name"}
    header_map[normalise_header("first name")] = {"id": "first_name", "name": "first_name"}
    header_map[normalise_header("last_name")] = {"id": "last_name", "name": "last_name"}
    header_map[normalise_header("last name")] = {"id": "last_name", "name": "last_name"}
    header_map[normalise_header("paid_status")] = {"id": "paid_status", "name": "paid_status"}
    header_map[normalise_header("paid status")] = {"id": "paid_status", "name": "paid_status"}
    header_map[normalise_header("source")] = {"id": "source", "name": "source"}
    return header_map


def map_import_row(row: Dict[str, Any], fields: List[Dict[str, Any]]) -> Optional[ParticipantCreate]:
    header_map = build_header_field_map(fields)
    default_payload: Dict[str, Any] = {
        "role": "Delegate",
        "paid_status": "Unpaid",
        "source": "excel_import",
        "custom_fields": {},
    }

    for raw_header, raw_value in row.items():
        header = normalise_header(str(raw_header or ""))
        field = header_map.get(header)
        if not field:
            continue

        value = raw_value.strip() if isinstance(raw_value, str) else raw_value
        field_id = field.get("id") or field.get("name")
        field_name = field.get("name") or field_id

        if field_id in DEFAULT_PARTICIPANT_FIELDS or field_name in DEFAULT_PARTICIPANT_FIELDS:
            default_payload[field_name] = value
        elif field_id in {"paid_status", "source"}:
            default_payload[field_id] = value
        elif field_id:
            default_payload["custom_fields"][field_id] = value

    if not str(default_payload.get("name") or "").strip() and not str(default_payload.get("first_name") or "").strip():
        return None

    paid_status = str(default_payload.get("paid_status") or "Unpaid").strip().capitalize()
    if paid_status not in {"Paid", "Unpaid"}:
        paid_status = "Unpaid"
    default_payload["paid_status"] = paid_status
    role_val = str(default_payload.get("role") or "Delegate").strip()
    role_val = re.sub(r"\s*\([^)]*\)", "", role_val).strip()
    default_payload["role"] = role_val
    default_payload["source"] = str(default_payload.get("source") or "excel_import").strip()
    return ParticipantCreate(**default_payload)


async def insert_participants(
    db: AsyncSession,
    event_id: uuid.UUID,
    payload: List[ParticipantCreate],
    default_source: str,
    idempotency_key: str,
    actor_user_id: uuid.UUID,
) -> tuple[int, int, int]:
    from sqlalchemy import select, func
    from app.modules.events.models.capacity_rule import CapacityRule
    from app.modules.registration.models.participant_registration import ParticipantRegistration

    inserted_count = 0
    waitlisted_count = 0
    merged_count = 0

    # 1. Fetch existing participants for this event to run in-memory duplication and merge checks
    existing_stmt = select(Participant).where(Participant.event_id == event_id, Participant.deleted_at.is_(None))
    existing_res = await db.execute(existing_stmt)
    existing_participants = list(existing_res.scalars().all())

    # Build lookup sets for quick checks
    registered_emails = set()
    for p in existing_participants:
        if p.email:
            registered_emails.add(p.email.strip().lower())
        custom = p.custom_fields or {}
        additional = custom.get("additional_emails") or []
        for e in additional:
            registered_emails.add(e.strip().lower())

    # Process each row in payload
    to_insert_new: List[ParticipantCreate] = []

    for item in payload:
        email = (item.email or "").strip().lower()
        if email and email in registered_emails:
            # Skip duplicate emails
            continue

        # Check Name + Phone match on a different email
        match_p = None
        if item.name and item.phone:
            for p in existing_participants:
                n1 = " ".join(item.name.strip().lower().split())
                n2 = " ".join((p.name or "").strip().lower().split())
                if n1 == n2 and phone_numbers_match(item.phone, p.phone):
                    match_p = p
                    break

        if match_p:
            # Auto merge secondary email
            custom = dict(match_p.custom_fields or {})
            additional = list(custom.get("additional_emails") or [])
            if email and email not in additional:
                additional.append(email)
                custom["additional_emails"] = additional
                match_p.custom_fields = custom
                match_p.updated_at = datetime.now(timezone.utc)
                if email:
                    registered_emails.add(email)
                merged_count += 1
            continue

        # If no duplicate and no merge, it is a new participant to insert!
        to_insert_new.append(item)
        if email:
            registered_emails.add(email)

    if not to_insert_new:
        await db.commit()
        return 0, 0, merged_count

    # 2. Sort new participants: Paid status first, then Unpaid (FIFO)
    to_insert_new.sort(key=lambda x: x.paid_status == "Paid", reverse=True)

    # 3. Check Capacity
    q_rule = select(CapacityRule).where(
        CapacityRule.event_id == event_id,
        CapacityRule.session_id.is_(None),
        CapacityRule.room_id.is_(None)
    )
    rule = (await db.execute(q_rule)).scalar_one_or_none()

    q_count = select(func.count(Participant.id)).where(Participant.event_id == event_id)
    current_approved = (await db.execute(q_count)).scalar() or 0

    has_capacity_limit = rule is not None
    slots_remaining = max(0, rule.capacity - current_approved) if has_capacity_limit else 999999

    # Next waitlist position setup
    q_wl = select(func.max(ParticipantRegistration.waitlist_position)).where(
        ParticipantRegistration.event_id == event_id,
        ParticipantRegistration.registration_status == "waitlisted"
    )
    max_wl_pos = (await db.execute(q_wl)).scalar() or 0
    next_wl_pos = max_wl_pos + 1

    role_state: Dict[str, tuple[str, set[int], Optional[uuid.UUID], Optional[ParticipantRole]]] = {}

    from app.modules.events.models.event import Event
    from app.modules.registration.services.pricing_service import get_active_prices_for_event

    event_obj = await db.get(Event, event_id)
    payment_enabled = event_obj.registration_settings.get("payment_enabled", False) if (event_obj and event_obj.registration_settings) else False

    active_prices = {}
    if payment_enabled:
        active_prices = await get_active_prices_for_event(db, event_obj)

    for row_index, item in enumerate(to_insert_new):
        reservation = None
        can_activate = slots_remaining > 0
        if can_activate:
            try:
                reservation = await UsageReservationService.reserve(
                    db,
                    organization_id=event_obj.organization_id,
                    event_id=event_id,
                    limit_key="max_registrations",
                    quantity=1,
                    unit="registration",
                    idempotency_key=f"participant-import:{idempotency_key}:{row_index}",
                    metadata={"source": default_source, "row_index": row_index},
                )
            except HTTPException as exc:
                if exc.status_code == status.HTTP_402_PAYMENT_REQUIRED and isinstance(exc.detail, dict) and exc.detail.get("code") == "QUOTA_EXHAUSTED":
                    can_activate = False
                    slots_remaining = 0
                else:
                    raise

        if can_activate and reservation is not None:
            # Fits in capacity -> Add directly as approved Participant
            role = item.role or "Delegate"
            if role not in role_state:
                prefix = await get_role_prefix_for_event(db, event_id, role)
                role_obj = await get_role_by_name(db, event_id, role)
                role_id = role_obj.id if role_obj else None
                role_state[role] = (prefix, await get_used_numbers_for_prefix(db, event_id, prefix), role_id, role_obj)

            prefix, used_numbers, role_id, role_obj = role_state[role]

            role_price = active_prices.get(role, 0.0) if payment_enabled else 0.0
            paid_status = item.paid_status or "Unpaid"
            if role_price <= 0.0:
                paid_status = "Paid"

            regno = item.regno
            if not regno:
                should_generate = False
                if role_price <= 0.0:
                    should_generate = True
                elif paid_status == "Paid":
                    should_generate = True

                if should_generate:
                    number = smallest_available_number(used_numbers)
                    used_numbers.add(number)
                    regno = f"{prefix}-{number:04d}"

            p = Participant(
                event_id=event_id,
                regno=regno,
                first_name=item.first_name or "",
                last_name=item.last_name or "",
                email=item.email,
                phone=item.phone,
                role_id=role_id,
                role_rel=role_obj,
                company=item.company,
                designation=item.designation,
                country=item.country,
                paid_status=paid_status,
                source=item.source or default_source,
                custom_fields=item.custom_fields or {},
            )
            db.add(p)
            await db.flush()
            await UsageReservationService.consume(
                db,
                reservation.id,
                source=f"registration.{default_source}",
                actor_user_id=actor_user_id,
            )
            inserted_count += 1
            slots_remaining -= 1
        else:
            # Capacity exceeded -> Create ParticipantRegistration in waitlist/review
            status_str = "waitlisted" if (rule and rule.waitlist_enabled) else "pending_review"
            waitlist_position = next_wl_pos if status_str == "waitlisted" else None
            if waitlist_position:
                next_wl_pos += 1

            role = item.role or "Delegate"
            role_price = active_prices.get(role, 0.0) if payment_enabled else 0.0
            reg_paid_status = item.paid_status or "Unpaid"
            if role_price <= 0.0:
                reg_paid_status = "Paid"

            reg_data = {
                "name": item.name,
                "first_name": item.first_name or "",
                "last_name": item.last_name or "",
                "email": item.email,
                "phone": item.phone,
                "role": role,
                "company": item.company,
                "designation": item.designation,
                "country": item.country,
                "paid_status": reg_paid_status,
                "custom_fields": item.custom_fields or {},
            }

            reg = ParticipantRegistration(
                event_id=event_id,
                registration_status=status_str,
                registration_data=reg_data,
                approval_source="bulk_import",
                waitlist_position=waitlist_position
            )
            db.add(reg)
            waitlisted_count += 1

    await db.commit()
    return inserted_count, waitlisted_count, merged_count


@router.get("", response_model=List[ParticipantResponse])
async def list_participants(
    event: CurrentEvent,
    search: Optional[str] = Query(None, max_length=100),
    role: Optional[str] = Query(None),
    paid_status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(250, ge=1, le=1000),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[ParticipantResponse]:
    await enforce_event_operation(db, event.organization_id, event.id, "registration.read", user_id=current_user.id)
    from app.modules.events.models.event import Event
    from app.modules.registration.services.pricing_service import get_active_prices_for_event

    event_obj = await db.get(Event, event.id)
    payment_enabled = event_obj.registration_settings.get("payment_enabled", False) if (event_obj and event_obj.registration_settings) else False

    active_prices = {}
    if payment_enabled:
        active_prices = await get_active_prices_for_event(db, event_obj)

    q = select(Participant).options(selectinload(Participant.role_rel)).where(Participant.event_id == event.id, Participant.deleted_at.is_(None))
    
    if search:
        search_term = f"%{search}%"
        q = q.where(
            (Participant.name.ilike(search_term)) |
            (Participant.email.ilike(search_term)) |
            (Participant.phone.ilike(search_term)) |
            (Participant.company.ilike(search_term)) |
            (Participant.regno.ilike(search_term))
        )
    if role:
        q = q.where(Participant.role == role)
    if paid_status:
        if paid_status.lower() == "free":
            if payment_enabled:
                from app.modules.registration.models.participant_role import ParticipantRole
                roles_res = await db.execute(select(ParticipantRole.name).where(ParticipantRole.event_id == event.id))
                all_roles = roles_res.scalars().all()
                free_roles = [r for r in all_roles if active_prices.get(r, 0.0) <= 0.0]
                q = q.where(Participant.role.in_(free_roles))
        elif paid_status.lower() == "paid":
            q = q.where(Participant.paid_status == "Paid")
            if payment_enabled:
                from app.modules.registration.models.participant_role import ParticipantRole
                roles_res = await db.execute(select(ParticipantRole.name).where(ParticipantRole.event_id == event.id))
                all_roles = roles_res.scalars().all()
                paid_roles = [r for r in all_roles if active_prices.get(r, 0.0) > 0.0]
                q = q.where(Participant.role.in_(paid_roles))
            else:
                # If payment is disabled, no one is "Paid" (everyone is free)
                q = q.where(1 == 0)
        else:
            q = q.where(Participant.paid_status == paid_status)

    q = q.order_by(Participant.registered_at.desc())
    q = q.offset((page - 1) * page_size).limit(page_size)
    
    result = await db.execute(q)
    db_participants = list(result.scalars().all())

    response_list = []
    for p in db_participants:
        resp = ParticipantResponse.model_validate(p)
        resp.is_free = not payment_enabled or (active_prices.get(p.role, 0.0) <= 0.0)
        response_list.append(resp)

    return response_list


@router.get("/stats")
async def get_registration_stats(
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await enforce_event_operation(db, event.organization_id, event.id, "registration.analytics.view", user_id=current_user.id)
    total_q = select(func.count(Participant.id)).where(Participant.event_id == event.id, Participant.deleted_at.is_(None))
    paid_q = select(func.count(Participant.id)).where(Participant.event_id == event.id, Participant.deleted_at.is_(None), Participant.paid_status == "Paid")
    unpaid_q = select(func.count(Participant.id)).where(Participant.event_id == event.id, Participant.deleted_at.is_(None), Participant.paid_status == "Unpaid")
    
    # Session check-in stats
    checkins_q = select(func.count(CheckIn.id)).where(CheckIn.event_id == event.id)
    
    # Role breakdown
    roles_q = (
        select(
            ParticipantRole.name,
            func.count(Participant.id)
        )
        .select_from(Participant)
        .outerjoin(ParticipantRole, ParticipantRole.id == Participant.role_id)
        .where(Participant.event_id == event.id, Participant.deleted_at.is_(None))
        .group_by(ParticipantRole.name)
    )

    # Payment status breakdown
    payment_status_q = (
        select(
            func.coalesce(func.nullif(Participant.paid_status, ''), 'Unspecified'),
            func.count(Participant.id)
        )
        .where(Participant.event_id == event.id, Participant.deleted_at.is_(None))
        .group_by(func.coalesce(func.nullif(Participant.paid_status, ''), 'Unspecified'))
        .order_by(func.count(Participant.id).desc())
    )
    payment_status_res = (await db.execute(payment_status_q)).all()
    payment_breakdown = {r[0]: r[1] for r in payment_status_res}

    total_count = (await db.execute(total_q)).scalar_one() or 0
    paid_count = (await db.execute(paid_q)).scalar_one() or 0
    unpaid_count = (await db.execute(unpaid_q)).scalar_one() or 0
    checkin_count = (await db.execute(checkins_q)).scalar_one() or 0
    
    roles_res = (await db.execute(roles_q)).all()
    role_breakdown = {r[0] or "Delegate": r[1] for r in roles_res}

    return {
        "total": total_count,
        "paid": paid_count,
        "unpaid": unpaid_count,
        "payment_breakdown": payment_breakdown,
        "checkins": checkin_count,
        "role_breakdown": role_breakdown
    }


@router.post("", response_model=ParticipantResponse, status_code=status.HTTP_201_CREATED)
async def create_participant(
    payload: ParticipantCreate,
    event: CurrentEvent,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ParticipantResponse:
    event_obj = await db.get(Event, event.id)
    if event_obj is None:
        raise HTTPException(status_code=404, detail="Event not found.")
    participant, is_free, _ = await EventParticipantMutationService.create(
        db,
        event=event_obj,
        payload=payload,
        actor_user_id=current_user.id,
        idempotency_key=idempotency_key,
        source="organizer_portal",
    )
    await db.commit()
    res = await db.execute(
        select(Participant)
        .options(selectinload(Participant.role_rel))
        .where(Participant.id == participant.id)
    )
    p = res.scalar_one()

    resp = ParticipantResponse.model_validate(p)
    resp.is_free = is_free
    return resp


def _confirmation_qr_response(
    credential: RegistrationConfirmationQR,
) -> RegistrationConfirmationQRResponse:
    token = build_confirmation_token(
        credential.id,
        credential.credential_version,
    )
    return RegistrationConfirmationQRResponse(
        credential_id=credential.id,
        participant_id=credential.participant_id,
        event_id=credential.event_id,
        status=credential.status,
        version=credential.credential_version,
        verification_url=build_confirmation_verification_url(token),
        image_url=build_confirmation_image_url(token),
        issued_at=credential.issued_at,
        rotated_at=credential.rotated_at,
    )


@router.post(
    "/{participant_id}/confirmation-qr",
    response_model=RegistrationConfirmationQRResponse,
)
async def registration_confirmation_qr(
    participant_id: uuid.UUID,
    payload: RegistrationConfirmationQRRequest,
    event: CurrentEvent,
    expected_version: int = Header(..., alias="If-Match", ge=0),
    idempotency_key: str = Header(
        ..., alias="Idempotency-Key", min_length=8, max_length=200
    ),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RegistrationConfirmationQRResponse:
    """Issue or rotate a participant's feature-gated confirmation QR."""
    await enforce_event_operation(
        db,
        event.organization_id,
        event.id,
        "registration.confirmation_qr.manage",
        user_id=current_user.id,
    )
    participant = await db.scalar(
        select(Participant).where(
            Participant.id == participant_id,
            Participant.event_id == event.id,
            Participant.deleted_at.is_(None),
        )
    )
    if participant is None:
        raise HTTPException(status_code=404, detail="Participant not found.")

    issuance = await RegistrationConfirmationQRService.issue_or_rotate(
        db,
        organization_id=event.organization_id,
        event_id=event.id,
        participant=participant,
        expected_version=expected_version,
        idempotency_key=idempotency_key,
        actor_user_id=current_user.id,
    )
    credential = issuance.credential
    if issuance.replayed:
        return _confirmation_qr_response(credential)
    old_state = issuance.old_state
    await AuditService.write_log_sync(
        AuditContext(
            action_type=(
                "REGISTRATION_CONFIRMATION_QR_ROTATED"
                if old_state
                else "REGISTRATION_CONFIRMATION_QR_ISSUED"
            ),
            resource_type="registration_confirmation_qr",
            resource_id=credential.id,
            actor_user_id=current_user.id,
            organization_id=event.organization_id,
            actor_role=getattr(current_user, "role", None),
            old_state=old_state,
            new_state={
                "event_id": str(event.id),
                "participant_id": str(participant.id),
                "version": credential.credential_version,
                "reason": payload.reason,
                "case_reference": payload.case_reference,
                "idempotency_key": idempotency_key,
            },
        ),
        db,
    )
    await db.commit()
    await db.refresh(credential)
    return _confirmation_qr_response(credential)


@router.get(
    "/{participant_id}/confirmation-qr",
    response_model=RegistrationConfirmationQRResponse,
)
async def get_registration_confirmation_qr(
    participant_id: uuid.UUID,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RegistrationConfirmationQRResponse:
    await enforce_event_operation(
        db,
        event.organization_id,
        event.id,
        "registration.confirmation_qr.manage",
        user_id=current_user.id,
    )
    credential = await db.scalar(
        select(RegistrationConfirmationQR)
        .join(
            Participant,
            Participant.id == RegistrationConfirmationQR.participant_id,
        )
        .where(
            RegistrationConfirmationQR.participant_id == participant_id,
            RegistrationConfirmationQR.event_id == event.id,
            Participant.event_id == event.id,
            Participant.deleted_at.is_(None),
        )
    )
    if credential is None:
        raise HTTPException(
            status_code=404,
            detail="Registration confirmation QR has not been issued.",
        )
    return _confirmation_qr_response(credential)


async def _resolve_public_confirmation(
    token: str,
    db: AsyncSession,
) -> tuple[RegistrationConfirmationQR, Participant, Any]:
    try:
        credential_id, version = parse_and_verify_confirmation_token(token)
    except ConfirmationQRCredentialError as exc:
        raise HTTPException(status_code=404, detail="Confirmation not found.") from exc
    row = (
        await db.execute(
            select(RegistrationConfirmationQR, Participant)
            .join(
                Participant,
                Participant.id == RegistrationConfirmationQR.participant_id,
            )
            .where(
                RegistrationConfirmationQR.id == credential_id,
                RegistrationConfirmationQR.credential_version == version,
                RegistrationConfirmationQR.status == "ACTIVE",
                RegistrationConfirmationQR.revoked_at.is_(None),
                Participant.deleted_at.is_(None),
            )
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Confirmation not found.")
    credential, participant = row
    from app.modules.events.models.event import Event

    event_obj = await db.scalar(
        select(Event).where(
            Event.id == credential.event_id,
            Event.organization_id == credential.organization_id,
            Event.deleted_at.is_(None),
        )
    )
    if event_obj is None:
        raise HTTPException(status_code=404, detail="Confirmation not found.")
    await enforce_event_feature(
        db,
        credential.organization_id,
        credential.event_id,
        "FEAT_QR_CONFIRMATION",
    )
    return credential, participant, event_obj


@public_confirmation_router.get(
    "/{token}",
    response_model=PublicRegistrationConfirmationResponse,
)
async def verify_registration_confirmation(
    token: str,
    db: AsyncSession = Depends(get_db),
) -> PublicRegistrationConfirmationResponse:
    credential, participant, event_obj = await _resolve_public_confirmation(
        token, db
    )
    return PublicRegistrationConfirmationResponse(
        valid=True,
        credential_id=credential.id,
        event_id=event_obj.id,
        event_name=event_obj.name,
        participant_name=participant.name,
        registration_number=participant.regno,
        approval_status=participant.approval_status,
        issued_at=credential.issued_at,
        freshness_at=datetime.now(timezone.utc),
    )


@public_confirmation_router.get("/{token}/image")
async def render_registration_confirmation_qr(
    token: str,
    db: AsyncSession = Depends(get_db),
) -> Response:
    await _resolve_public_confirmation(token, db)
    image = generate_qr_code(
        build_confirmation_verification_url(token),
        box_size=10,
        border=4,
    )
    return Response(
        content=image,
        media_type="image/png",
        headers={
            "Cache-Control": "private, no-store",
            "Content-Disposition": 'inline; filename="registration-confirmation.png"',
        },
    )


@router.post("/bulk", response_model=MessageResponse)
async def bulk_upload_participants(
    payload: List[ParticipantCreate],
    event: CurrentEvent,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    await enforce_event_operation(db, event.organization_id, event.id, "registration.import", user_id=current_user.id)
    inserted, waitlisted, merged = await insert_participants(db, event.id, payload, "bulk_upload", idempotency_key, current_user.id)
    return MessageResponse(
        message=f"Import complete: {inserted} active participants imported, {waitlisted} waitlisted, {merged} merged."
    )


@router.post("/bulk-delete", response_model=MessageResponse)
async def bulk_delete_participants(
    participant_ids: List[uuid.UUID],
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    if not participant_ids:
        raise HTTPException(status_code=400, detail="No participants selected.")
    await enforce_event_operation(db, event.organization_id, event.id, "registration.manage", user_id=current_user.id)
    rows = (await db.scalars(select(Participant).where(
        Participant.event_id == event.id,
        Participant.id.in_(participant_ids),
        Participant.deleted_at.is_(None),
    ).with_for_update())).all()
    now = datetime.now(timezone.utc)
    for row in rows:
        row.deleted_at = now
        row.deleted_by = current_user.id
    await db.commit()
    return MessageResponse(message=f"Archived {len(rows)} participant registrations. They remain recoverable through Command Center.")


@router.get("/import-template")
async def download_import_template(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
):
    fields = await get_registration_fields(db, event.id)
    wb = Workbook()
    ws = wb.active
    ws.title = "Participants"

    headers = [build_field_header(field) for field in fields]
    headers.extend(["Paid Status", "Source"])
    ws.append(headers)

    sample = []
    for field in fields:
        field_id = field.get("id")
        if field_id == "first_name":
            sample.append("Asha")
        elif field_id == "last_name":
            sample.append("Mehta")
        elif field_id == "name":
            sample.append("Asha Mehta")
        elif field_id == "email":
            sample.append("asha@example.com")
        elif field_id == "phone":
            sample.append("+91 9876543210")
        elif field_id == "role":
            options = field.get("options") or ["Delegate"]
            sample.append(options[0] if options else "Delegate")
        elif field_id == "country":
            sample.append("India")
        else:
            sample.append("")
    sample.extend(["Unpaid", "excel_import"])
    ws.append(sample)

    for cell in ws[1]:
        cell.font = cell.font.copy(bold=True)
    for column_cells in ws.columns:
        length = max(len(str(cell.value or "")) for cell in column_cells)
        ws.column_dimensions[column_cells[0].column_letter].width = min(max(length + 4, 14), 42)

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    filename = f"participant-import-template-{event.short_code}.xlsx"
    return Response(
        content=output.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/import-excel", response_model=ExcelImportResponse)
async def import_participants_excel(
    event: CurrentEvent,
    file: UploadFile = File(...),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ExcelImportResponse:
    await enforce_event_operation(db, event.organization_id, event.id, "registration.import", user_id=current_user.id)
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=400, detail="Only .xlsx Excel files are accepted.")

    try:
        contents = await file.read()
        workbook = load_workbook(io.BytesIO(contents), data_only=True)
        sheet = workbook.active
        rows = list(sheet.iter_rows(values_only=True))
        if len(rows) < 2:
            raise HTTPException(status_code=400, detail="Excel file has no participant rows.")

        headers = [str(value or "").strip() for value in rows[0]]
        fields = await get_registration_fields(db, event.id)

        # 1. Fetch allowed categories/roles for the event
        from app.modules.registration.models.participant_role import ParticipantRole
        from app.modules.events.models.event import Event
        
        event_obj = await db.get(Event, event.id)
        reg_settings = event_obj.registration_settings or {}
        disabled_categories = reg_settings.get("disabled_categories", [])
        
        roles_stmt = select(ParticipantRole).where(
            ParticipantRole.event_id == event.id
        )
        roles_res = await db.execute(roles_stmt)
        roles = roles_res.scalars().all()
        
        if not roles:
            from app.modules.registration.routers.participant_roles import seed_default_roles
            await seed_default_roles(event.id, db)
            roles_res = await db.execute(roles_stmt)
            roles = roles_res.scalars().all()
            
        allowed_roles = {
            r.name.strip().lower() for r in roles
            if r.is_active and r.category not in disabled_categories
        }

        # 2. Fetch existing registered emails and participants for name+phone matching
        existing_stmt = select(Participant).where(Participant.event_id == event.id, Participant.deleted_at.is_(None))
        existing_res = await db.execute(existing_stmt)
        existing_participants = list(existing_res.scalars().all())

        registered_emails = set()
        for p in existing_participants:
            if p.email:
                registered_emails.add(p.email.strip().lower())
            custom = p.custom_fields or {}
            additional = custom.get("additional_emails") or []
            for e in additional:
                registered_emails.add(e.strip().lower())

        # 3. Parse and validate row by row
        payload: List[ParticipantCreate] = []
        skipped_details: List[SkippedImportRow] = []
        seen_emails: Set[str] = set()

        for idx, values in enumerate(rows[1:], start=2):
            # Skip completely empty rows
            if all(cell is None or str(cell).strip() == "" for cell in values):
                continue

            row_dict = {
                headers[index]: values[index]
                for index in range(min(len(headers), len(values)))
                if index < len(values) and headers[index]
            }

            header_map = build_header_field_map(fields)
            
            raw_name = ""
            raw_first_name = ""
            raw_last_name = ""
            raw_email = ""
            raw_phone = ""
            raw_role = "Delegate"

            for raw_h, raw_v in row_dict.items():
                h_norm = normalise_header(str(raw_h or ""))
                f = header_map.get(h_norm)
                if not f:
                    continue
                v_str = str(raw_v).strip() if raw_v is not None else ""
                f_id = f.get("id") or f.get("name")
                f_name = f.get("name") or f_id

                if f_id == "name" or f_name == "name":
                    raw_name = v_str
                elif f_id == "first_name" or f_name == "first_name":
                    raw_first_name = v_str
                elif f_id == "last_name" or f_name == "last_name":
                    raw_last_name = v_str
                elif f_id == "email" or f_name == "email":
                    raw_email = v_str.lower()
                elif f_id == "phone" or f_name == "phone":
                    raw_phone = v_str
                elif f_id == "role" or f_name == "role":
                    raw_role = v_str

            # Check missing name
            if not raw_name and not raw_first_name:
                skipped_details.append(SkippedImportRow(
                    row=idx,
                    name=None,
                    email=raw_email or None,
                    role=raw_role or None,
                    reason="First Name or Full Name is required."
                ))
                continue

            # Check missing email
            if not raw_email:
                skipped_details.append(SkippedImportRow(
                    row=idx,
                    name=raw_name or f"{raw_first_name} {raw_last_name}".strip(),
                    email=None,
                    role=raw_role or None,
                    reason="Email address is required."
                ))
                continue

            # Validate email format
            email_regex = r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"
            if not re.match(email_regex, raw_email):
                skipped_details.append(SkippedImportRow(
                    row=idx,
                    name=raw_name or f"{raw_first_name} {raw_last_name}".strip(),
                    email=raw_email,
                    role=raw_role or None,
                    reason="Invalid email address format."
                ))
                continue

            # Check role allowed (strip out parenthesized codes like (DEL) if present)
            clean_role = re.sub(r"\s*\([^)]*\)", "", raw_role or "").strip()
            role_key = clean_role.lower() if clean_role else "delegate"
            if role_key not in allowed_roles:
                skipped_details.append(SkippedImportRow(
                    row=idx,
                    name=raw_name or f"{raw_first_name} {raw_last_name}".strip(),
                    email=raw_email,
                    role=raw_role,
                    reason=f"Registration category '{raw_role}' is not allowed or is disabled for this event."
                ))
                continue

            # Check duplicate email
            if raw_email in registered_emails:
                skipped_details.append(SkippedImportRow(
                    row=idx,
                    name=raw_name or f"{raw_first_name} {raw_last_name}".strip(),
                    email=raw_email,
                    role=raw_role,
                    reason="Email address is already registered."
                ))
                continue

            if raw_email in seen_emails:
                skipped_details.append(SkippedImportRow(
                    row=idx,
                    name=raw_name or f"{raw_first_name} {raw_last_name}".strip(),
                    email=raw_email,
                    role=raw_role,
                    reason="Duplicate email address in Excel sheet."
                ))
                continue

            # Check Name + Phone match for merging
            match_found = False
            if (raw_name or raw_first_name) and raw_phone:
                for p in existing_participants:
                    n1 = " ".join((raw_name or f"{raw_first_name} {raw_last_name}").strip().lower().split())
                    n2 = " ".join((p.name or "").strip().lower().split())
                    if n1 == n2 and phone_numbers_match(raw_phone, p.phone):
                        match_found = True
                        break

            item = map_import_row(row_dict, fields)
            if item:
                payload.append(item)
                seen_emails.add(raw_email)
                if match_found:
                    registered_emails.add(raw_email)

        inserted, waitlisted, merged = await insert_participants(db, event.id, payload, "excel_import", idempotency_key, current_user.id)
        skipped = len(skipped_details)

        return ExcelImportResponse(
            message=f"Import complete: {inserted} active participants imported, {waitlisted} waitlisted, {merged} merged, {skipped} skipped.",
            inserted=inserted,
            waitlisted=waitlisted,
            merged=merged,
            skipped=skipped,
            skipped_details=skipped_details
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error importing Excel: {e}")
        raise HTTPException(status_code=422, detail=f"Failed to process Excel file: {str(e)}")


@router.post("/import", response_model=MessageResponse)
async def import_participants_csv(
    event: CurrentEvent,
    file: UploadFile = File(...),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    await enforce_event_operation(db, event.organization_id, event.id, "registration.import", user_id=current_user.id)
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are accepted.")
    
    try:
        contents = await file.read()
        csv_text = contents.decode("utf-8")
        reader = csv.DictReader(io.StringIO(csv_text))
        
        payload: List[ParticipantCreate] = []
        
        for row in reader:
            row_data = {k.strip().lower() if k else "": v.strip() for k, v in row.items()}
            
            name = row_data.get("name")
            first_name = row_data.get("first_name") or row_data.get("first name")
            last_name = row_data.get("last_name") or row_data.get("last name")
            
            if not name and not first_name:
                continue
                
            email = row_data.get("email")
            phone = row_data.get("phone")
            company = row_data.get("company")
            designation = row_data.get("designation")
            country = row_data.get("country")
            role = row_data.get("role") or "Delegate"
            role = role.strip().capitalize()
            if role == "Vip":
                role = "VIP"
            
            paid_status = row_data.get("paid_status") or row_data.get("paid") or "Unpaid"
            paid_status = paid_status.strip().capitalize()
            if paid_status not in ["Paid", "Unpaid"]:
                paid_status = "Unpaid"
                
            source = row_data.get("source") or "csv_import"
            
            payload.append(ParticipantCreate(
                name=name,
                first_name=first_name,
                last_name=last_name,
                email=email,
                phone=phone,
                role=role,
                company=company,
                designation=designation,
                country=country,
                paid_status=paid_status,
                source=source,
            ))

        inserted, waitlisted, merged = await insert_participants(db, event.id, payload, "csv_import", idempotency_key, current_user.id)
        return MessageResponse(
            message=f"Import complete: {inserted} active participants imported, {waitlisted} waitlisted, {merged} merged."
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error importing CSV: {e}")
        raise HTTPException(status_code=422, detail=f"Failed to process CSV file: {str(e)}")


@router.patch("/{participant_id}", response_model=ParticipantResponse)
async def update_participant(
    participant_id: uuid.UUID,
    payload: ParticipantUpdate,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ParticipantResponse:
    event_obj = await db.get(Event, event.id)
    if event_obj is None:
        raise HTTPException(status_code=404, detail="Event not found.")
    p, is_free, _, _ = await EventParticipantMutationService.update(
        db,
        event=event_obj,
        participant_id=participant_id,
        payload=payload,
        actor_user_id=current_user.id,
    )
    await db.commit()
    res = await db.execute(
        select(Participant)
        .options(selectinload(Participant.role_rel))
        .where(Participant.id == p.id)
    )
    p_updated = res.scalar_one()

    resp = ParticipantResponse.model_validate(p_updated)
    resp.is_free = is_free
    return resp


@router.delete("/{participant_id}", response_model=MessageResponse)
async def delete_participant(
    participant_id: uuid.UUID,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    event_obj = await db.get(Event, event.id)
    if event_obj is None:
        raise HTTPException(status_code=404, detail="Event not found.")
    await EventParticipantMutationService.archive(
        db,
        event=event_obj,
        participant_id=participant_id,
        actor_user_id=current_user.id,
        source="organizer_portal",
    )
    await db.commit()
    return MessageResponse(message="Participant registration archived and remains recoverable through Command Center.")


@router.post("/{participant_id}/restore", response_model=ParticipantResponse)
async def restore_participant(
    participant_id: uuid.UUID,
    event: CurrentEvent,
    idempotency_key: str = Header(
        ..., alias="Idempotency-Key", min_length=8, max_length=200
    ),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ParticipantResponse:
    event_obj = await db.get(Event, event.id)
    if event_obj is None:
        raise HTTPException(status_code=404, detail="Event not found.")
    participant, _ = await EventParticipantMutationService.restore(
        db,
        event=event_obj,
        participant_id=participant_id,
        actor_user_id=current_user.id,
        idempotency_key=idempotency_key,
        source="organizer_portal",
    )
    await db.commit()
    refreshed = await db.scalar(
        select(Participant)
        .options(selectinload(Participant.role_rel))
        .where(Participant.id == participant.id)
    )
    response = ParticipantResponse.model_validate(refreshed)
    payment_enabled = bool(
        (event_obj.registration_settings or {}).get("payment_enabled", False)
    )
    if payment_enabled:
        from app.modules.registration.services.pricing_service import (
            get_active_prices_for_event,
        )

        prices = await get_active_prices_for_event(db, event_obj)
        response.is_free = prices.get(refreshed.role, 0.0) <= 0
    else:
        response.is_free = True
    return response


@router.post("/{participant_id}/checkin", response_model=CheckInResponse)
async def checkin_participant(
    participant_id: uuid.UUID,
    payload: CheckInCreate,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    db: AsyncSession = Depends(get_db),
) -> CheckInResponse:
    await enforce_event_operation(db, event.organization_id, event.id, "registration.checkin", user_id=current_user.id)
    from app.modules.registration.services.checkin_service import CheckInService
    request_hash = hashlib.sha256(
        f"CHECK_IN:{event.id}:{participant_id}:{payload.session_id}".encode("utf-8")
    ).hexdigest()
    replay = await CheckInService.acquire_mutation(
        db,
        event=event,
        operation_type="PARTICIPANT_CHECK_IN",
        idempotency_key=idempotency_key,
        request_hash=request_hash,
    )
    if replay:
        if replay.result_checkin_id is None:
            raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_RESULT_UNAVAILABLE"})
        check_in = await db.get(CheckIn, replay.result_checkin_id)
        if check_in is None:
            raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_RESULT_UNAVAILABLE"})
        return check_in

    check_in, created = await CheckInService.create(db, event, participant_id, payload.session_id)
    db.add(AttendanceMutation(
        organization_id=event.organization_id,
        event_id=event.id,
        actor_user_id=current_user.id,
        operation_type="PARTICIPANT_CHECK_IN",
        idempotency_key=idempotency_key,
        request_hash=request_hash,
        result_checkin_id=check_in.id,
        result_created=created,
    ))
    db.add(AuditLog(
        organization_id=event.organization_id,
        actor_user_id=current_user.id,
        actor_role=current_user.platform_role or current_user.role,
        resource_type="participant_checkin",
        resource_id=check_in.id,
        action_type="PARTICIPANT_CHECKED_IN" if created else "PARTICIPANT_CHECKIN_REPLAYED",
        new_state={
            "event_id": str(event.id),
            "participant_id": str(participant_id),
            "session_id": str(payload.session_id),
            "created": created,
        },
    ))
    await db.commit()
    await db.refresh(check_in)
    return check_in


@router.get("/{participant_id}/checkins", response_model=List[CheckInResponse])
async def list_participant_checkins(
    participant_id: uuid.UUID,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[CheckInResponse]:
    await enforce_event_operation(db, event.organization_id, event.id, "registration.read", user_id=current_user.id)
    q = select(CheckIn).where(
        CheckIn.event_id == event.id,
        CheckIn.participant_id == participant_id
    ).order_by(CheckIn.check_in_time.desc())
    result = await db.execute(q)
    return list(result.scalars().all())


@router.get("/analytics-dashboard")
async def get_registration_analytics(
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await enforce_event_operation(db, event.organization_id, event.id, "registration.analytics.view", user_id=current_user.id)
    from sqlalchemy import Date, cast, extract
    
    # 1. Base counts
    total_q = select(func.count(Participant.id)).where(Participant.event_id == event.id)
    checked_in_q = select(func.count(func.distinct(CheckIn.participant_id))).where(CheckIn.event_id == event.id)
    pending_pay_q = select(func.count(Participant.id)).where(Participant.event_id == event.id, Participant.paid_status.in_(["Unpaid", "Pending"]))
    confirmed_q = select(func.count(Participant.id)).where(Participant.event_id == event.id, Participant.paid_status == "Paid")
    vip_q = select(func.count(Participant.id)).where(Participant.event_id == event.id, Participant.role == "VIP")
    student_q = select(func.count(Participant.id)).where(Participant.event_id == event.id, Participant.role == "Student")
    
    local_country = "India"
    if event.location:
        parts = event.location.split(",")
        if parts:
            local_country = parts[-1].strip()
            
    intl_q = select(func.count(Participant.id)).where(
        Participant.event_id == event.id,
        Participant.country.is_not(None),
        Participant.country != "",
        Participant.country.ilike(f"%{local_country}%") == False
    )
    
    cancellations_q = select(func.count(Participant.id)).where(
        Participant.event_id == event.id,
        Participant.paid_status.in_(["Cancelled", "Canceled"])
    )
    
    refund_q = select(func.count(Participant.id)).where(
        Participant.event_id == event.id,
        Participant.paid_status.in_(["Refunded", "Refund Requested", "Pending Refund"])
    )
    
    # Pricing matrix mapping for dynamic revenue summation
    pricing_matrix = {}
    from app.modules.registration.models.ticket_type import TicketType
    p_matrix_q = select(TicketType).where(TicketType.event_id == event.id)
    p_matrix_res = await db.execute(p_matrix_q)
    for t in p_matrix_res.scalars().all():
        pricing_matrix[t.role_name.lower()] = t.price
        
    # Calculate actual revenue after discounts
    # Sum the actual amount from completed transactions if available, otherwise fallback to the role price
    from app.modules.registration.models.payment_transaction import PaymentTransaction
    from app.modules.registration.models.participant_registration import ParticipantRegistration
    
    rev_q = select(
        Participant.role,
        PaymentTransaction.amount
    ).select_from(Participant).outerjoin(
        ParticipantRegistration, ParticipantRegistration.participant_id == Participant.id
    ).outerjoin(
        PaymentTransaction, and_(
            PaymentTransaction.registration_id == ParticipantRegistration.id,
            PaymentTransaction.status == "completed"
        )
    ).where(
        Participant.event_id == event.id,
        Participant.paid_status == "Paid"
    )
    
    rev_res = await db.execute(rev_q)
    total_revenue = 0.0
    for role_name, tx_amount in rev_res.all():
        if tx_amount is not None:
            total_revenue += tx_amount
        else:
            total_revenue += pricing_matrix.get(role_name.lower(), 150.0)
        
    total_count = (await db.execute(total_q)).scalar_one() or 0
    checked_in_count = (await db.execute(checked_in_q)).scalar_one() or 0
    pending_pay_count = (await db.execute(pending_pay_q)).scalar_one() or 0
    confirmed_count = (await db.execute(confirmed_q)).scalar_one() or 0
    vip_count = (await db.execute(vip_q)).scalar_one() or 0
    student_count = (await db.execute(student_q)).scalar_one() or 0
    intl_count = (await db.execute(intl_q)).scalar_one() or 0
    cancellations_count = (await db.execute(cancellations_q)).scalar_one() or 0
    refund_count = (await db.execute(refund_q)).scalar_one() or 0
    
    # 2. Growth Trends (Daily registration count)
    growth_q = select(
        cast(Participant.registered_at, Date),
        func.count(Participant.id)
    ).where(Participant.event_id == event.id).group_by(cast(Participant.registered_at, Date)).order_by(cast(Participant.registered_at, Date))
    growth_res = (await db.execute(growth_q)).all()
    growth_trends = [{"date": str(r[0]), "count": r[1]} for r in growth_res]
    
    # 3. Participant Type Distribution
    roles_q = (
        select(
            ParticipantRole.name,
            func.count(Participant.id)
        )
        .select_from(Participant)
        .outerjoin(ParticipantRole, ParticipantRole.id == Participant.role_id)
        .where(Participant.event_id == event.id)
        .group_by(ParticipantRole.name)
    )
    roles_res = (await db.execute(roles_q)).all()
    role_dist = [{"role": r[0] or "Delegate", "count": r[1]} for r in roles_res]
    
    # 4. Registration Source Tracking
    sources_q = select(Participant.source, func.count(Participant.id)).where(
        Participant.event_id == event.id
    ).group_by(Participant.source)
    sources_res = (await db.execute(sources_q)).all()
    source_tracking = [{"source": r[0] or "Unknown", "count": r[1]} for r in sources_res]
    
    # 5. Payment Status Analytics
    payments_q = select(Participant.paid_status, func.count(Participant.id)).where(
        Participant.event_id == event.id
    ).group_by(Participant.paid_status)
    payments_res = (await db.execute(payments_q)).all()
    payment_analytics = [{"status": r[0] or "Unpaid", "count": r[1]} for r in payments_res]
    
    # 6. Country-based registrations
    countries_q = select(Participant.country, func.count(Participant.id)).where(
        Participant.event_id == event.id,
        Participant.country.is_not(None),
        Participant.country != ""
    ).group_by(Participant.country)
    countries_res = (await db.execute(countries_q)).all()
    country_registrations = [{"country": r[0], "count": r[1]} for r in countries_res]
    
    # 7. Daily/Hourly Heatmap
    heatmap_q = select(
        extract("dow", Participant.registered_at),
        extract("hour", Participant.registered_at),
        func.count(Participant.id)
    ).where(Participant.event_id == event.id).group_by(
        extract("dow", Participant.registered_at),
        extract("hour", Participant.registered_at)
    )
    heatmap_res = (await db.execute(heatmap_q)).all()
    heatmap_data = [
        {"day": int(r[0]), "hour": int(r[1]), "count": r[2]}
        for r in heatmap_res
    ]
    
    return {
        "kpis": {
            "total_registrations": total_count,
            "checked_in_attendees": checked_in_count,
            "pending_payments": pending_pay_count,
            "confirmed_attendees": confirmed_count,
            "vip_attendees": vip_count,
            "student_registrations": student_count,
            "international_attendees": intl_count,
            "cancellations": cancellations_count,
            "total_revenue": total_revenue,
            "refund_requests": refund_count
        },
        "growth_trends": growth_trends,
        "participant_type_distribution": role_dist,
        "registration_source_tracking": source_tracking,
        "payment_status_analytics": payment_analytics,
        "country_registrations": country_registrations,
        "daily_heatmap": heatmap_data
    }


@router.post("/fetch-from-speakers", response_model=MessageResponse)
async def fetch_participants_from_speakers(
    event: CurrentEvent,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """
    Fetch all speakers and add them as participants with 'Unpaid' paid_status and 'Speaker' role
    if their email or name is not already registered as a participant, and update the speaker's regno.
    """
    from app.modules.events.models.speaker import Speaker
    await enforce_event_operation(db, event.organization_id, event.id, "registration.manage", user_id=current_user.id)
    await enforce_event_operation(db, event.organization_id, event.id, "speakers.manage", user_id=current_user.id)

    # 1. Get all speakers for the event
    speakers_stmt = select(Speaker).where(Speaker.event_id == event.id, Speaker.deleted_at.is_(None))
    speakers_res = await db.execute(speakers_stmt)
    speakers = speakers_res.scalars().all()

    # 2. Get existing participants to build lookup sets for email and name
    existing_stmt = select(Participant).options(selectinload(Participant.role_rel)).where(Participant.event_id == event.id, Participant.deleted_at.is_(None))
    existing_res = await db.execute(existing_stmt)
    existing_participants = list(existing_res.scalars().all())

    def clean_name(first: str, last: str) -> str:
        fullName = f"{first or ''} {last or ''}"
        cleaned = " ".join(fullName.strip().lower().split())
        cleaned = re.sub(r'^(dr\.|prof\.|mr\.|ms\.|mrs\.|dr|prof)\s+', '', cleaned)
        return cleaned

    # 3. Resolve role prefix and sequential number tracking for Speaker role
    role_name = "Speaker"
    prefix = await get_role_prefix_for_event(db, event.id, role_name)
    used_numbers = await get_used_numbers_for_prefix(db, event.id, prefix)
    role_obj = await get_role_by_name(db, event.id, role_name)
    role_id = role_obj.id if role_obj else None

    # Get active pricing to determine paid_status for imported speakers
    from app.modules.events.models.event import Event
    from app.modules.registration.services.pricing_service import get_active_prices_for_event

    event_obj = await db.get(Event, event.id)
    payment_enabled = event_obj.registration_settings.get("payment_enabled", False) if (event_obj and event_obj.registration_settings) else False

    active_prices = {}
    if payment_enabled:
        active_prices = await get_active_prices_for_event(db, event_obj)

    role_price = active_prices.get(role_name, 0.0) if payment_enabled else 0.0
    paid_status = "Paid" if role_price <= 0.0 else "Unpaid"

    inserted_count = 0
    for s in speakers:
        email_lower = s.email.strip().lower() if s.email else ""
        s_name = clean_name(s.first_name, s.last_name)

        # Check duplication by name and email
        is_duplicate = False
        matching_p = None

        for p in existing_participants:
            p_email = p.email.strip().lower() if p.email else ""
            # Get additional emails if any
            custom = p.custom_fields or {}
            additional = [e.strip().lower() for e in (custom.get("additional_emails") or [])]
            p_name = clean_name(p.first_name, p.last_name)

            # Match criteria:
            # 1. Emails match directly
            # 2. Or one of the additional emails matches
            # 3. Or names match AND (emails match or one is missing)
            email_match = False
            if email_lower:
                if email_lower == p_email or email_lower in additional:
                    email_match = True

            if email_match:
                is_duplicate = True
                matching_p = p
                break
            elif s_name == p_name:
                if email_lower and p_email:
                    if email_lower == p_email or email_lower in additional:
                        is_duplicate = True
                        matching_p = p
                        break
                else:
                    # At least one has no email, and names match -> duplicate
                    is_duplicate = True
                    matching_p = p
                    break

        if is_duplicate:
            # Synchronize registration numbers and profile details if needed
            if matching_p:
                if matching_p.regno:
                    if s.regno != matching_p.regno:
                        s.regno = matching_p.regno
                else:
                    # Generate regno for both participant and speaker if missing
                    number = smallest_available_number(used_numbers)
                    used_numbers.add(number)
                    regno = f"{prefix}-{number:04d}"
                    matching_p.regno = regno
                    s.regno = regno
                
                # Copy/sync details from speaker if present on speaker
                if s.phone:
                    matching_p.phone = s.phone
                if s.affiliation:
                    matching_p.company = s.affiliation
                if s.designation:
                    matching_p.designation = s.designation
                if s.country:
                    matching_p.country = s.country
            continue

        # Generate unique sequential registration number for new participant
        number = smallest_available_number(used_numbers)
        used_numbers.add(number)
        regno = f"{prefix}-{number:04d}"

        # Sync regno to the Speaker model
        s.regno = regno

        # Create Participant record
        reservation = await UsageReservationService.reserve(
            db,
            organization_id=event.organization_id,
            event_id=event.id,
            limit_key="max_registrations",
            quantity=1,
            unit="registration",
            idempotency_key=f"speaker-participant-import:{idempotency_key}:{s.id}",
            metadata={"speaker_id": str(s.id)},
        )
        p = Participant(
            event_id=event.id,
            regno=regno,
            first_name=s.first_name,
            last_name=s.last_name,
            email=email_lower or None,
            phone=s.phone,
            role_id=role_id,
            role_rel=role_obj,
            company=s.affiliation,
            designation=s.designation,
            country=s.country,
            paid_status=paid_status,
            source="speaker_import",
            custom_fields={},
        )
        db.add(p)
        await db.flush()
        await UsageReservationService.consume(
            db,
            reservation.id,
            source="registration.speaker_participant_import",
            actor_user_id=current_user.id,
        )
        existing_participants.append(p)
        inserted_count += 1

    if inserted_count > 0 or any(db.is_modified(s) for s in speakers):
        await db.commit()

    return MessageResponse(message=f"Successfully imported {inserted_count} participants from speakers.")


