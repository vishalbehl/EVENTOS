import pytest

from app.core.task_policy import PermanentTaskError, is_retryable, policy_for


def test_queue_policies_are_bounded_and_exponential():
    policy = policy_for("imports")
    assert policy.hard_timeout_seconds > policy.soft_timeout_seconds
    assert policy.retry_delay(2) == policy.backoff_seconds * 4
    assert policy.max_retries > 0


def test_permanent_failures_are_not_retryable():
    assert not is_retryable(PermanentTaskError("bad file"))
    assert not is_retryable(ValueError("invalid input"))
    assert is_retryable(ConnectionError("temporary outage"))


def test_audit_tasks_classify_failures_before_retrying():
    import inspect
    from app.tasks import audit_tasks

    source = inspect.getsource(audit_tasks._retry_audit_task)
    assert "is_retryable" in source
    assert "max_retries" in source
    assert "retry_delay" in source
    for task_name in ("write_audit_log", "write_api_request_log"):
        task_source = inspect.getsource(getattr(audit_tasks, task_name).run)
        assert "_retry_audit_task" in task_source


def test_all_declared_worker_queues_have_explicit_policies():
    for queue in ("critical", "default", "files", "videos", "imports", "search", "notifications", "reports", "reconciliation"):
        assert policy_for(queue).queue == queue


def test_registered_application_tasks_are_policy_governed():
    import app.tasks  # noqa: F401 - import all re-exported application tasks
    from app.worker import celery_app

    allowed_queues = {
        "critical", "default", "files", "videos", "imports", "search",
        "notifications", "reports", "reconciliation",
    }
    registered = {
        name: task for name, task in celery_app.tasks.items()
        if name.startswith("app.")
    }
    assert registered
    for name, task in registered.items():
        assert task.queue in allowed_queues, name
        assert task.acks_late is True, name
        assert task.soft_time_limit and task.time_limit, name
        assert task.time_limit >= task.soft_time_limit, name


def test_presentation_validation_tasks_use_bounded_files_policy():
    from app.modules.presentations.tasks.file_tasks import validate_poster, validate_presentation

    policy = policy_for("files")
    for task in (validate_presentation, validate_poster):
        assert task.max_retries == policy.max_retries
        assert task.soft_time_limit == policy.soft_timeout_seconds
        assert task.time_limit == policy.hard_timeout_seconds
        assert task.acks_late is True
        assert task.queue == policy.queue


def test_workflow_tasks_use_bounded_notification_policy():
    from app.tasks.workflow_jobs import check_escalations, check_expired_approvals, send_reminders

    policy = policy_for("notifications")
    for task in (check_expired_approvals, check_escalations, send_reminders):
        assert task.max_retries == policy.max_retries
        assert task.soft_time_limit == policy.soft_timeout_seconds
        assert task.time_limit == policy.hard_timeout_seconds
        assert task.acks_late is True
        assert task.queue == policy.queue


def test_projection_tasks_use_bounded_reports_policy():
    from app.tasks.analytics_projection_tasks import refresh_event_registration_summary_task
    from app.tasks.attendance_projection_tasks import refresh_event_attendance_summary_task
    from app.tasks.payment_projection_tasks import refresh_event_payment_summary_task
    from app.tasks.speaker_projection_tasks import refresh_event_speaker_summary_task

    policy = policy_for("reports")
    for task in (
        refresh_event_registration_summary_task,
        refresh_event_attendance_summary_task,
        refresh_event_payment_summary_task,
        refresh_event_speaker_summary_task,
    ):
        assert task.max_retries == policy.max_retries
        assert task.soft_time_limit == policy.soft_timeout_seconds
        assert task.time_limit == policy.hard_timeout_seconds
        assert task.acks_late is True
        assert task.queue == policy.queue


def test_email_campaign_task_uses_bounded_notification_policy():
    from app.modules.notifications.tasks.email_tasks import process_email_campaign

    policy = policy_for("notifications")
    assert process_email_campaign.max_retries == policy.max_retries
    assert process_email_campaign.soft_time_limit == policy.soft_timeout_seconds
    assert process_email_campaign.time_limit == policy.hard_timeout_seconds
    assert process_email_campaign.acks_late is True
    assert process_email_campaign.queue == policy.queue


def test_email_campaign_task_classifies_failures_before_retrying():
    import inspect
    from app.modules.notifications.tasks.email_tasks import process_email_campaign

    source = inspect.getsource(process_email_campaign.run)
    assert "is_retryable" in source
    assert "campaign processing failed" in source
    assert "str(exc)" not in source


def test_email_campaign_uses_durable_recipient_claims_before_external_delivery():
    import inspect
    from app.modules.notifications.tasks.email_tasks import _process_email_campaign_with_session
    from app.modules.notifications.services import email_service

    task_source = inspect.getsource(_process_email_campaign_with_session)
    assert "claim_campaign_recipient" in task_source
    assert "log_id=log_id" in task_source
    assert "await db.commit()" in inspect.getsource(email_service.claim_campaign_recipient)


