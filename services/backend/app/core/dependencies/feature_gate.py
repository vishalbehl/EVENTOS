import uuid

from fastapi import Depends, HTTPException, Path, status
from sqlalchemy import select

from app.dependencies import ActiveUser, CurrentEvent, DB
from app.modules.billing.services.entitlement_resolver import EntitlementResolver
from app.modules.billing.services.capability_service import CapabilityService
from app.modules.billing.capability_registry import OPERATION_PERMISSIONS, feature_for_operation
from app.modules.identity.models.user import User
from app.modules.events.models.event import Event
from app.modules.platform.models.organization import Organization
from app.modules.rbac.services.permission_service import get_user_permissions


class EntitlementRequiredException(HTTPException):
    def __init__(
        self,
        feature: str,
        reason_code: str = "NOT_ENTITLED",
        *,
        organization_id: uuid.UUID | None = None,
        event_id: uuid.UUID | None = None,
        actor_user_id: uuid.UUID | None = None,
        operation: str | None = None,
    ):
        self.organization_id = organization_id
        self.event_id = event_id
        self.actor_user_id = actor_user_id
        self.operation = operation
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": reason_code,
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


async def _enforce_actor_permission(
    db,
    user_id: uuid.UUID | None,
    operation: str,
    *,
    event_id: uuid.UUID | None = None,
) -> None:
    permission = OPERATION_PERMISSIONS[operation]
    if permission is None or user_id is None:
        return
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "PERMISSION_DENIED", "permission": permission},
        )
    if _is_platform_bypass(user) or user.role in {"admin", "organiser", "organizer"}:
        return
    permissions = await get_user_permissions(db, user_id, event_id)
    if "*" not in permissions and permission not in permissions:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "PERMISSION_DENIED", "permission": permission},
        )


def require_org_feature(feature_key: str):
    async def dependency(user: ActiveUser, db: DB):
        org_id = user.organization_id
        if not org_id:
            raise EntitlementRequiredException(feature_key)
        await enforce_org_feature(db, org_id, feature_key, user_id=user.id)
        return user

    return Depends(dependency)


def require_org_operation(operation: str):
    feature_key = feature_for_operation(operation)

    async def dependency(user: ActiveUser, db: DB):
        org_id = user.organization_id
        if not org_id:
            raise EntitlementRequiredException(feature_key)
        await _enforce_actor_permission(db, user.id, operation)
        await enforce_org_feature(db, org_id, feature_key, user_id=user.id)
        return user

    return Depends(dependency)


async def enforce_org_feature(db, organization_id: uuid.UUID, feature_key: str, *, user_id: uuid.UUID | None = None):
    """Authoritative organization capability gate for services and admin flows."""
    try:
        result = await CapabilityService.resolve_organization(db, organization_id, user_id=user_id)
    except Exception as exc:
        raise EntitlementRequiredException(
            feature_key,
            "RESOLUTION_UNAVAILABLE",
            organization_id=organization_id,
            actor_user_id=user_id,
        ) from exc
    feature = result["features"].get(feature_key)
    if not feature or not feature["enabled"]:
        from app.config import settings
        if settings.ALLOW_TEST_CAPABILITY_BYPASS:
            return feature or {"key": feature_key, "enabled": True, "value": True}
        raise EntitlementRequiredException(
            feature_key,
            feature.get("reason_code", "NOT_ENTITLED") if feature else "NOT_ENTITLED",
            organization_id=organization_id,
            actor_user_id=user_id,
        )
    return feature


async def enforce_org_operation(
    db,
    organization_id: uuid.UUID,
    operation: str,
    *,
    user_id: uuid.UUID | None = None,
):
    await _enforce_actor_permission(db, user_id, operation)
    feature_key = feature_for_operation(operation)
    try:
        return await enforce_org_feature(
            db,
            organization_id,
            feature_key,
            user_id=user_id,
        )
    except EntitlementRequiredException as exc:
        exc.operation = operation
        raise


