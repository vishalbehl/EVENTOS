"""Bounded capacity probe that distinguishes protection from server failure."""
from __future__ import annotations

import argparse
import asyncio
import json
import statistics
import sys
import time
from pathlib import Path
from urllib.parse import quote, urlsplit, urlunsplit

import httpx


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("url")
    parser.add_argument("--requests", type=int, default=200)
    parser.add_argument("--concurrency", type=int, default=50)
    parser.add_argument("--max-rejection-rate", type=float, default=99.0)
    parser.add_argument("--max-p95-ms", type=float, default=5000.0)
    parser.add_argument(
        "--max-pool-peak",
        type=float,
        default=None,
        help="Fail when the observed async DB pool peak exceeds this limit.",
    )
    parser.add_argument("--token", default=None)
    parser.add_argument("--prometheus-url", default=None)
    parser.add_argument(
        "--metrics-url",
        default=None,
        help="backend Prometheus text endpoint; defaults to the request URL origin plus /metrics",
    )
    parser.add_argument(
        "--pool-sample-seconds",
        type=float,
        default=35.0,
        help="maximum Prometheus pool-sampling window after the request burst",
    )
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args()
    if not 1 <= args.requests <= 10000 or not 1 <= args.concurrency <= 500:
        raise SystemExit("requests must be 1..10000 and concurrency must be 1..500")

    semaphore = asyncio.Semaphore(args.concurrency)
    durations: list[float] = []
    statuses: dict[str, int] = {}
    pool_samples: list[float] = []
    headers = {"Authorization": f"Bearer {args.token}"} if args.token else {}

    async with httpx.AsyncClient(timeout=30, headers=headers) as client:
        async def sample_pool() -> None:
            # The current gauge is normally back to zero by the time a burst
            # finishes. The process-lifetime peak preserves the useful signal.
            metrics_url = args.metrics_url
            if not args.prometheus_url and not metrics_url:
                parsed = urlsplit(args.url)
                metrics_url = urlunsplit((parsed.scheme, parsed.netloc, "/metrics", "", ""))
            deadline = time.perf_counter() + max(0.25, args.pool_sample_seconds)
            while time.perf_counter() < deadline:
                try:
                    if args.prometheus_url:
                        query = quote("confplatform_db_pool_peak_checked_out{engine=\"async\"}")
                        response = await client.get(
                            f"{args.prometheus_url.rstrip('/')}/api/v1/query?query={query}"
                        )
                        payload = response.json()
                        values = payload.get("data", {}).get("result", [])
                        if values:
                            pool_samples.append(float(values[0]["value"][1]))
                    else:
                        response = await client.get(metrics_url)
                        for line in response.text.splitlines():
                            if line.startswith("confplatform_db_pool_peak_checked_out{") and "engine=\"async\"" in line:
                                pool_samples.append(float(line.rsplit(" ", 1)[1]))
                                break
                except Exception:
                    pass
                await asyncio.sleep(0.25)

        async def one() -> None:
            async with semaphore:
                started = time.perf_counter()
                try:
                    response = await client.get(args.url)
                    status = str(response.status_code)
                except Exception as exc:  # probe reports transport failures, it does not hide them
                    status = type(exc).__name__
                durations.append((time.perf_counter() - started) * 1000)
                statuses[status] = statuses.get(status, 0) + 1

        sampler = asyncio.create_task(sample_pool())
        await asyncio.gather(*(one() for _ in range(args.requests)))
        await sampler

    ordered = sorted(durations)
    p95 = ordered[min(len(ordered) - 1, max(0, int(len(ordered) * 0.95) - 1))]
    successful = sum(count for code, count in statuses.items() if code.isdigit() and 200 <= int(code) < 300)
    rejected = statuses.get("429", 0)
    server_errors = sum(count for code, count in statuses.items() if code.isdigit() and int(code) >= 500)
    transport_errors = sum(count for code, count in statuses.items() if not code.isdigit())
    rejection_rate = rejected * 100 / args.requests
    result = {
        "url": args.url,
        "requests": args.requests,
        "concurrency": args.concurrency,
        "statuses": statuses,
        "successful_2xx": successful,
        "rejected_429": rejected,
        "server_errors": server_errors,
        "transport_errors": transport_errors,
        "rejection_rate_percent": round(rejection_rate, 2),
        "p95_ms": round(p95, 2),
        "max_ms": round(max(durations), 2),
        "pool_checked_out_peak": max(pool_samples) if pool_samples else None,
        "pool_samples": len(pool_samples),
        "pool_budget_passed": (
            args.max_pool_peak is None
            or (
                bool(pool_samples)
                and max(pool_samples) <= args.max_pool_peak
            )
        ),
    }
    rendered = json.dumps(result, indent=2)
    print(rendered)
    if args.output:
        args.output.write_text(rendered + "\n", encoding="utf-8")
    if (
        server_errors
        or transport_errors
        or rejection_rate > args.max_rejection_rate
        or p95 > args.max_p95_ms
        or not result["pool_budget_passed"]
    ):
        print("capacity probe budget failed", file=sys.stderr)
        raise SystemExit(2)


if __name__ == "__main__":
    asyncio.run(main())
