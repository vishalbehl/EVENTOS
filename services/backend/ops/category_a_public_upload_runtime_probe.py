"""Connected public HTTP -> committed DB -> storage -> broker/worker -> scan -> delivery.

Only the approved isolated local customer cohort. Synthetic commercial snapshots
and upload evidence are retained; temporary storage and the private worker stop.
Credentials/capabilities/presigned URLs stay in process memory and are not printed.
"""
import asyncio
import argparse
from collections import deque
from datetime import datetime, timezone
import json
import io
import os
from pathlib import Path
import secrets
import subprocess
import sys
import threading
import time
import uuid
import zipfile
import traceback
import socket
import re
from collections import Counter

sys.path.insert(0, str(Path(__file__).parents[1]))
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from app.config import settings
from bootstrap_cloud_database import upsert_login
from category_a_isolated_storage import isolated_storage

STAGE = "local admission"
LAST_HTTP = None
OUTPUT_PATH = None


def main():
    global STAGE, OUTPUT_PATH
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--storage-outage", action="store_true")
    parser.add_argument("--broker-outage", action="store_true")
    parser.add_argument("--late-storage-write", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    OUTPUT_PATH = args.output
    target = make_url(settings.DATABASE_URL_SYNC).set(database="category_a_rehearsal_20261015")
    if settings.is_production or target.host not in {"localhost", "127.0.0.1"}:
        raise RuntimeError("Only the explicit isolated local rehearsal is permitted")
    for url in (settings.CELERY_BROKER_URL, settings.CELERY_RESULT_BACKEND):
        if make_url(url).host not in {"localhost", "127.0.0.1"}:
            raise RuntimeError("Only the existing local broker/result store is permitted")
    cohort = json.loads((Path(__file__).parents[3] /
        "docs/category-a/plans-status-evidence/2026-10-15/rehearsal-cohort.json").read_text(encoding="utf-8"))
    owner = uuid.UUID(cohort[0]["organization_id"])
    operator = create_engine(target)
    with operator.connect() as connection:
        if connection.scalar(text("SELECT version_num FROM public.alembic_version")) != "20261022_3670":
            raise RuntimeError("Current upload acceptance requires the explicitly migrated 3670 cohort")
        if connection.scalar(text("SELECT count(*) FROM pg_stat_activity WHERE usename=:login"),
                {"login": "category_a_rehearsal_runtime_20261015"}):
            raise RuntimeError("Drain existing rehearsal runtime sessions before rotating its credential")
    runtime_password = secrets.token_urlsafe(40)
    connection = operator.raw_connection()
    try:
        with connection.cursor() as cursor:
            upsert_login(cursor, "category_a_rehearsal_runtime_20261015", runtime_password, "event_runtime")
        connection.commit()
    finally:
        connection.close()
    with operator.connect() as connection:
        workspace = connection.execute(text("""SELECT w.id FROM organizer_access.operational_workspaces w
            JOIN platform.organizations o ON o.id=w.organization_id WHERE o.id=:owner
              AND NOT o.is_platform_org AND o.is_active AND o.suspended_at IS NULL AND o.archived_at IS NULL
              AND w.status='ACTIVE' ORDER BY w.id LIMIT 1"""), {"owner": owner}).scalar_one()
    settings.DATABASE_URL_ASYNC = target.set(drivername="postgresql+asyncpg",
        username="category_a_rehearsal_runtime_20261015", password=runtime_password).render_as_string(hide_password=False)
    settings.DATABASE_URL_SYNC = target.set(username="category_a_rehearsal_runtime_20261015",
        password=runtime_password).render_as_string(hide_password=False)
    event_id = uuid.uuid4()
    queue = f"category-a-upload-proof-{uuid.uuid4().hex}"
    STAGE = "isolated storage startup"
    try:
        with isolated_storage(settings.S3_BUCKET_REGISTRATION_UPLOADS) as credentials:
            settings.STORAGE_MODE = "s3"
            settings.S3_ENDPOINT_URL, settings.S3_ACCESS_KEY_ID, settings.S3_SECRET_ACCESS_KEY = credentials
            settings.S3_PUBLIC_ENDPOINT_URL = ""
            settings.S3_REGION, settings.S3_FORCE_PATH_STYLE = "us-east-1", True
            settings.ANTIVIRUS_COMMAND, settings.ANTIVIRUS_REQUIRED = "tcp://127.0.0.1:3310", True
            settings.ANTIVIRUS_TIMEOUT_SECONDS = 5
            result = asyncio.run(probe(target, owner, workspace, event_id, queue,
                storage_outage=args.storage_outage, broker_outage=args.broker_outage,
                late_storage_write=args.late_storage_write))
    except Exception:
        # Retain immutable synthetic contract/evidence history, but never leave
        # a failed rehearsal fixture publicly open. Exact generated event only.
        with operator.begin() as connection:
            connection.execute(text("UPDATE events.events SET status='draft' WHERE id=:id AND organization_id=:owner"),
                {"id": event_id, "owner": owner})
            connection.execute(text("UPDATE registration.registration_forms SET is_live=false WHERE event_id=:id"), {"id": event_id})
        raise
    finally:
        operator.dispose()
    result["disposable_storage_removed"] = True
    result["database"] = target.database
    if args.output is not None:
        with args.output.open("x", encoding="utf-8") as output:
            json.dump(result, output, indent=2)
    print(json.dumps(result, indent=2))
    return 0


async def probe(operator_url, owner, workspace, event_id, queue, *, storage_outage=False,
        broker_outage=False, late_storage_write=False):
    global STAGE
    import app.models
    from sqlalchemy import event as sqlalchemy_event, select
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from httpx import AsyncClient, ASGITransport
    from app.core.tenant_context import TenantContextGuard
    from app.core.database_security import inspect_database_security
    from app.database import AsyncSessionLocal, async_engine, tenant_org_id
    from app.modules.files.models.file import DurableUpload
    from app.modules.platform.models.organization_console import UsageReservation
    from app.modules.platform.models.organization_console import UsageLedgerEntry
    from app.modules.presentations.services import upload_service as storage
    from app.tasks.upload_jobs import process_durable_upload
    from app.worker import celery_app
    from kombu import Queue
    from category_a_public_upload_fixture import seed_upload_event

    # Value-free request-local query shape evidence. Never retain SQL text or
    # bind values in the artifact; only operation and referenced table names.
    profile_scope = {"active": False}
    initial_query_shapes: Counter[str] = Counter()
    table_pattern = re.compile(
        r'\b(?:FROM|JOIN|UPDATE|INTO)\s+((?:"?[A-Za-z_][A-Za-z0-9_]*"?\.)?"?[A-Za-z_][A-Za-z0-9_]*"?)',
        re.IGNORECASE,
    )

    def observe_query_shape(conn, cursor, statement, parameters, context, executemany):
        if not profile_scope["active"]:
            return
        normalized = statement.lstrip()
        operation = normalized.split(None, 1)[0].upper() if normalized else "UNKNOWN"
        tables = sorted({match.replace('"', '').lower() for match in table_pattern.findall(statement)})
        if "set_config(" in statement.lower():
            tables.append("tenant_context")
        initial_query_shapes[f"{operation}:{','.join(tables) or 'no_table'}"] += 1

    sqlalchemy_event.listen(async_engine.sync_engine, "before_cursor_execute", observe_query_shape)

    STAGE = "synthetic persisted commercial activation"
    admin_engine = create_async_engine(operator_url.set(drivername="postgresql+asyncpg"))
    try:
        async with async_sessionmaker(admin_engine, expire_on_commit=False)() as db:
            fixture = await seed_upload_event(db, owner=owner, event_id=event_id, workspace_id=workspace)
    finally:
        await admin_engine.dispose()
    async with AsyncSessionLocal() as db:
        security = await inspect_database_security(db)
        assert security.runtime_role_is_safe and not security.missing_canary_policies
    celery_app.amqp.queues.add(Queue(queue))
    celery_app.conf.task_queues = tuple(celery_app.amqp.queues.values())
    celery_app.conf.task_routes = {**celery_app.conf.task_routes, process_durable_upload.name: {"queue": queue}}
    process_durable_upload.queue = queue
    process_durable_upload._exec_options = None
    worker = None
    worker_logs = deque(maxlen=50)
    original_upload = storage.upload_fileobj
    observed_preparations = []
    observer_engine = create_engine(make_url(settings.async_database_url).set(drivername="postgresql+psycopg2"))
    fault_operator = create_engine(operator_url)
    revoke_during_storage = False
    fail_storage_transfer = False
    pause_storage_transfer = False
    storage_waiting, resume_storage = threading.Event(), threading.Event()
    late_request = None

    def checked_upload(**arguments):
        # A different restricted-role connection must see the committed durable
        # attempt, quota hold and mandatory audit BEFORE real provider IO starts.
        with observer_engine.begin() as connection:
            connection.execute(text("SELECT set_config('app.current_organization_id',:owner,true)"), {"owner": str(owner)})
            row = connection.execute(text("""SELECT u.id,u.status,
                EXISTS (SELECT 1 FROM platform.usage_reservations r WHERE r.organization_id=u.organization_id
                    AND r.metadata_json->>'upload_id'=u.id::text AND r.status='RESERVED') AS reserved,
                EXISTS (SELECT 1 FROM command_center_audit.logs a WHERE a.resource_id=u.id
                    AND a.action_type='PUBLIC_REGISTRATION_UPLOAD_PREPARED') AS audited
                FROM content.durable_uploads u WHERE u.organization_id=:owner AND u.object_key=:key"""),
                {"owner": owner, "key": arguments["storage_path"]}).one()
            assert row.status == "uploading" and row.reserved and row.audited
            observed_preparations.append(row.id)
        if pause_storage_transfer:
            storage_waiting.set()
            if not resume_storage.wait(90):
                raise RuntimeError("Late-storage rehearsal gate was not released")
        if fail_storage_transfer:
            # Real SDK connection refusal, not a fabricated provider response.
            previous = (settings.S3_ENDPOINT_URL, settings.STORAGE_CONNECT_TIMEOUT_SECONDS,
                settings.STORAGE_READ_TIMEOUT_SECONDS, settings.STORAGE_MAX_RETRIES)
            try:
                settings.S3_ENDPOINT_URL = "http://127.0.0.1:0"
                settings.STORAGE_CONNECT_TIMEOUT_SECONDS = settings.STORAGE_READ_TIMEOUT_SECONDS = 1
                settings.STORAGE_MAX_RETRIES = 0
                result = original_upload(**arguments)
            finally:
                (settings.S3_ENDPOINT_URL, settings.STORAGE_CONNECT_TIMEOUT_SECONDS,
                    settings.STORAGE_READ_TIMEOUT_SECONDS, settings.STORAGE_MAX_RETRIES) = previous
        else:
            result = original_upload(**arguments)
        if revoke_during_storage:
            # Deterministic real concurrent policy change after the provider
            # wrote bytes, before the request's final authorisation/commit.
            with fault_operator.begin() as connection:
                connection.execute(text("UPDATE registration.registration_forms SET is_live=false,version=version+1 WHERE event_id=:id"), {"id": event_id})
        return result

    storage.upload_fileobj = checked_upload
    token = tenant_org_id.set(None)
    try:
        from app.main import app
        async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False),
                               base_url="http://localhost", timeout=30) as client:
            async def request(method, path, **kwargs):
                global LAST_HTTP
                response = await client.request(method, path, **kwargs)
                code = None
                try:
                    detail = response.json().get("detail")
                    if isinstance(detail, dict) and isinstance(detail.get("code"), str):
                        candidate = detail["code"]
                        if len(candidate) <= 100 and all(c.isupper() or c.isdigit() or c == "_" for c in candidate):
                            code = candidate
                except (ValueError, AttributeError):
                    pass
                LAST_HTTP = {"status": response.status_code, "code": code}
                assert tenant_org_id.get() is None
                return response

            async def upload(data, key, filename="proof.pdf", mime_type="application/pdf"):
                return await request("POST", f"/api/v1/portal/registration/{event_id}/upload",
                    files={"file": (filename, data, mime_type)},
                    data={"field_name": "proof_document"}, headers={"Idempotency-Key": key})

            data = b"%PDF-1.4\n% Isolated Category A clean public upload fixture\n%%EOF\n"
            key = f"public-upload-proof-{uuid.uuid4()}"
            if storage_outage:
                STAGE = "real storage connection failure after durable preparation"
                fail_storage_transfer = True
                unavailable = await upload(data, key)
                fail_storage_transfer = False
                assert unavailable.status_code == 503 and unavailable.headers["retry-after"] == "5"
                assert unavailable.json()["detail"]["code"] == "REGISTRATION_STORAGE_UNAVAILABLE"
                assert len(observed_preparations) == 1
                async with AsyncSessionLocal() as db:
                    async with TenantContextGuard.scoped(db, owner):
                        prepared = await db.get(DurableUpload, observed_preparations[0])
                        held = await db.scalar(select(UsageReservation).where(
                            UsageReservation.organization_id == owner,
                            UsageReservation.metadata_json["upload_id"].as_string() == str(prepared.id)))
                        assert prepared.status == "uploading" and held.status == "RESERVED"
                        assert held.metadata_json["delivery_hold"] and held.metadata_json["lease_until"] == 0
            STAGE = "public HTTP prepare and storage commit"
            original_connection_factory = celery_app.connection_for_write
            original_publish = process_durable_upload.apply_async
            failed_connection_calls = []
            publish_attempts = []
            refused_socket = None
            if broker_outage:
                from kombu import Connection
                # Port zero is not an outage: Kombu normalises it to its
                # default Redis port. Hold a real non-listening assigned port.
                refused_socket = socket.socket()
                refused_socket.bind(("127.0.0.1", 0))
                refused_port = refused_socket.getsockname()[1]
                def unavailable_broker(**kwargs):
                    failed_connection_calls.append(True)
                    connection = Connection(f"redis://127.0.0.1:{refused_port}/0", **kwargs)
                    assert connection.port == refused_port
                    return connection
                def observed_publish(*args, **kwargs):
                    publish_attempts.append(True)
                    return original_publish(*args, **kwargs)
                celery_app.connection_for_write = unavailable_broker
                process_durable_upload.apply_async = observed_publish
            try:
                admission_started = time.perf_counter()
                profile_scope["active"] = True
                try:
                    accepted = await upload(data, key)
                finally:
                    profile_scope["active"] = False
                upload_admission_ms = round((time.perf_counter() - admission_started) * 1000, 3)
                if broker_outage:
                    # Production admission is non-blocking. The probe alone
                    # waits for the bounded background publication so its
                    # temporary fault cannot be restored before being observed.
                    from app.modules.registration.services import managed_registration_uploads as dispatch_service
                    from app.core import bounded_task_dispatch as telemetry_dispatch
                    deadline = time.monotonic() + 12
                    while True:
                        with dispatch_service._DISPATCH_FUTURES_LOCK:
                            upload_dispatches = len(dispatch_service._DISPATCH_FUTURES)
                        with telemetry_dispatch._FUTURES_LOCK:
                            telemetry_dispatches = len(telemetry_dispatch._FUTURES)
                        pending_dispatches = upload_dispatches + telemetry_dispatches
                        if pending_dispatches == 0:
                            break
                        if time.monotonic() >= deadline:
                            raise RuntimeError("Bounded background upload dispatch did not finish")
                        await asyncio.sleep(0.01)
            finally:
                celery_app.connection_for_write = original_connection_factory
                process_durable_upload.apply_async = original_publish
                if refused_socket is not None:
                    refused_socket.close()
                    # This probe changes the endpoint, unlike an outage of a
                    # stable production endpoint. Do not retain the deliberately
                    # invalid connection objects in this process's Celery pools.
                    for cached_pool in (celery_app.amqp._producer_pool, celery_app._pool):
                        if cached_pool is not None:
                            cached_pool.force_close_all()
                    celery_app.amqp._producer_pool = None
                    celery_app._pool = None
            if broker_outage:
                if LAST_HTTP is not None:
                    LAST_HTTP["dispatch_failure_connection_attempts"] = len(failed_connection_calls)
                # Celery may request multiple connection objects internally.
                # The business publish itself must still be attempted once.
                assert failed_connection_calls and publish_attempts == [True]
            assert accepted.status_code == 202, f"Public upload admission returned {accepted.status_code}"
            assert accepted.headers["cache-control"] == "no-store"
            body = accepted.json()
            upload_id = uuid.UUID(body["upload_id"])
            assert observed_preparations == [upload_id] * (2 if storage_outage else 1)
            assert body["status"] == "processing" and "url" not in body and "download_url" not in body
            assert body["managed_url"].startswith("/api/v1/events/") and body["status_url"].startswith("/api/v1/portal/")
            capability = {"Upload-Capability": body["capability"]}
            status_path = body["status_url"]
            download_path = status_path + "/download"
            STAGE = "unscanned delivery and retry refusal"
            assert (await request("GET", status_path)).status_code == 404
            assert (await request("GET", body["managed_url"])).status_code in {401, 403}
            assert (await request("GET", download_path, headers=capability)).status_code == 404
            state = await request("GET", status_path, headers=capability)
            assert state.status_code == 200 and state.json()["download_url"] is None
            assert state.headers["cache-control"] == "no-store"
            repeated = await upload(data, key)
            assert repeated.status_code == 202 and repeated.json() == body
            assert len(observed_preparations) == (2 if storage_outage else 1)
            assert repeated.headers["cache-control"] == "no-store"
            changed = await upload(data + b"changed", key)
            assert changed.status_code == 409
            foreign_path = status_path.replace(str(event_id), str(uuid.uuid4()))
            assert (await request("GET", foreign_path, headers=capability)).status_code == 404
            async with AsyncSessionLocal() as db:
                async with TenantContextGuard.scoped(db, owner):
                    row = await db.get(DurableUpload, upload_id)
                    assert row.status == "uploaded"
                    object_key, bucket = row.object_key, row.storage_bucket
                    reservations = (await db.scalars(select(UsageReservation).where(
                        UsageReservation.organization_id == owner, UsageReservation.event_id == event_id))).all()
                    assert len(reservations) == 1 and reservations[0].status == "CONSUMED"
            async with AsyncClient() as public_storage:
                unsigned = await public_storage.get(f"{settings.S3_ENDPOINT_URL}/{bucket}/{object_key}")
                assert unsigned.status_code == 403

            STAGE = "dedicated real worker and antivirus"
            if broker_outage:
                # Advance only the generated upload's durable lease, then use
                # the real scoped recovery job and live private broker queue.
                from app.tasks.upload_jobs import recover_abandoned_uploads_for_tenant
                with fault_operator.begin() as connection:
                    connection.execute(text("""UPDATE content.durable_uploads
                        SET updated_at=now()-interval '16 minutes'
                        WHERE id=:id AND organization_id=:owner AND event_id=:event"""),
                        {"id": upload_id, "owner": owner, "event": event_id})
                recover_abandoned_uploads_for_tenant.apply_async(args=(str(owner),), queue=queue,
                    headers={"tenant_org_id": str(owner)}, retry=False)
            environment = {**os.environ, "ENVIRONMENT": "development",
                "DATABASE_URL_ASYNC": settings.async_database_url, "DATABASE_URL_SYNC": settings.DATABASE_URL_SYNC,
                "STORAGE_MODE": "s3", "S3_ENDPOINT_URL": settings.S3_ENDPOINT_URL, "S3_PUBLIC_ENDPOINT_URL": "",
                "S3_ACCESS_KEY_ID": settings.S3_ACCESS_KEY_ID, "S3_SECRET_ACCESS_KEY": settings.S3_SECRET_ACCESS_KEY,
                "S3_REGION": "us-east-1", "S3_FORCE_PATH_STYLE": "true", "ANTIVIRUS_COMMAND": settings.ANTIVIRUS_COMMAND,
                "ANTIVIRUS_REQUIRED": "true", "ANTIVIRUS_TIMEOUT_SECONDS": "5", "CATEGORY_A_UPLOAD_PROBE_QUEUE": queue,
                "CATEGORY_A_UPLOAD_PROBE_EVENT": str(event_id), "CATEGORY_A_UPLOAD_PROBE_OWNER": str(owner)}
            environment.pop("MIGRATION_DATABASE_URL_SYNC", None)
            worker = subprocess.Popen([sys.executable, "-m", "celery", "-A", "ops.category_a_upload_probe_worker:celery_app",
                "worker", "--pool=solo", "--concurrency=1", "--without-gossip", "--without-mingle", "--without-heartbeat",
                "--loglevel=WARNING", "-Q", queue], cwd=Path(__file__).parents[1], env=environment,
                stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, encoding="utf-8", errors="replace",
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0)
            def collect():
                for line in worker.stdout:
                    worker_logs.append(line.rstrip())
            threading.Thread(target=collect, daemon=True).start()
            deadline = time.monotonic() + 90
            while True:
                if worker.poll() is not None:
                    raise RuntimeError("Dedicated worker exited before scan completion")
                state = await request("GET", status_path, headers=capability)
                assert state.status_code == 200
                if state.json()["status"] == "ready":
                    break
                assert state.json()["status"] not in {"failed", "quarantined"}
                if time.monotonic() >= deadline:
                    raise RuntimeError("Real worker did not reach READY within the bounded window")
                await asyncio.sleep(1)
            STAGE = "scan-ready controlled delivery"
            ready = state.json()
            assert ready["download_url"] == download_path
            assert (await request("GET", body["managed_url"])).status_code in {401, 403}
            redirect = await request("GET", download_path, headers=capability)
            assert redirect.status_code == 307 and redirect.headers["cache-control"] == "private, no-store"
            async with AsyncClient() as downloader:
                delivered = await downloader.get(redirect.headers["location"])
                assert delivered.status_code == 200 and delivered.content == data
            STAGE = "real antivirus quarantine and delivery denial"
            # Inert industry test signature; streamed in memory to isolated S3,
            # never written as a local executable or a host fixture file.
            archive = io.BytesIO()
            with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as document:
                document.writestr("eicar.txt", b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*")
            infected = await upload(archive.getvalue(), f"public-infected-proof-{uuid.uuid4()}",
                filename="proof.xlsx", mime_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
            assert infected.status_code == 202
            infected_body = infected.json()
            infected_headers = {"Upload-Capability": infected_body["capability"]}
            deadline = time.monotonic() + 45
            while True:
                quarantined = await request("GET", infected_body["status_url"], headers=infected_headers)
                assert quarantined.status_code == 200
                if quarantined.json()["status"] == "quarantined":
                    break
                assert quarantined.json()["status"] != "ready"
                if time.monotonic() >= deadline:
                    raise RuntimeError("Infected public upload was not quarantined")
                await asyncio.sleep(1)
            assert quarantined.json()["download_url"] is None
            assert (await request("GET", infected_body["status_url"] + "/download", headers=infected_headers)).status_code == 404
            if late_storage_write:
                STAGE = "late provider write after missing-object recovery"
                pause_storage_transfer = True
                late_request_key = f"public-late-write-{uuid.uuid4()}"
                late_request = asyncio.create_task(upload(data, late_request_key))
                assert await asyncio.to_thread(storage_waiting.wait, 10)
                late_id = observed_preparations[-1]
                with fault_operator.begin() as connection:
                    connection.execute(text("""UPDATE content.durable_uploads SET updated_at=now()-interval '16 minutes'
                        WHERE id=:id AND organization_id=:owner AND event_id=:event"""),
                        {"id": late_id, "owner": owner, "event": event_id})
                    connection.execute(text("""UPDATE platform.usage_reservations
                        SET expires_at=now()-interval '1 minute',
                            metadata_json=jsonb_set(metadata_json,'{lease_until}','0'::jsonb,true)
                        WHERE organization_id=:owner AND metadata_json->>'upload_id'=:id"""),
                        {"owner": owner, "id": str(late_id)})
                from app.tasks.upload_jobs import recover_abandoned_uploads_for_tenant
                recover_abandoned_uploads_for_tenant.apply_async(args=(str(owner),), queue=queue,
                    headers={"tenant_org_id": str(owner)}, retry=False)
                deadline = time.monotonic() + 45
                while True:
                    async with AsyncSessionLocal() as db:
                        async with TenantContextGuard.scoped(db, owner):
                            late_row = await db.get(DurableUpload, late_id)
                            held = await db.scalar(select(UsageReservation).where(
                                UsageReservation.organization_id == owner,
                                UsageReservation.metadata_json["upload_id"].as_string() == str(late_id)))
                            if late_row.status == "failed":
                                assert held.status == "RELEASED"
                                late_key = late_row.object_key
                                break
                    if time.monotonic() >= deadline:
                        raise RuntimeError("Missing-object recovery did not fence the paused request")
                    await asyncio.sleep(1)
                pause_storage_transfer = False
                resume_storage.set()
                late_response = await asyncio.wait_for(late_request, 15)
                assert late_response.status_code == 409
                assert late_response.json()["detail"]["code"] == "UPLOAD_ATTEMPT_CLOSED"
                provider = storage._get_s3_client()
                try:
                    marker = provider.head_object(Bucket=bucket, Key=late_key)
                    assert marker["ContentLength"] == 0
                    assert marker["Metadata"]["conf-platform-cleanup-fence"] == "v1"
                finally:
                    provider.close()
                try:
                    storage.get_object_metadata(bucket=bucket, storage_path=late_key, verified_organization_id=owner)
                except FileNotFoundError:
                    pass
                else:
                    raise RuntimeError("Late writer recreated an abandoned payload")
                STAGE = "closed attempt refusal and explicit fresh attempt"
                closed_retry = await upload(data, late_request_key)
                assert closed_retry.status_code == 409
                assert closed_retry.json()["detail"]["code"] == "UPLOAD_ATTEMPT_CLOSED"
                fresh = await upload(data, f"public-explicit-new-attempt-{uuid.uuid4()}")
                assert fresh.status_code == 202 and uuid.UUID(fresh.json()["upload_id"]) != late_id
                fresh_body = fresh.json()
                deadline = time.monotonic() + 45
                while True:
                    fresh_status = await request("GET", fresh_body["status_url"],
                        headers={"Upload-Capability": fresh_body["capability"]})
                    assert fresh_status.status_code == 200
                    if fresh_status.json()["status"] == "ready":
                        break
                    assert fresh_status.json()["status"] not in {"failed", "quarantined"}
                    if time.monotonic() >= deadline:
                        raise RuntimeError("Explicit new attempt did not complete scanning")
                    await asyncio.sleep(1)
            from app.modules.registration.services.public_upload_capability import issue_public_upload_capability
            expired = issue_public_upload_capability(upload_id=upload_id, event_id=event_id,
                expires_at=int(datetime.now(timezone.utc).timestamp()) - 5)
            assert (await request("GET", download_path, headers={"Upload-Capability": expired})).status_code == 404
            STAGE = "live-field revocation between storage and finalisation"
            revoke_during_storage = True
            denied_finalisation = await upload(data, f"public-revoked-proof-{uuid.uuid4()}")
            revoke_during_storage = False
            assert denied_finalisation.status_code == 404
            abandoned_id = observed_preparations[-1]
            assert abandoned_id not in {upload_id, uuid.UUID(infected_body["upload_id"])}
            assert (await request("GET", status_path, headers=capability)).status_code == 404
            assert (await request("GET", download_path, headers=capability)).status_code == 404
            async with AsyncSessionLocal() as db:
                async with TenantContextGuard.scoped(db, owner):
                    abandoned = await db.get(DurableUpload, abandoned_id)
                    assert abandoned.status == "uploading"
                    abandoned_key = abandoned.object_key
                    held = await db.scalar(select(UsageReservation).where(
                        UsageReservation.organization_id == owner,
                        UsageReservation.metadata_json["upload_id"].as_string() == str(abandoned_id)))
                    assert held.status == "RESERVED" and held.metadata_json["delivery_hold"]
            # Advance only the generated attempt's lease, not system time or
            # another tenant's queue, to exercise actual abandoned recovery.
            with fault_operator.begin() as connection:
                connection.execute(text("UPDATE content.durable_uploads SET updated_at=now()-interval '1 hour' WHERE id=:id AND organization_id=:owner"), {"id": abandoned_id, "owner": owner})
                connection.execute(text("""UPDATE platform.usage_reservations
                    SET expires_at=now()-interval '1 hour',
                        metadata_json=jsonb_set(metadata_json,'{lease_until}','0'::jsonb)
                    WHERE organization_id=:owner AND metadata_json->>'upload_id'=:id"""),
                    {"owner": owner, "id": str(abandoned_id)})
            STAGE = "real worker abandoned-object cleanup and quota release"
            from app.tasks.upload_jobs import recover_abandoned_uploads_for_tenant
            recover_abandoned_uploads_for_tenant.apply_async(args=(str(owner),),
                queue=queue, headers={"tenant_org_id": str(owner)})
            deadline = time.monotonic() + 45
            while True:
                async with AsyncSessionLocal() as db:
                    async with TenantContextGuard.scoped(db, owner):
                        abandoned = await db.get(DurableUpload, abandoned_id)
                        if abandoned.status == "failed":
                            held = await db.scalar(select(UsageReservation).where(
                                UsageReservation.organization_id == owner,
                                UsageReservation.metadata_json["upload_id"].as_string() == str(abandoned_id)))
                            assert held.status == "RELEASED" and not held.metadata_json["delivery_hold"]
                            break
                if time.monotonic() >= deadline:
                    raise RuntimeError("Abandoned upload was not recovered by the dedicated worker")
                await asyncio.sleep(1)
            from app.modules.audit.models.audit_log import AuditLog
            async with AsyncSessionLocal() as db:
                async with TenantContextGuard.scoped(db, owner):
                    audits = list((await db.scalars(select(AuditLog).where(AuditLog.resource_id == abandoned_id,
                        AuditLog.action_type == "ABANDONED_UPLOAD_QUOTA_RELEASED"))).all())
                    assert len(audits) == 1
                    observed = list((await db.scalars(select(AuditLog).where(AuditLog.resource_id == abandoned_id,
                        AuditLog.action_type == "UPLOAD_REHEARSAL_CLEANUP_ORDER"))).all())
                    assert len(observed) == 1 and observed[0].new_state["payload_missing_before_release"]
                    assert observed[0].new_state["key_fenced_before_release"]
                    all_reservations = list((await db.scalars(select(UsageReservation).where(
                        UsageReservation.organization_id == owner, UsageReservation.event_id == event_id))).all())
                    assert sorted(row.status for row in all_reservations) == ["CONSUMED"] * (2 + int(late_storage_write)) + ["RELEASED"] * (1 + int(late_storage_write))
                    ledger_ids = [row.consumed_entry_id for row in all_reservations if row.status == "CONSUMED"]
                    ledger = list((await db.scalars(select(UsageLedgerEntry).where(
                        UsageLedgerEntry.organization_id == owner, UsageLedgerEntry.id.in_(ledger_ids)))).all())
                    assert len(ledger) == 2 + int(late_storage_write)
                    assert all(set(row.metadata_json) == {"reservation_id", "limit_key", "source_event_id", "upload_id"}
                        for row in ledger)
            try:
                await asyncio.to_thread(storage.get_object_metadata, bucket=bucket,
                    storage_path=abandoned_key, verified_organization_id=owner)
            except FileNotFoundError:
                pass
            else:
                raise AssertionError("Revoked abandoned object still exists after quota release")
            return {"status": "PASSED", "scope": "isolated_actual_restricted_login_real_http",
                "storage_connection_failure_retained_and_same_attempt_retried": storage_outage,
                "post_commit_broker_failure_recovered_by_real_worker": broker_outage,
                "late_provider_write_rejected_after_missing_recovery": late_storage_write,
                "closed_attempt_refused_and_explicit_new_attempt_ready": late_storage_write,
                "fixture": fixture, "upload_id": str(upload_id), "durable_commit_before_storage": True,
                "unscanned_delivery_denied": True, "private_bucket_verified": True,
                "same_key_replayed": True, "changed_payload_conflict": True,
                "real_broker_and_dedicated_worker": True, "real_antivirus": True,
                "infected_upload_quarantined_and_delivery_denied": True,
                "scan_ready_bytes_delivered": True, "expired_and_foreign_capabilities_denied": True,
                "initial_upload_admission_ms": upload_admission_ms,
                "initial_upload_profiled_statement_count": sum(initial_query_shapes.values()),
                "initial_upload_query_shapes": [
                    {"shape": shape, "count": count}
                    for shape, count in initial_query_shapes.most_common(30)
                ],
                "upload_dispatch_waits_for_broker": False,
                "field_revocation_denies_status_and_download": True,
                "storage_to_finalisation_revocation_denied": True,
                "abandoned_payload_removed_and_key_fenced_before_quota_release": True,
                "released_attempt_has_one_mandatory_audit": True,
                "finalized_clean_and_quarantined_usage_retained": True,
                "accounting_excludes_capabilities_and_personal_filenames": True,
                "signed_download_exposure_bound_seconds": 300, "context_restored": True,
                "migration_revision": "20261022_3670"}
    finally:
        sqlalchemy_event.remove(async_engine.sync_engine, "before_cursor_execute", observe_query_shape)
        resume_storage.set()
        if late_request is not None and not late_request.done():
            try:
                await asyncio.wait_for(late_request, 15)
            except Exception:
                pass
        storage.upload_fileobj = original_upload
        tenant_org_id.reset(token)
        if worker and worker.poll() is None:
            if sys.platform == "win32":
                subprocess.run(["taskkill", "/PID", str(worker.pid), "/T", "/F"],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
            else:
                worker.terminate()
            worker.wait(timeout=15)
        # Queue name is generated locally above and consumed only by our worker.
        with celery_app.connection_for_write() as broker:
            with broker.channel() as channel:
                channel.queue_delete(queue=queue)
        observer_engine.dispose()
        fault_operator.dispose()
        from app.redis import close_redis
        await close_redis()
        await async_engine.dispose()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        # Never print HTTP capability bodies, signed URLs, environment or logs.
        original = getattr(exc, "orig", None)
        original = getattr(original, "__cause__", None) or original
        diagnostics = {name: getattr(original, name, None) for name in ("sqlstate", "constraint_name", "table_name", "column_name")}
        failed = {"status": "FAILED", "stage": STAGE, "error_type": type(exc).__name__,
            "database_error_metadata": diagnostics, "last_http": LAST_HTTP,
            "error_location": [{"file": Path(frame.filename).name, "line": frame.lineno}
                for frame in traceback.extract_tb(exc.__traceback__)[-3:]]}
        if OUTPUT_PATH is not None and not OUTPUT_PATH.exists():
            with OUTPUT_PATH.open("x", encoding="utf-8") as artifact:
                json.dump(failed, artifact, indent=2)
        print(json.dumps(failed))
        raise SystemExit(1) from None
