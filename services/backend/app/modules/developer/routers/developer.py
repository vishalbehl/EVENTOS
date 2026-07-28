import uuid
import hashlib
import json
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, status, Form
from sqlalchemy import select, delete, and_
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.dependencies import TokenDep, get_db, require_active_user
from app.modules.identity.models.user import User
from app.modules.developer.models.developer_registry import ApiKey, OAuthClient
from app.modules.developer.models.developer_domain_tables import DeveloperOAuthAuthorization
from app.modules.developer.schemas.developer_schemas import (
    ApiKeyIn, ApiKeyCreatedOut, ApiKeyOut,
    OAuthClientIn, OAuthClientCreatedOut, OAuthClientOut,
    OAuthTokenOut
)
from app.modules.developer.services.developer_service import DeveloperService
from app.core.dependencies.feature_gate import require_org_operation
from app.modules.integrations.models.integrations_domain_tables import (
    IntegrationConnection,
    IntegrationConnectionMutation,
    IntegrationProvider,
)
from app.modules.platform.models.organization import Organization
from app.modules.audit.models.audit_log import AuditLog
from app.modules.billing.services.usage_reservation_service import UsageReservationService

router = APIRouter(prefix="/developer", tags=["developer"])


class IntegrationProviderOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None = None


class IntegrationConnectionOut(BaseModel):
    id: uuid.UUID
    provider_id: uuid.UUID
    provider_name: str
    is_active: bool
    version: int


class IntegrationConnectionCreate(BaseModel):
    provider_id: uuid.UUID


class IntegrationConnectionUpdate(BaseModel):
    is_active: bool


def _integration_response(connection: IntegrationConnection, provider_name: str) -> IntegrationConnectionOut:
    return IntegrationConnectionOut(
        id=connection.id,
        provider_id=connection.provider_id,
        provider_name=provider_name,
        is_active=connection.is_active,
        version=connection.version,
    )


async def _integration_replay(db: AsyncSession, organization_id: uuid.UUID, idempotency_key: str, request_hash: str) -> IntegrationConnectionMutation | None:
    existing = await db.scalar(select(IntegrationConnectionMutation).where(
        IntegrationConnectionMutation.organization_id == organization_id,
        IntegrationConnectionMutation.idempotency_key == idempotency_key,
    ))
    if existing and existing.request_hash != request_hash:
        raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_CONFLICT"})
    return existing


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

@router.get("/integration-providers", response_model=List[IntegrationProviderOut])
async def list_integration_providers(
    capability_user: User = require_org_operation("integrations.manage"),
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db),
) -> List[IntegrationProviderOut]:
    del capability_user
    if not current_user.organization_id:
        raise HTTPException(status_code=400, detail="Organization context required.")
    rows = list((await db.execute(select(IntegrationProvider).order_by(IntegrationProvider.name))).scalars().all())
    return [IntegrationProviderOut(id=row.id, name=row.name, description=row.description) for row in rows]


@router.get("/integration-connections", response_model=List[IntegrationConnectionOut])
async def list_integration_connections(
    capability_user: User = require_org_operation("integrations.manage"),
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db),
) -> List[IntegrationConnectionOut]:
    del capability_user
    if not current_user.organization_id:
        raise HTTPException(status_code=400, detail="Organization context required.")
    rows = (await db.execute(
        select(IntegrationConnection, IntegrationProvider.name)
        .join(IntegrationProvider, IntegrationProvider.id == IntegrationConnection.provider_id)
        .where(IntegrationConnection.organization_id == current_user.organization_id)
        .order_by(IntegrationProvider.name)
    )).all()
    return [_integration_response(connection, provider_name) for connection, provider_name in rows]


