"""Authenticated attendee dashboard load probe for local staging."""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import statistics
import sys
import time
import uuid
from pathlib import Path

import httpx

from app.modules.registration.routers.portal_auth import _issue_portal_jwt


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("event_id", type=uuid.UUID)
    parser.add_argument("--email", default=os.getenv("STAGING_DASHBOARD_EMAIL", "load-1@local.invalid"))
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--requests", type=int, default=50)
    parser.add_argument("--concurrency", type=int, default=10)
    parser.add_argument(
        "--warmup-requests",
        type=int,
        default=0,
        help="Successful requests made before timing; use this to measure warm-cache behavior.",
    )
    parser.add_argument("--max-p95-ms", type=float, default=1000)
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args()
    if not 1 <= args.requests <= 10000 or not 1 <= args.concurrency <= 500:
        raise SystemExit("requests must be 1..10000 and concurrency must be 1..500")
    if not 0 <= args.warmup_requests <= 100:
        raise SystemExit("warmup-requests must be 0..100")

    token = _issue_portal_jwt(args.email, args.event_id)
    url = f"{args.base_url.rstrip('/')}/api/v1/portal/dashboard"
    semaphore = asyncio.Semaphore(args.concurrency)
    durations: list[float] = []
    statuses: dict[str, int] = {}

    async with httpx.AsyncClient(timeout=30, headers={"Authorization": f"Bearer {token}"}) as client:
        for _ in range(args.warmup_requests):
            warmup_response = await client.get(url)
            if not 200 <= warmup_response.status_code < 300:
                raise SystemExit(f"dashboard warm-up failed with status {warmup_response.status_code}")

        async def one() -> None:
            async with semaphore:
                started = time.perf_counter()
                try:
                    response = await client.get(url)
                    status = str(response.status_code)
                except Exception as exc:
                    status = type(exc).__name__
                durations.append((time.perf_counter() - started) * 1000)
                statuses[status] = statuses.get(status, 0) + 1

        await asyncio.gather(*(one() for _ in range(args.requests)))

    ordered = sorted(durations)
    def percentile(fraction: float) -> float:
        # Nearest-rank percentile, deterministic for small staging samples.
        index = min(len(ordered) - 1, max(0, int(len(ordered) * fraction) - 1))
        return round(ordered[index], 2)

    p50 = percentile(0.50)
    p95 = percentile(0.95)
    p99 = percentile(0.99)
    result = {
        "url": url,
        "authenticated": True,
        "requests": args.requests,
        "concurrency": args.concurrency,
        "warmup_requests": args.warmup_requests,
        "statuses": statuses,
        "min_ms": round(min(durations), 2),
        "mean_ms": round(statistics.mean(durations), 2),
        "p50_ms": p50,
        "p95_ms": round(p95, 2),
        "p99_ms": p99,
        "max_ms": round(max(durations), 2),
        "error_count": args.requests - sum(
            count for code, count in statuses.items()
            if code.isdigit() and 200 <= int(code) < 300
        ),
    }
    rendered = json.dumps(result, indent=2)
    print(rendered)
    if args.output:
        args.output.write_text(rendered + "\n", encoding="utf-8")
    success = sum(n for code, n in statuses.items() if code.isdigit() and 200 <= int(code) < 300)
    if success != args.requests or p95 > args.max_p95_ms:
        print("dashboard load budget failed", file=sys.stderr)
        raise SystemExit(2)


if __name__ == "__main__":
    asyncio.run(main())
