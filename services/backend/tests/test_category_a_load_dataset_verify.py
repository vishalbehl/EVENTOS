import pytest

from ops.category_a_load_dataset_verify import escape_like_prefix, evaluate_snapshot


def valid_snapshot():
    return {
        "tenants": 1000,
        "memberships": 100000,
        "accepted_memberships": 100000,
        "events": 100000,
        "largest_tenant_memberships": 10000,
        "median_tenant_memberships": 90,
        "largest_tenant_events": 10000,
        "median_tenant_events": 90,
        "workspace_ownership_conflicts": 0,
        "workspace_bindings": 100000,
        "workspace_binding_conflicts": 0,
    }


def test_valid_enterprise_cohort_passes():
    assert evaluate_snapshot(valid_snapshot()) == []


def test_small_rehearsal_uses_explicit_minimums_without_weakening_release_defaults():
    snapshot = valid_snapshot()
    snapshot.update(tenants=10, memberships=1000, accepted_memberships=1000, events=1000,
                    workspace_bindings=1000,
                    largest_tenant_memberships=100, median_tenant_memberships=9,
                    largest_tenant_events=100, median_tenant_events=9)
    assert evaluate_snapshot(snapshot, minimums={"tenants": 10, "memberships": 1000, "events": 1000}) == []
    assert any("1000 tenants" in item for item in evaluate_snapshot(snapshot))


@pytest.mark.parametrize(("field", "value", "message"), [
    ("tenants", 999, "1000 tenants"),
    ("memberships", 99999, "100000 memberships"),
    ("events", 99999, "100000 events"),
    ("accepted_memberships", 99999, "active and accepted"),
    ("workspace_ownership_conflicts", 1, "ownership conflicts"),
    ("workspace_bindings", 99999, "explicit workspace binding"),
    ("workspace_binding_conflicts", 1, "workspace bindings remain"),
    ("largest_tenant_events", 899, "10 percent and 10x the median cohort events"),
    ("largest_tenant_memberships", 899, "10 percent and 10x the median cohort memberships"),
])
def test_invalid_cohort_is_rejected(field, value, message):
    snapshot = valid_snapshot()
    snapshot[field] = value
    assert any(message in failure for failure in evaluate_snapshot(snapshot))


def test_slug_prefix_is_escaped_for_like_query():
    assert escape_like_prefix(r"category_a%load\\x") == r"category\_a\%load\\\\x%"
