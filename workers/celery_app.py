# =============================================================
# Conference Platform — Celery Application
# workers/celery_app.py
#
# Single Celery app instance imported by all task modules.
# Configured with per-task routing so file-heavy tasks go to
# dedicated high-memory queues.
# =============================================================

from celery import Celery
from celery.utils.log import get_task_logger
from kombu import Exchange, Queue

from workers.config import settings

# ── App instance ──────────────────────────────────────────────
app = Celery("conf_platform_workers")

# ── Broker & result backend ───────────────────────────────────
app.conf.broker_url = settings.CELERY_BROKER_URL
app.conf.result_backend = settings.CELERY_RESULT_BACKEND

# ── Serialization ─────────────────────────────────────────────
app.conf.task_serializer = "json"
app.conf.result_serializer = "json"
app.conf.accept_content = ["json"]
app.conf.result_expires = 60 * 60 * 24  # 24 hours

# ── Timezone ─────────────────────────────────────────────────
app.conf.timezone = "UTC"
app.conf.enable_utc = True

# ── Queues ────────────────────────────────────────────────────
# default  → lightweight tasks (notifications, sync metadata)
# files    → CPU-heavy tasks (thumbnail, PDF conversion, validation)
# videos   → GPU/CPU-heavy tasks (video transcoding)
# imports  → long-running tasks (Excel import, report generation)

default_exchange = Exchange("default", type="direct")
files_exchange = Exchange("files", type="direct")
videos_exchange = Exchange("videos", type="direct")
imports_exchange = Exchange("imports", type="direct")

app.conf.task_queues = (
    Queue("default", default_exchange, routing_key="default"),
    Queue("files",   files_exchange,   routing_key="files"),
    Queue("videos",  videos_exchange,  routing_key="videos"),
    Queue("imports", imports_exchange, routing_key="imports"),
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
