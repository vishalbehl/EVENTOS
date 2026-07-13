import uuid

from fastapi import Depends, HTTPException, Path, status

from app.dependencies import ActiveUser, CurrentEvent, DB
from app.modules.billing.services.entitlement_resolver import EntitlementResolver
from app.modules.billing.services.limit_guard import LimitGuard


class EntitlementRequiredException(HTTPException):
    def __init__(self, feature: str):
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "ERR_ENTITLEMENT_REQUIRED",
                "feature": feature,
                "upgrade_url": "/billing/upgrade",
            },
        )


def _is_platform_bypass(user) -> bool:
    return bool(
        getattr(user, "is_platform_admin", False)
        or user.role == "super_admin"
        or getattr(user, "platform_role", None) == "SUPER_ADMIN"
    )


def require_org_feature(feature_key: str):
    async def dependency(user: ActiveUser, db: DB):
        if _is_platform_bypass(user):
            return user
        org_id = user.organization_id
        if not org_id:
            raise EntitlementRequiredException(feature_key)
        has_access = await EntitlementResolver.has_feature(db, org_id, feature_key)
        if not has_access:
            raise EntitlementRequiredException(feature_key)
        return user

    return Depends(dependency)


async def require_event_activation(event: CurrentEvent, user: ActiveUser, db: DB):
    if _is_platform_bypass(user):
        return event
    activation = await EntitlementResolver.get_event_activation(db, event.organization_id, event.id)
    if not activation or activation.status not in ("ACTIVE", "SUSPENDED", "EXPIRED", "TRANSFER_PENDING"):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={"code": "EVENT_NOT_ACTIVATED", "detail": "This event does not have an active subscription activation."},
        )
    return event


def require_event_feature(feature_key: str):
    async def dependency(event: CurrentEvent, user: ActiveUser, db: DB):
        if _is_platform_bypass(user):
            return event
        has_access = await EntitlementResolver.has_feature(db, event.organization_id, feature_key, event_id=event.id)
        if not has_access:
            raise EntitlementRequiredException(feature_key)
        return event

    return Depends(dependency)


def require_event_limit_headroom(limit_key: str):
    async def dependency(event: CurrentEvent, user: ActiveUser, db: DB):
        if _is_platform_bypass(user):
            return event
        if limit_key == "max_event_team_members":
            await LimitGuard.check_event_team_members(db, event.organization_id, event.id)
        elif limit_key == "max_badge_templates":
            await LimitGuard.check_badge_templates(db, event.organization_id, event.id)
        elif limit_key == "max_certificate_templates":
            await LimitGuard.check_certificate_templates(db, event.organization_id, event.id)
        return event

    return Depends(dependency)


def require_feature(feature_key: str):
    return require_org_feature(feature_key)
