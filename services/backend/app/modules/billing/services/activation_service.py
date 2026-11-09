from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.billing.models.event_activation import EventActivation
from app.modules.billing.models.licensing import (
    ActivationTransferPolicy,
    BillingOperationRequest,
    EntitlementGrant,
    EventEntitlementSnapshotItem,
    EventEntitlementSnapshotSet,
    EventLimitSnapshotItem,
    GrantConsumption,
)
from app.modules.platform.models.feature import FeatureCatalog
from app.modules.billing.capability_registry import CATALOG_LIMIT_KEYS, PLATFORM_HARD_CEILINGS
from app.modules.billing.services.entitlement_resolver import EntitlementResolver
from app.modules.billing.services.usage_service import UsageService
from app.modules.events.models.event import Event
from app.modules.platform.models.organization_console import EventCommercialContract
from app.modules.audit.models.audit_log import AuditLog


class ActivationService:
    """Compatibility-free event activation operations over commercial contracts."""

    LIVE_STATUSES = ("PENDING", "ACTIVE", "SUSPENDED", "EXPIRED", "TRANSFER_PENDING")
    async def activate_event(
        db: AsyncSession,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        commercial_contract_id: uuid.UUID,
        activation_policy: str = "SNAPSHOT_LOCKED",
        idempotency_key: str | None = None,
        actor_id: uuid.UUID | None = None,
    ) -> EventActivation:
        # The caller identity is persisted on the event and activation audit.
        # Only the legacy compatibility key is intentionally unused here.
        del idempotency_key
        from app.modules.billing.models.cloud_commercial import (
            CommercialAccount,
            CommercialContract,
            CommercialContractItem,
            CommercialOffer,
        )
        event = await db.scalar(
            select(Event)
            .where(
                Event.id == event_id,
                Event.organization_id == organization_id,
                Event.deleted_at.is_(None),
            )
            .with_for_update(of=Event)
        )
        if not event:
            raise HTTPException(status_code=404, detail={"code": "EVENT_NOT_FOUND"})
        now = datetime.now(timezone.utc)
        contract = await db.scalar(select(CommercialContract).join(
            CommercialAccount,
            CommercialAccount.id == CommercialContract.commercial_account_id,
        ).where(
            CommercialContract.id == commercial_contract_id,
            CommercialAccount.owner_organization_id == organization_id,
            CommercialContract.status == "ACTIVE",
            CommercialContract.starts_at <= now,
            or_(CommercialContract.ends_at.is_(None), CommercialContract.ends_at > now),
        ))
        if not contract:
            raise HTTPException(status_code=409, detail={"code": "ACTIVE_COMMERCIAL_CONTRACT_REQUIRED"})
        event_plan_item = await db.scalar(
            select(CommercialContractItem.id)
            .join(CommercialOffer, CommercialOffer.id == CommercialContractItem.offer_id)
            .where(
                CommercialContractItem.contract_id == contract.id,
                CommercialContractItem.event_id == event_id,
                CommercialOffer.product_family == "EVENT",
            )
            .limit(1)
        )
        if not event_plan_item:
            raise HTTPException(
                status_code=409,
                detail={"code": "EVENT_PLAN_CONTRACT_REQUIRED"},
            )
        existing = await db.scalar(
            select(EventActivation)
            .where(
                EventActivation.organization_id == organization_id,
                EventActivation.event_id == event_id,
                EventActivation.status.in_(ActivationService.LIVE_STATUSES),
            )
            .with_for_update()
        )
        if existing:
            if existing.status in {"SUSPENDED", "TRANSFER_PENDING"}:
                raise HTTPException(
                    status_code=409,
                    detail={"code": "EVENT_ACTIVATION_REQUIRES_REVIEW", "status": existing.status},
                )
            previous_activation_status = existing.status
            previous_event_status = event.status
            existing.status = "ACTIVE"
            existing.commercial_contract_id = commercial_contract_id
            existing.expires_at = contract.ends_at
            existing.activated_at = now
            existing.deactivation_reason = None
            existing.suspension_reason = None
            existing.cancelled_at = None
            if event.status != "active" or not event.event_mode:
                event.status = "active"
                event.event_mode = True
                event.version += 1
                event.updated_by = actor_id
            if previous_activation_status != "ACTIVE" or previous_event_status != event.status:
                db.add(
                    AuditLog(
                        organization_id=organization_id,
                        actor_user_id=actor_id,
                        actor_role="COMMERCIAL_ACTIVATION",
                        resource_type="event",
                        resource_id=event.id,
                        action_type="EVENT_REACTIVATED_BY_PLAN",
                        old_state={
                            "event_status": previous_event_status,
                            "activation_status": previous_activation_status,
                        },
                        new_state={
                            "event_status": event.status,
                            "activation_status": existing.status,
                            "commercial_contract_id": str(commercial_contract_id),
                        },
                        is_sensitive=True,
                    )
                )
            await db.flush()
            return existing
        activation = EventActivation(
            organization_id=organization_id,
            event_id=event_id,
            commercial_contract_id=commercial_contract_id,
            status="ACTIVE",
            activation_policy=activation_policy,
            expires_at=contract.ends_at,
        )
        db.add(activation)
        previous_event_status = event.status
        event.status = "active"
        event.event_mode = True
        event.version += 1
        event.updated_by = actor_id
        await db.flush()
        db.add(
            AuditLog(
                organization_id=organization_id,
                actor_user_id=actor_id,
                actor_role="COMMERCIAL_ACTIVATION",
                resource_type="event",
                resource_id=event.id,
                action_type="EVENT_ACTIVATED_BY_PLAN",
                old_state={"status": previous_event_status},
                new_state={
                    "status": event.status,
                    "activation_id": str(activation.id),
                    "commercial_contract_id": str(commercial_contract_id),
                },
                is_sensitive=True,
            )
        )
        await db.flush()
        return activation

    @staticmethod
    async def deactivate_event(
        db: AsyncSession,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        idempotency_key: str | None = None,
        actor_id: uuid.UUID | None = None,
        reason: str = "EVENT_ARCHIVED",
    ) -> EventActivation | None:
        del idempotency_key, actor_id
        activation = await db.scalar(select(EventActivation).where(
            EventActivation.organization_id == organization_id,
            EventActivation.event_id == event_id,
            EventActivation.status.in_(ActivationService.LIVE_STATUSES),
        ))
        if not activation:
            return None
        activation.status = "CANCELLED"
        activation.deactivation_reason = reason
        activation.cancelled_at = datetime.now(timezone.utc)
        await db.flush()
        return activation

    @staticmethod
    async def transfer_activation(
        db: AsyncSession,
        *,
        organization_id: uuid.UUID,
        source_event_id: uuid.UUID,
        target_event_id: uuid.UUID,
        idempotency_key: str | None = None,
        actor_id: uuid.UUID | None = None,
    ) -> EventActivation:
        del idempotency_key, actor_id
        source = await db.scalar(select(EventActivation).where(
            EventActivation.organization_id == organization_id,
            EventActivation.event_id == source_event_id,
            EventActivation.status.in_(ActivationService.LIVE_STATUSES),
        ))
        if not source:
            raise HTTPException(status_code=404, detail={"code": "SOURCE_ACTIVATION_NOT_FOUND"})
        await ActivationService.deactivate_event(
            db,
            organization_id=organization_id,
            event_id=source_event_id,
            reason="TRANSFERRED",
        )
        return await ActivationService.activate_event(
            db,
            organization_id=organization_id,
            event_id=target_event_id,
            commercial_contract_id=source.commercial_contract_id,
            activation_policy=source.activation_policy,
        )
