"""Private-queue real worker entrypoint for the explicitly isolated local probe."""
import os
import re
import uuid

from kombu import Queue
from sqlalchemy.engine import make_url
from app.config import settings

database = make_url(settings.async_database_url)
queue = os.environ.get("CATEGORY_A_UPLOAD_PROBE_QUEUE", "")
if (settings.is_production or database.database != "category_a_rehearsal_20261015"
        or database.host not in {"localhost", "127.0.0.1"}
        or database.username != "category_a_rehearsal_runtime_20261015"
        or not re.fullmatch(r"category-a-upload-proof-[0-9a-f]{32}", queue)):
    raise RuntimeError("Only an explicit isolated local rehearsal and private queue are permitted")

from app.worker import celery_app
from app.tasks.upload_jobs import process_durable_upload
from app.tasks import upload_jobs

celery_app.conf.task_queues = (Queue(queue),)
celery_app.conf.task_default_queue = queue
celery_app.conf.task_routes = {process_durable_upload.name: {"queue": queue}}
process_durable_upload.queue = queue

# Transparent probe observer around real provider deletion, not a response
# double. The production recovery code must retain quota on observer failure.
probe_event = uuid.UUID(os.environ["CATEGORY_A_UPLOAD_PROBE_EVENT"])
probe_owner = uuid.UUID(os.environ["CATEGORY_A_UPLOAD_PROBE_OWNER"])
original_delete = upload_jobs.seal_registration_upload_key


def observed_delete(bucket, object_key, *, verified_organization_id):
    prefix = f"tenant/{probe_owner}/event/{probe_event}/registration_upload/"
    if verified_organization_id != probe_owner or not object_key.startswith(prefix):
        return original_delete(bucket, object_key, verified_organization_id=verified_organization_id)
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import Session
    from app.database import tenant_org_id
    from app.modules.audit.models.audit_log import AuditLog
    engine = create_engine(database.set(drivername="postgresql+psycopg2"))
    token = tenant_org_id.set(probe_owner)
    query = text("""SELECT u.id,r.id AS reservation_id,r.status,
        (r.metadata_json->>'delivery_hold')::boolean AS held
        FROM content.durable_uploads u JOIN platform.usage_reservations r
          ON r.organization_id=u.organization_id AND r.metadata_json->>'upload_id'=u.id::text
        WHERE u.organization_id=:owner AND u.event_id=:event AND u.object_key=:key""")
    parameters = {"owner": probe_owner, "event": probe_event, "key": object_key}
    try:
        with Session(engine) as db:
            before = db.execute(query, parameters).one()
            assert before.status == "RESERVED" and before.held
        result = original_delete(bucket, object_key, verified_organization_id=verified_organization_id)
        try:
            upload_jobs.get_object_metadata(bucket=bucket, storage_path=object_key,
                verified_organization_id=verified_organization_id)
        except FileNotFoundError:
            pass
        else:
            raise RuntimeError("Exact payload remained present after fencing")
        with Session(engine) as db:
            after = db.execute(query, parameters).one()
            assert after.status == "RESERVED" and after.held
            db.add(AuditLog(organization_id=probe_owner, actor_role="REHEARSAL_OBSERVER",
                resource_type="upload", resource_id=before.id,
                action_type="UPLOAD_REHEARSAL_CLEANUP_ORDER", is_sensitive=False,
                new_state={"reservation_id": str(before.reservation_id),
                    "held_before_delete": True, "held_after_delete": True,
                    "payload_missing_before_release": True, "key_fenced_before_release": True}))
            db.commit()
        return result
    finally:
        tenant_org_id.reset(token)
        engine.dispose()


upload_jobs.seal_registration_upload_key = observed_delete
