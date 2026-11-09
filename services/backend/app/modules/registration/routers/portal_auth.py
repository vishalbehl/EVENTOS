"""
Portal OTP Authentication Router
app/modules/registration/routers/portal_auth.py

Endpoints
---------
POST /portal/auth/request-otp   — generate & email an OTP
POST /portal/auth/verify-otp    — verify OTP → issue portal JWT
POST /portal/auth/resend-otp    — invalidate old OTPs and send a fresh one
"""
from __future__ import annotations

import hashlib
import logging
import random
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status
from jose import jwt
from pydantic import BaseModel, EmailStr
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import get_db
from app.modules.events.models.event import Event
from app.modules.events.models.event_user import EventUser
from app.modules.events.models.speaker import Speaker
from app.modules.registration.models.participant import Participant
from app.modules.abstracts.models import AbstractReviewer
from app.modules.identity.models.portal_otp_token import PortalOtpToken
from app.modules.notifications.services.email_service import send_email
from app.core.dependencies.feature_gate import enforce_event_operation
from app.modules.registration.dependencies.portal_auth import PortalUser, get_portal_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/portal/auth", tags=["portal-auth"])
users_router = APIRouter(prefix="/portal/users", tags=["portal-users"])

# ── Constants ─────────────────────────────────────────────────────────────
_OTP_TTL_MINUTES = 10
_THROTTLE_WINDOW_MINUTES = 15
_THROTTLE_MAX_REQUESTS = 5
_MAX_VERIFY_ATTEMPTS = 5
_JWT_ALGORITHM = "HS256"
_JWT_TTL_DAYS = 7


# ── Pydantic schemas ───────────────────────────────────────────────────────

class OtpRequestBody(BaseModel):
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    event_id: Optional[uuid.UUID] = None


class OtpVerifyBody(BaseModel):
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    event_id: Optional[uuid.UUID] = None
    otp: str


