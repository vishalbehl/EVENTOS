from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_organiser_tax_section_uses_bounded_billing_projection():
    router = (ROOT / "app/modules/organiser/router.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/organiser/application/queries.py").read_text(encoding="utf-8")
    region = router.split("async def organiser_billing", 1)[1].split("@router.get(\"/documents\"", 1)[0]

    assert "OrganiserBillingQueryService(db).get_tax_profile" in region
    assert "select(OrganizationBillingProfile)" not in region
    assert "select(SubscriptionTransaction)" not in region
    assert "OrganizationBillingProfile.updated_at" in queries
    assert "SubscriptionTransaction.created_at.desc()" in queries
