import json
from pathlib import Path

import httpx
import pytest

from ops.category_a_load_acceptance import (
    Operation,
    load_scenario,
    load_tokens,
    operation_schedule,
    performance_gate_failures,
    release_eligible,
    required_ordinary_token_count,
    run_profile,
)


def manifest(**overrides):
    value = {
        "base_url": "https://category-a-staging.example.test",
        "environment": "staging",
        "build_identity": "sha256:candidate",
        "migration_revision": "20261022_3670",
        "api_replicas": 2,
        "dataset": {
            "tenants": 1000,
            "memberships": 100000,
            "events": 100000,
            "skewed_tenant_distribution": True,
            "cohort_evidence": "cohort-20261028.json",
        },
        "operations": [
            {"name": "read", "kind": "read", "method": "GET", "path": "/api/v1/access/bootstrap"},
            {"name": "write", "kind": "write", "method": "PATCH", "path": "/api/v1/events/e/settings",
             "headers": {"If-Match": "7"}, "json": {"reason": "load-{request_id}"}},
            {"name": "admin", "kind": "access_admin", "method": "POST", 
             "path": "/api/v1/organizations/o/members", "json": {"request": "{sequence}"}},
        ],
    }
    value.update(overrides)
    return value


def write_manifest(tmp_path: Path, value: dict) -> Path:
    path = tmp_path / "scenario.json"
    path.write_text(json.dumps(value), encoding="utf-8")
    return path


def test_manifest_requires_enterprise_dataset_and_two_replicas(tmp_path):
    value = manifest(api_replicas=1)
    value["dataset"]["memberships"] = 99999
    with pytest.raises(ValueError, match="memberships"):
        load_scenario(write_manifest(tmp_path, value))
    value["dataset"]["memberships"] = 100000
    with pytest.raises(ValueError, match="api_replicas"):
        load_scenario(write_manifest(tmp_path, value))


@pytest.mark.parametrize("secret", [
    {"headers": {"Authorization": "Bearer exposed"}},
    {"json": {"password": "exposed"}},
])
def test_manifest_rejects_embedded_secrets(tmp_path, secret):
    value = manifest()
    value["operations"][0].update(secret)
    with pytest.raises(ValueError, match="must not contain"):
        load_scenario(write_manifest(tmp_path, value))


def test_manifest_refuses_production_and_unsafe_staging_urls(tmp_path):
    with pytest.raises(ValueError, match="production is forbidden"):
        load_scenario(write_manifest(tmp_path, manifest(environment="production")))
    with pytest.raises(ValueError, match="non-local HTTPS"):
        load_scenario(write_manifest(tmp_path, manifest(base_url="http://localhost:8000")))


def test_local_rehearsal_requires_explicit_allow_local(tmp_path):
    path = write_manifest(tmp_path, manifest(environment="local-isolated", base_url="http://127.0.0.1:8000"))
    with pytest.raises(ValueError, match="--allow-local"):
        load_scenario(path)
    assert load_scenario(path, allow_local=True).environment == "local-isolated"


def test_schedule_has_exact_required_mix_per_hundred_requests():
    operations = tuple(Operation(name=kind, kind=kind, method="GET" if kind == "read" else "POST",
                                 path="/x", expected_statuses=frozenset({200}), headers={}, json_body=None)
                       for kind in ("read", "write", "access_admin"))
    schedule = operation_schedule(operations, 200, seed=42)
    assert [item.kind for item in schedule].count("read") == 160
    assert [item.kind for item in schedule].count("write") == 30
    assert [item.kind for item in schedule].count("access_admin") == 10


def test_only_exact_non_rehearsal_staging_profile_is_release_eligible(tmp_path):
    scenario = load_scenario(write_manifest(tmp_path, manifest()))
    assert release_eligible(scenario=scenario, sustained_rps=200, sustained_seconds=1800,
                            burst_rps=400, burst_seconds=60, rehearsal=False)
    assert not release_eligible(scenario=scenario, sustained_rps=200, sustained_seconds=10,
                                burst_rps=400, burst_seconds=60, rehearsal=False)
    assert not release_eligible(scenario=scenario, sustained_rps=200, sustained_seconds=1800,
                                burst_rps=400, burst_seconds=60, rehearsal=True)


