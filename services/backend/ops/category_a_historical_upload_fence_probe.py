"""Isolated restricted-role/provider proof for one new synthetic historical row.

Never reconciles pre-existing upload IDs or storage. Credentials stay in memory.
"""
import argparse
import asyncio
from datetime import datetime, timezone
import json
from pathlib import Path
import secrets
import sys
from types import SimpleNamespace
import uuid

sys.path.insert(0, str(Path(__file__).parents[1]))
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import make_url
from app.config import settings
from bootstrap_cloud_database import upsert_login
from category_a_isolated_storage import isolated_storage


async def probe(owner, event_id, snapshot_directory=None):
    import app.models
    from app.modules.audit.models.audit_log import AuditLog
    from app.modules.files.models.file import DurableUpload
    from app.modules.platform.models.organization_console import UsageReservation
    from app.modules.presentations.services import upload_service as storage
    from app.tasks.tenant_job_scope import tenant_job_session
    from category_a_upload_fence_reconciliation import run

    upload_id, reservation_id = uuid.uuid4(), uuid.uuid4()
    key = f"tenant/{owner}/event/{event_id}/registration_upload/historical-proof/{upload_id}.txt"
    bucket = settings.S3_BUCKET_REGISTRATION_UPLOADS
    async with tenant_job_session(owner) as db:
        db.add(DurableUpload(id=upload_id, organization_id=owner, event_id=event_id,
            object_key=key, storage_bucket=bucket, original_filename="historical-proof.txt",
            mime_type="text/plain", size_bytes=5, status="failed"))
        db.add(UsageReservation(id=reservation_id, organization_id=owner, event_id=event_id,
            metric_key="storage_quota_mb", quantity=1, unit="MB", status="RELEASED",
            released_at=datetime.now(timezone.utc), expires_at=datetime.now(timezone.utc),
            idempotency_key=f"registration-upload:{uuid.uuid4()}",
            metadata_json={"upload_id": str(upload_id), "storage_path": key}))
        db.add(AuditLog(organization_id=owner, resource_type="upload", resource_id=upload_id,
            actor_role="SYSTEM", is_sensitive=True, action_type="ABANDONED_UPLOAD_QUOTA_RELEASED",
            new_state={"reservation_id": str(reservation_id), "event_id": str(event_id),
                "reservation_status": "RELEASED"},
            change_diff={"rehearsal": "synthetic historical fence protocol; no customer storage"}))
        await db.commit()
    await asyncio.to_thread(storage.upload_bytes, bucket, key, b"late!", verified_organization_id=owner)
    args = SimpleNamespace(organization_id=owner, expected_database="category_a_rehearsal_20261015",
        build_id="33b3f156-dirty-historical-fence-proof", after=None, limit=50,
        apply=False, approval_reference="user-approved-isolated-local-category-a-rehearsal",
        incompatible_writers_drained=True, upload_id=[upload_id])
    if snapshot_directory is not None:
        args.upload_id = []
        args.capture_snapshot = snapshot_directory
        captured = await run(args)
        assert captured["complete"] and captured["record_count"] == 1 and captured["page_count"] == 1
        del args.capture_snapshot
        args.snapshot_dir, args.snapshot_page = snapshot_directory, 0
        args.reviewed_page_sha256 = (snapshot_directory / "pages.index").read_text().strip().split()[2]
    dry = await run(args)
    assert dry["records"] == [{"upload_id": str(upload_id), "status": "ELIGIBLE"}]
    assert b"".join(storage.iter_object_chunks(bucket, key, verified_organization_id=owner)) == b"late!"
    args.apply = True
    applied = await run(args)
    assert applied["records"] == [{"upload_id": str(upload_id), "status": "SEALED"}]
    replay = await run(args)
    assert replay["records"] == [{"upload_id": str(upload_id), "status": "ALREADY_SEALED"}]
    client = storage._get_s3_client()
    try:
        head = client.head_object(Bucket=bucket, Key=key)
        assert head["ContentLength"] == 0 and head["Metadata"]["conf-platform-cleanup-fence"] == "v1"
    finally:
        client.close()
    try:
        await asyncio.to_thread(storage.upload_bytes, bucket, key, b"late!", verified_organization_id=owner)
    except storage.RegistrationUploadWriteConflict:
        pass
    else:
        raise AssertionError("Historical fence allowed a delayed write")
    async with tenant_job_session(owner) as db:
        audits = list((await db.scalars(select(AuditLog).where(AuditLog.resource_id == upload_id,
            AuditLog.action_type == "HISTORICAL_UPLOAD_KEY_FENCED"))).all())
        reservation = await db.get(UsageReservation, reservation_id)
        assert len(audits) == 1 and reservation.status == "RELEASED"
    return {"status": "PASSED", "database": args.expected_database, "upload_id": str(upload_id),
        "fixed_snapshot_cli_roundtrip": snapshot_directory is not None,
        "snapshot_directory": str(snapshot_directory) if snapshot_directory is not None else None,
        "actual_restricted_non_owner_login": True, "exact_generated_upload_only": True,
        "dry_run_preserved_bytes": True, "real_provider_zero_byte_fence": True,
        "delayed_write_rejected": True, "replay_one_completion_audit": True,
        "accounting_remained_released": True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--snapshot-roundtrip", action="store_true")
    args = parser.parse_args()
    if args.output.exists() or not args.output.parent.is_dir():
        parser.error("Output must be a new evidence file in an existing directory")
    target = make_url(settings.DATABASE_URL_SYNC).set(database="category_a_rehearsal_20261015")
    if settings.is_production or target.host not in {"localhost", "127.0.0.1"}:
        raise RuntimeError("Only the named isolated local rehearsal is permitted")
    owner = uuid.UUID("5a6ed530-6787-4985-87cc-92faf98345d3" if args.snapshot_roundtrip
        else "0a62c7fc-5ee2-40fb-871c-2c74d59098cf")
    operator = create_engine(target)
    password = secrets.token_urlsafe(40)
    raw = operator.raw_connection()
    try:
        with raw.cursor() as cursor:
            upsert_login(cursor, "category_a_rehearsal_runtime_20261015", password, "event_runtime")
        raw.commit()
    finally:
        raw.close()
    with operator.connect() as connection:
        if args.snapshot_roundtrip:
            existing = connection.execute(text("""SELECT count(*) FROM content.durable_uploads
                WHERE organization_id=:owner AND status='failed'"""), {"owner": owner}).scalar_one()
            if existing != 0:
                raise RuntimeError("Snapshot roundtrip requires this approved test tenant to have no existing failed uploads")
        event_id = connection.execute(text("""SELECT e.id FROM events.events e
            JOIN platform.organizations o ON o.id=e.organization_id
            WHERE e.organization_id=:owner AND NOT o.is_platform_org ORDER BY e.id LIMIT 1"""),
            {"owner": owner}).scalar_one()
    operator.dispose()
    settings.DATABASE_URL_SYNC = target.set(username="category_a_rehearsal_runtime_20261015",
        password=password).render_as_string(hide_password=False)
    settings.DATABASE_URL_ASYNC = target.set(drivername="postgresql+asyncpg",
        username="category_a_rehearsal_runtime_20261015", password=password).render_as_string(hide_password=False)
    with isolated_storage(settings.S3_BUCKET_REGISTRATION_UPLOADS) as (endpoint, username, secret):
        settings.STORAGE_MODE = "s3"
        settings.S3_ENDPOINT_URL = endpoint
        settings.S3_ACCESS_KEY_ID, settings.S3_SECRET_ACCESS_KEY = username, secret
        settings.S3_FORCE_PATH_STYLE = True
        try:
            snapshot_directory = (args.output.parent / f"historical-fence-snapshot-{uuid.uuid4().hex}"
                if args.snapshot_roundtrip else None)
            result = asyncio.run(probe(owner, event_id, snapshot_directory))
        except Exception as exc:
            print(json.dumps({"status": "FAILED", "error_type": type(exc).__name__}))
            return 1
    result["disposable_storage_removed"] = True
    with args.output.open("x", encoding="utf-8") as handle:
        json.dump(result, handle, indent=2)
        handle.write("\n")
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
