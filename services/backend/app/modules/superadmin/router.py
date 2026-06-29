# =============================================================
# Conference Platform — Super Admin Aggregator Router
# app/modules/superadmin/router.py
#
# This module is a PURE AGGREGATOR. It does NOT define any
# business logic itself. It re-exports routes from existing
# module routers under the /api/v1/superadmin/ namespace and
# enforces Super Admin authentication on every route.
#
# Pattern:
#   - Import each existing sub-router
#   - Include it into `superadmin_router` with:
#       * a /superadmin sub-prefix
#       * `dependencies=[Depends(require_super_admin)]` applied
#         to every route in that sub-router
#
# ⚠️  DO NOT add business logic here. Route handlers stay in
#     their original modules. This router only re-mounts them.
# =============================================================

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.modules.superadmin.dependencies import require_super_admin

# ── Import existing module routers (not rewritten — re-exported) ──
from app.modules.rbac.routers.organisations import router as orgs_router
from app.modules.billing.routers.billing import router as billing_router
from app.modules.billing.routers.activations import router as activations_router
from app.modules.identity.routers.users import router as users_router
from app.modules.identity.routers.impersonation import router as impersonation_router
from app.modules.analytics.routers.dashboard import router as dashboard_router
from app.modules.developer.routers.developer import router as developer_router
from app.modules.search.routers.search import router as search_router
from app.modules.platform_health.router import router as platform_health_router


# ── Top-level superadmin router ───────────────────────────────
# All sub-routers are mounted here with the shared dependency.
# main.py will include this router under the /api/v1/superadmin prefix.

superadmin_router = APIRouter(
    prefix="/superadmin",
    tags=["superadmin"],
    dependencies=[Depends(require_super_admin)],
)

# ── Sub-router mounts ─────────────────────────────────────────
# Each existing router keeps its own internal prefix and tags.
# The superadmin_router adds an outer /superadmin prefix on top.

superadmin_router.include_router(orgs_router)
superadmin_router.include_router(billing_router)
superadmin_router.include_router(activations_router)
superadmin_router.include_router(users_router)
superadmin_router.include_router(impersonation_router)
superadmin_router.include_router(dashboard_router)
superadmin_router.include_router(developer_router)
superadmin_router.include_router(search_router)
superadmin_router.include_router(platform_health_router)
