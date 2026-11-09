"""Finite customer billing admission; commercial entitlements are not grants."""
import uuid
from contextvars import ContextVar

from app.modules.billing.commercial_policy import CUSTOMER_COMMERCIAL_ACTIONS

from fastapi import HTTPException, Request, Response

from app.dependencies import ActiveUser, DB, TokenDep, require_step_up
from app.modules.rbac.services.access_contexts import selected_request_context, verify_direct_context


_customer_commercial_organization: ContextVar[uuid.UUID | None] = ContextVar(
    "customer_commercial_organization", default=None
)


def current_customer_commercial_organization() -> uuid.UUID:
    organization_id = _customer_commercial_organization.get()
    if organization_id is None:
        raise HTTPException(503, detail={"code": "COMMERCIAL_CONTEXT_REQUIRED"})
    return organization_id


async def customer_commercial_access(request: Request, response: Response, user: ActiveUser, db: DB, token: TokenDep):
    from app.modules.rbac.routers.access_foundation import browser_context_audience
    await browser_context_audience(token)
    name = getattr(request.scope.get("endpoint"), "__name__", "")
    if name not in CUSTOMER_COMMERCIAL_ACTIONS:
        raise HTTPException(503, detail={"code": "UNREGISTERED_COMMERCIAL_OPERATION"})
    action = CUSTOMER_COMMERCIAL_ACTIONS[name]
    response.headers["Cache-Control"] = "no-store"
    if request.method not in {"GET", "HEAD"} and action:
        await require_step_up(token)
    # Commercial authority is never inherited from an operational EMC
    # delegation. Client billing access requires the user's own direct role.
    if token.access_mode != "DIRECT":
        raise HTTPException(403, detail={"code": "DIRECT_BILLING_MEMBERSHIP_REQUIRED"})
    if name == "add_emc_workspace":
        # Its service acquires all party revisions in sorted order BEFORE the
        # account row. Do not prelock the source and invert that order here.
        await verify_direct_context(db, user, token.active_organization_id, token.active_workspace_id)
        context_token = _customer_commercial_organization.set(token.active_organization_id)
        try:
            # approved_attachment performs current action admission under the
            # complete sorted party-lock set before any commercial account lock.
            yield
        finally:
            _customer_commercial_organization.reset(context_token)
        return
    context_token = _customer_commercial_organization.set(token.active_organization_id)
    try:
        async with selected_request_context(db, user, token, action=action):
            yield
    finally:
        _customer_commercial_organization.reset(context_token)
