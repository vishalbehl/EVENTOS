from __future__ import annotations

import uuid
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.tenant_context import TenantContextGuard
from app.modules.audit.models.audit_log import AuditLog
from app.modules.billing.models.event_activation import EventActivation
from app.modules.billing.models.licensing import EventEntitlementSnapshotSet
from app.modules.billing.models.subscription import OrganizationSubscription
from app.modules.billing.services.activation_service import ActivationService
from app.modules.billing.services.entitlement_resolver import EntitlementResolver
from app.modules.billing.services.usage_service import UsageService
from app.modules.platform.support_access import PlatformSupportScope


class BillingActivationAdminService:
    @staticmethod
    def _audit(scope: PlatformSupportScope, activation_id: uuid.UUID, action: str, state: dict[str, Any]) -> AuditLog:
        return AuditLog(
            request_id=scope.request_id,
            correlation_id=scope.correlation_id,
            organization_id=scope.organization_id,
            actor_user_id=scope.actor.id,
            resource_type="billing_event_activation",
            resource_id=activation_id,
            action_type=action,
            actor_role=scope.actor.platform_role or scope.actor.role,
            new_state={"reason": scope.reason, **state},
            actor_ip=scope.actor_ip,
            actor_user_agent=scope.actor_user_agent,
            is_sensitive=True,
        )

    @staticmethod
    async def inspect(
        db: AsyncSession,
        scope: PlatformSupportScope,
        activation_id: uuid.UUID,
        *,
        audit: bool = True,
    ) -> dict[str, Any]:
        async with TenantContextGuard.scoped(db, scope.organization_id):
            activation = await db.scalar(
                select(EventActivation)
                .options(
                    selectinload(EventActivation.event),
                    selectinload(EventActivation.subscription).selectinload(OrganizationSubscription.plan),
                    selectinload(EventActivation.grant),
                    selectinload(EventActivation.grant_consumption),
                    selectinload(EventActivation.current_snapshot_set)
                    .selectinload(EventEntitlementSnapshotSet.feature_items),
                    selectinload(EventActivation.current_snapshot_set)
                    .selectinload(EventEntitlementSnapshotSet.limit_items),
                )
                .where(
                    EventActivation.id == activation_id,
                    EventActivation.organization_id == scope.organization_id,
                )
                .execution_options(populate_existing=True)
            )
            if not activation:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activation not found.")

            snapshots = (
                await db.execute(
                    select(EventEntitlementSnapshotSet)
                    .where(
                        EventEntitlementSnapshotSet.activation_id == activation.id,
                        EventEntitlementSnapshotSet.organization_id == scope.organization_id,
                    )
                    .order_by(EventEntitlementSnapshotSet.version.desc())
                )
            ).scalars().all()
            usage = await UsageService.get_event_usage(db, activation.event_id)
            policies = await ActivationService.get_transfer_policies(
                db,
                activation.subscription.plan_id if activation.subscription else None,
                activation.grant.grant_type if activation.grant else None,
            )
            transfer_eligibility = await UsageService.get_transfer_eligibility(db, activation.event_id, policies)
            resolved = await EntitlementResolver.resolve_activation_entitlements(db, activation.id, explain=True)
            current = activation.current_snapshot_set

            features = []
            limits = []
            if current:
                features = [
                    {
                        "feature_key": key,
                        **value,
                    }
                    for key, value in sorted(resolved["features"].items())
                ]
                for key, value in sorted(resolved["limits"].items()):
                    used = usage.get(key, 0)
                    allowed = value["limit_value"]
                    remaining = None if allowed is None else max(int(allowed) - used, 0)
                    limits.append(
                        {
                            "limit_key": key,
                            **value,
                            "usage_value": used,
                            "remaining_value": remaining,
                            "usage_strategy": UsageService.METRIC_STRATEGIES.get(key, UsageService.LIVE_COUNT),
                            "denial_reason": "LIMIT_REACHED" if allowed is not None and used >= int(allowed) else None,
                        }
                    )

            if audit:
                db.add(
                    BillingActivationAdminService._audit(
                        scope,
                        activation.id,
                        "PLATFORM_SUPPORT_DATA_READ",
                        {
                            "access_mode": "READ_ONLY",
                            "snapshot_version": current.version if current else None,
                            "snapshot_present": current is not None,
                        },
                    )
                )
                await db.commit()

            plan = activation.subscription.plan if activation.subscription else None
            return {
                "activation": activation,
                "event_name": activation.event.name,
                "plan_id": plan.id if plan else None,
                "plan_name": plan.name if plan else None,
                "grant": activation.grant,
                "consumption": activation.grant_consumption,
                "current_snapshot": BillingActivationAdminService._snapshot_summary(current, activation.current_snapshot_set_id),
                "snapshot_history": [
                    BillingActivationAdminService._snapshot_summary(item, activation.current_snapshot_set_id)
                    for item in snapshots
                ],
                "features": features,
                "limits": limits,
                "usage": usage,
                "transfer_eligibility": transfer_eligibility,
                "denial_reason": None if current else "SNAPSHOT_REQUIRED",
            }

    @staticmethod
    def _snapshot_summary(snapshot: EventEntitlementSnapshotSet | None, current_id: uuid.UUID | None):
        if not snapshot:
            return None
        return {
            "id": snapshot.id,
            "version": snapshot.version,
            "resolution_reason": snapshot.resolution_reason,
            "resolver_version": snapshot.resolver_version,
            "policy_type": snapshot.policy_type,
            "checksum": snapshot.checksum,
            "previous_snapshot_set_id": snapshot.previous_snapshot_set_id,
            "created_at": snapshot.created_at,
            "is_current": snapshot.id == current_id,
        }

    @staticmethod
    async def refresh(
        db: AsyncSession,
        scope: PlatformSupportScope,
        activation_id: uuid.UUID,
        *,
        idempotency_key: str,
        resolution_reason: str,
        reason: str,
    ) -> dict[str, Any]:
        async with TenantContextGuard.scoped(db, scope.organization_id):
            activation = await ActivationService.refresh_snapshot(
                db,
                activation_id=activation_id,
                organization_id=scope.organization_id,
                idempotency_key=idempotency_key,
                actor_id=scope.actor.id,
                resolution_reason=resolution_reason,
            )
            db.add(
                BillingActivationAdminService._audit(
                    scope,
                    activation.id,
                    "BILLING_SNAPSHOT_REFRESHED",
                    {
                        "business_reason": reason,
                        "resolution_reason": resolution_reason,
                        "idempotency_key": idempotency_key,
                    },
                )
            )
            await db.commit()
        return await BillingActivationAdminService.inspect(db, scope, activation_id, audit=False)

    @staticmethod
    async def deactivate(
        db: AsyncSession,
        scope: PlatformSupportScope,
        activation_id: uuid.UUID,
        *,
        idempotency_key: str,
        reason: str,
    ) -> EventActivation:
        async with TenantContextGuard.scoped(db, scope.organization_id):
            activation = await db.scalar(
                select(EventActivation).where(
                    EventActivation.id == activation_id,
                    EventActivation.organization_id == scope.organization_id,
                )
            )
            if not activation:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activation not found.")
            deactivated = await ActivationService.deactivate_event(
                db,
                organization_id=scope.organization_id,
                event_id=activation.event_id,
                idempotency_key=idempotency_key,
                actor_id=scope.actor.id,
            )
            deactivated.deactivation_reason = reason
            db.add(BillingActivationAdminService._audit(
                scope,
                deactivated.id,
                "BILLING_EVENT_DEACTIVATED",
                {
                    "business_reason": reason,
                    "event_id": str(deactivated.event_id),
                    "grant_consumption_id": str(deactivated.grant_consumption_id) if deactivated.grant_consumption_id else None,
                    "idempotency_key": idempotency_key,
                },
            ))
            await db.commit()
            await db.refresh(deactivated)
            return deactivated

    @staticmethod
    async def transfer(
        db: AsyncSession,
        scope: PlatformSupportScope,
        activation_id: uuid.UUID,
        *,
        target_event_id: uuid.UUID,
        idempotency_key: str,
        reason: str,
    ) -> dict[str, Any]:
        async with TenantContextGuard.scoped(db, scope.organization_id):
            activation = await db.scalar(
                select(EventActivation).where(
                    EventActivation.id == activation_id,
                    EventActivation.organization_id == scope.organization_id,
                )
            )
            if not activation:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activation not found.")
            result = await ActivationService.transfer_activation(
                db,
                organization_id=scope.organization_id,
                source_event_id=activation.event_id,
                target_event_id=target_event_id,
                idempotency_key=idempotency_key,
                actor_id=scope.actor.id,
            )
            resulting_activation = result.get("activation")
            db.add(BillingActivationAdminService._audit(
                scope,
                activation.id,
                "BILLING_EVENT_TRANSFER_REQUESTED",
                {
                    "business_reason": reason,
                    "source_event_id": str(activation.event_id),
                    "target_event_id": str(target_event_id),
                    "result": result.get("status", "COMPLETED"),
                    "resulting_activation_id": str(resulting_activation.id) if resulting_activation else None,
                    "idempotency_key": idempotency_key,
                },
            ))
            await db.commit()
            if resulting_activation:
                result["activation"] = {
                    "id": str(resulting_activation.id),
                    "event_id": str(resulting_activation.event_id),
                    "status": resulting_activation.status,
                    "current_snapshot_set_id": str(resulting_activation.current_snapshot_set_id) if resulting_activation.current_snapshot_set_id else None,
                }
            return result
