import pytest

from tests.conftest import activate_event_for_test, auth_headers


def test_fixed_session_builder_routes_precede_dynamic_session_route():
    from app.routers import api_router

    route_paths = [getattr(route, "path", "") for route in api_router.routes]
    dynamic_session_index = route_paths.index("/events/{event_id}/sessions/{session_id}")

    for fixed_path in (
        "/events/{event_id}/sessions/builder-snapshot",
        "/events/{event_id}/sessions/bulk-reorder",
        "/events/{event_id}/sessions/conflicts",
        "/events/{event_id}/sessions/publish-schedule",
    ):
        assert route_paths.index(fixed_path) < dynamic_session_index


@pytest.mark.asyncio
async def test_builder_snapshot_reaches_fixed_route_and_returns_existing_programme(
    client,
    db,
    organizer,
    event,
    room,
    session_obj,
):
    await activate_event_for_test(db, event)

    response = await client.get(
        f"/api/v1/events/{event.id}/sessions/builder-snapshot",
        headers=auth_headers(organizer),
    )

    assert response.status_code == 200, response.text
    snapshot = response.json()
    assert [session["id"] for session in snapshot["sessions"]] == [str(session_obj.id)]
    assert [snapshot_room["id"] for snapshot_room in snapshot["rooms"]] == [str(room.id)]
