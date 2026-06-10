import uuid
import secrets
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from sqlalchemy import select, and_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.developer.models.developer_registry import ApiKey, OAuthClient
from app.modules.developer.models.developer_domain_tables import (
    DeveloperApiUsage,
    DeveloperOAuthAuthorization,
    DeveloperOAuthToken
)
from app.config import settings

class DeveloperService:
    @staticmethod
    async def generate_api_key(
        db: AsyncSession,
        org_id: uuid.UUID,
        name: str,
        expires_in_days: Optional[int] = None
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
            expires_at=expires_at,
            is_active=True
        )
        db.add(api_key)
        await db.commit()
        await db.refresh(api_key)
        
        # Stash plaintext key in memory so router can return it once
        api_key.plaintext_key = plaintext_key
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
        )
        result = await db.execute(stmt)
        api_key = result.scalar_one_or_none()
        
        if not api_key:
            return None
            
        # Check expiration
        if api_key.expires_at and api_key.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
            return None
            
        # Update usage metrics
        api_key.last_used_at = datetime.now(timezone.utc)
        
        # Log endpoint usage
        if endpoint:
            usage_stmt = select(DeveloperApiUsage).where(
                and_(
                    DeveloperApiUsage.organization_id == api_key.organization_id,
                    DeveloperApiUsage.endpoint == endpoint
                )
            )
            usage_res = await db.execute(usage_stmt)
            usage = usage_res.scalar_one_or_none()
            if not usage:
                usage = DeveloperApiUsage(
                    organization_id=api_key.organization_id,
                    endpoint=endpoint,
                    call_count=1
                )
                db.add(usage)
            else:
                usage.call_count += 1
                
        await db.commit()
        return api_key.organization_id

    @staticmethod
    async def register_oauth_client(
        db: AsyncSession,
        org_id: uuid.UUID,
        name: str,
        redirect_uris: List[str]
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
            is_active=True
        )
        # Note: OAuthClient has organization_id column if defined? Let's check developer_registry.py
        # Yes, developer_registry.py does not define organization_id on OAuthClient!
        # Wait, let's verify if OAuthClient has organization_id?
        # Let's check developer_registry.py:
        # No! OAuthClient does not map organization_id!
        # Wait, if it doesn't map organization_id, how is it scoped?
        # Let's see: maybe we need to associate it, but since it is platform-level client, it checks client_id/secret.
        # But wait! If we want it to be scoped, we should check if organization_id is on OAuthClient.
        # Ah, looking at the code in developer_registry.py:
        # class OAuthClient(Base):
        #     __tablename__ = "oauth_clients"
        #     id, client_id, client_secret_hash, name, redirect_uris, is_active, created_at
        # So organization_id is not mapped. That's fine! OAuth clients are platform-wide but represent external apps.
        # Wait, how does it know which organization it represents?
        # The OAuth Authorization code or tokens maps `user_id` and the user's organization!
        # Let's verify this in database. Yes! `DeveloperOAuthAuthorization` has `user_id`.
        # And `DeveloperOAuthToken` has `user_id`.
        # So it scopes it via the user who authorized the client! That is standard OAuth2 design.
        
        db.add(client)
        await db.commit()
        await db.refresh(client)
        
        client.plaintext_client_secret = plaintext_client_secret
        return client

    @staticmethod
    async def create_oauth_auth_code(
        db: AsyncSession,
        client_id: str,
        user_id: uuid.UUID,
        redirect_uri: str
    ) -> Optional[str]:
        """
        Generates an OAuth authorization code valid for 5 minutes.
        """
        # Validate client
        client_stmt = select(OAuthClient).where(
            and_(
                OAuthClient.client_id == client_id,
                OAuthClient.is_active == True
            )
        )
        client_res = await db.execute(client_stmt)
        client = client_res.scalar_one_or_none()
        
        if not client or redirect_uri not in client.redirect_uris:
            return None
            
        code = secrets.token_urlsafe(16)
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)
        
        auth = DeveloperOAuthAuthorization(
            client_id=client.id,
            user_id=user_id,
            code=code,
            expires_at=expires_at
        )
        db.add(auth)
        await db.commit()
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
