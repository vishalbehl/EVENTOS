import uuid
import secrets
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from sqlalchemy import select, and_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.developer.models.developer_registry import ApiKey, OAuthClient
from app.modules.developer.models.developer_domain_tables import (
    DeveloperOAuthAuthorization,
    DeveloperOAuthToken,
)
from app.modules.analytics.models.analytics_domain_tables import ApiUsageMetric
from app.config import settings
from app.modules.billing.services.capability_service import CapabilityService
from app.modules.billing.services.usage_reservation_service import UsageReservationService
from app.modules.identity.models.user import User

class DeveloperService:
    @staticmethod
    async def generate_api_key(
        db: AsyncSession,
        org_id: uuid.UUID,
        name: str,
        expires_in_days: Optional[int] = None,
        idempotency_key: Optional[str] = None,
        request_hash: Optional[str] = None,
    ) -> ApiKey:
        """
        Generates a secure API key, hashes it for database storage,
        and saves it. Returns the ApiKey model instance with plaintext key attached.
        """
        # Format: evx_live_xyz...
        random_part = secrets.token_urlsafe(32)
        plaintext_key = f"evx_live_{random_part}"
        
        prefix = "evx_live"
        key_hash = hashlib.sha256(plaintext_key.encode()).hexdigest()
        
        expires_at = None
        if expires_in_days:
            expires_at = datetime.now(timezone.utc) + timedelta(days=expires_in_days)
            
        api_key = ApiKey(
            organization_id=org_id,
            name=name,
            prefix=prefix,
            key_hash=key_hash,
            idempotency_key=idempotency_key,
            request_hash=request_hash,
            expires_at=expires_at,
            is_active=True
        )
        db.add(api_key)
        await db.flush()
        
        # Stash plaintext key in memory so router can return it once
        api_key.plaintext_key = plaintext_key
        return api_key

    @staticmethod
    async def revoke_api_key(db: AsyncSession, org_id: uuid.UUID, key_id: uuid.UUID) -> ApiKey | None:
        api_key = await db.scalar(select(ApiKey).where(ApiKey.id == key_id, ApiKey.organization_id == org_id).with_for_update())
        if not api_key:
            return None
        api_key.is_active = False
        await db.flush()
        return api_key

    @staticmethod
    async def validate_api_key(db: AsyncSession, plaintext_key: str, endpoint: str = "") -> Optional[uuid.UUID]:
        """
        Checks if the provided plaintext API key is valid.
        Updates last_used_at and increments api_usage on success.
        """
        key_hash = hashlib.sha256(plaintext_key.encode()).hexdigest()
        
        stmt = select(ApiKey).where(
            and_(
                ApiKey.key_hash == key_hash,
                ApiKey.is_active == True
            )
        ).with_for_update()
        result = await db.execute(stmt)
        api_key = result.scalar_one_or_none()
        
        if not api_key:
            return None
            
        # Check expiration
        if api_key.expires_at and api_key.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
            return None

        # API authentication is also a commercial operation. Locking the key
        # serializes calls made with the same credential so the monthly limit
        # cannot be overshot by concurrent requests.
        try:
            capability = await CapabilityService.resolve_organization(
                db, api_key.organization_id
            )
        except Exception:
            return None
        feature = capability.get("features", {}).get("FEAT_API_ACCESS")
        if not feature or not feature.get("enabled"):
            return None
        try:
            reservation = await UsageReservationService.reserve(
                db,
                organization_id=api_key.organization_id,
                event_id=None,
                limit_key="max_api_calls_per_month",
                quantity=1,
                unit="request",
                idempotency_key=f"api-call:{uuid.uuid4()}",
                metadata={"endpoint": endpoint, "api_key_id": str(api_key.id)},
            )
        except Exception:
            return None
            
        # Update usage metrics
        api_key.last_used_at = datetime.now(timezone.utc)
        
        # Log endpoint usage
        if endpoint:
            period_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            usage_stmt = select(ApiUsageMetric).where(
                and_(
                    ApiUsageMetric.organization_id == api_key.organization_id,
                    ApiUsageMetric.endpoint == endpoint,
                    ApiUsageMetric.period_start == period_start,
                )
            )
            usage_res = await db.execute(usage_stmt)
            usage = usage_res.scalar_one_or_none()
            if not usage:
                usage = ApiUsageMetric(
                    organization_id=api_key.organization_id,
                    endpoint=endpoint,
                    call_count=1,
                    period_start=period_start,
                )
                db.add(usage)
            else:
                usage.call_count += 1
                usage.recorded_at = datetime.now(timezone.utc)
                
        await UsageReservationService.consume(db, reservation.id, source="DEVELOPER_API_AUTH")
        await db.commit()
        return api_key.organization_id

    @staticmethod
    async def register_oauth_client(
        db: AsyncSession,
        org_id: uuid.UUID,
        name: str,
        redirect_uris: List[str],
        *,
        idempotency_key: str,
        request_hash: str,
    ) -> OAuthClient:
        """
        Registers an OAuth client for the tenant organization.
        """
        client_id = secrets.token_hex(16)
        plaintext_client_secret = secrets.token_urlsafe(32)
        client_secret_hash = hashlib.sha256(plaintext_client_secret.encode()).hexdigest()
        
        client = OAuthClient(
            organization_id=org_id,
            client_id=client_id,
            client_secret_hash=client_secret_hash,
            name=name,
            redirect_uris=redirect_uris,
            is_active=True,
            version=1,
            idempotency_key=idempotency_key,
            request_hash=request_hash,
        )
        db.add(client)
        await db.flush()
        
        client.plaintext_client_secret = plaintext_client_secret
        return client

    @staticmethod
    async def create_oauth_auth_code(
        db: AsyncSession,
        client_id: str,
        user_id: uuid.UUID,
        org_id: uuid.UUID,
        redirect_uri: str,
        *,
        idempotency_key: str,
        request_hash: str,
    ) -> Optional[str]:
        """
        Generates an OAuth authorization code valid for 5 minutes.
        """
        # Validate client
        client_stmt = select(OAuthClient).where(
            and_(
                OAuthClient.client_id == client_id,
                OAuthClient.organization_id == org_id,
                OAuthClient.is_active == True
            )
        )
        client_res = await db.execute(client_stmt)
        client = client_res.scalar_one_or_none()
        
        if not client or redirect_uri not in client.redirect_uris:
            return None

        existing = await db.scalar(select(DeveloperOAuthAuthorization).where(
            DeveloperOAuthAuthorization.client_id == client.id,
            DeveloperOAuthAuthorization.idempotency_key == idempotency_key,
        ))
        if existing:
            if existing.request_hash != request_hash:
                raise ValueError("IDEMPOTENCY_CONFLICT")
            if existing.expires_at.replace(tzinfo=timezone.utc) <= datetime.now(timezone.utc):
                raise ValueError("IDEMPOTENCY_RESULT_EXPIRED")
            return existing.code
            
        code = secrets.token_urlsafe(16)
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)
        
        auth = DeveloperOAuthAuthorization(
            client_id=client.id,
            user_id=user_id,
            code=code,
            expires_at=expires_at,
            idempotency_key=idempotency_key,
            request_hash=request_hash,
        )
        db.add(auth)
        await db.flush()
        return code

    @staticmethod
    async def exchange_oauth_code(
        db: AsyncSession,
        client_id: str,
        client_secret: str,
        code: str
    ) -> Optional[dict]:
        """
        Exchanges authorization code for access/refresh tokens.
        """
        # Verify client credentials
        client_secret_hash = hashlib.sha256(client_secret.encode()).hexdigest()
        client_stmt = select(OAuthClient).where(
            and_(
                OAuthClient.client_id == client_id,
                OAuthClient.client_secret_hash == client_secret_hash,
                OAuthClient.is_active == True
            )
        )
        client_res = await db.execute(client_stmt)
        client = client_res.scalar_one_or_none()
        
        if not client:
            return None
            
        # Verify auth code
        auth_stmt = select(DeveloperOAuthAuthorization).where(
            and_(
                DeveloperOAuthAuthorization.client_id == client.id,
                DeveloperOAuthAuthorization.code == code
            )
        )
        auth_res = await db.execute(auth_stmt)
        auth = auth_res.scalar_one_or_none()
        
        if not auth or auth.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
            return None

        authorizing_user = await db.get(User, auth.user_id)
        if not authorizing_user or not authorizing_user.organization_id:
            return None
        try:
            capability = await CapabilityService.resolve_organization(
                db, authorizing_user.organization_id, user_id=authorizing_user.id
            )
        except Exception:
            return None
        api_feature = capability.get("features", {}).get("FEAT_API_ACCESS")
        if not api_feature or not api_feature.get("enabled"):
            return None
            
        # Generate tokens
        access_token = secrets.token_urlsafe(64)
        refresh_token = secrets.token_urlsafe(64)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
        
        token_record = DeveloperOAuthToken(
            client_id=client.id,
            user_id=auth.user_id,
            access_token=access_token,
            refresh_token=refresh_token,
            expires_at=expires_at
        )
        db.add(token_record)
        
        # Delete code (one-time use)
        await db.delete(auth)
        await db.commit()
        
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_in": 86400
        }
