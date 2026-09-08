from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_document_history_uses_bounded_explicit_query_service_projection():
    router = (ROOT / "app/modules/organiser/router.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/organiser/application/queries.py").read_text(encoding="utf-8")
    region = router.split("async def organiser_document_history", 1)[1].split("@router.post(\"/documents/{document_id}/replace\"", 1)[0]

    assert "OrganiserDocumentQueryService(db).list_history" in region
    assert "select(OrganizationDocument)" not in region
    assert "select(OrganizationDocument, Asset, User)" not in region
    assert "limit(self.MAX_PAGE_SIZE)" in queries
    assert "OrganizationDocument.revision.desc(), OrganizationDocument.id.desc()" in queries
