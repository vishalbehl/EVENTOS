from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/inventory/router.py"
SERVICE = ROOT / "app/modules/inventory/application/commands.py"


def test_inventory_mutations_delegate_to_command_service():
    source = ROUTER.read_text(encoding="utf-8")
    assert "InventoryCommandService(db).import_hardware" in source
    assert "InventoryCommandService(db).delete_hardware" in source
    assert "await db.commit()" not in source
    assert "db.add(" not in source


def test_inventory_command_bounds_import_and_owns_transaction():
    source = SERVICE.read_text(encoding="utf-8")
    assert "MAX_IMPORT_BYTES = 20 * 1024 * 1024" in source
    assert "MAX_IMPORT_ROWS = 10_000" in source
    assert "with_for_update()" in source
    assert "await self.db.commit()" in source
