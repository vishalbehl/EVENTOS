"""Real PostgreSQL and local-storage recovery scope and quota accounting."""
from contextlib import asynccontextmanager
import asyncio
from datetime import datetime, timedelta, timezone
import uuid

import pytest
from sqlalchemy import select, text
from sqlalchemy import delete

from app.database import tenant_org_id
from app.modules.audit.models.audit_log import AuditLog
from app.modules.files.models.file import DurableUpload
from app.modules.platform.models.organization import Organization
from app.modules.platform.models.organization_console import UsageReservation


@pytest.mark.parametrize("bucket", ["registration_uploads", "UPPERCASE", "../foreign", "a", "x" * 64])
def test_new_registration_bucket_configuration_rejects_nonportable_names(bucket):
    from app.config import Settings
    with pytest.raises(ValueError, match="lowercase S3 name"):
        Settings(_env_file=None, S3_BUCKET_REGISTRATION_UPLOADS=bucket)


def test_upload_recovery_fence_rejects_late_finalisation():
    from fastapi import HTTPException
    from types import SimpleNamespace
    from app.modules.registration.services.managed_registration_uploads import require_upload_not_recovering
    for claim in (None, "ordinary-scanner-task"):
        require_upload_not_recovering(SimpleNamespace(task_id=claim))
    with pytest.raises(HTTPException) as denied:
        require_upload_not_recovering(SimpleNamespace(task_id=f"recovery:{uuid.uuid4()}"))
    assert denied.value.status_code == 409
    assert denied.value.detail["code"] == "UPLOAD_RECOVERY_IN_PROGRESS"
    assert denied.value.headers["Retry-After"] == "5"


@pytest.mark.asyncio
async def test_waiting_finalizer_rechecks_committed_recovery_claim(committed_session_factory):
    from fastapi import HTTPException
    from app.modules.registration.services.managed_registration_uploads import require_upload_not_recovering
    owner = uuid.uuid4()
    upload_id = uuid.uuid4()
    async with committed_session_factory() as db:
        db.add(Organization(id=owner, name="Recovery ordering fixture", slug=f"recovery-order-{owner.hex}"))
        await db.flush()
        db.add(DurableUpload(id=upload_id, organization_id=owner,
            object_key=f"tenant/{owner}/ordering.txt", storage_bucket="assets",
            original_filename="ordering.txt", mime_type="text/plain", size_bytes=1, status="uploading"))
        await db.commit()
    finalizer_task = None
    try:
        async with committed_session_factory() as claimant, committed_session_factory() as finalizer:
            warm = await finalizer.get(DurableUpload, upload_id)
            assert warm.task_id is None
            finalizer_pid = await finalizer.scalar(text("SELECT pg_backend_pid()"))
            claimed = await claimant.scalar(select(DurableUpload).where(
                DurableUpload.id == upload_id).with_for_update())
            claimed.task_id = f"recovery:{uuid.uuid4()}"
            await claimant.flush()

            async def finalize():
                current = await finalizer.scalar(select(DurableUpload).where(
                    DurableUpload.id == upload_id).with_for_update()
                    .execution_options(populate_existing=True))
                try:
                    require_upload_not_recovering(current)
                except HTTPException as exc:
                    await finalizer.rollback()
                    return exc.status_code
                pytest.fail("A waiting finalizer bypassed the committed recovery claim")

            finalizer_task = asyncio.create_task(finalize())

            async def wait_for_lock():
                while not await claimant.scalar(text("SELECT cardinality(pg_blocking_pids(:pid)) > 0"),
                    {"pid": finalizer_pid}):
                    if finalizer_task.done():
                        pytest.fail("Finalizer did not wait for the recovery transaction")
                    await asyncio.sleep(0.02)

            await asyncio.wait_for(wait_for_lock(), 10)
            await claimant.commit()
            assert await asyncio.wait_for(finalizer_task, 10) == 409
    finally:
        if finalizer_task is not None and not finalizer_task.done():
            finalizer_task.cancel()
            await asyncio.gather(finalizer_task, return_exceptions=True)
        async with committed_session_factory() as db:
            await db.execute(delete(DurableUpload).where(DurableUpload.id == upload_id))
            await db.execute(delete(Organization).where(Organization.id == owner))
            await db.commit()


