# backend/app/routers/auth.py
from __future__ import annotations

import hashlib

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_user, require_active_user
from app.modules.identity.models.refresh_token import RefreshToken
from app.modules.identity.models.user import User
from app.modules.identity.schemas.auth import (
    LoginRequest, TokenResponse, RefreshRequest,
    ChangePasswordRequest, UserMeResponse, CommandCenterLoginRequest,
    CommandCenterTokenResponse,
)
from app.config import settings
from app.core.client_ip import ip_is_allowed, resolve_client_ip
from app.modules.identity.services.login_limiter import check_login_allowed, record_login_attempt
from app.schemas.common import MessageResponse
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])

_CC_COOKIE_PATH = "/api/v1/auth/command-center"
_GENERIC_AUTH_ERROR = "Authentication could not be completed."


def _is_platform_admin(user: User) -> bool:
    return bool(
        user.role == "super_admin"
        or getattr(user, "platform_role", None) == "SUPER_ADMIN"
        or getattr(user, "is_platform_admin", False)
    )


def _validate_cookie_origin(request: Request) -> None:
    origin = request.headers.get("origin")
    if origin in settings.CORS_ORIGINS:
        return
    if not origin and not settings.is_production:
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=_GENERIC_AUTH_ERROR)


def _set_command_center_cookie(response: Response, token: str, remember_me: bool) -> None:
    kwargs = {
        "key": settings.COMMAND_CENTER_COOKIE_NAME,
        "value": token,
        "httponly": True,
        "secure": settings.COMMAND_CENTER_COOKIE_SECURE,
        "samesite": settings.COMMAND_CENTER_COOKIE_SAMESITE,
        "path": _CC_COOKIE_PATH,
    }
    if remember_me:
        kwargs["max_age"] = settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400
    response.set_cookie(**kwargs)
    response.set_cookie(
        key=f"{settings.COMMAND_CENTER_COOKIE_NAME}_persistent",
        value="1" if remember_me else "0",
        httponly=True,
        secure=settings.COMMAND_CENTER_COOKIE_SECURE,
        samesite=settings.COMMAND_CENTER_COOKIE_SAMESITE,
        path=_CC_COOKIE_PATH,
        **({"max_age": settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400} if remember_me else {}),
    )


def _clear_command_center_cookie(response: Response) -> None:
    response.delete_cookie(
        settings.COMMAND_CENTER_COOKIE_NAME,
        path=_CC_COOKIE_PATH,
        secure=settings.COMMAND_CENTER_COOKIE_SECURE,
        httponly=True,
        samesite=settings.COMMAND_CENTER_COOKIE_SAMESITE,
    )
    response.delete_cookie(
        f"{settings.COMMAND_CENTER_COOKIE_NAME}_persistent",
        path=_CC_COOKIE_PATH,
        secure=settings.COMMAND_CENTER_COOKIE_SECURE,
        httponly=True,
        samesite=settings.COMMAND_CENTER_COOKIE_SAMESITE,
    )


@router.post(
    "/command-center/login",
    response_model=CommandCenterTokenResponse,
    summary="Privileged Command Center login",
)
async def command_center_login(
    payload: CommandCenterLoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> CommandCenterTokenResponse:
    ip = resolve_client_ip(request)
    ua = request.headers.get("user-agent")
    allowed, retry_after = await check_login_allowed(db, payload.email, ip)
    if not allowed:
        await auth_service.write_auth_audit(
            db, user_id=None, action="command_center_login_throttled", ip_address=ip, user_agent=ua
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many authentication attempts. Try again later.",
            headers={"Retry-After": str(retry_after), "X-Error-Code": "rate_limited"},
        )
    try:
        result = await auth_service.login(
            db, payload.email, payload.password,
            ip_address=ip, user_agent=ua, mfa_code=payload.totp_code,
            access_expires_minutes=settings.COMMAND_CENTER_ACCESS_TOKEN_EXPIRE_MINUTES,
        )
        user: User = result["user"]
        if not _is_platform_admin(user) or not ip_is_allowed(ip, user.allowed_ips):
            await auth_service.revoke_refresh_token_family(
                db, hashlib.sha256(result["refresh_token"].encode()).hexdigest(), reason="access_denied"
            )
            await record_login_attempt(db, payload.email, ip, False)
            await auth_service.write_auth_audit(
                db, user_id=user.id, action="command_center_login_denied", ip_address=ip, user_agent=ua
            )
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=_GENERIC_AUTH_ERROR,
                headers={"X-Error-Code": "ip_restricted"},
            )
    except HTTPException:
        raise
    except ValueError:
        await record_login_attempt(db, payload.email, ip, False)
        await auth_service.write_auth_audit(
            db, user_id=None, action="command_center_login_failed", ip_address=ip, user_agent=ua
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_GENERIC_AUTH_ERROR,
            headers={"X-Error-Code": "invalid_credentials"},
        )

    await record_login_attempt(db, payload.email, ip, True)
    await auth_service.write_auth_audit(
        db, user_id=user.id, action="command_center_login", ip_address=ip, user_agent=ua
    )
    await db.commit()
    _set_command_center_cookie(response, result["refresh_token"], payload.remember_me)
    return CommandCenterTokenResponse(
        access_token=result["access_token"],
        expires_in=settings.COMMAND_CENTER_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserMeResponse.model_validate(user),
    )


