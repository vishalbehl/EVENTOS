"""Explicit public discovery, followed by the existing request-lifetime guard."""
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator
import uuid

from fastapi import Depends, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.endpoint_contracts import endpoint_contract
from app.core.tenant_context import TenantContextGuard
from app.dependencies import get_db


@asynccontextmanager
async def public_form_scope(db: AsyncSession, event_id: uuid.UUID) -> AsyncIterator[None]:
    """The DB projection returns only a selector, never membership or authority.

    Every handler still rechecks its current event, live field, capability and
    entitlement. Missing schema/privileges fail closed, without an ORM fallback.
    """
    try:
        owner = await db.scalar(text(
            "SELECT registration.public_form_owner_v1(CAST(:event_id AS uuid))"),
            {"event_id": event_id})
    except (SQLAlchemyError, TimeoutError) as exc:
        await db.rollback()
        raise HTTPException(503, detail={"code": "PUBLIC_DISCOVERY_UNAVAILABLE"},
            headers={"Retry-After": "5"}) from exc
    if not isinstance(owner, uuid.UUID):
        raise HTTPException(404, detail={"code": "PUBLIC_FORM_NOT_FOUND"})
    async with TenantContextGuard.scoped(db, owner):
        yield


async def public_registration_context(request: Request,
                                      db: AsyncSession = Depends(get_db)) -> AsyncIterator[None]:
    endpoint = request.scope.get("endpoint")
    contract = endpoint_contract(endpoint, request.method, request.url.path)
    if contract is None or contract.audience != "PUBLIC":
        # Customer/platform endpoints keep their authenticated selected scope.
        yield
        return
    try:
        event_id = uuid.UUID(str(request.path_params.get("event_id")))
    except (ValueError, TypeError):
        raise HTTPException(404, detail={"code": "PUBLIC_FORM_NOT_FOUND"}) from None
    async with public_form_scope(db, event_id):
        # Discovery is read-only and runs before handler dependencies/writes.
        # Release its connection before bounded file hashing or provider IO;
        # the existing guard reapplies scope when the next transaction begins.
        await db.commit()
        yield
