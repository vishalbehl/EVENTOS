import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Form
from sqlalchemy import select, delete, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import TokenDep, get_db, require_active_user
from app.modules.identity.models.user import User
from app.modules.developer.models.developer_registry import ApiKey, OAuthClient
from app.modules.developer.schemas.developer_schemas import (
    ApiKeyIn, ApiKeyCreatedOut, ApiKeyOut,
    OAuthClientIn, OAuthClientCreatedOut, OAuthClientOut,
    OAuthTokenOut
)
from app.modules.developer.services.developer_service import DeveloperService

router = APIRouter(prefix="/developer", tags=["developer"])


@router.get("/service-identity")
async def get_service_identity(token_data: TokenDep) -> dict:
    """Return machine identity scope without granting access to user-managed resources."""
    if token_data.role != "developer" or "api_key" not in token_data.amr:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="API key identity required.")
    return {
        "identity_type": "service",
        "organization_id": str(token_data.organization_id),
        "authentication_method": "api_key",
    }

# ── API Key Management ────────────────────────────────────────

@router.post("/api-keys", response_model=ApiKeyCreatedOut, status_code=status.HTTP_201_CREATED)
async def create_api_key(
    data: ApiKeyIn,
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Generate a new developer API key for the current organization.
    """
    if not current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User must belong to an organization to generate API keys."
        )
    key = await DeveloperService.generate_api_key(
        db=db,
        org_id=current_user.organization_id,
        name=data.name,
        expires_in_days=data.expires_in_days
    )
    return key

@router.get("/api-keys", response_model=List[ApiKeyOut])
async def list_api_keys(
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    List all developer API keys for the current organization.
    """
    stmt = select(ApiKey).where(ApiKey.organization_id == current_user.organization_id)
    res = await db.execute(stmt)
    return res.scalars().all()

@router.delete("/api-keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_api_key(
    key_id: uuid.UUID,
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Revoke/Delete an API key.
    """
    stmt = select(ApiKey).where(
        and_(
            ApiKey.id == key_id,
            ApiKey.organization_id == current_user.organization_id
        )
    )
    res = await db.execute(stmt)
    key = res.scalar_one_or_none()
    if not key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API Key not found or does not belong to your organization."
        )
    await db.delete(key)
    await db.commit()

# ── OAuth Client Management ────────────────────────────────────

@router.post("/oauth/clients", response_model=OAuthClientCreatedOut, status_code=status.HTTP_201_CREATED)
async def create_oauth_client(
    data: OAuthClientIn,
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Register a new OAuth client application for the current organization.
    """
    if not current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User must belong to an organization to register OAuth apps."
        )
    client = await DeveloperService.register_oauth_client(
        db=db,
        org_id=current_user.organization_id,
        name=data.name,
        redirect_uris=data.redirect_uris
    )
    return client

@router.get("/oauth/clients", response_model=List[OAuthClientOut])
async def list_oauth_clients(
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    List all registered OAuth client applications for the organization.
    """
    stmt = select(OAuthClient).where(OAuthClient.organization_id == current_user.organization_id)
    res = await db.execute(stmt)
    return res.scalars().all()

@router.delete("/oauth/clients/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_oauth_client(
    client_id: uuid.UUID,
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Revoke/Delete an OAuth client application.
    """
    stmt = select(OAuthClient).where(
        and_(
            OAuthClient.id == client_id,
            OAuthClient.organization_id == current_user.organization_id
        )
    )
    res = await db.execute(stmt)
    client = res.scalar_one_or_none()
    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="OAuth Client not found or does not belong to your organization."
        )
    await db.delete(client)
    await db.commit()

# ── OAuth2 Token Flow Endpoints ───────────────────────────────

@router.post("/oauth/authorize")
async def oauth_authorize(
    client_id: str,
    redirect_uri: str,
    response_type: str = "code",
    state: Optional[str] = None,
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Initiate OAuth authorization grant (generates authorization code).
    """
    if response_type != "code":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only response_type='code' is supported."
        )
    code = await DeveloperService.create_oauth_auth_code(
        db=db,
        client_id=client_id,
        user_id=current_user.id,
        redirect_uri=redirect_uri
    )
    if not code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid client ID or redirect URI."
        )
    return {
        "code": code,
        "redirect_uri": redirect_uri,
        "state": state
    }

@router.post("/oauth/token", response_model=OAuthTokenOut)
async def oauth_token_exchange(
    client_id: str = Form(...),
    client_secret: str = Form(...),
    code: str = Form(...),
    grant_type: str = Form(...),
    redirect_uri: str = Form(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Exchange authorization code for access and refresh tokens.
    """
    if grant_type != "authorization_code":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only grant_type='authorization_code' is supported."
        )
    token_data = await DeveloperService.exchange_oauth_code(
        db=db,
        client_id=client_id,
        client_secret=client_secret,
        code=code
    )
    if not token_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid client credentials, authorization code, or expired code."
        )
    return token_data
