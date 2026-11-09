"""Guarded Category A HTTP load acceptance runner.

This runner never provisions data and never accepts credentials on the command
line.  An authorised operator must prepare the staging cohort, provide a
non-secret scenario manifest, and expose the bearer token only through
``CATEGORY_A_LOAD_TOKEN``.  Short rehearsals exercise the runner but are
explicitly ineligible for release evidence.
"""
from __future__ import annotations

import argparse
import asyncio
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import random
import time
from typing import Any
from urllib.parse import urljoin, urlparse
import uuid

import httpx


ROOT = Path(__file__).parents[1]
EVIDENCE_ROOT = (ROOT / "test-results").resolve()
RELEASE_CONFIRMATION = "CATEGORY-A-STAGING-LOAD"
REQUIRED_MIX = {"read": 80, "write": 15, "access_admin": 5}
SECRET_FIELDS = {"authorization", "cookie", "set-cookie", "password", "token", "secret"}
LATENCY_CEILINGS_MS = {"read_p95_ms": 250, "read_p99_ms": 750, "mutation_p95_ms": 400}


@dataclass(frozen=True)
class Operation:
    name: str
    kind: str
    method: str
    path: str
    expected_statuses: frozenset[int]
    headers: dict[str, str]
    json_body: Any | None


@dataclass(frozen=True)
class Scenario:
    base_url: str
    environment: str
    build_identity: str
    migration_revision: str
    dataset: dict[str, Any]
    api_replicas: int
    operations: tuple[Operation, ...]


def _require_plain_object(value: Any, name: str) -> dict[str, Any]:
    if not isinstance(value, dict) or any(not isinstance(key, str) for key in value):
        raise ValueError(f"{name} must be a JSON object with string keys")
    return value


def _contains_secret(value: Any, *, parent: str = "") -> bool:
    if isinstance(value, dict):
        return any(key.lower() in SECRET_FIELDS or _contains_secret(item, parent=key)
                   for key, item in value.items())
    if isinstance(value, list):
        return any(_contains_secret(item, parent=parent) for item in value)
    if isinstance(value, str):
        lowered = value.lower()
        return (parent.lower() in SECRET_FIELDS or "bearer " in lowered
                or "-----begin" in lowered or "sk-" in lowered)
    return False


