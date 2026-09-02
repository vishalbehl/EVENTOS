"""Small dependency-light HTTP load probe for staging environments.

This intentionally does not create data or print response bodies. It is a
latency/error probe, not a replacement for a production load platform.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import statistics
import sys
import time
from pathlib import Path

import httpx


async def probe(url: str, *, requests: int, concurrency: int, headers: dict[str, str]) -> dict:
    semaphore = asyncio.Semaphore(concurrency)
    durations: list[float] = []
    statuses: dict[str, int] = {}

    async with httpx.AsyncClient(timeout=30.0, headers=headers) as client:
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

        await asyncio.gather(*(one() for _ in range(requests)))

    ordered = sorted(durations)
    p95_index = min(len(ordered) - 1, max(0, int(len(ordered) * 0.95) - 1))
    return {
        "url": url,
        "requests": requests,
        "concurrency": concurrency,
        "statuses": statuses,
        "min_ms": round(min(durations), 2),
        "mean_ms": round(statistics.mean(durations), 2),
        "p95_ms": round(ordered[p95_index], 2),
        "max_ms": round(max(durations), 2),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("url")
    parser.add_argument("--requests", type=int, default=50)
    parser.add_argument("--concurrency", type=int, default=10)
    parser.add_argument("--token", default=None, help="Staging token; never printed")
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument("--max-p95-ms", type=float, default=None)
    parser.add_argument("--max-error-rate", type=float, default=None,
                        help="Maximum allowed non-2xx/transport error percentage")
    args = parser.parse_args()
    if not 1 <= args.requests <= 10000 or not 1 <= args.concurrency <= 500:
        parser.error("requests must be 1..10000 and concurrency must be 1..500")
    headers = {"Authorization": f"Bearer {args.token}"} if args.token else {}
    result = asyncio.run(probe(args.url, requests=args.requests, concurrency=args.concurrency, headers=headers))
    rendered = json.dumps(result, indent=2)
    print(rendered)
    if args.output:
        args.output.write_text(rendered + "\n", encoding="utf-8")
    failures = []
    if args.max_p95_ms is not None and result["p95_ms"] > args.max_p95_ms:
        failures.append(f"p95 {result['p95_ms']}ms exceeds {args.max_p95_ms}ms")
    if args.max_error_rate is not None:
        successful = sum(count for code, count in result["statuses"].items() if code.isdigit() and 200 <= int(code) < 400)
        error_rate = (1 - successful / max(1, args.requests)) * 100
        if error_rate > args.max_error_rate:
            failures.append(f"error rate {error_rate:.2f}% exceeds {args.max_error_rate:.2f}%")
    if failures:
        print("load budget failed: " + "; ".join(failures), file=sys.stderr)
        raise SystemExit(2)


if __name__ == "__main__":
    main()
