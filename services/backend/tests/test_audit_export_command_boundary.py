"""Guardrails for durable audit-export commands and bounded reads."""

import ast
import inspect
from pathlib import Path


def test_audit_export_router_delegates_request_and_reads():
    path = Path(__file__).resolve().parents[1] / "app/modules/audit/routers/audit_exports.py"
    source = path.read_text(encoding="utf-8-sig")
    tree = ast.parse(source, filename=str(path))
    functions = {
        node.name: node
        for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    }
    assert "AuditExportCommandService.request" in ast.get_source_segment(source, functions["create_audit_export"])
    assert "AuditExportQueryService" in ast.get_source_segment(source, functions["list_audit_exports"])
    assert "AuditExportQueryService" in ast.get_source_segment(source, functions["get_audit_export"])
    assert "await db.commit()" not in ast.get_source_segment(source, functions["create_audit_export"])


def test_audit_export_command_is_durable_and_dispatches_after_commit():
    from app.modules.audit.application.export_commands import AuditExportCommandService

    source = inspect.getsource(AuditExportCommandService.request)
    helper_source = inspect.getsource(AuditExportCommandService._tenant_scope)
    assert "TenantContextGuard.apply" in helper_source
    assert "IDEMPOTENCY_CONFLICT" in source
    assert "await db.flush()" in source
    assert "await db.commit()" in source
    assert "EXPORT_DISPATCH_FAILED" in source


def test_audit_export_query_is_bounded_and_tenant_scoped():
    from app.modules.audit.application.export_queries import AuditExportQueryService

    source = inspect.getsource(AuditExportQueryService)
    assert "organization_id == organization_id" in source
    assert "source_type == \"audit_log_export\"" in source
    assert "MAX_PAGE_SIZE = 100" in source
    assert "load_only" in source
    assert "limit(bounded)" in source
    assert "db.commit" not in source
