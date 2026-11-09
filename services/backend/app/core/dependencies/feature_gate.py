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
from app.modules.rbac.services.access_contexts import actor_request_context
from app.modules.rbac.services.platform_operation_authority import authorize_platform_operation
from app.database import tenant_org_id
from app.core.tenant_context import TenantContextGuard


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


async def _enforce_actor_permission(
    db,
    user_id: uuid.UUID | None,
    operation: str,
    *,
    event_id: uuid.UUID | None = None,
    organization_id: uuid.UUID | None = None,
    audience: str = "CUSTOMER",
) -> None:
    permission = OPERATION_PERMISSIONS[operation]
    if audience == "PLATFORM":
        if user_id is None or organization_id is None:
            raise HTTPException(403, detail={"code": "PLATFORM_PERMISSION_DENIED"})
        await authorize_platform_operation(db, user_id, organization_id, operation)
        return
    if audience != "CUSTOMER":
        raise HTTPException(403, detail={"code": "PERMISSION_DENIED"})
    # Actor-less calls evaluate commercial policy only. Workers/machine/public
    # paths must establish their own registered authority before this call.
    if user_id is None:
        return
    org = organization_id or tenant_org_id.get()
    if org is None:
        raise HTTPException(403, detail={"code": "TENANT_CONTEXT_REQUIRED"})
    async with actor_request_context(
        db, user_id, org, event_id=event_id, action=permission
    ):
        pass


def require_org_feature(feature_key: str):
    async def dependency(user: ActiveUser, db: DB):
        org_id = tenant_org_id.get()
        if not org_id:
            raise EntitlementRequiredException(feature_key)
        async with actor_request_context(db, user.id, org_id):
            await enforce_org_feature(db, org_id, feature_key, user_id=user.id)
        return user

    return Depends(dependency)


def require_org_operation(operation: str):
    feature_key = feature_for_operation(operation)

    async def dependency(user: ActiveUser, db: DB):
        org_id = tenant_org_id.get()
        if not org_id:
            raise EntitlementRequiredException(feature_key)
        await _enforce_actor_permission(db, user.id, operation, organization_id=org_id)
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
    _audience: str = "CUSTOMER",
):
    await _enforce_actor_permission(db, user_id, operation, organization_id=organization_id, audience=_audience)
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


async def enforce_platform_org_operation(db, organization_id, operation, *, user_id):
    return await enforce_org_operation(db, organization_id, operation, user_id=user_id, _audience="PLATFORM")


async def enforce_platform_event_operation(db, organization_id, event_id, operation, *, user_id):
    return await enforce_event_operation(db, organization_id, event_id, operation,
                                         user_id=user_id, _audience="PLATFORM")


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
        await enforce_event_feature(
            db,
            event.organization_id,
            event.id,
            feature_key,
            event=event,
            user_id=user.id,
        )
        return event

    return Depends(dependency)


def require_event_operation(operation: str):
    feature_key = feature_for_operation(operation)

    async def dependency(event: CurrentEvent, user: ActiveUser, db: DB):
        await enforce_event_operation(db, event.organization_id, event.id, operation, user_id=user.id)
        return event

    return Depends(dependency)


async def enforce_event_operation(
    db,
    organization_id: uuid.UUID,
    event_id: uuid.UUID,
    operation: str,
    *,
    user_id: uuid.UUID | None = None,
    _audience: str = "CUSTOMER",
):
    await _enforce_actor_permission(db, user_id, operation, event_id=event_id,
                                    organization_id=organization_id, audience=_audience)
    async with TenantContextGuard.scoped(db, organization_id):
        # Subscription exceptions and platform roles do not remove operational locks.
        event = await db.scalar(
            select(Event).where(
                Event.id == event_id,
                Event.organization_id == organization_id,
                Event.deleted_at.is_(None),
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
        read_action = OPERATION_PERMISSIONS[operation]
        if event.is_read_only and (read_action is None or read_action.split(":")[-1] not in {"VIEW", "VIEW_QUEUE", "REG_DASHBOARD", "HUB", "LOGS"}):
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
            event=event,
            user_id=user_id,
            operation=operation,
        )


async def enforce_event_feature(
    db,
    organization_id: uuid.UUID,
    event_id: uuid.UUID,
    feature_key: str,
    *,
    event: Event | None = None,
    user_id: uuid.UUID | None = None,
    operation: str | None = None,
):
    """Authoritative operation gate usable by authenticated and public flows."""
    try:
        # Authorization needs feature state only; quota aggregation belongs to
        # capability/billing reads and is intentionally excluded from this hot path.
        feature = await CapabilityService.resolve_event_feature_for_enforcement(
            db,
            organization_id,
            event_id,
            feature_key,
            event=event,
            user_id=user_id,
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
