# backend/app/routers/participants.py
from __future__ import annotations

import csv
import io
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status, UploadFile, File
from loguru import logger
from openpyxl import Workbook, load_workbook
from sqlalchemy import func, select, delete, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_event, CurrentEvent
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.check_in import CheckIn
from app.modules.speakers.models.session import Session
from app.modules.registration.models.registration_form_config import RegistrationFormConfig
from app.modules.registration.models.participant_role import ParticipantRole
from app.modules.registration.schemas.participant import (
    ParticipantCreate, ParticipantUpdate, ParticipantResponse,
    CheckInCreate, CheckInResponse
)
from app.schemas.common import MessageResponse
from app.modules.registration.services.portal_service import (
    verify_and_resolve_registration,
    normalize_phone,
    phone_numbers_match,
)

router = APIRouter(prefix="/events/{event_id}/participants", tags=["participants"])


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
    {"id": "name", "name": "name", "label": "Full Name", "type": "text", "is_default": True, "is_required": True, "is_active": True},
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
    default_payload["role"] = str(default_payload.get("role") or "Delegate").strip()
    default_payload["source"] = str(default_payload.get("source") or "excel_import").strip()
    return ParticipantCreate(**default_payload)


async def insert_participants(
    db: AsyncSession,
    event_id: uuid.UUID,
    payload: List[ParticipantCreate],
    default_source: str,
) -> tuple[int, int, int]:
    from sqlalchemy import select, func
    from app.modules.venue.models.capacity_rule import CapacityRule
    from app.modules.registration.models.participant_registration import ParticipantRegistration

    inserted_count = 0
    waitlisted_count = 0
    merged_count = 0

    # 1. Fetch existing participants for this event to run in-memory duplication and merge checks
    existing_stmt = select(Participant).where(Participant.event_id == event_id)
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

    for item in to_insert_new:
        if slots_remaining > 0:
            # Fits in capacity -> Add directly as approved Participant
            role = item.role or "Delegate"
            if role not in role_state:
                prefix = await get_role_prefix_for_event(db, event_id, role)
                role_obj = await get_role_by_name(db, event_id, role)
                role_id = role_obj.id if role_obj else None
                role_state[role] = (prefix, await get_used_numbers_for_prefix(db, event_id, prefix), role_id, role_obj)

            prefix, used_numbers, role_id, role_obj = role_state[role]

            regno = item.regno
            if not regno:
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
                paid_status=item.paid_status or "Unpaid",
                source=item.source or default_source,
                custom_fields=item.custom_fields or {},
            )
            db.add(p)
            inserted_count += 1
            slots_remaining -= 1
        else:
            # Capacity exceeded -> Create ParticipantRegistration in waitlist/review
            status_str = "waitlisted" if (rule and rule.waitlist_enabled) else "pending_review"
            waitlist_position = next_wl_pos if status_str == "waitlisted" else None
            if waitlist_position:
                next_wl_pos += 1

            reg_data = {
                "name": item.name,
                "first_name": item.first_name or "",
                "last_name": item.last_name or "",
                "email": item.email,
                "phone": item.phone,
                "role": item.role or "Delegate",
                "company": item.company,
                "designation": item.designation,
                "country": item.country,
                "paid_status": item.paid_status or "Unpaid",
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
    db: AsyncSession = Depends(get_db),
) -> List[ParticipantResponse]:
    q = select(Participant).where(Participant.event_id == event.id)
    
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
        q = q.where(Participant.paid_status == paid_status)

    q = q.order_by(Participant.registered_at.desc())
    q = q.offset((page - 1) * page_size).limit(page_size)
    
    result = await db.execute(q)
    return list(result.scalars().all())


@router.get("/stats")
async def get_registration_stats(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
):
    total_q = select(func.count(Participant.id)).where(Participant.event_id == event.id)
    paid_q = select(func.count(Participant.id)).where(Participant.event_id == event.id, Participant.paid_status == "Paid")
    unpaid_q = select(func.count(Participant.id)).where(Participant.event_id == event.id, Participant.paid_status == "Unpaid")
    
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
        .where(Participant.event_id == event.id)
        .group_by(ParticipantRole.name)
    )

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
        "checkins": checkin_count,
        "role_breakdown": role_breakdown
    }


