from pathlib import Path


def test_invoice_items_route_delegates_to_bounded_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/router.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def get_invoice_items", 1)[1].split(
        '@router.post("/invoices/{invoice_id}/mark-paid")', 1
    )[0]
    assert "PlatformCommercialCatalogQueryService(db).invoice_items" in region
    assert "await db.execute" not in region


def test_invoice_items_query_is_explicit_bounded_and_stably_ordered():
    queries = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/application/queries.py"
    ).read_text(encoding="utf-8-sig")
    region = queries.split("async def invoice_items", 1)[1].split(
        "async def list_subscriptions", 1
    )[0]
    assert "load_only(" in region
    assert "InvoiceItem.invoice_id == invoice_id" in region
    assert ".limit(500)" in region
    assert "InvoiceItem.id.asc()" in region
