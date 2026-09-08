from pathlib import Path


def test_public_branding_route_uses_query_service_for_source_reads():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/router.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def get_public_organization_branding", 1)[1].split(
        '@router.get("/organizations/{org_id}/domains")', 1
    )[0]
    assert "OrganizationConsoleQueryService(db).public_branding_sources" in region
    assert "select(Organization)" not in region
    assert "select(OrganizationBrandProfile)" not in region


def test_public_branding_query_is_explicit_and_published_only():
    queries = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/application/queries.py"
    ).read_text(encoding="utf-8-sig")
    region = queries.split("async def public_branding_sources", 1)[1].split(
        "async def payment_events", 1
    )[0]
    assert "load_only(" in region
    assert "Organization.is_active.is_(True)" in region
    assert 'OrganizationBrandProfile.status == "PUBLISHED"' in region
    assert ".limit(1)" in region
