"""Typed, tenant-scoped billing intelligence endpoints for platform support."""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Query
from sqlalchemy import select

from app.dependencies import DB
from app.modules.billing.models.credit_notes import CreditNote
from app.modules.billing.models.financial_audit_trail import FinancialAuditTrail
from app.modules.billing.models.licensing import EntitlementGrant
from app.modules.billing.models.subscription import (
    OrganizationSubscription,
    RevenueMetric,
    SubscriptionPlan,
)
from app.modules.billing.schemas.billing_admin import (
    CreditNoteAdminResponse,
    EntitlementGrantAdminResponse,
    FinancialAuditAdminResponse,
    OrganizationSubscriptionAdminResponse,
    RevenueMetricAdminResponse,
    SubscriptionPlanAdminResponse,
)
from app.modules.platform.support_access import (
    PlatformSupportScopeDependency,
    execute_platform_support_cursor_read,
)
from app.schemas.cursor_pagination import CursorPage


router = APIRouter(prefix="/billing-admin", tags=["billing-superadmin"])


@router.get("/plans", response_model=List[SubscriptionPlanAdminResponse])
async def list_subscription_plans(db: DB):
    """Return the global subscription-plan catalogue."""
    return (await db.execute(select(SubscriptionPlan))).scalars().all()


@router.get(
    "/subscriptions",
    response_model=CursorPage[OrganizationSubscriptionAdminResponse],
)
async def list_org_subscriptions(
    db: DB,
    support_scope: PlatformSupportScopeDependency,
    status: str | None = Query(None),
    cursor: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    statement = select(OrganizationSubscription).where(
        OrganizationSubscription.organization_id == support_scope.organization_id
    )
    if status:
        statement = statement.where(OrganizationSubscription.status == status.upper())
    return await execute_platform_support_cursor_read(
        db,
        support_scope,
        statement,
        timestamp_column=OrganizationSubscription.created_at,
        id_column=OrganizationSubscription.id,
        cursor=cursor,
        limit=limit,
        resource_type="billing_subscriptions",
    )


@router.get(
    "/entitlements",
    response_model=CursorPage[EntitlementGrantAdminResponse],
)
async def list_entitlement_grants(
    db: DB,
    support_scope: PlatformSupportScopeDependency,
    status: str | None = Query(None),
    grant_type: str | None = Query(None),
    cursor: str | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
):
    statement = select(EntitlementGrant).where(
        EntitlementGrant.organization_id == support_scope.organization_id
    )
    if status:
        statement = statement.where(EntitlementGrant.status == status.upper())
    if grant_type:
        statement = statement.where(EntitlementGrant.grant_type == grant_type.upper())
    return await execute_platform_support_cursor_read(
        db,
        support_scope,
        statement,
        timestamp_column=EntitlementGrant.created_at,
        id_column=EntitlementGrant.id,
        cursor=cursor,
        limit=limit,
        resource_type="billing_entitlement_grants",
    )


@router.get("/credit-notes", response_model=CursorPage[CreditNoteAdminResponse])
async def list_credit_notes(
    db: DB,
    support_scope: PlatformSupportScopeDependency,
    status: str | None = Query(None),
    cursor: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    statement = select(CreditNote).where(
        CreditNote.organization_id == support_scope.organization_id
    )
    if status:
        statement = statement.where(CreditNote.status == status.upper())
    return await execute_platform_support_cursor_read(
        db,
        support_scope,
        statement,
        timestamp_column=CreditNote.created_at,
        id_column=CreditNote.id,
        cursor=cursor,
        limit=limit,
        resource_type="billing_credit_notes",
    )


@router.get(
    "/financial-audit-trail",
    response_model=CursorPage[FinancialAuditAdminResponse],
)
async def list_financial_audit_trail(
    db: DB,
    support_scope: PlatformSupportScopeDependency,
    activity_type: str | None = Query(None),
    entity_type: str | None = Query(None),
    cursor: str | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
):
    statement = select(FinancialAuditTrail).where(
        FinancialAuditTrail.organization_id == support_scope.organization_id
    )
    if activity_type:
        statement = statement.where(FinancialAuditTrail.activity_type == activity_type.upper())
    if entity_type:
        statement = statement.where(FinancialAuditTrail.entity_type == entity_type.upper())
    return await execute_platform_support_cursor_read(
        db,
        support_scope,
        statement,
        timestamp_column=FinancialAuditTrail.occurred_at,
        id_column=FinancialAuditTrail.id,
        cursor=cursor,
        limit=limit,
        resource_type="billing_financial_audit",
    )


@router.get("/revenue-metrics", response_model=CursorPage[RevenueMetricAdminResponse])
async def list_revenue_metrics(
    db: DB,
    support_scope: PlatformSupportScopeDependency,
    cursor: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    statement = select(RevenueMetric).where(
        RevenueMetric.organization_id == support_scope.organization_id
    )
    return await execute_platform_support_cursor_read(
        db,
        support_scope,
        statement,
        timestamp_column=RevenueMetric.created_at,
        id_column=RevenueMetric.id,
        cursor=cursor,
        limit=limit,
        resource_type="billing_revenue_metrics",
    )
