from __future__ import annotations

import re
from pathlib import Path

from app.modules.billing.capability_registry import FEATURE_DEFINITIONS, OPERATION_FEATURES


REPO_ROOT = Path(__file__).resolve().parents[3]
PORTAL_ROOT = REPO_ROOT / "apps" / "cloud" / "organiser-portal"
CAPABILITY_SOURCE = PORTAL_ROOT / "lib" / "capabilities.tsx"


def _portal_source() -> str:
    return "\n".join(
        path.read_text(encoding="utf-8-sig")
        for path in PORTAL_ROOT.rglob("*.ts*")
        if "node_modules" not in path.parts and ".next" not in path.parts
    )


def test_every_event_page_gate_has_a_code_owned_portal_route_binding():
    source = CAPABILITY_SOURCE.read_text(encoding="utf-8-sig")
    bindings = {
        (route, feature)
        for route, feature in re.findall(
            r'\{\s*route:\s*"([^"]+)",\s*featureKey:\s*"([^"]+)"\s*\}',
            source,
        )
    }
    expected = {
        (route, feature_key)
        for feature_key, definition in FEATURE_DEFINITIONS.items()
        if definition.get("page_gate", True)
        for route in definition.get("portal_routes", [])
        if route.startswith("/events/")
    }
    assert expected <= bindings, sorted(expected - bindings)
    assert all(feature in FEATURE_DEFINITIONS for _, feature in bindings)


def test_portal_action_gates_use_only_canonical_operation_identifiers():
    source = _portal_source()
    used = set(
        re.findall(
            r'(?:useOperationAccess|useOrganizationOperationAccess)\(\s*["\']([^"\']+)["\']\s*\)',
            source,
        )
    )
    used.update(
        re.findall(r'\boperation\s*=\s*["\']([^"\']+)["\']', source)
    )
    assert used <= set(OPERATION_FEATURES), sorted(used - set(OPERATION_FEATURES))


def test_customer_managed_operations_have_a_portal_gate_literal():
    source = _portal_source()
    source_literals = set(re.findall(r'["\']([a-z][a-z0-9_.]+)["\']', source))
    server_or_public_only = {
        "abstracts.submit",
        "branding.custom_domain.manage",
        "branding.custom_login.publish",
        "branding.white_label.publish",
        "registration.submit",
        "support.dedicated_manager",
        "support.sla.apply",
    }
    expected = set(OPERATION_FEATURES) - server_or_public_only
    missing = sorted(expected - source_literals)
    assert not missing, "\n".join(missing)


def test_portal_exports_distinct_locked_quota_and_unavailable_states():
    source = CAPABILITY_SOURCE.read_text(encoding="utf-8-sig")
    for component in ("LockedFeature", "QuotaExceeded", "CapabilityUnavailable"):
        assert re.search(rf"export function {component}\s*\(", source), component
    assert 'reason === "NOT_ENTITLED" || reason === "CONTRACT_REQUIRED"' in source
    assert 'reason === "RESOLUTION_UNAVAILABLE" || access.reason === "PROVIDER_UNAVAILABLE"' in source
    assert "limit.used" in source
    assert "limit.reserved" in source
    assert "limit.allowed" in source
