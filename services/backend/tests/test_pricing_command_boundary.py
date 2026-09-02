from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/pricing/router.py"
SERVICE = ROOT / "app/modules/pricing/application/commands.py"


def test_pricing_rule_mutations_delegate_to_command_service():
    source = ROUTER.read_text(encoding="utf-8")
    assert "PricingCommandService.create_rule" in source
    assert "PricingCommandService.update_rule" in source
    create_region = source.split("async def superadmin_create_pricing_rule", 1)[1].split(
        "async def superadmin_update_pricing_rule", 1
    )[0]
    update_region = source.split("async def superadmin_update_pricing_rule", 1)[1].split(
        "async def superadmin_run_simulation", 1
    )[0]
    assert "await db.commit()" not in create_region
    assert "await db.commit()" not in update_region


def test_pricing_rule_commands_lock_updates_and_own_transactions():
    source = SERVICE.read_text(encoding="utf-8")
    assert "with_for_update()" in source
    assert "await db.commit()" in source
    assert "_clear_default_rules" in source
    assert "PricingRule.organization_id == organization_id" in source
