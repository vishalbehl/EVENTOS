from __future__ import annotations

import ast
from pathlib import Path


def _matrix_source() -> str:
    mounted = Path("/runtime-ops/staging_task_family_matrix.py")
    if mounted.exists():
        return mounted.read_text(encoding="utf-8")
    return (Path(__file__).resolve().parents[3] / "ops" / "staging_task_family_matrix.py").read_text(encoding="utf-8")


def test_task_family_matrix_covers_required_runtime_families():
    module = ast.parse(_matrix_source())
    assignment = next(
        item
        for item in module.body
        if (
            isinstance(item, ast.Assign)
            and any(isinstance(target, ast.Name) and target.id == "FAMILIES" for target in item.targets)
        )
        or (isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name) and item.target.id == "FAMILIES")
    )
    families = {str(item["family"]): item for item in ast.literal_eval(assignment.value)}
    assert {
        "uploads",
        "imports",
        "analytics-projections",
        "notifications",
        "reconciliation-and-venue-ops",
        "legacy-processing",
        "legacy-imports",
        "legacy-reports",
        "legacy-search-and-video",
        "legacy-video",
        "legacy-notifications",
    } <= set(families)
    assert families["uploads"]["replay_allowlisted"] is True
    assert families["analytics-projections"]["replay_allowlisted"] is True


def test_task_family_matrix_has_no_unbounded_required_signature():
    source = _matrix_source()
    assert "required_tasks" in source
    assert "required_prefixes" in source
    assert "replay_allowlisted" in source
