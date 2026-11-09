"""Shared idempotency helper for non-commercial organization administration.

Legacy subscription/grant lifecycle mutation handlers were removed. Cloud
contract amendments are handled by ``CommercialContractService``.
"""

import hashlib
import json
import uuid
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.billing.models.licensing import BillingOperationRequest


class BillingAdminLifecycleService:
    @staticmethod
    def _fingerprint(payload: dict[str, Any]) -> str:
        return hashlib.sha256(
            json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8")
        ).hexdigest()

    @staticmethod
    async def _begin_operation(
        db: AsyncSession,
        organization_id: uuid.UUID,
        operation_type: str,
        idempotency_key: str,
        payload: dict[str, Any],
    ) -> tuple[BillingOperationRequest, bool]:
        request_hash = BillingAdminLifecycleService._fingerprint(payload)
        operation = await db.scalar(
            select(BillingOperationRequest)
            .where(
                BillingOperationRequest.organization_id == organization_id,
                BillingOperationRequest.operation_type == operation_type,
                BillingOperationRequest.idempotency_key == idempotency_key,
            )
            .with_for_update()
        )
        if operation:
            if operation.request_hash != request_hash:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": "IDEMPOTENCY_CONFLICT"})
            if operation.status == "SUCCEEDED" and operation.result_ref_id:
                return operation, True
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": "OPERATION_IN_PROGRESS"})

        operation = BillingOperationRequest(
            organization_id=organization_id,
            operation_type=operation_type,
            idempotency_key=idempotency_key,
            request_hash=request_hash,
            status="PENDING",
        )
        db.add(operation)
        await db.flush()
        return operation, False
