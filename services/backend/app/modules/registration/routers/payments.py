import logging
import uuid
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_event, CurrentEvent, AdminOrAbove
from app.modules.events.models.event import Event
from app.modules.registration.models.promo_code import PromoCode
from app.modules.registration.models.payment_transaction import PaymentTransaction
from app.schemas.common import MessageResponse
from app.services.credential_cipher import cipher
from app.core.dependencies.feature_gate import require_event_feature, require_event_operation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/events/{event_id}/payments", tags=["payments"], dependencies=[require_event_feature("FEAT_PAYMENT_GATEWAY")])


# ── Pydantic Request/Response schemas ─────────────────────────────────────

class StripeCredentialsSchema(BaseModel):
    publishable_key: str = ""
    # On GET responses this holds a masked value (e.g. "••••••••ab12").
    # On POST requests this holds the raw key submitted by the organizer.
    secret_key: str = ""


class RazorpayCredentialsSchema(BaseModel):
    key_id: str = ""
    # On GET responses this holds a masked value.
    # On POST requests this holds the raw secret submitted by the organizer.
    key_secret: str = ""


class PaymentConfigResponse(BaseModel):
    payment_enabled: bool = False
    active_gateway: str = "simulated"   # stripe | razorpay | simulated
    stripe_credentials: StripeCredentialsSchema
    razorpay_credentials: RazorpayCredentialsSchema
    auto_approve_paid: bool = True


class PaymentConfigUpdateRequest(BaseModel):
    payment_enabled: Optional[bool] = None
    active_gateway: Optional[str] = None
    stripe_credentials: Optional[StripeCredentialsSchema] = None
    razorpay_credentials: Optional[RazorpayCredentialsSchema] = None
    auto_approve_paid: Optional[bool] = None


class PromoCodeCreate(BaseModel):
    code: str = Field(..., max_length=50)
    discount_type: str = Field(..., description="percentage or fixed")
    discount_value: float = Field(..., gt=0)
    max_uses: Optional[int] = Field(None, ge=1)
    expiry_date: Optional[datetime] = None
    is_active: bool = True


class PromoCodeUpdate(BaseModel):
    is_active: Optional[bool] = None
    max_uses: Optional[int] = None
    expiry_date: Optional[datetime] = None


