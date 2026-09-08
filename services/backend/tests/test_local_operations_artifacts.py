import os
from pathlib import Path


ROOT = Path(os.environ.get("CONF_PLATFORM_ROOT", Path(__file__).resolve().parents[3] if len(Path(__file__).resolve().parents) > 3 else "/workspace"))


def test_local_production_like_artifacts_exist():
    assert (ROOT / "docker-compose.staging.yml").exists()
    assert (ROOT / "infrastructure" / "caddy" / "Caddyfile").exists()
    assert (ROOT / "infrastructure" / "monitoring" / "prometheus.yml").exists()
    assert (ROOT / "ops" / "staging.ps1").exists()
    assert (ROOT / "ops" / "staging_backup.ps1").exists()
    assert (ROOT / "ops" / "staging_restore.ps1").exists()


def test_staging_compose_has_bounded_resources_and_log_rotation():
    compose = (ROOT / "docker-compose.staging.yml").read_text(encoding="utf-8")
    assert "max-size: \"10m\"" in compose
    assert "max-file: \"5\"" in compose
    assert compose.count("mem_limit:") >= 8
    assert 'queues=critical,default,notifications' in compose
    assert 'workers-processing:' in compose
    assert 'queues=files,videos,imports,search,reports,reconciliation' in compose
    assert "staging_caddy_data" in compose
    assert "staging_prometheus_data" in compose


def test_legacy_worker_is_registered_and_queue_isolated():
    compose = (ROOT / "docker-compose.staging.yml").read_text(encoding="utf-8")
    failure_checks = (ROOT / "ops" / "staging_failure_checks.ps1").read_text(encoding="utf-8")
    release = (ROOT / "ops" / "staging_release_check.ps1").read_text(encoding="utf-8")
    assert "workers-legacy:" in compose
    assert "context: ." in compose
    assert "workers.celery_app:app" in compose
    assert "legacy-files,legacy-videos" in compose
    assert "workers-legacy" in failure_checks
    assert "workers-legacy" in release
    assert "legacy task registry" in release


def test_release_gate_requires_live_retry_replay_probe():
    release = (ROOT / "ops" / "staging_release_check.ps1").read_text(encoding="utf-8")
    assert "Check 'retry exhaustion and replay'" in release
    assert "staging_retry_replay_probe.py" in release


def test_backup_restore_are_explicitly_staged():
    backup = (ROOT / "ops" / "staging_backup.ps1").read_text(encoding="utf-8")
    restore = (ROOT / "ops" / "staging_restore.ps1").read_text(encoding="utf-8")
    assert "pg_dump" in backup
    assert "mirror --overwrite" in backup
    assert "Type RESTORE" in restore
    assert "--clean --if-exists" in restore


def test_rollback_check_restores_owned_services_after_temporary_image():
    rollback = (ROOT / "ops" / "staging_rollback_check.ps1").read_text(encoding="utf-8")
    assert "rm -sf backend workers" in rollback
    assert "rollback_restore=current-staging-image" in rollback


def test_staging_load_wrapper_forwards_both_performance_budgets():
    staging = (ROOT / "ops" / "staging.ps1").read_text(encoding="utf-8")
    assert "--max-p95-ms $MaxP95Ms" in staging
    assert "--max-error-rate $MaxErrorRate" in staging
    assert "fixture-output" in staging


def test_staging_soak_artifact_and_command_exist():
    staging = (ROOT / "ops" / "staging.ps1").read_text(encoding="utf-8")
    soak = ROOT / "ops" / "staging_soak_test.py"
    assert soak.exists()
    assert "'soak'" in staging
    assert "--duration-seconds $DurationSeconds" in staging
    assert "--interval-ms $IntervalMs" in staging
    assert "if ($Token)" in staging
    assert "'--token', $Token" in staging


def test_worker_recovery_checks_celery_liveness_and_queue_topology():
    checks = (ROOT / "ops" / "staging_failure_checks.ps1").read_text(encoding="utf-8")
    release = (ROOT / "ops" / "staging_release_check.ps1").read_text(encoding="utf-8")
    assert "inspect ping --destination" in checks
    assert "inspect active_queues" in checks
    assert "Celery worker ping or queue inspection failed after restart" in checks
    assert "workers-processing" in checks
    assert 'expectedQueues' in release
    assert 'active_queues --destination' in release
    assert 'Sort-Object -Unique' in release
    failure_checks = (ROOT / "ops" / "staging_failure_checks.ps1").read_text(encoding="utf-8")
    assert 'active_queues --destination' in failure_checks
    assert 'workerHost' in failure_checks


