# backend/app/worker.py
from celery import Celery
from celery.schedules import crontab
import re
from app.config import settings
import app.models
from app.core.task_policy import policy_for


_DEFAULT_POLICY = policy_for("default")
_FILES_POLICY = policy_for("files")
_VIDEOS_POLICY = policy_for("videos")
_IMPORTS_POLICY = policy_for("imports")
_REPORTS_POLICY = policy_for("reports")
_NOTIFICATIONS_POLICY = policy_for("notifications")
_SEARCH_POLICY = policy_for("search")

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
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    broker_connection_retry_on_startup=True,
    worker_prefetch_multiplier=1,
    task_default_queue="default",
    task_default_exchange="tasks",
    task_default_routing_key="default",
    # A typo must fail at publish time instead of silently creating an
    # unmonitored queue that no worker consumes.
    task_create_missing_queues=False,
    # Task decorators own retry and timeout policy. A wildcard annotation is
    # intentionally avoided because Celery applies it after registration and
    # can silently override queue-specific limits.
    task_annotations={},
    task_queues={
        "critical": {}, "default": {}, "files": {}, "videos": {},
        "imports": {}, "search": {}, "notifications": {},
        "reports": {}, "reconciliation": {},
        "legacy-default": {}, "legacy-files": {}, "legacy-videos": {},
        "legacy-imports": {}, "legacy-search": {}, "legacy-notifications": {},
        "legacy-reports": {}, "legacy-reconciliation": {},
    },
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
        "recover-email-campaign-dispatches": {
            "task": "app.tasks.recover_email_campaign_dispatches",
            "schedule": 300.0,
        },
        "recover-import-dispatches": {
            "task": "app.tasks.recover_import_dispatches",
            "schedule": 300.0,
        },
    },
    # The API still publishes compatibility tasks by their legacy names. Keep
    # those messages in a separate namespace so the backend application
    # workers cannot consume and discard tasks they do not register.
    task_routes={
        # Timeout values are defined on the task itself. Keeping route entries
        # limited to delivery concerns avoids Celery publishing the same
        # execution option twice when task annotations are applied.
        "app.tasks.process_durable_upload": {"queue": "files"},
        "app.tasks.process_import_upload": {"queue": "imports"},
        "app.tasks.recover_import_dispatches": {"queue": "imports"},
        "app.tasks.scan_asset_for_viruses": {"queue": "files"},
        "app.tasks.analytics_projection_tasks.refresh_event_registration_summary": {"queue": "reports"},
        "app.tasks.attendance_projection_tasks.refresh_event_attendance_summary": {"queue": "reports"},
        "app.tasks.payment_projection_tasks.refresh_event_payment_summary": {"queue": "reports"},
        "app.tasks.speaker_projection_tasks.refresh_event_speaker_summary": {"queue": "reports"},
        "app.tasks.idempotency_tasks.purge_expired": {"queue": "reconciliation"},
        "app.tasks.run_excel_import": {"queue": "imports"},
        "app.tasks.operations.*": {"queue": "reconciliation"},
        "app.tasks.platform_commercial.*": {"queue": "reports"},
        "app.tasks.workflow_jobs.*": {"queue": "notifications"},
        "app.tasks.organization_console_tasks.reconcile_organization_usage": {"queue": "reconciliation"},
        "app.tasks.organization_console_tasks.execute_lifecycle_job": {"queue": "reconciliation"},
        "app.tasks.organization_console_rollout_tasks.*": {"queue": "reconciliation"},
        "app.tasks.validate_presentation": {"queue": "files"},
        "app.tasks.validate_poster": {"queue": "files"},
        "app.tasks.process_email_campaign": {"queue": "notifications"},
        "app.tasks.recover_email_campaign_dispatches": {"queue": "notifications"},
        "workers.tasks.file_tasks.*": {"queue": "legacy-files"},
        "workers.tasks.video_tasks.*": {"queue": "legacy-videos"},
        "workers.tasks.import_tasks.*": {"queue": "legacy-imports"},
        "workers.tasks.report_tasks.*": {"queue": "legacy-reports"},
        "workers.tasks.notification_tasks.*": {"queue": "legacy-notifications"},
        "workers.tasks.sync_tasks.*": {"queue": "legacy-default"},
        "workers.tasks.search_tasks.*": {"queue": "legacy-search"},
    },
)

