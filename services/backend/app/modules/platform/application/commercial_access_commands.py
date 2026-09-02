"""Transaction-owning commercial access decision commands."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_organization
from app.modules.audit.models.audit_log import AuditLog
from app.modules.billing.models.subscription import Addon, OrganizationAddon, OrganizationSubscription, SubscriptionPlan
from app.modules.platform.models.organization_console import CommercialAccessRequest, PrivilegedMutationReceipt


class CommercialAccessCommandService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def decide(self, *, organization_id, access_request_id, actor, decision: str,
                     reason: str, case_reference: str, effective_at, ends_at,
                     expected_version: int, idempotency_key: str,
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

            row = await self.db.scalar(select(CommercialAccessRequest).where(
                CommercialAccessRequest.id == access_request_id,
                CommercialAccessRequest.organization_id == organization_id,
            ).with_for_update())
            if row is None:
                raise HTTPException(status_code=404, detail="Commercial access request not found")
            if row.status != "PENDING":
                raise HTTPException(status_code=409, detail={"code": "REQUEST_ALREADY_DECIDED", "status": row.status})
            if row.version != expected_version:
                raise HTTPException(status_code=412, detail={"code": "VERSION_CONFLICT", "current_version": row.version})
            if row.requested_by == actor.id:
                raise HTTPException(status_code=409, detail="Requester cannot approve their own commercial request")

            old_state = {"status": row.status, "version": row.version}
            row.case_reference = case_reference
            row.decision_reason = reason
            row.decided_by = actor.id
            row.decided_at = datetime.now(timezone.utc)
            row.version = int(row.version or 1) + 1

            subscription = None
            if decision == "APPROVED":
                plan = await self.db.scalar(select(SubscriptionPlan).where(
                    SubscriptionPlan.id == row.requested_plan_id,
                    SubscriptionPlan.is_active.is_(True),
                    SubscriptionPlan.lifecycle_status == "PUBLISHED",
                ))
                if not plan:
                    raise HTTPException(status_code=409, detail={"code": "PLAN_NOT_PUBLISHABLE"})
                addon_keys = sorted(set(row.requested_addon_keys or []))
                addons = (await self.db.scalars(select(Addon).where(
                    Addon.key.in_(addon_keys), Addon.is_active.is_(True),
                    Addon.lifecycle_status == "PUBLISHED",
                ))).all() if addon_keys else []
                if set(addon_keys) != {addon.key for addon in addons}:
                    raise HTTPException(status_code=409, detail={"code": "ADDON_NOT_PUBLISHABLE"})

                now = effective_at or datetime.now(timezone.utc)
                subscription_end = ends_at or now + timedelta(days=365)
                subscription = await self.db.scalar(select(OrganizationSubscription).where(
                    OrganizationSubscription.organization_id == organization_id,
                    OrganizationSubscription.status.in_(["ACTIVE", "TRIAL", "GRACE_PERIOD", "SUSPENDED"]),
                ).order_by(OrganizationSubscription.created_at.desc()).with_for_update())
                old_subscription = None
                if subscription:
                    old_subscription = {"id": str(subscription.id), "plan_id": str(subscription.plan_id), "status": subscription.status, "version": subscription.version}
                    subscription.plan_id = plan.id
                    subscription.status = "ACTIVE"
                    subscription.current_period_end = subscription_end
                    subscription.version = int(subscription.version or 1) + 1
                else:
                    subscription = OrganizationSubscription(
                        organization_id=organization_id, plan_id=plan.id,
                        status="ACTIVE", current_period_end=subscription_end,
                    )
                    self.db.add(subscription)
                    await self.db.flush()

                for addon in addons:
                    existing_addon = await self.db.scalar(select(OrganizationAddon).where(
                        OrganizationAddon.organization_id == organization_id,
                        OrganizationAddon.addon_id == addon.id,
                        OrganizationAddon.event_id == row.event_id,
                        OrganizationAddon.status == "ACTIVE",
                        or_(OrganizationAddon.expires_at.is_(None), OrganizationAddon.expires_at > now),
                    ).with_for_update())
                    if existing_addon:
                        continue
                    self.db.add(OrganizationAddon(
                        organization_id=organization_id, event_id=row.event_id,
                        addon_id=addon.id, status="ACTIVE", expires_at=subscription_end,
                        subscription_id=subscription.id, quantity=1,
                        unit_price_snapshot=addon.final_price or addon.price_inr,
                        currency=row.currency, assignment_reason=reason,
                        assigned_by=actor.id,
                    ))
                row.status = "APPLIED"
                row.applied_subscription_id = subscription.id
                response = {"id": row.id, "status": row.status, "version": row.version, "subscription_id": subscription.id}
                new_state = {"subscription_id": str(subscription.id), "plan_id": str(plan.id), "plan_version": plan.version, "addon_keys": addon_keys, "event_id": str(row.event_id) if row.event_id else None, "ends_at": subscription_end.isoformat(), "case_reference": case_reference, "idempotency_key": idempotency_key}
                action = "COMMERCIAL_ACCESS_APPLIED"
            else:
                row.status = "REJECTED"
                response = {"id": row.id, "status": row.status, "version": row.version}
                new_state = {"reason": reason, "case_reference": case_reference, "idempotency_key": idempotency_key}
                action = "COMMERCIAL_ACCESS_REJECTED"

            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="commercial_access_request",
                resource_id=row.id, action_type=action,
                old_state=old_state, new_state=new_state, is_sensitive=True,
            ))
            self.db.add(PrivilegedMutationReceipt(
                organization_id=organization_id, actor_user_id=actor.id,
                operation_key="commercial_access.decision", idempotency_key=idempotency_key,
                request_hash=request_hash, resource_type="commercial_access_request",
                resource_id=row.id, response_json=jsonable_encoder(response),
            ))
            await self.db.commit()
            await invalidate_organization(organization_id)
            return response
        except Exception:
            await self.db.rollback()
            raise
