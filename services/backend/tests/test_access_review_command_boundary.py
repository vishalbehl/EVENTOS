"""Guardrails for security-governance transaction ownership."""

import ast
import inspect
from pathlib import Path


def test_access_review_router_delegates_mutations_without_committing():
    path = Path(__file__).resolve().parents[1] / "app/modules/audit/routers/security_governance.py"
    source = path.read_text(encoding="utf-8-sig")
    tree = ast.parse(source, filename=str(path))
    functions = {
        node.name: node
        for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    }
    for name, delegation in {
        "create_access_review": "AccessReviewCommandService.create",
        "decide_access_review": "AccessReviewCommandService.decide",
    }.items():
        segment = ast.get_source_segment(source, functions[name]) or ""
        assert delegation in segment
        assert "await db.commit()" not in segment
        assert "db.add(" not in segment


def test_access_review_commands_preserve_lock_version_and_rollback_rules():
    from app.modules.audit.application.commands import AccessReviewCommandService

    source = inspect.getsource(AccessReviewCommandService)
    assert source.count("await db.commit()") == 2
    assert source.count("await db.rollback()") == 2
    assert "with_for_update()" in source
    assert "VERSION_CONFLICT" in source
    assert "DUAL_CONTROL_REQUIRED" in source
    assert "User.organization_id == scope.organization_id" in source
