"""Measure critical task latency while the heavy processing queue is busy."""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from app.worker import celery_app


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--heavy-tasks", type=int, default=3)
    parser.add_argument("--heavy-delay-seconds", type=float, default=2.0)
    parser.add_argument("--critical-budget-ms", type=float, default=1000.0)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not 1 <= args.heavy_tasks <= 20:
        raise SystemExit("--heavy-tasks must be between 1 and 20")
    if not 0 <= args.heavy_delay_seconds <= 10:
        raise SystemExit("--heavy-delay-seconds must be between 0 and 10")

    heavy_results = [
        celery_app.send_task(
            "app.tasks.queue_probe.processing_queue_probe",
            args=[args.heavy_delay_seconds],
            queue="files",
        )
        for _ in range(args.heavy_tasks)
    ]
    time.sleep(0.25)

    started = time.perf_counter()
    critical_result = celery_app.send_task(
        "app.tasks.queue_probe.critical_queue_probe",
        args=[0.0],
        queue="critical",
    )
    critical_payload = critical_result.get(timeout=15)
    critical_elapsed_ms = round((time.perf_counter() - started) * 1000, 2)

    heavy_payloads = [result.get(timeout=30) for result in heavy_results]
    report = {
        "heavy_tasks": args.heavy_tasks,
        "heavy_delay_seconds": args.heavy_delay_seconds,
        "critical_queue": critical_payload.get("queue"),
        "processing_queues": sorted({payload.get("queue") for payload in heavy_payloads}),
        "critical_elapsed_ms": critical_elapsed_ms,
        "critical_budget_ms": args.critical_budget_ms,
        "critical_budget_passed": critical_elapsed_ms <= args.critical_budget_ms,
        "heavy_completed": len(heavy_payloads),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if report["critical_budget_passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
