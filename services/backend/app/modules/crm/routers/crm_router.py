import uuid

from fastapi import APIRouter, Header, HTTPException, Query, status
from sqlalchemy import or_, select

from app.core.tenant_context import TenantContextGuard
from app.dependencies import DB, StepUpAuth
from app.modules.audit.models.audit_log import AuditLog
from app.modules.crm.models.core import Account, Contact, Lead
from app.modules.crm.models.crm_domain_tables import Activity, Note, Opportunity, PipelineStage, Task
from app.modules.crm.schemas.crm_schemas import (
    AccountCreate,
    AccountResponse,
    AccountWorkspaceMetrics,
    AccountWorkspaceResponse,
    AccountUpdate,
    ActivityCreate,
    ActivityResponse,
    ActivityUpdate,
    ContactCreate,
    ContactResponse,
    ContactUpdate,
    CrmLifecycleRequest,
    LeadCreate,
    LeadResponse,
    LeadUpdate,
    LeadConvertRequest,
    NoteCreate,
    NoteResponse,
    NoteUpdate,
    OpportunityCreate,
    OpportunityResponse,
    OpportunityUpdate,
    PipelineStageResponse,
    TaskCreate,
    TaskResponse,
    TaskUpdate,
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


async def _list_engagements(
    db: DB,
    support_scope: PlatformSupportScopeDependency,
    model,
    resource_type: str,
    cursor: str | None,
    limit: int,
    include_archived: bool,
    entity_type: str | None,
    entity_id: uuid.UUID | None,
):
    stmt = select(model).where(model.organization_id == support_scope.organization_id)
    if not include_archived:
        stmt = stmt.where(model.archived_at.is_(None))
    if entity_type:
        stmt = stmt.where(model.entity_type == entity_type)
    if entity_id:
        stmt = stmt.where(model.entity_id == entity_id)
    return await execute_platform_support_cursor_read(
        db, support_scope, stmt,
        timestamp_column=model.created_at, id_column=model.id,
        cursor=cursor, limit=limit, resource_type=resource_type,
    )


@router.get("/activities", response_model=CursorPage[ActivityResponse])
async def list_activities(db: DB, support_scope: PlatformSupportScopeDependency, cursor: str | None = Query(None), limit: int = Query(50, ge=1, le=200), include_archived: bool = Query(False), entity_type: str | None = Query(None), entity_id: uuid.UUID | None = Query(None)):
    return await _list_engagements(db, support_scope, Activity, "crm_activities", cursor, limit, include_archived, entity_type, entity_id)


@router.get("/tasks", response_model=CursorPage[TaskResponse])
async def list_tasks(db: DB, support_scope: PlatformSupportScopeDependency, cursor: str | None = Query(None), limit: int = Query(50, ge=1, le=200), include_archived: bool = Query(False), entity_type: str | None = Query(None), entity_id: uuid.UUID | None = Query(None)):
    return await _list_engagements(db, support_scope, Task, "crm_tasks", cursor, limit, include_archived, entity_type, entity_id)


@router.get("/notes", response_model=CursorPage[NoteResponse])
async def list_notes(db: DB, support_scope: PlatformSupportScopeDependency, cursor: str | None = Query(None), limit: int = Query(50, ge=1, le=200), include_archived: bool = Query(False), entity_type: str | None = Query(None), entity_id: uuid.UUID | None = Query(None)):
    return await _list_engagements(db, support_scope, Note, "crm_notes", cursor, limit, include_archived, entity_type, entity_id)


@router.get("/accounts/{record_id}/workspace", response_model=AccountWorkspaceResponse)
async def get_account_workspace(
    record_id: uuid.UUID,
    db: DB,
    support_scope: PlatformSupportScopeDependency,
) -> AccountWorkspaceResponse:
    """Return one bounded, tenant-scoped CRM account workspace read model."""
    async with TenantContextGuard.scoped(db, support_scope.organization_id):
        account = await db.scalar(
            select(Account).where(
                Account.id == record_id,
                Account.organization_id == support_scope.organization_id,
            )
        )
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CRM account not found.")

        contacts = list((await db.scalars(
            select(Contact).where(
                Contact.organization_id == support_scope.organization_id,
                Contact.account_id == record_id,
            ).order_by(Contact.created_at.desc(), Contact.id.desc()).limit(100)
        )).all())
        opportunities = list((await db.scalars(
            select(Opportunity).where(
                Opportunity.organization_id == support_scope.organization_id,
                Opportunity.account_id == record_id,
            ).order_by(Opportunity.created_at.desc(), Opportunity.id.desc()).limit(100)
        )).all())

        contact_ids = [item.id for item in contacts]
        opportunity_ids = [item.id for item in opportunities]

        async def related_rows(model):
            clauses = [(model.entity_type == "account") & (model.entity_id == record_id)]
            if contact_ids:
                clauses.append((model.entity_type == "contact") & model.entity_id.in_(contact_ids))
            if opportunity_ids:
                clauses.append((model.entity_type == "opportunity") & model.entity_id.in_(opportunity_ids))
            return list((await db.scalars(
                select(model).where(
                    model.organization_id == support_scope.organization_id,
                    or_(*clauses),
                ).order_by(model.created_at.desc(), model.id.desc()).limit(100)
            )).all())

        activities = await related_rows(Activity)
        tasks = await related_rows(Task)
        notes = await related_rows(Note)
        active_opportunities = [item for item in opportunities if item.archived_at is None]
        open_tasks = [
            item for item in tasks
            if item.archived_at is None and item.status not in {"COMPLETED", "CANCELLED"}
        ]

        db.add(AuditLog(
            request_id=support_scope.request_id,
            correlation_id=support_scope.correlation_id,
            organization_id=support_scope.organization_id,
            actor_user_id=support_scope.actor.id,
            resource_type="crm_account_workspace",
            resource_id=account.id,
            action_type="PLATFORM_SUPPORT_DATA_READ",
            actor_role=support_scope.actor.platform_role or support_scope.actor.role,
            new_state={
                "reason": support_scope.reason,
                "access_mode": "READ_ONLY",
                "contact_count": len(contacts),
                "opportunity_count": len(opportunities),
            },
            actor_ip=support_scope.actor_ip,
            actor_user_agent=support_scope.actor_user_agent,
            is_sensitive=True,
        ))
        await db.commit()

    return AccountWorkspaceResponse(
        account=account,
        contacts=contacts,
        opportunities=opportunities,
        activities=activities,
        tasks=tasks,
        notes=notes,
        metrics=AccountWorkspaceMetrics(
            contact_count=len(contacts),
            active_opportunity_count=len(active_opportunities),
            pipeline_value=sum(float(item.amount) for item in active_opportunities),
            open_task_count=len(open_tasks),
        ),
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


@router.post("/activities", response_model=ActivityResponse, status_code=201)
async def create_activity(db: DB, support_scope: PlatformSupportScopeDependency, step_up: StepUpAuth, payload: ActivityCreate, idempotency_key: str = IdempotencyKey):
    del step_up
    return await CrmLifecycleService.create(db, support_scope, "activity", payload, idempotency_key)


@router.patch("/activities/{record_id}", response_model=ActivityResponse)
async def update_activity(record_id: uuid.UUID, db: DB, support_scope: PlatformSupportScopeDependency, step_up: StepUpAuth, payload: ActivityUpdate, idempotency_key: str = IdempotencyKey):
    del step_up
    return await CrmLifecycleService.update(db, support_scope, "activity", record_id, payload, idempotency_key)


@router.post("/tasks", response_model=TaskResponse, status_code=201)
async def create_task(db: DB, support_scope: PlatformSupportScopeDependency, step_up: StepUpAuth, payload: TaskCreate, idempotency_key: str = IdempotencyKey):
    del step_up
    return await CrmLifecycleService.create(db, support_scope, "task", payload, idempotency_key)


@router.patch("/tasks/{record_id}", response_model=TaskResponse)
async def update_task(record_id: uuid.UUID, db: DB, support_scope: PlatformSupportScopeDependency, step_up: StepUpAuth, payload: TaskUpdate, idempotency_key: str = IdempotencyKey):
    del step_up
    return await CrmLifecycleService.update(db, support_scope, "task", record_id, payload, idempotency_key)


@router.post("/notes", response_model=NoteResponse, status_code=201)
async def create_note(db: DB, support_scope: PlatformSupportScopeDependency, step_up: StepUpAuth, payload: NoteCreate, idempotency_key: str = IdempotencyKey):
    del step_up
    return await CrmLifecycleService.create(db, support_scope, "note", payload, idempotency_key)


@router.patch("/notes/{record_id}", response_model=NoteResponse)
async def update_note(record_id: uuid.UUID, db: DB, support_scope: PlatformSupportScopeDependency, step_up: StepUpAuth, payload: NoteUpdate, idempotency_key: str = IdempotencyKey):
    del step_up
    return await CrmLifecycleService.update(db, support_scope, "note", record_id, payload, idempotency_key)


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


@router.post("/leads/{record_id}/convert", response_model=OpportunityResponse, status_code=201)
async def convert_lead(
    record_id: uuid.UUID,
    db: DB,
    support_scope: PlatformSupportScopeDependency,
    step_up: StepUpAuth,
    payload: LeadConvertRequest,
    idempotency_key: str = IdempotencyKey,
):
    del step_up
    return await CrmLifecycleService.convert_lead(db, support_scope, record_id, payload, idempotency_key)


@router.post("/opportunities/{record_id}/archive", response_model=OpportunityResponse)
async def archive_opportunity(record_id: uuid.UUID, db: DB, support_scope: PlatformSupportScopeDependency, step_up: StepUpAuth, payload: CrmLifecycleRequest, idempotency_key: str = IdempotencyKey):
    del step_up
    return await _set_lifecycle("opportunity", record_id, True, db, support_scope, payload, idempotency_key)


@router.post("/opportunities/{record_id}/restore", response_model=OpportunityResponse)
async def restore_opportunity(record_id: uuid.UUID, db: DB, support_scope: PlatformSupportScopeDependency, step_up: StepUpAuth, payload: CrmLifecycleRequest, idempotency_key: str = IdempotencyKey):
    del step_up
    return await _set_lifecycle("opportunity", record_id, False, db, support_scope, payload, idempotency_key)


@router.post("/activities/{record_id}/archive", response_model=ActivityResponse)
async def archive_activity(record_id: uuid.UUID, db: DB, support_scope: PlatformSupportScopeDependency, step_up: StepUpAuth, payload: CrmLifecycleRequest, idempotency_key: str = IdempotencyKey):
    del step_up
    return await _set_lifecycle("activity", record_id, True, db, support_scope, payload, idempotency_key)


@router.post("/activities/{record_id}/restore", response_model=ActivityResponse)
async def restore_activity(record_id: uuid.UUID, db: DB, support_scope: PlatformSupportScopeDependency, step_up: StepUpAuth, payload: CrmLifecycleRequest, idempotency_key: str = IdempotencyKey):
    del step_up
    return await _set_lifecycle("activity", record_id, False, db, support_scope, payload, idempotency_key)


@router.post("/tasks/{record_id}/archive", response_model=TaskResponse)
async def archive_task(record_id: uuid.UUID, db: DB, support_scope: PlatformSupportScopeDependency, step_up: StepUpAuth, payload: CrmLifecycleRequest, idempotency_key: str = IdempotencyKey):
    del step_up
    return await _set_lifecycle("task", record_id, True, db, support_scope, payload, idempotency_key)


@router.post("/tasks/{record_id}/restore", response_model=TaskResponse)
async def restore_task(record_id: uuid.UUID, db: DB, support_scope: PlatformSupportScopeDependency, step_up: StepUpAuth, payload: CrmLifecycleRequest, idempotency_key: str = IdempotencyKey):
    del step_up
    return await _set_lifecycle("task", record_id, False, db, support_scope, payload, idempotency_key)


@router.post("/notes/{record_id}/archive", response_model=NoteResponse)
async def archive_note(record_id: uuid.UUID, db: DB, support_scope: PlatformSupportScopeDependency, step_up: StepUpAuth, payload: CrmLifecycleRequest, idempotency_key: str = IdempotencyKey):
    del step_up
    return await _set_lifecycle("note", record_id, True, db, support_scope, payload, idempotency_key)


@router.post("/notes/{record_id}/restore", response_model=NoteResponse)
async def restore_note(record_id: uuid.UUID, db: DB, support_scope: PlatformSupportScopeDependency, step_up: StepUpAuth, payload: CrmLifecycleRequest, idempotency_key: str = IdempotencyKey):
    del step_up
    return await _set_lifecycle("note", record_id, False, db, support_scope, payload, idempotency_key)
    NoteCreate,
    NoteResponse,
    NoteUpdate,
