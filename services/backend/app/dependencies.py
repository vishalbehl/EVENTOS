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
from typing import Annotated, AsyncIterator, List, Optional

from fastapi import Depends, Header, HTTPException, Path, Query, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionLocal, tenant_org_id

# ── Model imports ─────────────────────────────────────────
from app.modules.events.models.event import Event
from app.modules.platform.models.organization import Organization
from app.modules.identity.models.refresh_token import RefreshToken
from app.modules.events.models.speaker import Speaker
from app.modules.identity.models.user import User


# These handlers independently validate their requested scope or operate only on
# authenticated identity. Match the resolved handler, never caller-controlled
# URL substrings: adding an access/workspace route must not grant an exemption.
_IDENTITY_CONTEXT_ENDPOINTS = frozenset({
    ("app.modules.rbac.routers.access_foundation", "contexts"),
    ("app.modules.rbac.routers.access_foundation", "select_context"),
    ("app.modules.rbac.routers.access_foundation", "bootstrap"),
    ("app.modules.rbac.routers.access_foundation", "workspaces"),
    ("app.modules.rbac.routers.access_foundation", "create_workspace"),
    ("app.modules.rbac.routers.access_foundation", "update_workspace"),
    ("app.modules.rbac.routers.access_foundation", "workspace_events"),
    ("app.modules.rbac.routers.access_foundation", "change_event_workspace"),
    ("app.modules.rbac.routers.access_foundation", "workspace_members"),
    ("app.modules.rbac.routers.access_foundation", "change_workspace_member"),
    ("app.modules.rbac.routers.access_foundation", "ownership_candidates"),
    ("app.modules.rbac.routers.organisations", "invitation_preview"),
    ("app.modules.rbac.routers.organisations", "accept_invite"),
    ("app.modules.identity.routers.auth", "logout"),
    ("app.modules.identity.routers.auth", "get_me"),
})


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
    from app.core.tenant_context import TenantContextGuard
    async with AsyncSessionLocal() as session:
        org_id = tenant_org_id.get()
        await TenantContextGuard.apply(session, org_id)
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
    __slots__ = (
        "user_id", "role", "organization_id", "jti", "amr", "auth_time",
        "impersonator_id", "impersonation_session_id", "auth_revision",
        "session_id", "access_mode", "active_organization_id",
        "acting_organization_id", "active_workspace_id", "active_event_id",
        "relationship_id",
    )

    def __init__(
        self,
        user_id: uuid.UUID,
        role: str,
        organization_id: uuid.UUID,
        jti: str,
        amr: tuple[str, ...] = (),
        auth_time: Optional[datetime] = None,
        impersonator_id: Optional[uuid.UUID] = None,
        impersonation_session_id: Optional[uuid.UUID] = None,
        auth_revision: int | None = None,
        session_id: Optional[uuid.UUID] = None,
        access_mode: str = "DIRECT",
        active_organization_id: Optional[uuid.UUID] = None,
        acting_organization_id: Optional[uuid.UUID] = None,
        active_workspace_id: Optional[uuid.UUID] = None,
        active_event_id: Optional[uuid.UUID] = None,
        relationship_id: Optional[uuid.UUID] = None,
    ) -> None:
        self.user_id = user_id
        self.role = role
        self.organization_id = organization_id
        self.jti = jti
        self.amr = amr
        self.auth_time = auth_time
        self.impersonator_id = impersonator_id
        self.impersonation_session_id = impersonation_session_id
        self.auth_revision = auth_revision
        self.session_id = session_id
        self.access_mode = access_mode
        self.active_organization_id = active_organization_id or organization_id
        self.acting_organization_id = acting_organization_id or self.active_organization_id
        self.active_workspace_id = active_workspace_id
        self.active_event_id = active_event_id
        self.relationship_id = relationship_id


