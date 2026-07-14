import uuid

from fastapi import APIRouter, Header, Query
from sqlalchemy import select

from app.dependencies import DB, StepUpAuth
from app.modules.crm.models.core import Account, Contact, Lead
from app.modules.crm.models.crm_domain_tables import Opportunity, PipelineStage
from app.modules.crm.schemas.crm_schemas import (
    AccountCreate,
    AccountResponse,
    AccountUpdate,
    ContactCreate,
    ContactResponse,
    ContactUpdate,
    CrmLifecycleRequest,
    LeadCreate,
    LeadResponse,
    LeadUpdate,
    OpportunityCreate,
    OpportunityResponse,
    OpportunityUpdate,
    PipelineStageResponse,
)
from app.modules.crm.services.lifecycle_service import CrmLifecycleService
from app.modules.platform.support_access import (
    PlatformSupportScopeDependency,
    execute_platform_support_cursor_read,
)
from app.schemas.cursor_pagination import CursorPage

router = APIRouter(prefix="/crm", tags=["superadmin-crm"])


IdempotencyKey = Header(..., alias="Idempotency-Key", min_length=8, max_length=128)


@router.get("/pipeline-stages", response_model=list[PipelineStageResponse])
async def list_pipeline_stages(db: DB):
    return (await db.execute(select(PipelineStage).order_by(PipelineStage.order, PipelineStage.id))).scalars().all()

@router.get("/accounts", response_model=CursorPage[AccountResponse])
async def list_accounts(
    db: DB,
    support_scope: PlatformSupportScopeDependency,
    cursor: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    include_archived: bool = Query(False),
) -> CursorPage[AccountResponse]:
    """Retrieve accounts for one explicitly selected support tenant."""
    stmt = select(Account).where(
        Account.organization_id == support_scope.organization_id
    )
    if not include_archived:
        stmt = stmt.where(Account.archived_at.is_(None))
    return await execute_platform_support_cursor_read(
        db, support_scope, stmt,
        timestamp_column=Account.created_at, id_column=Account.id,
        cursor=cursor, limit=limit, resource_type="crm_accounts",
    )

@router.get("/contacts", response_model=CursorPage[ContactResponse])
async def list_contacts(
    db: DB,
    support_scope: PlatformSupportScopeDependency,
    cursor: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    include_archived: bool = Query(False),
) -> CursorPage[ContactResponse]:
    stmt = select(Contact).where(
        Contact.organization_id == support_scope.organization_id
    )
    if not include_archived:
        stmt = stmt.where(Contact.archived_at.is_(None))
    return await execute_platform_support_cursor_read(
        db, support_scope, stmt,
        timestamp_column=Contact.created_at, id_column=Contact.id,
        cursor=cursor, limit=limit, resource_type="crm_contacts",
    )

@router.get("/leads", response_model=CursorPage[LeadResponse])
async def list_leads(
    db: DB,
    support_scope: PlatformSupportScopeDependency,
    cursor: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    include_archived: bool = Query(False),
) -> CursorPage[LeadResponse]:
    stmt = select(Lead).where(
        Lead.organization_id == support_scope.organization_id
    )
    if not include_archived:
        stmt = stmt.where(Lead.archived_at.is_(None))
    return await execute_platform_support_cursor_read(
        db, support_scope, stmt,
        timestamp_column=Lead.created_at, id_column=Lead.id,
        cursor=cursor, limit=limit, resource_type="crm_leads",
    )

@router.get("/opportunities", response_model=CursorPage[OpportunityResponse])
async def list_opportunities(
    db: DB,
    support_scope: PlatformSupportScopeDependency,
    cursor: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    include_archived: bool = Query(False),
) -> CursorPage[OpportunityResponse]:
    stmt = select(Opportunity).where(
        Opportunity.organization_id == support_scope.organization_id
    )
    if not include_archived:
        stmt = stmt.where(Opportunity.archived_at.is_(None))
    return await execute_platform_support_cursor_read(
        db, support_scope, stmt,
        timestamp_column=Opportunity.created_at, id_column=Opportunity.id,
        cursor=cursor, limit=limit, resource_type="crm_opportunities",
    )


@router.post("/accounts", response_model=AccountResponse, status_code=201)
async def create_account(db: DB, support_scope: PlatformSupportScopeDependency, payload: AccountCreate, idempotency_key: str = IdempotencyKey):
    return await CrmLifecycleService.create(db, support_scope, "account", payload, idempotency_key)


@router.patch("/accounts/{record_id}", response_model=AccountResponse)
async def update_account(record_id: uuid.UUID, db: DB, support_scope: PlatformSupportScopeDependency, payload: AccountUpdate, idempotency_key: str = IdempotencyKey):
    return await CrmLifecycleService.update(db, support_scope, "account", record_id, payload, idempotency_key)


@router.post("/contacts", response_model=ContactResponse, status_code=201)
async def create_contact(db: DB, support_scope: PlatformSupportScopeDependency, payload: ContactCreate, idempotency_key: str = IdempotencyKey):
    return await CrmLifecycleService.create(db, support_scope, "contact", payload, idempotency_key)


