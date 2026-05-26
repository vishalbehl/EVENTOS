"""
Portal Auth Dependency
app/modules/registration/dependencies/portal_auth.py

Provides get_portal_user() — a FastAPI dependency that validates portal JWTs.
Completely independent from organizer and speaker auth. Uses PORTAL_JWT_SECRET.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import ExpiredSignatureError, JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import get_db

_JWT_ALGORITHM = "HS256"

# The token URL is informational for OpenAPI — actual issuance is at /portal/auth/verify-otp
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/v1/portal/auth/verify-otp",
    auto_error=False,
)


@dataclass
class PortalUser:
    """Decoded identity of an authenticated portal attendee."""
    email: str
    event_id: uuid.UUID
    role: str  # must be "portal_attendee"


async def get_portal_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> PortalUser:
    """
    Decode and validate a portal JWT.

    Raises HTTP 401 if:
    - Token is missing, expired, or invalid
    - Token role is not "portal_attendee"
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated. Please log in via OTP.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not token:
        raise credentials_exception

    if not settings.PORTAL_JWT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Portal authentication is not configured on this server.",
        )

    try:
        payload = jwt.decode(
            token,
            settings.PORTAL_JWT_SECRET,
            algorithms=[_JWT_ALGORITHM],
        )
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except JWTError:
        raise credentials_exception

    email: Optional[str] = payload.get("email")
    event_id_str: Optional[str] = payload.get("event_id")
    role: Optional[str] = payload.get("role")

    if not email or not event_id_str or role != "portal_attendee":
        raise credentials_exception

    try:
        event_id = uuid.UUID(event_id_str)
    except ValueError:
        raise credentials_exception

    return PortalUser(email=email, event_id=event_id, role=role)
