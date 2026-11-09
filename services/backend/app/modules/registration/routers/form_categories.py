import uuid
from typing import Optional
from fastapi import APIRouter, Depends, Header, HTTPException, status, Response, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_user
from app.core.dependencies.feature_gate import enforce_event_operation, enforce_org_operation
from app.modules.rbac.services.platform_permissions import require_platform_permission
from app.modules.identity.models.user import User
from app.modules.registration.schemas.form_builder import (
    FormCategoryCreate,
    FormCategoryUpdate,
    FormCategoryResponse,
)
from app.modules.registration.application.commands import FormCategoryCommandService
from app.modules.registration.application.queries import FormBuilderQueryService
from app.schemas.cursor_pagination import CursorPage
from app.modules.registration.schemas.catalogue_contracts import (
    GlobalCategoryRetirement, GlobalCategoryRetirementResult,
    CategoryReconciliationIssue,
)
from app.modules.registration.application.category_commands import retire_global_category
from app.modules.registration.models.form_category import FormCategory, FormCategoryReconciliation
from sqlalchemy import and_, or_, select

router = APIRouter(prefix="/forms/categories", tags=["Form Categories"])
platform_router = APIRouter(prefix="/platform/forms/categories", tags=["Platform Form Categories"])
platform_administrator = require_platform_permission("platform:administration:manage")


