import base64
import hashlib
import hmac
import json
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_database
from app.models.venue_user import VenueUser

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

X_VENUE_KEY = APIKeyHeader(name="X-Venue-Key", auto_error=False)
BEARER = HTTPBearer(auto_error=False)
TOKEN_ALGORITHM = "HS256"
PASSWORD_ITERATIONS = 310_000
VALID_MODES = {"admin", "registration", "scanning", "self_checkin"}


def mode_allowed(user: VenueUser, mode: str) -> bool:
    if mode not in VALID_MODES:
        return False
    if user.role in {"admin", "super_admin"}:
        return True
    return mode in (user.allowed_modes or [])


def verify_device(key: str = Depends(X_VENUE_KEY)) -> bool:
    if not key or not hmac.compare_digest(key, settings.VENUE_AUTH_KEY):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or missing Venue Key.")
    return True


DeviceAuth = Annotated[bool, Depends(verify_device)]


class AuthStatus(BaseModel):
    authenticated: bool
    message: str


class LoginRequest(BaseModel):
    email: str = Field(min_length=1, max_length=320)
    password: str = Field(min_length=1, max_length=512)
    mode: Literal["admin", "registration", "scanning", "self_checkin"] = "registration"


class RefreshRequest(BaseModel):
    refresh_token: str


class ProfileUpdateRequest(BaseModel):
    first_name: Optional[str] = Field(default=None, min_length=1, max_length=150)
    last_name: Optional[str] = Field(default=None, max_length=150)
    email: Optional[str] = Field(default=None, min_length=3, max_length=320)
    phone: Optional[str] = Field(default=None, max_length=30)
    notification_preferences: Optional[dict[str, Any]] = None


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=10, max_length=512)


class PreferenceUpdateRequest(BaseModel):
    preferences: dict[str, Any]


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _b64decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS)
    return f"pbkdf2_sha256${PASSWORD_ITERATIONS}${_b64encode(salt)}${_b64encode(digest)}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        scheme, iterations, salt, expected = encoded.split("$", 3)
        if scheme != "pbkdf2_sha256":
            return False
        actual = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), _b64decode(salt), int(iterations)
        )
        return hmac.compare_digest(actual, _b64decode(expected))
    except (TypeError, ValueError):
        return False


def _auth_secret() -> bytes:
    if len(settings.VENUE_AUTH_SECRET) < 32:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Venue authentication is not configured. Set VENUE_AUTH_SECRET to at least 32 characters.",
        )
    return settings.VENUE_AUTH_SECRET.encode("utf-8")


def create_token(user: VenueUser, token_type: str, mode: str, lifetime: timedelta) -> str:
    now = datetime.now(timezone.utc)
    header = {"alg": TOKEN_ALGORITHM, "typ": "JWT"}
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "mode": mode,
        "type": token_type,
        "iat": int(now.timestamp()),
        "exp": int((now + lifetime).timestamp()),
        "jti": secrets.token_urlsafe(12),
    }
    head = _b64encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    body = _b64encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = _b64encode(hmac.new(_auth_secret(), f"{head}.{body}".encode("ascii"), hashlib.sha256).digest())
    return f"{head}.{body}.{signature}"