class EventUserProfileResponse(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    email: str
    phone: Optional[str] = None
    full_name: Optional[str] = None
    title: Optional[str] = None
    affiliation: Optional[str] = None
    designation: Optional[str] = None
    country: Optional[str] = None
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    roles: list[str] = []
    is_registered: bool = False
    is_speaker: bool = False
    is_reviewer: bool = False
    reviewer_status: str = "NONE"
    profile_data: dict = {}

    class Config:
        from_attributes = True


class EventUserUpdateBody(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    title: Optional[str] = None
    affiliation: Optional[str] = None
    designation: Optional[str] = None
    country: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    profile_data: Optional[dict] = None


class TokenResponse(BaseModel):
    access_token: str
    token: str
    token_type: str = "bearer"
    dev_otp: Optional[str] = None
    user: Optional[EventUserProfileResponse] = None


class MessageResponse(BaseModel):
    message: str
    dev_otp: Optional[str] = None


# ── Helpers ────────────────────────────────────────────────────────────────

def _generate_otp() -> str:
    """Return a zero-padded 6-digit OTP as a string."""
    return f"{random.SystemRandom().randint(0, 999999):06d}"


def _hash_otp(otp: str) -> str:
    """bcrypt-hash an OTP. 12 rounds."""
    return bcrypt.hashpw(otp.encode(), bcrypt.gensalt(rounds=12)).decode()


def _verify_otp(otp: str, otp_hash: str) -> bool:
    return bcrypt.checkpw(otp.encode(), otp_hash.encode())


def _email_sha256(email: str) -> str:
    """One-way hash of email for audit logs — prevents enumeration in logs."""
    return hashlib.sha256(email.lower().encode()).hexdigest()[:16]


async def _get_event(event_id: uuid.UUID, db: AsyncSession) -> Optional[Event]:
    result = await db.execute(select(Event).where(Event.id == event_id))
    return result.scalar_one_or_none()


async def _upsert_event_user(
    db: AsyncSession,
    event_id: uuid.UUID,
    email: str,
    phone: Optional[str] = None,
) -> EventUser:
    normalized_email = email.strip().lower()
    now = datetime.now(timezone.utc)

    # Fetch event to get organization_id
    event_stmt = select(Event).where(Event.id == event_id)
    event_res = await db.execute(event_stmt)
    event = event_res.scalar_one_or_none()
    org_id = event.organization_id if event else None

    # Find existing EventUser
    user_stmt = select(EventUser).where(
        EventUser.event_id == event_id,
        EventUser.email == normalized_email,
    )
    user_res = await db.execute(user_stmt)
    event_user = user_res.scalar_one_or_none()

    if not event_user:
        event_user = EventUser(
            event_id=event_id,
            organization_id=org_id,
            email=normalized_email,
            phone=phone,
            roles=["DELEGATE"],
            profile_data={},
            last_login_at=now,
        )
        db.add(event_user)
    else:
        event_user.last_login_at = now
        if phone and not event_user.phone:
            event_user.phone = phone
        if org_id and not event_user.organization_id:
            event_user.organization_id = org_id

    # Check participant record
    part_stmt = (
        select(Participant)
        .where(
            Participant.event_id == event_id,
            func.lower(Participant.email) == normalized_email,
        )
        .order_by(Participant.registered_at.desc())
        .limit(1)
    )
    part_res = await db.execute(part_stmt)
    part = part_res.scalar_one_or_none()
    if part:
        event_user.is_registered = True
        event_user.participant_id = part.id
        p_name = f"{part.first_name or ''} {part.last_name or ''}".strip()
        if not event_user.full_name and p_name:
            event_user.full_name = p_name
        if not event_user.phone and part.phone:
            event_user.phone = part.phone
        if not event_user.affiliation and (getattr(part, "company", None) or getattr(part, "affiliation", None)):
            event_user.affiliation = getattr(part, "company", None) or getattr(part, "affiliation", None)
        if not event_user.designation and getattr(part, "designation", None):
            event_user.designation = getattr(part, "designation", None)
        if not event_user.country and getattr(part, "country", None):
            event_user.country = getattr(part, "country", None)

    # Check speaker record
    spk_stmt = (
        select(Speaker)
        .where(
            Speaker.event_id == event_id,
            func.lower(Speaker.email) == normalized_email,
        )
        .order_by(Speaker.id.desc())
        .limit(1)
    )
    spk_res = await db.execute(spk_stmt)
    spk = spk_res.scalar_one_or_none()
    current_roles = list(event_user.roles or ["DELEGATE"])
    if spk:
        event_user.is_speaker = True
        event_user.speaker_id = spk.id
        if "SPEAKER" not in current_roles:
            current_roles.append("SPEAKER")
        spk_name = getattr(spk, "full_name", None) or f"{getattr(spk, 'first_name', '')} {getattr(spk, 'last_name', '')}".strip()
        if not event_user.full_name and spk_name:
            event_user.full_name = spk_name
        if not event_user.bio and getattr(spk, "bio", None):
            event_user.bio = spk.bio

    # Check reviewer record
    rev_stmt = (
        select(AbstractReviewer)
        .where(
            AbstractReviewer.event_id == event_id,
            func.lower(AbstractReviewer.email) == normalized_email,
        )
        .order_by(AbstractReviewer.id.desc())
        .limit(1)
    )
    rev_res = await db.execute(rev_stmt)
    rev = rev_res.scalar_one_or_none()
    if rev:
        event_user.is_reviewer = True
        event_user.reviewer_id = rev.id
        rev_status = rev.status.upper() if rev.status else "INVITED"
        if rev_status in ("ACTIVE", "ACCEPTED") or rev.accepted_at is not None:
            event_user.reviewer_status = "ACCEPTED"
            if "REVIEWER" not in current_roles:
                current_roles.append("REVIEWER")
        else:
            event_user.reviewer_status = rev_status
            if "REVIEWER" in current_roles and rev_status != "ACCEPTED":
                current_roles.remove("REVIEWER")
        if not event_user.full_name and rev.full_name:
            event_user.full_name = rev.full_name
    else:
        event_user.is_reviewer = False
        event_user.reviewer_status = "NONE"
        if "REVIEWER" in current_roles:
            current_roles.remove("REVIEWER")

    event_user.roles = current_roles
    await db.flush()
    return event_user


async def _throttle_check(email: str, event_id: uuid.UUID, db: AsyncSession) -> None:
    """Raise 429 if 5+ OTP rows exist in the last 15 min for this email+event."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=_THROTTLE_WINDOW_MINUTES)
    stmt = select(func.count()).where(
        and_(
            PortalOtpToken.email == email.lower(),
            PortalOtpToken.event_id == event_id,
            PortalOtpToken.used == False,  # noqa: E712
            PortalOtpToken.expires_at > datetime.now(timezone.utc),
            PortalOtpToken.created_at >= cutoff,
        )
    )
    count = (await db.execute(stmt)).scalar_one()
    if count >= _THROTTLE_MAX_REQUESTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many OTP requests. Please wait 15 minutes before trying again.",
        )


async def _create_and_send_otp(
    email: str,
    event_id: uuid.UUID,
    event_name: str,
    db: AsyncSession,
) -> str:
    """Insert a new OTP token row and dispatch the email. Returns plain OTP."""
    otp = _generate_otp()
    token = PortalOtpToken(
        email=email.lower(),
        event_id=event_id,
        otp_hash=_hash_otp(otp),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=_OTP_TTL_MINUTES),
    )
    db.add(token)
    await db.flush()  # get the id before commit

    html_body = f"""
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="font-size: 20px; font-weight: 700; color: #1e293b;">
        Your Login Code for {event_name}
      </h2>
      <p style="color: #475569; font-size: 15px;">
        Use the code below to access your registration portal. 
        It expires in <strong>10 minutes</strong>.
      </p>
      <div style="background: #f1f5f9; border-radius: 12px; padding: 24px 32px; 
                  text-align: center; margin: 24px 0;">
        <span style="font-size: 36px; font-weight: 900; letter-spacing: 0.25em; 
                     color: #6366f1; font-family: monospace;">{otp}</span>
      </div>
      <p style="color: #94a3b8; font-size: 12px;">
        If you did not request this code, you can safely ignore this email.
      </p>
    </div>
    """
    text_body = (
        f"Your one-time login code for {event_name} is: {otp}. "
        f"Valid for {_OTP_TTL_MINUTES} minutes."
    )

    await send_email(
        to_email=email,
        subject=f"Your OTP for {event_name}",
        html_body=html_body,
        text_body=text_body,
        event_id=event_id,
        db=db,
    )
    return otp


def _issue_portal_jwt(email: str, event_id: uuid.UUID) -> str:
    """Sign a portal-specific JWT. Uses PORTAL_JWT_SECRET — fully isolated."""
    if not settings.PORTAL_JWT_SECRET:
        raise RuntimeError(
            "PORTAL_JWT_SECRET is not configured. "
            "Add it to your .env file."
        )
    payload = {
        "email": email.lower(),
        "event_id": str(event_id),
        "role": "portal_attendee",
        "exp": datetime.now(timezone.utc) + timedelta(days=_JWT_TTL_DAYS),
    }
    return jwt.encode(payload, settings.PORTAL_JWT_SECRET, algorithm=_JWT_ALGORITHM)


# ── Endpoints ──────────────────────────────────────────────────────────────

@router.post("/request-otp", response_model=MessageResponse)
@router.post("/{event_id}/request-otp", response_model=MessageResponse)
async def request_otp(
    body: OtpRequestBody,
    event_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Step 1: attendee enters their email or phone.
    Always returns HTTP 200 — no email enumeration.
    """
    eff_event_id = event_id or body.event_id
    if not eff_event_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Event ID is required.",
        )

    target_email = body.email or (f"{body.phone.strip()}@phone.eventos.local" if body.phone else None)
    if not target_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email or phone number is required.",
        )

    event = await _get_event(eff_event_id, db)

    # Guard: event must exist and registration must be open
    if not event or not event.registration_allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration is not open for this event.",
        )
    await enforce_event_operation(
        db,
        event.organization_id,
        event.id,
        "registration.submit",
    )

    await _throttle_check(target_email, eff_event_id, db)

    dev_otp_value: Optional[str] = None
    # Create & send OTP (best-effort — do not reveal send failure to caller)
    try:
        dev_otp_value = await _create_and_send_otp(
            email=target_email,
            event_id=eff_event_id,
            event_name=event.name,
            db=db,
        )
        await db.commit()
    except Exception:
        logger.exception("OTP send failed — suppressing error to caller")

    logger.info(
        "otp_requested",
        extra={
            "event_id": str(eff_event_id),
            "email_hash": _email_sha256(target_email),
            "action": "otp_requested",
        },
    )

    is_dev = getattr(settings, "ENVIRONMENT", "development") != "production"
    return MessageResponse(
        message="OTP sent if account exists.",
        dev_otp=dev_otp_value if is_dev else None,
    )


