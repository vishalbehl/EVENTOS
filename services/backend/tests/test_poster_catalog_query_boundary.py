"""Regression contract for poster catalogue and signage read boundaries."""

import inspect

from app.modules.presentations.application.queries import PosterQueryService


def test_poster_catalog_queries_are_scoped_bounded_and_ordered():
    source = inspect.getsource(PosterQueryService)
    assert "Event.organization_id == organization_id" in source
    assert "Poster.event_id == event_id" in source
    assert ".limit(500)" in source
    assert ".limit(self.MAX_ROWS)" in source
    assert "Poster.is_featured.desc(), Poster.display_order.asc(), Poster.id.asc()" in source


def test_poster_category_and_screen_routes_delegate_to_query_service():
    source = inspect.getsource(__import__(
        "app.modules.presentations.routers.posters", fromlist=["list_poster_categories"]
    ))
    assert "PosterQueryService(db).list_categories" in source
    assert "PosterQueryService(db).list_for_screen" in source
