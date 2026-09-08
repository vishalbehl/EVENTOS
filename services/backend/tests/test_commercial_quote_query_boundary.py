from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_quote_revision_and_approval_reads_delegate_to_query_service():
    source = (ROOT / "app/modules/commercial/quotes_router.py").read_text(encoding="utf-8")
    assert "QuoteQueryService(db).get_quote" in source
    assert "QuoteQueryService(db).list_revisions" in source
    assert "QuoteQueryService(db).get_approval" in source


def test_quote_query_service_bounds_and_scopes_revision_reads():
    source = (ROOT / "app/modules/commercial/application/queries.py").read_text(encoding="utf-8")
    region = source.split("async def list_revisions", 1)[1].split("class ServiceCatalogQueryService", 1)[0]
    assert "max(1, min(int(limit), 100))" in region
    assert "CommercialQuoteRevision.organization_id == organization_id" in region
    assert "CommercialQuoteRevision.version.desc()" in region
    assert "QuoteApprovalWorkflow.organization_id == organization_id" in region


def test_quote_detail_query_is_tenant_scoped_and_eager_loads_line_items():
    source = (ROOT / "app/modules/commercial/application/queries.py").read_text(encoding="utf-8")
    region = source.split("async def get_quote", 1)[1].split("async def list_page", 1)[0]
    assert "CommercialQuote.organization_id == organization_id" in region
    assert "selectinload(CommercialQuote.line_items)" in region
