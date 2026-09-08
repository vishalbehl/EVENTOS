"""Verify the local staging task-family and queue topology matrix.

This probe is intentionally read-only.  It asks Celery for registered tasks and
active queues, then emits a sanitized matrix that can be attached to release
evidence without task arguments, tenant data, or broker payloads.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from app.worker import celery_app


FAMILIES: tuple[dict[str, object], ...] = (
    {
        "family": "uploads",
        "queue": "files",
        "required_tasks": (
            "app.tasks.process_durable_upload",
            "app.tasks.process_import_upload",
            "app.tasks.scan_asset_for_viruses",
        ),
        "replay_allowlisted": True,
    },
    {
        "family": "imports",
        "queue": "imports",
        "required_tasks": ("app.tasks.run_excel_import",),
        "replay_allowlisted": True,
    },
    {
        "family": "analytics-projections",
        "queue": "reports",
        "required_tasks": (
            "app.tasks.analytics_projection_tasks.refresh_event_registration_summary",
            "app.tasks.attendance_projection_tasks.refresh_event_attendance_summary",
            "app.tasks.payment_projection_tasks.refresh_event_payment_summary",
            "app.tasks.speaker_projection_tasks.refresh_event_speaker_summary",
        ),
        "replay_allowlisted": True,
    },
    {
        "family": "notifications",
        "queue": "notifications",
        "required_prefixes": ("app.tasks.workflow_jobs.",),
        "replay_allowlisted": True,
    },
    {
        "family": "email-campaigns",
        "queue": "notifications",
        "required_tasks": ("app.tasks.process_email_campaign",),
        "replay_allowlisted": True,
    },
    {
        "family": "reconciliation-and-venue-ops",
        "queue": "reconciliation",
        "required_prefixes": (
            "app.tasks.operations.",
            "app.tasks.venue_ops_events.",
            "app.tasks.organization_console_tasks.",
        ),
        "replay_allowlisted": False,
    },
    {
        "family": "legacy-processing",
        "queue": "legacy-files",
        "required_prefixes": ("workers.tasks.file_tasks.",),
        "replay_allowlisted": False,
    },
    {
        "family": "legacy-imports",
        "queue": "legacy-imports",
        "required_prefixes": ("workers.tasks.import_tasks.",),
        "replay_allowlisted": False,
    },
    {
        "family": "legacy-reports",
        "queue": "legacy-reports",
        "required_prefixes": ("workers.tasks.report_tasks.",),
        "replay_allowlisted": False,
    },
    {
        "family": "legacy-search-and-video",
        "queue": "legacy-search",
        "required_prefixes": ("workers.tasks.search_tasks.",),
        "replay_allowlisted": False,
    },
    {
        "family": "legacy-video",
        "queue": "legacy-videos",
        "required_prefixes": ("workers.tasks.video_tasks.",),
        "replay_allowlisted": False,
    },
    {
        "family": "legacy-notifications",
        "queue": "legacy-notifications",
        "required_prefixes": ("workers.tasks.notification_tasks.",),
        "replay_allowlisted": False,
    },
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--timeout", type=float, default=5.0)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def _registered(inspect) -> set[str]:
    registered = inspect.registered() or {}
    return {
        task_name
        for task_names in registered.values()
        for task_name in (task_names or [])
        if isinstance(task_name, str)
    }


def _active_queues(inspect) -> dict[str, set[str]]:
    active = inspect.active_queues() or {}
    result: dict[str, set[str]] = {}
    for worker, queues in active.items():
        result[worker] = {
            str(row.get("name"))
            for row in (queues or [])
            if isinstance(row, dict) and row.get("name")
        }
    return result


def _scope(queues: set[str]) -> str:
    has_legacy = any(queue.startswith("legacy-") for queue in queues)
    has_application = any(not queue.startswith("legacy-") for queue in queues)
    if has_legacy and has_application:
        return "mixed"
    if has_legacy:
        return "legacy"
    return "application"


def main() -> int:
    args = parse_args()
    if not 1 <= args.timeout <= 30:
        raise SystemExit("timeout must be between 1 and 30 seconds")

    inspect = celery_app.control.inspect(timeout=args.timeout)
    registered = _registered(inspect)
    queues_by_worker = _active_queues(inspect)
    all_queues = sorted({queue for queues in queues_by_worker.values() for queue in queues})
    worker_scopes = {worker: _scope(queues) for worker, queues in queues_by_worker.items()}
    mixed_workers = sorted(worker for worker, scope in worker_scopes.items() if scope == "mixed")

    rows: list[dict[str, object]] = []
    failures: list[str] = []
    for definition in FAMILIES:
        required = set(definition.get("required_tasks", ()))
        prefixes = tuple(definition.get("required_prefixes", ()))
        matched = sorted(
            task for task in registered if task in required or any(task.startswith(prefix) for prefix in prefixes)
        )
        missing = sorted(required - registered)
        prefix_missing = [prefix for prefix in prefixes if not any(task.startswith(prefix) for task in registered)]
        queue = str(definition["queue"])
        queue_workers = sorted(worker for worker, queues in queues_by_worker.items() if queue in queues)
        row = {
            "family": definition["family"],
            "queue": queue,
            "registered_task_count": len(matched),
            "missing_required_tasks": missing,
            "missing_required_prefixes": prefix_missing,
            "queue_workers": queue_workers,
            "replay_allowlisted": definition["replay_allowlisted"],
        }
        rows.append(row)
        if missing or prefix_missing or not queue_workers:
            failures.append(str(definition["family"]))

    report = {
        "workers_seen": sorted(queues_by_worker),
        "worker_scopes": worker_scopes,
        "mixed_scope_workers": mixed_workers,
        "queues_seen": all_queues,
        "families": rows,
        "failed_families": failures,
        "isolation_passed": not mixed_workers,
    }
    rendered = json.dumps(report, indent=2, sort_keys=True)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
    return 1 if failures or mixed_workers else 0


if __name__ == "__main__":
    sys.exit(main())