def decode_token(token: str, expected_type: str) -> dict[str, Any]:
    try:
        head, body, signature = token.split(".", 2)
        expected = hmac.new(_auth_secret(), f"{head}.{body}".encode("ascii"), hashlib.sha256).digest()
        if not hmac.compare_digest(expected, _b64decode(signature)):
            raise ValueError("signature")
        payload = json.loads(_b64decode(body))
        if payload.get("type") != expected_type or int(payload.get("exp", 0)) <= int(datetime.now(timezone.utc).timestamp()):
            raise ValueError("expired")
        return payload
    except (ValueError, TypeError, json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired access token")


def serialize_user(user: VenueUser) -> dict[str, Any]:
    return {
        "id": str(user.id),
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "full_name": user.full_name,
        "phone": user.phone,
        "role": user.role,
        "organization_id": str(user.organization_id) if user.organization_id else "local",
        "allowed_modes": user.allowed_modes or [],
        "notification_preferences": user.notification_preferences or {},
        "mode_preferences": user.mode_preferences or {},
    }


async def ensure_bootstrap_admin(db: AsyncSession) -> None:
    """Create the first local administrator only from explicit environment credentials."""
    email = settings.VENUE_BOOTSTRAP_ADMIN_EMAIL.strip().lower()
    username = settings.VENUE_BOOTSTRAP_ADMIN_USERNAME.strip().lower()
    password = settings.VENUE_BOOTSTRAP_ADMIN_PASSWORD
    if not email or not username or not password or len(settings.VENUE_AUTH_SECRET) < 32:
        return
    existing = (await db.execute(select(VenueUser).limit(1))).scalar_one_or_none()
    if existing:
        return
    names = settings.VENUE_BOOTSTRAP_ADMIN_NAME.strip().split(maxsplit=1)
    user = VenueUser(
        email=email,
        username=username,
        first_name=names[0] if names else "Venue",
        last_name=names[1] if len(names) > 1 else "Administrator",
        password_hash=hash_password(password),
        role="admin",
        allowed_modes=["admin", "registration", "scanning", "self_checkin"],
        mode_preferences={},
        notification_preferences={},
    )
    db.add(user)
    await db.commit()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(BEARER),
    db: AsyncSession = Depends(get_database),
) -> VenueUser:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    payload = decode_token(credentials.credentials, "access")
    try:
        user_id = uuid.UUID(str(payload["sub"]))
    except (ValueError, KeyError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid access token")
    user = await db.get(VenueUser, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account is inactive or unavailable")
    if payload.get("role") != user.role or not mode_allowed(user, str(payload.get("mode"))):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Access token is no longer valid")
    return user


async def require_admin(user: VenueUser = Depends(get_current_user)) -> VenueUser:
    if user.role not in {"admin", "super_admin"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator access required")
    return user


@router.get("/verify", response_model=AuthStatus)
async def verify_connection(is_auth: DeviceAuth):
    return AuthStatus(authenticated=True, message="Connected to Venue Server successfully")


@router.post("/login")
async def login(credentials: LoginRequest, db: AsyncSession = Depends(get_database)):
    identifier = credentials.email.strip().lower()
    user = (
        await db.execute(
            select(VenueUser).where(or_(VenueUser.email == identifier, VenueUser.username == identifier)).limit(1)
        )
    ).scalar_one_or_none()
    if not user or not user.is_active or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username/email or password")
    if not mode_allowed(user, credentials.mode):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account cannot use the selected mode")
    access = create_token(
        user, "access", credentials.mode, timedelta(minutes=settings.VENUE_ACCESS_TOKEN_MINUTES)
    )
    refresh = create_token(user, "refresh", credentials.mode, timedelta(days=7))
    return {"access_token": access, "refresh_token": refresh, "token_type": "bearer", "user": serialize_user(user)}


@router.post("/refresh")
async def refresh_token(payload: RefreshRequest, db: AsyncSession = Depends(get_database)):
    token_data = decode_token(payload.refresh_token, "refresh")
    user = await db.get(VenueUser, uuid.UUID(str(token_data["sub"])))
    mode = str(token_data.get("mode"))
    if not user or not user.is_active or not mode_allowed(user, mode):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token is no longer valid")
    return {
        "access_token": create_token(
            user, "access", mode, timedelta(minutes=settings.VENUE_ACCESS_TOKEN_MINUTES)
        ),
        "token_type": "bearer",
    }


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(_: VenueUser = Depends(get_current_user)):
    return None


@router.get("/me")
async def get_me(user: VenueUser = Depends(get_current_user)):
    return serialize_user(user)


@router.patch("/me")
async def update_me(
    payload: ProfileUpdateRequest,
    user: VenueUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_database),
):
    updates = payload.model_dump(exclude_unset=True)
    for field in ("first_name", "last_name", "email", "phone", "notification_preferences"):
        if field in updates:
            setattr(user, field, updates[field].strip() if isinstance(updates[field], str) else updates[field])
    if "email" in updates:
        user.email = user.email.lower()
    await db.commit()
    await db.refresh(user)
    return serialize_user(user)


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    payload: PasswordChangeRequest,
    user: VenueUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_database),
):
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    user.password_hash = hash_password(payload.new_password)
    await db.commit()
    return None


@router.get("/me/preferences/{mode}")
async def get_mode_preferences(mode: str, user: VenueUser = Depends(get_current_user)):
    if not mode_allowed(user, mode):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Mode is not available to this account")
    return {"mode": mode, "preferences": (user.mode_preferences or {}).get(mode, {})}


@router.put("/me/preferences/{mode}")
async def update_mode_preferences(
    mode: str,
    payload: PreferenceUpdateRequest,
    user: VenueUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_database),
):
    if not mode_allowed(user, mode):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Mode is not available to this account")
    preferences = dict(user.mode_preferences or {})
    preferences[mode] = payload.preferences
    user.mode_preferences = preferences
    await db.commit()
    return {"mode": mode, "preferences": payload.preferences}
