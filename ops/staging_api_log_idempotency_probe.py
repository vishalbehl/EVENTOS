"""Verify duplicate API-log delivery produces one durable logical record."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import psycopg2

from app.tasks.audit_tasks import write_api_request_log
from app.worker import celery_app


def _database_url() -> str:
    value = os.environ.get("DATABASE_URL_SYNC", "")
    if not value:
        raise RuntimeError("DATABASE_URL_SYNC is required")
    return value.replace("postgresql+psycopg2://", "postgresql://", 1)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--timeout-seconds", type=float, default=60.0)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    log_id = uuid.uuid4()
    request_id = uuid.uuid4()
    correlation_id = uuid.uuid4()
    task_ids = [str(uuid.uuid4()), str(uuid.uuid4())]
    connection = psycopg2.connect(_database_url())
    connection.autocommit = True
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM platform.organizations ORDER BY created_at, id LIMIT 1")
            row = cursor.fetchone()
            organization_id = row[0] if row else None

        payload = {
            "id": str(log_id),
            "request_id": str(request_id),
            "correlation_id": str(correlation_id),
            "organization_id": str(organization_id) if organization_id else None,
            "method": "GET",
            "path": "/__phase7/api-log-idempotency-probe",
            "status_code": 200,
            "duration_ms": 1.0,
            "db_query_count": 1,
            "db_query_duration_ms": 0.5,
            "cache_hit": True,
            "ip_address": "127.0.0.1",
            "user_id": None,
            "user_agent": "phase7-api-log-idempotency-probe",
            "request_size_bytes": 0,
            "response_size_bytes": 0,
            "rate_limit_remaining": 99,
            "occurred_at": datetime.now(timezone.utc).isoformat(),
        }
        for task_id in task_ids:
            write_api_request_log.apply_async(args=[payload], task_id=task_id, queue="default")

        deadline = time.monotonic() + args.timeout_seconds
        states: dict[str, str] = {}
        while time.monotonic() < deadline:
            states = {task_id: celery_app.AsyncResult(task_id).state for task_id in task_ids}
            if all(state in {"SUCCESS", "FAILURE", "REVOKED"} for state in states.values()):
                break
            time.sleep(0.25)

        with connection.cursor() as cursor:
            cursor.execute(
                """SELECT count(*), min(organization_id::text), bool_and(cache_hit),
                          min(rate_limit_remaining)
                     FROM command_center_audit.api_logs
                    WHERE id = %s""",
                (str(log_id),),
            )
            count, stored_organization_id, cache_hit, rate_limit_remaining = cursor.fetchone()

        report = {
            "operation_id_hash": hashlib.sha256(str(log_id).encode("ascii")).hexdigest()[:16],
            "delivery_states": states,
            "row_count": count,
            "organization_preserved": (
                stored_organization_id == (str(organization_id) if organization_id else None)
            ),
            "cache_hit_preserved": cache_hit is True,
            "rate_limit_remaining_preserved": rate_limit_remaining == 99,
        }
        report["passed"] = bool(
            all(state == "SUCCESS" for state in states.values())
            and count == 1
            and report["organization_preserved"]
            and report["cache_hit_preserved"]
            and report["rate_limit_remaining_preserved"]
        )
        rendered = json.dumps(report, indent=2, sort_keys=True)
        print(rendered)
        if args.output:
            args.output.write_text(rendered + "\n", encoding="utf-8")
        return 0 if report["passed"] else 2
    finally:
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    "DELETE FROM command_center_audit.api_logs WHERE id = %s",
                    (str(log_id),),
                )
        finally:
            connection.close()


if __name__ == "__main__":
    raise SystemExit(main())
