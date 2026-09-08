from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_lifecycle_manifest_fixed_counts_use_one_projection():
    source = (ROOT / "app/modules/platform/services/lifecycle_service.py").read_text(encoding="utf-8")
    region = source.split("async def build_manifest", 1)[1].split("table_counts:", 1)[0]
    assert "fixed_counts =" in region
    assert ").mappings().one()" in region
    assert region.count("await db.scalar") == 0
    assert '"registration_payments"' in region
    assert '"audit_records_retained"' in region
