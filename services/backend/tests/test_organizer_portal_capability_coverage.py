from __future__ import annotations

import re
import os
from pathlib import Path

from app.modules.billing.capability_registry import (
    FEATURE_DEFINITIONS,
    OPERATION_FEATURES,
    PORTAL_LIMIT_CONTROL_SITES,
)


REPO_ROOT = Path(os.environ.get("CONF_PLATFORM_ROOT", Path(__file__).resolve().parents[3] if len(Path(__file__).resolve().parents) > 3 else "/workspace"))
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


def test_every_event_page_resolves_to_a_fail_closed_page_boundary():
    source = CAPABILITY_SOURCE.read_text(encoding="utf-8-sig")
    bindings = [
        route
        for route, _ in re.findall(
            r'\{\s*route:\s*"([^"]+)",\s*featureKey:\s*"([^"]+)"\s*\}',
            source,
        )
    ]
    event_root = (
        PORTAL_ROOT / "app" / "(dashboard)" / "events" / "[eventId]"
    )
    pages = []
    for page in event_root.rglob("page.tsx"):
        relative = page.parent.relative_to(event_root).as_posix()
        route = "/events/:eventId"
        if relative != ".":
            route = f"{route}/{relative}"
        pages.append(route)
    missing = sorted(
        route
        for route in pages
        if not any(
            route == binding or route.startswith(f"{binding}/")
            for binding in bindings
        )
    )
    assert not missing, "\n".join(missing)


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


def test_customer_managed_operations_are_used_by_action_gate_apis():
    source = _portal_source()
    gated = set(
        re.findall(
            r'(?:useOperationAccess|useOrganizationOperationAccess)\(\s*["\']([^"\']+)["\']\s*\)',
            source,
        )
    )
    gated.update(
        re.findall(r'\boperation\s*=\s*["\']([^"\']+)["\']', source)
    )
    for expression in re.findall(
        r'\boperation\s*=\s*\{(.{1,500}?)\}',
        source,
        flags=re.DOTALL,
    ):
        gated.update(
            operation
            for operation in re.findall(
                r'["\']([a-z][a-z0-9_.]+)["\']',
                expression,
            )
            if operation in OPERATION_FEATURES
        )
    server_or_public_only = {
        "abstracts.submit",
        "branding.custom_domain.manage",
        "branding.custom_login.publish",
        "branding.white_label.publish",
        "registration.submit",
        "support.dedicated_manager",
        "support.sla.apply",
    }
    assert set(OPERATION_FEATURES) - server_or_public_only <= gated, sorted(
        set(OPERATION_FEATURES) - server_or_public_only - gated
    )


def test_every_portal_limit_has_an_action_gate_or_explicit_non_action_mode():
    assert PORTAL_LIMIT_CONTROL_SITES
    for limit_key, control in PORTAL_LIMIT_CONTROL_SITES.items():
        assert control["mode"] in {"ACTION_GATE", "SERVER_ONLY", "READ_ONLY"}
        if control["mode"] != "ACTION_GATE":
            assert control["sites"] == []
            assert control.get("reason")
            continue
        assert control["sites"], limit_key
        for relative_path in control["sites"]:
            path = PORTAL_ROOT / relative_path
            assert path.is_file(), relative_path
            source = path.read_text(encoding="utf-8-sig")
            assert limit_key in source, f"{limit_key} is not used by {relative_path}"
            assert (
                "useLimitAccess" in source
                or "useOrganizationLimitAccess" in source
                or "useRemoteEventLimitAccess" in source
                or "limitKey=" in source
            ), f"{relative_path} does not use a canonical limit gate API"


def test_portal_exports_distinct_locked_quota_and_unavailable_states():
    source = CAPABILITY_SOURCE.read_text(encoding="utf-8-sig")
    for component in ("LockedFeature", "QuotaExceeded", "CapabilityUnavailable"):
        assert re.search(rf"export function {component}\s*\(", source), component
    assert 'reason === "NOT_ENTITLED" || reason === "CONTRACT_REQUIRED"' in source
    assert 'reason === "RESOLUTION_UNAVAILABLE" || access.reason === "PROVIDER_UNAVAILABLE"' in source
    assert "limit.used" in source
    assert "limit.reserved" in source
    assert "limit.allowed" in source
