import logging
import uuid
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_event, CurrentEvent, AdminOrAbove
from app.modules.events.models.event import Event
from app.modules.registration.models.promo_code import PromoCode
from app.modules.registration.models.payment_transaction import PaymentTransaction
from app.schemas.common import MessageResponse
from app.core.dependencies.feature_gate import require_event_feature, require_event_operation
from app.modules.registration.application.commands import PaymentCommandService, PromoCodeCommandService
from app.modules.registration.application.queries import PaymentTransactionQueryService
from app.schemas.cursor_pagination import CursorPage

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
    current_user: AdminOrAbove,
    db: AsyncSession = Depends(get_db),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    try:
        await PaymentCommandService.update_config(
            db,
            event=event,
            payload=payload,
            actor=current_user,
            idempotency_key=idempotency_key,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
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
    current_user: AdminOrAbove,
    db: AsyncSession = Depends(get_db),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    return await PromoCodeCommandService.create(db, event=event, payload=payload, actor=current_user, idempotency_key=idempotency_key)


@router.patch(
    "/promos/{promo_id}",
    response_model=PromoCodeResponse,
    dependencies=[require_event_operation("registration.coupons.manage")],
)
async def update_promo_code(
    promo_id: uuid.UUID,
    payload: PromoCodeUpdate,
    event: CurrentEvent,
    current_user: AdminOrAbove,
    db: AsyncSession = Depends(get_db),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    return await PromoCodeCommandService.update(db, event=event, promo_id=promo_id, payload=payload, actor=current_user, idempotency_key=idempotency_key)


@router.delete(
    "/promos/{promo_id}",
    response_model=MessageResponse,
    dependencies=[require_event_operation("registration.coupons.manage")],
)
async def delete_promo_code(
    promo_id: uuid.UUID,
    event: CurrentEvent,
    current_user: AdminOrAbove,
    db: AsyncSession = Depends(get_db),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    await PromoCodeCommandService.delete(db, event=event, promo_id=promo_id, actor=current_user, idempotency_key=idempotency_key)
    return MessageResponse(message="Promo code deleted successfully.")


# ── Transactions ───────────────────────────────────────────────────────────

@router.get(
    "/transactions",
    response_model=List[TransactionResponse],
    dependencies=[require_event_operation("registration.payments.manage")],
)
async def list_transactions(
    event: CurrentEvent,
    current_user: AdminOrAbove,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
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
        .order_by(PaymentTransaction.created_at.desc(), PaymentTransaction.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
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


@router.get(
    "/transactions/page",
    response_model=CursorPage[TransactionResponse],
    dependencies=[require_event_operation("registration.payments.manage")],
)
async def list_transactions_page(
    event: CurrentEvent,
    current_user: AdminOrAbove,
    page_size: int = Query(100, ge=1, le=100),
    cursor: Optional[str] = Query(None, max_length=512),
    db: AsyncSession = Depends(get_db),
):
    """Stable bounded payment history for large event datasets."""
    page = await PaymentTransactionQueryService(db).list_page(
        organization_id=event.organization_id,
        event_id=event.id,
        page_size=page_size,
        cursor=cursor,
    )
    items = []
    for tx, registration_data in page.items:
        registration_data = registration_data or {}
        items.append(
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
                registration_name=registration_data.get("name"),
                registration_email=registration_data.get("email"),
            )
        )
    return CursorPage(items=items, next_cursor=page.next_cursor, has_next=page.has_next)