def test_capacity_probe_allows_rate_limiting_but_fails_server_errors():
    staging = (ROOT / "ops" / "staging.ps1").read_text(encoding="utf-8")
    probe = (ROOT / "ops" / "staging_capacity_probe.py").read_text(encoding="utf-8")
    assert "'capacity-probe'" in staging
    assert "--max-rejection-rate 99" in staging
    assert 'statuses.get("429", 0)' in probe
    assert "server_errors" in probe
    assert "transport_errors" in probe
    assert "pool_checked_out_peak" in probe
    assert "--max-pool-peak" in probe
    assert "pool_budget_passed" in probe
    assert "--pool-sample-seconds" in probe
    assert "--prometheus-url http://prometheus:9090" in staging


def test_retry_replay_probe_is_operator_exposed_and_sanitized():
    staging = (ROOT / "ops" / "staging.ps1").read_text(encoding="utf-8")
    probe = ROOT / "ops" / "staging_retry_replay_probe.py"
    assert probe.exists()
    source = probe.read_text(encoding="utf-8")
    assert "retry_exhaustion_and_replay_idempotency" in source
    assert "synthetic_upload_removed" in source
    assert "execution_state" in source
    assert "idempotent" in source
    assert "duplicate_delivery" in source
    assert "messages_submitted" in source
    assert "retry-replay-probe" in staging
    assert "--timeout-seconds" not in staging or "staging_retry_replay_probe.py" in staging


def test_import_progress_recovery_probe_is_operator_exposed():
    staging = (ROOT / "ops" / "staging.ps1").read_text(encoding="utf-8")
    wrapper = ROOT / "ops" / "staging_import_progress_recovery.ps1"
    probe = ROOT / "ops" / "staging_import_progress_probe.py"
    assert wrapper.exists()
    assert probe.exists()
    assert "'import-progress-recovery'" in staging
    assert "staging_import_progress_probe.py" in wrapper.read_text(encoding="utf-8")
    assert "workers-processing" in wrapper.read_text(encoding="utf-8")
    assert "checkpoint_progress" in probe.read_text(encoding="utf-8")
    assert "_cleanup(job_id)" in probe.read_text(encoding="utf-8")


def test_queue_isolation_probe_artifact_and_split_worker_contract_exist():
    staging = (ROOT / "ops" / "staging.ps1").read_text(encoding="utf-8")
    probe = ROOT / "ops" / "staging_queue_isolation_probe.py"
    task = ROOT / "services" / "backend" / "app" / "tasks" / "queue_probe.py"
    compose = (ROOT / "docker-compose.staging.yml").read_text(encoding="utf-8")
    assert probe.exists()
    assert task.exists()
    assert "'queue-isolation'" in staging
    assert "critical_queue_probe" in task.read_text(encoding="utf-8")
    assert "processing_queue_probe" in task.read_text(encoding="utf-8")
    assert "workers-processing:" in compose


def test_projection_probe_dispatches_and_verifies_all_summary_families():
    probe = (ROOT / "ops" / "staging_projection_probe.py").read_text(encoding="utf-8")
    for task_name in (
        "refresh_event_registration_summary",
        "refresh_event_attendance_summary",
        "refresh_event_payment_summary",
        "refresh_event_speaker_summary",
    ):
        assert task_name in probe
    assert '"all_ready"' in probe
    assert "freshness_at IS NOT NULL" in probe


def test_projection_probe_has_opt_in_failed_state_recovery():
    probe = (ROOT / "ops" / "staging_projection_probe.py").read_text(encoding="utf-8")
    assert '"--recovery-probe"' in probe
    assert "controlled recovery probe" in probe
    assert "freshness_recovered" in probe
    assert "all_freshness_recovered" in probe
    assert "recovery_probe" in probe