@pytest.mark.asyncio
@pytest.mark.parametrize("reservation_status", ["RESERVED", "CONSUMED"])
@pytest.mark.parametrize("object_state", ["missing", "size_mismatch"])
async def test_recovery_binds_target_under_forced_rls_and_preserves_consumed_usage(
    db, event, monkeypatch, reservation_status, object_state, tmp_path,
):
    from app.tasks import upload_jobs, tenant_job_scope
    from app.core.tenant_context import TenantContextGuard
    from app.modules.presentations.services import upload_service as storage
    monkeypatch.setattr(storage.settings, "STORAGE_MODE", "local")
    monkeypatch.setattr(storage, "LOCAL_STORAGE_ROOT", tmp_path)
    foreign = Organization(name="Foreign recovery tenant", slug=f"recovery-{uuid.uuid4().hex}")
    db.add(foreign)
    await db.flush()
    stale = datetime.now(timezone.utc) - timedelta(hours=1)
    upload = DurableUpload(organization_id=event.organization_id, event_id=event.id,
        object_key=f"tenant/{event.organization_id}/event/{event.id}/registration_upload/missing/{uuid.uuid4()}.txt",
        storage_bucket="registration_uploads", original_filename="missing.txt",
        mime_type="text/plain", size_bytes=10, status="uploading", updated_at=stale)
    other = DurableUpload(organization_id=foreign.id,
        object_key=f"tenant/{foreign.id}/missing.txt", storage_bucket="assets",
        original_filename="foreign.txt", mime_type="text/plain", size_bytes=10,
        status="uploading", updated_at=stale)
    db.add_all([upload, other])
    await db.flush()
    reservation = UsageReservation(organization_id=event.organization_id,
        event_id=event.id, metric_key="storage_quota_mb", quantity=1, unit="MB",
        status=reservation_status, idempotency_key=f"registration-upload:{uuid.uuid4()}",
        expires_at=stale, metadata_json={"upload_id": str(upload.id),
            "delivery_hold": True, "storage_path": upload.object_key})
    db.add(reservation)
    await db.commit()
    if object_state == "size_mismatch":
        storage.upload_bytes(upload.storage_bucket, upload.object_key, b"wrong-size-payload",
            verified_organization_id=event.organization_id)
    role = "upload_recovery_" + uuid.uuid4().hex
    await db.execute(text(f'CREATE ROLE "{role}" NOSUPERUSER NOBYPASSRLS NOLOGIN'))
    schemas = "content, public, platform, events, commerce, command_center_audit"
    await db.execute(text(f'GRANT USAGE ON SCHEMA {schemas} TO "{role}"'))
    await db.execute(text(f'GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA {schemas} TO "{role}"'))
    await db.execute(text("ALTER TABLE content.durable_uploads ENABLE ROW LEVEL SECURITY"))
    await db.execute(text("ALTER TABLE content.durable_uploads FORCE ROW LEVEL SECURITY"))
    await db.execute(text("""CREATE POLICY recovery_test_tenant ON content.durable_uploads
        USING (organization_id = nullif(current_setting('app.current_organization_id', true), '')::uuid)
        WITH CHECK (organization_id = nullif(current_setting('app.current_organization_id', true), '')::uuid)"""))
    await db.commit()

    @asynccontextmanager
    async def sessions():
        await db.execute(text(f'SET LOCAL ROLE "{role}"'))
        yield db

    monkeypatch.setattr(tenant_job_scope, "AsyncSessionLocal", sessions)
    requested = []

    def measured_metadata(**kwargs):
        requested.append(kwargs)
        return storage.get_object_metadata(**kwargs)

    monkeypatch.setattr(upload_jobs, "get_object_metadata", measured_metadata)
    token = tenant_org_id.set(foreign.id)
    try:
        await db.execute(text(f'SET LOCAL ROLE "{role}"'))
        await TenantContextGuard.apply(db, None)
        assert list((await db.scalars(select(DurableUpload.__table__.c.id))).all()) == []
        await upload_jobs._recover_abandoned_tenant_uploads(event.organization_id)
        assert tenant_org_id.get() == foreign.id
        await db.execute(text("RESET ROLE"))
        # Read the assertion state in the explicit target, without weakening RLS.
        async with TenantContextGuard.scoped(db, event.organization_id):
            await db.refresh(upload)
            await db.refresh(reservation)
            assert upload.status == "failed"
            assert len(requested) == 1
            assert requested[0]["verified_organization_id"] == event.organization_id
            if reservation_status == "RESERVED":
                assert reservation.status == "RELEASED"
                assert reservation.released_at is not None
            else:
                assert reservation.status == "CONSUMED"
                assert reservation.released_at is None
                assert reservation.metadata_json["reconciliation_required"] is True
            if object_state == "size_mismatch":
                physical = tmp_path / upload.storage_bucket / upload.object_key
                if reservation_status == "CONSUMED":
                    assert physical.read_bytes() == b"wrong-size-payload"
                else:
                    # Payload is gone but the zero-byte fence must remain to
                    # reject a delayed conditional writer after quota release.
                    assert physical.exists() and physical.stat().st_size == 0
                    with pytest.raises(FileNotFoundError):
                        storage.get_object_metadata(bucket=upload.storage_bucket,
                            storage_path=upload.object_key, verified_organization_id=event.organization_id)
            audit = await db.scalar(select(AuditLog).where(AuditLog.resource_id == upload.id))
            assert audit is not None
            assert audit.organization_id == event.organization_id
        async with TenantContextGuard.scoped(db, foreign.id):
            await db.refresh(other)
            assert other.status == "uploading" and other.task_id is None
    finally:
        if not db.is_active:
            await db.rollback()
        await db.execute(text("RESET ROLE"))
        tenant_org_id.reset(token)