def load_scenario(path: Path, *, allow_local: bool = False) -> Scenario:
    raw = _require_plain_object(json.loads(path.read_text(encoding="utf-8")), "scenario")
    if _contains_secret(raw):
        raise ValueError("scenario must not contain credentials, tokens, cookies, or secrets")

    environment = raw.get("environment")
    if environment not in {"staging", "local-isolated"}:
        raise ValueError("environment must be staging or local-isolated; production is forbidden")
    if environment == "local-isolated" and not allow_local:
        raise ValueError("local-isolated scenarios require --allow-local")

    base_url = raw.get("base_url")
    parsed = urlparse(base_url if isinstance(base_url, str) else "")
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("base_url must be an absolute HTTP(S) URL without embedded credentials")
    if parsed.query or parsed.fragment:
        raise ValueError("base_url must not contain query parameters or a fragment")
    local_host = parsed.hostname.lower() in {"localhost", "127.0.0.1", "::1"}
    if environment == "staging" and (parsed.scheme != "https" or local_host):
        raise ValueError("staging requires a non-local HTTPS base_url")
    if environment == "local-isolated" and not local_host:
        raise ValueError("local-isolated scenarios must target localhost")

    dataset = _require_plain_object(raw.get("dataset"), "dataset")
    for key, minimum in (("tenants", 1000), ("memberships", 100000), ("events", 100000)):
        value = dataset.get(key)
        if not isinstance(value, int) or isinstance(value, bool) or value < minimum:
            raise ValueError(f"dataset.{key} must be at least {minimum}")
    if dataset.get("skewed_tenant_distribution") is not True:
        raise ValueError("dataset must attest a skewed tenant distribution")
    cohort = dataset.get("cohort_evidence")
    if not isinstance(cohort, str) or not cohort.strip():
        raise ValueError("dataset.cohort_evidence must identify the preparation artifact")

    replicas = raw.get("api_replicas")
    if not isinstance(replicas, int) or isinstance(replicas, bool) or replicas < 2:
        raise ValueError("api_replicas must be at least 2")

    operations_raw = raw.get("operations")
    if not isinstance(operations_raw, list) or not operations_raw:
        raise ValueError("operations must be a non-empty array")
    operations: list[Operation] = []
    kinds = Counter()
    names: set[str] = set()
    for index, item in enumerate(operations_raw):
        row = _require_plain_object(item, f"operations[{index}]")
        name = row.get("name")
        kind = row.get("kind")
        method = str(row.get("method", "")).upper()
        request_path = row.get("path")
        if not isinstance(name, str) or not name.strip() or name in names:
            raise ValueError("operation names must be non-empty and unique")
        if kind not in REQUIRED_MIX:
            raise ValueError(f"operation {name} has an unsupported kind")
        if method not in {"GET", "POST", "PUT", "PATCH", "DELETE"}:
            raise ValueError(f"operation {name} has an unsupported method")
        if not isinstance(request_path, str) or not request_path.startswith("/") or request_path.startswith("//"):
            raise ValueError(f"operation {name} path must be an absolute application path")
        if kind == "read" and method != "GET":
            raise ValueError(f"read operation {name} must use GET")
        if kind != "read" and method == "GET":
            raise ValueError(f"mutation operation {name} must not use GET")
        statuses = row.get("expected_statuses", [200])
        if (not isinstance(statuses, list) or not statuses
                or any(not isinstance(code, int) or isinstance(code, bool) or code < 200 or code > 299
                       for code in statuses)):
            raise ValueError(f"operation {name} expected_statuses must contain only 2xx integers")
        headers = _require_plain_object(row.get("headers", {}), f"operation {name} headers")
        if any(not isinstance(value, str) for value in headers.values()):
            raise ValueError(f"operation {name} header values must be strings")
        names.add(name)
        kinds[kind] += 1
        operations.append(Operation(name=name, kind=kind, method=method, path=request_path,
                                    expected_statuses=frozenset(statuses), headers=dict(headers),
                                    json_body=row.get("json")))
    if set(kinds) != set(REQUIRED_MIX):
        raise ValueError("operations must include read, write, and access_admin cases")

    for field in ("build_identity", "migration_revision"):
        if not isinstance(raw.get(field), str) or not raw[field].strip():
            raise ValueError(f"{field} is required")
    return Scenario(base_url=base_url.rstrip("/") + "/", environment=environment,
                    build_identity=raw["build_identity"], migration_revision=raw["migration_revision"],
                    dataset=dataset, api_replicas=replicas, operations=tuple(operations))


def operation_schedule(operations: tuple[Operation, ...], request_count: int, *, seed: int) -> list[Operation]:
    by_kind: dict[str, list[Operation]] = defaultdict(list)
    for operation in operations:
        by_kind[operation.kind].append(operation)
    cycle = [kind for kind, count in REQUIRED_MIX.items() for _ in range(count)]
    random.Random(seed).shuffle(cycle)
    offsets = Counter()
    result = []
    for sequence in range(request_count):
        kind = cycle[sequence % len(cycle)]
        choices = by_kind[kind]
        result.append(choices[offsets[kind] % len(choices)])
        offsets[kind] += 1
    return result


def _render(value: Any, *, request_id: str, sequence: int) -> Any:
    if isinstance(value, str):
        return value.replace("{request_id}", request_id).replace("{sequence}", str(sequence))
    if isinstance(value, list):
        return [_render(item, request_id=request_id, sequence=sequence) for item in value]
    if isinstance(value, dict):
        return {key: _render(item, request_id=request_id, sequence=sequence) for key, item in value.items()}
    return value