@router.post("/integration-connections", response_model=IntegrationConnectionOut, status_code=status.HTTP_201_CREATED)
async def create_integration_connection(
    payload: IntegrationConnectionCreate,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    capability_user: User = require_org_operation("integrations.manage"),
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db),
) -> IntegrationConnectionOut:
    del capability_user
    organization_id = current_user.organization_id
    if not organization_id:
        raise HTTPException(status_code=400, detail="Organization context required.")
    request_hash = hashlib.sha256(json.dumps(payload.model_dump(mode="json"), sort_keys=True).encode()).hexdigest()
    replay = await _integration_replay(db, organization_id, idempotency_key, request_hash)
    if replay:
        return IntegrationConnectionOut.model_validate(replay.response_json)
    await db.scalar(select(Organization.id).where(Organization.id == organization_id).with_for_update())
    provider = await db.get(IntegrationProvider, payload.provider_id)
    if provider is None:
        raise HTTPException(status_code=404, detail="Integration provider not found.")
    duplicate = await db.scalar(select(IntegrationConnection).where(
        IntegrationConnection.organization_id == organization_id,
        IntegrationConnection.provider_id == payload.provider_id,
    ))
    if duplicate:
        raise HTTPException(status_code=409, detail={"code": "CONNECTION_EXISTS", "connection_id": str(duplicate.id)})
    reservation = await UsageReservationService.reserve(
        db, organization_id=organization_id, event_id=None, limit_key="max_integrations",
        quantity=1, unit="integration", idempotency_key=f"organizer-integration:{idempotency_key}",
        metadata={"provider_id": str(provider.id)},
    )
    connection = IntegrationConnection(
        organization_id=organization_id, provider_id=provider.id, is_active=True,
        version=1, idempotency_key=idempotency_key, request_hash=request_hash,
    )
    db.add(connection)
    await db.flush()
    response = _integration_response(connection, provider.name)
    db.add(IntegrationConnectionMutation(
        organization_id=organization_id, connection_id=connection.id, operation_type="CREATE",
        idempotency_key=idempotency_key, request_hash=request_hash,
        response_json=response.model_dump(mode="json"), requested_by=current_user.id,
    ))
    db.add(AuditLog(
        organization_id=organization_id, actor_user_id=current_user.id,
        actor_role=current_user.platform_role or current_user.role, resource_type="integration_connection",
        resource_id=connection.id, action_type="INTEGRATION_CONNECTION_CREATED",
        new_state={"provider_id": str(provider.id), "provider_name": provider.name, "version": 1},
        is_sensitive=True,
    ))
    await UsageReservationService.consume(db, reservation.id, source="organizer_portal.integration.create", actor_user_id=current_user.id)
    await db.commit()
    return response


@router.patch("/integration-connections/{connection_id}", response_model=IntegrationConnectionOut)
async def update_integration_connection(
    connection_id: uuid.UUID,
    payload: IntegrationConnectionUpdate,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    if_match: int = Header(..., alias="If-Match", ge=1),
    capability_user: User = require_org_operation("integrations.manage"),
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db),
) -> IntegrationConnectionOut:
    del capability_user
    organization_id = current_user.organization_id
    if not organization_id:
        raise HTTPException(status_code=400, detail="Organization context required.")
    request_hash = hashlib.sha256(json.dumps({"connection_id": str(connection_id), "version": if_match, **payload.model_dump(mode="json")}, sort_keys=True).encode()).hexdigest()
    replay = await _integration_replay(db, organization_id, idempotency_key, request_hash)
    if replay:
        return IntegrationConnectionOut.model_validate(replay.response_json)
    connection = await db.scalar(select(IntegrationConnection).where(
        IntegrationConnection.id == connection_id,
        IntegrationConnection.organization_id == organization_id,
    ).with_for_update())
    if connection is None:
        raise HTTPException(status_code=404, detail="Integration connection not found.")
    if connection.version != if_match:
        raise HTTPException(status_code=409, detail={"code": "VERSION_CONFLICT", "current_version": connection.version})
    provider = await db.get(IntegrationProvider, connection.provider_id)
    if provider is None:
        raise HTTPException(status_code=409, detail="Integration provider record is unavailable.")
    reservation = None
    if payload.is_active and not connection.is_active:
        reservation = await UsageReservationService.reserve(
            db, organization_id=organization_id, event_id=None, limit_key="max_integrations",
            quantity=1, unit="integration", idempotency_key=f"organizer-integration-reactivate:{idempotency_key}",
            metadata={"connection_id": str(connection.id)},
        )
    old_active = connection.is_active
    connection.is_active = payload.is_active
    connection.version += 1
    response = _integration_response(connection, provider.name)
    db.add(IntegrationConnectionMutation(
        organization_id=organization_id, connection_id=connection.id, operation_type="UPDATE",
        idempotency_key=idempotency_key, request_hash=request_hash,
        response_json=response.model_dump(mode="json"), requested_by=current_user.id,
    ))
    db.add(AuditLog(
        organization_id=organization_id, actor_user_id=current_user.id,
        actor_role=current_user.platform_role or current_user.role, resource_type="integration_connection",
        resource_id=connection.id, action_type="INTEGRATION_CONNECTION_UPDATED",
        old_state={"is_active": old_active, "version": if_match},
        new_state={"is_active": connection.is_active, "version": connection.version},
        is_sensitive=True,
    ))
    if reservation:
        await UsageReservationService.consume(db, reservation.id, source="organizer_portal.integration.reactivate", actor_user_id=current_user.id)
    await db.commit()
    return response


