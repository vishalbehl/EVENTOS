from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_organization_console_summary_uses_aggregate_projection_for_configuration_counts():
    queries = (ROOT / "app/modules/platform/application/queries.py").read_text(encoding="utf-8")
    service = (ROOT / "app/modules/platform/services/organization_console_service.py").read_text(encoding="utf-8")

    for label in (
        'label("team_count")',
        'label("connection_count")',
        'label("api_key_count")',
        'label("branding_profile_count")',
        'label("notification_channel_count")',
    ):
        assert label in queries
    assert "team_count = counts.team_count" in service
    assert "connection_count = counts.connection_count" in service
    assert "api_key_count = counts.api_key_count" in service
    assert "await self._exists(OrganizationBrandProfile" not in service
    assert "await self._exists(OrganizationNotificationChannelConfig" not in service


def test_organization_console_counts_remains_read_only():
    queries = (ROOT / "app/modules/platform/application/queries.py").read_text(encoding="utf-8")
    counts_body = queries.split("    async def counts(", 1)[1].split("    async def events_with_registration_counts", 1)[0]
    assert "commit(" not in counts_body
    assert "add(" not in counts_body
    assert "delete(" not in counts_body