def _percentile(values: list[float], percentile: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, math.ceil(len(ordered) * percentile) - 1))
    return round(ordered[index], 3)


def required_ordinary_token_count(rps: int) -> int:
    """Tokens needed to admit the 80/15 ordinary mix at release defaults.

    Reads allow 120/user/minute and ordinary writes 60/user/minute. Sensitive
    access-admin traffic may be intentionally bounded with 429 responses.
    """
    read_tokens = math.ceil((rps * 0.80) / (120 / 60))
    write_tokens = math.ceil((rps * 0.15) / (60 / 60))
    return max(1, read_tokens, write_tokens)


def load_tokens(*, rehearsal: bool, sustained_rps: int) -> tuple[str, ...]:
    encoded = os.environ.get("CATEGORY_A_LOAD_TOKENS_JSON", "").strip()
    if encoded:
        try:
            values = json.loads(encoded)
        except json.JSONDecodeError as exc:
            raise ValueError("CATEGORY_A_LOAD_TOKENS_JSON must be a JSON string array") from exc
        if (not isinstance(values, list) or not values or len(values) > 5000
                or any(not isinstance(value, str) or not value.strip() for value in values)):
            raise ValueError("CATEGORY_A_LOAD_TOKENS_JSON must contain 1..5000 non-empty strings")
        tokens = tuple(dict.fromkeys(value.strip() for value in values))
        if len(tokens) != len(values):
            raise ValueError("CATEGORY_A_LOAD_TOKENS_JSON must not contain duplicate credentials")
    else:
        single = os.environ.get("CATEGORY_A_LOAD_TOKEN", "").strip()
        if not rehearsal:
            raise ValueError("full load requires CATEGORY_A_LOAD_TOKENS_JSON")
        if not single:
            raise ValueError("CATEGORY_A_LOAD_TOKEN or CATEGORY_A_LOAD_TOKENS_JSON is required")
        tokens = (single,)
    required = required_ordinary_token_count(sustained_rps)
    if not rehearsal and len(tokens) < required:
        raise ValueError(f"full load requires at least {required} distinct credentials for ordinary traffic")
    return tokens


def performance_gate_failures(profile: dict[str, Any]) -> list[str]:
    failures = []
    if profile.get("failures"):
        failures.append("unexpected HTTP or transport failures occurred")
    if profile.get("completed_requests") != profile.get("scheduled_requests"):
        failures.append("not every scheduled request reached a terminal result")
    if profile.get("admitted_read_requests", 0) <= 0:
        failures.append("no admitted read requests were measured")
    if profile.get("admitted_mutation_requests", 0) <= 0:
        failures.append("no admitted mutation requests were measured")
    for name, ceiling in LATENCY_CEILINGS_MS.items():
        value = profile.get(name)
        if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value):
            failures.append(f"missing admitted latency metric: {name}")
        elif value > ceiling:
            failures.append(f"{name} {value}ms exceeds {ceiling}ms")
    return failures


