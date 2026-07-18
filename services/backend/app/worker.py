# backend/app/worker.py
from celery import Celery
from app.config import settings
import app.models

celery_app = Celery(
    "worker",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=3600,  # 1 hour
    beat_schedule={
        "flush-api-usage-every-5-minutes": {
            "task": "app.tasks.platform_tasks.flush_api_usage",
            "schedule": 300.0,  # every 5 minutes
        },
    },
    # The API publishes standalone processing tasks by name. Route those task
    # families away from the backend-only `celery` queue so the processing
    # worker that imports workers.tasks consumes them.
    task_routes={
        "workers.tasks.file_tasks.*": {"queue": "files"},
        "workers.tasks.video_tasks.*": {"queue": "videos"},
        "workers.tasks.import_tasks.*": {"queue": "imports"},
        "workers.tasks.report_tasks.*": {"queue": "imports"},
        "workers.tasks.notification_tasks.*": {"queue": "default"},
        "workers.tasks.sync_tasks.*": {"queue": "default"},
        "workers.tasks.search_tasks.*": {"queue": "search"},
    },
)

# Autodiscover tasks in app.tasks package
celery_app.autodiscover_tasks(["app.tasks"])

# ── Celery Worker Multi-Tenancy Signal Handlers ─────────────────
import uuid
from celery.signals import before_task_publish, task_prerun, task_postrun
from app.database import tenant_org_id

@before_task_publish.connect
def on_task_publish(headers=None, body=None, **kwargs):
    org_id = tenant_org_id.get()
    if org_id:
        if headers is not None:
            headers["tenant_org_id"] = str(org_id)

@task_prerun.connect
def on_task_prerun(task_id, task, args, kwargs, **signature):
    request = task.request
    headers = None
    if request:
        headers = getattr(request, "headers", None)
        if headers is None and hasattr(request, "get"):
            headers = request.get("headers", None)

    if headers and isinstance(headers, dict):
        org_id_str = headers.get("tenant_org_id")
        if org_id_str:
            try:
                org_id = uuid.UUID(org_id_str)
                task._tenant_token = tenant_org_id.set(org_id)
            except ValueError:
                pass

@task_postrun.connect
def on_task_postrun(task_id, task, args, kwargs, retval, state, **signature):
    token = getattr(task, "_tenant_token", None)
    if token:
        tenant_org_id.reset(token)
