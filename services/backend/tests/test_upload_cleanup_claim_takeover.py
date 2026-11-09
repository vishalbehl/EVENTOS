"""A stale cleanup decision must not delete a newly finalized attempt."""
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
import threading
import io
import hashlib
import uuid

import pytest
from sqlalchemy import select, update

from app.core.tenant_context import TenantContextGuard
from app.modules.files.models.file import DurableUpload
from app.modules.platform.models.organization_console import UsageReservation
from app.modules.registration.models.registration_form_config import RegistrationFormConfig
from tests.conftest import activate_event_for_test


@pytest.mark.asyncio
async def test_cleanup_intent_cannot_be_revived_by_newer_recovery(db, event, monkeypatch, tmp_path):
    from app.tasks import upload_jobs, tenant_job_scope
    from app.modules.presentations.services import upload_service as storage
    await activate_event_for_test(db, event)
    owner, event_id = event.organization_id, event.id
    monkeypatch.setattr(storage.settings, "STORAGE_MODE", "local")
    monkeypatch.setattr(storage, "LOCAL_STORAGE_ROOT", tmp_path)
    payload = b"%PDF-1.4\nRecovery claim ordering fixture\n"
    stale = datetime.now(timezone.utc) - timedelta(hours=1)
    upload_id = uuid.uuid4()
    key = f"tenant/{owner}/event/{event_id}/registration_upload/proof_document/{upload_id}.pdf"
    form = RegistrationFormConfig(event_id=event_id, is_live=False, fields=[{
        "id": "proof_document", "name": "proof_document", "label": "Proof", "type": "file"}], settings={})
    row = DurableUpload(id=upload_id, organization_id=owner, event_id=event_id,
        object_key=key, storage_bucket=storage.settings.S3_BUCKET_REGISTRATION_UPLOADS,
        original_filename="proof.pdf", mime_type="application/pdf", size_bytes=len(payload),
        status="uploading", updated_at=stale)
    db.add_all([form, row])
    await db.flush()
    reservation = UsageReservation(organization_id=owner, event_id=event_id,
        metric_key="storage_quota_mb", quantity=1, unit="MB", status="RESERVED",
        idempotency_key=f"registration-upload:{uuid.uuid4()}", expires_at=stale,
        metadata_json={"upload_id": str(upload_id), "field_name": "proof_document", "storage_path": key,
            "delivery_hold": True, "capability_expires_at": int((datetime.now(timezone.utc) + timedelta(hours=1)).timestamp()),
            "consumption_quantity": len(payload), "consumption_unit": "bytes"})
    db.add(reservation)
    await db.commit()
    storage.upload_bytes(row.storage_bucket, key, payload, verified_organization_id=owner)
    @asynccontextmanager
    async def sessions():
        yield db
    monkeypatch.setattr(tenant_job_scope, "AsyncSessionLocal", sessions)
    monkeypatch.setattr(upload_jobs.process_durable_upload, "apply_async", lambda **kwargs: None)
    before_delete, resume_delete = threading.Event(), threading.Event()
    original_delete = storage.seal_registration_upload_key
    delete_calls = 0
    delete_lock = threading.Lock()
    def paused_delete(*args, **kwargs):
        nonlocal delete_calls
        with delete_lock:
            delete_calls += 1
            first = delete_calls == 1
        if first:
            before_delete.set()
            assert resume_delete.wait(10)
        return original_delete(*args, **kwargs)
    monkeypatch.setattr(upload_jobs, "seal_registration_upload_key", paused_delete)
    older = asyncio.create_task(upload_jobs._recover_abandoned_tenant_uploads(owner))
    try:
        assert await asyncio.to_thread(before_delete.wait, 5)
        # Model a suspended old process and an expired 15-minute recovery lease.
        # No two coroutines use the DB session concurrently: old IO is paused.
        async with TenantContextGuard.scoped(db, owner):
            await db.refresh(row)
            assert row.status == "cleanup_pending"
            from app.modules.registration.services.managed_registration_uploads import require_upload_not_recovering
            from fastapi import HTTPException
            with pytest.raises(HTTPException) as denied:
                require_upload_not_recovering(row)
            assert denied.value.status_code == 409
            form.is_live = True
            await db.execute(update(DurableUpload).where(DurableUpload.id == upload_id).values(updated_at=stale))
            await db.commit()
        await upload_jobs._recover_abandoned_tenant_uploads(owner)
        async with TenantContextGuard.scoped(db, owner):
            await db.refresh(reservation)
            await db.refresh(row)
            assert reservation.status == "RELEASED" and row.status == "failed"
        resume_delete.set()
        await asyncio.wait_for(older, 10)
        with pytest.raises(FileNotFoundError):
            storage.get_object_metadata(bucket=row.storage_bucket, storage_path=key, verified_organization_id=owner)
        from app.modules.audit.models.audit_log import AuditLog
        async with TenantContextGuard.scoped(db, owner):
            actions = list((await db.scalars(select(AuditLog.action_type).where(AuditLog.resource_id == upload_id))).all())
            assert actions.count("UPLOAD_CLEANUP_INTENT_RECORDED") == 1
            assert actions.count("ABANDONED_UPLOAD_QUOTA_RELEASED") == 1
    finally:
        resume_delete.set()
        await asyncio.gather(older, return_exceptions=True)


