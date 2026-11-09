"""Real PostgreSQL + filesystem checks for historical failed-attempt fencing."""
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import uuid

import pytest
from sqlalchemy import func, select

from app.modules.audit.models.audit_log import AuditLog
from app.modules.files.models.file import DurableUpload
from app.modules.platform.models.organization_console import UsageReservation
from app.modules.presentations.services import upload_service as storage
from app.modules.registration.services import upload_fence_reconciliation as reconciliation


@pytest.fixture
def local_fence_storage(monkeypatch, tmp_path, db):
    monkeypatch.setattr(storage.settings, "STORAGE_MODE", "local")
    monkeypatch.setattr(storage, "LOCAL_STORAGE_ROOT", tmp_path)

    @asynccontextmanager
    async def sessions(organization_id):
        yield db

    monkeypatch.setattr(reconciliation, "tenant_job_session", sessions)
    return tmp_path


async def historical_attempt(db, event, *, status="RELEASED", audit=True, correct_path=True):
    key = f"tenant/{event.organization_id}/event/{event.id}/registration_upload/document/{uuid.uuid4()}.txt"
    row = DurableUpload(organization_id=event.organization_id, event_id=event.id,
        object_key=key, storage_bucket=storage.settings.S3_BUCKET_REGISTRATION_UPLOADS,
        original_filename="private-original.txt", mime_type="text/plain", size_bytes=5, status="failed")
    db.add(row)
    await db.flush()
    reservation = UsageReservation(organization_id=event.organization_id, event_id=event.id,
        metric_key="storage_quota_mb", quantity=1, unit="MB", status=status,
        idempotency_key=f"registration-upload:{uuid.uuid4()}", expires_at=datetime.now(timezone.utc),
        metadata_json={"upload_id": str(row.id), "storage_path": key if correct_path else key + "wrong"})
    db.add(reservation)
    await db.flush()
    if audit:
        db.add(AuditLog(organization_id=event.organization_id, resource_type="upload", resource_id=row.id,
            actor_role="SYSTEM", action_type="ABANDONED_UPLOAD_QUOTA_RELEASED", is_sensitive=True,
            new_state={"reservation_id": str(reservation.id), "reservation_status": "RELEASED",
                "event_id": str(event.id)}))
    await db.commit()
    return row, reservation


def apply_arguments(event):
    return dict(organization_id=event.organization_id, apply=True,
        approval_reference="isolated-test-approved", incompatible_writers_drained=True)


@pytest.mark.asyncio
async def test_missing_path_proposal_is_read_only_redacted_and_state_bound(db, event, local_fence_storage, monkeypatch):
    row, reservation = await historical_attempt(db, event)
    reservation.metadata_json = {"upload_id": str(row.id)}
    await db.commit()
    initial = dict(reservation.metadata_json)
    audit_count = await db.scalar(select(func.count()).select_from(AuditLog))

    def forbidden(*args, **kwargs):
        pytest.fail("Review must never contact storage")

    monkeypatch.setattr(reconciliation, "seal_registration_upload_key", forbidden)
    args = dict(organization_id=event.organization_id, only_upload_ids=(row.id,))
    first = await reconciliation.review_missing_upload_paths(**args)
    repeated = await reconciliation.review_missing_upload_paths(**args)
    assert first == repeated
    proposal = first["records"][0]
    assert proposal["status"] == "REVIEW_REQUIRED"
    assert proposal["proposed_source"] == "DurableUpload.object_key"
    assert "tenant/" not in str(first) and "private-original" not in str(first)
    assert row.storage_bucket not in str(first)
    assert reservation.metadata_json == initial and reservation.status == "RELEASED"
    assert await db.scalar(select(func.count()).select_from(AuditLog)) == audit_count
    # Ordinary approved fencing still rejects this row; review cannot bypass it.
    blocked = await reconciliation.reconcile_failed_upload_fences(**args, **{
        k: v for k, v in apply_arguments(event).items() if k != "organization_id"})
    assert blocked["records"][0]["status"] == "RECORDED_PATH_MISSING"
    reservation.metadata_json = {**initial, "operator_note": "changed after review"}
    await db.commit()
    changed = await reconciliation.review_missing_upload_paths(**args)
    assert changed["records"][0]["current_state_sha256"] != proposal["current_state_sha256"]


