"""Dispatch or await a disposable late-ack task for crash-recovery checks."""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from app.worker import celery_app


TASK_NAME = "app.tasks.queue_probe.crash_recovery_probe"


def main() -> int:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dispatch", action="store_true")
    mode.add_argument("--wait", metavar="TASK_ID")
    parser.add_argument("--delay-seconds", type=float, default=10.0)
    parser.add_argument("--timeout", type=int, default=90)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    if args.dispatch:
        if not 1 <= args.delay_seconds <= 30:
            raise SystemExit("--delay-seconds must be between 1 and 30")
        result = celery_app.send_task(
            TASK_NAME,
            args=[args.delay_seconds],
            queue="files",
        )
        report = {
            "task_id": str(result.id),
            "task_name": TASK_NAME,
            "queue": "files",
            "delay_seconds": args.delay_seconds,
            "dispatched_at": time.time(),
        }
    else:
        result = celery_app.AsyncResult(args.wait)
        try:
            payload = result.get(timeout=args.timeout, propagate=True)
            report = {
                "task_id": args.wait,
                "state": result.state,
                "recovered": result.state == "SUCCESS",
                "payload": payload,
            }
        except Exception as exc:
            report = {
                "task_id": args.wait,
                "state": result.state,
                "recovered": False,
                "error_type": type(exc).__name__,
            }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if args.dispatch or report.get("recovered") else 2


if __name__ == "__main__":
    raise SystemExit(main())
