# backend/app/routers/srr.py
from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_user, get_current_event, CurrentEvent
from app.modules.events.models.speaker import Speaker
from app.modules.venue.models.srr_checkin import SRRCheckin
from app.modules.venue.models.srr_station import SRRStation
from app.modules.identity.models.user import User
from app.modules.venue.schemas.srr import (
    StationCreate, StationUpdate, StationResponse,
    StationAssignRequest, CheckinResponse,
    QRCheckinRequest, QRCheckinResponse,
)
from app.schemas.common import MessageResponse
from app.modules.notifications.services.notification_service import notify_speaker_checked_in
from app.websocket.events import broadcast_srr_event, EventType
from app.core.dependencies.feature_gate import require_event_operation

router = APIRouter(
    prefix="/events/{event_id}/srr",
    tags=["srr"],
    dependencies=[require_event_operation("venue.sync")],
)
from app.modules.venue.application.commands import SrrStationCommandService
from app.modules.venue.application.queries import SrrQueryService


# ── Stations ──────────────────────────────────────────────────

@router.get("/stations", response_model=List[StationResponse])
async def list_stations(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> List[StationResponse]:
    stations = await SrrQueryService(db).list_stations(
        organization_id=event.organization_id,
        event_id=event.id,
    )
    return [StationResponse.model_validate(station) for station in stations]


@router.post("/stations", response_model=StationResponse, status_code=status.HTTP_201_CREATED)
async def create_station(
    payload: StationCreate,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> StationResponse:
    station = await SrrStationCommandService(db).create(
        event_id=event.id,
        data=payload.model_dump(),
    )
    return StationResponse.model_validate(station)


@router.patch("/stations/{station_id}", response_model=StationResponse)
async def update_station(
    station_id: uuid.UUID,
    payload: StationUpdate,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> StationResponse:
    station = await SrrStationCommandService(db).update(
        event_id=event.id,
        station_id=station_id,
        data=payload.model_dump(exclude_unset=True),
    )
    return StationResponse.model_validate(station)


@router.post("/stations/assign", response_model=MessageResponse)
async def assign_speaker_to_station(
    payload: StationAssignRequest,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    station, speaker, _ = await SrrStationCommandService(db).assign(
        event_id=event.id,
        station_id=payload.station_id,
        speaker_id=payload.speaker_id,
        checked_in_by=current_user.id,
        checkin_method="manual",
    )

    await notify_speaker_checked_in(event.id, speaker, station.station_number)
    await broadcast_srr_event(event.id, EventType.SRR_STATION_ASSIGNED, {
        "station_number": station.station_number,
        "speaker_name": speaker.full_name,
        "speaker_id": str(speaker.id),
    })
    return MessageResponse(message=f"{speaker.full_name} assigned to Station #{station.station_number}.")


@router.post("/stations/{station_id}/release", response_model=MessageResponse)
async def release_station(
    station_id: uuid.UUID,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    station = await SrrStationCommandService(db).release(
        event_id=event.id,
        station_id=station_id,
    )
    await broadcast_srr_event(event.id, EventType.SRR_STATION_FREED, {
        "station_id": str(station_id), "station_number": station.station_number,
    })
    return MessageResponse(message="Station released.")


# ── QR check-in (kiosk — no JWT required) ─────────────────────

@router.post("/checkin/qr", response_model=QRCheckinResponse)
async def qr_checkin(
    event_id: uuid.UUID,
    payload: QRCheckinRequest,
    db: AsyncSession = Depends(get_db),
) -> QRCheckinResponse:
    """Kiosk App calls this when scanning a speaker QR badge. Token-auth only."""
    scanned_token = payload.token.strip()
    
    speaker = None
    
    # 1. Try to see if scanned_token is a Participant Registration Number (e.g. REG-0001)
    from app.modules.registration.models.participant import Participant
    from sqlalchemy import func
    
    part_result = await db.execute(
        select(Participant).where(
            Participant.regno == scanned_token,
            Participant.event_id == event_id
        )
    )
    part = part_result.scalar_one_or_none()
    if part and part.email:
        # Find speaker with this email for the event
        spk_result = await db.execute(
            select(Speaker).where(
                func.lower(Speaker.email) == part.email.lower(),
                Speaker.event_id == event_id,
            )
        )
        speaker = spk_result.scalar_one_or_none()

    if not speaker:
        # 2. Try to extract the access code from the custom QR text: "Speaker: ...\nAccess Code: CODE"
        import re
        access_code = None
        code_match = re.search(r"Access Code:\s*([A-Za-z0-9]+)", scanned_token, re.IGNORECASE)
        if code_match:
            access_code = code_match.group(1).upper()
        else:
            # Fallback to check if it's a URL with /upload/{code}
            url_match = re.search(r"/upload/([A-Za-z0-9]+)", scanned_token, re.IGNORECASE)
            if url_match:
                access_code = url_match.group(1).upper()
            elif len(scanned_token) <= 20 and scanned_token.isalnum():
                # If the token is a short alphanumeric code, it is the raw access code
                access_code = scanned_token.upper()

        if access_code:
            # Find the speaker by unique speaker_code (access code)
            speaker_result = await db.execute(
                select(Speaker).where(
                    Speaker.speaker_code == access_code,
                    Speaker.event_id == event_id,
                )
            )
            speaker = speaker_result.scalar_one_or_none()

    # Fallback to legacy upload_token hashing if not found by access code
    if not speaker:
        token_hash = hashlib.sha256(scanned_token.encode()).hexdigest()
        speaker_result = await db.execute(
            select(Speaker).where(
                Speaker.upload_token == token_hash,
                Speaker.event_id == event_id,
            )
        )
        speaker = speaker_result.scalar_one_or_none()


    if speaker is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Speaker QR not recognised.")

    station_result = await db.execute(
        select(SRRStation).where(
            SRRStation.event_id == event_id,
            SRRStation.status == "idle",
            SRRStation.is_active.is_(True),
        ).order_by(SRRStation.station_number).limit(1)
    )
    station = station_result.scalar_one_or_none()
    if station is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail="No stations available. Please see a technician.")

    station, speaker, checkin = await SrrStationCommandService(db).assign(
        event_id=event_id,
        station_id=station.id,
        speaker_id=speaker.id,
        checked_in_by=None,
        checkin_method="qr_scan",
        mark_speaker_checked_in=True,
    )

    await notify_speaker_checked_in(event_id, speaker, station.station_number)
    await broadcast_srr_event(event_id, EventType.SPEAKER_CHECKED_IN, {
        "speaker_name": speaker.full_name, "station_number": station.station_number,
    })

    return QRCheckinResponse(
        speaker_id=speaker.id,
        speaker_name=speaker.full_name,
        station_number=station.station_number,
        station_id=station.id,
        checkin_id=checkin.id,
    )


@router.get("/checkins", response_model=List[CheckinResponse])
async def list_checkins(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> List[CheckinResponse]:
    checkins = await SrrQueryService(db).list_checkins(
        organization_id=event.organization_id,
        event_id=event.id,
    )
    return [CheckinResponse.model_validate(checkin) for checkin in checkins]


