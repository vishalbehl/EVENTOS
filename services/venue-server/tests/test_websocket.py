import pytest
from app.websocket.connection import ConnectionManager
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
