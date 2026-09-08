from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_organiser_billing_list_sections_use_bounded_query_service():
    router = (ROOT / "app/modules/organiser/router.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/organiser/application/queries.py").read_text(encoding="utf-8")
    region = router.split("async def organiser_billing", 1)[1].split("@router.get(\"/documents\"", 1)[0]

    assert "OrganiserBillingQueryService(db).list_invoices" in region
    assert "OrganiserBillingQueryService(db).list_transactions" in region
    assert "OrganiserBillingQueryService(db).list_payment_methods" in region
    assert "OrganiserBillingQueryService(db).list_credits" in region
    assert "OrganiserBillingQueryService(db).get_invoice_for_download" in router
    assert "select(Invoice)" not in region
    assert "MAX_PAGE_SIZE = 100" in queries
    assert "order_by(Invoice.issued_at.desc(), Invoice.id.desc())" in queries
    assert "Invoice.total_amount_inr" in queries
