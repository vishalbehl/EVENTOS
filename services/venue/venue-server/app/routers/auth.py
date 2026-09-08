import base64
import hashlib
import hmac
import json
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any, Literal, Optional
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Response, status
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_database
from app.models.venue_user import VenueUser
from app.models.operational_control import VenueLoginLockout
from app.models.room_device import RoomDevice
from app.models.srr_station import SRRStation

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

X_VENUE_KEY = APIKeyHeader(name="X-Venue-Key", auto_error=False)
BEARER = HTTPBearer(auto_error=False)
TOKEN_ALGORITHM = "HS256"
PASSWORD_ITERATIONS = 310_000
PASSWORD_HASHER = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=4, hash_len=32, salt_len=16)
VALID_MODES = {"admin", "registration", "scanning", "self_checkin", "workstation", "srr", "stage", "technician"}


def mode_allowed(user: VenueUser, mode: str) -> bool:
    if mode not in VALID_MODES:
        return False
    if user.role in {"admin", "super_admin"}:
        return True
    return mode in (user.allowed_modes or [])


async def verify_device(
    key: str | None = Depends(X_VENUE_KEY),
    device_token: str | None = Header(default=None, alias="X-Device-Token"),
    device_id: uuid.UUID | None = Header(default=None, alias="X-Venue-Device-Id"),
    db: AsyncSession = Depends(get_database),
) -> bool:
    if device_token and device_id:
        device = await validate_room_device_credential(db, device_id, device_token)
        if not device:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or revoked device credential.")
        return True
    if settings.DEPLOYMENT_PROFILE != "local":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Device credential required outside local development.")
    # Retain the installation key for local bootstrap and older development
    # clients. Staging/production clients must use device credentials.
    if not key or not hmac.compare_digest(key, settings.VENUE_AUTH_KEY):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or missing Venue Key.")
    return True


DeviceAuth = Annotated[bool, Depends(verify_device)]


class AuthStatus(BaseModel):
    authenticated: bool
    message: str


class LoginRequest(BaseModel):
    email: Optional[str] = Field(default=None, max_length=320)
    username: Optional[str] = Field(default=None, max_length=320)
    password: str = Field(min_length=1, max_length=512)
    mode: Literal["admin", "registration", "scanning", "self_checkin", "workstation", "srr", "stage", "technician"] = "admin"


class RefreshRequest(BaseModel):
    refresh_token: str = ""


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


class StepUpRequest(BaseModel):
    password: str = Field(min_length=1, max_length=512)


class DeviceTokenRequest(BaseModel):
    device_id: uuid.UUID
    enrollment_token: str = Field(min_length=16, max_length=512)


class SrrDeviceTokenRequest(BaseModel):
    station_id: uuid.UUID
    enrollment_token: str = Field(min_length=16, max_length=512)


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _b64decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def hash_password(password: str) -> str:
    return PASSWORD_HASHER.hash(password)


def verify_password(password: str, encoded: str) -> bool:
    if encoded.startswith("$argon2id$"):
        try:
            return PASSWORD_HASHER.verify(encoded, password)
        except (InvalidHashError, VerificationError, VerifyMismatchError):
            return False
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


def create_step_up_token(user: VenueUser) -> str:
    return create_token(user, "step_up", "admin", timedelta(minutes=10))


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


def create_device_access_token(device: RoomDevice) -> str:
    now = datetime.now(timezone.utc)
    header = {"alg": TOKEN_ALGORITHM, "typ": "JWT"}
    payload = {
        "sub": str(device.id),
        "event_id": str(device.event_id),
        "room_id": str(device.room_id),
        "device_type": device.device_type,
        "type": "device_access",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.VENUE_ACCESS_TOKEN_MINUTES)).timestamp()),
        "jti": secrets.token_urlsafe(16),
    }
    head = _b64encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    body = _b64encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = _b64encode(hmac.new(_auth_secret(), f"{head}.{body}".encode("ascii"), hashlib.sha256).digest())
    return f"{head}.{body}.{signature}"


def create_srr_access_token(station: SRRStation) -> str:
    now = datetime.now(timezone.utc)
    header = {"alg": TOKEN_ALGORITHM, "typ": "JWT"}
    payload = {
        "sub": str(station.id),
        "event_id": str(station.event_id),
        "device_role": station.device_role,
        "type": "srr_device_access",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.VENUE_ACCESS_TOKEN_MINUTES)).timestamp()),
        "jti": secrets.token_urlsafe(16),
    }
    head = _b64encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    body = _b64encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = _b64encode(hmac.new(_auth_secret(), f"{head}.{body}".encode("ascii"), hashlib.sha256).digest())
    return f"{head}.{body}.{signature}"