@pytest.mark.asyncio
@pytest.mark.parametrize("newer_state", ["superseded", "consumed", "ready", "changed_path"])
async def test_stale_cleanup_intent_rechecks_current_locked_state(db, event, monkeypatch, newer_state):
    from app.tasks import upload_jobs, tenant_job_scope
    from app.modules.audit.models.audit_log import AuditLog
    owner, upload_id = event.organization_id, uuid.uuid4()
    key = f"tenant/{owner}/event/{event.id}/registration_upload/proof/{upload_id}.pdf"
    row = DurableUpload(id=upload_id, organization_id=owner, event_id=event.id,
        object_key=key, storage_bucket="registration_uploads", original_filename="proof.pdf",
        mime_type="application/pdf", size_bytes=10,
        status="ready" if newer_state == "ready" else "uploaded",
        task_id="recovery:newer" if newer_state == "superseded" else "recovery:older")
    db.add(row)
    await db.flush()
    if newer_state == "consumed":
        db.add(UsageReservation(organization_id=owner, event_id=event.id,
            metric_key="storage_quota_mb", quantity=1, unit="MB", status="CONSUMED",
            idempotency_key=f"registration-upload:{uuid.uuid4()}", expires_at=datetime.now(timezone.utc),
            metadata_json={"upload_id": str(upload_id)}))
    await db.commit()
    @asynccontextmanager
    async def sessions():
        yield db
    monkeypatch.setattr(tenant_job_scope, "AsyncSessionLocal", sessions)
    assert not await upload_jobs._commit_upload_cleanup_intent(organization_id=owner, upload_id=upload_id,
        claim_token="recovery:older", bucket="registration_uploads",
        object_key=key + ".stale" if newer_state == "changed_path" else key, reason="Obsolete cleanup decision")
    async with TenantContextGuard.scoped(db, owner):
        await db.refresh(row)
        assert row.status == ("ready" if newer_state == "ready" else "uploaded") and row.version == 1
        assert await db.scalar(select(AuditLog.id).where(AuditLog.resource_id == upload_id)) is None


@pytest.mark.asyncio
async def test_cleanup_intent_is_idempotent_and_processing_cannot_publish_it(db, event, monkeypatch):
    from app.tasks import upload_jobs, tenant_job_scope
    from app.modules.audit.models.audit_log import AuditLog
    owner, upload_id = event.organization_id, uuid.uuid4()
    key = f"tenant/{owner}/event/{event.id}/registration_upload/proof/{upload_id}.pdf"
    row = DurableUpload(id=upload_id, organization_id=owner, event_id=event.id,
        object_key=key, storage_bucket="registration_uploads", original_filename="proof.pdf",
        mime_type="application/pdf", size_bytes=10, status="uploaded", task_id="recovery:older")
    db.add(row)
    await db.commit()
    @asynccontextmanager
    async def sessions():
        yield db
    monkeypatch.setattr(tenant_job_scope, "AsyncSessionLocal", sessions)
    monkeypatch.setattr(upload_jobs, "AsyncSessionLocal", sessions)
    arguments = dict(organization_id=owner, upload_id=upload_id, claim_token="recovery:older",
        bucket="registration_uploads", object_key=key, reason="Previously approved cleanup")
    assert await upload_jobs._commit_upload_cleanup_intent(**arguments)
    assert await upload_jobs._commit_upload_cleanup_intent(**arguments)
    async with TenantContextGuard.scoped(db, owner):
        await db.execute(update(DurableUpload).where(DurableUpload.id == upload_id).values(
            updated_at=datetime.now(timezone.utc) - timedelta(hours=1)))
        await db.commit()
    def no_provider_io(**kwargs):
        pytest.fail("A cleanup intent must not be scanned/published")
    monkeypatch.setattr(upload_jobs, "get_object_metadata", no_provider_io)
    result = await upload_jobs._process(upload_id, owner, "late-processing-task")
    assert result["status"] == "cleanup_pending" and result["in_progress"]
    async with TenantContextGuard.scoped(db, owner):
        await upload_jobs._mark_upload_failed(upload_id, owner, "late-processing-task", RuntimeError("late retry"))
        await db.refresh(row)
        assert row.status == "cleanup_pending" and row.version == 2
        assert len((await db.scalars(select(AuditLog).where(AuditLog.resource_id == upload_id))).all()) == 1


