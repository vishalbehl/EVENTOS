from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.modules.website_builder.router import (
    _get_readonly_master_template_and_draft,
    _get_readonly_site_and_draft,
)


class ReadOnlyDb:
    def __init__(self):
        self.scalar_calls = 0
        self.mutations = []

    async def scalar(self, statement):
        self.scalar_calls += 1
        return None

    def add(self, value):
        self.mutations.append("add")

    async def flush(self):
        self.mutations.append("flush")

    async def commit(self):
        self.mutations.append("commit")


@pytest.mark.asyncio
async def test_event_website_read_does_not_provision_missing_records():
    event = SimpleNamespace(
        id=uuid4(),
        organization_id=uuid4(),
        name="Read Only Event",
        short_code="readonly",
        start_date=SimpleNamespace(isoformat=lambda: "2026-10-01"),
        end_date=SimpleNamespace(isoformat=lambda: "2026-10-02"),
        location="Test venue",
        venue_name=None,
    )
    db = ReadOnlyDb()

    site, draft = await _get_readonly_site_and_draft(db, event)

    assert site.event_id == event.id
    assert draft.site_id == site.id
    assert draft.revision_counter == 1
    assert db.scalar_calls == 1
    assert db.mutations == []


@pytest.mark.asyncio
async def test_master_template_read_does_not_provision_missing_records():
    actor = SimpleNamespace(id=uuid4())
    db = ReadOnlyDb()

    template, draft = await _get_readonly_master_template_and_draft(db, actor)

    assert template.is_system is True
    assert draft.template_id == template.id
    assert draft.optimistic_version == 1
    assert db.scalar_calls == 2
    assert db.mutations == []
