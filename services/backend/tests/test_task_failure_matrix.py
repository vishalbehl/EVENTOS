from __future__ import annotations

from pathlib import Path


def test_task_failure_matrix_is_identifier_only_and_tenant_scoped():
    mounted = Path("/runtime-ops/staging_task_failure_matrix.py")
    source_path = mounted if mounted.exists() else Path(__file__).resolve().parents[3] / "ops" / "staging_task_failure_matrix.py"
    source = source_path.read_text(encoding="utf-8")
    assert "malformed identifiers" in source
    assert 'headers={"tenant_org_id": str(organization_id)}' in source
    assert '"durable_failure"' in source
    assert '"replay_payload_present"' in source
    assert "password" not in source.lower()
