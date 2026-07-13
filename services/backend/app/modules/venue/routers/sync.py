# backend/app/routers/sync.py
from __future__ import annotations

import uuid
from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import DeviceAuth, get_db
from app.modules.events.models.session import Session
from app.modules.events.models.session_speaker import SessionSpeaker
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.badge_models import Badge, BadgeScan, BadgePrintJob
from app.modules.registration.models.print_template import PrintTemplate
from app.modules.events.models.capacity_rule import CapacityRule
from app.modules.registration.models.participant_role import ParticipantRole
from app.modules.analytics.models.attendance_log import AttendanceLog
from app.modules.registration.models.check_in import CheckIn
from pydantic import BaseModel

router = APIRouter(prefix="/sync", tags=["sync"])

@router.get("/events/{event_id}/queue")
async def get_sync_payload(
    event_id: uuid.UUID,
    device_auth: DeviceAuth,
    db: AsyncSession = Depends(get_db)
):
    """
    Consolidated endpoint for Venue Server to pull latest configurations, schedule,
    approved participants, badges, templates, capacity rules, and roles.
    """
    _require_device_event(device_auth, event_id)

    # 1. Fetch sessions & speakers
    sessions_result = await db.execute(
        select(Session)
        .options(
            selectinload(Session.session_speakers).selectinload(SessionSpeaker.speaker),
            selectinload(Session.session_speakers).selectinload(SessionSpeaker.presentation_files)
        )
        .where(Session.event_id == event_id)
    )
    sessions = sessions_result.scalars().all()
    
    sessions_list = []
    for s in sessions:
        speakers_list = []
        for ss in s.session_speakers:
            curr_file = None
            if ss.presentation_files:
                for f in ss.presentation_files:
                    if f.is_current_version:
                        curr_file = f
                        break
                if not curr_file and len(ss.presentation_files) > 0:
                    curr_file = ss.presentation_files[0]
            
            speakers_list.append({
                "speaker_id": str(ss.speaker_id),
                "first_name": ss.speaker.first_name,
                "last_name": ss.speaker.last_name,
                "file_id": str(curr_file.id) if curr_file else None,
                "storage_path": curr_file.storage_path if curr_file else None,
                "file_format": curr_file.file_format if curr_file else None,
                "upload_status": curr_file.upload_status if curr_file else None,
                "talk_order": ss.talk_order,
                "presentation_title": ss.presentation_title,
                "talk_duration_minutes": ss.talk_duration_minutes,
                "duration_minutes": ss.talk_duration_minutes, # fallback
            })
        sessions_list.append({
            "id": str(s.id),
            "session_code": s.session_code,
            "name": s.name,
            "room_id": str(s.room_id) if s.room_id else None,
            "start_time": s.start_time.isoformat() if s.start_time else None,
            "end_time": s.end_time.isoformat() if s.end_time else None,
            "status": s.status,
            "speakers": speakers_list
        })

    # 2. Fetch all participants for this event
    part_result = await db.execute(
        select(Participant).where(Participant.event_id == event_id)
    )
    participants = part_result.scalars().all()
    participants_list = [{
        "id": str(p.id),
        "regno": p.regno,
        "name": p.name,
        "first_name": p.first_name,
        "last_name": p.last_name,
        "email": p.email,
        "phone": p.phone,
        "role": p.role,
        "company": p.company,
        "designation": p.designation,
        "country": p.country,
        "paid_status": p.paid_status,
        "source": p.source,
        "custom_fields": p.custom_fields,
        "registered_at": p.registered_at.isoformat() if p.registered_at else None
    } for p in participants]

    # 3. Fetch badges for the participants of this event
    badge_result = await db.execute(
        select(Badge)
        .join(Participant)
        .where(Participant.event_id == event_id)
    )
    badges = badge_result.scalars().all()
    badges_list = [{
        "id": str(b.id),
        "participant_id": str(b.participant_id),
        "badge_code": b.badge_code,
        "qr_token": b.qr_token,
        "barcode": b.barcode,
        "nfc_uid": b.nfc_uid,
        "template_id": str(b.template_id) if b.template_id else None,
        "status": b.status,
        "issued_at": b.issued_at.isoformat() if b.issued_at else None,
        "created_at": b.created_at.isoformat() if b.created_at else None,
        "updated_at": b.updated_at.isoformat() if b.updated_at else None
    } for b in badges]

    # 4. Fetch print templates for this event
    tmpl_result = await db.execute(
        select(PrintTemplate).where(PrintTemplate.event_id == event_id)
    )
    templates = tmpl_result.scalars().all()
    templates_list = [{
        "id": str(t.id),
        "template_name": t.template_name,
        "template_type": t.template_type,
        "template_data": t.template_data,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None
    } for t in templates]

    # 5. Fetch capacity rules for this event
    cap_result = await db.execute(
        select(CapacityRule).where(CapacityRule.event_id == event_id)
    )
    rules = cap_result.scalars().all()
    rules_list = [{
        "id": str(r.id),
        "session_id": str(r.session_id) if r.session_id else None,
        "room_id": str(r.room_id) if r.room_id else None,
        "capacity": r.capacity,
        "waitlist_enabled": r.waitlist_enabled,
        "auto_promote": r.auto_promote,
        "priority_enabled": r.priority_enabled
    } for r in rules]

    # 6. Fetch participant roles for this event
    role_result = await db.execute(
        select(ParticipantRole).where(ParticipantRole.event_id == event_id)
    )
    roles = role_result.scalars().all()
    roles_list = [{
        "id": str(rl.id),
        "category": rl.category,
        "name": rl.name,
        "role_code": rl.role_code,
        "is_active": rl.is_active,
        "is_default": rl.is_default,
        "sort_order": rl.sort_order
    } for rl in roles]

    return {
        "event_id": str(event_id),
        "sessions": sessions_list,
        "participants": participants_list,
        "badges": badges_list,
        "print_templates": templates_list,
        "capacity_rules": rules_list,
        "participant_roles": roles_list
    }