# Autodiscover tasks in app.tasks package
celery_app.autodiscover_tasks(["app.tasks"])
celery_app.conf.imports = tuple(celery_app.conf.imports or ()) + (
    "app.tasks.organization_console_tasks",
    "app.tasks.organization_console_rollout_tasks",
    "app.tasks.workflow_jobs",
    "app.tasks.operations_jobs",
    "app.tasks.analytics_projection_tasks",
    "app.tasks.queue_probe",
    "app.tasks.venue_ops_events",
    "app.modules.notifications.tasks.email_tasks",
)
# Import the compatibility re-export package after the Celery instance exists
# so task decorators register both legacy and canonical names at startup.
import app.tasks  # noqa: E402,F401

# ── Celery Worker Multi-Tenancy Signal Handlers ─────────────────
import uuid
from celery.signals import before_task_publish, task_prerun, task_postrun, task_failure
from loguru import logger
from app.database import tenant_org_id
from app.modules.operations_control.models import TaskFailure
from app.core.task_replay import replay_payload_for
from app.database import SessionLocal
import hashlib
import json

@before_task_publish.connect
def on_task_publish(headers=None, body=None, **kwargs):
    org_id = tenant_org_id.get()
    if org_id:
        if headers is not None:
            headers["tenant_org_id"] = str(org_id)

_tenant_tokens = {}

_SENSITIVE_ERROR_RE = re.compile(
    r"(?i)(password|passwd|secret|token|api[_-]?key|authorization|cookie)"
    r"\s*[:=]\s*([^\s,;]+)"
)
_EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)


def _safe_task_error(exception: BaseException | None) -> str:
    """Keep terminal task diagnostics useful without persisting secrets."""
    message = str(exception or "Task failed")
    message = _SENSITIVE_ERROR_RE.sub(r"\1=[REDACTED]", message)
    message = _EMAIL_RE.sub("[REDACTED_EMAIL]", message)
    return message[:1000]

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


@task_failure.connect
def record_task_failure(task_id=None, exception=None, sender=None, args=None, kwargs=None, einfo=None, **signature):
    """Persist bounded failure metadata without exposing task arguments."""
    try:
        request = getattr(sender, "request", None)
        headers = getattr(request, "headers", None) if request else None
        organization_id = None
        if isinstance(headers, dict) and headers.get("tenant_org_id"):
            try:
                organization_id = uuid.UUID(str(headers["tenant_org_id"]))
            except (TypeError, ValueError):
                organization_id = None
        payload_hash = hashlib.sha256(
            json.dumps({"args": args or [], "kwargs": kwargs or {}}, sort_keys=True, default=str).encode("utf-8")
        ).hexdigest()
        replay_payload = replay_payload_for(str(getattr(sender, "name", None) or ""), args, kwargs)
        with SessionLocal() as db:
            row = db.query(TaskFailure).filter(TaskFailure.task_id == str(task_id)).one_or_none()
            if row is None:
                row = TaskFailure(
                    task_id=str(task_id or "unknown"),
                    task_name=str(getattr(sender, "name", None) or "unknown"),
                    organization_id=organization_id,
                    retry_count=int(getattr(request, "retries", 0) or 0),
                    exception_type=type(exception).__name__ if exception else "UnknownError",
                    error_message=_safe_task_error(exception),
                    args_hash=payload_hash,
                    replay_queue=replay_payload.get("queue") if replay_payload else None,
                    replay_args=replay_payload.get("args") if replay_payload else None,
                )
                db.add(row)
            else:
                row.retry_count = max(row.retry_count, int(getattr(request, "retries", 0) or 0))
                row.exception_type = type(exception).__name__ if exception else row.exception_type
                row.error_message = _safe_task_error(exception)
                if replay_payload:
                    row.replay_queue = replay_payload["queue"]
                    row.replay_args = replay_payload["args"]
            db.commit()
    except Exception as record_error:
        # Observability must never alter Celery task failure semantics.
        logger.warning("task_failure_recording_failed type={}", type(record_error).__name__)