async def run_profile(scenario: Scenario, *, tokens: tuple[str, ...], rps: int, seconds: int,
                      max_in_flight: int, seed: int,
                      transport: httpx.AsyncBaseTransport | None = None) -> dict[str, Any]:
    if not tokens:
        raise ValueError("at least one load credential is required")
    total = rps * seconds
    schedule = operation_schedule(scenario.operations, total, seed=seed)
    queue: asyncio.Queue[tuple[int, Operation] | None] = asyncio.Queue(maxsize=max_in_flight * 2)
    latencies: dict[str, list[float]] = defaultdict(list)
    statuses: Counter[str] = Counter()
    admitted: Counter[str] = Counter()
    failures: Counter[str] = Counter()
    transport_failures: Counter[str] = Counter()
    max_schedule_lag_ms = 0.0
    started_at = datetime.now(timezone.utc)
    clock_start = time.perf_counter()

    async with httpx.AsyncClient(base_url=scenario.base_url, timeout=30.0, transport=transport) as client:
        async def execute(sequence: int, operation: Operation) -> None:
            request_id = uuid.uuid4().hex
            headers = _render(operation.headers, request_id=request_id, sequence=sequence)
            headers.setdefault("X-Correlation-ID", request_id)
            headers["Authorization"] = f"Bearer {tokens[sequence % len(tokens)]}"
            if operation.kind != "read":
                headers.setdefault("Idempotency-Key", request_id)
            path = _render(operation.path, request_id=request_id, sequence=sequence)
            body = _render(operation.json_body, request_id=request_id, sequence=sequence)
            request_started = time.perf_counter()
            try:
                kwargs = {"headers": headers}
                if body is not None:
                    kwargs["json"] = body
                response = await client.request(operation.method,
                                                urljoin(scenario.base_url, path.lstrip("/")), **kwargs)
                elapsed = (time.perf_counter() - request_started) * 1000
                statuses[str(response.status_code)] += 1
                if response.status_code in operation.expected_statuses:
                    latencies[operation.kind].append(elapsed)
                    admitted[operation.kind] += 1
                elif response.status_code != 429:
                    failures[f"{operation.name}:{response.status_code}"] += 1
            except Exception as exc:  # recorded without leaking response data
                key = f"{operation.name}:{type(exc).__name__}"
                failures[key] += 1
                transport_failures[key] += 1

        async def worker() -> None:
            while True:
                item = await queue.get()
                try:
                    if item is None:
                        return
                    await execute(*item)
                finally:
                    queue.task_done()

        workers = [asyncio.create_task(worker()) for _ in range(min(max_in_flight, total))]
        for sequence, operation in enumerate(schedule):
            target = clock_start + (sequence / rps)
            await asyncio.sleep(max(0.0, target - time.perf_counter()))
            await queue.put((sequence, operation))
            max_schedule_lag_ms = max(max_schedule_lag_ms, (time.perf_counter() - target) * 1000)
        await queue.join()
        for _ in workers:
            await queue.put(None)
        await asyncio.gather(*workers)

    elapsed_seconds = time.perf_counter() - clock_start
    finished_at = datetime.now(timezone.utc)
    read = latencies["read"]
    mutations = latencies["write"] + latencies["access_admin"]
    completed = sum(statuses.values()) + sum(transport_failures.values())
    return {
        "started_at": started_at.isoformat(), "completed_at": finished_at.isoformat(),
        "configured_rps": rps, "configured_seconds": seconds, "scheduled_requests": total,
        "elapsed_seconds": round(elapsed_seconds, 3),
        "achieved_rps": round(total / max(elapsed_seconds, 0.001), 3),
        "statuses": dict(statuses), "failures": dict(failures),
        "completed_requests": completed,
        "credential_count": len(tokens),
        "max_schedule_lag_ms": round(max_schedule_lag_ms, 3),
        "admitted_read_requests": admitted["read"],
        "admitted_mutation_requests": admitted["write"] + admitted["access_admin"],
        "read_p95_ms": _percentile(read, 0.95), "read_p99_ms": _percentile(read, 0.99),
        "mutation_p95_ms": _percentile(mutations, 0.95),
        "throttled_requests": statuses.get("429", 0),
    }


def release_eligible(*, scenario: Scenario, sustained_rps: int, sustained_seconds: int,
                     burst_rps: int, burst_seconds: int, rehearsal: bool) -> bool:
    return bool(not rehearsal and scenario.environment == "staging" and scenario.api_replicas >= 2
                and sustained_rps >= 200 and sustained_seconds >= 1800
                and burst_rps >= 400 and burst_seconds >= 60)