async def resolve_org_operation(
    db,
    organization_id: uuid.UUID,
    operation: str,
    *,
    user_id: uuid.UUID | None = None,
):
    """Resolve an organization operation without granting access on failure.

    This is for policy selectors such as SLA tiering where the enclosing base
    workflow remains available but premium behavior must fail closed.
    """
    feature_key = feature_for_operation(operation)
    try:
        result = await CapabilityService.resolve_organization(
            db, organization_id, user_id=user_id
        )
    except Exception:
        from app.modules.billing.services.capability_diagnostics_service import CapabilityDiagnosticsService
        await CapabilityDiagnosticsService.record_isolated(
            event_type="RESOLUTION_FAILURE",
            source="feature_gate.resolve_org_operation",
            organization_id=organization_id,
            actor_user_id=user_id,
            severity="ERROR",
            reason_code="RESOLUTION_UNAVAILABLE",
            capability_key=feature_key,
            operation_key=operation,
        )
        return {
            "key": feature_key,
            "enabled": False,
            "value": False,
            "reason_code": "RESOLUTION_UNAVAILABLE",
        }
    return result["features"].get(
        feature_key,
        {
            "key": feature_key,
            "enabled": False,
            "value": False,
            "reason_code": "NOT_ENTITLED",
        },
    )


async def require_event_activation(event: CurrentEvent, user: ActiveUser, db: DB):
    activation = await EntitlementResolver.get_event_activation(db, event.organization_id, event.id)
    if not activation or activation.status not in ("ACTIVE", "SUSPENDED", "EXPIRED", "TRANSFER_PENDING"):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={"code": "EVENT_NOT_ACTIVATED", "detail": "This event does not have an active subscription activation."},
        )
    return event


def require_event_feature(feature_key: str):
    async def dependency(event: CurrentEvent, user: ActiveUser, db: DB):
        # Platform actors retain administrative APIs, but organizer-domain
        # operations always enforce the selected event's actual capability.
        await enforce_event_feature(db, event.organization_id, event.id, feature_key, user_id=user.id)
        return event

    return Depends(dependency)


def require_event_operation(operation: str):
    feature_key = feature_for_operation(operation)

    async def dependency(event: CurrentEvent, user: ActiveUser, db: DB):
        await _enforce_actor_permission(db, user.id, operation, event_id=event.id)
        await enforce_event_feature(db, event.organization_id, event.id, feature_key, user_id=user.id)
        return event

    return Depends(dependency)


async def enforce_event_operation(
    db,
    organization_id: uuid.UUID,
    event_id: uuid.UUID,
    operation: str,
    *,
    user_id: uuid.UUID | None = None,
):
    await _enforce_actor_permission(db, user_id, operation, event_id=event_id)
    actor = await db.get(User, user_id) if user_id else None
    organization = await db.get(Organization, organization_id)
    internal_unrestricted = bool(
        organization and organization.has_unrestricted_capabilities
    )
    if (not actor or not _is_platform_bypass(actor)) and not internal_unrestricted:
        event = await db.scalar(
            select(Event).where(
                Event.id == event_id,
                Event.organization_id == organization_id,
            )
        )
        if event is None:
            raise HTTPException(status_code=404, detail={"code": "EVENT_NOT_FOUND"})
        if event.is_maintenance:
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail={
                    "code": "EVENT_MAINTENANCE",
                    "message": "This event is temporarily in maintenance mode.",
                },
            )
        if event.is_read_only:
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail={
                    "code": "EVENT_READ_ONLY",
                    "message": "This event currently allows reads only.",
                },
            )
    return await enforce_event_feature(
        db,
        organization_id,
        event_id,
        feature_for_operation(operation),
        user_id=user_id,
        operation=operation,
    )


async def enforce_event_feature(
    db,
    organization_id: uuid.UUID,
    event_id: uuid.UUID,
    feature_key: str,
    *,
    user_id: uuid.UUID | None = None,
    operation: str | None = None,
):
    """Authoritative operation gate usable by authenticated and public flows."""
    try:
        # Authorization needs feature state only; quota aggregation belongs to
        # capability/billing reads and is intentionally excluded from this hot path.
        result = await CapabilityService.resolve_event(
            db,
            organization_id,
            event_id,
            user_id=user_id,
            include_usage=False,
        )
    except Exception as exc:
        raise EntitlementRequiredException(
            feature_key,
            "RESOLUTION_UNAVAILABLE",
            organization_id=organization_id,
            event_id=event_id,
            actor_user_id=user_id,
            operation=operation,
        ) from exc
    feature = result["features"].get(feature_key)
    if not feature or not feature["enabled"]:
        from app.config import settings
        if settings.ALLOW_TEST_CAPABILITY_BYPASS:
            return feature or {"key": feature_key, "enabled": True, "value": True}
        raise EntitlementRequiredException(
            feature_key,
            feature.get("reason_code", "NOT_ENTITLED") if feature else "NOT_ENTITLED",
            organization_id=organization_id,
            event_id=event_id,
            actor_user_id=user_id,
            operation=operation,
        )
    return feature


def require_feature(feature_key: str):
    return require_org_feature(feature_key)
