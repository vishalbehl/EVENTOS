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

from celery import Celery, Task
from celery.utils.log import get_task_logger
from celery.signals import task_prerun, task_success, task_failure, task_retry
from kombu import Exchange, Queue

from workers.config import settings
from workers.lib.dead_letter import record_dead_letter, sanitize_failure_text
from workers.task_policy import legacy_queue_for, policy_for_task, task_annotations

# ── App instance ──────────────────────────────────────────────
class PolicyTask(Task):
    """Apply bounded retries to legacy tasks that do not handle exceptions."""

    abstract = True

    def __call__(self, *args, **kwargs):
        from celery.exceptions import Retry
        from workers.task_policy import is_retryable

        try:
            return super().__call__(*args, **kwargs)
        except Retry:
            raise
        except Exception as exc:
            policy = policy_for_task(self.name)
            attempt = int(getattr(self.request, "retries", 0) or 0)
            if is_retryable(exc) and attempt < policy.max_retries:
                raise self.retry(
                    exc=exc,
                    countdown=min(300, policy.retry_delay(attempt, apply_jitter=True)),
                    max_retries=policy.max_retries,
                )
            raise

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        record_dead_letter(
            task_id=str(task_id) if task_id else None,
            task_name=str(self.name or "unknown"),
            retries=int(getattr(self.request, "retries", 0) or 0),
            exception=exc,
            args=args,
            kwargs=kwargs,
        )
        return super().on_failure(exc, task_id, args, kwargs, einfo)


app = Celery("eventos_db_workers", task_cls=PolicyTask)

# ── Broker & result backend ───────────────────────────────────
app.conf.broker_url = settings.CELERY_BROKER_URL
app.conf.result_backend = settings.CELERY_RESULT_BACKEND
app.conf.task_annotations = task_annotations()

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
# The legacy namespace is deliberate. The backend application workers consume
# the unprefixed queues; these workers must never steal those messages because
# they register a different task set.
# legacy-default  → lightweight sync metadata tasks
# legacy-files    → CPU-heavy tasks (thumbnail, PDF conversion, validation)
# legacy-videos   → GPU/CPU-heavy tasks (video transcoding)
# legacy-imports  → long-running import tasks
# legacy-reports  → report generation and projection work
# legacy-notifications → outbound communication tasks
# legacy-search   → search index sync tasks

default_exchange = Exchange("default", type="direct")
files_exchange = Exchange("files", type="direct")
videos_exchange = Exchange("videos", type="direct")
imports_exchange = Exchange("imports", type="direct")
search_exchange = Exchange("search", type="direct")
reports_exchange = Exchange("reports", type="direct")
reconciliation_exchange = Exchange("reconciliation", type="direct")

app.conf.task_queues = (
    Queue("legacy-default", default_exchange, routing_key="legacy-default"),
    Queue("legacy-files", files_exchange, routing_key="legacy-files"),
    Queue("legacy-videos", videos_exchange, routing_key="legacy-videos"),
    Queue("legacy-imports", imports_exchange, routing_key="legacy-imports"),
    Queue("legacy-reports", reports_exchange, routing_key="legacy-reports"),
    Queue("legacy-reconciliation", reconciliation_exchange, routing_key="legacy-reconciliation"),
    Queue("legacy-notifications", default_exchange, routing_key="legacy-notifications"),
    Queue("legacy-search", search_exchange, routing_key="legacy-search"),
)
app.conf.task_default_queue = "legacy-default"
app.conf.task_default_exchange = "default"
app.conf.task_default_routing_key = "legacy-default"

# ── Per-task routing ──────────────────────────────────────────
app.conf.task_routes = {
    "workers.tasks.file_tasks.*":         {"queue": legacy_queue_for("files")},
    "workers.tasks.video_tasks.*":        {"queue": legacy_queue_for("videos")},
    "workers.tasks.import_tasks.*":       {"queue": legacy_queue_for("imports")},
    "workers.tasks.report_tasks.*":       {"queue": legacy_queue_for("reports")},
    "workers.tasks.notification_tasks.*": {"queue": legacy_queue_for("notifications")},
    "workers.tasks.sync_tasks.*":         {"queue": legacy_queue_for("default")},
    "workers.tasks.search_tasks.*":       {"queue": legacy_queue_for("search")},
}

# ── Retry / concurrency defaults ──────────────────────────────
app.conf.task_acks_late = True           # ack after execution, not on receive
app.conf.task_reject_on_worker_lost = True
app.conf.task_create_missing_queues = False
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
                error_message=sanitize_failure_text(exception),
                exc_info=sanitize_failure_text(
                    str(kw.get("einfo") or traceback or tb.format_exc()),
                    limit=10000,
                ),
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
