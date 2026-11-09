"""Operator recovery selects its run in SQL before claim, mutation and LIMIT."""
from datetime import datetime, timedelta, timezone
import uuid

import pytest
from sqlalchemy import func, select

from app.core.tenant_context import TenantContextGuard
from app.modules.audit.models.audit_log import AuditLog
from app.modules.registration.models.catalogue_reconciliation import CatalogueReconciliationRun as Run
from app.tasks import catalogue_reconciliation as worker
from tests.test_catalogue_dispatch_generation import sessions_for


@pytest.mark.asyncio
@pytest.mark.parametrize("selected", [True, False])
async def test_exact_run_claim_leaves_other_pending_work_unchanged(db, super_admin, monkeypatch, selected):
    rows = [Run(organization_id=super_admin.organization_id, actor_user_id=super_admin.id,
        reason="Scoped recovery must not claim another operator run", status="PENDING",
        next_dispatch_at=datetime.now(timezone.utc) - timedelta(seconds=1)) for _ in range(2)]
    db.add_all(rows)
    await db.commit()
    identities = [row.id for row in rows]
    sessions_for(db, monkeypatch)
    messages = await worker._claim_reconciliation_runs(run_id=identities[0] if selected else uuid.uuid4())
    assert messages == ([(identities[0], super_admin.id, 1)] if selected else [])
    async with TenantContextGuard.scoped(db, super_admin.organization_id):
        for index, identity in enumerate(identities):
            row = await db.get(Run, identity, populate_existing=True)
            assert row.dispatch_attempts == (1 if selected and index == 0 else 0)
            assert row.status == "PENDING" and row.failure_code is None
            assert await db.scalar(select(func.count()).select_from(AuditLog).where(
                AuditLog.resource_id == identity)) == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("invalid", ["not-a-uuid", 1, True])
async def test_invalid_run_selector_fails_before_database_work(invalid):
    with pytest.raises(ValueError, match="Invalid reconciliation run selector"):
        await worker._claim_reconciliation_runs(run_id=invalid)
