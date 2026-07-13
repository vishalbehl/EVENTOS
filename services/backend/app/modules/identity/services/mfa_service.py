from __future__ import annotations

import base64
import hashlib
import hmac
import struct
import time
import secrets
from urllib.parse import quote
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.identity.models.identity_domain_tables import MfaDevice
from app.modules.identity.models.user import User


PRIVILEGED_ROLES = {"super_admin"}
PRIVILEGED_PLATFORM_ROLES = {
    "SUPER_ADMIN",
    "SECURITY_ADMIN",
    "FINANCE_ADMIN",
    "SUPPORT_ADMIN",
}


def requires_privileged_mfa(user: User) -> bool:
    return bool(
        user.role in PRIVILEGED_ROLES
        or user.is_platform_admin
        or user.platform_role in PRIVILEGED_PLATFORM_ROLES
    )


def _totp(secret: str, counter: int, digits: int = 6) -> str:
    normalized = secret.strip().replace(" ", "").upper()
    padding = "=" * ((8 - len(normalized) % 8) % 8)
    key = base64.b32decode(normalized + padding, casefold=True)
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code = (struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF) % (10**digits)
    return f"{code:0{digits}d}"


def verify_totp(secret: str, code: str, *, at_time: int | None = None, window: int = 1) -> bool:
    if not code or not code.isdigit() or len(code) != 6:
        return False
    timestamp = int(at_time if at_time is not None else time.time())
    counter = timestamp // 30
    return any(hmac.compare_digest(_totp(secret, counter + drift), code) for drift in range(-window, window + 1))


def generate_totp_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")


def build_totp_uri(secret: str, email: str, issuer: str = "EventX OS") -> str:
    label = quote(f"{issuer}:{email}")
    return f"otpauth://totp/{label}?secret={secret}&issuer={quote(issuer)}&algorithm=SHA1&digits=6&period=30"


async def verify_user_mfa(db: AsyncSession, user: User, code: str | None) -> datetime:
    device = await db.scalar(
        select(MfaDevice).where(
            MfaDevice.user_id == user.id,
            MfaDevice.is_active.is_(True),
        )
    )
    if device is None:
        raise ValueError("MFA enrollment is required for this privileged account.")
    if not code or not verify_totp(device.totp_secret, code):
        raise ValueError("A valid MFA code is required for this privileged account.")
    return datetime.now(timezone.utc)