@router.post("/command-center/refresh", response_model=CommandCenterTokenResponse)
async def command_center_refresh(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> CommandCenterTokenResponse:
    _validate_cookie_origin(request)
    plain = request.cookies.get(settings.COMMAND_CENTER_COOKIE_NAME)
    if not plain:
        raise HTTPException(status_code=401, detail="Session expired.", headers={"X-Error-Code": "session_expired"})
    token_hash = hashlib.sha256(plain.encode()).hexdigest()
    record = (await db.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))).scalar_one_or_none()
    if record is None:
        _clear_command_center_cookie(response)
        raise HTTPException(status_code=401, detail="Session expired.", headers={"X-Error-Code": "session_expired"})
    user = (await db.execute(select(User).options(selectinload(User.organization)).where(User.id == record.user_id))).scalar_one_or_none()
    ip = resolve_client_ip(request)
    if user is None or not user.is_active or not _is_platform_admin(user) or not ip_is_allowed(ip, user.allowed_ips):
        _clear_command_center_cookie(response)
        raise HTTPException(status_code=401, detail="Session expired.", headers={"X-Error-Code": "session_expired"})
    try:
        new_plain, _ = await auth_service.rotate_refresh_token(
            db, token_hash, user, ip_address=ip, user_agent=request.headers.get("user-agent")
        )
    except ValueError:
        await auth_service.write_auth_audit(
            db, user_id=user.id, action="command_center_refresh_rejected",
            ip_address=ip, user_agent=request.headers.get("user-agent"),
        )
        await db.commit()
        _clear_command_center_cookie(response)
        raise HTTPException(status_code=401, detail="Session expired.", headers={"X-Error-Code": "session_expired"})
    await db.commit()
    access = auth_service.create_access_token(
        user,
        mfa_authenticated_at=record.mfa_authenticated_at,
        expires_minutes=settings.COMMAND_CENTER_ACCESS_TOKEN_EXPIRE_MINUTES,
    )
    remember_me = request.cookies.get(f"{settings.COMMAND_CENTER_COOKIE_NAME}_persistent") == "1"
    _set_command_center_cookie(response, new_plain, remember_me)
    return CommandCenterTokenResponse(
        access_token=access,
        expires_in=settings.COMMAND_CENTER_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserMeResponse.model_validate(user),
    )


@router.post("/command-center/logout", response_model=MessageResponse)
async def command_center_logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    _validate_cookie_origin(request)
    plain = request.cookies.get(settings.COMMAND_CENTER_COOKIE_NAME)
    if plain:
        token_hash = hashlib.sha256(plain.encode()).hexdigest()
        record = (await db.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))).scalar_one_or_none()
        await auth_service.revoke_refresh_token_family(db, token_hash)
        await auth_service.write_auth_audit(
            db, user_id=record.user_id if record else None, action="command_center_logout",
            ip_address=resolve_client_ip(request), user_agent=request.headers.get("user-agent"),
        )
        await db.commit()
    _clear_command_center_cookie(response)
    return MessageResponse(message="Logged out successfully.")


@router.post("/command-center/logout-all", response_model=MessageResponse)
async def command_center_logout_all(
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    _validate_cookie_origin(request)
    if not _is_platform_admin(current_user):
        raise HTTPException(status_code=403, detail="Access denied.")
    await auth_service.revoke_user_refresh_tokens(db, current_user.id, reason="logout_all")
    await auth_service.write_auth_audit(
        db, user_id=current_user.id, action="command_center_logout_all",
        ip_address=resolve_client_ip(request), user_agent=request.headers.get("user-agent"),
    )
    await db.commit()
    _clear_command_center_cookie(response)
    return MessageResponse(message="All sessions have been logged out.")


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
            ip_address=ip, user_agent=ua, mfa_code=payload.mfa_code,
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

    user_result = await db.execute(
        select(User).options(selectinload(User.organization)).where(User.id == record.user_id)
    )
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
    new_access = auth_service.create_access_token(
        user,
        mfa_authenticated_at=record.mfa_authenticated_at,
    )
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
