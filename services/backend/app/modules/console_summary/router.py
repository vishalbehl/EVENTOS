from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.modules.billing.models.billing_domain_tables import Invoice
from app.modules.identity.models.security_event import SecurityEvent
from app.modules.identity.models.user import User
from app.modules.platform.models.organization import Organization
from app.modules.support.models.ticket import SupportTicket
from app.modules.console_summary.application.queries import ConsoleSummaryQueryService


class ConsoleKey(str, Enum):
    home = "home"
    business = "business"
    revenue = "revenue"
    operations = "operations"
    security = "security"
    developer = "developer"
    support = "support"
    settings = "settings"


class ConsoleMetric(BaseModel):
    key: str
    label: str
    value: int | float | str
    unit: str | None = None
    comparison: float | None = None
    comparison_label: str | None = None
    status: str = "neutral"
    destination: str | None = None


class AttentionItem(BaseModel):
    id: str
    label: str
    severity: str
    destination: str


class Capability(BaseModel):
    available: bool
    reason: str | None = None


class ConsoleSummary(BaseModel):
    console_key: ConsoleKey
    health: str
    generated_at: datetime
    metrics: list[ConsoleMetric] = Field(default_factory=list)
    attention: list[AttentionItem] = Field(default_factory=list)
    recent_activity: list[dict[str, Any]] = Field(default_factory=list)
    resource_count: int = 0
    capabilities: dict[str, Capability] = Field(default_factory=dict)


router = APIRouter(prefix="/consoles", tags=["superadmin-consoles"])


@router.get("/{console_key}/summary", response_model=ConsoleSummary)
async def get_console_summary(console_key: ConsoleKey, db: AsyncSession = Depends(get_db)) -> ConsoleSummary:
    """Return live, auditable aggregates only; unsupported domains are explicit."""
    metrics: list[ConsoleMetric] = []
    attention: list[AttentionItem] = []
    capabilities: dict[str, Capability] = {}
    query = ConsoleSummaryQueryService(db)

    if console_key == ConsoleKey.home:
        organizations = await query.count(Organization)
        active_organizations = await query.count(Organization, Organization.is_active.is_(True))
        users = await query.count(User)
        metrics = [
            ConsoleMetric(key="organizations", label="Organizations", value=organizations, destination="/organizations"),
            ConsoleMetric(key="active_organizations", label="Active organizations", value=active_organizations, destination="/organizations"),
            ConsoleMetric(key="users", label="Platform users", value=users, destination="/identity-security/users"),
        ]
        capabilities["platform_inventory"] = Capability(available=True)
    elif console_key == ConsoleKey.revenue:
        invoices = await query.count(Invoice)
        unpaid = await query.count(Invoice, Invoice.status == "UNPAID")
        metrics = [ConsoleMetric(key="invoices", label="Invoices", value=invoices, destination="/finance/invoices"), ConsoleMetric(key="unpaid_invoices", label="Unpaid invoices", value=unpaid, status="warning" if unpaid else "neutral", destination="/finance/invoices")]
        if unpaid:
            attention.append(AttentionItem(id="unpaid-invoices", label=f"{unpaid} invoices require collection review", severity="warning", destination="/finance/invoices"))
        capabilities["invoice_aggregation"] = Capability(available=True)
        capabilities["mrr_arr"] = Capability(available=False, reason="Use the canonical revenue analytics service; no duplicate calculation is performed here.")
    elif console_key == ConsoleKey.security:
        users = await query.count(User)
        events = await query.count(SecurityEvent)
        critical = await query.count(SecurityEvent, SecurityEvent.risk_level == "CRITICAL")
        metrics = [ConsoleMetric(key="users", label="Users", value=users, destination="/identity-security/users"), ConsoleMetric(key="security_events", label="Security events", value=events, destination="/identity-security/security-events"), ConsoleMetric(key="critical_events", label="Critical events", value=critical, status="danger" if critical else "neutral", destination="/identity-security/security-events")]
        if critical:
            attention.append(AttentionItem(id="critical-events", label=f"{critical} critical security events require review", severity="critical", destination="/identity-security/security-events"))
        capabilities["identity_posture"] = Capability(available=True)
    elif console_key == ConsoleKey.support:
        tickets = await query.count(SupportTicket)
        open_tickets = await query.count(SupportTicket, SupportTicket.status.in_(("OPEN", "IN_PROGRESS")))
        urgent = await query.count(SupportTicket, SupportTicket.priority.in_(("HIGH", "URGENT", "CRITICAL")), SupportTicket.status.in_(("OPEN", "IN_PROGRESS")))
        metrics = [ConsoleMetric(key="tickets", label="All tickets", value=tickets, destination="/support-center/tickets"), ConsoleMetric(key="open_tickets", label="Open tickets", value=open_tickets, destination="/support-center/tickets"), ConsoleMetric(key="urgent_tickets", label="High priority open", value=urgent, status="warning" if urgent else "neutral", destination="/support-center/tickets")]
        if urgent:
            attention.append(AttentionItem(id="urgent-tickets", label=f"{urgent} high-priority tickets need assignment", severity="warning", destination="/support-center/tickets"))
        capabilities["ticket_aggregation"] = Capability(available=True)
    else:
        capabilities["summary_aggregation"] = Capability(available=False, reason="A canonical aggregate service is not available for this console. Child routes remain live and no values are fabricated.")

    return ConsoleSummary(console_key=console_key, health="healthy" if metrics else "unknown", generated_at=datetime.now(timezone.utc), metrics=metrics, attention=attention, resource_count=len(metrics), capabilities=capabilities)
