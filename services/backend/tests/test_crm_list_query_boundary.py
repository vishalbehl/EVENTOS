from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_crm_list_routes_delegate_list_statement_to_query_service():
    source = (ROOT / "app/modules/crm/routers/crm_router.py").read_text(encoding="utf-8")
    assert "CrmListQueryService" in source
    assert source.count("CrmListQueryService(db).statement(") >= 5
    assert "select(Account).where" not in source
    assert "select(Contact).where" not in source
    assert "select(Lead).where" not in source
    assert "select(Opportunity).where" not in source


def test_crm_list_query_service_owns_tenant_filters_and_stable_ordering():
    source = (ROOT / "app/modules/crm/application/queries.py").read_text(encoding="utf-8")
    region = source.split("class CrmListQueryService", 1)[1]
    assert "model.organization_id == organization_id" in region
    assert "model.archived_at.is_(None)" in region
    assert "model.created_at.desc(), model.id.desc()" in region
    assert "model.entity_type == entity_type" in region
    assert "model.entity_id == entity_id" in region


def test_crm_workspace_and_lists_share_explicit_projection_helper():
    source = (ROOT / "app/modules/crm/application/queries.py").read_text(encoding="utf-8")
    assert "def _projected_select(model)" in source
    assert "_projected_select(Account).where" in source
    assert "_projected_select(Contact).where" in source
    assert "_projected_select(Opportunity).where" in source
    assert "_projected_select(model).where(model.organization_id == organization_id)" in source