@router.post("/verify-otp", response_model=TokenResponse)
@router.post("/{event_id}/verify-otp", response_model=TokenResponse)
async def verify_otp(
    body: OtpVerifyBody,
    event_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Step 2: attendee submits the 6-digit OTP.
    On success issues a 7-day portal JWT.
    """
    eff_event_id = event_id or body.event_id
    if not eff_event_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Event ID is required.",
        )

    target_email = body.email or (f"{body.phone.strip()}@phone.eventos.local" if body.phone else None)
    if not target_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email or phone number is required.",
        )

    event = await _get_event(eff_event_id, db)
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration is not open for this event.",
        )
    await enforce_event_operation(
        db,
        event.organization_id,
        event.id,
        "registration.submit",
    )
    now = datetime.now(timezone.utc)

    # Load the latest valid token for this email+event
    stmt = (
        select(PortalOtpToken)
        .where(
            and_(
                PortalOtpToken.email == target_email.lower(),
                PortalOtpToken.event_id == eff_event_id,
                PortalOtpToken.used == False,  # noqa: E712
                PortalOtpToken.expires_at > now,
            )
        )
        .order_by(PortalOtpToken.created_at.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    token_row = result.scalar_one_or_none()

    if not token_row:
        logger.info(
            "otp_verify_failed",
            extra={
                "event_id": str(eff_event_id),
                "email_hash": _email_sha256(target_email),
                "action": "otp_not_found",
            },
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired OTP.",
        )

    # Increment attempts first (before verification) to prevent timing attacks
    token_row.attempts += 1

    if token_row.attempts >= _MAX_VERIFY_ATTEMPTS:
        await db.commit()
        logger.info(
            "otp_verify_failed",
            extra={
                "event_id": str(eff_event_id),
                "email_hash": _email_sha256(target_email),
                "action": "otp_max_attempts",
            },
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Too many attempts. Please request a new OTP.",
        )

    if not _verify_otp(body.otp, token_row.otp_hash):
        await db.commit()
        logger.info(
            "otp_verify_failed",
            extra={
                "event_id": str(eff_event_id),
                "email_hash": _email_sha256(target_email),
                "action": "otp_mismatch",
            },
        )
        remaining = _MAX_VERIFY_ATTEMPTS - token_row.attempts
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid OTP. {remaining} attempt(s) remaining.",
        )

    # ── Success ──────────────────────────────────────────────
    token_row.used = True
    event_user = await _upsert_event_user(
        db=db,
        event_id=eff_event_id,
        email=target_email,
        phone=body.phone,
    )
    await db.commit()
    await db.refresh(event_user)

    access_token = _issue_portal_jwt(target_email, eff_event_id)

    logger.info(
        "otp_verify_success",
        extra={
            "event_id": str(eff_event_id),
            "email_hash": _email_sha256(target_email),
            "action": "otp_verified",
        },
    )

    user_profile = EventUserProfileResponse(
        id=event_user.id,
        event_id=event_user.event_id,
        email=event_user.email,
        phone=event_user.phone,
        full_name=event_user.full_name,
        title=event_user.title,
        affiliation=event_user.affiliation,
        designation=event_user.designation,
        country=event_user.country,
        avatar_url=event_user.avatar_url,
        bio=event_user.bio,
        roles=event_user.roles or ["DELEGATE"],
        is_registered=event_user.is_registered,
        is_speaker=event_user.is_speaker,
        is_reviewer=event_user.is_reviewer,
        reviewer_status=event_user.reviewer_status,
        profile_data=event_user.profile_data or {},
    )

    return TokenResponse(access_token=access_token, token=access_token, user=user_profile)


@router.post("/resend-otp", response_model=MessageResponse)
@router.post("/{event_id}/resend-otp", response_model=MessageResponse)
async def resend_otp(
    body: OtpRequestBody,
    event_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Invalidate existing OTPs and send a fresh one.
    Uses same throttle logic as request-otp.
    """
    eff_event_id = event_id or body.event_id
    if not eff_event_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Event ID is required.",
        )

    target_email = body.email or (f"{body.phone.strip()}@phone.eventos.local" if body.phone else None)
    if not target_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email or phone number is required.",
        )

    event = await _get_event(eff_event_id, db)
    if not event or not event.registration_allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration is not open for this event.",
        )
    await enforce_event_operation(
        db,
        event.organization_id,
        event.id,
        "registration.submit",
    )

    await _throttle_check(target_email, eff_event_id, db)

    # Mark all existing unused tokens as used
    now = datetime.now(timezone.utc)
    stmt = select(PortalOtpToken).where(
        and_(
            PortalOtpToken.email == target_email.lower(),
            PortalOtpToken.event_id == eff_event_id,
            PortalOtpToken.used == False,  # noqa: E712
        )
    )
    result = await db.execute(stmt)
    for row in result.scalars().all():
        row.used = True

    dev_otp_value: Optional[str] = None
    # Send fresh OTP
    try:
        dev_otp_value = await _create_and_send_otp(
            email=target_email,
            event_id=eff_event_id,
            event_name=event.name,
            db=db,
        )
        await db.commit()
    except Exception:
        logger.exception("OTP resend failed — suppressing error to caller")

    logger.info(
        "otp_resent",
        extra={
            "event_id": str(eff_event_id),
            "email_hash": _email_sha256(target_email),
            "action": "otp_resent",
        },
    )

    is_dev = getattr(settings, "ENVIRONMENT", "development") != "production"
    return MessageResponse(
        message="OTP sent if account exists.",
        dev_otp=dev_otp_value if is_dev else None,
    )


