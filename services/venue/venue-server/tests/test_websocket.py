import pytest
from app.websocket.connection import ConnectionManager
from app.routers.srr import broadcast_srr
from app.websocket import connection
from unittest.mock import AsyncMock, MagicMock

@pytest.mark.asyncio
async def test_connection_manager_publish(mocker):
    mock_redis = AsyncMock()
    mock_redis.pubsub = MagicMock(return_value=AsyncMock())
    mocker.patch("redis.asyncio.from_url", return_value=mock_redis)
    manager = ConnectionManager("redis://localhost:6379/0")
    
    await manager.publish("venue_events", {"event": "test_event", "data": "123"})
    mock_redis.publish.assert_awaited_once()

@pytest.mark.asyncio
async def test_connection_manager_close(mocker):
    mock_redis = AsyncMock()
    mock_pubsub = AsyncMock()
    manager = ConnectionManager()
    manager.redis = mock_redis
    manager.pubsub = mock_pubsub
    
    await manager.close()
    mock_pubsub.unsubscribe.assert_awaited_once()


@pytest.mark.asyncio
async def test_srr_broadcast_is_scoped_to_event_room(mocker):
    publish = mocker.patch("app.routers.srr.manager.publish", new_callable=AsyncMock)

    await broadcast_srr("srr:file_updated", {"event_id": "event-1", "file_id": "file-1"})

    publish.assert_awaited_once_with(
        "venue_events",
        {"event": "srr:file_updated", "event_id": "event-1", "file_id": "file-1", "room": "event_event-1"},
    )


@pytest.mark.asyncio
async def test_production_socket_rejects_unauthenticated_external_client(mocker):
    mocker.patch.object(connection.settings, "DEPLOYMENT_PROFILE", "production")
    with pytest.raises(Exception, match="credential"):
        await connection.connect("sid-1", {"REMOTE_ADDR": "192.168.1.50"}, {})
