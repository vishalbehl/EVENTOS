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
from app.database import (
    AsyncSessionLocal,
    get_db_request_metrics,
    reset_db_request_metrics,
    restore_db_request_metrics,
    request_id as db_request_id,
    request_path as db_request_path,
)
from app.core.cache import get_cache_latency_ms, get_cache_lock_contention, get_cache_metrics, reset_cache_metrics, restore_cache_metrics
from app.modules.audit.models.api_request_log import APIRequestLog
from app.core.prometheus_metrics import observe_request

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
        metric_tokens = reset_db_request_metrics()
        cache_tokens = reset_cache_metrics()
        async def send_wrapper(message: dict) -> None:
            if message["type"] == "http.response.start":
                status_code[0] = message.get("status", 0)
            await send(message)

        start_time = time.monotonic()
        request = Request(scope)
        request_id_header = request.headers.get("X-Request-ID")
        try:
            request_id_value = str(uuid.UUID(request_id_header)) if request_id_header else str(uuid.uuid4())
        except ValueError:
            request_id_value = str(uuid.uuid4())
        request_id_token = db_request_id.set(request_id_value)
        request_path_token = db_request_path.set(path)
        query_params = dict(request.query_params)
        payload_data = {"query_params": query_params}

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            elapsed_ms = int((time.monotonic() - start_time) * 1000)
            db_query_count, db_query_duration_ms = get_db_request_metrics()
            restore_db_request_metrics(metric_tokens)
            db_request_id.reset(request_id_token)
            db_request_path.reset(request_path_token)
            cache_data = get_cache_metrics()
            cache_data["latency_ms"] = get_cache_latency_ms()
            cache_data["lock_contention"] = get_cache_lock_contention()
            restore_cache_metrics(cache_tokens)

        if (
            elapsed_ms >= settings.REQUEST_SLOW_MS
            or db_query_count >= settings.REQUEST_DB_QUERY_WARN_COUNT
            or db_query_duration_ms >= settings.REQUEST_DB_SLOW_MS
        ):
            logger.warning(
                "slow_http_request method={} path={} status={} duration_ms={} db_query_count={} db_duration_ms={:.1f} cache_lock_contention={}",
                method,
                path,
                status_code[0],
                elapsed_ms,
                db_query_count,
                db_query_duration_ms,
                cache_data["lock_contention"],
            )

        observe_request(method, path, status_code[0], elapsed_ms, db_query_count, db_query_duration_ms)

        # Log request details
        try:
            authorization = request.headers.get("Authorization")
            user_id, org_id = _extract_jwt_claims(authorization)
            
            corr_id_hdr = request.headers.get("X-Correlation-ID")
            correlation_id = None
            if corr_id_hdr:
                try:
                    correlation_id = uuid.UUID(corr_id_hdr)
                except ValueError:
                    pass

            request_id = uuid.UUID(request_id_value)
            
            ip_address = _get_client_ip(request)
            user_agent = request.headers.get("User-Agent")

            api_data = {
                "id": str(uuid.uuid4()),
                "request_id": str(request_id),
                "correlation_id": str(correlation_id) if correlation_id else None,
                "method": method,
                "path": path,
                "status_code": status_code[0],
                "duration_ms": float(elapsed_ms),
                "db_query_count": db_query_count,
                "db_query_duration_ms": float(db_query_duration_ms),
                "cache_hits": cache_data["hits"],
                "cache_misses": cache_data["misses"],
                "cache_hit": bool(cache_data["hits"] > 0),
                "ip_address": ip_address,
                "user_id": str(user_id) if user_id else None,
                "user_agent": user_agent,
                "request_size_bytes": 0,
                "response_size_bytes": 0,
                "occurred_at": datetime.now(timezone.utc).isoformat()
            }

            if settings.environment == "testing":
                async with AsyncSessionLocal() as db:
                    entry = APIRequestLog(
                        id=uuid.UUID(api_data["id"]),
                        request_id=uuid.UUID(api_data["request_id"]),
                        correlation_id=uuid.UUID(api_data["correlation_id"]) if api_data["correlation_id"] else None,
                        organization_id=org_id,
                        method=api_data["method"],
                        path=api_data["path"],
                        status_code=api_data["status_code"],
                        duration_ms=api_data["duration_ms"],
                        db_query_count=api_data["db_query_count"],
                        db_query_duration_ms=api_data["db_query_duration_ms"],
                        cache_hit=api_data["cache_hit"],
                        ip_address=api_data["ip_address"],
                        user_id=uuid.UUID(api_data["user_id"]) if api_data["user_id"] else None,
                        user_agent=api_data["user_agent"],
                        request_size_bytes=api_data["request_size_bytes"],
                        response_size_bytes=api_data["response_size_bytes"],
                        occurred_at=datetime.fromisoformat(api_data["occurred_at"])
                    )
                    db.add(entry)
                    await db.commit()
            else:
                from app.tasks.audit_tasks import write_api_request_log
                write_api_request_log.delay(api_data)

        except Exception as exc:
            logger.warning(f"[RequestLoggingMiddleware] Failed to log API activity: {exc}")