@pytest.mark.asyncio
async def test_profile_executes_required_mix_and_aggregates_without_response_data(tmp_path):
    scenario = load_scenario(write_manifest(tmp_path, manifest()))
    observed = []

    async def respond(request: httpx.Request) -> httpx.Response:
        observed.append((request.method, request.url.path, request.headers))
        return httpx.Response(200, json={"sensitive": "must-not-enter-evidence"})

    result = await run_profile(scenario, tokens=("ephemeral-test-token",), rps=100, seconds=1,
                               max_in_flight=4, seed=42, transport=httpx.MockTransport(respond))

    assert result["scheduled_requests"] == 100
    assert result["statuses"] == {"200": 100}
    assert result["failures"] == {}
    assert result["completed_requests"] == 100
    assert result["admitted_read_requests"] == 80
    assert result["admitted_mutation_requests"] == 20
    assert sum(method == "GET" for method, _, _ in observed) == 80
    assert sum(method == "PATCH" for method, _, _ in observed) == 15
    assert sum(method == "POST" for method, _, _ in observed) == 5
    assert all(headers.get("authorization") == "Bearer ephemeral-test-token" for _, _, headers in observed)
    assert all(headers.get("idempotency-key") for method, _, headers in observed if method != "GET")
    assert "sensitive" not in json.dumps(result)


def test_full_profile_requires_enough_distinct_credentials(monkeypatch):
    assert required_ordinary_token_count(200) == 80
    monkeypatch.delenv("CATEGORY_A_LOAD_TOKEN", raising=False)
    monkeypatch.setenv("CATEGORY_A_LOAD_TOKENS_JSON", json.dumps([f"token-{index}" for index in range(79)]))
    with pytest.raises(ValueError, match="at least 80 distinct"):
        load_tokens(rehearsal=False, sustained_rps=200)
    monkeypatch.setenv("CATEGORY_A_LOAD_TOKENS_JSON", json.dumps([f"token-{index}" for index in range(80)]))
    assert len(load_tokens(rehearsal=False, sustained_rps=200)) == 80


def test_credential_pool_rejects_duplicates_and_single_token_is_rehearsal_only(monkeypatch):
    monkeypatch.setenv("CATEGORY_A_LOAD_TOKENS_JSON", '["same", "same"]')
    with pytest.raises(ValueError, match="duplicate"):
        load_tokens(rehearsal=True, sustained_rps=1)
    monkeypatch.delenv("CATEGORY_A_LOAD_TOKENS_JSON")
    monkeypatch.setenv("CATEGORY_A_LOAD_TOKEN", "one")
    assert load_tokens(rehearsal=True, sustained_rps=1) == ("one",)
    with pytest.raises(ValueError, match="TOKENS_JSON"):
        load_tokens(rehearsal=False, sustained_rps=1)


def test_performance_gate_uses_only_complete_admitted_metrics():
    profile = {"scheduled_requests": 100, "completed_requests": 100, "failures": {},
               "admitted_read_requests": 80, "admitted_mutation_requests": 20,
               "read_p95_ms": 250, "read_p99_ms": 750, "mutation_p95_ms": 400}
    assert performance_gate_failures(profile) == []
    profile["mutation_p95_ms"] = 401
    assert any("mutation_p95_ms" in failure for failure in performance_gate_failures(profile))


@pytest.mark.asyncio
async def test_profile_rotates_credentials_and_excludes_throttles_from_latency(tmp_path):
    scenario = load_scenario(write_manifest(tmp_path, manifest()))
    observed = []

    async def respond(request: httpx.Request) -> httpx.Response:
        observed.append(request.headers["authorization"])
        return httpx.Response(429 if len(observed) == 1 else 200)

    result = await run_profile(scenario, tokens=("one", "two"), rps=100, seconds=1,
                               max_in_flight=4, seed=42, transport=httpx.MockTransport(respond))
    assert set(observed) == {"Bearer one", "Bearer two"}
    assert result["throttled_requests"] == 1
    assert result["completed_requests"] == 100
    assert result["admitted_read_requests"] + result["admitted_mutation_requests"] == 99