@pytest.mark.asyncio
async def test_recovery_discovery_is_bounded_and_does_not_inherit_customer_scope(db, monkeypatch):
    from app.tasks import upload_jobs
    organizations = [Organization(name="Recovery discovery", slug=f"recovery-page-{uuid.uuid4().hex}")
        for _ in range(205)]
    db.add_all(organizations)
    await db.commit()

    @asynccontextmanager
    async def sessions():
        yield db

    monkeypatch.setattr(upload_jobs, "AsyncSessionLocal", sessions)
    dispatched = []
    continuations = []
    monkeypatch.setattr(upload_jobs.recover_abandoned_uploads_for_tenant, "apply_async",
        lambda **kwargs: dispatched.append(kwargs))
    monkeypatch.setattr(upload_jobs.recover_abandoned_uploads, "apply_async",
        lambda **kwargs: continuations.append(kwargs))
    token = tenant_org_id.set(organizations[-1].id)
    try:
        await upload_jobs._recover_abandoned_uploads()
        assert len(dispatched) == 100 and len(continuations) == 1
        await upload_jobs._recover_abandoned_uploads(continuations[0]["args"][0])
        assert len(dispatched) == 200 and len(continuations) == 2
        await upload_jobs._recover_abandoned_uploads(continuations[1]["args"][0])
        assert len(dispatched) == 205 and len(continuations) == 2
        assert {call["args"][0] for call in dispatched} == {str(row.id) for row in organizations}
        assert all(call["headers"]["tenant_org_id"] == call["args"][0] for call in dispatched)
        assert all(call["headers"]["tenant_org_id"] == "" for call in continuations)
        assert tenant_org_id.get() == organizations[-1].id
    finally:
        tenant_org_id.reset(token)
