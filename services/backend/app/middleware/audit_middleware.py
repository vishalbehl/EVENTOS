import json
import re
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional, Dict, List, Tuple

from jose import JWTError, jwt
from loguru import logger
from sqlalchemy import select
from starlette.requests import Request
from starlette.types import ASGIApp

from app.config import settings
from app.database import Base, AsyncSessionLocal
from app.modules.audit.services.audit_service import AuditContext, AuditService


# Regex for UUIDs in paths
_UUID_PATTERN = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.IGNORECASE
)


def _extract_resource_type_and_id(path: str) -> Tuple[Optional[str], Optional[uuid.UUID]]:
    """
    Extracts resource_type and resource_id from a URL path.
    Finds the last UUID in the path as the resource_id and resolves the resource_type
    by filtering out UUID segments and resolving action suffixes.
    """
    uuids = _UUID_PATTERN.findall(path)
    resource_id = None
    if uuids:
        try:
            resource_id = uuid.UUID(uuids[-1])
        except ValueError:
            pass

    segments = [s for s in path.split("/") if s]
    if not segments:
        return "unknown", resource_id

    # Filter out UUIDs from segments to locate resource type name
    clean_segments = []
    for s in segments:
        if not _UUID_PATTERN.match(s):
            clean_segments.append(s)

    if not clean_segments:
        return "unknown", resource_id

    # The last clean segment is the primary candidate for resource type
    rtype = clean_segments[-1]

    # If the last clean segment is a known action suffix (e.g. approve), look at the preceding segment
    action_keywords = {"approve", "reject", "lock", "unlock", "login", "logout", "import", "send", "checkin", "end"}
    if rtype in action_keywords and len(clean_segments) > 1:
        rtype = clean_segments[-2]

    # Singularize plurals (e.g. events -> event, speakers -> speaker)
    if rtype.endswith("s") and len(rtype) > 1:
        rtype = rtype[:-1]

    return rtype, resource_id


def _derive_action(method: str, path: str, status_code: int) -> str:
    """
    Derives action type verb based on method and path.
    """
    method = method.upper()
    path_lower = path.lower()

    if method == "DELETE":
        return "deleted"
    if method == "POST":
        if "approve" in path_lower:
            return "approved"
        if "reject" in path_lower:
            return "rejected"
        if "lock" in path_lower:
            return "locked"
        if "unlock" in path_lower:
            return "unlocked"
        if "login" in path_lower:
            return "login"
        if "logout" in path_lower:
            return "logout"
        if "import" in path_lower:
            return "imported"
        if "send" in path_lower or "campaign" in path_lower:
            return "sent"
        if "checkin" in path_lower:
            return "checked_in"
        return "created"
    if method in ("PUT", "PATCH"):
        return "updated"
    return "modified"


def _extract_jwt_claims(authorization: Optional[str]) -> Tuple[Optional[uuid.UUID], Optional[str], Optional[uuid.UUID], Optional[uuid.UUID]]:
    """
    Decodes the Bearer JWT and returns (user_id, role, organization_id, impersonator_id)
    """
    if not authorization or not authorization.startswith("Bearer "):
        return None, None, None, None
    token = authorization[7:]
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            options={"verify_exp": False},
        )
        sub = payload.get("sub")
        role = payload.get("role")
        org = payload.get("org") or payload.get("organization_id")
        impersonator_id = payload.get("impersonator_id")

        user_id = uuid.UUID(sub) if sub else None
        org_id = uuid.UUID(org) if org else None
        imp_id = uuid.UUID(impersonator_id) if impersonator_id else None
        return user_id, role, org_id, imp_id
    except (JWTError, ValueError):
        return None, None, None, None