# ── Profile Endpoints ──────────────────────────────────────────────────────

@router.get("/{event_id}/me", response_model=EventUserProfileResponse)
@users_router.get("/{event_id}/me", response_model=EventUserProfileResponse)
async def get_my_event_profile(
    event_id: uuid.UUID,
    portal_user: PortalUser = Depends(get_portal_user),
    db: AsyncSession = Depends(get_db),
):
    """Read a persisted profile with live status projections; GET never writes."""
    if portal_user.event_id != event_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Token does not match requested event.",
        )
    email = portal_user.email.strip().lower()
    event_user = await db.scalar(select(EventUser).where(
        EventUser.event_id == event_id, EventUser.email == email))
    if event_user is None:
        # Profile creation belongs to authenticated OTP verification / explicit
        # mutations, not a GET side effect or an implicit legacy repair.
        raise HTTPException(404, detail={"code": "EVENT_PROFILE_NOT_FOUND"})
    registered = bool(await db.scalar(select(Participant.id).where(
        Participant.event_id == event_id, func.lower(Participant.email) == email).limit(1)))
    speaker = bool(await db.scalar(select(Speaker.id).where(
        Speaker.event_id == event_id, func.lower(Speaker.email) == email).limit(1)))
    reviewer = await db.scalar(select(AbstractReviewer).where(
        AbstractReviewer.event_id == event_id, func.lower(AbstractReviewer.email) == email
    ).order_by(AbstractReviewer.id.desc()).limit(1))
    reviewer_status = "NONE"
    if reviewer is not None:
        reviewer_status = (reviewer.status or "INVITED").upper()
        if reviewer_status in {"ACTIVE", "ACCEPTED"} or reviewer.accepted_at is not None:
            reviewer_status = "ACCEPTED"
    roles = set(event_user.roles or ["DELEGATE"]) - {"SPEAKER", "REVIEWER"}
    if speaker:
        roles.add("SPEAKER")
    if reviewer_status == "ACCEPTED":
        roles.add("REVIEWER")
    return EventUserProfileResponse(
        id=event_user.id,
        event_id=event_user.event_id,
        email=event_user.email,
        phone=event_user.phone,
        full_name=event_user.full_name,
        title=event_user.title,
        affiliation=event_user.affiliation,
        designation=event_user.designation,
        country=event_user.country,
        avatar_url=event_user.avatar_url,
        bio=event_user.bio,
        roles=sorted(roles),
        is_registered=registered,
        is_speaker=speaker,
        is_reviewer=reviewer is not None,
        reviewer_status=reviewer_status,
        profile_data=event_user.profile_data or {},
    )


