from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_proposal_read_routes_delegate_to_quote_query_service():
    source = (ROOT / "app/modules/commercial/quotes_router.py").read_text(encoding="utf-8")
    assert "QuoteQueryService(db).get_proposal" in source
    assert "QuoteQueryService(db).list_proposal_versions" in source
    assert "QuoteQueryService(db).list_proposal_documents" in source
    assert "QuoteQueryService(db).get_proposal_for_quote" in source
    assert "QuoteQueryService(db).get_proposal_document" in source


def test_proposal_document_query_is_tenant_scoped_bounded_and_stable():
    source = (ROOT / "app/modules/commercial/application/queries.py").read_text(encoding="utf-8")
    region = source.split("async def list_proposal_documents", 1)[1].split("class ServiceCatalogQueryService", 1)[0]
    assert "max(1, min(int(limit), 100))" in region
    assert "DataExport.organization_id == organization_id" in region
    assert "DataExport.source_id == proposal_id" in region
    assert "DataExport.created_at.desc(), DataExport.id.desc()" in region


def test_proposal_version_query_is_tenant_scoped_and_bounded():
    source = (ROOT / "app/modules/commercial/application/queries.py").read_text(encoding="utf-8")
    region = source.split("async def list_proposal_versions", 1)[1].split("async def list_proposal_documents", 1)[0]
    assert "max(1, min(int(limit), 100))" in region
    assert "ProposalVersion.organization_id == organization_id" in region
    assert "ProposalVersion.version.desc()" in region


def test_proposal_document_reads_use_explicit_columns():
    source = (ROOT / "app/modules/commercial/application/queries.py").read_text(encoding="utf-8")
    region = source.split("async def list_proposal_documents", 1)[1].split("class ServiceCatalogQueryService", 1)[0]
    assert "load_only(" in region
    assert "DataExport.storage_key" in region
