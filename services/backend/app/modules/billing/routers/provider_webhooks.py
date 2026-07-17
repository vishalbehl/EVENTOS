import uuid

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select

from app.dependencies import DB
from app.modules.billing.models.payment_gateway import PaymentGateway
from app.modules.billing.services.provider_webhook_service import ProviderWebhookService


router = APIRouter(prefix="/billing/provider-webhooks", tags=["billing-provider-webhooks"])


@router.post("/{gateway_id}", status_code=status.HTTP_202_ACCEPTED)
async def receive_provider_webhook(gateway_id: uuid.UUID, request: Request, db: DB) -> dict[str, str]:
    gateway = await db.scalar(select(PaymentGateway).where(PaymentGateway.id == gateway_id))
    if not gateway:
        raise HTTPException(status_code=404, detail="Webhook endpoint not found.")
    body = await request.body()
    normalized = ProviderWebhookService.verify_and_normalize(gateway, body, request.headers)
    receipt = await ProviderWebhookService.ingest(db, gateway, normalized, body)
    return {"status": receipt.status, "receipt_id": str(receipt.id)}