@pytest.mark.asyncio
async def test_labelled_local_rehearsal_never_becomes_provider_repair_proposal(
        db, event, local_fence_storage, monkeypatch):
    row, reservation = await historical_attempt(db, event)
    row.original_filename = "runtime-rehearsal.txt"
    row.object_key = (f"tenant/{event.organization_id}/event/{event.id}/"
        f"registration_upload/rehearsal/{row.id}.txt")
    reservation.idempotency_key = f"registration-upload:runtime-rehearsal-{row.id}"
    reservation.metadata_json = {"upload_id": str(row.id),
        "rehearsal": "category-a-local-runtime-recovery"}
    await db.commit()

    def forbidden(*args, **kwargs):
        pytest.fail("Synthetic provenance review must not contact storage")

    monkeypatch.setattr(reconciliation, "seal_registration_upload_key", forbidden)
    before = dict(reservation.metadata_json)
    result = await reconciliation.review_missing_upload_paths(
        organization_id=event.organization_id, only_upload_ids=(row.id,))

    assert result["records"] == [{"upload_id": str(row.id),
        "status": "SYNTHETIC_REHEARSAL_NO_PROVIDER_REPAIR",
        "provenance": "LOCAL_TEMPORARY_STORAGE",
        "provider_repair": "NOT_APPLICABLE"}]
    assert result["metadata_changed"] is False
    assert result["provider_io_performed"] is False
    await db.refresh(reservation)
    assert reservation.metadata_json == before


@pytest.mark.asyncio
@pytest.mark.parametrize("conflict", ["audit_missing", "reserved", "path_mismatch", "null_path", "foreign"])
async def test_missing_path_review_never_proposes_conflicting_basis(db, event, local_fence_storage, conflict):
    row, reservation = await historical_attempt(db, event, audit=conflict != "audit_missing",
        status="RESERVED" if conflict == "reserved" else "RELEASED")
    reservation.metadata_json = {"upload_id": str(row.id)}
    if conflict in {"path_mismatch", "null_path"}:
        reservation.metadata_json = {**reservation.metadata_json,
            "storage_path": None if conflict == "null_path" else "different-key"}
    await db.commit()
    result = await reconciliation.review_missing_upload_paths(organization_id=event.organization_id,
        only_upload_ids=(uuid.uuid4() if conflict == "foreign" else row.id,))
    expected = {"audit_missing": "RELEASE_AUDIT_MISSING_OR_AMBIGUOUS",
        "foreign": "NOT_IN_SCOPE_OR_NOT_FAILED"}.get(conflict, "OWNERSHIP_OR_ACCOUNTING_CONFLICT")
    assert result["records"][0]["status"] == expected
    assert "proposed_field" not in result["records"][0]


@pytest.mark.asyncio
async def test_historical_dry_run_seal_and_replay(db, event, local_fence_storage):
    row, reservation = await historical_attempt(db, event)
    storage.upload_bytes(row.storage_bucket, row.object_key, b"late!", verified_organization_id=event.organization_id)
    result = await reconciliation.reconcile_failed_upload_fences(organization_id=event.organization_id)
    assert result["records"] == [{"upload_id": str(row.id), "status": "ELIGIBLE"}]
    assert (local_fence_storage / row.storage_bucket / row.object_key).read_bytes() == b"late!"
    assert "cleanup_key_fence" not in reservation.metadata_json
    result = await reconciliation.reconcile_failed_upload_fences(**apply_arguments(event))
    assert result["records"][0]["status"] == "SEALED"
    assert (local_fence_storage / row.storage_bucket / row.object_key).read_bytes() == b""
    await db.refresh(reservation)
    assert reservation.status == "RELEASED" and reservation.metadata_json["cleanup_key_fence"]["state"] == "SEALED"
    # A historical receipt alone is not present-day provider evidence. Reapply
    # restores a missing marker without duplicating the completion audit.
    (local_fence_storage / row.storage_bucket / row.object_key).unlink()
    result = await reconciliation.reconcile_failed_upload_fences(**apply_arguments(event))
    assert result["records"][0]["status"] == "ALREADY_SEALED"
    assert (local_fence_storage / row.storage_bucket / row.object_key).read_bytes() == b""
    count = await db.scalar(select(func.count()).select_from(AuditLog).where(
        AuditLog.resource_id == row.id, AuditLog.action_type == "HISTORICAL_UPLOAD_KEY_FENCED"))
    assert count == 1
    assert "private-original" not in str(result) and "tenant/" not in str(result)


