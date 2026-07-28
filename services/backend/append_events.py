import sys

code = '''
from pydantic import BaseModel
from typing import Optional

class ApplyPlanRequest(BaseModel):
    plan_name: Optional[str] = None
    plan_id: Optional[str] = None
    addon_keys: Optional[list[str]] = None

@router.post("/{event_id}/apply-plan", response_model=EventResponse)
async def apply_plan_to_event(
    payload: ApplyPlanRequest,
    event: CurrentEvent,
    current_user: OrganizerOrAbove,
    db: AsyncSession = Depends(get_db),
) -> EventResponse:
    event.status = "active"

    try:
        from app.modules.billing.models.subscription import SubscriptionPlan, OrganizationSubscription
        from app.modules.billing.models.event_activation import EventActivation
        from app.modules.platform.models.organization_console import EventCommercialContract
        from sqlalchemy.orm import selectinload
        from sqlalchemy import func

        plan = None
        if payload.plan_name:
            plan = await db.scalar(
                select(SubscriptionPlan).where(
                    func.lower(SubscriptionPlan.name) == payload.plan_name.strip().lower()
                )
            )
        elif payload.plan_id:
            try:
                import uuid
                plan_uuid = uuid.UUID(payload.plan_id)
                plan = await db.get(SubscriptionPlan, plan_uuid)
            except ValueError:
                pass

        if not plan:
            plan = await db.scalar(
                select(SubscriptionPlan).where(
                    SubscriptionPlan.is_active.is_(True)
                ).order_by(SubscriptionPlan.display_order.desc()).limit(1)
            )

        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)

        sub = await db.scalar(
            select(OrganizationSubscription).where(
                OrganizationSubscription.organization_id == current_user.organization_id
            ).order_by(OrganizationSubscription.created_at.desc()).limit(1)
        )
        if sub:
            if plan:
                sub.plan_id = plan.id
            sub.status = "ACTIVE"
            sub.status_reason = "PLAN_PURCHASE_APPLIED"
            sub.status_changed_at = now
            sub.status_changed_by = current_user.id
        elif plan:
            sub = OrganizationSubscription(
                organization_id=current_user.organization_id,
                plan_id=plan.id,
                status="ACTIVE",
                status_reason="PLAN_PURCHASE_APPLIED",
                status_changed_at=now,
                status_changed_by=current_user.id,
            )
            db.add(sub)
            await db.flush()

        if sub:
            activation = await db.scalar(
                select(EventActivation).where(
                    EventActivation.event_id == event.id,
                    EventActivation.organization_id == current_user.organization_id,
                ).limit(1)
            )
            if activation:
                activation.status = "ACTIVE"
                activation.subscription_id = sub.id
                activation.activated_at = now
            else:
                db.add(EventActivation(
                    organization_id=current_user.organization_id,
                    event_id=event.id,
                    subscription_id=sub.id,
                    status="ACTIVE",
                    activation_policy="SNAPSHOT_LOCKED",
                    activated_at=now,
                ))

        current_contract = await db.scalar(
            select(EventCommercialContract).where(
                EventCommercialContract.event_id == event.id,
                EventCommercialContract.status == "ACTIVE",
            ).with_for_update()
        )
        version = 1
        if current_contract:
            current_contract.status = "SUPERSEDED"
            version = current_contract.version + 1

        entitlements = {
            "plan_name": plan.name if plan else "PRO",
            "active": True,
            "max_users": getattr(plan, "max_users", 10),
            "max_registrations": getattr(plan, "max_registrations", 1000),
            "max_speakers": getattr(plan, "max_speakers", 100),
            "max_sessions": getattr(plan, "max_sessions", 50),
            "max_rooms": getattr(plan, "max_rooms", 10),
            "storage_quota_mb": getattr(plan, "storage_quota_mb", 10240),
            "addon_keys": payload.addon_keys or [],
        }

        if plan:
            from app.modules.platform.models.feature import FeatureCatalog
            from app.modules.billing.models.subscription import PlanFeature
            from app.modules.billing.capability_registry import CATALOG_LIMIT_KEYS
            
            typed_assignments = (await db.execute(
                select(FeatureCatalog.key, PlanFeature.value_type, PlanFeature.entitlement_value)
                .join(PlanFeature, PlanFeature.feature_id == FeatureCatalog.id)
                .where(PlanFeature.plan_id == plan.id, PlanFeature.enabled.is_(True))
            )).all()
            for feature_key, value_type, raw in typed_assignments:
                value = raw.get("value") if isinstance(raw, dict) else True
                contract_key = CATALOG_LIMIT_KEYS.get(feature_key, feature_key)
                entitlements[contract_key] = {"type": value_type, "value": value}

        db.add(EventCommercialContract(
            organization_id=current_user.organization_id,
            event_id=event.id,
            version=version,
            status="ACTIVE",
            plan_key=plan.name if plan else "COMMERCIAL_PLAN",
            plan_version=str(getattr(plan, "version", 1)),
            currency=getattr(plan, "currency", "INR") or "INR",
            entitlements=entitlements,
            source={"type": "PLAN_PURCHASE_APPLIED", "user_id": str(current_user.id)},
            effective_at=now,
            created_by=current_user.id,
        ))

        from app.modules.platform.models.organization_console import CapabilityRevision
        from sqlalchemy.dialects.postgresql import insert as pg_insert
        for scope in ["ORGANIZATION", "EVENT"]:
            stmt = pg_insert(CapabilityRevision).values(
                scope_type=scope,
                revision=1,
            ).on_conflict_do_update(
                index_elements=["scope_type"],
                set_={"revision": CapabilityRevision.revision + 1, "updated_at": func.now()}
            )
            await db.execute(stmt)

        await db.commit()
        await db.refresh(event)

    except Exception as e:
        await db.rollback()
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to apply plan: {str(e)}")

    return event
'''

with open('app/modules/rbac/routers/events.py', 'a') as f:
    f.write(code)
