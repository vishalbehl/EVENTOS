from __future__ import annotations

import hashlib
import time
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.identity.models.identity_domain_tables import LoginAttempt
from app.redis import redis_client


def _email_key(email: str) -> str:
    normalized = email.lower().strip().encode()
    return hashlib.sha256(normalized).hexdigest()


async def _redis_count(key: str, window: int) -> tuple[int, int]:
    now = time.time()
    cutoff = now - window
    async with redis_client.pipeline(transaction=True) as pipe:
        pipe.zremrangebyscore(key, 0, cutoff)
        pipe.zcard(key)
        pipe.expire(key, max(window, settings.COMMAND_CENTER_IP_LOCK_SECONDS))
        _, count, _ = await pipe.execute()
    return int(count), window


async def check_login_allowed(db: AsyncSession, email: str, ip: str | None) -> tuple[bool, int]:
    account_key = f"auth:cc:fail:email:{_email_key(email)}"
    ip_key = f"auth:cc:fail:ip:{ip or 'unknown'}"
    account_lock = f"{account_key}:locked"
    ip_lock = f"{ip_key}:locked"
    try:
        account_ttl, ip_ttl = await redis_client.ttl(account_lock), await redis_client.ttl(ip_lock)
        if account_ttl > 0:
            return False, account_ttl
        if ip_ttl > 0:
            return False, ip_ttl
        account_count, _ = await _redis_count(account_key, settings.COMMAND_CENTER_LOGIN_WINDOW_SECONDS)
        ip_count, _ = await _redis_count(ip_key, settings.COMMAND_CENTER_LOGIN_WINDOW_SECONDS)
    except Exception:
        now = datetime.now(timezone.utc)
        account_count = int((await db.execute(select(func.count()).select_from(LoginAttempt).where(
            LoginAttempt.email == email.lower().strip(), LoginAttempt.is_successful.is_(False),
            LoginAttempt.attempted_at >= now - timedelta(seconds=settings.COMMAND_CENTER_LOGIN_WINDOW_SECONDS),
        ))).scalar_one())
        ip_count = int((await db.execute(select(func.count()).select_from(LoginAttempt).where(
            LoginAttempt.ip_address == ip, LoginAttempt.is_successful.is_(False),
            LoginAttempt.attempted_at >= now - timedelta(seconds=settings.COMMAND_CENTER_IP_LOCK_SECONDS),
        ))).scalar_one())
    if account_count >= settings.COMMAND_CENTER_LOGIN_ACCOUNT_LIMIT:
        try:
            await redis_client.set(account_lock, "1", ex=settings.COMMAND_CENTER_ACCOUNT_LOCK_SECONDS, nx=True)
        except Exception:
            pass
        return False, settings.COMMAND_CENTER_ACCOUNT_LOCK_SECONDS
    if ip_count >= settings.COMMAND_CENTER_LOGIN_IP_LIMIT:
        try:
            await redis_client.set(ip_lock, "1", ex=settings.COMMAND_CENTER_IP_LOCK_SECONDS, nx=True)
        except Exception:
            pass
        return False, settings.COMMAND_CENTER_IP_LOCK_SECONDS
    return True, 0


async def record_login_attempt(db: AsyncSession, email: str, ip: str | None, successful: bool) -> None:
    normalized = email.lower().strip()
    db.add(LoginAttempt(id=uuid.uuid4(), email=normalized, ip_address=ip, is_successful=successful))
    email_key = f"auth:cc:fail:email:{_email_key(normalized)}"
    ip_key = f"auth:cc:fail:ip:{ip or 'unknown'}"
    try:
        if successful:
            await redis_client.delete(email_key, f"{email_key}:locked")
        else:
            now = time.time()
            member = f"{now}:{uuid.uuid4().hex}"
            async with redis_client.pipeline(transaction=True) as pipe:
                pipe.zadd(email_key, {member: now})
                pipe.expire(email_key, settings.COMMAND_CENTER_ACCOUNT_LOCK_SECONDS)
                pipe.zadd(ip_key, {member: now})
                pipe.expire(ip_key, settings.COMMAND_CENTER_IP_LOCK_SECONDS)
                await pipe.execute()
    except Exception:
        pass
