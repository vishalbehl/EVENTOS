# =============================================================
# Conference Platform — Celery Application
# workers/celery_app.py
#
# Single Celery app instance imported by all task modules.
# Configured with per-task routing so file-heavy tasks go to
# dedicated high-memory queues.
#
# Job Execution Tracking:
#   Celery signals (task_prerun, task_success, task_failure,
#   task_retry) automatically record every task execution into
#   the `jobs` schema without modifying individual task files.
# =============================================================

from celery import Celery
from celery.utils.log import get_task_logger
from celery.signals import task_prerun, task_success, task_failure, task_retry
from kombu import Exchange, Queue

from workers.config import settings

# ── App instance ──────────────────────────────────────────────
app = Celery("eventos_db_workers")

# ── Broker & result backend ───────────────────────────────────
app.conf.broker_url = settings.CELERY_BROKER_URL
app.conf.result_backend = settings.CELERY_RESULT_BACKEND

# ── Serialization ─────────────────────────────────────────────
app.conf.task_serializer = "json"
app.conf.result_serializer = "json"
app.conf.accept_content = ["json"]
app.conf.result_expires = 60 * 60 * 24  # 24 hours
app.conf.imports = (
    "workers.tasks.file_tasks",
    "workers.tasks.import_tasks",
    "workers.tasks.notification_tasks",
    "workers.tasks.report_tasks",
    "workers.tasks.search_tasks",
    "workers.tasks.sync_tasks",
    "workers.tasks.video_tasks",
)

# ── Timezone ─────────────────────────────────────────────────
app.conf.timezone = "UTC"
app.conf.enable_utc = True

# ── Queues ────────────────────────────────────────────────────
# default  → lightweight tasks (notifications, sync metadata)
# files    → CPU-heavy tasks (thumbnail, PDF conversion, validation)
# videos   → GPU/CPU-heavy tasks (video transcoding)
# imports  → long-running tasks (Excel import, report generation)
# search   → search index sync tasks

default_exchange = Exchange("default", type="direct")
files_exchange = Exchange("files", type="direct")
videos_exchange = Exchange("videos", type="direct")
imports_exchange = Exchange("imports", type="direct")
search_exchange = Exchange("search", type="direct")

app.conf.task_queues = (
    Queue("default", default_exchange, routing_key="default"),
    Queue("files",   files_exchange,   routing_key="files"),
    Queue("videos",  videos_exchange,  routing_key="videos"),
    Queue("imports", imports_exchange, routing_key="imports"),
    Queue("search",  search_exchange,  routing_key="search"),
)
app.conf.task_default_queue = "default"
app.conf.task_default_exchange = "default"
app.conf.task_default_routing_key = "default"

# ── Per-task routing ──────────────────────────────────────────
app.conf.task_routes = {
    "workers.tasks.file_tasks.*":         {"queue": "files"},
    "workers.tasks.video_tasks.*":        {"queue": "videos"},
    "workers.tasks.import_tasks.*":       {"queue": "imports"},
    "workers.tasks.report_tasks.*":       {"queue": "imports"},
    "workers.tasks.notification_tasks.*": {"queue": "default"},
    "workers.tasks.sync_tasks.*":         {"queue": "default"},
    "workers.tasks.search_tasks.*":       {"queue": "search"},
}

# ── Retry / concurrency defaults ──────────────────────────────
app.conf.task_acks_late = True           # ack after execution, not on receive
app.conf.worker_prefetch_multiplier = 1  # one task per worker at a time (heavy tasks)
app.conf.task_track_started = True       # record STARTED state in result backend

# ── Autodiscovery ─────────────────────────────────────────────
app.autodiscover_tasks(
    packages=[
        "workers.tasks",
    ]
)

logger = get_task_logger(__name__)


# =============================================================
# JOB EXECUTION TRACKING — Celery Signals
#
# We use a thread-local dict to correlate task_id → execution_id
# across the prerun → success/failure lifecycle within a single
# worker process. This avoids any shared state between workers.
# =============================================================

import threading

_execution_id_map: dict[str, str] = {}
_map_lock = threading.Lock()


@task_prerun.connect
def on_task_prerun(task_id: str, task, args, kwargs, **kw) -> None:
    """
    Called just before a task starts executing.
    Creates a JobExecution record with status='running'.
    """
    try:
        from workers.lib.job_tracker import record_execution_start
        execution_id = record_execution_start(task.name, task_id)
        if execution_id:
            with _map_lock:
                _execution_id_map[task_id] = execution_id
    except Exception as exc:
        logger.warning(f"[signal:prerun] tracking failed for task_id={task_id}: {exc}")


@task_success.connect
def on_task_success(sender, result, **kw) -> None:
    """
    Called after a task completes successfully.
    Updates the JobExecution record to status='success'.
    """
    task_id = getattr(sender.request, "id", None)
    if not task_id:
        return
    with _map_lock:
        execution_id = _execution_id_map.pop(task_id, None)
    if execution_id:
        try:
            from workers.lib.job_tracker import record_execution_success
            record_execution_success(execution_id)
        except Exception as exc:
            logger.warning(f"[signal:success] tracking failed for task_id={task_id}: {exc}")


@task_failure.connect
def on_task_failure(task_id: str, exception, traceback, sender, **kw) -> None:
    """
    Called after a task fails (all retries exhausted or non-retryable error).
    Updates the JobExecution to status='failed' and creates a JobFailure record.
    """
    with _map_lock:
        execution_id = _execution_id_map.pop(task_id, None)
    if execution_id:
        try:
            import traceback as tb
            from workers.lib.job_tracker import record_execution_failure
            record_execution_failure(
                execution_id_str=execution_id,
                error_message=str(exception),
                exc_info=tb.format_exc(),
            )
        except Exception as exc:
            logger.warning(f"[signal:failure] tracking failed for task_id={task_id}: {exc}")


@task_retry.connect
def on_task_retry(request, reason, **kw) -> None:
    """
    Called when a task is being retried.
    Updates the JobExecution to status='retrying'.
    """
    task_id = getattr(request, "id", None)
    if not task_id:
        return
    with _map_lock:
        execution_id = _execution_id_map.get(task_id)
    if execution_id:
        try:
            from workers.lib.job_tracker import record_execution_retry
            record_execution_retry(execution_id)
        except Exception as exc:
            logger.warning(f"[signal:retry] tracking failed for task_id={task_id}: {exc}")
