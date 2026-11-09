"""Tenant RLS context restoration follows the PostgreSQL transaction lifetime."""
from __future__ import annotations

import uuid

import pytest

from app.core.tenant_context import TenantContextGuard
from app.database import tenant_org_id


class Session:
    def __init__(self):
        self.applied = []
        self.is_active = True
        self.transaction = True

    async def execute(self, statement, values=None):
        self.applied.append((str(statement), values))

    def in_transaction(self):
        return self.transaction


@pytest.mark.asyncio
async def test_committed_scope_does_not_open_restore_transaction():
    session = Session()
    owner = uuid.uuid4()

    async with TenantContextGuard.scoped(session, owner):
        assert TenantContextGuard.current() == owner
        session.transaction = False  # PostgreSQL already cleared SET LOCAL.

    assert TenantContextGuard.current() is None
    assert len(session.applied) == 1
    assert session.applied[0][1] == {"org_id": str(owner)}


@pytest.mark.asyncio
async def test_open_transaction_restores_previous_context():
    session = Session()
    previous, selected = uuid.uuid4(), uuid.uuid4()
    token = tenant_org_id.set(previous)
    try:
        async with TenantContextGuard.scoped(session, selected):
            assert TenantContextGuard.current() == selected

        assert TenantContextGuard.current() == previous
        assert len(session.applied) == 2
        assert session.applied[0][1] == {"org_id": str(selected)}
        assert session.applied[1][1] == {"org_id": str(previous)}
    finally:
        tenant_org_id.reset(token)


@pytest.mark.asyncio
async def test_failed_transaction_never_masks_original_error():
    session = Session()
    owner = uuid.uuid4()

    with pytest.raises(RuntimeError, match="business failure"):
        async with TenantContextGuard.scoped(session, owner):
            session.is_active = False
            raise RuntimeError("business failure")

    assert len(session.applied) == 1
    assert TenantContextGuard.current() is None

