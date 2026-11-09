"""Actual two-worker/private-Redis outage probe inside a newly created clone."""
import asyncio
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import time
import uuid

from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import make_url
from app.config import settings


def docker(*args):
    result = subprocess.run(["docker", *args], capture_output=True, text=True, timeout=30)
    if result.returncode:
        raise RuntimeError("Private probe Docker operation failed")
    return result.stdout.strip()


def wait_for(predicate, seconds=90):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        result = predicate()
        if result:
            return result
        time.sleep(0.2)
    raise TimeoutError("Private catalogue probe observation expired")


def run(fixture_path):
    fixture = json.loads(fixture_path.read_text())
    database = make_url(settings.DATABASE_URL_SYNC)
    assert database.database == fixture["database"] and database.username == fixture["login"]
    assert database.host in {"localhost", "127.0.0.1"} and not settings.is_production
    if (not re.fullmatch(r"category_a_restore_[0-9]{8}_[0-9a-f]{12}", database.database or "")
            or not re.fullmatch(r"category_a_checkpoint_[0-9a-f]{12}", database.username or "")
            or fixture.get("migration_revision") != "20261022_3670"
            or fixture_path.resolve().parent != (Path(__file__).parents[1] / "test-results").resolve()):
        raise RuntimeError("Only a newly provisioned local checkpoint clone is permitted")
    run_key = uuid.uuid4().hex
    directory = fixture_path.parent / f"catalogue-broker-{run_key}"
    directory.mkdir()
    container, queue = f"category-a-catalogue-{run_key}", f"category-a-catalogue-{run_key}"
    engine = create_engine(database)
    workers, logs, created = [], [], False
    result = dict(status="FAILED", stage="private_broker_start", database=database.database,
        staging_acceptance="NOT_RUN", production_acceptance="NOT_RUN", fixture_only=True)
    try:
        # Docker may choose a different ephemeral publication on restart. Keep
        # the broker identity stable across the actual outage being tested.
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            requested_port = listener.getsockname()[1]
        docker("run", "-d", "--name", container, "--label", f"category-a-probe={run_key}",
            "-p", f"127.0.0.1:{requested_port}:6379", "--tmpfs", "/data", "redis:7-alpine", "redis-server", "--save", "", "--appendonly", "no")
        created = True
        port = docker("port", container, "6379/tcp").rsplit(":", 1)[1]
        broker = f"redis://127.0.0.1:{int(port)}/0"
        from redis import Redis
        redis = Redis.from_url(broker, socket_timeout=1, socket_connect_timeout=1)
        def redis_ready():
            try:
                return redis.ping()
            except Exception:
                return False
        wait_for(redis_ready)
        platform, owner, actor = [uuid.UUID(fixture[key]) for key in ("platform", "owner", "actor")]
        from app.core.tenant_context import TenantContextGuard
        from app.database import AsyncSessionLocal, async_engine
        from app.modules.registration.models.catalogue_reconciliation import CatalogueReconciliationRun as Run, CatalogueReconciliationWork as Work
        from app.modules.registration.services import catalogue_work
        from app.tasks import catalogue_reconciliation as worker

        async def prepare():
            async with AsyncSessionLocal() as db:
                from app.core.database_security import inspect_database_security
                security = await inspect_database_security(db)
                assert security.runtime_role_is_safe and not security.missing_canary_policies
                assert await db.scalar(text("SELECT version_num FROM public.alembic_version")) == fixture["migration_revision"]
                async with TenantContextGuard.scoped(db, platform):
                    run = Run(organization_id=platform, actor_user_id=actor,
                        reason="Actual private-broker interruption after durable page commit",
                        status="RUNNING", dispatch_attempts=1)
                    db.add(run)
                    await db.commit()
                    run_id = run.id
            await catalogue_work.stage_streams(run_id, actor, 1, None, (owner,), enumeration_complete=True)
            await worker._mark_run_dispatched(run_id, actor, 1)
            messages = await catalogue_work.claim_pages(platform)
            assert len(messages) == 1
            await async_engine.dispose()
            return run_id, messages[0]

        run_id, message = asyncio.run(prepare())
        os.environ.update(CATEGORY_A_CATALOGUE_QUEUE=queue,
            CATEGORY_A_CATALOGUE_DATABASE=database.database,
            CATEGORY_A_CATALOGUE_EVIDENCE=str(directory.resolve()),
            CATEGORY_A_CATALOGUE_PAUSED_WORK=str(message[0]), CATEGORY_A_CATALOGUE_BROKER=broker,
            REQUIRE_RLS_SAFE_RUNTIME_ROLE="true")
        from ops.category_a_catalogue_probe_worker import celery_app
        for index in range(2):
            log = (directory / f"worker-{index}.log").open("x", encoding="utf-8")
            logs.append(log)
            workers.append(subprocess.Popen([sys.executable, "-m", "celery", "-A",
                "ops.category_a_catalogue_probe_worker:celery_app", "worker", "--pool=solo", "--concurrency=1",
                "--without-gossip", "--without-mingle", "--loglevel=WARNING", "--queues", queue,
                "--hostname", f"catalogue-{index}-{run_key}@localhost"],
                cwd=Path(__file__).parents[1], env=dict(os.environ), stdout=log, stderr=subprocess.STDOUT))
        result["stage"] = "two_workers_ready"
        def ready():
            assert all(process.poll() is None for process in workers), "Private worker stopped"
            return len(celery_app.control.inspect(timeout=1).ping() or {}) == 2
        wait_for(ready, 180)
        result["stage"] = "committed_page_barrier"
        worker.process_catalogue_work.apply_async(args=(str(message[0]), str(message[1]), message[2]), retry=False)
        wait_for(lambda: (directory / "page-committed.json").exists())
        docker("stop", "--time", "1", container)
        try:
            redis.ping()
        except Exception:
            result["private_broker_unavailable_verified"] = True
        else:
            raise AssertionError("Private broker remained available")
        (directory / "release-after-broker-stop").touch(exist_ok=False)
        def completed_while_offline():
            for path in directory.glob("delivery-*.json"):
                row = json.loads(path.read_text())
                if row["task"].endswith("process_work") and row["state"] == "SUCCESS":
                    return True
            return False
        wait_for(completed_while_offline, 60)
        with engine.begin() as db:
            db.execute(text("SELECT set_config('app.current_organization_id',:owner,true)"), {"owner": str(platform)})
            page = db.execute(text("SELECT pages_completed,status,generation,dispatch_attempts FROM design.catalogue_reconciliation_work WHERE id=:id"), {"id": message[0]}).one()
            assert page.pages_completed == 1 and page.status == "PENDING" and page.dispatch_attempts == 1
            result["offline_checkpoint"] = dict(page._mapping)
        result["stage"] = "private_broker_restart"
        docker("start", container)
        assert docker("port", container, "6379/tcp").rsplit(":", 1)[1] == port
        wait_for(redis_ready)
        result["stage"] = "recover_committed_continuation"

        async def status():
            try:
                async with AsyncSessionLocal() as db:
                    async with TenantContextGuard.scoped(db, platform):
                        run = await db.get(Run, run_id)
                        return await catalogue_work.progress(db, run)
            finally:
                await async_engine.dispose()

        deadline, last_recovery = time.monotonic() + 180, 0
        while time.monotonic() < deadline:
            if time.monotonic() - last_recovery > 3:
                worker.recover_catalogue_reconciliation_runs.apply_async(retry=False)
                last_recovery = time.monotonic()
            progress = asyncio.run(status())
            if progress["completion_status"] == "COMPLETED":
                break
            assert progress["completion_status"] != "FAILED"
            time.sleep(0.3)
        else:
            raise TimeoutError("Durable continuation did not complete")
        deliveries = [json.loads(path.read_text()) for path in directory.glob("delivery-*.json")]
        assert len({item["pid"] for item in deliveries}) == 2
        assert progress["streams_completed"] == 2 and progress["pages_completed"] == 9 and progress["checked_count"] >= 206
        with engine.begin() as db:
            db.execute(text("SELECT set_config('app.current_organization_id',:owner,true)"), {"owner": str(platform)})
            completed = db.execute(text("SELECT kind,stage,status,coverage_version FROM design.catalogue_reconciliation_work WHERE run_id=:id"), {"id": run_id}).all()
            assert len(completed) == 2 and all(row.status == "COMPLETED" and row.coverage_version == 2 for row in completed)
            assert next(row.stage for row in completed if row.kind == "TENANT") == "PROGRAMME_RUBRIC"
            db.execute(text("SELECT set_config('app.current_organization_id',:owner,true)"), {"owner": str(owner)})
            assert db.scalar(text("SELECT count(*) FROM design.catalogue_document_reconciliations WHERE organization_id=:owner AND resource_type='PROGRAMME_RUBRIC' AND resource_id=:id AND resource_version=1 AND operation='DOCUMENT_VALIDATION' AND status='VALID'"),
                {"owner": owner, "id": uuid.UUID(fixture["rubric_plan"])}) == 1
        result.update(status="PASSED", stage="completed", progress=progress,
            migration_revision=fixture["migration_revision"], coverage_version=2, nonempty_programme_rubric_reconciled=True,
            worker_processes_observed=2, actual_restricted_login=True, actual_broker_interruption=True,
            evidence_directory=directory.name)
    except Exception as error:
        result["error_type"] = type(error).__name__
    finally:
        for process in workers:
            if process.poll() is None:
                process.terminate()
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=10)
        for log in logs:
            log.close()
        engine.dispose()
        if created:
            try:
                assert docker("inspect", container, "--format", '{{index .Config.Labels "category-a-probe"}}') == run_key
                docker("rm", "-f", container)
                result["private_broker_removed"] = True
            except Exception as error:
                result.update(status="FAILED", cleanup_error_type=type(error).__name__)
        output = fixture_path.with_name(fixture_path.stem + "-runtime.json")
        with output.open("x", encoding="utf-8") as handle:
            json.dump(result, handle, indent=2)
        print(json.dumps({"status": result["status"], "stage": result["stage"]}))
    return 0 if result["status"] == "PASSED" else 1
