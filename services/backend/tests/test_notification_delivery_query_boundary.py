from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_provider_delivery_history_uses_tenant_scoped_query_service():
    router = (ROOT / "app/modules/notifications/routers/notifications.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/notifications/application/queries.py").read_text(encoding="utf-8")
    region = router.split("async def list_provider_deliveries", 1)[1].split("@router.", 1)[0]
    assert "CommunicationDeliveryQueryService(db).list_batches" in region
    assert "event.organization_id" in region
    assert "raise HTTPException(status_code=404, detail=\"Cursor not found.\")" in region
    service_region = queries.split("class CommunicationDeliveryQueryService", 1)[1]
    assert "organization_id == organization_id" in service_region
    assert "event_id == event_id" in service_region
    assert "created_at.desc()" in service_region
    assert "id.desc()" in service_region
    assert ".limit(bounded_limit + 1)" in service_region
