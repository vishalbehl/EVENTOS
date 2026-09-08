import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_user
from app.modules.identity.models.user import User
from app.modules.registration.schemas.form_builder import (
    FormTemplateCreate,
    FormTemplateUpdate,
    FormTemplateResponse,
)
from app.modules.registration.application.commands import FormTemplateCommandService
from app.modules.registration.application.queries import FormBuilderQueryService

router = APIRouter(prefix="/forms/templates", tags=["Form Templates"])


@router.get("", response_model=List[FormTemplateResponse])
async def list_form_templates(
    category_key: Optional[str] = None,
    scope_type: Optional[str] = None,
    event_id: Optional[uuid.UUID] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List form templates.
    Returns global system templates plus organization/event custom templates.
    """
    user_org_id = getattr(current_user, "organization_id", None)

    return await FormBuilderQueryService(db).list_templates(
        organization_id=user_org_id,
        category_key=category_key,
        scope_type=scope_type,
        event_id=event_id,
        search=search,
    )


@router.get("/{template_id}", response_model=FormTemplateResponse)
async def get_form_template(
    template_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get form template by ID or slug.
    """
    query_service = FormBuilderQueryService(db)
    template = None
    try:
        parsed_uuid = uuid.UUID(template_id)
        template = await query_service.get_template(template_id=parsed_uuid)
    except ValueError:
        pass

    if template is None:
        template = await query_service.get_template_by_slug(slug=template_id)

    if template is None:
        raise HTTPException(status_code=404, detail="Form template not found")
    return template


@router.post("", response_model=FormTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_form_template(
    payload: FormTemplateCreate,
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
    payload: FormTemplateUpdate,
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
        tpl = await FormBuilderQueryService(db).get_template_by_slug(slug=template_id)
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
):
    """
    Duplicate any template (system or custom) into the current user's organization.
    """
    target_uuid = None
    try:
        target_uuid = uuid.UUID(template_id)
    except ValueError:
        tpl = await FormBuilderQueryService(db).get_template_by_slug(slug=template_id)
        if tpl:
            target_uuid = tpl.id
    if not target_uuid:
        raise HTTPException(status_code=404, detail="Form template not found")

    return await FormTemplateCommandService.duplicate(db, template_id=target_uuid, actor=current_user, idempotency_key=idempotency_key)


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
        tpl = await FormBuilderQueryService(db).get_template_by_slug(slug=template_id)
        if tpl:
            target_uuid = tpl.id
    if not target_uuid:
        raise HTTPException(status_code=404, detail="Form template not found")

    await FormTemplateCommandService.delete(db, template_id=target_uuid, actor=current_user, if_match=if_match, idempotency_key=idempotency_key)
    return None
