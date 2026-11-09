"""Private local queue worker; observer pauses only after a real page commits."""
import asyncio
import json
import os
from pathlib import Path
import re
import time
import uuid

from celery.signals import task_postrun
from kombu import Queue
from sqlalchemy.engine import make_url
from app.config import settings

queue = os.environ.get("CATEGORY_A_CATALOGUE_QUEUE", "")
database = make_url(settings.async_database_url)
if (settings.is_production or database.host not in {"localhost", "127.0.0.1"}
        or not re.fullmatch(r"category_a_restore_[0-9]{8}_[0-9a-f]{12}", database.database or "")
        or database.database != os.environ.get("CATEGORY_A_CATALOGUE_DATABASE")
        or not re.fullmatch(r"category_a_checkpoint_[0-9a-f]{12}", database.username or "")
        or not re.fullmatch(r"category-a-catalogue-[0-9a-f]{32}", queue)):
    raise RuntimeError("Only isolated local backup-derived catalogue probes are permitted")
directory = Path(os.environ["CATEGORY_A_CATALOGUE_EVIDENCE"])
paused_work = uuid.UUID(os.environ["CATEGORY_A_CATALOGUE_PAUSED_WORK"])
broker = os.environ["CATEGORY_A_CATALOGUE_BROKER"]
if not re.fullmatch(r"redis://127\.0\.0\.1:[0-9]+/0", broker):
    raise RuntimeError("Probe broker must be a private local Redis instance")

from app.worker import celery_app
from app.tasks import catalogue_reconciliation as worker
from app.modules.registration.services import catalogue_work

celery_app.conf.update(broker_url=broker, result_backend=None, task_ignore_result=True,
    task_queues=(Queue(queue),), task_default_queue=queue,
    task_routes={"app.tasks.catalogue_reconciliation.*": {"queue": queue}},
    broker_connection_timeout=1,
    broker_transport_options={"socket_timeout": 1, "socket_connect_timeout": 1,
        "retry_on_timeout": False}, worker_enable_remote_control=True)
for task in (worker.process_catalogue_work, worker.recover_catalogue_reconciliation_runs,
        worker.fanout_catalogue_reconciliation):
    task.queue = queue
    task.ignore_result = True

original_execute = catalogue_work.execute_page


async def observe_committed_page(work_id, owner, generation):
    result = await original_execute(work_id, owner, generation)
    if work_id == paused_work and result.get("pages_completed") == 1:
        marker = directory / "page-committed.json"
        with marker.open("x", encoding="utf-8") as output:
            json.dump({"work_id": str(work_id), "pid": os.getpid(), "generation": generation}, output)
        deadline = time.monotonic() + 90
        while not (directory / "release-after-broker-stop").exists():
            if time.monotonic() >= deadline:
                raise RuntimeError("Probe coordinator did not release committed-page barrier")
            await asyncio.sleep(0.05)
    return result


catalogue_work.execute_page = observe_committed_page


@task_postrun.connect
def record_delivery(sender=None, task_id=None, state=None, retval=None, **_kwargs):
    if sender and sender.name.startswith("app.tasks.catalogue_reconciliation."):
        path = directory / f"delivery-{uuid.uuid4().hex}.tmp"
        with path.open("x", encoding="utf-8") as output:
            json.dump({"task": sender.name, "task_id": task_id, "state": state,
                "pid": os.getpid(), "result": retval if isinstance(retval, dict) else None}, output)
        path.replace(path.with_suffix(".json"))