async def run(args: argparse.Namespace) -> dict[str, Any]:
    scenario = load_scenario(args.scenario, allow_local=args.allow_local)
    if not args.rehearsal and args.confirm != RELEASE_CONFIRMATION:
        raise ValueError(f"full staging execution requires --confirm {RELEASE_CONFIRMATION}")
    tokens = load_tokens(rehearsal=args.rehearsal, sustained_rps=args.sustained_rps)
    eligible = release_eligible(scenario=scenario, sustained_rps=args.sustained_rps,
                                sustained_seconds=args.sustained_seconds, burst_rps=args.burst_rps,
                                burst_seconds=args.burst_seconds, rehearsal=args.rehearsal)
    if not args.rehearsal and not eligible:
        raise ValueError("full run must meet the 200 RPS/30 minute and 400 RPS/60 second gates")
    sustained = await run_profile(scenario, tokens=tokens, rps=args.sustained_rps,
                                  seconds=args.sustained_seconds, max_in_flight=args.max_in_flight,
                                  seed=args.seed)
    burst = await run_profile(scenario, tokens=tokens, rps=args.burst_rps,
                              seconds=args.burst_seconds, max_in_flight=args.max_in_flight,
                              seed=args.seed + 1)
    gate_failures = performance_gate_failures(sustained) if eligible else []
    if eligible and burst["failures"]:
        gate_failures.append("burst profile had unexpected HTTP or transport failures")
    return {
        "schema": "category-a-load-acceptance-v1",
        "category_a_release_eligible": False,
        "profile_configuration_eligible": eligible,
        "performance_profile_passed": bool(eligible and not gate_failures),
        "performance_gate_failures": gate_failures,
        "environment": scenario.environment, "base_host": urlparse(scenario.base_url).hostname,
        "build_identity": scenario.build_identity, "migration_revision": scenario.migration_revision,
        "dataset": scenario.dataset, "api_replicas": scenario.api_replicas,
        "operation_names": [operation.name for operation in scenario.operations],
        "sustained": sustained, "burst": burst,
        "runner_completed_at": datetime.now(timezone.utc).isoformat(),
        "external_metrics_required": ["access_warm_p95_ms", "access_cold_p95_ms", "limiter_p95_ms",
                                      "foundation_business_queries", "live_revocation_seconds",
                                      "database_connection_use_percent"],
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scenario", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--confirm")
    parser.add_argument("--rehearsal", action="store_true")
    parser.add_argument("--allow-local", action="store_true")
    parser.add_argument("--sustained-rps", type=int, default=200)
    parser.add_argument("--sustained-seconds", type=int, default=1800)
    parser.add_argument("--burst-rps", type=int, default=400)
    parser.add_argument("--burst-seconds", type=int, default=60)
    parser.add_argument("--max-in-flight", type=int, default=800)
    parser.add_argument("--seed", type=int, default=271828)
    args = parser.parse_args()
    for name in ("sustained_rps", "sustained_seconds", "burst_rps", "burst_seconds", "max_in_flight"):
        if getattr(args, name) <= 0:
            parser.error(f"--{name.replace('_', '-')} must be positive")
    output = args.output.resolve()
    if output.parent != EVIDENCE_ROOT or output.suffix.lower() != ".json":
        parser.error("--output must be a JSON file directly under services/backend/test-results")
    if output.exists():
        parser.error("--output already exists; evidence files are immutable")
    args.output = output
    return args


def main() -> None:
    args = parse_args()
    try:
        result = asyncio.run(run(args))
        with args.output.open("x", encoding="utf-8") as output:
            json.dump(result, output, indent=2)
            output.write("\n")
        print(json.dumps(result, indent=2))
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        raise SystemExit(f"Category A load acceptance refused: {exc}") from exc
    if (result["sustained"]["failures"] or result["burst"]["failures"]
            or result["performance_gate_failures"]):
        raise SystemExit(2)


if __name__ == "__main__":
    main()
