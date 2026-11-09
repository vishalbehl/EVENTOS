"""Tenant-scoped, bounded dispatch recovery for committed registration uploads."""
import asyncio
import uuid
from datetime import datetime, timezone

from loguru import logger
from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import UUID

from app.core.async_runner import run_async
from app.core.upload_service import UploadService
from app.database import AsyncSessionLocal
from app.modules.audit.models.audit_log import AuditLog
from app.modules.files.models.file import DurableUpload
from app.modules.platform.models.organization import Organization
from app.modules.platform.models.organization_console import UsageReservation
from app.tasks.tenant_job_scope import tenant_job_session
from app.worker import celery_app


async def recover_tenant(organization_id):
    messages = []
    now = datetime.now(timezone.utc).timestamp()
    async with tenant_job_session(organization_id) as db:
        # Indexed organisation/key order, with one bounded page per invocation.
        records = (await db.scalars(select(UsageReservation).where(
            UsageReservation.organization_id == organization_id,
            UsageReservation.status == "CONSUMED",
            or_(
                UsageReservation.idempotency_key.like("program-upload:%"),
                UsageReservation.idempotency_key.like("registration-upload:%"),
            ),
            UsageReservation.metadata_json["dispatch_due"].as_float() <= now,
        ).join(DurableUpload, (DurableUpload.id == UsageReservation.metadata_json["upload_id"].as_string().cast(UUID(as_uuid=True)))
            & (DurableUpload.organization_id == organization_id)
            & (DurableUpload.event_id == UsageReservation.event_id))
          .where(DurableUpload.status == "uploaded")
          .order_by(UsageReservation.metadata_json["dispatch_due"].as_float(), UsageReservation.idempotency_key)
          .limit(100).with_for_update(of=UsageReservation, skip_locked=True))).all()
        upload_ids = [uuid.UUID((receipt.metadata_json or {})["upload_id"]) for receipt in records]
        uploads = {} if not upload_ids else {row.id: row for row in (await db.scalars(
            select(DurableUpload).where(DurableUpload.organization_id == organization_id,
                DurableUpload.id.in_(upload_ids)).order_by(DurableUpload.id)
            .with_for_update(skip_locked=True))).all()}
        for receipt in records:
            metadata = dict(receipt.metadata_json or {})
            row = uploads.get(uuid.UUID(metadata["upload_id"]))
            if row is None:
                # Another processor holds this row: do not defer recovery for
                # a day merely because SKIP LOCKED did its job.
                continue
            if row.status != "uploaded":
                receipt.metadata_json = {**metadata, "dispatch_due": now + 86400}
                continue
            attempts = int(metadata.get("dispatch_attempts", 0))
            if attempts >= 30:
                await UploadService.apply_transition(db, row, "failed",
                    error="UPLOAD_DISPATCH_EXHAUSTED: authorised operator recovery required")
                db.add(AuditLog(organization_id=organization_id, actor_user_id=None,
                    actor_role="SYSTEM", resource_type="upload", resource_id=row.id,
                    action_type="REGISTRATION_UPLOAD_DISPATCH_EXHAUSTED", is_sensitive=True,
                    new_state={"attempts": attempts}))
            else:
                messages.append(row.id)
            receipt.metadata_json = {**metadata, "dispatch_attempts": attempts + 1,
                "dispatch_due": now + min(1800, 60 * 2 ** min(attempts, 5))}
        await db.commit()
    # Commit dispatch leases before broker IO. Lost acknowledgements are safe;
    # the existing processor deduplicates under the durable upload row lock.
    from app.tasks.upload_jobs import process_durable_upload
    for upload_id in messages:
        try:
            await asyncio.to_thread(process_durable_upload.apply_async,
                args=(str(upload_id), str(organization_id)), retry=False)
        except Exception:
            logger.warning("Registration upload processing dispatch remains pending")


async def recover_page(after=None):
    cursor = uuid.UUID(after) if after else None
    # Same allowlisted control-plane root discovery used by lifecycle recovery.
    async with AsyncSessionLocal() as db:
        query = select(Organization.id)
        if cursor:
            query = query.where(Organization.id > cursor)
        ids = (await db.scalars(query.order_by(Organization.id).limit(101))).all()
    if len(ids) > 100:
        await asyncio.to_thread(recover_program_uploads.apply_async,
            args=(str(ids[99]),), headers={"tenant_org_id": ""}, retry=False)
    for organization_id in ids[:100]:
        await asyncio.to_thread(recover_program_tenant.apply_async,
            args=(str(organization_id),), retry=False)


@celery_app.task(name="app.tasks.program_upload_recovery.tenant", queue="reconciliation",
    soft_time_limit=120, time_limit=180, acks_late=True)
def recover_program_tenant(organization_id):
    return run_async(recover_tenant(uuid.UUID(organization_id)))


@celery_app.task(name="app.tasks.program_upload_recovery.recover", queue="reconciliation",
    soft_time_limit=240, time_limit=300, acks_late=True)
def recover_program_uploads(after=None):
    return run_async(recover_page(after))
