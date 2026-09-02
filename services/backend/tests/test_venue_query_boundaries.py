from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_room_device_list_uses_bounded_tenant_safe_query_service():
    router = (ROOT / "app/modules/venue/routers/rooms_devices.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/venue/application/queries.py").read_text(encoding="utf-8")

    region = router.split("async def list_devices", 1)[1].split("@router.", 1)[0]
    assert "RoomDeviceQueryService(db).list_for_room" in region
    assert "await db.execute" not in region
    assert "RoomDevice.organization_id == organization_id" in queries
    assert ".order_by(RoomDevice.device_type, RoomDevice.id)" in queries
    assert ".limit(bounded_limit)" in queries
    assert "load_only" in queries
    assert "await self.db.commit()" not in queries
