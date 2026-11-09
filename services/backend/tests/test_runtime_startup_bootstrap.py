"""Runtime startup validates persisted state without silently seeding defaults."""
from contextlib import asynccontextmanager

import pytest

from app.config import Settings, settings
from app.modules.billing.services.capability_service import CapabilityService


def test_development_bootstrap_defaults_off_and_is_forbidden_in_production():
    configured = Settings(DATABASE_URL_SYNC="postgresql://localhost/startup_fixture", _env_file=None)
    assert configured.ENABLE_DEVELOPMENT_BOOTSTRAP is False
    production = configured.model_copy(update={"environment": "production", "ENABLE_DEVELOPMENT_BOOTSTRAP": True})
    with pytest.raises(ValueError, match="ENABLE_DEVELOPMENT_BOOTSTRAP is forbidden in production"):
        production.validate_production_security()


@pytest.mark.asyncio
async def test_runtime_lifespan_never_invokes_legacy_default_seeders(db, monkeypatch):
    import app.database as database
    import app.main as main

    async def forbidden(*args, **kwargs):
        pytest.fail("Runtime startup invoked a legacy default/DDL seeder")

    for name in ("ensure_admin_user", "ensure_rbac_defaults", "ensure_system_template_defaults",
                 "ensure_agenda_rooms_schema", "ensure_agenda_types_defaults"):
        monkeypatch.setattr(main, name, forbidden)
    monkeypatch.setattr(CapabilityService, "sync_catalogue", forbidden)
    monkeypatch.setattr(settings, "environment", "development")
    monkeypatch.setattr(settings, "ENABLE_DEVELOPMENT_BOOTSTRAP", False)
    # Separate actual-role probes verify DB privilege enforcement. This test
    # deliberately uses the administrative metadata fixture for startup reads.
    monkeypatch.setattr(settings, "REQUIRE_RLS_SAFE_RUNTIME_ROLE", False)

    @asynccontextmanager
    async def sessions():
        yield db

    monkeypatch.setattr(database, "AsyncSessionLocal", sessions)
    async with main.lifespan(main.app):
        assert settings.ENABLE_DEVELOPMENT_BOOTSTRAP is False


@pytest.mark.asyncio
async def test_runtime_catalogue_validation_is_read_only_and_rejects_unknown_active_keys(db):
    from sqlalchemy import select
    from app.modules.platform.models.feature import FeatureCatalog
    row = FeatureCatalog(key="FEAT_STARTUP_UNREGISTERED_FIXTURE", name="Unknown startup fixture",
        is_active=True)
    db.add(row)
    await db.flush()
    unknown = await CapabilityService.validate_existing_catalogue(db)
    assert "FEAT_STARTUP_UNREGISTERED_FIXTURE" in unknown
    assert row in db.identity_map.values()
    assert not db.new and not db.dirty and not db.deleted
    assert await db.scalar(select(FeatureCatalog.key).where(FeatureCatalog.id == row.id)) == row.key
