"""
Portal Dashboard Router
app/modules/registration/routers/portal_dashboard.py

GET  /portal/dashboard         — full attendee dashboard (protected)
PATCH /portal/attendee/details — edit mutable profile fields (protected)
"""
from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, text

from app.dependencies import get_db
from app.modules.registration.dependencies.portal_auth import PortalUser, get_portal_user
from app.modules.registration.services.portal_service import (
    get_dashboard_data,
    update_attendee_details,
    _check_edits_locked,
)
from app.modules.rbac.models.event import Event
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.participant_registration import ParticipantRegistration
from app.modules.registration.models.portal_otp_token import PortalOtpToken
from app.modules.registration.models.registration_form_config import RegistrationFormConfig
from app.modules.registration.routers.portal_auth import (
    _generate_otp,
    _hash_otp,
    _verify_otp,
    _throttle_check,
    _OTP_TTL_MINUTES,
    _issue_portal_jwt,
)
from app.modules.notifications.services.email_service import send_email

logger = logging.getLogger(__name__)

router = APIRouter(tags=["portal-dashboard"])


# ── Response schemas ───────────────────────────────────────────────────────

class EventInfoResponse(BaseModel):
    name: str
    start_date: Optional[date]
    end_date: Optional[date]
    venue: str
    support_email: str
    announcements: Any
    program_url: str = ""
    terms_and_conditions: str = ""
    faqs: Optional[list] = None
    include_default_faqs: Optional[bool] = True



class RegistrationInfoResponse(BaseModel):
    status: str
    registration_id: Optional[str]
    submitted_at: Optional[datetime]
    waitlist_position: Optional[int]
    rejection_reason: Optional[str]


class ParticipantInfoResponse(BaseModel):
    regno: str
    name: str
    email: str
    phone: str
    company: str
    designation: str
    country: str
    role: str
    paid_status: str
    custom_fields: dict
    registered_at: Optional[datetime]


class PaymentInfoResponse(BaseModel):
    status: str
    amount: float
    currency: str
    payment_method: str
    transaction_id: str
    created_at: datetime
    gateway_payment_id: Optional[str] = None
    discount_applied: float


class DashboardResponse(BaseModel):
    event: EventInfoResponse
    registration: RegistrationInfoResponse
    participant: Optional[ParticipantInfoResponse]
    payment: Optional[PaymentInfoResponse]
    edits_locked: bool
    is_speaker: bool
    speaker_portal_url: str


