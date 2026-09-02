"""Transaction-owning event commercial-contract commands."""

from __future__ import annotations

from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_event
from app.modules.audit.models.audit_log import AuditLog
from app.modules.billing.capability_registry import CATALOG_LIMIT_KEYS, LIMIT_DEFINITIONS
from app.modules.platform.models.feature import FeatureCatalog
from app.modules.events.models.event import Event
from app.modules.platform.models.organization_console import (
    EntitlementOverrideRequest,
    EventCommercialContract,
    PrivilegedMutationReceipt,
)


class EventContractCommandService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def apply(self, *, organization_id, event_id, actor, payload,
                    expected_version: int, idempotency_key: str,
                    request_hash: str) -> dict:
        try:
            receipt = await self.db.scalar(select(PrivilegedMutationReceipt).where(
                PrivilegedMutationReceipt.organization_id == organization_id,
                PrivilegedMutationReceipt.idempotency_key == idempotency_key,
            ).with_for_update())
            if receipt:
                if receipt.actor_user_id != actor.id or receipt.operation_key != "event_contract.apply" or receipt.request_hash != request_hash:
                    raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_CONFLICT"})
                return receipt.response_json

            event_exists = await self.db.scalar(select(Event.id).where(
                Event.id == event_id,
                Event.organization_id == organization_id,
            ))
            if event_exists is None:
                raise HTTPException(status_code=404, detail={"code": "EVENT_NOT_FOUND"})

            approval = await self.db.scalar(select(EntitlementOverrideRequest).where(
                EntitlementOverrideRequest.id == payload.approved_request_id,
                EntitlementOverrideRequest.organization_id == organization_id,
                EntitlementOverrideRequest.event_id == event_id,
            ).with_for_update())
            if not approval or approval.status != "APPROVED" or approval.entitlement_key != "event.contract" or approval.operation != "REPLACE" or approval.requested_by == approval.approved_by:
                raise HTTPException(status_code=409, detail="An independent approved event.contract amendment is required")
            requested = approval.requested_value if isinstance(approval.requested_value, dict) else {}
            if requested.get("plan_key") not in {None, payload.plan_key} or requested.get("plan_version") not in {None, payload.plan_version}:
                raise HTTPException(status_code=409, detail="Approved contract amendment does not match the requested plan")

            catalogue = {row.key: row for row in (await self.db.scalars(select(FeatureCatalog))).all()}
            unknown = sorted(set(payload.entitlements) - set(catalogue) - set(LIMIT_DEFINITIONS) - set(CATALOG_LIMIT_KEYS))
            if unknown:
                raise HTTPException(status_code=422, detail={"code": "UNKNOWN_CAPABILITY_KEYS", "keys": unknown})
            for key, raw in payload.entitlements.items():
                if key in LIMIT_DEFINITIONS or key in CATALOG_LIMIT_KEYS:
                    value_type = str(raw.get("type") or raw.get("value_type") or "LIMIT").upper() if isinstance(raw, dict) else "LIMIT"
                    if value_type != "LIMIT":
                        raise HTTPException(status_code=422, detail=f"Value type mismatch for {key}")
                    continue
                definition = catalogue[key]
                if definition.lifecycle_status != "ACTIVE":
                    raise HTTPException(status_code=422, detail=f"Deprecated capability cannot be contracted: {key}")
                value_type = str(raw.get("type") or raw.get("value_type") or definition.value_type).upper() if isinstance(raw, dict) else ("BOOLEAN" if isinstance(raw, bool) else "LIMIT" if isinstance(raw, (int, float)) else "TIER" if isinstance(raw, str) else definition.value_type)
                value = raw.get("value") if isinstance(raw, dict) and "value" in raw else raw
                if value_type in {"TIER", "ENUM"} and definition.allowed_values and value not in definition.allowed_values:
                    raise HTTPException(status_code=422, detail=f"Unsupported value for {key}")

            current = await self.db.scalar(select(EventCommercialContract).where(
                EventCommercialContract.organization_id == organization_id,
                EventCommercialContract.event_id == event_id,
                EventCommercialContract.status == "ACTIVE",
            ).with_for_update())
            current_version = current.version if current else 0
            if current_version != expected_version:
                raise HTTPException(status_code=412, detail={"code": "VERSION_CONFLICT", "current_version": current_version})
            next_version = 1 if current is None else current.version + 1
            old_state = {"version": current_version, "status": current.status if current else None}
            if current:
                current.status = "SUPERSEDED"
            values = payload.model_dump(exclude={"reason", "approved_request_id"})
            values["source"] = {**values.get("source", {}), "approved_request_id": str(approval.id), "applied_by": str(actor.id), "reason": payload.reason}
            row = EventCommercialContract(
                organization_id=organization_id, event_id=event_id, version=next_version,
                created_by=actor.id, **values,
            )
            approval.status = "APPLIED"
            approval.version = int(approval.version or 1) + 1
            self.db.add(row)
            await self.db.flush()
            response = {"id": row.id, "event_id": event_id, "version": row.version, "status": row.status}
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="event_commercial_contract",
                resource_id=row.id, action_type="EVENT_CONTRACT_VERSION_CREATED",
                old_state=jsonable_encoder(old_state), new_state=jsonable_encoder({
                    "event_id": str(event_id), "version": next_version,
                    "plan_key": row.plan_key, "reason": payload.reason,
                    "approved_request_id": str(approval.id),
                    "idempotency_key": idempotency_key,
                }), is_sensitive=True,
            ))
            self.db.add(PrivilegedMutationReceipt(
                organization_id=organization_id, actor_user_id=actor.id,
                operation_key="event_contract.apply", idempotency_key=idempotency_key,
                request_hash=request_hash, resource_type="event_commercial_contract",
                resource_id=row.id, response_json=jsonable_encoder(response),
            ))
            await self.db.commit()
            await invalidate_event(organization_id, event_id)
            return response
        except Exception:
            await self.db.rollback()
            raise
