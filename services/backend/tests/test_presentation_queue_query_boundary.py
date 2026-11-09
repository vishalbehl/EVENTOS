"""Query-boundary regression coverage for presentation queues."""

import inspect

from app.modules.presentations.application.queries import PresentationQueueQueryService


def test_queue_queries_are_event_scoped_bounded_and_stably_ordered():
    source = inspect.getsource(PresentationQueueQueryService)
    assert "Event.organization_id == organization_id" in source
    assert "Session.event_id == event_id" in source
    assert "Session.deleted_at.is_(None)" in source
    assert "MAX_ROWS = 2_000" in source
    assert "PresentationQueue.queue_order.asc()" in source
    assert ".limit(self._bound())" in source


def test_queue_read_routes_delegate_to_the_query_service():
    source = inspect.getsource(__import__(
        "app.modules.presentations.routers.queue", fromlist=["list_event_queue"]
    ))
    assert "PresentationQueueQueryService(db).list_for_event" in source
    assert "PresentationQueueQueryService(db).list_for_session" in source
    assert "PresentationQueueQueryService(db).list_for_room" in source