class AttendeeUpdateBody(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    designation: Optional[str] = None
    country: Optional[str] = None
    custom_fields: Optional[dict[str, Any]] = None
    new_email: Optional[EmailStr] = None
    otp: Optional[str] = None


class ParticipantUpdateResponse(BaseModel):
    regno: str
    name: str
    phone: str
    company: str
    designation: str
    country: str
    custom_fields: dict
    updated_at: Optional[datetime] = None
    new_token: Optional[str] = None


class EmailUpdateOtpRequest(BaseModel):
    new_email: EmailStr


class AttendeeCheckoutRequest(BaseModel):
    promo_code: Optional[str] = None
    redirect_base_url: str


# ── Response schemas (MessageResponse) ──────────────────────────────────────

class MessageResponse(BaseModel):
    message: str


# ── Endpoints ──────────────────────────────────────────────────────────────

@router.get("/portal/dashboard", response_model=DashboardResponse)
async def get_portal_dashboard(
    portal_user: PortalUser = Depends(get_portal_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return the full attendee dashboard.
    JWT provides email + event_id — no extra query params needed.
    """
    try:
        data = await get_dashboard_data(
            email=portal_user.email,
            event_id=portal_user.event_id,
            db=db,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))

    return DashboardResponse(
        event=EventInfoResponse(
            name=data.event.name,
            start_date=data.event.start_date,
            end_date=data.event.end_date,
            venue=data.event.venue,
            support_email=data.event.support_email,
            announcements=data.event.announcements,
            program_url=data.event.program_url,
            terms_and_conditions=data.event.terms_and_conditions,
            faqs=data.event.faqs,
            include_default_faqs=data.event.include_default_faqs,
        ),
        registration=RegistrationInfoResponse(
            status=data.registration.status,
            registration_id=data.registration.registration_id,
            submitted_at=data.registration.submitted_at,
            waitlist_position=data.registration.waitlist_position,
            rejection_reason=data.registration.rejection_reason,
        ),
        participant=(
            ParticipantInfoResponse(
                regno=data.participant.regno,
                name=data.participant.name,
                email=data.participant.email,
                phone=data.participant.phone,
                company=data.participant.company,
                designation=data.participant.designation,
                country=data.participant.country,
                role=data.participant.role,
                paid_status=data.participant.paid_status,
                custom_fields=data.participant.custom_fields,
                registered_at=data.participant.registered_at,
            )
            if data.participant
            else None
        ),
        payment=(
            PaymentInfoResponse(
                status=data.payment.status,
                amount=data.payment.amount,
                currency=data.payment.currency,
                payment_method=data.payment.payment_method,
                transaction_id=data.payment.transaction_id,
                created_at=data.payment.created_at,
                gateway_payment_id=data.payment.gateway_payment_id,
                discount_applied=data.payment.discount_applied,
            )
            if data.payment
            else None
        ),
        edits_locked=data.edits_locked,
        is_speaker=data.is_speaker,
        speaker_portal_url=data.speaker_portal_url,
    )


@router.patch("/portal/attendee/details", response_model=ParticipantUpdateResponse)
async def patch_attendee_details(
    body: AttendeeUpdateBody,
    portal_user: PortalUser = Depends(get_portal_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Update mutable attendee profile fields.
    If new_email is provided, verifies the OTP before updating.
    """
    # Re-load event to check lock status
    event_result = await db.execute(
        select(Event).where(Event.id == portal_user.event_id)
    )
    event = event_result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")

    from app.modules.registration.models.registration_form_config import RegistrationFormConfig
    config_stmt = select(RegistrationFormConfig).where(RegistrationFormConfig.event_id == portal_user.event_id)
    config = (await db.execute(config_stmt)).scalar_one_or_none()
    is_live = config.is_live if config else True

    if _check_edits_locked(event, is_live=is_live):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Edits are locked for this event.",
        )

    # 1. Handle email update OTP verification
    new_email = None
    if body.new_email and body.new_email.lower() != portal_user.email:
        if not body.otp:
            raise HTTPException(status_code=400, detail="OTP is required to verify the new email.")
        
        # Verify OTP
        now = datetime.now(timezone.utc)
        stmt = (
            select(PortalOtpToken)
            .where(
                and_(
                    PortalOtpToken.email == body.new_email.lower(),
                    PortalOtpToken.event_id == portal_user.event_id,
                    PortalOtpToken.used == False,
                    PortalOtpToken.expires_at > now,
                )
            )
            .order_by(PortalOtpToken.created_at.desc())
            .limit(1)
        )
        result = await db.execute(stmt)
        token_row = result.scalar_one_or_none()
        
        if not token_row:
            raise HTTPException(status_code=401, detail="Invalid or expired OTP.")
            
        token_row.attempts += 1
        if token_row.attempts >= 5: # _MAX_VERIFY_ATTEMPTS
            await db.commit()
            raise HTTPException(status_code=401, detail="Too many attempts. Please request a new OTP.")
            
        if not _verify_otp(body.otp, token_row.otp_hash):
            await db.commit()
            raise HTTPException(status_code=401, detail="Invalid OTP.")
            
        # OTP is correct
        token_row.used = True
        new_email = body.new_email.lower()

    # 2. Apply updates
    updates = body.model_dump(exclude_none=True, exclude={"new_email", "otp"})
    try:
        updated_email, details = await update_attendee_details(
            email=portal_user.email,
            event_id=portal_user.event_id,
            updates=updates,
            new_email=new_email,
            db=db,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))

    # 3. Issue new token if email changed
    new_token = None
    if new_email:
        new_token = _issue_portal_jwt(new_email, portal_user.event_id)

    logger.info(
        "attendee_details_updated",
        extra={
            "event_id": str(portal_user.event_id),
            "email": updated_email,
            "action": "details_updated",
        },
    )

    return ParticipantUpdateResponse(
        regno=details.get("regno", ""),
        name=details.get("name", ""),
        phone=details.get("phone", ""),
        company=details.get("company", ""),
        designation=details.get("designation", ""),
        country=details.get("country", ""),
        custom_fields=details.get("custom_fields", {}),
        updated_at=datetime.now(timezone.utc),
        new_token=new_token
    )


@router.post("/portal/attendee/request-email-update", response_model=MessageResponse)
async def request_email_update(
    body: EmailUpdateOtpRequest,
    portal_user: PortalUser = Depends(get_portal_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Step 1 of Email Update: attendee inputs a new email address.
    Checks duplicate, generates an OTP, and emails it.
    """
    event = await db.get(Event, portal_user.event_id)
    if not event or not event.registration_allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration is not open for this event.",
        )

    # Check if the user is already registered (block email update requests)
    reg_stmt = (
        select(ParticipantRegistration)
        .where(
            ParticipantRegistration.event_id == portal_user.event_id,
            text("registration_data->>'email' = :email").bindparams(email=portal_user.email.lower()),
        )
        .order_by(ParticipantRegistration.submitted_at.desc())
        .limit(1)
    )
    reg_result = await db.execute(reg_stmt)
    reg_row = reg_result.scalar_one_or_none()
    if reg_row and reg_row.registration_status in ("submitted", "pending_review", "approved", "waitlisted", "rejected"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email address cannot be changed after registration.",
        )

    # Check if this email is already registered by someone else
    exist_stmt = select(Participant).where(
        Participant.event_id == portal_user.event_id,
        Participant.email == body.new_email.lower(),
        Participant.email != portal_user.email
    )
    if (await db.execute(exist_stmt)).scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This email address is already registered for this event.",
        )

    from datetime import timedelta
    await _throttle_check(body.new_email, portal_user.event_id, db)

    # Generate & send OTP
    try:
        otp = _generate_otp()
        token = PortalOtpToken(
            email=body.new_email.lower(),
            event_id=portal_user.event_id,
            otp_hash=_hash_otp(otp),
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=_OTP_TTL_MINUTES),
        )
        db.add(token)
        await db.flush()

        html_body = f"""
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="font-size: 20px; font-weight: 700; color: #1e293b;">
            Verify Your New Email for {event.name}
          </h2>
          <p style="color: #475569; font-size: 15px;">
            Use the verification code below to confirm and update your registration email to this address. 
            It expires in <strong>10 minutes</strong>.
          </p>
          <div style="background: #f1f5f9; border-radius: 12px; padding: 24px 32px; 
                      text-align: center; margin: 24px 0;">
            <span style="font-size: 36px; font-weight: 900; letter-spacing: 0.25em; 
                         color: #6366f1; font-family: monospace;">{otp}</span>
          </div>
          <p style="color: #94a3b8; font-size: 12px;">
            If you did not request this change, you can safely ignore this email.
          </p>
        </div>
        """
        text_body = (
            f"Your verification code to update your email for {event.name} is: {otp}. "
            f"Valid for {_OTP_TTL_MINUTES} minutes."
        )

        await send_email(
            to_email=body.new_email,
            subject=f"Verify new email for {event.name}",
            html_body=html_body,
            text_body=text_body,
            event_id=portal_user.event_id,
            db=db,
        )
        await db.commit()
    except Exception:
        logger.exception("OTP send failed for email update")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send verification email.",
        )

    return MessageResponse(message="OTP sent to new email.")


@router.post("/portal/attendee/payment/checkout")
async def attendee_payment_checkout(
    payload: AttendeeCheckoutRequest,
    portal_user: PortalUser = Depends(get_portal_user),
    db: AsyncSession = Depends(get_db)
):
    # 1. Fetch form config and check if live
    config_stmt = select(RegistrationFormConfig).where(RegistrationFormConfig.event_id == portal_user.event_id)
    config = (await db.execute(config_stmt)).scalar_one_or_none()
    if not config or not config.is_live:
        raise HTTPException(status_code=400, detail="Registration is closed.")

    # 2. Fetch event
    event_stmt = select(Event).where(Event.id == portal_user.event_id)
    event = (await db.execute(event_stmt)).scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")

    reg_settings = event.registration_settings or {}
    payment_enabled = reg_settings.get("payment_enabled", False)
    active_gateway = reg_settings.get("active_gateway", "simulated")

    # 3. Load registration record
    reg_stmt = (
        select(ParticipantRegistration)
        .where(
            ParticipantRegistration.event_id == portal_user.event_id,
            text("registration_data->>'email' = :email").bindparams(email=portal_user.email.lower()),
        )
        .order_by(ParticipantRegistration.submitted_at.desc())
        .limit(1)
    )
    reg = (await db.execute(reg_stmt)).scalar_one_or_none()
    if not reg:
        part_stmt = select(Participant).where(
            Participant.event_id == portal_user.event_id,
            Participant.email == portal_user.email.lower()
        )
        p = (await db.execute(part_stmt)).scalar_one_or_none()
        if p:
            reg = ParticipantRegistration(
                event_id=portal_user.event_id,
                participant_id=p.id,
                registration_status="approved",
                registration_data={
                    "name": p.name,
                    "email": p.email,
                    "phone": p.phone or "",
                    "company": p.company or "",
                    "designation": p.designation or "",
                    "country": p.country or "",
                    "role": p.role,
                    "paid_status": p.paid_status,
                    "custom_fields": p.custom_fields or {},
                },
                submitted_at=p.registered_at or datetime.now(timezone.utc),
            )
            db.add(reg)
            await db.commit()
            await db.refresh(reg)
        else:
            raise HTTPException(status_code=404, detail="Registration record not found.")

    reg_data = reg.registration_data or {}
    if reg_data.get("paid_status") == "Paid":
        raise HTTPException(status_code=400, detail="Registration is already paid.")

    role = reg_data.get("role", "Delegate")

    base_price = 0.0
    discount_applied = 0.0
    total_price = 0.0
    promo_code_obj = None

    from app.modules.registration.services.pricing_service import get_ticket_price, get_active_tier
    from app.modules.registration.models.promo_code import PromoCode
    from app.modules.registration.models.payment_transaction import PaymentTransaction

    if payment_enabled:
        active_tier = get_active_tier(event)
        price_val = await get_ticket_price(db, portal_user.event_id, role, active_tier)
        if price_val is not None:
            base_price = price_val
            total_price = price_val

            # Apply promo code if present
            if payload.promo_code:
                code_upper = payload.promo_code.strip().upper()
                promo_stmt = select(PromoCode).where(
                    PromoCode.event_id == portal_user.event_id,
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

    if not payment_enabled or total_price <= 0:
        # It's free now! Update paid status
        reg.registration_data = {**reg_data, "paid_status": "Paid"}
        
        # Create completed transaction
        tx = PaymentTransaction(
            event_id=portal_user.event_id,
            registration_id=reg.id,
            amount=0.0,
            currency=event.currency or "INR",
            status="completed",
            payment_method="simulated",
            discount_applied=discount_applied,
            promo_code_id=promo_code_obj.id if promo_code_obj else None
        )
        db.add(tx)
        
        # If approved, sync Participant record as well
        if reg.registration_status == "approved" and reg.participant_id:
            part_stmt = select(Participant).where(Participant.id == reg.participant_id)
            part = (await db.execute(part_stmt)).scalar_one_or_none()
            if part:
                part.paid_status = "Paid"
                if not part.regno:
                    from app.modules.registration.routers.registrations import generate_next_regno
                    part.regno = await generate_next_regno(db, portal_user.event_id, part.role)
        
        await db.commit()
        return {
            "checkout_required": False,
            "status": "Paid",
            "message": "Payment completed successfully (Free checkout)."
        }

    # Create Payment transaction
    tx = PaymentTransaction(
        event_id=portal_user.event_id,
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

    try:
        from app.modules.registration.services.payment_service import PaymentService
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

