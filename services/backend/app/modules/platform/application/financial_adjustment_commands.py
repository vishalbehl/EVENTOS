"""Transaction-owning financial-adjustment request commands."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi.encoders import jsonable_encoder

from app.core.cache import invalidate_organization
from app.modules.audit.models.audit_log import AuditLog
from datetime import datetime, timezone

from app.modules.platform.models.organization_console import (
    OrganizationFinancialAdjustment,
    PrivilegedMutationReceipt,
)


class FinancialAdjustmentCommandService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, *, organization_id, actor, values: dict,
                     idempotency_key: str, request_hash: str) -> dict:
        try:
            receipt = await self.db.scalar(select(PrivilegedMutationReceipt).where(
                PrivilegedMutationReceipt.organization_id == organization_id,
                PrivilegedMutationReceipt.idempotency_key == idempotency_key,
            ).with_for_update())
            if receipt:
                if receipt.request_hash != request_hash:
                    raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_CONFLICT"})
                return receipt.response_json
            existing = await self.db.scalar(select(OrganizationFinancialAdjustment).where(
                OrganizationFinancialAdjustment.organization_id == organization_id,
                OrganizationFinancialAdjustment.idempotency_key == idempotency_key,
            ).with_for_update())
            if existing:
                raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_CONFLICT"})
            row = OrganizationFinancialAdjustment(
                organization_id=organization_id, requested_by=actor.id,
                idempotency_key=idempotency_key, **values,
            )
            self.db.add(row)
            await self.db.flush()
            response = {"id": row.id, "status": row.status, "version": row.version}
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="organization_financial_adjustment",
                resource_id=row.id, action_type="FINANCIAL_ADJUSTMENT_REQUESTED",
                new_state={"type": row.adjustment_type, "amount": str(row.amount),
                           "currency": row.currency, "case_reference": row.case_reference,
                           "version": row.version, "idempotency_key": idempotency_key},
                is_sensitive=True,
            ))
            self.db.add(PrivilegedMutationReceipt(
                organization_id=organization_id, actor_user_id=actor.id,
                operation_key="financial_adjustment.request",
                idempotency_key=idempotency_key, request_hash=request_hash,
                resource_type="organization_financial_adjustment", resource_id=row.id,
                response_json=jsonable_encoder(response),
            ))
            await self.db.commit()
            await self.db.refresh(row)
            await invalidate_organization(organization_id)
            return response
        except Exception:
            await self.db.rollback()
            raise

    async def decide(self, *, organization_id, adjustment_id, actor,
                     decision: str, reason: str, case_reference: str | None,
                     if_match: int, idempotency_key: str,
                     request_hash: str) -> dict:
        try:
            receipt = await self.db.scalar(select(PrivilegedMutationReceipt).where(
                PrivilegedMutationReceipt.organization_id == organization_id,
                PrivilegedMutationReceipt.idempotency_key == idempotency_key,
            ).with_for_update())
            if receipt:
                if receipt.request_hash != request_hash:
                    raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_CONFLICT"})
                return receipt.response_json
            row = await self.db.scalar(select(OrganizationFinancialAdjustment).where(
                OrganizationFinancialAdjustment.id == adjustment_id,
                OrganizationFinancialAdjustment.organization_id == organization_id,
            ).with_for_update())
            if row is None:
                raise HTTPException(status_code=404, detail="Financial adjustment not found")
            if row.version != if_match:
                raise HTTPException(status_code=412, detail={"code": "VERSION_CONFLICT", "current_version": row.version})
            if row.status != "PENDING":
                raise HTTPException(status_code=409, detail="Financial adjustment is already decided")
            if row.requested_by == actor.id:
                raise HTTPException(status_code=409, detail="Requester cannot approve their own financial adjustment")
            decided_at = datetime.now(timezone.utc)
            row.status = decision
            row.approved_by = actor.id
            row.decided_at = decided_at
            row.effective_at = decided_at if decision == "APPROVED" else None
            row.version = int(row.version or 1) + 1
            response = {"id": row.id, "status": row.status,
                        "effective_at": row.effective_at, "version": row.version}
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="organization_financial_adjustment",
                resource_id=row.id, action_type=f"FINANCIAL_ADJUSTMENT_{decision}",
                old_state={"status": "PENDING", "version": if_match},
                new_state={"decision": decision, "reason": reason,
                           "effective_at": row.effective_at.isoformat() if row.effective_at else None,
                           "version": row.version, "idempotency_key": idempotency_key,
                           "case_reference": case_reference},
                is_sensitive=True,
            ))
            self.db.add(PrivilegedMutationReceipt(
                organization_id=organization_id, actor_user_id=actor.id,
                operation_key="financial_adjustment.decision",
                idempotency_key=idempotency_key, request_hash=request_hash,
                resource_type="organization_financial_adjustment", resource_id=row.id,
                response_json=jsonable_encoder(response),
            ))
            await self.db.commit()
            await self.db.refresh(row)
            await invalidate_organization(organization_id)
            return response
        except Exception:
            await self.db.rollback()
            raise
