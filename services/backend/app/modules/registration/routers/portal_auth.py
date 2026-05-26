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
from app.modules.rbac.models.event import Event
from app.modules.registration.models.portal_otp_token import PortalOtpToken
from app.modules.notifications.services.email_service import send_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/portal/auth", tags=["portal-auth"])

# ── Constants ─────────────────────────────────────────────────────────────
_OTP_TTL_MINUTES = 10
_THROTTLE_WINDOW_MINUTES = 15
_THROTTLE_MAX_REQUESTS = 3
_MAX_VERIFY_ATTEMPTS = 5
_JWT_ALGORITHM = "HS256"
_JWT_TTL_DAYS = 7


# ── Pydantic schemas ───────────────────────────────────────────────────────

class OtpRequestBody(BaseModel):
    email: EmailStr
    event_id: uuid.UUID


class OtpVerifyBody(BaseModel):
    email: EmailStr
    event_id: uuid.UUID
    otp: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MessageResponse(BaseModel):
    message: str


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


async def _throttle_check(email: str, event_id: uuid.UUID, db: AsyncSession) -> None:
    """Raise 429 if 3+ OTP rows exist in the last 15 min for this email+event."""
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
) -> None:
    """Insert a new OTP token row and dispatch the email."""
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
        "exp": datetime.utcnow() + timedelta(days=_JWT_TTL_DAYS),
    }
    return jwt.encode(payload, settings.PORTAL_JWT_SECRET, algorithm=_JWT_ALGORITHM)


# ── Endpoints ──────────────────────────────────────────────────────────────

@router.post("/request-otp", response_model=MessageResponse)
async def request_otp(
    body: OtpRequestBody,
    db: AsyncSession = Depends(get_db),
):
    """
    Step 1: attendee enters their email.
    Always returns HTTP 200 — no email enumeration.
    """
    event = await _get_event(body.event_id, db)

    # Guard: event must exist and registration must be open
    if not event or not event.registration_allowed:
        # Return 403 only for the registration-closed case so the UI can
        # show a static message. For a non-existent event we also 403 to
        # avoid leaking event existence.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration is not open for this event.",
        )

    await _throttle_check(body.email, body.event_id, db)

    # Create & send OTP (best-effort — do not reveal send failure to caller)
    try:
        await _create_and_send_otp(
            email=body.email,
            event_id=body.event_id,
            event_name=event.name,
            db=db,
        )
        await db.commit()
    except Exception:
        logger.exception("OTP send failed — suppressing error to caller")

    logger.info(
        "otp_requested",
        extra={
            "event_id": str(body.event_id),
            "email_hash": _email_sha256(body.email),
            "action": "otp_requested",
        },
    )

    return MessageResponse(message="OTP sent if account exists.")


@router.post("/verify-otp", response_model=TokenResponse)
async def verify_otp(
    body: OtpVerifyBody,
    db: AsyncSession = Depends(get_db),
):
    """
    Step 2: attendee submits the 6-digit OTP.
    On success issues a 7-day portal JWT.
    """
    now = datetime.now(timezone.utc)

    # Load the latest valid token for this email+event
    stmt = (
        select(PortalOtpToken)
        .where(
            and_(
                PortalOtpToken.email == body.email.lower(),
                PortalOtpToken.event_id == body.event_id,
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
                "event_id": str(body.event_id),
                "email_hash": _email_sha256(body.email),
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
                "event_id": str(body.event_id),
                "email_hash": _email_sha256(body.email),
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
                "event_id": str(body.event_id),
                "email_hash": _email_sha256(body.email),
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
    await db.commit()

    access_token = _issue_portal_jwt(body.email, body.event_id)

    logger.info(
        "otp_verify_success",
        extra={
            "event_id": str(body.event_id),
            "email_hash": _email_sha256(body.email),
            "action": "otp_verified",
        },
    )

    return TokenResponse(access_token=access_token)


@router.post("/resend-otp", response_model=MessageResponse)
async def resend_otp(
    body: OtpRequestBody,
    db: AsyncSession = Depends(get_db),
):
    """
    Invalidate existing OTPs and send a fresh one.
    Uses same throttle logic as request-otp.
    """
    event = await _get_event(body.event_id, db)
    if not event or not event.registration_allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration is not open for this event.",
        )

    await _throttle_check(body.email, body.event_id, db)

    # Mark all existing unused tokens as used
    now = datetime.now(timezone.utc)
    stmt = select(PortalOtpToken).where(
        and_(
            PortalOtpToken.email == body.email.lower(),
            PortalOtpToken.event_id == body.event_id,
            PortalOtpToken.used == False,  # noqa: E712
        )
    )
    result = await db.execute(stmt)
    for row in result.scalars().all():
        row.used = True

    # Send fresh OTP
    try:
        await _create_and_send_otp(
            email=body.email,
            event_id=body.event_id,
            event_name=event.name,
            db=db,
        )
        await db.commit()
    except Exception:
        logger.exception("OTP resend failed — suppressing error to caller")

    logger.info(
        "otp_resent",
        extra={
            "event_id": str(body.event_id),
            "email_hash": _email_sha256(body.email),
            "action": "otp_resent",
        },
    )

    return MessageResponse(message="OTP sent if account exists.")
