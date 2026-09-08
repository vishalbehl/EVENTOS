from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_organiser_document_list_uses_bounded_explicit_projection():
    router = (ROOT / "app/modules/organiser/router.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/organiser/application/queries.py").read_text(encoding="utf-8")
    region = router.split("async def organiser_documents", 1)[1].split("@router.post(\"/documents\"", 1)[0]

    assert "OrganiserDocumentQueryService(db).list_current" in region
    assert "select(OrganizationDocument, Asset, User)" not in region
    assert "MAX_PAGE_SIZE = 100" in queries
    assert "OrganizationDocument.is_current.is_(True)" in queries
    assert "OrganizationDocument.updated_at.desc(), OrganizationDocument.id.desc()" in queries
