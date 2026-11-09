from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.billing.models.cloud_commercial import (
    CommercialAccount,
    CommercialAccountWorkspace,
    CommercialAllocation,
    CommercialUsageLedger,
)
from app.modules.billing.schemas.cloud_commercial import UsageMutationRequest


class CommercialUsageService:
    """Authoritative, idempotent metering for the versioned cloud model."""

    @staticmethod
    def unit_scale(entitlement_key: str) -> int:
        return 1024 ** 3 if entitlement_key.endswith("storage_gb") else 1

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _account_for_organization(self, organization_id: uuid.UUID) -> CommercialAccount:
        account = await self.db.scalar(select(CommercialAccount).where(
            CommercialAccount.owner_organization_id == organization_id,
        ))
        if account:
            return account
        account = await self.db.scalar(
            select(CommercialAccount)
            .join(CommercialAccountWorkspace, CommercialAccountWorkspace.commercial_account_id == CommercialAccount.id)
            .where(
                CommercialAccountWorkspace.organization_id == organization_id,
                CommercialAccountWorkspace.status == "ACTIVE",
            )
        )
        if not account:
            raise HTTPException(status_code=404, detail="No commercial account is associated with this organization")
        return account

    async def mutate(
        self,
        organization_id: uuid.UUID,
        payload: UsageMutationRequest,
        actor_id: uuid.UUID,
        idempotency_key: str,
    ) -> dict[str, Any]:
        account = await self._account_for_organization(organization_id)
        existing = await self.db.scalar(select(CommercialUsageLedger).where(
            CommercialUsageLedger.commercial_account_id == account.id,
            CommercialUsageLedger.idempotency_key == idempotency_key,
        ))
        if existing:
            return {"id": existing.id, "status": "IDEMPOTENT_REPLAY", "quantity": existing.quantity, "operation_type": existing.operation_type}

        allocation_filters = [
            CommercialAllocation.id == payload.allocation_id,
            CommercialAllocation.commercial_account_id == account.id,
            CommercialAllocation.entitlement_key == payload.entitlement_key,
            CommercialAllocation.status == "ACTIVE",
        ]
        # EMC owners may reconcile any pooled/client allocation; an EMC
        # client may meter only its own allocation and cannot spend another
        # client's pool by guessing an allocation id.
        if account.owner_organization_id != organization_id:
            allocation_filters.append(CommercialAllocation.organization_id == organization_id)
        allocation = await self.db.scalar(select(CommercialAllocation).where(
            *allocation_filters,
        ).with_for_update())
        if not allocation:
            raise HTTPException(status_code=404, detail="Commercial allocation not found")
        now = datetime.now(timezone.utc)
        if allocation.valid_from > now or (allocation.valid_until and allocation.valid_until <= now):
            raise HTTPException(status_code=409, detail={"code": "ALLOCATION_EXPIRED"})

        if payload.operation_type == "RESERVE":
            available = allocation.quantity_total - allocation.quantity_reserved - allocation.quantity_consumed
            if available < payload.quantity:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": "CAPACITY_EXHAUSTED", "available": available})
            allocation.quantity_reserved += payload.quantity
        elif payload.operation_type == "CONSUME":
            available = allocation.quantity_total - allocation.quantity_reserved - allocation.quantity_consumed
            if available < payload.quantity:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": "CAPACITY_EXHAUSTED", "available": available})
            allocation.quantity_consumed += payload.quantity
        elif payload.operation_type == "RELEASE":
            if allocation.quantity_reserved < payload.quantity:
                raise HTTPException(status_code=409, detail={"code": "RESERVATION_BALANCE_EXCEEDED"})
            allocation.quantity_reserved -= payload.quantity
        else:
            allocation.quantity_consumed += payload.quantity

        ledger = CommercialUsageLedger(
            commercial_account_id=account.id,
            organization_id=organization_id,
            event_id=allocation.event_id,
            allocation_id=allocation.id,
            entitlement_key=payload.entitlement_key,
            quantity=payload.quantity,
            operation_type=payload.operation_type,
            source_record_id=payload.source_record_id,
            idempotency_key=idempotency_key,
            metadata_json={"actor_id": str(actor_id)},
        )
        self.db.add(ledger)
        await self.db.flush()
        return {"id": ledger.id, "status": payload.operation_type, "quantity": payload.quantity, "remaining": max(0, allocation.quantity_total - allocation.quantity_reserved - allocation.quantity_consumed)}

    async def consume_if_allocated(
        self,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID | None,
        entitlement_key: str,
        quantity: int,
        actor_id: uuid.UUID | None,
        idempotency_key: str,
        source_record_id: str | None,
    ) -> bool:
        """Mirror a legacy metering event into the commercial ledger when applicable.

        Legacy customers intentionally have no commercial allocation, so this is a
        no-op for them. Once a new contract is active, the same domain operation
        becomes authoritative against the versioned allocation and hard limits.
        """
        if quantity <= 0:
            return False
        try:
            account = await self._account_for_organization(organization_id)
        except HTTPException as exc:
            if exc.status_code == 404:
                return False
            raise

        existing = list((await self.db.scalars(select(CommercialUsageLedger).where(
            CommercialUsageLedger.commercial_account_id == account.id,
            CommercialUsageLedger.idempotency_key.like(f"{idempotency_key}:%"),
        ))).all())
        if existing and sum(int(row.quantity) for row in existing if row.operation_type == "CONSUME") >= quantity:
            return True

        entitlement_keys = [entitlement_key]
        if account.account_type == "EMC":
            entitlement_keys.extend({
                "registrations": "annual_registrations",
                "event_email_credits": "annual_email_credits",
                "storage_gb": "annual_storage_gb",
            }.get(entitlement_key, "").split() or [])
        allocation_scope = CommercialAllocation.event_id == event_id
        if account.account_type == "EMC":
            # EMC capacity is pooled across client events. Prefer an
            # event-specific allocation when one exists, then consume the
            # client's event-independent annual pool.
            allocation_scope = or_(
                CommercialAllocation.event_id == event_id,
                CommercialAllocation.event_id.is_(None),
            )
        allocations = list((await self.db.scalars(select(CommercialAllocation).where(
            CommercialAllocation.commercial_account_id == account.id,
            CommercialAllocation.organization_id == organization_id,
            allocation_scope,
            CommercialAllocation.entitlement_key.in_(entitlement_keys),
            CommercialAllocation.status == "ACTIVE",
        ).order_by(CommercialAllocation.event_id.is_(None), CommercialAllocation.valid_until).with_for_update())).all())
        remaining = quantity
        for allocation in allocations:
            available = int(allocation.quantity_total) - int(allocation.quantity_reserved) - int(allocation.quantity_consumed)
            if available <= 0:
                continue
            portion = min(remaining, available)
            await self.mutate(
                organization_id=organization_id,
                payload=UsageMutationRequest(
                    allocation_id=allocation.id,
                    entitlement_key=allocation.entitlement_key,
                    quantity=portion,
                    operation_type="CONSUME",
                    source_record_id=source_record_id,
                ),
                actor_id=actor_id or uuid.UUID(int=0),
                idempotency_key=f"{idempotency_key}:{allocation.id}",
            )
            remaining -= portion
            if remaining == 0:
                return True

        if allocations:
            raise HTTPException(
                status_code=409,
                detail={"code": "CAPACITY_EXHAUSTED", "entitlement_key": entitlement_key, "requested": quantity, "available": quantity - remaining},
            )
        return False
