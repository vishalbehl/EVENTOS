"""Lifecycle operations for versioned cloud contracts."""

from __future__ import annotations

import uuid
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.models.audit_log import AuditLog
from app.modules.billing.models.cloud_commercial import CommercialAccount, CommercialContract
from app.modules.billing.schemas.cloud_commercial import ContractCancellationRequest


class CommercialLifecycleService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def cancel_at_period_end(
        self,
        organization_id: uuid.UUID,
        contract_id: uuid.UUID,
        payload: ContractCancellationRequest,
        actor_id: uuid.UUID,
        expected_version: int,
        idempotency_key: str,
    ) -> CommercialContract:
        contract = await self.db.scalar(select(CommercialContract).where(
            CommercialContract.id == contract_id,
        ).with_for_update())
        if not contract:
            raise HTTPException(status_code=404, detail="Commercial contract not found")
        account = await self.db.get(CommercialAccount, contract.commercial_account_id)
        if not account or account.owner_organization_id != organization_id:
            raise HTTPException(status_code=404, detail="Commercial contract not found")
        if contract.cancellation_idempotency_key == idempotency_key:
            return contract
        if contract.version != expected_version:
            raise HTTPException(status_code=412, detail={"code": "VERSION_CONFLICT", "current_version": contract.version})
        if contract.status not in {"ACTIVE", "PENDING_PAYMENT", "PENDING_RENEWAL"}:
            raise HTTPException(status_code=409, detail={"code": "CONTRACT_NOT_CANCELLABLE", "status": contract.status})
        if contract.cancel_at_period_end:
            return contract
        contract.cancel_at_period_end = True
        contract.cancellation_idempotency_key = idempotency_key
        contract.version += 1
        self.db.add(AuditLog(
            organization_id=organization_id,
            actor_user_id=actor_id,
            resource_type="commercial_contract",
            resource_id=contract.id,
            action_type="COMMERCIAL_CONTRACT_CANCEL_AT_PERIOD_END",
            old_state={"status": contract.status, "cancel_at_period_end": False, "version": expected_version},
            new_state={"status": contract.status, "cancel_at_period_end": True, "version": contract.version, "ends_at": contract.ends_at.isoformat() if contract.ends_at else None},
            change_diff={"reason": payload.reason, "idempotency_key": idempotency_key},
            is_sensitive=True,
        ))
        await self.db.flush()
        return contract