@router.patch("/contacts/{record_id}", response_model=ContactResponse)
async def update_contact(record_id: uuid.UUID, db: DB, support_scope: PlatformSupportScopeDependency, payload: ContactUpdate, idempotency_key: str = IdempotencyKey):
    return await CrmLifecycleService.update(db, support_scope, "contact", record_id, payload, idempotency_key)


@router.post("/leads", response_model=LeadResponse, status_code=201)
async def create_lead(db: DB, support_scope: PlatformSupportScopeDependency, payload: LeadCreate, idempotency_key: str = IdempotencyKey):
    return await CrmLifecycleService.create(db, support_scope, "lead", payload, idempotency_key)


@router.patch("/leads/{record_id}", response_model=LeadResponse)
async def update_lead(record_id: uuid.UUID, db: DB, support_scope: PlatformSupportScopeDependency, payload: LeadUpdate, idempotency_key: str = IdempotencyKey):
    return await CrmLifecycleService.update(db, support_scope, "lead", record_id, payload, idempotency_key)


@router.post("/opportunities", response_model=OpportunityResponse, status_code=201)
async def create_opportunity(db: DB, support_scope: PlatformSupportScopeDependency, payload: OpportunityCreate, idempotency_key: str = IdempotencyKey):
    return await CrmLifecycleService.create(db, support_scope, "opportunity", payload, idempotency_key)


@router.patch("/opportunities/{record_id}", response_model=OpportunityResponse)
async def update_opportunity(record_id: uuid.UUID, db: DB, support_scope: PlatformSupportScopeDependency, payload: OpportunityUpdate, idempotency_key: str = IdempotencyKey):
    return await CrmLifecycleService.update(db, support_scope, "opportunity", record_id, payload, idempotency_key)


async def _set_lifecycle(record_type: str, record_id: uuid.UUID, archived: bool, db: DB, support_scope: PlatformSupportScopeDependency, payload: CrmLifecycleRequest, idempotency_key: str):
    return await CrmLifecycleService.set_archived(db, support_scope, record_type, record_id, payload, idempotency_key, archived)


@router.post("/accounts/{record_id}/archive", response_model=AccountResponse)
async def archive_account(record_id: uuid.UUID, db: DB, support_scope: PlatformSupportScopeDependency, step_up: StepUpAuth, payload: CrmLifecycleRequest, idempotency_key: str = IdempotencyKey):
    del step_up
    return await _set_lifecycle("account", record_id, True, db, support_scope, payload, idempotency_key)


@router.post("/accounts/{record_id}/restore", response_model=AccountResponse)
async def restore_account(record_id: uuid.UUID, db: DB, support_scope: PlatformSupportScopeDependency, step_up: StepUpAuth, payload: CrmLifecycleRequest, idempotency_key: str = IdempotencyKey):
    del step_up
    return await _set_lifecycle("account", record_id, False, db, support_scope, payload, idempotency_key)


@router.post("/contacts/{record_id}/archive", response_model=ContactResponse)
async def archive_contact(record_id: uuid.UUID, db: DB, support_scope: PlatformSupportScopeDependency, step_up: StepUpAuth, payload: CrmLifecycleRequest, idempotency_key: str = IdempotencyKey):
    del step_up
    return await _set_lifecycle("contact", record_id, True, db, support_scope, payload, idempotency_key)


@router.post("/contacts/{record_id}/restore", response_model=ContactResponse)
async def restore_contact(record_id: uuid.UUID, db: DB, support_scope: PlatformSupportScopeDependency, step_up: StepUpAuth, payload: CrmLifecycleRequest, idempotency_key: str = IdempotencyKey):
    del step_up
    return await _set_lifecycle("contact", record_id, False, db, support_scope, payload, idempotency_key)


@router.post("/leads/{record_id}/archive", response_model=LeadResponse)
async def archive_lead(record_id: uuid.UUID, db: DB, support_scope: PlatformSupportScopeDependency, step_up: StepUpAuth, payload: CrmLifecycleRequest, idempotency_key: str = IdempotencyKey):
    del step_up
    return await _set_lifecycle("lead", record_id, True, db, support_scope, payload, idempotency_key)


@router.post("/leads/{record_id}/restore", response_model=LeadResponse)
async def restore_lead(record_id: uuid.UUID, db: DB, support_scope: PlatformSupportScopeDependency, step_up: StepUpAuth, payload: CrmLifecycleRequest, idempotency_key: str = IdempotencyKey):
    del step_up
    return await _set_lifecycle("lead", record_id, False, db, support_scope, payload, idempotency_key)


@router.post("/opportunities/{record_id}/archive", response_model=OpportunityResponse)
async def archive_opportunity(record_id: uuid.UUID, db: DB, support_scope: PlatformSupportScopeDependency, step_up: StepUpAuth, payload: CrmLifecycleRequest, idempotency_key: str = IdempotencyKey):
    del step_up
    return await _set_lifecycle("opportunity", record_id, True, db, support_scope, payload, idempotency_key)


@router.post("/opportunities/{record_id}/restore", response_model=OpportunityResponse)
async def restore_opportunity(record_id: uuid.UUID, db: DB, support_scope: PlatformSupportScopeDependency, step_up: StepUpAuth, payload: CrmLifecycleRequest, idempotency_key: str = IdempotencyKey):
    del step_up
    return await _set_lifecycle("opportunity", record_id, False, db, support_scope, payload, idempotency_key)
