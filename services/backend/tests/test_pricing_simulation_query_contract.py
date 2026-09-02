from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/pricing/router.py"


def test_pricing_simulation_batches_hardware_lookups():
    source = ROUTER.read_text(encoding="utf-8")
    region = source.split("async def superadmin_run_simulation", 1)[1].split(
        "@router.get(\"/superadmin/catalog/templates/{slug}\")", 1
    )[0]
    assert "HardwareItem.id.in_(hardware_ids)" in region
    assert "hardware_by_id.get(item.hardware_item_id)" in region
    assert "select(HardwareItem).where(HardwareItem.id == item.hardware_item_id)" not in region
