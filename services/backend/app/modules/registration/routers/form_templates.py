import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, Header, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import current_event_for_action, get_db, get_current_user
from app.modules.identity.models.user import User
from app.modules.registration.catalogue_limits import MAX_CATEGORY_KEY_LENGTH
from app.modules.registration.schemas.form_builder import (
    FormTemplateCreate,
    FormTemplateUpdate,
    FormTemplateResponse,
    FormTemplateSaveEventCopy,
)
from app.modules.registration.application.commands import FormTemplateCommandService
from app.modules.registration.application.queries import FormBuilderQueryService
from app.core.dependencies.feature_gate import enforce_event_operation, enforce_org_operation
from app.modules.rbac.services.platform_permissions import require_platform_permission
from app.modules.registration.models.form_template import FormTemplate
from app.modules.registration.models.registration_form_config import RegistrationFormConfig
from app.modules.abstracts.models import AbstractForm
from app.modules.events.models.event import Event
from app.modules.registration.schemas.catalogue_contracts import (
    CatalogueTemplateCreate, CatalogueTemplateUpdate, GlobalTemplateRetirement,
    GlobalTemplateRetirementResult,
    CatalogueReconciliationRequest, CatalogueReconciliationResult,
    CatalogueReconciliationIssue, CatalogueRepairRequest, CatalogueRepairResult,
    AggregateReconciliationIssue, AggregateRepairRequest, AggregateRepairResult,
    CohortReconciliationRequest, CohortReconciliationAccepted, CohortReconciliationStatus,
)
from app.modules.registration.application.template_commands import (
    catalogue_projection, reconcile_catalogue_documents, repair_catalogue_document,
    retire_global_template,
)
from sqlalchemy import select
from app.modules.registration.schemas.operational_binding import OperationalBindingUpdate, OperationalBindingResponse
from app.modules.registration.application.operational_binding_commands import get_operational_binding, update_operational_binding
from app.schemas.cursor_pagination import CursorPage
from app.modules.registration.models.catalogue_reconciliation import (
    CatalogueDocumentReconciliation, CatalogueReconciliationRun,
)
from app.modules.registration.application.aggregate_reconciliation import repair_aggregate_document

router = APIRouter(prefix="/forms/templates", tags=["Form Templates"])
platform_router = APIRouter(prefix="/platform/forms/templates", tags=["Platform Form Templates"])
platform_administrator = require_platform_permission("platform:administration:manage")
operational_form_event = current_event_for_action("REG_CONFIG:FORM")


