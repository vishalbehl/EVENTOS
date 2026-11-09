"""Regression contract for scoped presentation-file workspace reads."""

import inspect

from app.modules.presentations.application.queries import PresentationFileQueryService


def test_presentation_file_list_is_scoped_bounded_and_eager():
    source = inspect.getsource(PresentationFileQueryService.list_for_event)
    assert "Event.organization_id == organization_id" in source
    assert "PresentationFile.event_id == event_id" in source
    assert "selectinload(PresentationFile.speaker)" in source
    assert "selectinload(PresentationFile.validation)" in source
    assert "PresentationFile.uploaded_at.desc(), PresentationFile.id.desc()" in source
    assert ".limit(self.MAX_ROWS)" in source


def test_presentation_file_route_delegates_to_query_service():
    source = inspect.getsource(__import__(
        "app.modules.presentations.routers.files", fromlist=["list_files"]
    ).list_files)
    assert "PresentationFileQueryService(db).list_for_event" in source
    assert "UserAccessNode" not in source
