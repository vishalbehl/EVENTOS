# =============================================================
# Conference Platform — Audit Log Middleware
# backend/app/middleware/audit_log.py
#
# Automatically appends an AuditLog record for every mutating
# HTTP request (POST, PUT, PATCH, DELETE) that completes with
# a 2xx or 3xx status code.
#
# Design principles:
#   - Never blocks or fails the response — errors are swallowed
#     and logged via loguru.
#   - Does NOT re-parse the request body (no buffering overhead).
#     The entity_id and entity_type are extracted from the path
#     using a regex pattern.
#   - The `user_id` is extracted from the decoded JWT in the
#     Authorization header (no DB hit inside middleware).
#   - Runs AFTER the route handler completes (response phase).
#
# Path → entity_type extraction examples:
#   POST /events                    → entity_type=event
#   PUT  /events/{uuid}/speakers    → entity_type=speaker, entity_id={uuid}
#   DELETE /speakers/{uuid}         → entity_type=speaker, entity_id={uuid}
# =============================================================

from __future__ import annotations

import re
import time
import uuid
from datetime import datetime, timezone
from typing import Optional, Any

from jose import JWTError, jwt
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.audit_log import AuditLog
from app.models.api_request_log import APIRequestLog


# ── Route → entity type mapping ───────────────────────────────
# Maps URL path segments to entity_type values used in audit logs.
# Order matters — more specific patterns first.

_ENTITY_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"/speakers"), "speaker"),
    (re.compile(r"/sessions"), "session"),
    (re.compile(r"/rooms(?:/devices)?"), "room"),
    (re.compile(r"/files"), "file"),
    (re.compile(r"/import"), "import_job"),
    (re.compile(r"/campaigns"), "campaign"),
    (re.compile(r"/posters"), "poster"),
    (re.compile(r"/devices"), "device"),
    (re.compile(r"/events"), "event"),
    (re.compile(r"/users"), "user"),
    (re.compile(r"/auth"), "user"),
    (re.compile(r"/queue"), "queue"),
    (re.compile(r"/srr"), "station"),
]

# Regex to extract the first UUID in a path (the entity being acted on)
_UUID_PATTERN = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.IGNORECASE
)

# HTTP methods that mutate state — only these are audited
_MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


# ── Action verb derivation ────────────────────────────────────

def _derive_action(method: str, path: str, status_code: int) -> str:
    """
    Map HTTP method + path to a past-tense action verb for the audit log.
    Falls back to 'modified' if no specific mapping matches.
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


def _extract_entity(path: str) -> tuple[str, Optional[uuid.UUID]]:
    """
    Extract entity_type and entity_id from a URL path.

    Returns:
        (entity_type, entity_id | None)
    """
    entity_type = "unknown"
    for pattern, etype in _ENTITY_PATTERNS:
        if pattern.search(path):
            entity_type = etype
            break

    # Try to extract entity UUID from path
    uuids = _UUID_PATTERN.findall(path)
    entity_id: Optional[uuid.UUID] = None
    if uuids:
        try:
            entity_id = uuid.UUID(uuids[-1])  # last UUID is most specific entity
        except ValueError:
            pass

    return entity_type, entity_id


def _extract_user_from_jwt(authorization: Optional[str]) -> Optional[uuid.UUID]:
    """
    Extract user_id from the Bearer JWT without making a DB call.
    Returns None if no valid token or token is malformed.
    """
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization[7:]
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            options={"verify_exp": False},   # don't re-validate expiry; route already did
        )
        sub = payload.get("sub")
        return uuid.UUID(sub) if sub else None
    except (JWTError, ValueError):
        return None


def _get_client_ip(request: Request) -> Optional[str]:
    """Extract client IP, respecting X-Forwarded-For from reverse proxy."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


# ── Middleware class ──────────────────────────────────────────

class AuditLogMiddleware:
    """
    ASGI middleware that writes an AuditLog record after every
    successful mutating API request.
    """
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: dict, receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        method = scope.get("method")
        if method not in _MUTATING_METHODS:
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        if path.startswith("/ws") or path == "/health":
            await self.app(scope, receive, send)
            return

        # We need to capture the status code from the response
        status_code = [0]

        async def send_wrapper(message: dict) -> None:
            if message["type"] == "http.response.start":
                status_code[0] = message.get("status", 0)
            await send(message)

        start = time.monotonic()
        await self.app(scope, receive, send_wrapper)
        elapsed_ms = int((time.monotonic() - start) * 1000)

        # Only audit successful mutations (2xx / 3xx)
        if 200 <= status_code[0] < 400:
            try:
                request = Request(scope)
                await self._write_audit(request, status_code[0])
            except Exception as exc:
                logger.warning(f"AuditLogMiddleware write failed ({elapsed_ms}ms): {exc}")

    async def _write_audit(self, request: Request, status_code: int) -> None:
        path = request.url.path
        entity_type, entity_id = _extract_entity(path)
        action = _derive_action(request.method, path, status_code)
        user_id = _extract_user_from_jwt(request.headers.get("Authorization"))
        ip_address = _get_client_ip(request)
        user_agent = request.headers.get("User-Agent")
        
        # Extract Trace IDs
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        correlation_id = request.headers.get("X-Correlation-ID")

        # Use a fresh session — middleware runs outside the request's DI session
        async with AsyncSessionLocal() as db:
            log = AuditLog(
                user_id=user_id,
                entity_type=entity_type,
                entity_id=entity_id or uuid.uuid4(),
                action=action,
                ip_address=ip_address,
                user_agent=user_agent,
                occurred_at=datetime.now(timezone.utc),
                request_id=request_id,
                correlation_id=correlation_id,
                severity="INFO" if status_code < 400 else "WARNING",
                # future: geo_metadata lookup via GeoIP
            )
            db.add(log)
            await db.commit()
            
            # Also log to api_request_logs for performance tracking
            # (Note: In a high-load environment, we might do this in a background task)
            # api_log = APIRequestLog(...) 
            # db.add(api_log)
            # await db.commit()
