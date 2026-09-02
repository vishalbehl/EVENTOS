from unittest.mock import AsyncMock, MagicMock, patch
from pathlib import Path
from xml.etree import ElementTree


def test_liveness_probe_is_process_only(test_client):
    response = test_client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_readiness_probe_requires_database_query(test_client):
    session = AsyncMock()
    session.execute = AsyncMock()
    session_factory = MagicMock()
    session_factory.return_value.__aenter__ = AsyncMock(return_value=session)
    session_factory.return_value.__aexit__ = AsyncMock(return_value=None)

    with patch("app.database.AsyncSessionLocal", session_factory):
        response = test_client.get("/readyz")

    assert response.status_code == 200
    assert response.json() == {"status": "ready"}
    session.execute.assert_awaited_once()


def test_readiness_probe_surfaces_database_failure(test_client):
    session = AsyncMock()
    session.execute.side_effect = RuntimeError("database unavailable")
    session_factory = MagicMock()
    session_factory.return_value.__aenter__ = AsyncMock(return_value=session)
    session_factory.return_value.__aexit__ = AsyncMock(return_value=None)

    with patch("app.database.AsyncSessionLocal", session_factory):
        response = test_client.get("/readyz")

    assert response.status_code == 503
    assert response.json() == {"detail": "database unavailable"}


def test_windows_service_definitions_preserve_startup_order():
    packaging = Path(__file__).parents[1] / "packaging" / "windows"
    api = ElementTree.parse(packaging / "EventosVenueApi.xml").getroot()
    gateway = ElementTree.parse(packaging / "EventosVenueGateway.xml").getroot()

    assert api.findtext("depend") == "EventosVenuePostgres"
    assert [node.text for node in gateway.findall("depend")] == [
        "EventosVenueApi",
        "EventosVenueUi",
    ]