async def get_token_data(
    request: Request,
    credentials: Annotated[
        Optional[HTTPAuthorizationCredentials],
        Depends(_bearer_scheme),
    ] = None,
) -> TokenData:
    """
    Extracts and validates the JWT access token from the
    Authorization header, or resolves Developer credentials.
    """
    # 0. Check if authenticated via Developer API Gateway middleware
    user_role = getattr(request.state, "user_role", None)
    org_id = getattr(request.state, "org_id", None)
    token_valid = getattr(request.state, "token_valid", False)

    if user_role == "developer" and token_valid and org_id:
        return TokenData(
            user_id=getattr(request.state, "user_id", None),
            role="developer",
            organization_id=org_id,
            jti="developer",
            amr=("api_key",),
        )

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
    auth_revision = payload.get("auth_revision")
    amr_claim = payload.get("amr") or []
    auth_time_claim = payload.get("auth_time")
    impersonator_claim = payload.get("impersonator_id")
    impersonation_session_claim = payload.get("impersonation_session_id")
    session_claim = payload.get("sid")
    access_mode = payload.get("ctx_mode") or "DIRECT"
    active_org_claim = payload.get("ctx_org") or org
    acting_org_claim = payload.get("ctx_actor_org") or active_org_claim
    workspace_claim = payload.get("ctx_ws")
    event_claim = payload.get("ctx_event")
    relationship_claim = payload.get("ctx_rel")

    if not sub or not role or not org or not jti:
        raise _unauthorized
    if type(auth_revision) is not int or auth_revision < 1 or token_type != "access":
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
        impersonator_id = uuid.UUID(impersonator_claim) if impersonator_claim else None
        impersonation_session_id = uuid.UUID(impersonation_session_claim) if impersonation_session_claim else None
        session_id = uuid.UUID(session_claim) if session_claim else None
        active_organization_id = uuid.UUID(active_org_claim)
        acting_organization_id = uuid.UUID(acting_org_claim)
        active_workspace_id = uuid.UUID(workspace_claim) if workspace_claim else None
        active_event_id = uuid.UUID(event_claim) if event_claim else None
        relationship_id = uuid.UUID(relationship_claim) if relationship_claim else None
    except ValueError:
        raise _unauthorized

    if access_mode not in {"DIRECT", "DELEGATED"}:
        raise _unauthorized
    if access_mode == "DIRECT":
        if (acting_organization_id != active_organization_id or relationship_id is not None or
                active_event_id is not None):
            raise _unauthorized
    elif (session_id is None or active_workspace_id is None or relationship_id is None or
          acting_organization_id == active_organization_id):
        raise _unauthorized

    auth_time = None
    if auth_time_claim is not None:
        try:
            auth_time = datetime.fromtimestamp(int(auth_time_claim), tz=timezone.utc)
        except (TypeError, ValueError, OSError):
            raise _unauthorized

    if impersonator_id:
        if not impersonation_session_id:
            raise _unauthorized
        try:
            from app.redis import coordination_client as redis_client
            active = await redis_client.get(f"impersonation:session:{impersonation_session_id}")
        except Exception as exc:
            logger.error(f"Impersonation session validation unavailable: {type(exc).__name__}")
            raise HTTPException(status_code=503, detail="Impersonation session validation is unavailable") from exc
        if active != str(impersonator_id):
            raise HTTPException(status_code=401, detail="Impersonation session has expired or was revoked")

    return TokenData(
        user_id=user_id,
        role=role,
        organization_id=organization_id,
        jti=jti,
        amr=tuple(str(item) for item in amr_claim),
        auth_time=auth_time,
        impersonator_id=impersonator_id,
        impersonation_session_id=impersonation_session_id,
        auth_revision=auth_revision,
        session_id=session_id,
        access_mode=access_mode,
        active_organization_id=active_organization_id,
        acting_organization_id=acting_organization_id,
        active_workspace_id=active_workspace_id,
        active_event_id=active_event_id,
        relationship_id=relationship_id,
    )


# Type alias
TokenDep = Annotated[TokenData, Depends(get_token_data)]


# =============================================================
# SECTION 3 — CURRENT USER LOADING
# =============================================================

