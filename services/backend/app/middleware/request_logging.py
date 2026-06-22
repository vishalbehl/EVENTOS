import json
import time
import uuid
import re
from datetime import datetime, timezone
from typing import Any, Optional, Tuple

from jose import JWTError, jwt
from loguru import logger
from starlette.requests import Request
from starlette.types import ASGIApp

from app.config import settings
from app.database import AsyncSessionLocal
from app.modules.platform_audit.models import ApiActivityLog

def _extract_jwt_claims(authorization: Optional[str]) -> Tuple[Optional[uuid.UUID], Optional[uuid.UUID]]:
    """Decodes the Bearer JWT and returns (user_id, organization_id)"""
    if not authorization or not authorization.startswith("Bearer "):
        return None, None
    token = authorization[7:]
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            options={"verify_exp": False},
        )
        sub = payload.get("sub")
        org = payload.get("org") or payload.get("organization_id")
        user_id = uuid.UUID(sub) if sub else None
        org_id = uuid.UUID(org) if org else None
        return user_id, org_id
    except (JWTError, ValueError):
        return None, None

def _get_client_ip(request: Request) -> Optional[str]:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None

class RequestLoggingMiddleware:
    """
    Middleware to log request details, endpoint, status code, and latency in platform_audit.api_activity_logs.
    """
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: dict, receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        method = scope.get("method", "")
        path = scope.get("path", "")

        # Skip paths that don't need logging (like static docs or health checks)
        skip_prefixes = {"/health", "/docs", "/openapi.json", "/redoc", "/ws", "/static"}
        if any(path.startswith(prefix) for prefix in skip_prefixes):
            await self.app(scope, receive, send)
            return

        status_code = [0]
        async def send_wrapper(message: dict) -> None:
            if message["type"] == "http.response.start":
                status_code[0] = message.get("status", 0)
            await send(message)

        start_time = time.monotonic()
        request = Request(scope)
        query_params = dict(request.query_params)
        payload_data = {"query_params": query_params}

        await self.app(scope, receive, send_wrapper)
        elapsed_ms = int((time.monotonic() - start_time) * 1000)

        # Log request details
        try:
            authorization = request.headers.get("Authorization")
            user_id, org_id = _extract_jwt_claims(authorization)
            
            # Since organization_id is NOT NULL, if we don't have a JWT org, we extract it from path or headers, or default
            if not org_id:
                uuids = re.findall(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", path.lower())
                if uuids:
                    org_id = uuid.UUID(uuids[0])
                else:
                    # System Org fallback
                    org_id = uuid.UUID("00000000-0000-0000-0000-000000000000")
            
            api_data = {
                "id": str(uuid.uuid4()),
                "organization_id": str(org_id),
                "user_id": str(user_id) if user_id else None,
                "method": method,
                "endpoint": path,
                "request_payload": payload_data,
                "response_code": status_code[0],
                "latency_ms": elapsed_ms,
                "created_at": datetime.now(timezone.utc).isoformat()
            }

            if settings.environment == "testing":
                async with AsyncSessionLocal() as db:
                    entry = ApiActivityLog(
                        id=uuid.UUID(api_data["id"]),
                        organization_id=uuid.UUID(api_data["organization_id"]),
                        user_id=uuid.UUID(api_data["user_id"]) if api_data["user_id"] else None,
                        method=api_data["method"],
                        endpoint=api_data["endpoint"],
                        request_payload=api_data["request_payload"],
                        response_code=api_data["response_code"],
                        latency_ms=api_data["latency_ms"],
                        created_at=datetime.fromisoformat(api_data["created_at"])
                    )
                    db.add(entry)
                    await db.commit()
            else:
                from app.tasks.platform_audit_tasks import write_api_activity_log
                write_api_activity_log.delay(api_data)

        except Exception as exc:
            logger.warning(f"[RequestLoggingMiddleware] Failed to log API activity: {exc}")
