from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_financial_adjustment_decision_accepts_optional_case_reference():
    schema = (ROOT / "app/modules/platform/schemas/organization_console.py").read_text(encoding="utf-8")
    router = (ROOT / "app/modules/platform/organization_console_router.py").read_text(encoding="utf-8")
    command = (ROOT / "app/modules/platform/application/financial_adjustment_commands.py").read_text(encoding="utf-8")
    decision = schema.split("class ApprovalDecision", 1)[1].split("class CommercialAccessDecision", 1)[0]
    route = router.split("async def decide_financial_adjustment", 1)[1].split("async def create_organization_api_key", 1)[0]
    assert "case_reference: str | None" in decision
    assert "case_reference=payload.case_reference" in route
    assert '"case_reference": case_reference' in command