@router.post("", response_model=ParticipantResponse, status_code=status.HTTP_201_CREATED)
async def create_participant(
    payload: ParticipantCreate,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> ParticipantResponse:
    # Check duplicate email and verify merging logic
    if payload.email:
        merged_participant = await verify_and_resolve_registration(
            db=db,
            event_id=event.id,
            email=payload.email,
            name=payload.name,
            phone=payload.phone,
            confirm_merge=payload.confirm_merge
        )
        if merged_participant:
            return merged_participant

    # Ensure sequential regno is calculated
    regno = payload.regno
    if not regno:
        regno = await generate_next_regno(db, event.id, payload.role)

    # Resolve role_id and role_rel from payload.role_id or payload.role name
    role_id = payload.role_id
    role_obj = None
    if role_id:
        role_obj = await db.get(ParticipantRole, role_id)
    else:
        role_obj = await get_role_by_name(db, event.id, payload.role)
        role_id = role_obj.id if role_obj else None

    participant = Participant(
        event_id=event.id,
        regno=regno,
        first_name=payload.first_name or "",
        last_name=payload.last_name or "",
        email=payload.email,
        phone=payload.phone,
        role_id=role_id,
        role_rel=role_obj,
        company=payload.company,
        designation=payload.designation,
        country=payload.country,
        paid_status=payload.paid_status,
        source=payload.source,
        custom_fields=payload.custom_fields or {},
    )
    db.add(participant)
    await db.commit()
    await db.refresh(participant)
    return participant


@router.post("/bulk", response_model=MessageResponse)
async def bulk_upload_participants(
    payload: List[ParticipantCreate],
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    inserted, waitlisted, merged = await insert_participants(db, event.id, payload, "bulk_upload")
    return MessageResponse(
        message=f"Import complete: {inserted} active participants imported, {waitlisted} waitlisted, {merged} merged."
    )


@router.post("/bulk-delete", response_model=MessageResponse)
async def bulk_delete_participants(
    participant_ids: List[uuid.UUID],
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    if not participant_ids:
        raise HTTPException(status_code=400, detail="No participants selected.")

    result = await db.execute(
        delete(Participant)
        .where(Participant.event_id == event.id, Participant.id.in_(participant_ids))
        .returning(Participant.id)
    )
    deleted_count = len(result.scalars().all())
    await db.commit()
    return MessageResponse(message=f"Deleted {deleted_count} participant registrations.")


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
        if field_id == "name":
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


@router.post("/import-excel", response_model=MessageResponse)
async def import_participants_excel(
    event: CurrentEvent,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
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
        payload: List[ParticipantCreate] = []
        for values in rows[1:]:
            row = {
                headers[index]: values[index]
                for index in range(min(len(headers), len(values)))
                if headers[index]
            }
            item = map_import_row(row, fields)
            if item:
                payload.append(item)

        inserted, waitlisted, merged = await insert_participants(db, event.id, payload, "excel_import")
        return MessageResponse(
            message=f"Import complete: {inserted} active participants imported, {waitlisted} waitlisted, {merged} merged."
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
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
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

        inserted, waitlisted, merged = await insert_participants(db, event.id, payload, "csv_import")
        return MessageResponse(
            message=f"Import complete: {inserted} active participants imported, {waitlisted} waitlisted, {merged} merged."
        )
        
    except Exception as e:
        logger.error(f"Error importing CSV: {e}")
        raise HTTPException(status_code=422, detail=f"Failed to process CSV file: {str(e)}")


@router.patch("/{participant_id}", response_model=ParticipantResponse)
async def update_participant(
    participant_id: uuid.UUID,
    payload: ParticipantUpdate,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> ParticipantResponse:
    q = select(Participant).where(Participant.id == participant_id, Participant.event_id == event.id)
    result = await db.execute(q)
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Participant not found.")

    update_data = payload.model_dump(exclude_unset=True)
    
    # Rebuild name if name fields are updated (except when name is directly set and pre-split by schema validator)
    if "name" in update_data:
        pass
    elif "first_name" in update_data or "last_name" in update_data:
        new_fn = update_data.get("first_name", p.first_name) or ""
        new_ln = update_data.get("last_name", p.last_name) or ""
        update_data["first_name"] = new_fn
        update_data["last_name"] = new_ln
        update_data["name"] = f"{new_fn} {new_ln}".strip()

    # Check if the role is changing and if it resolves to a different prefix
    role_changed = False
    if "role_id" in update_data:
        new_role_id = update_data["role_id"]
        if new_role_id != p.role_id:
            if new_role_id:
                new_role_obj = await db.get(ParticipantRole, new_role_id)
                new_role = new_role_obj.name if new_role_obj else "Delegate"
                old_prefix = await get_role_prefix_for_event(db, event.id, p.role)
                new_prefix = await get_role_prefix_for_event(db, event.id, new_role)
                if old_prefix != new_prefix:
                    role_changed = True
                p.role_id = new_role_id
                p.role_rel = new_role_obj
            else:
                p.role_id = None
                p.role_rel = None
    elif "role" in update_data:
        new_role = update_data["role"]
        if new_role != p.role:
            if new_role:
                old_prefix = await get_role_prefix_for_event(db, event.id, p.role)
                new_prefix = await get_role_prefix_for_event(db, event.id, new_role)
                if old_prefix != new_prefix:
                    role_changed = True
                # Lookup role_id
                role_obj = await get_role_by_name(db, event.id, new_role)
                if role_obj:
                    p.role_id = role_obj.id
                    p.role_rel = role_obj
            else:
                p.role_id = None
                p.role_rel = None

    for field, value in update_data.items():
        if field not in ("role", "role_id"):
            setattr(p, field, value)

    # Regenerate regno if role prefix changed and new regno was not explicitly provided
    if role_changed and "regno" not in update_data:
        p.regno = await generate_next_regno(db, event.id, p.role)

    await db.commit()
    await db.refresh(p)
    return p


@router.delete("/{participant_id}", response_model=MessageResponse)
async def delete_participant(
    participant_id: uuid.UUID,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    q = select(Participant).where(Participant.id == participant_id, Participant.event_id == event.id)
    result = await db.execute(q)
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Participant not found.")

    await db.delete(p)
    await db.commit()
    return MessageResponse(message="Participant registration removed successfully.")


@router.post("/{participant_id}/checkin", response_model=CheckInResponse)
async def checkin_participant(
    participant_id: uuid.UUID,
    payload: CheckInCreate,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> CheckInResponse:
    # 1. Verify participant exists
    p_q = select(Participant).where(Participant.id == participant_id, Participant.event_id == event.id)
    p = (await db.execute(p_q)).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Participant not found.")

    # 2. Verify session exists
    s_q = select(Session).where(Session.id == payload.session_id, Session.event_id == event.id)
    session = (await db.execute(s_q)).scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")

    # 3. Check if already checked in
    existing_q = select(CheckIn).where(
        CheckIn.event_id == event.id,
        CheckIn.participant_id == participant_id,
        CheckIn.session_id == payload.session_id
    )
    existing = (await db.execute(existing_q)).scalar_one_or_none()
    if existing:
        return existing  # Idempotent return

    check_in = CheckIn(
        event_id=event.id,
        participant_id=participant_id,
        session_id=payload.session_id
    )
    db.add(check_in)
    await db.commit()
    await db.refresh(check_in)
    return check_in


@router.get("/{participant_id}/checkins", response_model=List[CheckInResponse])
async def list_participant_checkins(
    participant_id: uuid.UUID,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> List[CheckInResponse]:
    q = select(CheckIn).where(
        CheckIn.event_id == event.id,
        CheckIn.participant_id == participant_id
    ).order_by(CheckIn.check_in_time.desc())
    result = await db.execute(q)
    return list(result.scalars().all())


@router.get("/analytics-dashboard")
async def get_registration_analytics(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
):
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
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """
    Fetch all speakers and add them as participants with 'Unpaid' paid_status and 'Speaker' role
    if their email is not already registered as a participant.
    """
    from app.modules.speakers.models.speaker import Speaker

    # 1. Get all speakers for the event
    speakers_stmt = select(Speaker).where(Speaker.event_id == event.id)
    speakers_res = await db.execute(speakers_stmt)
    speakers = speakers_res.scalars().all()

    # 2. Get existing participant emails
    existing_stmt = select(Participant.email).where(Participant.event_id == event.id)
    existing_res = await db.execute(existing_stmt)
    existing_emails = {email.lower() for email in existing_res.scalars().all() if email}

    payloads = []
    for s in speakers:
        if not s.email:
            continue
        email_lower = s.email.lower()
        if email_lower in existing_emails:
            continue

        payloads.append(ParticipantCreate(
            first_name=s.first_name,
            last_name=s.last_name,
            name=s.full_name,
            email=email_lower,
            phone=s.phone,
            company=s.affiliation,
            country=s.country,
            role="Speaker",
            paid_status="Unpaid",
            source="speaker_import"
        ))
        existing_emails.add(email_lower)

    if payloads:
        # Re-use insert_participants helper
        inserted_count, _, _ = await insert_participants(db, event.id, payloads, "speaker_import")
    else:
        inserted_count = 0

    return MessageResponse(message=f"Successfully imported {inserted_count} participants from speakers.")


