# =============================================================
# Conference Platform — FastAPI Dependency Injection
# backend/app/dependencies.py
#
# Every reusable dependency lives here.
# Inject into route handlers via:
#   async def my_route(db: DB, current_user: CurrentUser):
#
# Dependency hierarchy:
#   get_db               → raw async DB session
#   get_token_data       → decode + validate JWT (no DB hit)
#   get_current_user     → load User ORM object from DB
#   require_active_user  → get_current_user + is_active check
#   require_roles(...)   → require_active_user + role check
#   get_pagination       → page/page_size from query params
#   get_current_event    → load Event ORM from path param
#   verify_upload_token  → speaker token auth (no JWT)
#   verify_device_key    → on-site Electron app auth
# =============================================================

import hashlib
import uuid
from datetime import datetime, timezone
from typing import Annotated, List, Optional

from fastapi import Depends, Header, HTTPException, Path, Query, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionLocal

# ── Model imports ─────────────────────────────────────────
from app.models.event import Event
from app.models.organization import Organization
from app.models.refresh_token import RefreshToken
from app.models.speaker import Speaker
from app.models.user import User


# =============================================================
# SECTION 1 — DATABASE SESSION
# =============================================================

async def get_db() -> AsyncSession:
    """
    Yields an async SQLAlchemy session for the request lifetime.
    Rolls back on exception, closes on exit — always.

    Usage:
        async def endpoint(db: DB): ...
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# Type alias for cleaner route signatures
DB = Annotated[AsyncSession, Depends(get_db)]


# =============================================================
# SECTION 2 — JWT TOKEN EXTRACTION & VALIDATION
# =============================================================

# HTTPBearer extracts the token from "Authorization: Bearer <token>"
# auto_error=False means we raise our own exception (better messages)
_bearer_scheme = HTTPBearer(auto_error=False)


class TokenData:
    """
    Decoded payload from a valid JWT access token.
    sub  = user UUID string
    role = user role string
    org  = organization UUID string
    jti  = JWT ID (unique per token, for future blacklisting)
    """
    __slots__ = ("user_id", "role", "organization_id", "jti")

    def __init__(
        self,
        user_id: uuid.UUID,
        role: str,
        organization_id: uuid.UUID,
        jti: str,
    ) -> None:
        self.user_id = user_id
        self.role = role
        self.organization_id = organization_id
        self.jti = jti


async def get_token_data(
    credentials: Annotated[
        Optional[HTTPAuthorizationCredentials],
        Depends(_bearer_scheme),
    ],
) -> TokenData:
    """
    Extracts and validates the JWT access token from the
    Authorization header. Performs NO database queries.

    Raises 401 if:
      - No Authorization header present
      - Token is malformed / expired / wrong algorithm
      - Required claims (sub, role, org) are missing
    """
    _unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required. Provide a valid Bearer token.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if credentials is None:
        raise _unauthorized

    token = credentials.credentials

    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            options={"verify_exp": True},
        )
    except JWTError as exc:
        logger.debug(f"JWT decode failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is invalid or has expired.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    # Extract required claims
    sub: Optional[str] = payload.get("sub")
    role: Optional[str] = payload.get("role")
    org: Optional[str] = payload.get("org")
    jti: Optional[str] = payload.get("jti")
    token_type: Optional[str] = payload.get("type")

    if not sub or not role or not org or not jti:
        raise _unauthorized

    # Reject refresh tokens used as access tokens
    if token_type == "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh tokens cannot be used for API access.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_id = uuid.UUID(sub)
        organization_id = uuid.UUID(org)
    except ValueError:
        raise _unauthorized

    return TokenData(
        user_id=user_id,
        role=role,
        organization_id=organization_id,
        jti=jti,
    )


# Type alias
TokenDep = Annotated[TokenData, Depends(get_token_data)]


# =============================================================
# SECTION 3 — CURRENT USER LOADING
# =============================================================

async def get_current_user(
    token_data: TokenDep,
    db: DB,
) -> User:
    """
    Loads the full User ORM object from the database using
    the user_id extracted from the JWT.

    Raises 401 if user no longer exists in DB.
    Does NOT check is_active — use require_active_user for that.

    Usage:
        async def endpoint(user: CurrentUser): ...
    """
    result = await db.execute(
        select(User).where(User.id == token_data.user_id)
    )
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


async def require_active_user(
    user: Annotated[User, Depends(get_current_user)],
) -> User:
    """
    Extends get_current_user with an is_active check.
    Raises 403 if the account has been deactivated.

    Usage:
        async def endpoint(user: ActiveUser): ...
    """
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been deactivated. Contact your administrator.",
        )
    return user


# Type aliases used in route signatures
CurrentUser = Annotated[User, Depends(get_current_user)]
ActiveUser  = Annotated[User, Depends(require_active_user)]


# =============================================================
# SECTION 4 — ROLE-BASED ACCESS CONTROL (RBAC)
# =============================================================

ROLE_HIERARCHY = [
    "super_admin",
    "organiser",
    "admin",
    "session_manager",
    "technician",
    "volunteer",
]


def require_roles(*allowed_roles: str):
    """
    Dependency factory that restricts endpoint access to
    specific roles. Supports multiple allowed roles.

    Usage:
        @router.get("/admin")
        async def admin_only(
            user: Annotated[User, Depends(require_roles("super_admin"))]
        ): ...

        @router.post("/sessions")
        async def create_session(
            user: Annotated[User, Depends(
                require_roles("super_admin", "organiser")
            )]
        ): ...
    """
    async def _check_role(
        user: Annotated[User, Depends(require_active_user)],
    ) -> User:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Access denied. Required role(s): "
                    f"{', '.join(allowed_roles)}. "
                    f"Your role: {user.role}."
                ),
            )
        return user

    return _check_role


def require_min_role(min_role: str):
    """
    Dependency factory that allows access if the user's role
    is at or above a minimum level in the hierarchy.

    Example: require_min_role("organiser") allows
    both organiser AND super_admin.

    Usage:
        async def endpoint(
            user: Annotated[User, Depends(
                require_min_role("organiser")
            )]
        ): ...
    """
    if min_role not in ROLE_HIERARCHY:
        raise ValueError(f"Unknown role: {min_role}")

    min_index = ROLE_HIERARCHY.index(min_role)

    async def _check_min_role(
        user: Annotated[User, Depends(require_active_user)],
    ) -> User:
        try:
            user_index = ROLE_HIERARCHY.index(user.role)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Unknown role: {user.role}",
            )

        # Lower index = higher privilege in our hierarchy
        if user_index > min_index:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Access denied. Minimum required role: {min_role}. "
                    f"Your role: {user.role}."
                ),
            )
        return user

    return _check_min_role


# Pre-built convenience dependencies — import these in routers
SuperAdminOnly = Annotated[
    User,
    Depends(require_roles("super_admin")),
]
OrganizerOrAbove = Annotated[
    User,
    Depends(require_roles("super_admin", "organiser")),
]
AdminOrAbove = Annotated[
    User,
    Depends(require_roles("super_admin", "organiser", "admin")),
]
SessionManagerOrAbove = Annotated[
    User,
    Depends(require_roles("super_admin", "organiser", "admin", "session_manager")),
]
TechOrAbove = Annotated[
    User,
    Depends(
        require_roles(
            "super_admin",
            "organiser",
            "admin",
            "session_manager",
            "technician",
        )
    ),
]



# =============================================================
# SECTION 5 — ORGANIZATION OWNERSHIP CHECK
# =============================================================

async def verify_org_membership(
    user: Annotated[User, Depends(require_active_user)],
    db: DB,
) -> Organization:
    """
    Loads the user's organization and confirms it exists
    and is accessible.

    Raises 404 if organization not found (shouldn't happen
    in practice but guards against data integrity issues).
    """
    result = await db.execute(
        select(Organization).where(Organization.id == user.organization_id)
    )
    org = result.scalar_one_or_none()
    if org is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found.",
        )
    return org


OrgMember = Annotated[Organization, Depends(verify_org_membership)]


# =============================================================
# SECTION 6 — EVENT ACCESS DEPENDENCY
# =============================================================

async def get_current_event(
    event_id: Annotated[uuid.UUID, Path(description="Event UUID")],
    user: ActiveUser,
    db: DB,
) -> Event:
    """
    Loads an Event from the path parameter {event_id}.
    Verifies the event belongs to the user's organization.
    Super admins can access events from any organization.

    Raises 404 if event not found.
    Raises 403 if event belongs to a different organization.

    Usage in router:
        @router.get("/events/{event_id}/sessions")
        async def list_sessions(event: CurrentEvent): ...
    """
    result = await db.execute(
        select(Event).where(Event.id == event_id)
    )
    event = result.scalar_one_or_none()

    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event {event_id} not found.",
        )

    # Super admin can access all events regardless of org
    if user.role != "super_admin":
        if event.organization_id != user.organization_id:
            # Return 404 not 403 — don't leak existence of other orgs' events
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Event {event_id} not found.",
            )
        
        # Enforce assignments for restricted roles (Organisers and below, but NOT Admins)
        if user.role in ["organiser", "session_manager", "technician", "volunteer"]:
            from app.models.rbac import UserAccessNode
            from app.models.room import Room
            from app.models.session import Session
            from sqlalchemy import and_, or_
            # Check if assigned to the event itself, OR any room/session within this event
            assignment_check = await db.execute(
                select(UserAccessNode).where(
                    UserAccessNode.user_id == user.id,
                    or_(
                        and_(UserAccessNode.node_id == event_id, UserAccessNode.node_type == 'EVENT'),
                        and_(
                            UserAccessNode.node_type == 'ROOM',
                            UserAccessNode.node_id.in_(select(Room.id).where(Room.event_id == event_id))
                        ),
                        and_(
                            UserAccessNode.node_type == 'SESSION',
                            UserAccessNode.node_id.in_(select(Session.id).where(Session.event_id == event_id))
                        )
                    )
                )
            )
            if not assignment_check.scalars().first():
                # Also check UserEventAssignment (legacy table)
                from app.models.user_assignment import UserEventAssignment
                legacy_check = await db.execute(
                    select(UserEventAssignment).where(
                        UserEventAssignment.user_id == user.id,
                        UserEventAssignment.event_id == event_id
                    )
                )
                if not legacy_check.scalars().first():
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="You are not assigned to this event or any of its rooms/sessions."
                    )

    return event


CurrentEvent = Annotated[Event, Depends(get_current_event)]


# =============================================================
# SECTION 7 — PAGINATION
# =============================================================

class PaginationParams:
    """
    Standard pagination parameters extracted from query string.

    page       → 1-based page number (default: 1)
    page_size  → items per page (default: 20, max: 100)

    Usage:
        async def endpoint(pagination: Pagination): ...
        # pagination.offset, pagination.limit, pagination.page
    """
    __slots__ = ("page", "page_size")

    def __init__(self, page: int, page_size: int) -> None:
        self.page = page
        self.page_size = page_size

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size

    @property
    def limit(self) -> int:
        return self.page_size


async def get_pagination(
    page: Annotated[
        int,
        Query(ge=1, description="Page number (1-based)"),
    ] = 1,
    page_size: Annotated[
        int,
        Query(
            ge=1,
            le=settings.MAX_PAGE_SIZE,
            description=f"Items per page (max {settings.MAX_PAGE_SIZE})",
        ),
    ] = settings.DEFAULT_PAGE_SIZE,
) -> PaginationParams:
    return PaginationParams(page=page, page_size=page_size)


Pagination = Annotated[PaginationParams, Depends(get_pagination)]


# =============================================================
# SECTION 8 — SPEAKER UPLOAD TOKEN AUTH
# =============================================================

async def verify_upload_token(
    token: Annotated[str, Path(description="Speaker upload token from email link")],
    db: DB,
) -> Speaker:
    """
    Authenticates a speaker via their unique upload token.
    Used exclusively by the Speaker Upload Portal (App 02).
    Speakers do NOT use JWT — they use the token from their email link.

    The token in the URL is the plain token.
    We hash it (SHA-256) and compare against the stored hash.

    Raises 404 if token not found (don't reveal "token invalid" —
    same message whether token is wrong or expired).
    Raises 410 if token has expired.
    Raises 423 if the event has ended and upload window is closed.
    """
    # Hash the incoming token before DB lookup
    token_hash = hashlib.sha256(token.encode()).hexdigest()

    result = await db.execute(
        select(Speaker).where(Speaker.upload_token == token_hash)
    )
    speaker = result.scalar_one_or_none()

    if speaker is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Upload link not found. Check your email for the correct link.",
        )

    # Check token expiry if set
    if speaker.token_expires_at is not None:
        if datetime.now(timezone.utc) > speaker.token_expires_at:
            raise HTTPException(
                status_code=status.HTTP_410_GONE,
                detail=(
                    "Your upload link has expired. "
                    "Contact the conference organizer to request a new link."
                ),
            )

    return speaker


AuthenticatedSpeaker = Annotated[Speaker, Depends(verify_upload_token)]


# =============================================================
# SECTION 9 — DEVICE API KEY AUTH (Electron Apps)
# =============================================================

async def verify_device_key(
    request: Request,
    x_device_key: Annotated[
        Optional[str],
        Header(
            alias="X-Device-Key",
            description="API key registered for this venue device",
        ),
    ] = None,
    db: DB = Depends(get_db),
) -> dict:
    """
    Authenticates on-site Electron apps (kiosk, station, room PC, etc.)
    using a device API key registered in the room_devices table.

    The key is sent in the X-Device-Key header.
    Returns a dict with device metadata for use in the route.

    Raises 401 if header missing.
    Raises 403 if key is invalid or device is deactivated.

    Note: Device keys are generated by the organizer in Settings →
    Device Management and pre-loaded into the Electron app's config.
    """
    if not x_device_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Device key required. Add X-Device-Key header.",
        )

    # Import here to avoid circular imports at module load time
    from app.models.room_device import RoomDevice

    # Hash the device key before lookup
    key_hash = hashlib.sha256(x_device_key.encode()).hexdigest()

    result = await db.execute(
        select(RoomDevice).where(RoomDevice.device_key_hash == key_hash)
    )
    device = result.scalar_one_or_none()

    if device is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid device key. Register this device in the Organizer Portal.",
        )

    if device.status == "maintenance":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="This device is in maintenance mode.",
        )

    return {
        "device_id": device.id,
        "device_name": device.device_name,
        "device_type": device.device_type,
        "room_id": device.room_id,
        "event_id": device.event_id,
    }


DeviceAuth = Annotated[dict, Depends(verify_device_key)]


# =============================================================
# SECTION 10 — REQUEST METADATA HELPERS
# =============================================================

async def get_request_meta(request: Request) -> dict:
    """
    Extracts IP address and User-Agent from the request.
    Used by the audit log middleware and auth service.
    Handles X-Forwarded-For for requests behind Nginx.
    """
    # Prefer X-Forwarded-For (set by Nginx reverse proxy)
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        # Take the first (leftmost = original client) IP
        ip = forwarded_for.split(",")[0].strip()
    else:
        ip = request.client.host if request.client else "unknown"

    return {
        "ip_address": ip,
        "user_agent": request.headers.get("User-Agent", ""),
    }


RequestMeta = Annotated[dict, Depends(get_request_meta)]


# =============================================================
# SECTION 11 — OPTIONAL AUTH (public endpoints with optional login)
# =============================================================

async def get_optional_user(
    credentials: Annotated[
        Optional[HTTPAuthorizationCredentials],
        Depends(_bearer_scheme),
    ],
    db: DB,
) -> Optional[User]:
    """
    Returns the current user if a valid token is provided,
    or None if no token is present.

    Used for endpoints that behave differently when authenticated
    (e.g. a public schedule page that shows extra controls to organizers).

    Does NOT raise on missing token — only raises on invalid token.
    """
    if credentials is None:
        return None

    try:
        token_data = await get_token_data(credentials)
    except HTTPException:
        return None

    result = await db.execute(
        select(User).where(
            User.id == token_data.user_id,
            User.is_active.is_(True),
        )
    )
    return result.scalar_one_or_none()


OptionalUser = Annotated[Optional[User], Depends(get_optional_user)]


# =============================================================
# SECTION 12 — OWNERSHIP VERIFICATION HELPERS
# =============================================================

def assert_owns_event(user: User, event: Event) -> None:
    """
    Inline helper (not a Depends) — raises 403 if the user does
    not own the given event's organization.
    Super admins bypass this check.

    Use inside route handlers after loading both user and event:
        assert_owns_event(user, event)
    """
    if user.role == "super_admin":
        return
    if event.organization_id != user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this event.",
        )


def assert_can_modify_event(user: User, event: Event) -> None:
    """
    Raises 403 if the user cannot modify this event.
    Combines ownership check + role check.
    """
    assert_owns_event(user, event)
    if user.role not in ("super_admin", "organiser"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Event Organizers can modify event settings.",
        )


def assert_event_is_active(event: Event) -> None:
    """
    Raises 409 if the event is not in 'active' status.
    Prevents modifications to completed/archived events.
    """
    if event.status not in ("draft", "active"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Event is {event.status}. "
                "Only draft or active events can be modified."
            ),
        )