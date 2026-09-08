"""Allow-listed, identifier-only payloads for safe dead-letter replay."""
from __future__ import annotations

from typing import Any
import uuid


# Only tasks whose arguments are stable UUID identifiers are replayable.
# Request bodies, credentials, and arbitrary task arguments are deliberately
# excluded from durable failure records.
REPLAYABLE_TASKS: dict[str, tuple[str, tuple[str, ...]]] = {
    "app.tasks.process_durable_upload": ("files", ("upload_id_str", "organization_id_str")),
    "app.tasks.process_import_upload": ("imports", ("upload_id_str", "organization_id_str", "job_id_str")),
    "app.tasks.run_excel_import": ("imports", ("job_id_str", "organization_id_str")),
    "app.tasks.validate_presentation": ("files", ("file_id_str", "organization_id_str")),
    "app.tasks.validate_poster": ("files", ("poster_id_str", "organization_id_str")),
    "app.tasks.scan_asset_for_viruses": ("files", ("asset_id_str", "organization_id_str")),
    "app.tasks.analytics_projection_tasks.refresh_event_registration_summary": ("reports", ("organization_id", "event_id")),
    "app.tasks.attendance_projection_tasks.refresh_event_attendance_summary": ("reports", ("organization_id", "event_id")),
    "app.tasks.payment_projection_tasks.refresh_event_payment_summary": ("reports", ("organization_id", "event_id")),
    "app.tasks.speaker_projection_tasks.refresh_event_speaker_summary": ("reports", ("organization_id", "event_id")),
    "app.tasks.operations.calculate_all_readiness_scores": ("reconciliation", ("organization_id_str",)),
    "app.tasks.operations.detect_all_resource_conflicts": ("reconciliation", ("organization_id_str",)),
    "app.tasks.operations.generate_upcoming_deployment_checklists": ("reconciliation", ("organization_id_str",)),
    "app.tasks.workflow_jobs.check_expired_approvals": ("notifications", ("organization_id_str",)),
    "app.tasks.workflow_jobs.check_escalations": ("notifications", ("organization_id_str",)),
    "app.tasks.workflow_jobs.send_reminders": ("notifications", ("organization_id_str",)),
    "app.tasks.dispatch_communication_batch": ("notifications", ("batch_id", "organization_id")),
    "app.tasks.process_email_campaign": ("notifications", ("campaign_id_str", "organization_id_str")),
    "app.tasks.platform_commercial.calculate_forecasts": ("reports", ("organization_id_str",)),
    "app.tasks.organization_console_tasks.reconcile_organization_usage": ("reconciliation", ("organization_id_str",)),
    "app.tasks.organization_console_tasks.execute_lifecycle_job": ("reconciliation", ("organization_id_str", "job_id_str")),
    "app.tasks.organization_console_tasks.expire_tenant_capability_controls": ("reconciliation", ("organization_id_str",)),
    "app.tasks.organization_console_rollout_tasks.shadow_compare_organization": ("reconciliation", ("organization_id_str",)),
    "app.tasks.venue_ops_events.dispatch_pending": ("notifications", ()),
    "app.tasks.organization_console_tasks.expire_override": ("reconciliation", ("organization_id_str",)),
    "app.tasks.organization_console_rollout_tasks.backfill_organization_console": ("reconciliation", ("organization_id_str",)),
}


def replay_payload_for(
    task_name: str, args: tuple[Any, ...] | list[Any] | None, kwargs: dict[str, Any] | None
) -> dict[str, Any] | None:
    """Return a bounded replay payload for an exact UUID-only task signature."""
    spec = REPLAYABLE_TASKS.get(task_name)
    if spec is None:
        return None
    queue, parameter_names = spec
    positional = list(args or [])
    named = kwargs or {}
    if positional and named:
        return None
    if named:
        if set(named) != set(parameter_names):
            return None
        values = [str(named[name]) for name in parameter_names]
    else:
        if len(positional) != len(parameter_names):
            return None
        values = [str(value) for value in positional]
    if any(not value or len(value) > 255 for value in values):
        return None
    # Every currently replayable task accepts UUID identifiers only.  Keeping
    # this validation here prevents credentials or arbitrary payloads from
    # becoming durable replay material if a task call site changes later.
    if any(_not_uuid(value) for value in values):
        return None
    return {"queue": queue, "args": values}


def _not_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
    except (ValueError, AttributeError, TypeError):
        return True
    return False