@pytest.mark.asyncio
@pytest.mark.parametrize("conflict", ["consumed", "reserved", "audit_missing", "path_mismatch", "audit_corrupt", "fence_receipt"])
async def test_historical_conflicts_never_touch_payload(db, event, local_fence_storage, conflict):
    row, reservation = await historical_attempt(db, event,
        status={"consumed": "CONSUMED", "reserved": "RESERVED"}.get(conflict, "RELEASED"),
        audit=conflict != "audit_missing", correct_path=conflict != "path_mismatch")
    if conflict == "audit_corrupt":
        # Simulate imported damaged history without weakening normal audit writers.
        from sqlalchemy import text
        await db.execute(text("UPDATE command_center_audit.logs SET row_hash=:hash WHERE resource_id=:id"),
            {"hash": "0" * 64, "id": row.id})
        await db.commit()
    if conflict == "fence_receipt":
        reservation.metadata_json = {**reservation.metadata_json, "cleanup_key_fence": "unrecognised"}
        await db.commit()
    storage.upload_bytes(row.storage_bucket, row.object_key, b"kept!", verified_organization_id=event.organization_id)
    result = await reconciliation.reconcile_failed_upload_fences(**apply_arguments(event))
    assert result["records"][0]["status"] in {
        "OWNERSHIP_OR_ACCOUNTING_CONFLICT", "RELEASE_AUDIT_MISSING_OR_AMBIGUOUS", "RELEASE_AUDIT_CONFLICT", "FENCE_RECEIPT_CONFLICT"}
    assert (local_fence_storage / row.storage_bucket / row.object_key).read_bytes() == b"kept!"
    if conflict == "fence_receipt":
        assert reservation.metadata_json["cleanup_key_fence"] == "unrecognised"
    else:
        assert "cleanup_key_fence" not in reservation.metadata_json


@pytest.mark.asyncio
async def test_historical_provider_failure_retains_committed_intent_then_recovers(db, event, local_fence_storage, monkeypatch):
    row, reservation = await historical_attempt(db, event)
    original = reconciliation.seal_registration_upload_key

    def unavailable(*args, **kwargs):
        raise RuntimeError("Provider unavailable")

    monkeypatch.setattr(reconciliation, "seal_registration_upload_key", unavailable)
    result = await reconciliation.reconcile_failed_upload_fences(**apply_arguments(event))
    assert result["retry_page"] and result["records"][0]["status"] == "PROVIDER_UNAVAILABLE"
    await db.refresh(reservation)
    assert reservation.metadata_json["cleanup_key_fence"]["state"] == "PENDING"
    monkeypatch.setattr(reconciliation, "seal_registration_upload_key", original)
    result = await reconciliation.reconcile_failed_upload_fences(**apply_arguments(event))
    assert not result["retry_page"] and result["records"][0]["status"] == "SEALED"