@router.put("/{event_id}/me", response_model=EventUserProfileResponse)
@users_router.put("/{event_id}/me", response_model=EventUserProfileResponse)
async def update_my_event_profile(
    event_id: uuid.UUID,
    body: EventUserUpdateBody,
    portal_user: PortalUser = Depends(get_portal_user),
    db: AsyncSession = Depends(get_db),
):
    """Update profile fields for the authenticated event user."""
    if portal_user.event_id != event_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Token does not match requested event.",
        )
    event_user = await _upsert_event_user(
        db=db,
        event_id=event_id,
        email=portal_user.email,
    )
    if body.full_name is not None:
        event_user.full_name = body.full_name
    if body.phone is not None:
        event_user.phone = body.phone
    if body.title is not None:
        event_user.title = body.title
    if body.affiliation is not None:
        event_user.affiliation = body.affiliation
    if body.designation is not None:
        event_user.designation = body.designation
    if body.country is not None:
        event_user.country = body.country
    if body.bio is not None:
        event_user.bio = body.bio
    if body.avatar_url is not None:
        event_user.avatar_url = body.avatar_url
    if body.profile_data is not None:
        merged = dict(event_user.profile_data or {})
        merged.update(body.profile_data)
        event_user.profile_data = merged

    await db.commit()
    await db.refresh(event_user)
    return EventUserProfileResponse(
        id=event_user.id,
        event_id=event_user.event_id,
        email=event_user.email,
        phone=event_user.phone,
        full_name=event_user.full_name,
        title=event_user.title,
        affiliation=event_user.affiliation,
        designation=event_user.designation,
        country=event_user.country,
        avatar_url=event_user.avatar_url,
        bio=event_user.bio,
        roles=event_user.roles or ["DELEGATE"],
        is_registered=event_user.is_registered,
        is_speaker=event_user.is_speaker,
        is_reviewer=event_user.is_reviewer,
        reviewer_status=event_user.reviewer_status,
        profile_data=event_user.profile_data or {},
    )
