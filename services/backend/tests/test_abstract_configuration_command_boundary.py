from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/abstracts/router.py"
SERVICE = ROOT / "app/modules/abstracts/application/commands.py"


def test_abstract_configuration_mutations_delegate_to_command_service():
    source = ROUTER.read_text(encoding="utf-8")
    assert "AbstractConfigurationCommandService(db).update_call" in source
    assert "AbstractConfigurationCommandService(db).update_form" in source
    setup_region = source.split('async def update_setup', 1)[1].split('@router.get("/form"', 1)[0]
    form_region = source.split('async def update_form', 1)[1].split('@router.get("/submissions"', 1)[0]
    assert "await db.commit()" not in setup_region
    assert "await db.commit()" not in form_region


def test_abstract_configuration_commands_preserve_concurrency_and_transaction_rules():
    source = SERVICE.read_text(encoding="utf-8")
    assert ".with_for_update()" in source
    assert "VERSION_CONFLICT" in source
    assert "await self.db.commit()" in source
    assert "await self.db.rollback()" in source