@pytest.mark.asyncio
async def test_cleanup_provider_failure_retains_intent_and_quota_until_recovery(db, event, monkeypatch, tmp_path):
    from app.tasks import upload_jobs, tenant_job_scope
    from app.modules.presentations.services import upload_service as storage
    owner, upload_id = event.organization_id, uuid.uuid4()
    stale = datetime.now(timezone.utc) - timedelta(hours=1)
    key = f"tenant/{owner}/event/{event.id}/registration_upload/proof/{upload_id}.pdf"
    monkeypatch.setattr(storage.settings, "STORAGE_MODE", "local")
    monkeypatch.setattr(storage, "LOCAL_STORAGE_ROOT", tmp_path)
    row = DurableUpload(id=upload_id, organization_id=owner, event_id=event.id,
        object_key=key, storage_bucket="registration_uploads", original_filename="proof.pdf",
        mime_type="application/pdf", size_bytes=10, status="uploading", updated_at=stale)
    db.add(row)
    await db.flush()
    hold = UsageReservation(organization_id=owner, event_id=event.id, metric_key="storage_quota_mb",
        quantity=1, unit="MB", status="RESERVED", expires_at=stale,
        idempotency_key=f"registration-upload:{uuid.uuid4()}",
        metadata_json={"upload_id": str(upload_id), "delivery_hold": True, "storage_path": key})
    db.add(hold)
    await db.commit()
    storage.upload_bytes("registration_uploads", key, b"short", verified_organization_id=owner)
    @asynccontextmanager
    async def sessions():
        yield db
    monkeypatch.setattr(tenant_job_scope, "AsyncSessionLocal", sessions)
    def unavailable(*args, **kwargs):
        raise ConnectionError("Injected object deletion outage")
    monkeypatch.setattr(upload_jobs, "seal_registration_upload_key", unavailable)
    await upload_jobs._recover_abandoned_tenant_uploads(owner)
    async with TenantContextGuard.scoped(db, owner):
        await db.refresh(row)
        await db.refresh(hold)
        assert row.status == "cleanup_pending" and hold.status == "RESERVED" and hold.metadata_json["delivery_hold"]
        assert storage.get_object_metadata(bucket="registration_uploads", storage_path=key,
            verified_organization_id=owner)["size"] == 5
        await db.execute(update(DurableUpload).where(DurableUpload.id == upload_id).values(updated_at=stale))
        await db.commit()
    monkeypatch.setattr(upload_jobs, "seal_registration_upload_key", storage.seal_registration_upload_key)
    await upload_jobs._recover_abandoned_tenant_uploads(owner)
    async with TenantContextGuard.scoped(db, owner):
        await db.refresh(row)
        await db.refresh(hold)
        assert row.status == "failed" and hold.status == "RELEASED" and not hold.metadata_json["delivery_hold"]
    with pytest.raises(FileNotFoundError):
        storage.get_object_metadata(bucket="registration_uploads", storage_path=key, verified_organization_id=owner)


@pytest.mark.asyncio
async def test_late_storage_write_cannot_create_orphan_after_missing_recovery(db, event, monkeypatch, tmp_path):
    from app.tasks import upload_jobs, tenant_job_scope
    from app.modules.presentations.services import upload_service as storage
    owner, upload_id = event.organization_id, uuid.uuid4()
    stale = datetime.now(timezone.utc) - timedelta(hours=1)
    payload = b"%PDF-1.4\nDelayed provider write fixture\n"
    key = f"tenant/{owner}/event/{event.id}/registration_upload/proof/{upload_id}.pdf"
    monkeypatch.setattr(storage.settings, "STORAGE_MODE", "local")
    monkeypatch.setattr(storage, "LOCAL_STORAGE_ROOT", tmp_path)
    row = DurableUpload(id=upload_id, organization_id=owner, event_id=event.id,
        object_key=key, storage_bucket="registration_uploads", original_filename="proof.pdf",
        mime_type="application/pdf", size_bytes=len(payload), status="uploading", updated_at=stale)
    db.add(row)
    await db.flush()
    hold = UsageReservation(organization_id=owner, event_id=event.id, metric_key="storage_quota_mb",
        quantity=1, unit="MB", status="RESERVED", expires_at=stale,
        idempotency_key=f"registration-upload:{uuid.uuid4()}",
        metadata_json={"upload_id": str(upload_id), "delivery_hold": True, "storage_path": key})
    db.add(hold)
    await db.commit()
    @asynccontextmanager
    async def sessions():
        yield db
    monkeypatch.setattr(tenant_job_scope, "AsyncSessionLocal", sessions)
    await upload_jobs._recover_abandoned_tenant_uploads(owner)
    async with TenantContextGuard.scoped(db, owner):
        await db.refresh(row)
        await db.refresh(hold)
        assert row.status == "failed" and hold.status == "RELEASED"
    # A suspended request resumes its provider transfer after the recovery pass.
    with pytest.raises(storage.RegistrationUploadWriteConflict):
        storage.upload_fileobj("registration_uploads", key, io.BytesIO(payload),
            content_type="application/pdf", verified_organization_id=owner,
            write_once=True, expected_checksum=hashlib.sha256(payload).hexdigest())
    await upload_jobs._recover_abandoned_tenant_uploads(owner)
    with pytest.raises(FileNotFoundError):
        storage.get_object_metadata(bucket="registration_uploads", storage_path=key, verified_organization_id=owner)
