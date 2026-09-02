from __future__ import annotations

import ast
from pathlib import Path


def test_billing_activation_list_routes_delegate_to_query_service():
    path = Path(__file__).resolve().parents[1] / "app/modules/billing/routers/activations.py"
    source = path.read_text(encoding="utf-8-sig")
    tree = ast.parse(source, filename=str(path))
    expected = {
        "list_organization_activations": "BillingActivationQueryService(db).list_activations",
        "list_grants": "BillingActivationQueryService(db).list_grants",
        "list_grant_consumptions": "BillingActivationQueryService(db).list_consumptions",
    }
    functions = {
        node.name: node
        for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    }
    for name, delegation in expected.items():
        segment = ast.get_source_segment(source, functions[name]) or ""
        assert delegation in segment
        assert "select(EventActivation)" not in segment
        assert "select(EntitlementGrant)" not in segment
        assert "select(GrantConsumption)" not in segment


def test_activation_fallback_and_usage_existence_reads_delegate_to_query_service():
    path = Path(__file__).resolve().parents[1] / "app/modules/billing/routers/activations.py"
    source = path.read_text(encoding="utf-8-sig")
    tree = ast.parse(source, filename=str(path))
    functions = {
        node.name: node
        for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    }
    activation_segment = ast.get_source_segment(source, functions["get_event_activation"]) or ""
    usage_segment = ast.get_source_segment(source, functions["get_event_usage"]) or ""
    assert "get_latest_activation" in activation_segment
    assert "event_exists" in usage_segment
    assert "select(EventActivation)" not in activation_segment
    assert "select(Event)" not in usage_segment
