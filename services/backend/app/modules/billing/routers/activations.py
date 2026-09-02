import uuid
from typing import Any, Dict, List

from fastapi import APIRouter, Header, HTTPException, Query, status
from sqlalchemy import select

from app.dependencies import ActiveUser, DB
from app.modules.billing.models.event_activation import EventActivation
from app.modules.billing.models.licensing import EntitlementGrant, GrantConsumption
from app.modules.billing.schemas.event_activation import (
    EventActivationCreate,
    EventActivationDetailResponse,
    EventActivationResponse,
    GrantConsumptionResponse,
    SnapshotSummary,
)
from app.modules.billing.services.activation_service import ActivationService
from app.modules.billing.application.commands import BillingActivationCommandService
from app.modules.billing.application.queries import BillingActivationQueryService
from app.modules.billing.services.entitlement_resolver import EntitlementResolver
from app.modules.billing.services.usage_service import UsageService

router = APIRouter(prefix="/billing", tags=["billing-activations"])


def _require_idempotency(idempotency_key: str | None) -> str:
    if not idempotency_key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Idempotency-Key header is required.")
    return idempotency_key


async def _serialize_activation_detail(db: DB, activation: EventActivation) -> EventActivationDetailResponse:
    full = await EntitlementResolver.get_activation(db, activation.id)
    transfer_eligibility = None
    if full:
        policies = await ActivationService.get_transfer_policies(
            db,
            full.subscription.plan_id if full.subscription else None,
            full.grant.grant_type if full.grant else None,
        )
        transfer_eligibility = await UsageService.get_transfer_eligibility(db, full.event_id, policies)
    consumption = None
    snapshot = None
    if full and full.grant_consumption:
        consumption = GrantConsumptionResponse.model_validate(full.grant_consumption)
    if full and full.current_snapshot_set:
        snapshot = SnapshotSummary.model_validate(full.current_snapshot_set)
    return EventActivationDetailResponse.model_validate(
        {
            **EventActivationResponse.model_validate(full or activation).model_dump(),
            "grant_consumption": consumption.model_dump() if consumption else None,
            "snapshot_summary": snapshot.model_dump() if snapshot else None,
            "transfer_eligibility": transfer_eligibility,
        }
    )


