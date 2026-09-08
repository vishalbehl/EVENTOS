from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_venue_ops_mutations_invalidate_event_cache_after_commit():
    source = (
        ROOT
        / "app/modules/technology_services/application/commands.py"
    ).read_text(encoding="utf-8")

    assert "from app.core.cache import cache_service" in source
    assert source.count('await cache_service.invalidate_domain("venue_ops_recommendations"') >= 6
    for commit, invalidation in (
        (
            'await self.db.commit()\n        await cache_service.invalidate_domain("venue_ops_recommendations", organization_id, event_id)',
            "recommendation snapshots",
        ),
        (
            'await self.db.commit()\n        await cache_service.invalidate_domain("venue_ops_recommendations", request.organization_id, request.event_id)',
            "attachments",
        ),
        (
            'await self.db.commit()\n        await cache_service.invalidate_domain("venue_ops_recommendations", row.organization_id, row.event_id)',
            "request mutations",
        ),
    ):
        assert commit in source, invalidation


def test_venue_ops_cache_invalidation_is_tenant_event_scoped():
    source = (
        ROOT
        / "app/modules/technology_services/application/commands.py"
    ).read_text(encoding="utf-8")
    assert 'invalidate_domain("venue_ops_recommendations", organization_id, event_id)' in source
    assert 'invalidate_domain("venue_ops_recommendations", request.organization_id, request.event_id)' in source
    assert 'invalidate_domain("venue_ops_recommendations", row.organization_id, row.event_id)' in source
