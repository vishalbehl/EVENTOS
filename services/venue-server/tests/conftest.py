import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi.testclient import TestClient
from httpx import AsyncClient, ASGITransport
import datetime
import uuid

# Set ENV before importing app
import os
os.environ["ENV"] = "testing"
os.environ["DATABASE_URL"] = "postgresql+asyncpg://mock:mock@localhost:5432/mock_db"
os.environ["VENUE_AUTH_KEY"] = "test-venue-device-key-32-characters"
os.environ["VENUE_AUTH_SECRET"] = "test-venue-auth-secret-at-least-32-characters"

# Mock out startup tasks before importing app
import sys
from unittest.mock import patch
patch("app.minio_client.ensure_bucket_exists").start()
patch("app.websocket.connection.start_redis_listener").start()

from app.main import app_fastapi as app
from app.database import get_database

@pytest.fixture
def mock_minio(mocker):
    return mocker.patch("app.routers.cloud_sync.minio_client")

@pytest.fixture
def mock_minio_generate(mocker):
    return mocker.patch("app.routers.local_api.minio_client")

@pytest.fixture
def mock_redis(mocker):
    return mocker.patch("app.websocket.connection.manager.redis", new_callable=AsyncMock)

@pytest.fixture
def mock_db_session():
    session = AsyncMock()
    # By default, scalar_one_or_none() on execute() results should return None
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_result.scalars.return_value.all.return_value = []
    session.execute.return_value = mock_result
    return session

@pytest.fixture
def test_client(mock_db_session):
    # Override dependency
    app.dependency_overrides[get_database] = lambda: mock_db_session
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()

@pytest.fixture
async def async_client(mock_db_session):
    app.dependency_overrides[get_database] = lambda: mock_db_session
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client
    app.dependency_overrides.clear()