@pytest.mark.asyncio
async def test_historical_pages_bound_and_preserve_blocked_records(db, event, local_fence_storage):
    first, _ = await historical_attempt(db, event, audit=False)
    second, _ = await historical_attempt(db, event)
    page = await reconciliation.reconcile_failed_upload_fences(organization_id=event.organization_id, limit=1)
    assert len(page["records"]) == 1 and page["next_cursor"]
    following = await reconciliation.reconcile_failed_upload_fences(organization_id=event.organization_id,
        limit=1, after=uuid.UUID(page["next_cursor"]))
    assert following["next_cursor"] is None
    assert {page["records"][0]["upload_id"], following["records"][0]["upload_id"]} == {str(first.id), str(second.id)}
    assert {page["records"][0]["status"], following["records"][0]["status"]} == {
        "ELIGIBLE", "RELEASE_AUDIT_MISSING_OR_AMBIGUOUS"}


@pytest.mark.asyncio
async def test_historical_apply_requires_explicit_operational_approval(event):
    with pytest.raises(ValueError, match="approval reference"):
        await reconciliation.reconcile_failed_upload_fences(organization_id=event.organization_id, apply=True)
    for size in (0, 101, True):
        with pytest.raises(ValueError, match="Page size"):
            await reconciliation.reconcile_failed_upload_fences(organization_id=event.organization_id, limit=size)


@pytest.mark.asyncio
async def test_historical_exact_selection_never_applies_other_eligible_rows(db, event, local_fence_storage):
    selected, _ = await historical_attempt(db, event)
    untouched, reservation = await historical_attempt(db, event)
    storage.upload_bytes(untouched.storage_bucket, untouched.object_key, b"kept!", verified_organization_id=event.organization_id)
    result = await reconciliation.reconcile_failed_upload_fences(**apply_arguments(event), only_upload_ids=(selected.id,))
    assert result["records"] == [{"upload_id": str(selected.id), "status": "SEALED"}]
    assert (local_fence_storage / untouched.storage_bucket / untouched.object_key).read_bytes() == b"kept!"
    assert "cleanup_key_fence" not in reservation.metadata_json


@pytest.mark.asyncio
async def test_historical_duplicate_reservations_block_cleanup(db, event, local_fence_storage):
    row, reservation = await historical_attempt(db, event)
    db.add(UsageReservation(organization_id=event.organization_id, event_id=event.id,
        metric_key="storage_quota_mb", quantity=1, unit="MB", status="RELEASED",
        idempotency_key=f"registration-upload:{uuid.uuid4()}", expires_at=datetime.now(timezone.utc),
        metadata_json=dict(reservation.metadata_json)))
    await db.commit()
    result = await reconciliation.reconcile_failed_upload_fences(**apply_arguments(event))
    assert result["records"] == [{"upload_id": str(row.id), "status": "AMBIGUOUS_RESERVATION"}]
    assert not (local_fence_storage / row.storage_bucket / row.object_key).exists()


@pytest.mark.asyncio
async def test_historical_unknown_reviewed_ids_cannot_produce_empty_success(event, local_fence_storage):
    unknown = uuid.uuid4()
    result = await reconciliation.reconcile_failed_upload_fences(**apply_arguments(event), only_upload_ids=(unknown,))
    assert result["records"] == [{"upload_id": str(unknown), "status": "NOT_IN_SCOPE_OR_NOT_FAILED"}]


@pytest.mark.asyncio
async def test_historical_malformed_managed_path_is_blocked_not_skipped(db, event, local_fence_storage):
    row, _ = await historical_attempt(db, event)
    row.object_key = f"tenant/not-a-uuid/event/{event.id}/registration_upload/invalid.txt"
    await db.commit()
    result = await reconciliation.reconcile_failed_upload_fences(**apply_arguments(event))
    assert result["records"] == [{"upload_id": str(row.id), "status": "INVALID_MANAGED_KEY"}]


@pytest.mark.asyncio
async def test_reviewed_selection_must_fit_one_page_without_cursor(event):
    value = uuid.uuid4()
    for selection, cursor, limit in (((value, value), None, 50), ((value,), value, 50),
            ((value, uuid.uuid4()), None, 1), ((), None, 50)):
        with pytest.raises(ValueError, match="Reviewed selection"):
            await reconciliation.reconcile_failed_upload_fences(organization_id=event.organization_id,
                only_upload_ids=selection, after=cursor, limit=limit)
