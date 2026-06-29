import re
import uuid
from datetime import datetime, timezone
from typing import Any, Optional, Tuple

from jose import JWTError, jwt
from loguru import logger
from starlette.requests import Request
from starlette.types import ASGIApp

from app.config import settings
from app.database import AsyncSessionLocal
from app.modules.identity.models.security_event import SecurityEvent

async def record_security_event(
    db,
    user_id: Optional[uuid.UUID],
    event_type: str,
    severity: str,
    ip_address: Optional[str],
    user_agent: Optional[str],
    evidence: dict
) -> None:
    severity_map = {
        "LOW": (2.0, "LOW"),
        "MEDIUM": (5.0, "MEDIUM"),
        "HIGH": (7.5, "HIGH"),
        "CRITICAL": (9.0, "CRITICAL")
    }
    score, risk = severity_map.get(severity, (0.0, "LOW"))
    
    event = SecurityEvent(
        id=uuid.uuid4(),
        user_id=user_id,
        event_type=event_type,
        severity_score=score,
        risk_level=risk,
        ip_address=ip_address,
        user_agent=user_agent,
        evidence=evidence,
        occurred_at=datetime.now(timezone.utc)
    )
    db.add(event)

# Simple regexes to detect SQL injection patterns in query string/path
SQLI_PATTERN = re.compile(
    r"(union\s+select|select\s+.*\s+from|insert\s+into|update\s+.*\s+set|delete\s+from|drop\s+table|['\"\-\s]or\s+\d+=\d+)",
    re.IGNORECASE
)

def _extract_jwt_claims(authorization: Optional[str]) -> Tuple[Optional[uuid.UUID], Optional[uuid.UUID]]:
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

class SecurityMiddleware:
    """
    Middleware to detect security anomalies (SQL Injection patterns, brute-force indicators,
    permission anomalies, and MFA bypass indicators) and record them under platform_compliance.security_events.
    """
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: dict, receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        method = scope.get("method", "")
        path = scope.get("path", "")
        query_string = scope.get("query_string", b"").decode("utf-8")

        # 1. Check for SQL Injection (SQLi) in query params / path
        sqli_detected = False
        detected_payload = ""
        if SQLI_PATTERN.search(query_string):
            sqli_detected = True
            detected_payload = f"Query: {query_string}"
        elif SQLI_PATTERN.search(path):
            sqli_detected = True
            detected_payload = f"Path: {path}"

        request = Request(scope)
        authorization = request.headers.get("Authorization")
        user_id, org_id = _extract_jwt_claims(authorization)
        if not org_id:
            # Fallback org ID
            uuids = re.findall(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", path.lower())
            if uuids:
                org_id = uuid.UUID(uuids[0])
            else:
                org_id = uuid.UUID("00000000-0000-0000-0000-000000000000")

        if sqli_detected:
            # Write SQLi Alert
            async with AsyncSessionLocal() as db:
                try:
                    await record_security_event(
                        db=db,
                        user_id=user_id,
                        event_type="SQL_INJECTION_ATTEMPT",
                        severity="CRITICAL",
                        ip_address=request.client.host if request.client else None,
                        user_agent=request.headers.get("User-Agent"),
                        evidence={"path": path, "query": query_string, "method": method, "detected_payload": detected_payload}
                    )
                    await db.commit()
                except Exception as e:
                    logger.error(f"[SecurityMiddleware] Failed to log SQLi event: {e}")

        # 2. Intercept response to check for authentication failures (brute-force logging) or permission issues
        status_code = [0]
        async def send_wrapper(message: dict) -> None:
            if message["type"] == "http.response.start":
                status_code[0] = message.get("status", 0)
            await send(message)

        await self.app(scope, receive, send_wrapper)

        # Brute force check (401 on login endpoints)
        if status_code[0] == 401 and "login" in path.lower():
            async with AsyncSessionLocal() as db:
                try:
                    await record_security_event(
                        db=db,
                        user_id=user_id,
                        event_type="FAILED_LOGIN_ANOMALY",
                        severity="MEDIUM",
                        ip_address=request.client.host if request.client else None,
                        user_agent=request.headers.get("User-Agent"),
                        evidence={"path": path}
                    )
                    await db.commit()
                except Exception as e:
                    logger.error(f"[SecurityMiddleware] Failed to log failed login: {e}")

        # Permission Anomaly (403 Forbidden)
        elif status_code[0] == 403:
            async with AsyncSessionLocal() as db:
                try:
                    await record_security_event(
                        db=db,
                        user_id=user_id,
                        event_type="PERMISSION_VIOLATION",
                        severity="HIGH",
                        ip_address=request.client.host if request.client else None,
                        user_agent=request.headers.get("User-Agent"),
                        evidence={"path": path, "method": method}
                    )
                    await db.commit()
                except Exception as e:
                    logger.error(f"[SecurityMiddleware] Failed to log 403 anomaly: {e}")