async def get_current_user(
    request: Request,
    token_data: TokenDep,
    db: DB,
) -> User:
    """
    Loads the full User ORM object from the database using
    the user_id extracted from the JWT.
    """
    # Authenticate the immutable identity inside its own tenant before any
    # delegated operational selector is applied. Dependency graphs may resolve
    # this function more than once; a prior resolver can already have selected
    # the client tenant, which must never hide or replace the acting identity.
    from app.core.tenant_context import TenantContextGuard
    identity_context = tenant_org_id.set(token_data.organization_id)
    try:
        await TenantContextGuard.apply(db, token_data.organization_id)

        if token_data.role == "developer":
            # Resolve user if present (OAuth2 flow)
            if token_data.user_id:
                from sqlalchemy.orm import selectinload
                result = await db.execute(
                    select(User).options(selectinload(User.organization)).where(User.id == token_data.user_id)
                )
                user = result.scalar_one_or_none()
                if user:
                    return user

            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Service identities cannot use user-authorized endpoints.",
            )

        from sqlalchemy.orm import selectinload
        result = await db.execute(
            select(User).options(selectinload(User.organization)).where(User.id == token_data.user_id)
        )
        user = result.scalar_one_or_none()
    finally:
        tenant_org_id.reset(identity_context)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # The immutable identity tenant remains bound to the token. The operational
    # tenant selector is validated separately below and never replaces this
    # identity check.
    if user.organization_id != token_data.organization_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token tenant does not match the user account.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if user.deleted_at is not None or not user.is_active or user.auth_revision != token_data.auth_revision:
        raise HTTPException(status_code=401, detail="Session revoked. Sign in again.",
            headers={"WWW-Authenticate": "Bearer"})

    # Identity-only endpoints must remain available when a formerly selected
    # delegated context is revoked, allowing the user to enumerate and select a
    # still-authorised context or end the session. Every customer-resource path
    # revalidates accepted membership / active delegation before its first
    # business query, then binds PostgreSQL RLS to the validated target tenant.
    endpoint = request.scope.get("endpoint")
    is_identity_only = (
        getattr(endpoint, "__module__", None),
        getattr(endpoint, "__name__", None),
    ) in _IDENTITY_CONTEXT_ENDPOINTS
    is_platform_identity = bool(
        user.organization is not None and user.organization.is_platform_org
    )
    if not is_identity_only and not is_platform_identity:
        from app.modules.rbac.services.access_contexts import validate_request_selector

        await validate_request_selector(db, user, token_data)
        # Keep the validated selector active for the rest of the request. The
        # outer TenantContextMiddleware owns the reset, including error paths.
        tenant_org_id.set(token_data.active_organization_id)
        await TenantContextGuard.apply(db, token_data.active_organization_id)
        db.info["customer_request_selector_validated"] = (
            token_data,
            db.sync_session.get_transaction(),
        )
    # Request-scoped compatibility adapter for legacy services that receive the
    # ORM identity but not TokenDep. This is an unmapped Python attribute and is
    # never persisted; protected customer paths reached this point only after
    # the live validation above.
    user._request_token_data = token_data
    if not is_platform_identity and not is_identity_only:
        db.info["customer_request_identity"] = user.id
        db.info["customer_request_selector"] = token_data
    return user


async def require_step_up(token_data: TokenDep) -> TokenData:
    if not settings.ENFORCE_PRIVILEGED_MFA and not settings.is_production:
        return token_data
    if "mfa" not in token_data.amr or token_data.auth_time is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "STEP_UP_REQUIRED", "message": "Recent MFA authentication is required."},
        )
    age = (datetime.now(timezone.utc) - token_data.auth_time).total_seconds()
    if age < 0 or age > settings.MFA_STEP_UP_MAX_AGE_SECONDS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "STEP_UP_REQUIRED", "message": "MFA assurance has expired."},
        )
    return token_data


StepUpAuth = Annotated[TokenData, Depends(require_step_up)]


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
    "registration_manager",
    "registration_coordinator",
    "registration_reviewer",
    "badge_manager",
    "checkin_staff",
    "registration_viewer",
    "speaker_manager",
    "session_manager",
    "room_manager",
    "venue_operator",
    "technician",
    "volunteer",
    "viewer",
]


async def require_platform_administrator(request: Request, response: Response, token: TokenDep,
    user: Annotated[User, Depends(require_active_user)], db: DB) -> User:
    # Lazy import avoids a dependency/module cycle. Delegate to the same current
    # platform permission admission used by canonical platform endpoints.
    from app.modules.rbac.services.platform_permissions import require_platform_permission
    admission = require_platform_permission("platform:administration:manage")
    return await admission(request=request, response=response, token=token, user=user, db=db)


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
    if frozenset(allowed_roles) == {"super_admin"}:
        return require_platform_administrator

    async def _check_role(
        user: Annotated[User, Depends(require_active_user)],
        token_data: TokenDep,
        db: DB,
    ) -> User:
        org_id = token_data.acting_organization_id or token_data.organization_id
        if org_id and user.role != "super_admin":
            from app.modules.rbac.services.permission_service import get_user_permissions
            perms = await get_user_permissions(
                db, user.id, event_id=token_data.active_event_id,
                organization_id=org_id, workspace_id=token_data.active_workspace_id,
            )
            if not perms:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail={"code": "PERMISSION_DENIED", "message": "No active permissions in selected tenant scope."},
                )
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


def require_scoped_permission(action: str):
    """
    Authoritative action permission check against the active tenant context.
    Resolves grants through membership, role, team, and explicit scope with denials winning.
    """
    async def _check_permission(
        user: Annotated[User, Depends(require_active_user)],
        token_data: TokenDep,
        db: DB,
    ) -> User:
        org_id = token_data.acting_organization_id or token_data.organization_id
        workspace_id = token_data.active_workspace_id
        event_id = token_data.active_event_id

        from app.modules.rbac.services.permission_service import get_user_permissions
        permissions = await get_user_permissions(
            db, user.id, event_id=event_id,
            organization_id=org_id, workspace_id=workspace_id,
        )
        if action not in permissions:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "PERMISSION_DENIED", "required_action": action, "message": f"Action {action} is not permitted for your current scope."},
            )
        return user

    return _check_permission