def test_redis_topology_probe_checks_role_separation_and_lock_round_trip():
    probe = (ROOT / "ops" / "staging_redis_topology_probe.py").read_text(encoding="utf-8")
    for role in ("CELERY_BROKER_URL", "CELERY_RESULT_BACKEND", "REDIS_CACHE_URL", "REDIS_LOCK_URL"):
        assert role in probe
    assert "distinct_databases" in probe
    assert "cross_role_isolation" in probe
    assert "acquire_lock_status" in probe
    assert "release_lock" in probe
    assert "close_redis" in probe
    assert "concurrent_cold_miss" in probe
    assert "loader_calls == 1" in probe
    assert "lock_contention" in probe
    assert "oversized_value_rejected" in probe
    assert "outage_fail_open" in probe
    assert "sustained_capacity" in probe


def test_redis_topology_is_operator_and_release_gate_integrated():
    staging = (ROOT / "ops" / "staging.ps1").read_text(encoding="utf-8")
    release = (ROOT / "ops" / "staging_release_check.ps1").read_text(encoding="utf-8")
    assert "'redis-topology'" in staging
    assert "staging_redis_topology_probe.py" in staging
    assert "Check 'Redis role topology'" in release


def test_worker_crash_probe_is_queue_isolated_and_release_gate_integrated():
    staging = (ROOT / "ops" / "staging.ps1").read_text(encoding="utf-8")
    release = (ROOT / "ops" / "staging_release_check.ps1").read_text(encoding="utf-8")
    probe = (ROOT / "ops" / "staging_worker_crash_probe.py").read_text(encoding="utf-8")
    script = (ROOT / "ops" / "staging_worker_crash_probe.ps1").read_text(encoding="utf-8")
    assert "'worker-crash'" in staging
    assert "Check 'worker crash recovery'" in release
    assert 'queue="files"' in probe
    assert "crash_recovery_probe" in (ROOT / "services" / "backend" / "app" / "tasks" / "queue_probe.py").read_text(encoding="utf-8")
    assert "kill -9" in script
    assert "inspect active --timeout=1" in script
    assert "task_recovered" in script


def test_task_family_matrix_is_operator_and_release_gate_integrated():
    matrix = ROOT / "ops" / "staging_task_family_matrix.py"
    release = (ROOT / "ops" / "staging_release_check.ps1").read_text(encoding="utf-8")
    assert matrix.exists()
    source = matrix.read_text(encoding="utf-8")
    for family in ("uploads", "imports", "analytics-projections", "notifications", "email-campaigns", "reconciliation-and-venue-ops"):
        assert family in source
    assert "task-family-matrix" in release
    assert "Check 'task family matrix'" in release
    assert "mixed_scope_workers" in source
    assert "isolation_passed" in source


def test_task_failure_matrix_is_operator_exposed():
    staging = (ROOT / "ops" / "staging.ps1").read_text(encoding="utf-8")
    probe = ROOT / "ops" / "staging_task_failure_matrix.py"
    assert probe.exists()
    assert "'task-failure-matrix'" in staging
    assert "durable task-failure recorder" in probe.read_text(encoding="utf-8")


def test_release_gate_starts_monitoring_and_waits_for_workers():
    release = (ROOT / "ops" / "staging_release_check.ps1").read_text(encoding="utf-8")
    assert "Check 'monitoring services started'" in release
    assert "up -d prometheus alertmanager" in release
    assert "Check 'worker services started'" in release
    assert "up -d workers workers-processing" in release
    assert "Check 'worker readiness'" in release
    assert "Celery worker readiness timed out" in release
    assert "inspect ping" in release
    assert "Check 'service health'" in release


def test_payment_event_plan_compare_is_disposable_and_operator_exposed():
    script = (ROOT / "ops" / "staging_payment_event_plan_compare.py").read_text(encoding="utf-8")
    staging = (ROOT / "ops" / "staging.ps1").read_text(encoding="utf-8")
    assert "DROP INDEX IF EXISTS" in script
    assert "_create_indexes(cur)" in script
    assert "metadata_data->>'marker'" in script
    assert "cleanup_rows" in script
    assert "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)" in script
    assert "'db-plan-compare'" in staging


def test_badge_plan_compare_is_disposable_and_operator_exposed():
    script = (ROOT / "ops" / "staging_badge_plan_compare.py").read_text(encoding="utf-8")
    staging = (ROOT / "ops" / "staging.ps1").read_text(encoding="utf-8")
    assert "DROP INDEX IF EXISTS" in script
    assert "original_indexes" in script
    assert "restored" in script
    assert "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)" in script
    assert "'db-badge-plan-compare'" in staging
