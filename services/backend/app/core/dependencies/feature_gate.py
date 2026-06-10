from fastapi import Depends, HTTPException, status
from app.dependencies import ActiveUser, DB
from app.modules.rbac.services.entitlement_service import EntitlementService

class EntitlementRequiredException(HTTPException):
    def __init__(self, feature: str):
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "ERR_ENTITLEMENT_REQUIRED",
                "feature": feature,
                "upgrade_url": "/billing/upgrade"
            }
        )

def require_feature(feature_key: str):
    """
    FastAPI dependency decorator to enforce feature gating.
    Checks if the current organization is entitled to the given feature key.
    Allows access if the user is a platform admin/super admin.
    """
    async def dependency(
        user: ActiveUser,
        db: DB,
    ):
        # Super Admin bypass: skip check if user.is_platform_admin or super admin role
        if getattr(user, "is_platform_admin", False) or user.role == "super_admin" or getattr(user, "platform_role", None) == "SUPER_ADMIN":
            return user

        org_id = user.organization_id
        if not org_id:
            raise EntitlementRequiredException(feature_key)

        has_access = await EntitlementService.has_feature(db, org_id, feature_key)
        if not has_access:
            raise EntitlementRequiredException(feature_key)

        return user
    return Depends(dependency)
