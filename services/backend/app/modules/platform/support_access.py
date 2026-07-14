from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Annotated, Any

from fastapi import Depends, Header, HTTPException, Query, Request, status
from sqlalchemy import Select, and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_context import TenantContextGuard
from app.modules.audit.models.audit_log import AuditLog
from app.modules.identity.models.user import User
from app.modules.platform.models.organization import Organization
from app.modules.superadmin.dependencies import require_super_admin
from app.schemas.cursor_pagination import CursorPage, decode_cursor, encode_cursor


@dataclass(frozen=True)
class PlatformSupportScope:
    organization_id: uuid.UUID
    reason: str
    actor: User
    request_id: uuid.UUID | None
    correlation_id: uuid.UUID | None
    actor_ip: str | None
    actor_user_agent: str | None


def _optional_uuid(value: str | None) -> uuid.UUID | None:
    if not value:
        return None
    try:
        return uuid.UUID(value)
    except ValueError:
        return None


async def require_platform_support_scope(
    request: Request,
    organization_id: uuid.UUID = Query(...),
    support_reason: str = Header(
        ...,
        alias="X-Support-Reason",
        min_length=12,
        max_length=500,
    ),
    actor: User = Depends(require_super_admin),
) -> PlatformSupportScope:
    """Require explicit tenant scope and purpose for privileged support reads."""
    reason = support_reason.strip()
    if len(reason) < 12:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="X-Support-Reason must contain at least 12 non-whitespace characters.",
        )
    return PlatformSupportScope(
        organization_id=organization_id,
        reason=reason,
        actor=actor,
        request_id=_optional_uuid(request.headers.get("X-Request-ID")),
        correlation_id=_optional_uuid(request.headers.get("X-Correlation-ID")),
        actor_ip=request.client.host if request.client else None,
        actor_user_agent=request.headers.get("User-Agent"),
    )


PlatformSupportScopeDependency = Annotated[
    PlatformSupportScope,
    Depends(require_platform_support_scope),
]


async def execute_platform_support_read(
    db: AsyncSession,
    scope: PlatformSupportScope,
    statement: Select[Any],
    *,
    resource_type: str,
    audit_result_limit: int | None = None,
) -> list[Any]:
    """Execute an organization-scoped read and audit it in the same transaction."""
    async with TenantContextGuard.scoped(db, scope.organization_id):
        organization_exists = await db.scalar(
            select(Organization.id).where(Organization.id == scope.organization_id)
        )
        if organization_exists is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found.")

        rows = (await db.execute(statement)).scalars().all()
        db.add(
            AuditLog(
                request_id=scope.request_id,
                correlation_id=scope.correlation_id,
                organization_id=scope.organization_id,
                actor_user_id=scope.actor.id,
                resource_type=resource_type,
                resource_id=scope.organization_id,
                action_type="PLATFORM_SUPPORT_DATA_READ",
                actor_role=scope.actor.platform_role or scope.actor.role,
                new_state={
                    "reason": scope.reason,
                    "access_mode": "READ_ONLY",
                    "result_count": min(len(rows), audit_result_limit) if audit_result_limit is not None else len(rows),
                },
                actor_ip=scope.actor_ip,
                actor_user_agent=scope.actor_user_agent,
                is_sensitive=True,
            )
        )
        await db.commit()
    return list(rows)


async def execute_platform_support_cursor_read(
    db: AsyncSession,
    scope: PlatformSupportScope,
    statement: Select[Any],
    *,
    timestamp_column: Any,
    id_column: Any,
    cursor: str | None,
    limit: int,
    resource_type: str,
) -> CursorPage[Any]:
    """Execute a deterministic descending keyset page under audited tenant scope."""
    if cursor:
        position = decode_cursor(cursor)
        statement = statement.where(
            or_(
                timestamp_column < position.occurred_at,
                and_(
                    timestamp_column == position.occurred_at,
                    id_column < position.record_id,
                ),
            )
        )
    statement = statement.order_by(timestamp_column.desc(), id_column.desc()).limit(limit + 1)
    rows = await execute_platform_support_read(
        db,
        scope,
        statement,
        resource_type=resource_type,
        audit_result_limit=limit,
    )
    has_next = len(rows) > limit
    items = rows[:limit]
    next_cursor = (
        encode_cursor(getattr(items[-1], timestamp_column.key), getattr(items[-1], id_column.key))
        if has_next and items
        else None
    )
    return CursorPage(items=items, next_cursor=next_cursor, has_next=has_next)
