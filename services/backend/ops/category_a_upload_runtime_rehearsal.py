"""Local-only migrated-schema upload recovery using the actual restricted login.

Creates labelled synthetic evidence in the already approved rehearsal cohort.
Passwords remain process-local. Never accepts a customer/staging/production DB.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import secrets
import sys
import tempfile
import uuid

sys.path.insert(0, str(Path(__file__).parents[1]))
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from app.config import settings
from bootstrap_cloud_database import upsert_login


def main():
    if settings.is_production:
        raise RuntimeError("Rehearsal is forbidden in production")
    target = make_url(settings.DATABASE_URL_SYNC).set(database="category_a_rehearsal_20261015")
    if target.host not in {"localhost", "127.0.0.1"}:
        raise RuntimeError("Rehearsal requires the explicit isolated local database")
    cohort_path = Path(__file__).parents[3] / "docs/category-a/plans-status-evidence/2026-10-15/rehearsal-cohort.json"
    cohort_document = json.loads(cohort_path.read_text(encoding="utf-8"))
    cohort = cohort_document if isinstance(cohort_document, list) else cohort_document["organizations"]
    owners = [uuid.UUID(row["organization_id"]) for row in cohort]
    if len(owners) < 2:
        raise RuntimeError("Two approved local customer tenants are required")
    organization_id, foreign_id = owners[:2]
    engine = create_engine(target)
    login, password = "category_a_rehearsal_runtime_20261015", secrets.token_urlsafe(40)
    raw = engine.raw_connection()
    try:
        with raw.cursor() as cursor:
            upsert_login(cursor, login, password, "event_runtime")
        raw.commit()
    finally:
        raw.close()
    upload_id, other_id, reservation_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    stale = datetime.now(timezone.utc) - timedelta(hours=1)
    with engine.begin() as connection:
        customer_count = connection.execute(text("""SELECT count(*) FROM platform.organizations
            WHERE id IN (:target,:foreign) AND is_platform_org IS FALSE"""),
            {"target": organization_id, "foreign": foreign_id}).scalar_one()
        if customer_count != 2:
            raise RuntimeError("Both rehearsal targets must be separate customer organisations")
        event_id = connection.execute(text("SELECT id FROM events.events WHERE organization_id=:owner ORDER BY id LIMIT 1"),
            {"owner": organization_id}).scalar_one()
        for row_id, owner, event in ((upload_id, organization_id, event_id), (other_id, foreign_id, None)):
            connection.execute(text("""INSERT INTO content.durable_uploads
                (id, organization_id, event_id, object_key, storage_bucket, original_filename,
                 mime_type, size_bytes, status, version, created_at, updated_at)
                VALUES (:id,:owner,:event,:key,:bucket,'runtime-rehearsal.txt',
                    'text/plain',10,'uploading',1,:stale,:stale)"""),
                {"id": row_id, "owner": owner, "event": event,
                 "key": f"tenant/{owner}/event/{event}/registration_upload/rehearsal/{row_id}.txt",
                 "bucket": settings.S3_BUCKET_REGISTRATION_UPLOADS, "stale": stale})
        connection.execute(text("""INSERT INTO platform.usage_reservations
            (id,organization_id,event_id,metric_key,quantity,unit,status,idempotency_key,
             expires_at,metadata_json,created_at)
            VALUES (:id,:owner,:event,'storage_quota_mb',1,'MB','RESERVED',:key,
                :stale,CAST(:metadata AS jsonb),:stale)"""),
            {"id": reservation_id, "owner": organization_id, "event": event_id,
             "key": f"registration-upload:runtime-rehearsal-{upload_id}", "stale": stale,
             "metadata": json.dumps({"upload_id": str(upload_id), "delivery_hold": True,
                 "rehearsal": "category-a-local-runtime-recovery"})})
    settings.DATABASE_URL_ASYNC = target.set(drivername="postgresql+asyncpg",
        username=login, password=password).render_as_string(hide_password=False)
    settings.STORAGE_MODE = "local"
    with tempfile.TemporaryDirectory(prefix="category-a-empty-object-store-") as storage_root:
        from app.modules.presentations.services import upload_service as storage
        storage.LOCAL_STORAGE_ROOT = Path(storage_root)
        result = asyncio.run(check_runtime(organization_id, foreign_id, upload_id, other_id))
    with engine.connect() as connection:
        rows = dict(connection.execute(text("SELECT id,status FROM content.durable_uploads WHERE id IN (:first,:second)"),
            {"first": upload_id, "second": other_id}).all())
        status = connection.execute(text("SELECT status FROM platform.usage_reservations WHERE id=:id"),
            {"id": reservation_id}).scalar_one()
        audit_count = connection.execute(text("SELECT count(*) FROM command_center_audit.logs WHERE resource_id=:id AND action_type='ABANDONED_UPLOAD_QUOTA_RELEASED'"),
            {"id": upload_id}).scalar_one()
    engine.dispose()
    assert rows[upload_id] == "failed" and rows[other_id] == "uploading"
    assert status == "RELEASED" and audit_count == 1
    print(json.dumps({**result, "database": target.database,
        "target_status": rows[upload_id], "foreign_status": rows[other_id],
        "reservation_status": status, "mandatory_audits": audit_count,
        "synthetic_upload_ids": [str(upload_id), str(other_id)],
        "status": "PASSED"}, indent=2))


async def check_runtime(organization_id, foreign_id, upload_id, other_id):
    from app.database import AsyncSessionLocal, async_engine, tenant_org_id
    from app.tasks import upload_jobs
    try:
        async with AsyncSessionLocal() as db:
            role = (await db.execute(text("SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user"))).one()
            assert not role.rolsuper and not role.rolbypassrls
            visible = await db.scalar(text("SELECT count(*) FROM content.durable_uploads WHERE id IN (:a,:b)"),
                {"a": upload_id, "b": other_id})
            assert visible == 0
        token = tenant_org_id.set(foreign_id)
        try:
            await upload_jobs._recover_abandoned_tenant_uploads(organization_id)
            assert tenant_org_id.get() == foreign_id
        finally:
            tenant_org_id.reset(token)
        return {"runtime_login": role.current_user, "superuser": False,
            "bypass_rls": False, "missing_context_visible": 0,
            "inherited_context_restored": True}
    finally:
        await async_engine.dispose()


if __name__ == "__main__":
    main()
