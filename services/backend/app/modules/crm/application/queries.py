"""Read-only CRM query services.

Complex workspace reads live here so routers remain responsible for HTTP,
support authorization, and audit policy rather than query orchestration.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

from app.modules.crm.models.core import Account, Contact, Lead
from app.modules.crm.models.crm_domain_tables import Activity, Note, Opportunity, PipelineStage, Task


_CRM_RESPONSE_COLUMNS = {
    Account: ("id", "organization_id", "name", "website", "industry", "created_at", "updated_at", "version", "archived_at", "archived_by", "archive_reason"),
    Contact: ("id", "account_id", "organization_id", "first_name", "last_name", "email", "created_at", "updated_at", "version", "archived_at", "archived_by", "archive_reason"),
    Lead: ("id", "contact_id", "organization_id", "status", "source", "created_at", "updated_at", "version", "archived_at", "archived_by", "archive_reason"),
    Opportunity: ("id", "organization_id", "account_id", "stage_id", "name", "amount", "close_date", "created_at", "updated_at", "version", "archived_at", "archived_by", "archive_reason"),
    Activity: ("id", "organization_id", "entity_type", "entity_id", "activity_type", "description", "occurred_at", "created_by", "created_at", "updated_at", "version", "archived_at", "archived_by", "archive_reason"),
    Task: ("id", "organization_id", "entity_type", "entity_id", "subject", "due_date", "status", "assigned_to", "created_by", "completed_at", "created_at", "updated_at", "version", "archived_at", "archived_by", "archive_reason"),
    Note: ("id", "organization_id", "entity_type", "entity_id", "content", "created_by", "created_at", "updated_at", "version", "archived_at", "archived_by", "archive_reason"),
}


def _projected_select(model):
    columns = _CRM_RESPONSE_COLUMNS.get(model)
    statement = select(model)
    if columns:
        statement = statement.options(load_only(*(getattr(model, name) for name in columns)))
    return statement


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
            _projected_select(Account).where(
                Account.id == account_id,
                Account.organization_id == organization_id,
            )
        )
        if account is None:
            return None

        contacts = list((await self.db.scalars(
            _projected_select(Contact).where(
                Contact.organization_id == organization_id,
                Contact.account_id == account_id,
            ).order_by(Contact.created_at.desc(), Contact.id.desc()).limit(100)
        )).all())
        opportunities = list((await self.db.scalars(
            _projected_select(Opportunity).where(
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
                _projected_select(model).where(
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


class CrmListQueryService:
    """Build tenant-scoped CRM list statements for the support read path.

    Cursor mechanics and support authorization remain in the shared platform
    reader. This service owns the model, tenant predicate, filters, and
    deterministic base ordering so routers do not assemble ORM reads.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    _RESPONSE_COLUMNS = {
        Account: ("id", "organization_id", "name", "website", "industry", "created_at", "updated_at", "version", "archived_at", "archived_by", "archive_reason"),
        Contact: ("id", "account_id", "organization_id", "first_name", "last_name", "email", "created_at", "updated_at", "version", "archived_at", "archived_by", "archive_reason"),
        Lead: ("id", "contact_id", "organization_id", "status", "source", "created_at", "updated_at", "version", "archived_at", "archived_by", "archive_reason"),
        Opportunity: ("id", "organization_id", "account_id", "stage_id", "name", "amount", "close_date", "created_at", "updated_at", "version", "archived_at", "archived_by", "archive_reason"),
        # Lead and Opportunity are defined in separate model modules but use
        # the same explicit projection contract as the response schemas.
        Activity: ("id", "organization_id", "entity_type", "entity_id", "activity_type", "description", "occurred_at", "created_by", "created_at", "updated_at", "version", "archived_at", "archived_by", "archive_reason"),
        Task: ("id", "organization_id", "entity_type", "entity_id", "subject", "due_date", "status", "assigned_to", "created_by", "completed_at", "created_at", "updated_at", "version", "archived_at", "archived_by", "archive_reason"),
        Note: ("id", "organization_id", "entity_type", "entity_id", "content", "created_by", "created_at", "updated_at", "version", "archived_at", "archived_by", "archive_reason"),
    }

    def statement(
        self,
        *,
        model: Any,
        organization_id: uuid.UUID,
        include_archived: bool = False,
        entity_type: str | None = None,
        entity_id: uuid.UUID | None = None,
    ):
        statement = _projected_select(model).where(model.organization_id == organization_id)
        if not include_archived:
            statement = statement.where(model.archived_at.is_(None))
        if entity_type is not None:
            statement = statement.where(model.entity_type == entity_type)
        if entity_id is not None:
            statement = statement.where(model.entity_id == entity_id)
        return statement.order_by(model.created_at.desc(), model.id.desc())