class PushItemSchema(BaseModel):
    id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID
    action: str
    payload: dict
    created_at: datetime


@router.post("/events/{event_id}/push")
async def push_sync_payload(
    event_id: uuid.UUID,
    payload: List[PushItemSchema],
    device_auth: DeviceAuth,
    db: AsyncSession = Depends(get_db)
):
    _require_device_event(device_auth, event_id)
    processed_ids = []
    errors = []
    
    for item in payload:
        try:
            if item.entity_type == "attendance_log":
                if item.action == "create":
                    p_id = uuid.UUID(item.payload["participant_id"])
                    s_id = uuid.UUID(item.payload["session_id"])
                    await _require_participant_and_session(db, event_id, p_id, s_id)
                    existing_log = await db.get(AttendanceLog, item.entity_id)
                    if not existing_log:
                        checkin_time = datetime.fromisoformat(item.payload["checkin_time"])
                        
                        log = AttendanceLog(
                            id=item.entity_id,
                            participant_id=p_id,
                            session_id=s_id,
                            method=item.payload.get("method", "qr"),
                            device_id=item.payload.get("device_id", "unknown"),
                            checkin_time=checkin_time,
                            created_at=item.created_at
                        )
                        db.add(log)
                        
                        # Dual write to legacy CheckIn
                        q_checkin = select(CheckIn).where(
                            CheckIn.event_id == event_id,
                            CheckIn.participant_id == p_id,
                            CheckIn.session_id == s_id
                        )
                        existing_checkin = (await db.execute(q_checkin)).scalar_one_or_none()
                        if not existing_checkin:
                            checkin = CheckIn(
                                event_id=event_id,
                                participant_id=p_id,
                                session_id=s_id,
                                check_in_time=checkin_time
                            )
                            db.add(checkin)
                            
                elif item.action == "update":
                    log = await _get_event_attendance_log(db, event_id, item.entity_id)
                    if log:
                        if "checkout_time" in item.payload and item.payload["checkout_time"]:
                            log.checkout_time = datetime.fromisoformat(item.payload["checkout_time"])
                        if "duration" in item.payload:
                            log.duration = item.payload["duration"]
                            
            elif item.entity_type == "badge_scan":
                if item.action == "create":
                    b_id = uuid.UUID(item.payload["badge_id"])
                    await _require_event_badge(db, event_id, b_id)
                    existing_scan = await db.get(BadgeScan, item.entity_id)
                    if not existing_scan:
                        scan = BadgeScan(
                            id=item.entity_id,
                            badge_id=b_id,
                            location=item.payload["location"],
                            scan_type=item.payload.get("scan_type", "entry"),
                            created_at=datetime.fromisoformat(item.payload["created_at"])
                        )
                        db.add(scan)
                        
            elif item.entity_type == "badge_print_job":
                if item.action == "create":
                    b_id = uuid.UUID(item.payload["badge_id"])
                    await _require_event_badge(db, event_id, b_id)
                    existing_job = await db.get(BadgePrintJob, item.entity_id)
                    if not existing_job:
                        pr_id = uuid.UUID(item.payload["printer_id"])
                        job = BadgePrintJob(
                            id=item.entity_id,
                            badge_id=b_id,
                            printer_id=pr_id,
                            status=item.payload.get("status", "queued"),
                            queued_at=datetime.fromisoformat(item.payload["queued_at"]),
                            printed_at=datetime.fromisoformat(item.payload["printed_at"]) if item.payload.get("printed_at") else None
                        )
                        db.add(job)
                        
                        # Update badge status to printed if it's completed
                        if job.status == "completed":
                            badge = await db.get(Badge, b_id)
                            if badge:
                                badge.status = "printed"
            else:
                raise ValueError("UNSUPPORTED_SYNC_ENTITY")
            
            processed_ids.append(item.id)
        except Exception as e:
            errors.append({"id": str(item.id), "error": str(e)})
            
    await db.commit()
    return {"processed_ids": processed_ids, "errors": errors}


def _require_device_event(device_auth: dict, event_id: uuid.UUID) -> None:
    if device_auth["event_id"] != event_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found.")


async def _require_participant_and_session(
    db: AsyncSession,
    event_id: uuid.UUID,
    participant_id: uuid.UUID,
    session_id: uuid.UUID,
) -> None:
    participant_exists = await db.scalar(
        select(Participant.id).where(
            Participant.id == participant_id,
            Participant.event_id == event_id,
        )
    )
    session_exists = await db.scalar(
        select(Session.id).where(Session.id == session_id, Session.event_id == event_id)
    )
    if participant_exists is None or session_exists is None:
        raise ValueError("SYNC_ENTITY_OUTSIDE_DEVICE_EVENT")


async def _require_event_badge(
    db: AsyncSession, event_id: uuid.UUID, badge_id: uuid.UUID
) -> None:
    badge_exists = await db.scalar(
        select(Badge.id)
        .join(Participant, Participant.id == Badge.participant_id)
        .where(Badge.id == badge_id, Participant.event_id == event_id)
    )
    if badge_exists is None:
        raise ValueError("SYNC_ENTITY_OUTSIDE_DEVICE_EVENT")


async def _get_event_attendance_log(
    db: AsyncSession, event_id: uuid.UUID, log_id: uuid.UUID
) -> AttendanceLog | None:
    return await db.scalar(
        select(AttendanceLog)
        .join(Participant, Participant.id == AttendanceLog.participant_id)
        .where(AttendanceLog.id == log_id, Participant.event_id == event_id)
    )

