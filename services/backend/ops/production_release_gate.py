"""Static production gate for CI; live dependency checks belong to deployment smoke tests."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).parents[1]))
from app.config import Settings
from ops.validate_migration_chain import heads, revisions


def validate(settings: Settings | None = None) -> list[str]:
    cfg = settings or Settings()
    failures: list[str] = []
    migration_heads = heads(revisions())
    if len(migration_heads) != 1:
        failures.append(f"migration graph must have exactly one head: {sorted(migration_heads)}")
    for artifact in ("production_operations_runbook.md", "load_test.py"):
        artifact_path = Path(__file__).with_name(artifact)
        if not artifact_path.is_file() or artifact_path.stat().st_size == 0:
            failures.append(f"required operations artifact is missing: {artifact}")
    runbook = Path(__file__).with_name("production_operations_runbook.md")
    try:
        runbook_text = runbook.read_text(encoding="utf-8").lower()
        for required_term in ("pg_stat_statements", "restore", "rollback", "dead-letter"):
            if required_term not in runbook_text:
                failures.append(f"production runbook is missing required procedure: {required_term}")
    except OSError:
        pass
    if cfg.environment == "production":
        for name in ("DATABASE_URL_SYNC", "DATABASE_URL_ASYNC", "REDIS_URL", "REDIS_CACHE_URL", "REDIS_LOCK_URL", "CELERY_BROKER_URL", "CELERY_RESULT_BACKEND"):
            if not getattr(cfg, name, ""):
                failures.append(f"{name} is required")
        for name in ("REDIS_URL", "CELERY_BROKER_URL", "CELERY_RESULT_BACKEND", "REDIS_CACHE_URL", "REDIS_LOCK_URL"):
            value = getattr(cfg, name, "")
            if value and urlparse(value).scheme != "rediss":
                failures.append(f"{name} must use rediss")
        if cfg.DB_POOL_SIZE < 1 or cfg.DB_MAX_OVERFLOW < 0:
            failures.append("database pool limits are invalid")
        ttl_settings = (
            "CACHE_PUBLIC_FORM_TTL_SECONDS",
            "CACHE_PUBLISHED_WEBSITE_TTL_SECONDS",
            "CACHE_PRICING_TTL_SECONDS",
            "CACHE_ROLES_TTL_SECONDS",
            "CACHE_CAPABILITIES_TTL_SECONDS",
            "CACHE_SEARCH_SUGGESTIONS_TTL_SECONDS",
            "CACHE_DASHBOARD_TTL_SECONDS",
        )
        if any(int(getattr(cfg, name, 0)) <= 0 for name in ttl_settings):
            failures.append("cache TTL settings must all be positive")
        if cfg.REDIS_OPERATION_TIMEOUT_SECONDS <= 0 or cfg.REDIS_LOCK_TTL_SECONDS <= 0:
            failures.append("Redis operation timeout and lock TTL must be positive")
        if cfg.CACHE_MAX_VALUE_BYTES < 1024:
            failures.append("cache maximum value size must be at least 1024 bytes")
        redis_roles = {
            name: urlparse(getattr(cfg, name, ""))
            for name in ("CELERY_BROKER_URL", "CELERY_RESULT_BACKEND", "REDIS_CACHE_URL", "REDIS_LOCK_URL")
        }
        role_databases = [parsed.path for parsed in redis_roles.values() if parsed.scheme]
        if len(role_databases) != len(set(role_databases)):
            failures.append("Celery broker, result backend, cache, and lock Redis databases must be distinct")
        if not cfg.ANTIVIRUS_REQUIRED:
            failures.append("ANTIVIRUS_REQUIRED must be enabled in production")
        elif not cfg.ANTIVIRUS_COMMAND.strip():
            failures.append("ANTIVIRUS_COMMAND is required when ANTIVIRUS_REQUIRED is enabled")
    budget_file = Path(__file__).with_name("performance_budgets.json")
    try:
        budgets = json.loads(budget_file.read_text(encoding="utf-8"))
        for route in ("registration_form", "dashboard"):
            if route not in budgets or budgets[route].get("max_queries", 0) <= 0:
                failures.append(f"missing performance budget: {route}")
    except (OSError, ValueError):
        failures.append("performance budgets are unreadable")
    return failures


if __name__ == "__main__":
    errors = validate()
    if errors:
        raise SystemExit("production gate failed:\n" + "\n".join(f"- {error}" for error in errors))
    print("production static gate passed")