def test_commercial_tasks_use_bounded_reports_policy():
    from app.tasks.platform_commercial_tasks import calculate_forecasts, update_exchange_rates

    policy = policy_for("reports")
    for task in (calculate_forecasts, update_exchange_rates):
        assert task.max_retries == policy.max_retries
        assert task.soft_time_limit == policy.soft_timeout_seconds
        assert task.time_limit == policy.hard_timeout_seconds
        assert task.acks_late is True
        assert task.queue == policy.queue


def test_communication_batch_task_uses_bounded_notification_policy():
    from app.modules.notifications.tasks.channel_delivery_tasks import dispatch_communication_batch

    policy = policy_for("notifications")
    assert dispatch_communication_batch.max_retries == policy.max_retries
    assert dispatch_communication_batch.soft_time_limit == policy.soft_timeout_seconds
    assert dispatch_communication_batch.time_limit == policy.hard_timeout_seconds
    assert dispatch_communication_batch.acks_late is True
    assert dispatch_communication_batch.queue == policy.queue


def test_api_usage_flush_uses_bounded_reconciliation_policy():
    from app.tasks.platform_tasks import flush_api_usage

    policy = policy_for("reconciliation")
    assert flush_api_usage.max_retries == policy.max_retries
    assert flush_api_usage.soft_time_limit == policy.soft_timeout_seconds
    assert flush_api_usage.time_limit == policy.hard_timeout_seconds
    assert flush_api_usage.acks_late is True
    assert flush_api_usage.queue == policy.queue


def test_audit_tasks_use_bounded_default_policy():
    from app.tasks.audit_tasks import write_api_request_log, write_audit_log

    policy = policy_for("default")
    for task in (write_audit_log, write_api_request_log):
        assert task.max_retries == policy.max_retries
        assert task.soft_time_limit == policy.soft_timeout_seconds
        assert task.time_limit == policy.hard_timeout_seconds
        assert task.acks_late is True
        assert task.queue == policy.queue


def test_upload_tasks_declare_their_processing_queue_policies():
    from app.tasks.upload_jobs import process_durable_upload, process_import_upload

    for task, queue in ((process_durable_upload, "files"), (process_import_upload, "imports")):
        policy = policy_for(queue)
        assert task.max_retries == policy.max_retries
        assert task.soft_time_limit == policy.soft_timeout_seconds
        assert task.time_limit == policy.hard_timeout_seconds
        assert task.acks_late is True
        assert task.queue == policy.queue


def test_excel_import_task_declares_the_imports_policy():
    from app.tasks.tasks import run_excel_import

    policy = policy_for("imports")
    assert run_excel_import.max_retries == policy.max_retries
    assert run_excel_import.soft_time_limit == policy.soft_timeout_seconds
    assert run_excel_import.time_limit == policy.hard_timeout_seconds
    assert run_excel_import.acks_late is True
    assert run_excel_import.queue == policy.queue


def test_operations_tasks_declare_the_reconciliation_policy():
    from app.tasks.operations_jobs import (
        calculate_all_readiness_scores,
        detect_all_resource_conflicts,
        generate_upcoming_deployment_checklists,
    )

    policy = policy_for("reconciliation")
    for task in (
        calculate_all_readiness_scores,
        detect_all_resource_conflicts,
        generate_upcoming_deployment_checklists,
    ):
        assert task.max_retries == policy.max_retries
        assert task.soft_time_limit == policy.soft_timeout_seconds
        assert task.time_limit == policy.hard_timeout_seconds
        assert task.acks_late is True
        assert task.queue == policy.queue


def test_control_plane_tasks_declare_the_reconciliation_policy():
    from app.tasks.idempotency_tasks import purge_expired_idempotency_records
    from app.tasks.organization_console_rollout_tasks import (
        backfill_organization_console_task,
        fanout_shadow_comparisons_task,
        shadow_compare_organization_task,
    )
    from app.tasks.organization_console_tasks import (
        execute_lifecycle_job,
        expire_override,
        expire_tenant_capability_controls_task,
        fanout_capability_control_expiry_task,
        fanout_nightly_usage_reconciliation_task,
        reconcile_organization_usage_task,
    )

    policy = policy_for("reconciliation")
    for task in (
        purge_expired_idempotency_records,
        backfill_organization_console_task,
        fanout_shadow_comparisons_task,
        shadow_compare_organization_task,
        execute_lifecycle_job,
        expire_override,
        expire_tenant_capability_controls_task,
        fanout_capability_control_expiry_task,
        fanout_nightly_usage_reconciliation_task,
        reconcile_organization_usage_task,
    ):
        assert task.max_retries == policy.max_retries
        assert task.soft_time_limit == policy.soft_timeout_seconds
        assert task.time_limit == policy.hard_timeout_seconds
        assert task.acks_late is True
        assert task.queue == policy.queue


def test_idempotency_purge_retries_only_classified_transient_failures():
    import inspect
    from app.tasks.idempotency_tasks import purge_expired_idempotency_records

    policy = policy_for("reconciliation")
    source = inspect.getsource(purge_expired_idempotency_records.run)
    module_source = inspect.getsource(__import__("app.tasks.idempotency_tasks", fromlist=["purge_expired_idempotency_records"]))
    assert "bind=True" in module_source
    assert purge_expired_idempotency_records.max_retries == policy.max_retries
    assert "is_retryable" in source
    assert "self.retry" in source
    assert "max_retries=_RECONCILIATION_POLICY.max_retries" in source