@router.post("/api-keys", response_model=ApiKeyCreatedOut, status_code=status.HTTP_201_CREATED)
async def create_api_key(
    data: ApiKeyIn,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=128),
    capability_user: User = require_org_operation("developer.api.use"),
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
    request_hash = hashlib.sha256(
        json.dumps(data.model_dump(mode="json"), sort_keys=True).encode()
    ).hexdigest()
    existing = await db.scalar(
        select(ApiKey).where(
            ApiKey.organization_id == current_user.organization_id,
            ApiKey.idempotency_key == idempotency_key,
        )
    )
    if existing is not None:
        if existing.request_hash != request_hash:
            raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_CONFLICT"})
        raise HTTPException(
            status_code=409,
            detail={
                "code": "IDEMPOTENCY_RESULT_NO_LONGER_REPLAYABLE",
                "resource_id": str(existing.id),
                "message": "The API key was already created. Its plaintext value cannot be shown again.",
            },
        )
    key = await DeveloperService.generate_api_key(
        db=db,
        org_id=current_user.organization_id,
        name=data.name,
        expires_in_days=data.expires_in_days,
        idempotency_key=idempotency_key,
        request_hash=request_hash,
    )
    await db.commit()
    return key

@router.get("/api-keys", response_model=List[ApiKeyOut])
async def list_api_keys(
    capability_user: User = require_org_operation("developer.api.use"),
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
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=128),
    capability_user: User = require_org_operation("developer.api.use"),
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
    if key.is_active:
        await DeveloperService.revoke_api_key(db, current_user.organization_id, key_id)
    await db.commit()

# ── OAuth Client Management ────────────────────────────────────