@router.get("", response_model=CursorPage[FormCategoryResponse])
async def list_form_categories(
    response: Response,
    organization_id: Optional[uuid.UUID] = None,
    event_id: Optional[uuid.UUID] = None,
    cursor: Optional[str] = Query(None, max_length=512),
    page_size: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List form categories.
    Returns all global system categories plus organization-specific custom categories.
    """
    user_org_id = getattr(current_user, "request_organization_id", None)
    if user_org_id is None:
        raise HTTPException(403, detail="Organization context is required.")
    if organization_id is not None and organization_id != user_org_id:
        raise HTTPException(404, detail="Organization not found.")
    if event_id is not None:
        await enforce_event_operation(db, user_org_id, event_id, "registration.forms.manage", user_id=current_user.id)
    else:
        await enforce_org_operation(db, user_org_id, "registration.forms.manage", user_id=current_user.id)
    response.headers["Cache-Control"] = "no-store"

    return await FormBuilderQueryService(db).list_categories(organization_id=user_org_id,
        cursor=cursor, page_size=page_size)


@router.post("", response_model=FormCategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_form_category(
    payload: FormCategoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    """
    Create a new form category.
    Creates an organisation-owned category. Global categories use the platform route.
    """
    return await FormCategoryCommandService.create(
        db,
        payload=payload,
        actor=current_user,
        idempotency_key=idempotency_key,
    )


@router.patch("/{category_id}", response_model=FormCategoryResponse)
async def update_form_category(
    category_id: uuid.UUID,
    payload: FormCategoryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    if_match: Optional[str] = Header(None, alias="If-Match"),
):
    """
    Update a form category.
    System categories are protected from being renamed or edited by organizers.
    """
    return await FormCategoryCommandService.update(
        db,
        category_id=category_id,
        payload=payload,
        actor=current_user,
        idempotency_key=idempotency_key,
        if_match=if_match,
    )


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_form_category(
    category_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    if_match: Optional[str] = Header(None, alias="If-Match"),
):
    """
    Soft-delete a form category.
    System categories cannot be deleted.
    """
    await FormCategoryCommandService.delete(
        db,
        category_id=category_id,
        actor=current_user,
        idempotency_key=idempotency_key,
        if_match=if_match,
    )
    return None


@platform_router.get("", response_model=CursorPage[FormCategoryResponse])
async def list_platform_form_categories(response: Response,
                                        cursor: Optional[str] = Query(None, max_length=512),
                                        page_size: int = Query(50, ge=1, le=100),
                                        db: AsyncSession = Depends(get_db),
                                        current_user: User = Depends(platform_administrator)):
    response.headers["Cache-Control"] = "no-store"
    return await FormBuilderQueryService(db).list_categories(organization_id=None,
        cursor=cursor, page_size=page_size)


@platform_router.post("", response_model=FormCategoryResponse, status_code=201)
async def create_platform_form_category(payload: FormCategoryCreate, db: AsyncSession = Depends(get_db),
                                       current_user: User = Depends(platform_administrator),
                                       idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key")):
    return await FormCategoryCommandService.create(db, payload=payload, actor=current_user,
        idempotency_key=idempotency_key, audience="PLATFORM")


@platform_router.patch("/{category_id}", response_model=FormCategoryResponse)
async def update_platform_form_category(category_id: uuid.UUID, payload: FormCategoryUpdate,
                                       db: AsyncSession = Depends(get_db),
                                       current_user: User = Depends(platform_administrator),
                                       idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
                                       if_match: Optional[str] = Header(None, alias="If-Match")):
    return await FormCategoryCommandService.update(db, category_id=category_id, payload=payload,
        actor=current_user, idempotency_key=idempotency_key, if_match=if_match, audience="PLATFORM")


@platform_router.post("/{category_id}/retire", response_model=GlobalCategoryRetirementResult)
async def retire_platform_form_category(category_id: uuid.UUID,
                                        payload: GlobalCategoryRetirement,
                                        db: AsyncSession = Depends(get_db),
                                        current_user: User = Depends(platform_administrator),
                                        idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
                                        if_match: Optional[str] = Header(None, alias="If-Match")):
    return await retire_global_category(db, category_id=category_id,
        replacement_category_id=payload.replacement_category_id,
        reason=payload.reason, actor=current_user, if_match=if_match,
        idempotency_key=idempotency_key)


@platform_router.get("/reconciliations/blocked",
                     response_model=CursorPage[CategoryReconciliationIssue])
async def list_blocked_category_reconciliations(
    response: Response,
    cursor: Optional[str] = Query(None, max_length=512),
    page_size: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(platform_administrator),
):
    from app.schemas.cursor_pagination import decode_cursor, encode_cursor
    statement = select(FormCategoryReconciliation, FormCategory).join(
        FormCategory, FormCategory.id == FormCategoryReconciliation.category_id,
    ).where(
        FormCategoryReconciliation.operation == "TAXONOMY_VALIDATION",
        FormCategoryReconciliation.status == "BLOCKED",
        FormCategory.version == FormCategoryReconciliation.category_version,
        FormCategory.deleted_at.is_(None),
    )
    if cursor:
        position = decode_cursor(cursor)
        statement = statement.where(or_(
            FormCategoryReconciliation.created_at > position.occurred_at,
            and_(FormCategoryReconciliation.created_at == position.occurred_at,
                FormCategoryReconciliation.id > position.record_id),
        ))
    rows = list((await db.execute(statement.order_by(
        FormCategoryReconciliation.created_at, FormCategoryReconciliation.id,
    ).limit(page_size + 1).execution_options(shared_form_catalogue=True))).all())
    has_next = len(rows) > page_size
    items = rows[:page_size]
    next_cursor = encode_cursor(items[-1][0].created_at, items[-1][0].id) if has_next and items else None
    response.headers["Cache-Control"] = "no-store"
    return CursorPage(items=[CategoryReconciliationIssue(
        reconciliation_id=record.id, category_id=category.id,
        category_name=category.name, category_slug=category.slug,
        category_version=record.category_version,
        reason=record.reason or "Explicit taxonomy reconciliation is required.",
        details=record.details or {}, created_at=record.created_at.isoformat(),
        current_document={"name": category.name, "slug": category.slug,
            "description": category.description, "icon": category.icon,
            "sort_order": category.sort_order},
    ) for record, category in items], next_cursor=next_cursor, has_next=has_next)


@platform_router.delete("/{category_id}", status_code=204)
async def delete_platform_form_category(category_id: uuid.UUID, db: AsyncSession = Depends(get_db),
                                       current_user: User = Depends(platform_administrator),
                                       idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
                                       if_match: Optional[str] = Header(None, alias="If-Match")):
    await FormCategoryCommandService.delete(db, category_id=category_id, actor=current_user,
        idempotency_key=idempotency_key, if_match=if_match, audience="PLATFORM")
    return None
