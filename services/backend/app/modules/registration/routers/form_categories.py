import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_user
from app.modules.superadmin.dependencies import require_super_admin
from app.modules.identity.models.user import User
from app.modules.registration.schemas.form_builder import (
    FormCategoryCreate,
    FormCategoryUpdate,
    FormCategoryResponse,
)
from app.modules.registration.application.commands import FormCategoryCommandService
from app.modules.registration.application.queries import FormBuilderQueryService

router = APIRouter(prefix="/forms/categories", tags=["Form Categories"])


@router.get("", response_model=List[FormCategoryResponse])
async def list_form_categories(
    organization_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List form categories.
    Returns all global system categories plus organization-specific custom categories.
    """
    user_org_id = getattr(current_user, "organization_id", None) or organization_id

    return await FormBuilderQueryService(db).list_categories(organization_id=user_org_id)


@router.post("", response_model=FormCategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_form_category(
    payload: FormCategoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    """
    Create a new form category.
    Platform admins can create global system categories; organizers create custom categories.
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
    )


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_form_category(
    category_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
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
    )
    return None
