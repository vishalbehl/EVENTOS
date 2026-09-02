"""Read-only CRM query services.

Complex workspace reads live here so routers remain responsible for HTTP,
support authorization, and audit policy rather than query orchestration.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.crm.models.core import Account, Contact
from app.modules.crm.models.crm_domain_tables import Activity, Note, Opportunity, PipelineStage, Task


@dataclass(frozen=True)
class AccountWorkspaceRead:
    account: Account
    contacts: list[Contact]
    opportunities: list[Opportunity]
    activities: list[Activity]
    tasks: list[Task]
    notes: list[Note]


class CrmAccountWorkspaceQueryService:
    """Load one bounded, tenant-scoped CRM account workspace.

    This service performs reads only. The caller owns authorization, audit
    persistence, and transaction lifecycle.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get(
        self,
        *,
        organization_id: uuid.UUID,
        account_id: uuid.UUID,
    ) -> AccountWorkspaceRead | None:
        account = await self.db.scalar(
            select(Account).where(
                Account.id == account_id,
                Account.organization_id == organization_id,
            )
        )
        if account is None:
            return None

        contacts = list((await self.db.scalars(
            select(Contact).where(
                Contact.organization_id == organization_id,
                Contact.account_id == account_id,
            ).order_by(Contact.created_at.desc(), Contact.id.desc()).limit(100)
        )).all())
        opportunities = list((await self.db.scalars(
            select(Opportunity).where(
                Opportunity.organization_id == organization_id,
                Opportunity.account_id == account_id,
            ).order_by(Opportunity.created_at.desc(), Opportunity.id.desc()).limit(100)
        )).all())

        contact_ids = [item.id for item in contacts]
        opportunity_ids = [item.id for item in opportunities]

        async def related_rows(model):
            clauses = [(model.entity_type == "account") & (model.entity_id == account_id)]
            if contact_ids:
                clauses.append((model.entity_type == "contact") & model.entity_id.in_(contact_ids))
            if opportunity_ids:
                clauses.append((model.entity_type == "opportunity") & model.entity_id.in_(opportunity_ids))
            return list((await self.db.scalars(
                select(model).where(
                    model.organization_id == organization_id,
                    or_(*clauses),
                ).order_by(model.created_at.desc(), model.id.desc()).limit(100)
            )).all())

        return AccountWorkspaceRead(
            account=account,
            contacts=contacts,
            opportunities=opportunities,
            activities=await related_rows(Activity),
            tasks=await related_rows(Task),
            notes=await related_rows(Note),
        )


class CrmCatalogQueryService:
    """Return bounded global CRM catalog data without router-owned SQL."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_pipeline_stages(self) -> list[PipelineStage]:
        statement = (
            select(PipelineStage)
            .order_by(PipelineStage.order, PipelineStage.id)
            .limit(100)
        )
        return list((await self.db.scalars(statement)).all())