def require_scoped_permissions(*actions: str):
    """
    Authoritative permission check requiring all specified actions to be granted.
    """
    async def _check_permissions(
        user: Annotated[User, Depends(require_active_user)],
        token_data: TokenDep,
        db: DB,
    ) -> User:
        org_id = token_data.acting_organization_id or token_data.organization_id
        workspace_id = token_data.active_workspace_id
        event_id = token_data.active_event_id

        from app.modules.rbac.services.permission_service import get_user_permissions
        permissions = set(await get_user_permissions(
            db, user.id, event_id=event_id,
            organization_id=org_id, workspace_id=workspace_id,
        ))
        missing = [act for act in actions if act not in permissions]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "PERMISSION_DENIED", "missing_actions": missing, "message": f"Missing required action(s): {', '.join(missing)}."},
            )
        return user

    return _check_permissions



# =============================================================
# SECTION 5 — ORGANIZATION OWNERSHIP CHECK
# =============================================================

async def verify_org_membership(
    user: Annotated[User, Depends(require_active_user)],
    token_data: TokenDep,
    db: DB,
) -> Organization:
    """
    Loads the user's organization and confirms it exists
    and is accessible.

    Raises 404 if organization not found (shouldn't happen
    in practice but guards against data integrity issues).
    """
    from app.modules.rbac.services.access_contexts import selected_request_context
    async with selected_request_context(db, user, token_data, event_id=token_data.active_event_id):
        result = await db.execute(
            select(Organization).where(Organization.id == token_data.active_organization_id)
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
    token_data: TokenDep,
    db: DB,
) -> Event:
    """
    Loads an Event from the path parameter {event_id}.
    Verifies live membership/delegation and event scope in the selected organisation.

    Raises 404 if event not found.
    Foreign or unassigned events return concealed 404. Platform inspection uses
    separate, explicitly authorised platform endpoints.

    Usage in router:
        @router.get("/events/{event_id}/sessions")
        async def list_sessions(event: CurrentEvent): ...
    """
    from app.modules.rbac.services.event_scope import customer_event
    # Global/platform labels are not customer membership. Action checks remain separate.
    return await customer_event(db, user, event_id, token_data)


CurrentEvent = Annotated[Event, Depends(get_current_event)]


def current_event_for_action(action: str):
    """Return an event dependency using the route's explicit scoped action.

    The generic event dependency deliberately requires delegated EVENTS:VIEW.
    A route with a narrower client-approved delegation must name that action so
    container loading does not accidentally require an unrelated permission.
    """
    from app.modules.rbac.services.permission_catalogue import canonical_action

    permission = canonical_action(action)
    if permission is None:
        raise ValueError(f"Unknown customer action: {action}")

    async def dependency(
        event_id: Annotated[uuid.UUID, Path(description="Event UUID")],
        user: ActiveUser,
        token_data: TokenDep,
        db: DB,
    ) -> Event:
        from app.modules.rbac.services.event_scope import customer_event

        return await customer_event(
            db, user, event_id, token_data, action=permission
        )

    return dependency


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
    db: DB,
    x_device_key: Annotated[
        Optional[str],
        Header(
            alias="X-Device-Key",
            description="API key registered for this venue device",
        ),
    ] = None,
) -> AsyncIterator[dict]:
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
    from app.modules.venue.models.room_device import RoomDevice

    # Hash the device key before lookup
    key_hash = hashlib.sha256(x_device_key.encode()).hexdigest()

    result = await db.execute(
        select(RoomDevice)
        .where(RoomDevice.device_key_hash == key_hash)
        .execution_options(skip_tenant_filter=True)
    )
    device = result.scalar_one_or_none()

    if device is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid device key. Register this device in the Command Center.",
        )

    now = datetime.now(timezone.utc)
    if device.device_key_revoked_at is not None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Device key has been revoked.")
    if device.device_key_expires_at is not None and device.device_key_expires_at <= now:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Device key has expired.")
    if device.status == "maintenance" or device.trust_status != "TRUSTED" or device.compromise_detected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="This device is in maintenance mode.",
        )

    context_token = tenant_org_id.set(device.organization_id)
    from app.core.tenant_context import TenantContextGuard
    await TenantContextGuard.apply(db, device.organization_id)
    try:
        yield {
            "device_id": device.id,
            "organization_id": device.organization_id,
            "device_name": device.device_name,
            "device_type": device.device_type,
            "room_id": device.room_id,
            "event_id": device.event_id,
        }
    finally:
        tenant_org_id.reset(context_token)


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
    No platform/global role bypass is permitted. This is ownership only, not a
    substitute for accepted membership and the canonical permission decision.

    Use inside route handlers after loading both user and event:
        assert_owns_event(user, event)
    """
    if event.organization_id != user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "RESOURCE_NOT_FOUND"},
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
