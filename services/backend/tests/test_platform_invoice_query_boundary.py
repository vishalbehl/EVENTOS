from pathlib import Path


def test_platform_invoice_route_delegates_to_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/router.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def list_all_invoices", 1)[1].split(
        "# ── Revenue Metrics", 1
    )[0]
    assert "PlatformCommercialCatalogQueryService(db).list_invoices" in region
    assert "await db.execute" not in region


def test_platform_invoice_query_clamps_and_tie_breaks_offset_pagination():
    queries = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/application/queries.py"
    ).read_text(encoding="utf-8-sig")
    region = queries.split("async def list_invoices", 1)[1].split(
        "class OrganizationConsoleQueryService", 1
    )[0]
    assert "bounded_skip = max(int(skip), 0)" in region
    assert "bounded_limit = max(1, min(int(limit), 100))" in region
    assert "ORDER BY i.created_at DESC, i.id DESC" in region
    assert "COUNT(*)" in region