async def validate_room_device_credential(
    db: AsyncSession,
    device_id: uuid.UUID,
    credential: str,
    *,
    allow_enrollment_token: bool = False,
) -> RoomDevice | None:
    device = await db.get(RoomDevice, device_id)
    if not device or device.id != device_id or not device.enrollment_token_hash or device.enrollment_token_revoked_at:
        return None
    legacy_hash = hashlib.sha256(credential.encode("utf-8")).hexdigest()
    if allow_enrollment_token and hmac.compare_digest(device.enrollment_token_hash, legacy_hash):
        return device
    try:
        payload = decode_token(credential, "device_access")
    except HTTPException:
        return None
    if payload.get("sub") != str(device.id) or payload.get("event_id") != str(device.event_id) or payload.get("room_id") != str(device.room_id):
        return None
    return device


async def resolve_srr_device_credential(
    db: AsyncSession,
    credential: str,
    *,
    allow_enrollment_token: bool = False,
) -> SRRStation | None:
    station = None
    try:
        payload = decode_token(credential, "srr_device_access")
        station = await db.get(SRRStation, uuid.UUID(str(payload.get("sub"))))
        if station and station.event_id and payload.get("event_id") == str(station.event_id):
            if station.enrollment_token_revoked_at is None and station.is_active:
                return station
        return None
    except (HTTPException, ValueError, TypeError):
        pass
    if not allow_enrollment_token:
        return None
    station = (await db.execute(select(SRRStation).where(
        SRRStation.enrollment_token_hash == hashlib.sha256(credential.encode("utf-8")).hexdigest(),
        SRRStation.enrollment_token_revoked_at.is_(None),
        SRRStation.is_active.is_(True),
    ))).scalar_one_or_none()
    return station


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
    existing = (
        await db.execute(
            select(VenueUser).where(or_(VenueUser.email == email, VenueUser.username == username)).limit(1)
        )
    ).scalar_one_or_none()
    if existing:
        existing.is_active = True
        existing.role = "admin"
        if not verify_password(password, existing.password_hash):
            existing.password_hash = hash_password(password)
    else:
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

    # Clear any stale lockouts for the bootstrap admin
    for ident in (username, email):
        lockout = await db.get(VenueLoginLockout, ident)
        if lockout:
            await db.delete(lockout)

    from app.models.operational_control import VenueInstallation
    install = await db.scalar(select(VenueInstallation).limit(1))
    if not install:
        install = VenueInstallation(
            installation_name="Eventos Venue Server",
            setup_status="complete",
            maintenance_mode=False,
            storage_path="C:\\ProgramData\\Eventos\\Venue\\Content",
            backup_path="D:\\EventosBackups",
            configuration={"cloud_sync": True, "p2p_distribution": True, "heartbeat_interval_sec": 10}
        )
        db.add(install)
    elif install.setup_status != "complete":
        install.setup_status = "complete"

    await db.commit()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(BEARER),
    venue_access_token: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_database),
) -> VenueUser:
    token = credentials.credentials if credentials and credentials.scheme.lower() == "bearer" else venue_access_token
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    payload = decode_token(token, "access")
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


async def require_step_up(
    user: VenueUser = Depends(require_admin),
    step_up_token: str | None = Header(default=None, alias="X-Step-Up-Token"),
) -> VenueUser:
    if not step_up_token:
        raise HTTPException(status_code=status.HTTP_428_PRECONDITION_REQUIRED, detail="Administrator step-up authentication required")
    payload = decode_token(step_up_token, "step_up")
    if str(payload.get("sub")) != str(user.id):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Step-up authentication belongs to another account")
    return user


