"""Run a paced, bounded HTTP soak probe without printing response bodies."""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import statistics
import sys
import time
from pathlib import Path

import httpx


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("url")
    parser.add_argument("--duration-seconds", type=float, default=60)
    parser.add_argument("--concurrency", type=int, default=2)
    parser.add_argument("--interval-ms", type=int, default=2000)
    parser.add_argument("--token", default=None, help="Bearer token; never printed")
    parser.add_argument("--max-p95-ms", type=float, default=None)
    parser.add_argument("--max-error-rate", type=float, default=None)
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args()
    if args.duration_seconds <= 0 or args.duration_seconds > 3600:
        parser.error("duration-seconds must be between 1 and 3600")
    if not 1 <= args.concurrency <= 100:
        parser.error("concurrency must be between 1 and 100")
    if args.interval_ms < 0:
        parser.error("interval-ms must not be negative")

    headers = {"Authorization": f"Bearer {args.token}"} if args.token else {}
    durations: list[float] = []
    statuses: dict[str, int] = {}
    started_at = time.time()
    deadline = time.monotonic() + args.duration_seconds
    lock = asyncio.Lock()

    async with httpx.AsyncClient(timeout=30.0, headers=headers) as client:
        async def worker() -> None:
            while time.monotonic() < deadline:
                request_started = time.perf_counter()
                try:
                    response = await client.get(args.url)
                    status = str(response.status_code)
                except Exception as exc:
                    status = type(exc).__name__
                duration = (time.perf_counter() - request_started) * 1000
                async with lock:
                    durations.append(duration)
                    statuses[status] = statuses.get(status, 0) + 1
                remaining = deadline - time.monotonic()
                if remaining > 0 and args.interval_ms:
                    await asyncio.sleep(min(args.interval_ms / 1000, remaining))

        await asyncio.gather(*(worker() for _ in range(args.concurrency)))

    ordered = sorted(durations)
    p95 = ordered[min(len(ordered) - 1, max(0, int(len(ordered) * 0.95) - 1))] if ordered else 0
    successful = sum(
        count for code, count in statuses.items()
        if code.isdigit() and 200 <= int(code) < 400
    )
    error_rate = (1 - successful / max(1, len(durations))) * 100
    result = {
        "url": args.url,
        "duration_seconds": round(time.time() - started_at, 2),
        "concurrency": args.concurrency,
        "interval_ms": args.interval_ms,
        "requests": len(durations),
        "statuses": statuses,
        "error_rate_percent": round(error_rate, 2),
        "min_ms": round(min(durations), 2) if durations else None,
        "mean_ms": round(statistics.mean(durations), 2) if durations else None,
        "p95_ms": round(p95, 2),
        "max_ms": round(max(durations), 2) if durations else None,
    }
    rendered = json.dumps(result, indent=2)
    print(rendered)
    if args.output:
        args.output.write_text(rendered + "\n", encoding="utf-8")

    failures: list[str] = []
    if args.max_p95_ms is not None and p95 > args.max_p95_ms:
        failures.append(f"p95 {p95:.2f}ms exceeds {args.max_p95_ms:.2f}ms")
    if args.max_error_rate is not None and error_rate > args.max_error_rate:
        failures.append(f"error rate {error_rate:.2f}% exceeds {args.max_error_rate:.2f}%")
    if failures:
        print("soak budget failed: " + "; ".join(failures), file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
