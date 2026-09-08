from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_organiser_approval_rule_list_uses_bounded_query_service():
    router = (ROOT / "app/modules/organiser/router.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/organiser/application/queries.py").read_text(encoding="utf-8")
    region = router.split("async def organiser_approval_rules", 1)[1].split("@router.post(\"/access/approval-rules\"", 1)[0]

    assert "OrganiserApprovalRuleQueryService(db).list_rules" in region
    assert "select(OrganizationApprovalRule)" not in region
    assert "OrganizationApprovalRule.archived_at.is_(None)" in queries
    assert "order_by(OrganizationApprovalRule.name, OrganizationApprovalRule.id)" in queries
    assert ".limit(bounded)" in queries