async def require_operator(user: VenueUser = Depends(get_current_user)) -> VenueUser:
    if user.role not in {"operator", "admin", "super_admin"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Operator access required")
    return user


async def require_viewer(user: VenueUser = Depends(get_current_user)) -> VenueUser:
    if user.role not in {"viewer", "operator", "admin", "super_admin"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Venue access required")
    return user


@router.get("/status", response_model=AuthStatus)
async def verify_connection():
    return AuthStatus(authenticated=True, message="Connected to Venue Server successfully")


@router.get("/verify", response_model=AuthStatus)
async def verify_device_connection(_: DeviceAuth):
    return AuthStatus(authenticated=True, message="Venue device credential accepted")


@router.post("/device/token")
async def issue_device_access_token(payload: DeviceTokenRequest, db: AsyncSession = Depends(get_database)) -> dict[str, Any]:
    device = await validate_room_device_credential(db, payload.device_id, payload.enrollment_token, allow_enrollment_token=True)
    if not device:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or revoked device enrollment credential.")
    token = create_device_access_token(device)
    return {
        "access_token": token,
        "token_type": "Bearer",
        "expires_in": settings.VENUE_ACCESS_TOKEN_MINUTES * 60,
        "device_id": str(device.id),
        "event_id": str(device.event_id),
        "room_id": str(device.room_id),
        "device_type": device.device_type,
    }


@router.post("/srr/token")
async def issue_srr_access_token(payload: SrrDeviceTokenRequest, db: AsyncSession = Depends(get_database)) -> dict[str, Any]:
    station = await db.get(SRRStation, payload.station_id)
    if not station or not station.enrollment_token_hash or station.enrollment_token_revoked_at or not station.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or revoked SRR enrollment credential.")
    expected = hashlib.sha256(payload.enrollment_token.encode("utf-8")).hexdigest()
    if not hmac.compare_digest(station.enrollment_token_hash, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or revoked SRR enrollment credential.")
    token = create_srr_access_token(station)
    return {
        "access_token": token,
        "token_type": "Bearer",
        "expires_in": settings.VENUE_ACCESS_TOKEN_MINUTES * 60,
        "station_id": str(station.id),
        "event_id": str(station.event_id),
        "station_number": station.station_number,
        "device_role": station.device_role,
    }


@router.post("/login")
async def login(credentials: LoginRequest, response: Response, db: AsyncSession = Depends(get_database)):
    raw_identifier = credentials.username or credentials.email or ""
    identifier = raw_identifier.strip().lower()
    if not identifier:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Username or email is required")
    now = datetime.now(timezone.utc)
    lockout = await db.get(VenueLoginLockout, identifier)
    if lockout and lockout.locked_until and lockout.locked_until > now:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many failed attempts. Try again later.")
    user = (
        await db.execute(
            select(VenueUser).where(
                or_(
                    func.lower(VenueUser.username) == identifier,
                    func.lower(VenueUser.email) == identifier,
                    func.lower(VenueUser.email) == f"{identifier}@eventos.com",
                    VenueUser.username == raw_identifier.strip(),
                    VenueUser.email == raw_identifier.strip(),
                )
            ).limit(1)
        )
    ).scalar_one_or_none()
    if not user or not user.is_active or not verify_password(credentials.password, user.password_hash):
        if not lockout:
            lockout = VenueLoginLockout(identifier=identifier, failed_count=0, last_attempt_at=now)
            db.add(lockout)
        lockout.failed_count += 1
        lockout.last_attempt_at = now
        if lockout.failed_count >= 5:
            lockout.locked_until = now + timedelta(minutes=15)
        await db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username/email or password")
    if lockout:
        lockout.failed_count = 0
        lockout.locked_until = None
        lockout.last_attempt_at = now
    if not user.password_hash.startswith("$argon2id$"):
        user.password_hash = hash_password(credentials.password)
        await db.commit()
    if not mode_allowed(user, credentials.mode):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account cannot use the selected mode")
    access = create_token(
        user, "access", credentials.mode, timedelta(minutes=settings.VENUE_ACCESS_TOKEN_MINUTES)
    )
    refresh = create_token(user, "refresh", credentials.mode, timedelta(days=7))
    secure = settings.DEPLOYMENT_PROFILE == "production"
    response.set_cookie("venue_access_token", access, httponly=True, secure=secure, samesite="strict", max_age=settings.VENUE_ACCESS_TOKEN_MINUTES * 60, path="/")
    response.set_cookie("venue_refresh_token", refresh, httponly=True, secure=secure, samesite="strict", max_age=7 * 24 * 60 * 60, path="/api/v1/auth")
    return {"authenticated": True, "user": serialize_user(user)}


@router.post("/step-up")
async def step_up(payload: StepUpRequest, user: VenueUser = Depends(require_admin)):
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Step-up authentication failed")
    return {"step_up_token": create_step_up_token(user), "expires_in": 600}


@router.post("/refresh")
async def refresh_token(payload: RefreshRequest, response: Response, venue_refresh_token: str | None = Cookie(default=None), db: AsyncSession = Depends(get_database)):
    token_data = decode_token(venue_refresh_token or payload.refresh_token, "refresh")
    user = await db.get(VenueUser, uuid.UUID(str(token_data["sub"])))
    mode = str(token_data.get("mode"))
    if not user or not user.is_active or not mode_allowed(user, mode):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token is no longer valid")
    access = create_token(user, "access", mode, timedelta(minutes=settings.VENUE_ACCESS_TOKEN_MINUTES))
    response.set_cookie("venue_access_token", access, httponly=True, secure=settings.DEPLOYMENT_PROFILE == "production", samesite="strict", max_age=settings.VENUE_ACCESS_TOKEN_MINUTES * 60, path="/")
    return {"authenticated": True}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response, _: VenueUser = Depends(get_current_user)):
    response.delete_cookie("venue_access_token", path="/")
    response.delete_cookie("venue_refresh_token", path="/api/v1/auth")
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
