"""Explicit platform-only, bounded, non-document aggregate review projection."""
import uuid

from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError

from app.core.tenant_context import TenantContextGuard
from app.modules.identity.models.user import User
from app.modules.rbac.services.platform_permissions import platform_permission_authority
from app.modules.registration.schemas.catalogue_contracts import AggregateReconciliationIssue, CatalogueReconciliationIssue
from app.schemas.cursor_pagination import CursorPage, bounded_page_size, decode_cursor, encode_cursor


async def template_review_rows(db, *, actor, template_id=None, cursor=None, page_size=50):
    """Metadata only; a target ID is a selector, never authority to read a document."""
    size = bounded_page_size(page_size, default=50, maximum=100)
    position = decode_cursor(cursor) if cursor else None
    if position and (position.occurred_at.tzinfo is None or position.occurred_at.utcoffset() is None):
        raise HTTPException(400, detail={"code": "INVALID_CURSOR"})
    await platform_permission_authority(db, actor.id, "platform:administration:manage")
    platform_id = await db.scalar(select(User.__table__.c.organization_id).where(User.__table__.c.id == actor.id))
    if not isinstance(platform_id, uuid.UUID):
        raise HTTPException(403, detail={"code": "PLATFORM_PERMISSION_DENIED"})
    async with TenantContextGuard.scoped(db, platform_id):
        try:
            return list((await db.execute(text("""SELECT * FROM design.catalogue_template_review_v1(
                CAST(:actor AS uuid),CAST(:template AS uuid),CAST(:after_at AS timestamptz),
                CAST(:after_id AS uuid),:page_limit)"""),
                {"actor": actor.id, "template": template_id,
                 "after_at": position.occurred_at if position else None,
                 "after_id": position.record_id if position else None,
                 "page_limit": 1 if template_id is not None else size + 1})).mappings().all())
        except (SQLAlchemyError, TimeoutError) as exc:
            await db.rollback()
            raise HTTPException(503, detail={"code": "CATALOGUE_REVIEW_UNAVAILABLE"}) from exc


async def list_blocked_templates(db, *, actor, cursor=None, page_size=50):
    size = bounded_page_size(page_size, default=50, maximum=100)
    rows = await template_review_rows(db, actor=actor, cursor=cursor, page_size=size)
    items, has_next = rows[:size], len(rows) > size
    return CursorPage(items=[CatalogueReconciliationIssue(
        **{key: row[key] for key in ("reconciliation_id", "template_id", "template_name", "template_version", "reason")},
        created_at=row["created_at"].isoformat()) for row in items], has_next=has_next,
        next_cursor=encode_cursor(items[-1]["created_at"], items[-1]["reconciliation_id"])
            if has_next and items else None)


async def list_blocked_aggregates(db, *, actor, resource_type, cursor=None, page_size=50):
    size = bounded_page_size(page_size, default=50, maximum=100)
    if resource_type not in {"FORM_CATEGORY", "REGISTRATION_FORM", "ABSTRACT_FORM", "PROGRAMME_RUBRIC"}:
        raise HTTPException(400, detail={"code": "INVALID_RECONCILIATION_TYPE"})
    position = decode_cursor(cursor) if cursor else None
    if position and (position.occurred_at.tzinfo is None or position.occurred_at.utcoffset() is None):
        raise HTTPException(400, detail={"code": "INVALID_CURSOR"})
    await platform_permission_authority(db, actor.id, "platform:administration:manage")
    platform_id = await db.scalar(select(User.__table__.c.organization_id).where(User.__table__.c.id == actor.id))
    if not isinstance(platform_id, uuid.UUID):
        raise HTTPException(403, detail={"code": "PLATFORM_PERMISSION_DENIED"})
    async with TenantContextGuard.scoped(db, platform_id):
        try:
            rows = list((await db.execute(text("""SELECT * FROM design.catalogue_blocked_review_v1(
                :kind,CAST(:actor AS uuid),CAST(:after_at AS timestamptz),
                CAST(:after_id AS uuid),:page_limit)"""),
                {"kind": resource_type, "actor": actor.id, "after_at": position.occurred_at if position else None,
                 "after_id": position.record_id if position else None, "page_limit": size + 1})).mappings().all())
        except (SQLAlchemyError, TimeoutError) as exc:
            # PostgreSQL rejects further statements after an SQL error. End
            # the read transaction before the guard restores its prior scope.
            await db.rollback()
            raise HTTPException(503, detail={"code": "CATALOGUE_REVIEW_UNAVAILABLE"}) from exc
    items = rows[:size]
    has_next = len(rows) > size
    return CursorPage(items=[AggregateReconciliationIssue(
        **{**dict(row), "created_at": row["created_at"].isoformat(),
           "reason": row["reason"] or "Explicit reconciliation is required."}) for row in items],
        has_next=has_next,
        next_cursor=encode_cursor(items[-1]["created_at"], items[-1]["reconciliation_id"])
            if has_next and items else None)
