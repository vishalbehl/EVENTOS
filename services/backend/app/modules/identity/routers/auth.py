# backend/app/routers/auth.py
from __future__ import annotations

import hashlib

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_user, require_active_user
from app.modules.identity.models.refresh_token import RefreshToken
from app.modules.identity.models.user import User
from app.modules.identity.schemas.auth import (
    LoginRequest, TokenResponse, RefreshRequest,
    ChangePasswordRequest, UserMeResponse,
)
from app.schemas.common import MessageResponse
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse, summary="Organizer login")
async def login(
    payload: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Authenticate with email + password. Returns JWT access token."""
    ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else None)
    ua = request.headers.get("User-Agent")
    try:
        result = await auth_service.login(
            db, payload.email, payload.password,
            ip_address=ip, user_agent=ua,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))

    user: User = result["user"]
    return TokenResponse(
        access_token=result["access_token"],
        refresh_token=result.get("refresh_token"),
        token_type="bearer",
        expires_in=auth_service.settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user_id=user.id,
        role=user.role,
        organization_id=user.organization_id,
        user=UserMeResponse.model_validate(user),
    )


@router.post("/refresh", response_model=TokenResponse, summary="Refresh access token")
async def refresh_token(
    payload: RefreshRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Exchange a valid refresh token for a new access + refresh token pair."""
    token_hash = hashlib.sha256(payload.refresh_token.encode()).hexdigest()
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.is_revoked.is_(False),
        )
    )
    record = result.scalar_one_or_none()
    if record is None or record.is_expired:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token.")

    user_result = await db.execute(select(User).where(User.id == record.user_id))
    user = user_result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive.")

    ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else None)
    ua = request.headers.get("User-Agent")
    try:
        new_plain, _ = await auth_service.rotate_refresh_token(
            db, token_hash, user, ip_address=ip, user_agent=ua,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))

    await db.commit()
    new_access = auth_service.create_access_token(user)
    return TokenResponse(
        access_token=new_access,
        refresh_token=new_plain,
        token_type="bearer",
        expires_in=auth_service.settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user_id=user.id,
        role=user.role,
        organization_id=user.organization_id,
        user=UserMeResponse.model_validate(user),
    )


@router.post("/logout", response_model=MessageResponse, summary="Revoke all tokens")
async def logout(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    await auth_service.revoke_user_refresh_tokens(db, current_user.id, reason="logout")
    await db.commit()
    return MessageResponse(message="Logged out successfully.")


@router.get("/me", response_model=UserMeResponse, summary="Get current user profile")
async def get_me(current_user: User = Depends(get_current_user)) -> UserMeResponse:
    return UserMeResponse.model_validate(current_user)


@router.post("/change-password", response_model=MessageResponse)
async def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    if not auth_service.verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect.")
    current_user.password_hash = auth_service.hash_password(payload.new_password)
    await auth_service.revoke_user_refresh_tokens(db, current_user.id, reason="password_change")
    await db.commit()
    return MessageResponse(message="Password changed. Please log in again.")