def _get_client_ip(request: Request) -> Optional[str]:
    """Respects proxy headers for client IP extraction."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


def get_model_by_name(name: str) -> Optional[type]:
    """
    Resolves resource type string to a SQLAlchemy model.
    """
    name = name.lower()
    
    # Import main models to ensure they are loaded in mapper registry
    from app.modules.identity.models.user import User
    from app.modules.events.models.event import Event
    from app.modules.events.models.speaker import Speaker

    mapping = {
        "user": User,
        "event": Event,
        "speaker": Speaker,
    }
    if name in mapping:
        return mapping[name]

    # Dynamically search through SQLAlchemy Base registry
    for mapper in Base.registry.mappers:
        cls = mapper.class_
        if cls.__name__.lower() == name or cls.__tablename__.lower() == name or cls.__tablename__.lower() == name + "s":
            return cls
    return None


def serialize_model(instance) -> Dict[str, Any]:
    """
    Helper to serialize SQLAlchemy models to a dictionary of primitive JSON types.
    """
    if not instance:
        return {}
    data = {}
    for col in instance.__mapper__.columns:
        val = getattr(instance, col.name)
        if isinstance(val, uuid.UUID):
            data[col.name] = str(val)
        elif isinstance(val, datetime):
            data[col.name] = val.isoformat()
        else:
            data[col.name] = val
    return data


def make_json_diff(old: Any, new: Any, path: str = "") -> List[Dict[str, Any]]:
    """
    Generates a recursive JSON patch (RFC 6902) between old and new state.
    """
    patches = []
    
    # Standardize None values to empty dicts for comparison
    if old is None:
        old = {}
    if new is None:
        new = {}

    if isinstance(old, dict) and isinstance(new, dict):
        # Keys removed
        for k in old.keys():
            if k not in new:
                patches.append({"op": "remove", "path": f"{path}/{k}"})
        # Keys added/updated
        for k, v in new.items():
            if k not in old:
                patches.append({"op": "add", "path": f"{path}/{k}", "value": v})
            else:
                patches.extend(make_json_diff(old[k], v, f"{path}/{k}"))
    elif isinstance(old, list) and isinstance(new, list):
        if old != new:
            patches.append({"op": "replace", "path": path, "value": new})
    else:
        if old != new:
            patches.append({"op": "replace", "path": path, "value": new})
            
    return patches


def _derive_retention(resource_type: str, action_type: str) -> datetime:
    """
    Sets retention_until: 7 years for financial records, 2 years otherwise.
    """
    r_type = (resource_type or "").lower()
    a_type = (action_type or "").lower()
    financial_keywords = {"billing", "invoice", "payment", "subscription", "transaction", "stripe", "charge", "refund", "pricing"}
    is_financial = any(kw in r_type or kw in a_type for kw in financial_keywords)
    years = 7 if is_financial else 2
    return datetime.now(timezone.utc) + timedelta(days=years * 365)


def _derive_sensitivity(resource_type: str, action_type: str) -> bool:
    """
    Flags audit log as sensitive if it targets identity, billing, or rbac schemas.
    """
    r_type = (resource_type or "").lower()
    a_type = (action_type or "").lower()
    sensitive_keywords = {
        "user", "role", "permission", "assignment", "auth", "credential", 
        "secret", "token", "key", "stripe", "billing", "subscription",
        "allowed_ips", "ip_allowlist", "rbac"
    }
    return any(kw in r_type or kw in a_type for kw in sensitive_keywords)


class AuditMiddleware:
    """
    ASGI Middleware to intercept mutating requests (POST, PUT, PATCH, DELETE),
    capture old and new state snapshots, generate diffs, and log to audit trail.
    """
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: dict, receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        method = scope.get("method", "")
        path = scope.get("path", "")

        # Skip GET, HEAD, OPTIONS and public/telemetry endpoints
        if method not in {"POST", "PUT", "PATCH", "DELETE"}:
            await self.app(scope, receive, send)
            return

        skip_prefixes = {"/health", "/docs", "/auth/refresh", "/openapi.json", "/redoc", "/ws"}
        if any(path.startswith(prefix) for prefix in skip_prefixes):
            await self.app(scope, receive, send)
            return

        # Extract path-level resource type and ID
        resource_type, resource_id = _extract_resource_type_and_id(path)
        if not resource_type:
            # Fallback to the root path segment if no UUID is in the path
            segments = [s for s in path.split("/") if s]
            resource_type = segments[0] if segments else "unknown"
            if resource_type.endswith("s") and len(resource_type) > 1:
                resource_type = resource_type[:-1]

        # 1. Fetch BEFORE state snapshot for mutations (PUT, PATCH, DELETE)
        old_state = None
        if method in {"PUT", "PATCH", "DELETE"} and resource_id:
            try:
                model_cls = get_model_by_name(resource_type)
                if model_cls:
                    async with AsyncSessionLocal() as db:
                        stmt = select(model_cls).where(model_cls.id == resource_id)
                        res = await db.execute(stmt)
                        instance = res.scalar_one_or_none()
                        if instance:
                            old_state = serialize_model(instance)
            except Exception as e:
                logger.warning(f"[AuditMiddleware] Failed to fetch old state: {e}")

        # Capture response start status and body
        status_code = [0]
        response_body = []

        async def send_wrapper(message: dict) -> None:
            if message["type"] == "http.response.start":
                status_code[0] = message.get("status", 0)
            elif message["type"] == "http.response.body":
                body = message.get("body", b"")
                response_body.append(body)
            await send(message)

        # 2. Run request pipeline
        start_time = time.monotonic()
        await self.app(scope, receive, send_wrapper)
        elapsed_ms = int((time.monotonic() - start_time) * 1000)

        # 3. Handle logs only for successful 2xx responses
        if 200 <= status_code[0] < 300:
            try:
                # Reconstruct Response Body
                body_bytes = b"".join(response_body)
                after_state = None
                try:
                    after_state = json.loads(body_bytes.decode("utf-8"))
                except Exception:
                    pass

                # If resource_id was not in the path (e.g. POST), try to extract it from the response body
                if not resource_id and isinstance(after_state, dict):
                    id_val = after_state.get("id")
                    if id_val:
                        try:
                            resource_id = uuid.UUID(str(id_val))
                        except ValueError:
                            pass

                # Fallback resource ID
                if not resource_id:
                    resource_id = uuid.uuid4()

                # Generate JSON Diff
                diff = make_json_diff(old_state, after_state)

                # Fetch Headers and Trace Metadata
                request = Request(scope)
                authorization = request.headers.get("Authorization")
                user_id, role, org_id, impersonator_id = _extract_jwt_claims(authorization)
                
                actor_ip = _get_client_ip(request)
                actor_user_agent = request.headers.get("User-Agent")
                
                request_id = None
                req_id_hdr = request.headers.get("X-Request-ID")
                if req_id_hdr:
                    try:
                        request_id = uuid.UUID(req_id_hdr)
                    except ValueError:
                        pass
                
                correlation_id = None
                corr_id_hdr = request.headers.get("X-Correlation-ID")
                if corr_id_hdr:
                    try:
                        correlation_id = uuid.UUID(corr_id_hdr)
                    except ValueError:
                        pass

                # Build and dispatch Context
                ctx = AuditContext(
                    action_type=_derive_action(method, path, status_code[0]),
                    resource_type=resource_type,
                    resource_id=resource_id,
                    actor_user_id=user_id,
                    organization_id=org_id,
                    impersonated_by=impersonator_id,
                    actor_role=role,
                    old_state=old_state,
                    new_state=after_state if isinstance(after_state, dict) else None,
                    change_diff=diff if diff else None,
                    actor_ip=actor_ip,
                    actor_user_agent=actor_user_agent,
                    geo_location=None, # lookup via geoip when available
                    is_sensitive=_derive_sensitivity(resource_type, method),
                    request_id=request_id,
                    correlation_id=correlation_id,
                    occurred_at=datetime.now(timezone.utc),
                    retention_until=_derive_retention(resource_type, method)
                )

                await AuditService.write_log(ctx)
            except Exception as exc:
                logger.warning(f"[AuditMiddleware] Processing failed ({elapsed_ms}ms): {exc}")
