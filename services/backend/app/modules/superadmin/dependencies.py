# =============================================================
# Conference Platform — Super Admin Dependencies
# app/modules/superadmin/dependencies.py
#
# Provides a reusable FastAPI dependency that gates access to
# all Super Admin routes.
#
# A user qualifies as Super Admin if ANY of these is true:
#   1. user.role == "super_admin"         (primary role field)
#   2. user.platform_role == "SUPER_ADMIN" (platform-level role field)
#   3. user.is_platform_admin == True     (legacy boolean flag)
#
# This replicates the same multi-field check used in:
#   - impersonation.py  (current_user.platform_role != "SUPER_ADMIN")
#   - organisations.py  (_require_platform_admin checks role + is_platform_admin)
#   - dependencies.py   (SuperAdminOnly checks user.role == "super_admin")
# =============================================================

from __future__ import annotations

from fastapi import Depends, HTTPException, status

from app.dependencies import require_active_user
from app.modules.identity.models.user import User


async def require_super_admin(
    current_user: User = Depends(require_active_user),
) -> User:
    """
    Dependency that restricts access to Super Admin users only.

    Checks both ``user.role`` and ``user.platform_role`` so that
    accounts promoted via either pathway are correctly authorized.
    Also honours the legacy ``is_platform_admin`` boolean.

    Raises:
        HTTP 403 — if the authenticated user is not a Super Admin.
    """
    is_super_admin = (
        current_user.role == "super_admin"
        or current_user.platform_role == "SUPER_ADMIN"
        or getattr(current_user, "is_platform_admin", False)
    )

    if not is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super Admin access required.",
        )

    return current_user
