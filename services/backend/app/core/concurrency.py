from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.events.models.event import Event


def require_if_match(value: str | int | None) -> int:
    if value is None:
        raise HTTPException(status_code=428, detail={"code": "IF_MATCH_REQUIRED", "message": "If-Match is required."})
    try:
        version = int(str(value).strip().strip('"'))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail={"code": "INVALID_VERSION", "message": "If-Match must be an integer version."}) from exc
    if version < 1:
        raise HTTPException(status_code=400, detail={"code": "INVALID_VERSION", "message": "If-Match must be positive."})
    return version


def raise_version_conflict(current_version: int) -> None:
    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": "RESOURCE_VERSION_CONFLICT", "message": "The resource was changed by another user.", "details": {"current_version": current_version}})


async def update_with_version(
    db: AsyncSession,
    model: type,
    record_id,
    expected_version: int,
    values: dict,
    *,
    organization_id=None,
) -> int:
    """Atomically update a versioned row; the caller owns commit and cache invalidation."""
    if expected_version < 1:
        raise HTTPException(status_code=400, detail={"code": "INVALID_VERSION", "message": "Version must be positive."})
    next_values = dict(values)
    next_values["version"] = expected_version + 1
    stmt = update(model).where(model.id == record_id, model.version == expected_version)
    if organization_id is not None:
        if hasattr(model, "organization_id"):
            stmt = stmt.where(model.organization_id == organization_id)
        elif hasattr(model, "event_id"):
            stmt = stmt.where(
                select(Event.id)
                .where(
                    Event.id == model.event_id,
                    Event.organization_id == organization_id,
                )
                .exists()
            )
        else:
            raise ValueError(
                f"Cannot apply organization scope to {model.__name__}; "
                "provide a tenant-aware model."
            )
    result = await db.execute(stmt.values(**next_values))
    if result.rowcount != 1:
        current_stmt = select(model.version).where(model.id == record_id)
        if organization_id is not None:
            if hasattr(model, "organization_id"):
                current_stmt = current_stmt.where(model.organization_id == organization_id)
            elif hasattr(model, "event_id"):
                current_stmt = current_stmt.where(
                    select(Event.id)
                    .where(
                        Event.id == model.event_id,
                        Event.organization_id == organization_id,
                    )
                    .exists()
                )
        current_version = await db.scalar(current_stmt)
        raise_version_conflict(int(current_version or expected_version))
    return expected_version + 1


class ConcurrencyService:
    """Standard command-facing facade for optimistic concurrency primitives."""

    require_if_match = staticmethod(require_if_match)
    raise_conflict = staticmethod(raise_version_conflict)
    update = staticmethod(update_with_version)
