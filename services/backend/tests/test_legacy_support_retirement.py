"""Reviewed retirement is bounded, atomic, repeatable and audit-verifiable."""
import importlib.util
from pathlib import Path

import pytest
from sqlalchemy import select

from app.modules.audit.models.audit_log import AuditLog, compute_audit_hash
from app.modules.platform.models.feature import FeatureCatalog
from app.modules.billing.services.capability_service import CapabilityService

path = Path(__file__).parents[1] / "alembic/versions/20261016_3610_retire_unsupported_support_features.py"
spec = importlib.util.spec_from_file_location("reviewed_retirement", path)
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)


@pytest.mark.asyncio
async def test_retirement_is_exact_idempotent_and_audited(db):
    existing = {row.key: row for row in (await db.scalars(select(FeatureCatalog).where(
        FeatureCatalog.key.in_(migration.RETIRED_KEYS)))).all()}
    for key in migration.RETIRED_KEYS:
        row = existing.get(key)
        if row is None:
            row = FeatureCatalog(key=key, name=key)
            db.add(row)
        row.is_active = True
        row.lifecycle_status = "ACTIVE"
        row.version = 7
    untouched = FeatureCatalog(key="FEAT_RETIREMENT_UNRELATED_FIXTURE", name="Untouched",
        is_active=True, lifecycle_status="ACTIVE", version=9)
    db.add(untouched)
    await db.flush()
    connection = await db.connection()
    assert await connection.run_sync(migration.retire_reviewed_features) == 4
    assert await connection.run_sync(migration.retire_reviewed_features) == 0
    db.expire_all()
    retired = (await db.scalars(select(FeatureCatalog).where(
        FeatureCatalog.key.in_(migration.RETIRED_KEYS)))).all()
    assert len(retired) == 4
    assert all(not r.is_active and r.lifecycle_status == "RETIRED" and r.version == 8 for r in retired)
    audits = (await db.scalars(select(AuditLog).where(
        AuditLog.resource_id.in_([r.id for r in retired]),
        AuditLog.action_type == "LEGACY_SUPPORT_FEATURE_RETIRED"))).all()
    assert len(audits) == 4
    assert all(a.row_hash == compute_audit_hash(a) for a in audits)
    assert all(a.old_state["version"] == 7 and a.new_state["version"] == 8 for a in audits)
    saved = await db.scalar(select(FeatureCatalog).where(FeatureCatalog.key == "FEAT_RETIREMENT_UNRELATED_FIXTURE"))
    assert saved.is_active and saved.lifecycle_status == "ACTIVE" and saved.version == 9
    unknown = await CapabilityService.validate_existing_catalogue(db)
    assert not set(migration.RETIRED_KEYS).intersection(unknown)
    assert saved.key in unknown


@pytest.mark.asyncio
async def test_audit_failure_rolls_back_retirement(db):
    key = migration.RETIRED_KEYS[0]
    row = await db.scalar(select(FeatureCatalog).where(FeatureCatalog.key == key))
    if row is None:
        row = FeatureCatalog(key=key, name=key)
        db.add(row)
    row.is_active, row.lifecycle_status, row.version = True, "ACTIVE", 12
    await db.flush()
    resource_id = row.id

    def fail_audit(connection):
        class FailingAuditConnection:
            def execute(self, statement, params):
                if "INSERT INTO command_center_audit.logs" in str(statement):
                    raise RuntimeError("Injected mandatory audit failure")
                return connection.execute(statement, params)
        return migration.retire_reviewed_features(FailingAuditConnection())

    with pytest.raises(RuntimeError, match="mandatory audit failure"):
        async with db.begin_nested():
            connection = await db.connection()
            await connection.run_sync(fail_audit)
    db.expire_all()
    unchanged = await db.get(FeatureCatalog, resource_id)
    assert unchanged.is_active and unchanged.lifecycle_status == "ACTIVE" and unchanged.version == 12
