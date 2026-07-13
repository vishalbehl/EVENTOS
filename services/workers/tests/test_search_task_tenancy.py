from __future__ import annotations

import uuid
from contextlib import contextmanager
from unittest.mock import MagicMock, patch


def test_index_entity_passes_explicit_tenant_scope_to_every_helper():
    from workers.tasks.search_tasks import index_entity

    organization_id = uuid.uuid4()
    entity_id = uuid.uuid4()
    content = {"title": "Scoped event", "organization_id": str(organization_id)}

    with patch("workers.tasks.search_tasks._extract_content", return_value=content) as extract, \
         patch("workers.tasks.search_tasks._upsert_document") as upsert:
        result = index_entity.apply(
            args=[str(organization_id), "events", str(entity_id)]
        ).result

    assert result["indexed"] is True
    extract.assert_called_once_with(organization_id, "events", entity_id)
    upsert.assert_called_once_with(organization_id, "events", str(entity_id), content)


def test_event_extraction_rejects_another_organizations_event():
    from workers.tasks.search_tasks import _extract_content

    expected_organization_id = uuid.uuid4()
    foreign_event = MagicMock()
    foreign_event.organization_id = uuid.uuid4()
    db = MagicMock()
    db.get.return_value = foreign_event

    @contextmanager
    def scoped_session(organization_id):
        assert organization_id == expected_organization_id
        yield db

    with patch("workers.tasks.search_tasks.get_db_session", side_effect=scoped_session):
        result = _extract_content(expected_organization_id, "events", uuid.uuid4())

    assert result is None


def test_participant_extraction_rejects_another_organizations_event():
    from workers.tasks.search_tasks import _extract_content

    expected_organization_id = uuid.uuid4()
    participant = MagicMock()
    participant.event_id = uuid.uuid4()
    foreign_event = MagicMock()
    foreign_event.organization_id = uuid.uuid4()
    db = MagicMock()
    db.get.side_effect = [participant, foreign_event]

    @contextmanager
    def scoped_session(organization_id):
        assert organization_id == expected_organization_id
        yield db

    with patch("workers.tasks.search_tasks.get_db_session", side_effect=scoped_session):
        result = _extract_content(expected_organization_id, "participants", uuid.uuid4())

    assert result is None
