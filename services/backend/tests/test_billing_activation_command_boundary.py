from __future__ import annotations

import ast
from pathlib import Path


def test_billing_activation_mutations_delegate_transaction_ownership():
    path = Path(__file__).resolve().parents[1] / "app/modules/billing/routers/activations.py"
    source = path.read_text(encoding="utf-8-sig")
    tree = ast.parse(source, filename=str(path))
    expected = {
        "activate_event": "BillingActivationCommandService.activate",
        "deactivate_event": "BillingActivationCommandService.deactivate",
        "transfer_event_activation": "BillingActivationCommandService.transfer",
    }
    functions = {
        node.name: node
        for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    }
    for name, delegation in expected.items():
        segment = ast.get_source_segment(source, functions[name]) or ""
        assert delegation in segment
        assert "await db.commit()" not in segment
        assert "db.add(" not in segment

