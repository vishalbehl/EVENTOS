from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_proposal_share_reads_delegate_to_quote_query_service():
    source = (ROOT / "app/modules/commercial/quotes_router.py").read_text(encoding="utf-8")
    assert "QuoteQueryService(db).list_proposal_shares" in source
    assert "QuoteQueryService(db).get_proposal_share" in source
    assert "QuoteQueryService(db).list_proposal_share_accesses" in source


def test_proposal_share_reads_are_bounded_tenant_scoped_and_stable():
    source = (ROOT / "app/modules/commercial/application/queries.py").read_text(encoding="utf-8")
    region = source.split("async def list_proposal_shares", 1)[1].split("class ServiceCatalogQueryService", 1)[0]
    assert region.count("max(1, min(int(limit), 100))") >= 2
    assert "ProposalShare.organization_id == organization_id" in region
    assert "ProposalShareAccess.organization_id == organization_id" in region
    assert "ProposalShare.created_at.desc(), ProposalShare.id.desc()" in region
    assert "ProposalShareAccess.occurred_at.desc(), ProposalShareAccess.id.desc()" in region