@router.post("/events/{event_id}/activate", response_model=EventActivationDetailResponse)
async def activate_event(
    event_id: uuid.UUID,
    payload: EventActivationCreate,
    user: ActiveUser,
    db: DB,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    if not user.organization_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Organization context is required.")
    _require_idempotency(idempotency_key)
    activation = await BillingActivationCommandService.activate(
        db,
        organization_id=user.organization_id,
        event_id=event_id,
        subscription_id=payload.subscription_id,
        grant_id=payload.grant_id,
        activation_policy=payload.activation_policy,
        idempotency_key=idempotency_key,
        actor_id=user.id,
    )
    return await _serialize_activation_detail(db, activation)


@router.get("/events/{event_id}/activation", response_model=EventActivationDetailResponse)
async def get_event_activation(event_id: uuid.UUID, user: ActiveUser, db: DB):
    if not user.organization_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Organization context is required.")
    activation = await EntitlementResolver.get_event_activation(db, user.organization_id, event_id)
    if not activation:
        activation = await BillingActivationQueryService(db).get_latest_activation(
            user.organization_id, event_id
        )
    if not activation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No activation record found for this event.")
    return await _serialize_activation_detail(db, activation)


@router.get("/organizations/{org_id}/activations", response_model=List[EventActivationResponse])
async def list_organization_activations(org_id: uuid.UUID, user: ActiveUser, db: DB, limit: int = Query(100, ge=1, le=100)):
    if not user.organization_id or user.organization_id != org_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this organization's billing data.")
    rows = await BillingActivationQueryService(db).list_activations(org_id, limit=limit)
    return [EventActivationResponse.model_validate(row) for row in rows]


@router.post("/events/{event_id}/deactivate", response_model=EventActivationResponse)
async def deactivate_event(
    event_id: uuid.UUID,
    user: ActiveUser,
    db: DB,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    if not user.organization_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Organization context is required.")
    _require_idempotency(idempotency_key)
    activation = await BillingActivationCommandService.deactivate(
        db,
        organization_id=user.organization_id,
        event_id=event_id,
        idempotency_key=idempotency_key,
        actor_id=user.id,
    )
    return EventActivationResponse.model_validate(activation)


@router.post("/events/{event_id}/transfer", response_model=Dict[str, Any])
async def transfer_event_activation(
    event_id: uuid.UUID,
    user: ActiveUser,
    db: DB,
    target_event_id: uuid.UUID = Query(..., alias="target_event_id"),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    if not user.organization_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Organization context is required.")
    _require_idempotency(idempotency_key)
    result = await BillingActivationCommandService.transfer(
        db,
        organization_id=user.organization_id,
        source_event_id=event_id,
        target_event_id=target_event_id,
        idempotency_key=idempotency_key,
        actor_id=user.id,
    )
    if "activation" in result:
        result["activation"] = EventActivationResponse.model_validate(result["activation"]).model_dump()
    return result


@router.get("/events/{event_id}/entitlements", response_model=Dict[str, Any])
async def get_event_entitlements(event_id: uuid.UUID, user: ActiveUser, db: DB):
    if not user.organization_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Organization context is required.")
    return await EntitlementResolver.resolve_event_entitlements(db, user.organization_id, event_id, explain=True)


@router.get("/events/{event_id}/usage", response_model=Dict[str, Any])
async def get_event_usage(event_id: uuid.UUID, user: ActiveUser, db: DB):
    if not user.organization_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Organization context is required.")
    from app.modules.billing.services.usage_service import UsageService

    if not await BillingActivationQueryService(db).event_exists(
        user.organization_id, event_id
    ):
        raise HTTPException(status_code=404, detail="Event not found.")
    return await UsageService.get_event_usage(db, event_id)


@router.get("/subscriptions", response_model=List[Dict[str, Any]])
async def list_subscriptions(
    user: ActiveUser,
    db: DB,
    limit: int = Query(100, ge=1, le=100),
):
    if not user.organization_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Organization context is required.")
    subs = await BillingActivationQueryService(db).list_active_subscriptions(
        user.organization_id, limit=limit
    )
    return [
        {
            "subscription_id": str(sub["subscription_id"]),
            "plan_id": str(sub["plan_id"]),
            "status": sub["status"],
            "trial_ends_at": sub["trial_ends_at"],
            "current_period_end": sub["current_period_end"],
        }
        for sub in subs
    ]


@router.get("/grants", response_model=List[Dict[str, Any]])
async def list_grants(user: ActiveUser, db: DB, limit: int = Query(100, ge=1, le=100)):
    if not user.organization_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Organization context is required.")
    rows = await BillingActivationQueryService(db).list_grants(
        user.organization_id, limit=limit
    )
    return [
        {
            "id": str(row.id),
            "subscription_id": str(row.subscription_id) if row.subscription_id else None,
            "grant_type": row.grant_type,
            "scope_type": row.scope_type,
            "consumption_model": row.consumption_model,
            "unit_type": row.unit_type,
            "status": row.status,
            "quantity_total": row.quantity_total,
            "quantity_consumed": row.quantity_consumed,
            "quantity_reserved": row.quantity_reserved,
            "source_type": row.source_type,
            "source_ref": row.source_ref,
        }
        for row in rows
    ]


@router.get("/grants/{grant_id}/consumptions", response_model=List[GrantConsumptionResponse])
async def list_grant_consumptions(grant_id: uuid.UUID, user: ActiveUser, db: DB, limit: int = Query(100, ge=1, le=100)):
    if not user.organization_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Organization context is required.")
    rows = await BillingActivationQueryService(db).list_consumptions(
        user.organization_id, grant_id, limit=limit
    )
    return [GrantConsumptionResponse.model_validate(row) for row in rows]