class PromoCodeResponse(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    code: str
    discount_type: str
    discount_value: float
    max_uses: Optional[int]
    used_count: int
    expiry_date: Optional[datetime]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TransactionResponse(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    registration_id: Optional[uuid.UUID]
    amount: float
    currency: str
    status: str
    payment_method: str
    gateway_order_id: Optional[str]
    gateway_payment_id: Optional[str]
    discount_applied: float
    created_at: datetime
    registration_name: Optional[str] = None
    registration_email: Optional[str] = None

    class Config:
        from_attributes = True


# ── GET /config — read gateway settings ───────────────────────────────────

@router.get("/config", response_model=PaymentConfigResponse)
async def get_payment_config(event: CurrentEvent):
    settings = event.registration_settings or {}

    stripe_creds  = settings.get("stripe_credentials", {}) or {}
    razorpay_creds = settings.get("razorpay_credentials", {}) or {}

    # Mask the secrets — raw values must NEVER be returned over HTTP.
    def mask_stripe_secret(token: str) -> str:
        if not token:
            return ""
        from app.core.encryption import decrypt as new_decrypt
        try:
            plaintext = new_decrypt(token)
        except Exception:
            try:
                from app.services.credential_cipher import cipher
                plaintext = cipher.decrypt(token)
            except Exception:
                plaintext = ""
        if not plaintext:
            return ""
        suffix = plaintext[-4:] if len(plaintext) >= 4 else plaintext
        return f"••••••••{suffix}"

    stripe_secret_masked   = mask_stripe_secret(stripe_creds.get("secret_key", ""))
    razorpay_secret_masked = cipher.mask(razorpay_creds.get("key_secret", ""))

    logger.info(
        "payment_credentials_accessed",
        extra={
            "event_id": str(event.id),
            "user_id": "system",
            "gateway": "stripe",
            "action": "mask",
        },
    )
    logger.info(
        "payment_credentials_accessed",
        extra={
            "event_id": str(event.id),
            "user_id": "system",
            "gateway": "razorpay",
            "action": "mask",
        },
    )

    return PaymentConfigResponse(
        payment_enabled=settings.get("payment_enabled", False),
        active_gateway=settings.get("active_gateway", "simulated"),
        stripe_credentials=StripeCredentialsSchema(
            publishable_key=stripe_creds.get("publishable_key", ""),
            secret_key=stripe_secret_masked,
        ),
        razorpay_credentials=RazorpayCredentialsSchema(
            key_id=razorpay_creds.get("key_id", ""),
            key_secret=razorpay_secret_masked,
        ),
        auto_approve_paid=settings.get("auto_approve_paid", True),
    )



# ── POST /config — write gateway settings ─────────────────────────────────

@router.post(
    "/config",
    response_model=MessageResponse,
    dependencies=[require_event_operation("registration.payments.manage")],
)
async def update_payment_config(
    payload: PaymentConfigUpdateRequest,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
):
    settings = dict(event.registration_settings or {})

    if payload.payment_enabled is not None:
        settings["payment_enabled"] = payload.payment_enabled
        if event.portal_theme_setting:
            event.portal_theme_setting.payment_enabled = payload.payment_enabled

    if payload.active_gateway is not None:
        valid_gateways = ("stripe", "razorpay", "simulated", "phonepe", "offline")
        if payload.active_gateway not in valid_gateways:
            raise HTTPException(status_code=400, detail=f"Invalid gateway. Must be one of {valid_gateways}")
        settings["active_gateway"] = payload.active_gateway
        if event.portal_theme_setting:
            event.portal_theme_setting.active_gateway = payload.active_gateway

    if payload.stripe_credentials is not None:
        existing_stripe = dict(settings.get("stripe_credentials") or {})

        raw_secret = payload.stripe_credentials.secret_key
        if raw_secret and not raw_secret.startswith("••••••••"):
            from app.core.encryption import encrypt as new_encrypt
            existing_stripe["secret_key"] = new_encrypt(raw_secret)
            logger.info(
                "payment_credentials_accessed",
                extra={
                    "event_id": str(event.id),
                    "user_id": "system",
                    "gateway": "stripe",
                    "action": "encrypt",
                },
            )

        if payload.stripe_credentials.publishable_key:
            existing_stripe["publishable_key"] = payload.stripe_credentials.publishable_key

        settings["stripe_credentials"] = existing_stripe
        if event.portal_theme_setting:
            event.portal_theme_setting.stripe_credentials = existing_stripe

    if payload.razorpay_credentials is not None:
        existing_razorpay = dict(settings.get("razorpay_credentials") or {})

        raw_secret = payload.razorpay_credentials.key_secret
        if raw_secret and not raw_secret.startswith("••••••••"):
            existing_razorpay["key_secret"] = cipher.encrypt(raw_secret)
            logger.info(
                "payment_credentials_accessed",
                extra={
                    "event_id": str(event.id),
                    "user_id": "system",
                    "gateway": "razorpay",
                    "action": "encrypt",
                },
            )

        if payload.razorpay_credentials.key_id:
            existing_razorpay["key_id"] = payload.razorpay_credentials.key_id

        settings["razorpay_credentials"] = existing_razorpay

    if payload.auto_approve_paid is not None:
        settings["auto_approve_paid"] = payload.auto_approve_paid

    event.registration_settings = settings
    await db.commit()
    return MessageResponse(message="Payment configuration updated successfully.")


# ── Promo codes ────────────────────────────────────────────────────────────

@router.get("/promos", response_model=List[PromoCodeResponse])
async def list_promo_codes(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(PromoCode)
        .where(PromoCode.event_id == event.id)
        .order_by(PromoCode.created_at.desc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.post(
    "/promos",
    response_model=PromoCodeResponse,
    dependencies=[require_event_operation("registration.coupons.manage")],
)
async def create_promo_code(
    payload: PromoCodeCreate,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
):
    code_upper = payload.code.strip().upper()
    existing_stmt = select(PromoCode).where(
        PromoCode.event_id == event.id,
        PromoCode.code == code_upper,
    )
    existing_res = await db.execute(existing_stmt)
    if existing_res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Promo code '{payload.code}' already exists for this event.",
        )

    if payload.discount_type not in ("percentage", "fixed"):
        raise HTTPException(
            status_code=400,
            detail="Discount type must be 'percentage' or 'fixed'.",
        )

    promo = PromoCode(
        event_id=event.id,
        code=code_upper,
        discount_type=payload.discount_type,
        discount_value=payload.discount_value,
        max_uses=payload.max_uses,
        expiry_date=payload.expiry_date,
        is_active=payload.is_active,
    )
    db.add(promo)
    await db.commit()
    await db.refresh(promo)
    return promo


@router.patch(
    "/promos/{promo_id}",
    response_model=PromoCodeResponse,
    dependencies=[require_event_operation("registration.coupons.manage")],
)
async def update_promo_code(
    promo_id: uuid.UUID,
    payload: PromoCodeUpdate,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(PromoCode).where(
        PromoCode.id == promo_id, PromoCode.event_id == event.id
    )
    promo = (await db.execute(stmt)).scalar_one_or_none()
    if not promo:
        raise HTTPException(status_code=404, detail="Promo code not found.")

    if payload.is_active is not None:
        promo.is_active = payload.is_active
    if payload.max_uses is not None:
        promo.max_uses = payload.max_uses
    if payload.expiry_date is not None:
        promo.expiry_date = payload.expiry_date

    await db.commit()
    await db.refresh(promo)
    return promo


@router.delete(
    "/promos/{promo_id}",
    response_model=MessageResponse,
    dependencies=[require_event_operation("registration.coupons.manage")],
)
async def delete_promo_code(
    promo_id: uuid.UUID,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(PromoCode).where(
        PromoCode.id == promo_id, PromoCode.event_id == event.id
    )
    promo = (await db.execute(stmt)).scalar_one_or_none()
    if not promo:
        raise HTTPException(status_code=404, detail="Promo code not found.")

    await db.delete(promo)
    await db.commit()
    return MessageResponse(message="Promo code deleted successfully.")


# ── Transactions ───────────────────────────────────────────────────────────

@router.get("/transactions", response_model=List[TransactionResponse])
async def list_transactions(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
):
    from app.modules.registration.models.participant_registration import ParticipantRegistration  # noqa: PLC0415

    stmt = (
        select(PaymentTransaction, ParticipantRegistration)
        .outerjoin(
            ParticipantRegistration,
            PaymentTransaction.registration_id == ParticipantRegistration.id,
        )
        .where(PaymentTransaction.event_id == event.id)
        .order_by(PaymentTransaction.created_at.desc())
    )

    result = await db.execute(stmt)
    rows = result.all()

    transactions = []
    for tx, reg in rows:
        reg_name = reg_email = None
        if reg and reg.registration_data:
            reg_name  = reg.registration_data.get("name")
            reg_email = reg.registration_data.get("email")

        transactions.append(
            TransactionResponse(
                id=tx.id,
                event_id=tx.event_id,
                registration_id=tx.registration_id,
                amount=tx.amount,
                currency=tx.currency,
                status=tx.status,
                payment_method=tx.payment_method,
                gateway_order_id=tx.gateway_order_id,
                gateway_payment_id=tx.gateway_payment_id,
                discount_applied=tx.discount_applied,
                created_at=tx.created_at,
                registration_name=reg_name,
                registration_email=reg_email,
            )
        )
    return transactions
