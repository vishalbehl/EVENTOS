"""Evidence validator, not a substitute for executing acceptance tests."""
from __future__ import annotations

from datetime import datetime, timezone
import json
import math
from pathlib import Path

REQUIRED = (
    "phase1_postgres_runtime_role", "phase1_browser", "backfill_reconciliation",
    "catalogue_cohort_reconciliation",
    "phase1_upload_recovery_and_scan_delivery",
    "phase1_catalogue_lifecycle_concurrency",
    "phase1_catalogue_reviewed_repairs",
    "phase1_catalogue_incremental_loading",
    "phase2_permission_matrix", "phase2_revocation_ordering", "phase2_workers_downloads_websockets",
    "endpoint_registry_coverage", "phase3_multi_replica_redis", "phase3_outage_and_proxy",
    "phase3_browser_recovery", "migration_rehearsal_and_rollback", "load_and_resilience",
    "context_aware_rollback_compatibility", "session_migration_path_approval",
    "staging_acceptance", "backup_restore", "production_pilot", "production_5_percent",
    "production_25_percent", "production_100_percent", "production_24h_observation",
)


def validate_evidence(path: str | Path | None, *, expected_revision: str | None = None) -> list[str]:
    if not path:
        return ["Category A evidence is missing; Category A is UNRELEASED"]
    try:
        evidence = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        return ["Category A evidence is unreadable"]
    if not isinstance(evidence, dict):
        return ["Category A evidence must be an object"]
    failures = []
    for field in ("build_identity", "migration_revision", "environment", "dataset", "metrics", "defects", "rollback_outcome"):
        if field not in evidence or evidence[field] is None:
            failures.append(f"Missing evidence field: {field}")
    if evidence.get("environment") != "production":
        failures.append("Final acceptance must identify the authorised production environment")
    if expected_revision and evidence.get("migration_revision") != expected_revision:
        failures.append("Category A evidence does not match the release migration revision")
    checks = evidence.get("checks", {})
    if not isinstance(checks, dict):
        return failures + ["Checks must be an object"]
    for name in REQUIRED:
        check = checks.get(name)
        if not isinstance(check, dict) or check.get("status") != "passed" or not check.get("artifact"):
            failures.append(f"Missing passing evidence: {name}")
    if evidence.get("unresolved_ownership_rows") != 0 or evidence.get("release_blocking_defects") != 0:
        failures.append("Unresolved ownership or release-blocking defects remain")
    if not evidence.get("rollout_authorisation"):
        failures.append("Production rollout authorisation is missing")
    dataset = evidence.get("dataset", {})
    if not isinstance(dataset, dict):
        failures.append("Dataset evidence is invalid")
        dataset = {}
    for name, minimum in (("tenants", 1000), ("memberships", 100000), ("events", 100000)):
        value = dataset.get(name)
        if not isinstance(value, int) or isinstance(value, bool) or value < minimum:
            failures.append(f"Dataset below required {name}: {minimum}")
    if not dataset.get("skewed_tenant_distribution"):
        failures.append("Noisy-tenant dataset distribution is missing")
    metrics = evidence.get("metrics", {})
    if not isinstance(metrics, dict):
        failures.append("Metrics evidence is invalid")
        metrics = {}
    ceilings = {"read_p95_ms": 250, "read_p99_ms": 750, "mutation_p95_ms": 400,
                "access_warm_p95_ms": 20, "access_cold_p95_ms": 75, "limiter_p95_ms": 10,
                "foundation_business_queries": 5, "live_revocation_seconds": 5}
    floors = {"sustained_rps": 200, "sustained_seconds": 1800, "burst_rps": 400, "burst_seconds": 60,
              "api_replicas": 2}
    for name, bound in {**ceilings, **floors}.items():
        value = metrics.get(name)
        if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value) or value < 0:
            failures.append(f"Missing/invalid metric: {name}")
        elif (name in ceilings and value > bound) or (name in floors and value < bound):
            failures.append(f"Performance gate failed: {name}")
    connection_use = metrics.get("database_connection_use_percent")
    if not isinstance(connection_use, (int, float)) or isinstance(connection_use, bool) or not 0 <= connection_use < 80:
        failures.append("Database connection use must remain below 80 percent")
    observation = checks.get("production_24h_observation", {})
    try:
        start = datetime.fromisoformat(observation["started_at"])
        end = datetime.fromisoformat(observation["completed_at"])
        if start.tzinfo is None or end.tzinfo is None or (end - start).total_seconds() < 86400:
            failures.append("Production observation must span at least 24 hours with timezone-aware timestamps")
        elif end > datetime.now(timezone.utc):
            failures.append("Production observation cannot finish in the future")
    except (KeyError, TypeError, ValueError):
        failures.append("Production observation timestamps are missing or invalid")
    return failures
