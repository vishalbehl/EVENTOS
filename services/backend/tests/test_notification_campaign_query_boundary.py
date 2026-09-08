import uuid

import pytest


@pytest.mark.asyncio
async def test_campaign_query_is_explicitly_scoped_bounded_and_ordered():
    from app.modules.notifications.application.queries import EmailCampaignQueryService

    event_id = uuid.uuid4()
    user_id = uuid.uuid4()

    class Rows:
        def mappings(self):
            return self

        def all(self):
            return []

    class SessionDouble:
        async def execute(self, statement):
            compiled = statement.compile()
            sql = str(compiled).upper()
            assert "COMMUNICATIONS.EMAIL_CAMPAIGNS" in sql
            assert event_id in compiled.params.values()
            assert user_id in compiled.params.values()
            assert "LIMIT" in sql
            assert "ORDER BY" in sql
            return Rows()

    result = await EmailCampaignQueryService(SessionDouble()).list_for_event(
        event_id=event_id,
        target_type="speaker",
        user_id=user_id,
        unrestricted=False,
        limit=1000,
    )
    assert result == []
