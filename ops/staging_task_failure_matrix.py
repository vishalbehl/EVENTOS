"""Exercise bounded permanent-failure recording for application task families.

Each case uses malformed identifiers, so no domain row or provider is touched.
The probe verifies Celery reaches a terminal FAILURE state and that the worker's
durable task-failure recorder persists sanitized metadata for the tenant.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import uuid
from pathlib import Path

from app.modules.operations_control.models import TaskFailure
from app.modules.platform.models.organization import Organization
from app.database import SessionLocal
from app.worker import celery_app


CASES: tuple[dict[str, object], ...] = (
    {
        "family": "uploads",
        "task": "app.tasks.process_durable_upload",
        "queue": "files",
        "args": ("not-a-uuid", "organization_id"),
    },
    {
        "family": "imports",
        "task": "app.tasks.process_import_upload",
        "queue": "imports",
        "args": ("not-a-uuid", "organization_id", "not-a-uuid"),
    },
    {
        "family": "analytics-projections",
        "task": "app.tasks.analytics_projection_tasks.refresh_event_registration_summary",
        "queue": "reports",
        "args": ("organization_id", "not-a-uuid"),
    },
    {
        "family": "analytics-projections",
        "task": "app.tasks.attendance_projection_tasks.refresh_event_attendance_summary",
        "queue": "reports",
        "args": ("organization_id", "not-a-uuid"),
    },
    {
        "family": "analytics-projections",
        "task": "app.tasks.payment_projection_tasks.refresh_event_payment_summary",
        "queue": "reports",
        "args": ("organization_id", "not-a-uuid"),
    },
    {
        "family": "analytics-projections",
        "task": "app.tasks.speaker_projection_tasks.refresh_event_speaker_summary",
        "queue": "reports",
        "args": ("organization_id", "not-a-uuid"),
    },
    {
        "family": "notifications",
        "task": "app.tasks.dispatch_communication_batch",
        "queue": "notifications",
        "args": ("not-a-uuid", "organization_id"),
    },
    {
        "family": "email-campaigns",
        "task": "app.tasks.process_email_campaign",
        "queue": "notifications",
        "args": ("not-a-uuid", "organization_id"),
    },
    {
        "family": "workflow-notifications",
        "task": "app.tasks.workflow_jobs.check_expired_approvals",
        "queue": "notifications",
        "args": ("not-a-uuid",),
    },
    {
        "family": "reconciliation-and-venue-ops",
        "task": "app.tasks.operations.calculate_all_readiness_scores",
        "queue": "reconciliation",
        "args": ("not-a-uuid",),
    },
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--timeout-seconds", type=float, default=45.0)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def _organization_id() -> uuid.UUID:
    with SessionLocal() as db:
        organization = (
            db.query(Organization.id)
            .filter(Organization.is_active.is_(True))
            .order_by(Organization.created_at.asc(), Organization.id.asc())
            .first()
        )
    if organization is None:
        raise RuntimeError("No active organization is available for the failure probe")
    return organization[0]


def _failure(task_id: str) -> TaskFailure | None:
    with SessionLocal() as db:
        return db.query(TaskFailure).filter(TaskFailure.task_id == task_id).one_or_none()


def main() -> int:
    args = parse_args()
    if not 5 <= args.timeout_seconds <= 180:
        raise SystemExit("timeout-seconds must be between 5 and 180")
    organization_id = _organization_id()
    results: list[dict[str, object]] = []

    for case in CASES:
        task_id = str(uuid.uuid4())
        values = [str(organization_id) if value == "organization_id" else value for value in case["args"]]
        async_result = celery_app.send_task(
            str(case["task"]),
            args=values,
            queue=str(case["queue"]),
            task_id=task_id,
            headers={"tenant_org_id": str(organization_id)},
        )
        deadline = time.monotonic() + args.timeout_seconds
        failure = None
        while time.monotonic() < deadline:
            failure = _failure(task_id)
            if async_result.ready() and failure is not None:
                break
            time.sleep(0.5)
        row = {
            "family": case["family"],
            "task": case["task"],
            "queue": case["queue"],
            "task_state": async_result.state,
            "durable_failure": failure is not None,
            "failure_status": failure.status if failure else None,
            "exception_type": failure.exception_type if failure else None,
            "tenant_scoped": bool(failure and failure.organization_id == organization_id),
            "replay_payload_present": bool(failure and failure.replay_queue and failure.replay_args),
        }
        results.append(row)

    report = {
        "cases": results,
        "passed": all(
            row["task_state"] == "FAILURE"
            and row["durable_failure"]
            and row["failure_status"] == "FAILED"
            and row["tenant_scoped"]
            and not row["replay_payload_present"]
            for row in results
        ),
    }
    rendered = json.dumps(report, indent=2, sort_keys=True)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