@router.post("/oauth/clients", response_model=OAuthClientCreatedOut, status_code=status.HTTP_201_CREATED)
async def create_oauth_client(
    data: OAuthClientIn,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    capability_user: User = require_org_operation("developer.api.use"),
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
    request_hash = hashlib.sha256(
        json.dumps(data.model_dump(mode="json"), sort_keys=True).encode("utf-8")
    ).hexdigest()
    existing = await db.scalar(select(OAuthClient).where(
        OAuthClient.organization_id == current_user.organization_id,
        OAuthClient.idempotency_key == idempotency_key,
    ))
    if existing:
        if existing.request_hash != request_hash:
            raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_CONFLICT"})
        raise HTTPException(status_code=409, detail={
            "code": "IDEMPOTENCY_RESULT_NO_LONGER_REPLAYABLE",
            "resource_id": str(existing.id),
            "message": "The OAuth client already exists. Its secret cannot be shown again.",
        })
    client = await DeveloperService.register_oauth_client(
        db=db,
        org_id=current_user.organization_id,
        name=data.name,
        redirect_uris=data.redirect_uris,
        idempotency_key=idempotency_key,
        request_hash=request_hash,
    )
    db.add(AuditLog(
        organization_id=current_user.organization_id,
        actor_user_id=current_user.id,
        actor_role=current_user.platform_role or current_user.role,
        resource_type="oauth_client",
        resource_id=client.id,
        action_type="OAUTH_CLIENT_CREATED",
        new_state={"name": client.name, "redirect_uris": client.redirect_uris, "version": client.version},
        is_sensitive=True,
    ))
    await db.commit()
    return client

@router.get("/oauth/clients", response_model=List[OAuthClientOut])
async def list_oauth_clients(
    capability_user: User = require_org_operation("developer.api.use"),
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
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    if_match: int = Header(..., alias="If-Match", ge=1),
    capability_user: User = require_org_operation("developer.api.use"),
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
    ).with_for_update()
    res = await db.execute(stmt)
    client = res.scalar_one_or_none()
    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="OAuth Client not found or does not belong to your organization."
        )
    request_hash = hashlib.sha256(f"REVOKE:{client.id}:{if_match}".encode("utf-8")).hexdigest()
    if client.revoke_idempotency_key == idempotency_key:
        if client.revoke_request_hash != request_hash:
            raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_CONFLICT"})
        return None
    if not client.is_active:
        raise HTTPException(status_code=409, detail={"code": "OAUTH_CLIENT_REVOKED", "current_version": client.version})
    if client.version != if_match:
        raise HTTPException(status_code=409, detail={"code": "VERSION_CONFLICT", "current_version": client.version})
    old_state = {"is_active": client.is_active, "version": client.version}
    client.is_active = False
    client.version += 1
    client.revoked_at = datetime.now(timezone.utc)
    client.revoked_by = current_user.id
    client.revoke_idempotency_key = idempotency_key
    client.revoke_request_hash = request_hash
    db.add(AuditLog(
        organization_id=current_user.organization_id,
        actor_user_id=current_user.id,
        actor_role=current_user.platform_role or current_user.role,
        resource_type="oauth_client",
        resource_id=client.id,
        action_type="OAUTH_CLIENT_REVOKED",
        old_state=old_state,
        new_state={"is_active": False, "version": client.version, "revoked_at": client.revoked_at.isoformat()},
        is_sensitive=True,
    ))
    await db.commit()

# ── OAuth2 Token Flow Endpoints ───────────────────────────────

@router.post("/oauth/authorize")
async def oauth_authorize(
    client_id: str,
    redirect_uri: str,
    response_type: str = "code",
    state: Optional[str] = None,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    capability_user: User = require_org_operation("developer.api.use"),
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
    if not current_user.organization_id:
        raise HTTPException(status_code=400, detail="Organization context required.")
    request_hash = hashlib.sha256(
        json.dumps({
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": response_type,
            "state": state,
            "user_id": str(current_user.id),
        }, sort_keys=True).encode("utf-8")
    ).hexdigest()
    try:
        code = await DeveloperService.create_oauth_auth_code(
            db=db,
            client_id=client_id,
            user_id=current_user.id,
            org_id=current_user.organization_id,
            redirect_uri=redirect_uri,
            idempotency_key=idempotency_key,
            request_hash=request_hash,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail={"code": str(exc)}) from exc
    if not code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid client ID or redirect URI."
        )
    client_record = await db.scalar(select(OAuthClient).where(
        OAuthClient.client_id == client_id,
        OAuthClient.organization_id == current_user.organization_id,
    ))
    if client_record:
        authorization = await db.scalar(select(DeveloperOAuthAuthorization).where(
            DeveloperOAuthAuthorization.client_id == client_record.id,
            DeveloperOAuthAuthorization.idempotency_key == idempotency_key,
        ))
        audit_exists = None
        if authorization:
            audit_exists = await db.scalar(select(AuditLog.id).where(
                AuditLog.resource_id == authorization.id,
                AuditLog.action_type == "OAUTH_AUTHORIZATION_CODE_ISSUED",
            ))
        if authorization and audit_exists is None:
            db.add(AuditLog(
                organization_id=current_user.organization_id,
                actor_user_id=current_user.id,
                actor_role=current_user.platform_role or current_user.role,
                resource_type="oauth_authorization",
                resource_id=authorization.id,
                action_type="OAUTH_AUTHORIZATION_CODE_ISSUED",
                new_state={"client_id": str(client_record.id), "redirect_uri": redirect_uri, "expires_at": authorization.expires_at.isoformat()},
                is_sensitive=True,
            ))
    await db.commit()
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
