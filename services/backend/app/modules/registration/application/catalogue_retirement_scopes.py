"""Scoped set-based reference maintenance; never bypass customer RLS at runtime."""
import uuid
from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError

from app.core.tenant_context import TenantContextGuard
from app.modules.rbac.services.platform_permissions import platform_permission_authority
from app.modules.identity.models.user import User


async def reassign_reference_counts(db, statement, parameters, *, kind, actor, include_global=False):
    if kind not in {"TEMPLATE", "CATEGORY"}:
        raise ValueError("Unsupported catalogue retirement kind")
    # Callers hold the exclusive lifecycle lock and own the final transaction
    # (category-key maintenance shares this same category lifecycle fencing).
    # Recheck canonical platform authority after any wait, not a global label.
    await platform_permission_authority(db, actor.id, "platform:administration:manage")
    platform_id = await db.scalar(select(User.__table__.c.organization_id).where(User.__table__.c.id == actor.id))
    if not isinstance(platform_id, uuid.UUID):
        raise HTTPException(403, detail={"code": "PLATFORM_PERMISSION_DENIED"})
    async with TenantContextGuard.scoped(db, platform_id):
        return await _reassign_scoped(db, statement, parameters, kind=kind, actor=actor,
            include_global=include_global)


async def _reassign_scoped(db, statement, parameters, *, kind, actor, include_global):
    totals = {"reassigned": 0, "lineage_recorded": 0, "blocked_carried": 0}

    async def accumulate(owner):
        counts = (await db.execute(statement, {**parameters, "owner_id": owner})).mappings().one()
        for key in totals:
            totals[key] += int(counts[key] or 0)

    if include_global:
        await accumulate(None)
    after = None
    while True:
        await platform_permission_authority(db, actor.id, "platform:administration:manage")
        try:
            owners = list((await db.scalars(text("""SELECT * FROM
                design.catalogue_reference_owners_v1(:kind,CAST(:source AS uuid),
                    CAST(:actor AS uuid),CAST(:after AS uuid))"""),
                {"kind": kind, "source": parameters["source_id"], "actor": actor.id, "after": after})).all())
        except (SQLAlchemyError, TimeoutError) as exc:
            raise HTTPException(503, detail={"code": "CATALOGUE_DISCOVERY_UNAVAILABLE"}) from exc
        if not owners:
            return totals
        if len(owners) > 100 or any(not isinstance(owner, uuid.UUID) for owner in owners):
            raise RuntimeError("Invalid bounded catalogue owner projection")
        if owners != sorted(set(owners)) or (after is not None and owners[0] <= after):
            raise RuntimeError("Catalogue owner cursor did not advance")
        for owner in owners:
            async with TenantContextGuard.scoped(db, owner):
                await accumulate(owner)
        after = owners[-1]
        if len(owners) < 100:
            return totals
