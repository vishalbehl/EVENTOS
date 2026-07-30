# backend/app/worker.py
from celery import Celery
from celery.schedules import crontab
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
          "reconcile-organizer-usage-nightly": {
            "task": "app.tasks.organization_console_tasks.fanout_nightly_usage_reconciliation",
            "schedule": crontab(hour=2, minute=15),
          },
          "expire-capability-controls-every-5-minutes": {
              "task": "app.tasks.organization_console_tasks.fanout_capability_control_expiry",
              # Keep scheduled grants, restrictions, flag overrides, and
              # capacity reservations within the five-minute capability-cache
              # freshness contract.
              "schedule": crontab(minute="*/5"),
          },
        "compare-organizer-entitlements-nightly": {
            "task": "app.tasks.organization_console_rollout_tasks.fanout_shadow_comparisons",
            "schedule": crontab(hour=3, minute=15),
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
celery_app.conf.imports = tuple(celery_app.conf.imports or ()) + ("app.tasks.organization_console_tasks", "app.tasks.organization_console_rollout_tasks")

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

_tenant_tokens = {}

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
                _tenant_tokens[task_id] = tenant_org_id.set(org_id)
            except ValueError:
                pass

@task_postrun.connect
def on_task_postrun(task_id, task, args, kwargs, retval, state, **signature):
    token = _tenant_tokens.pop(task_id, None)
    if token:
        tenant_org_id.reset(token)