async def operational_form_mutation_event(
    event_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Event:
    """Load only the selected event container for the transaction command.

    `get_current_user` has already revalidated the persisted direct/delegated
    selector. This lookup reveals no event response and grants no action: the
    mutation command performs the authoritative permission, lifecycle,
    entitlement and transaction-scoped revision-lock admission before replay or
    write. Keeping that one admission avoids resolving the full delegated graph
    twice for the same transaction.
    """
    selector = getattr(current_user, "_request_token_data", None)
    if selector is None or selector.active_organization_id is None:
        raise HTTPException(404, detail={"code": "EVENT_NOT_FOUND"})
    if selector.active_event_id is not None and selector.active_event_id != event_id:
        raise HTTPException(404, detail={"code": "EVENT_NOT_FOUND"})
    query = select(Event).where(
        Event.id == event_id,
        Event.organization_id == selector.active_organization_id,
        Event.deleted_at.is_(None),
    )
    if selector.active_workspace_id is not None:
        query = query.where(
            Event.operational_workspace_id == selector.active_workspace_id
        )
    event = await db.scalar(query)
    if event is None:
        raise HTTPException(404, detail={"code": "EVENT_NOT_FOUND"})
    return event


@router.get("/events/{event_id}/operational-bindings/{purpose}", response_model=OperationalBindingResponse)
async def get_event_operational_binding(purpose: str, response: Response,
                                        event: Event = Depends(operational_form_event),
                                        db: AsyncSession = Depends(get_db),
                                        current_user: User = Depends(get_current_user)):
    await enforce_event_operation(db, event.organization_id, event.id,
        "registration.forms.manage", user_id=current_user.id)
    response.headers["Cache-Control"] = "no-store"
    return await get_operational_binding(db, event=event, purpose=purpose.upper())


@router.put("/events/{event_id}/operational-bindings/{purpose}", response_model=OperationalBindingResponse)
async def put_event_operational_binding(purpose: str, payload: OperationalBindingUpdate,
                                        response: Response,
                                        event: Event = Depends(operational_form_mutation_event),
                                        db: AsyncSession = Depends(get_db),
                                        current_user: User = Depends(get_current_user),
                                        if_match: Optional[str] = Header(None, alias="If-Match"),
                                        idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key")):
    response.headers["Cache-Control"] = "no-store"
    return await update_operational_binding(db, event=event, purpose=purpose.upper(),
        payload=payload, actor=current_user, if_match=if_match,
        idempotency_key=idempotency_key)


@router.get("", response_model=CursorPage[FormTemplateResponse])
async def list_form_templates(
    response: Response,
    category_key: Optional[str] = Query(None, max_length=MAX_CATEGORY_KEY_LENGTH),
    scope_type: Optional[str] = Query(None, pattern="^(GLOBAL|ORGANIZATION|EVENT)$"),
    event_id: Optional[uuid.UUID] = None,
    source_template_id: Optional[uuid.UUID] = None,
    search: Optional[str] = Query(None, max_length=120),
    cursor: Optional[str] = Query(None, max_length=512),
    page_size: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List form templates.
    Returns global system templates plus organization/event custom templates.
    """
    user_org_id = getattr(current_user, "request_organization_id", None)
    if user_org_id is None:
        raise HTTPException(403, detail="Organization context is required.")
    if event_id is not None:
        await enforce_event_operation(db, user_org_id, event_id,
            "registration.forms.manage", user_id=current_user.id)
    else:
        await enforce_org_operation(db, user_org_id,
            "registration.forms.manage", user_id=current_user.id)
    response.headers["Cache-Control"] = "no-store"

    page = await FormBuilderQueryService(db).list_templates(
        organization_id=user_org_id,
        category_key=category_key,
        scope_type=scope_type,
        event_id=event_id,
        source_template_id=source_template_id,
        search=search,
        cursor=cursor,
        page_size=page_size,
    )
    return CursorPage(items=[catalogue_projection(template) if template.scope_type != "EVENT"
            else FormTemplateCommandService._response(template) for template in page.items],
        next_cursor=page.next_cursor, has_next=page.has_next)


@router.get("/{template_id}", response_model=FormTemplateResponse)
async def get_form_template(
    template_id: str,
    response: Response,
    event_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get form template by ID or slug.
    """
    organization_id = getattr(current_user, "request_organization_id", None)
    if organization_id is None:
        raise HTTPException(403, detail="Organization context is required.")
    query_service = FormBuilderQueryService(db)
    template = None
    try:
        parsed_uuid = uuid.UUID(template_id)
        template = await query_service.get_template(template_id=parsed_uuid)
    except ValueError:
        pass

    if template is None:
        template = await query_service.get_template_by_slug(slug=template_id,
            organization_id=organization_id, event_id=event_id)

    if template is None:
        raise HTTPException(status_code=404, detail="Form template not found")
    if template.scope_type != "GLOBAL" and template.organization_id != organization_id:
        raise HTTPException(404, detail="Form template not found")
    if template.scope_type == "EVENT":
        try:
            owned_event_id = uuid.UUID(str((template.settings or {}).get("_event_id") or (template.settings or {}).get("event_id")))
        except (ValueError, TypeError):
            raise HTTPException(404, detail="Form template not found")
        if event_id is not None and owned_event_id != event_id:
            raise HTTPException(404, detail="Form template not found")
        await enforce_event_operation(db, organization_id, owned_event_id,
            "registration.forms.manage", user_id=current_user.id)
    elif event_id is not None:
        await enforce_event_operation(db, organization_id, event_id,
            "registration.forms.manage", user_id=current_user.id)
    else:
        # A shared catalogue row is visibility, not action/feature authority.
        # Match list admission even when no selected event was supplied.
        await enforce_org_operation(db, organization_id,
            "registration.forms.manage", user_id=current_user.id)
    response.headers["Cache-Control"] = "no-store"
    return catalogue_projection(template) if template.scope_type != "EVENT" else FormTemplateCommandService._response(template)


@router.post("", response_model=FormTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_form_template(
    payload: CatalogueTemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    """
    Create a new form template.
    """
    return await FormTemplateCommandService.create(db, payload=payload, actor=current_user, idempotency_key=idempotency_key)


@router.put("/{template_id}", response_model=FormTemplateResponse)
async def update_form_template(
    template_id: str,
    payload: CatalogueTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    if_match: Optional[str] = Header(None, alias="If-Match"),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    """
    Update a form template.
    """
    target_uuid = None
    try:
        target_uuid = uuid.UUID(template_id)
    except ValueError:
        tpl = await FormBuilderQueryService(db).get_template_by_slug(slug=template_id,
            organization_id=current_user.request_organization_id,
            scope_types=("ORGANIZATION",), include_inactive=True)
        if tpl:
            target_uuid = tpl.id
    if not target_uuid:
        raise HTTPException(status_code=404, detail="Form template not found")

    return await FormTemplateCommandService.update(db, template_id=target_uuid, payload=payload, actor=current_user, if_match=if_match, idempotency_key=idempotency_key)


@router.post("/{template_id}/duplicate", response_model=FormTemplateResponse, status_code=status.HTTP_201_CREATED)
async def duplicate_form_template(
    template_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    if_match: Optional[str] = Header(None, alias="If-Match"),
):
    """
    Duplicate any template (system or custom) into the current user's organization.
    """
    target_uuid = None
    try:
        target_uuid = uuid.UUID(template_id)
    except ValueError:
        tpl = await FormBuilderQueryService(db).get_template_by_slug(slug=template_id,
            organization_id=current_user.request_organization_id,
            scope_types=("GLOBAL", "ORGANIZATION"))
        if tpl:
            target_uuid = tpl.id
    if not target_uuid:
        raise HTTPException(status_code=404, detail="Form template not found")

    return await FormTemplateCommandService.duplicate(db, template_id=target_uuid, actor=current_user,
        idempotency_key=idempotency_key, if_match=if_match)


@platform_router.get("", response_model=CursorPage[FormTemplateResponse])
async def list_platform_form_templates(response: Response, category_key: Optional[str] = Query(None, max_length=MAX_CATEGORY_KEY_LENGTH),
                                      search: Optional[str] = Query(None, max_length=120),
                                      cursor: Optional[str] = Query(None, max_length=512),
                                      page_size: int = Query(50, ge=1, le=100),
                                      db: AsyncSession = Depends(get_db),
                                      current_user: User = Depends(platform_administrator)):
    response.headers["Cache-Control"] = "no-store"
    page = await FormBuilderQueryService(db).list_templates(organization_id=None,
        category_key=category_key, scope_type="GLOBAL", search=search,
        cursor=cursor, page_size=page_size)
    return CursorPage(items=[catalogue_projection(template) for template in page.items],
        next_cursor=page.next_cursor, has_next=page.has_next)


@platform_router.post("/reconcile", response_model=CatalogueReconciliationResult)
async def reconcile_platform_form_templates(payload: CatalogueReconciliationRequest,
                                            db: AsyncSession = Depends(get_db),
                                            current_user: User = Depends(platform_administrator),
                                            idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key")):
    return await reconcile_catalogue_documents(db, actor=current_user,
        cursor=payload.cursor, page_size=payload.page_size,
        idempotency_key=idempotency_key)


@platform_router.get("/reconciliations/blocked",
                     response_model=CursorPage[CatalogueReconciliationIssue])
async def list_blocked_catalogue_documents(response: Response,
                                           cursor: Optional[str] = Query(None, max_length=512),
                                           page_size: int = Query(50, ge=1, le=100),
                                           db: AsyncSession = Depends(get_db),
                                           current_user: User = Depends(platform_administrator)):
    from app.modules.registration.application.catalogue_review_queries import list_blocked_templates
    page = await list_blocked_templates(db, actor=current_user, cursor=cursor, page_size=page_size)
    response.headers["Cache-Control"] = "no-store"
    return page


@platform_router.get("/reconciliations/aggregates/blocked",
                     response_model=CursorPage[AggregateReconciliationIssue])
async def list_blocked_aggregate_documents(response: Response,
                                           resource_type: str = Query(...,
                                               pattern="^(FORM_CATEGORY|REGISTRATION_FORM|ABSTRACT_FORM|PROGRAMME_RUBRIC)$"),
                                           cursor: Optional[str] = Query(None, max_length=512),
                                           page_size: int = Query(50, ge=1, le=100),
                                           db: AsyncSession = Depends(get_db),
                                           current_user: User = Depends(platform_administrator)):
    from app.modules.registration.application.catalogue_review_queries import list_blocked_aggregates
    page = await list_blocked_aggregates(db, actor=current_user, resource_type=resource_type,
        cursor=cursor, page_size=page_size)
    response.headers["Cache-Control"] = "no-store"
    return page


@platform_router.post("/reconciliations/aggregates/{resource_type}/{resource_id}/repair",
                      response_model=AggregateRepairResult)
async def repair_blocked_aggregate_document(resource_type: str, resource_id: uuid.UUID,
                                             payload: AggregateRepairRequest,
                                             db: AsyncSession = Depends(get_db),
                                             current_user: User = Depends(platform_administrator),
                                             idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
                                             if_match: Optional[str] = Header(None, alias="If-Match")):
    return await repair_aggregate_document(db, resource_type=resource_type,
        resource_id=resource_id, payload=payload, actor=current_user,
        if_match=if_match, idempotency_key=idempotency_key)


@platform_router.post("/reconciliation-runs", response_model=CohortReconciliationAccepted,
                      status_code=status.HTTP_202_ACCEPTED)
async def start_catalogue_reconciliation_run(payload: CohortReconciliationRequest,
                                             db: AsyncSession = Depends(get_db),
                                             current_user: User = Depends(platform_administrator),
                                             idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key")):
    from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response
    from app.modules.audit.models.audit_log import AuditLog
    organization_id = current_user.organization_id
    if not idempotency_key:
        raise HTTPException(428, detail={"code": "IDEMPOTENCY_KEY_REQUIRED"})
    try:
        receipt = await begin_idempotent(db, organization_id=organization_id,
            actor_id=current_user.id, operation="registration.platform.catalogue-reconcile-cohort",
            key=idempotency_key, payload=payload.model_dump(mode="json"))
        replay = replay_response(receipt)
        if replay is not None:
            await db.commit()
            return replay[1]
        result = {"run_id": str(receipt.id), "status": "SCHEDULED"}
        db.add(CatalogueReconciliationRun(id=receipt.id,
            organization_id=organization_id, actor_user_id=current_user.id,
            reason=payload.reason, status="PENDING"))
        db.add(AuditLog(organization_id=organization_id, actor_user_id=current_user.id,
            resource_type="catalogue_reconciliation_run", resource_id=receipt.id,
            action_type="CATALOGUE_RECONCILIATION_SCHEDULED", is_sensitive=True,
            correlation_id=receipt.id, new_state={**result, "reason": payload.reason}))
        await complete_idempotent(db, receipt, response_status=202,
            response_body=result, resource_id=receipt.id)
        await db.commit()
        # The committed run is authoritative. This best-effort nudge reduces
        # latency; the periodic dispatcher recovers any broker interruption.
        try:
            from app.tasks.catalogue_reconciliation import recover_catalogue_reconciliation_runs
            recover_catalogue_reconciliation_runs.apply_async(retry=False)
        except Exception:
            pass
        return result
    except Exception:
        await db.rollback()
        raise


@platform_router.get("/reconciliation-runs/{run_id}",
                     response_model=CohortReconciliationStatus)
async def get_catalogue_reconciliation_run(run_id: uuid.UUID,
                                           response: Response,
                                           db: AsyncSession = Depends(get_db),
                                           current_user: User = Depends(platform_administrator)):
    row = await db.scalar(select(CatalogueReconciliationRun).where(
        CatalogueReconciliationRun.id == run_id))
    if row is None:
        raise HTTPException(404, detail={"code": "RECONCILIATION_RUN_NOT_FOUND"})
    response.headers["Cache-Control"] = "no-store"
    from app.modules.registration.services.catalogue_work import progress
    completion = await progress(db, row)
    return CohortReconciliationStatus(run_id=row.id, status=row.status,
        dispatch_attempts=row.dispatch_attempts,
        started_at=row.started_at.isoformat() if row.started_at else None,
        dispatched_at=row.dispatched_at.isoformat() if row.dispatched_at else None,
        failure_code=row.failure_code, **completion)


@platform_router.post("/{template_id}/reconcile", response_model=CatalogueRepairResult)
async def repair_platform_form_template(template_id: uuid.UUID,
                                        payload: CatalogueRepairRequest,
                                        db: AsyncSession = Depends(get_db),
                                        current_user: User = Depends(platform_administrator),
                                        idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
                                        if_match: Optional[str] = Header(None, alias="If-Match")):
    return await repair_catalogue_document(db, template_id=template_id,
        payload=payload, actor=current_user, if_match=if_match,
        idempotency_key=idempotency_key)


@platform_router.post("/{template_id}/retire", response_model=GlobalTemplateRetirementResult)
async def retire_platform_form_template(template_id: uuid.UUID, payload: GlobalTemplateRetirement,
                                        db: AsyncSession = Depends(get_db),
                                        current_user: User = Depends(platform_administrator),
                                        idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
                                        if_match: Optional[str] = Header(None, alias="If-Match")):
    return await retire_global_template(db, template_id=template_id,
        replacement_template_id=payload.replacement_template_id, reason=payload.reason,
        actor=current_user, if_match=if_match, idempotency_key=idempotency_key)


@platform_router.get("/{template_id}", response_model=FormTemplateResponse)
async def get_platform_form_template(template_id: uuid.UUID, response: Response,
                                     db: AsyncSession = Depends(get_db),
                                     current_user: User = Depends(platform_administrator)):
    response.headers["Cache-Control"] = "no-store"
    template = await db.scalar(select(FormTemplate).where(FormTemplate.id == template_id,
        FormTemplate.organization_id.is_(None), FormTemplate.scope_type == "GLOBAL",
        FormTemplate.deleted_at.is_(None)).execution_options(shared_form_catalogue=True))
    if template is None:
        raise HTTPException(404, detail="Template not found.")
    return catalogue_projection(template)


@platform_router.post("", response_model=FormTemplateResponse, status_code=201)
async def create_platform_form_template(payload: CatalogueTemplateCreate, db: AsyncSession = Depends(get_db),
                                       current_user: User = Depends(platform_administrator),
                                       idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key")):
    return await FormTemplateCommandService.create(db, payload=payload, actor=current_user,
        idempotency_key=idempotency_key, audience="PLATFORM")


@platform_router.put("/{template_id}", response_model=FormTemplateResponse)
async def update_platform_form_template(template_id: uuid.UUID, payload: CatalogueTemplateUpdate,
                                       db: AsyncSession = Depends(get_db),
                                       current_user: User = Depends(platform_administrator),
                                       idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
                                       if_match: Optional[str] = Header(None, alias="If-Match")):
    return await FormTemplateCommandService.update(db, template_id=template_id, payload=payload,
        actor=current_user, if_match=if_match, idempotency_key=idempotency_key, audience="PLATFORM")


@platform_router.post("/{template_id}/duplicate", response_model=FormTemplateResponse, status_code=201)
async def duplicate_platform_form_template(template_id: uuid.UUID, db: AsyncSession = Depends(get_db),
                                          current_user: User = Depends(platform_administrator),
                                          idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
                                          if_match: Optional[str] = Header(None, alias="If-Match")):
    return await FormTemplateCommandService.duplicate(db, template_id=template_id, actor=current_user,
        if_match=if_match, idempotency_key=idempotency_key, audience="PLATFORM")


@platform_router.delete("/{template_id}", status_code=204)
async def delete_platform_form_template(template_id: uuid.UUID, db: AsyncSession = Depends(get_db),
                                       current_user: User = Depends(platform_administrator),
                                       idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
                                       if_match: Optional[str] = Header(None, alias="If-Match")):
    await FormTemplateCommandService.delete(db, template_id=template_id, actor=current_user,
        if_match=if_match, idempotency_key=idempotency_key, audience="PLATFORM")
    return None



@router.post("/{template_id}/save-as-event-copy", response_model=FormTemplateResponse, status_code=status.HTTP_200_OK)
async def save_template_as_event_copy(
    template_id: str,
    payload: FormTemplateSaveEventCopy,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    if_match: Optional[str] = Header(None, alias="If-Match"),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    """
    Save a customised version of a template scoped to a specific event.
    Creates a new EVENT-scoped FormTemplate if one doesn't exist for this
    (source_template, event, organization) tuple, otherwise updates it in place.
    """
    target_uuid = None
    try:
        target_uuid = uuid.UUID(template_id)
    except ValueError:
        tpl = await FormBuilderQueryService(db).get_template_by_slug(slug=template_id,
            organization_id=current_user.request_organization_id, event_id=payload.event_id)
        if tpl:
            target_uuid = tpl.id
    if not target_uuid:
        raise HTTPException(status_code=404, detail="Form template not found")

    template = await FormTemplateCommandService.save_event_copy(
        db,
        source_template_id=target_uuid,
        payload=payload,
        actor=current_user,
        if_match=if_match,
        idempotency_key=idempotency_key,
    )
    return template


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_form_template(
    template_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    if_match: Optional[str] = Header(None, alias="If-Match"),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    """
    Soft-delete custom template. System templates cannot be deleted.
    """
    target_uuid = None
    try:
        target_uuid = uuid.UUID(template_id)
    except ValueError:
        tpl = await FormBuilderQueryService(db).get_template_by_slug(slug=template_id,
            organization_id=current_user.request_organization_id,
            scope_types=("ORGANIZATION",), include_inactive=True)
        if tpl:
            target_uuid = tpl.id
    if not target_uuid:
        raise HTTPException(status_code=404, detail="Form template not found")

    await FormTemplateCommandService.delete(db, template_id=target_uuid, actor=current_user, if_match=if_match, idempotency_key=idempotency_key)
    return None
