"""Dispatch and verify all event analytics projection refreshes."""
from __future__ import annotations

import argparse
import json
import os
import time
import uuid

import psycopg2

from app.worker import celery_app


TASKS = (
    ("registration", "app.tasks.analytics_projection_tasks.refresh_event_registration_summary"),
    ("attendance", "app.tasks.attendance_projection_tasks.refresh_event_attendance_summary"),
    ("payment", "app.tasks.payment_projection_tasks.refresh_event_payment_summary"),
    ("speaker", "app.tasks.speaker_projection_tasks.refresh_event_speaker_summary"),
)

TABLES = {
    "registration": "analytics.event_registration_summary",
    "attendance": "analytics.event_attendance_summary",
    "payment": "analytics.event_payment_summary",
    "speaker": "analytics.event_speaker_summary",
}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("organization_id", type=uuid.UUID)
    parser.add_argument("event_id", type=uuid.UUID)
    parser.add_argument("--timeout", type=int, default=120)
    parser.add_argument(
        "--recovery-probe",
        action="store_true",
        help="mark this seeded event's summaries failed before refreshing them",
    )
    parser.add_argument("--output", default=None)
    args = parser.parse_args()

    started = time.perf_counter()
    results = {}
    recovery_applied = False
    url = os.environ.get("DATABASE_URL_SYNC", "")
    if not url:
        raise SystemExit("DATABASE_URL_SYNC is required")

    if args.recovery_probe:
        conn = psycopg2.connect(url.replace("postgresql+psycopg2://", "postgresql://", 1))
        try:
            with conn:
                with conn.cursor() as cur:
                    for table in TABLES.values():
                        cur.execute(
                            f"UPDATE {table} SET rebuild_status = 'failed', "
                            "last_error = 'controlled recovery probe', "
                            "freshness_at = TIMESTAMPTZ '1970-01-01 00:00:00+00', "
                            "updated_at = NOW() "
                            "WHERE organization_id = %s AND event_id = %s",
                            (str(args.organization_id), str(args.event_id)),
                        )
                        if cur.rowcount != 1:
                            raise RuntimeError(
                                f"recovery probe expected one row in {table}, got {cur.rowcount}"
                            )
            recovery_applied = True
        finally:
            conn.close()

    for kind, task_name in TASKS:
        result = celery_app.send_task(
            task_name,
            kwargs={
                "organization_id": str(args.organization_id),
                "event_id": str(args.event_id),
            },
            queue="reports",
        )
        result.get(timeout=args.timeout)
        results[kind] = {"task_id": str(result.id), "state": result.status}

    conn = psycopg2.connect(url.replace("postgresql+psycopg2://", "postgresql://", 1))
    try:
        with conn.cursor() as cur:
            for kind, table in TABLES.items():
                cur.execute(
                    f"SELECT rebuild_status, freshness_at IS NOT NULL, "
                    "freshness_at > TIMESTAMPTZ '1970-01-01 00:00:00+00' "
                    f"FROM {table} WHERE organization_id = %s AND event_id = %s",
                    (str(args.organization_id), str(args.event_id)),
                )
                row = cur.fetchone()
                results[kind]["ready"] = bool(row and row[0] == "ready" and row[1])
                results[kind]["freshness_recovered"] = bool(row and row[2])
    finally:
        conn.close()

    report = {
        "organization_id": str(args.organization_id),
        "event_id": str(args.event_id),
        "recovery_probe": recovery_applied,
        "projections": results,
        "all_ready": all(item["ready"] for item in results.values()),
        "all_freshness_recovered": all(
            item["freshness_recovered"] for item in results.values()
        ),
        "duration_ms": round((time.perf_counter() - started) * 1000, 2),
    }
    rendered = json.dumps(report, indent=2)
    print(rendered)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as handle:
            handle.write(rendered + "\n")
    return 0 if report["all_ready"] and report["all_freshness_recovered"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
