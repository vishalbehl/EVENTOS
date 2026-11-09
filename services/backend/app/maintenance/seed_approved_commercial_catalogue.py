"""Apply approved catalogue/team defaults without advancing Alembic state.

This is an additive bridge for development databases that intentionally lag
the application migration head. Normal fresh environments receive the same
data from the catalogue migrations.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from sqlalchemy import text

from app.database import engine


MIGRATION_DIRECTORY = Path(__file__).resolve().parents[2] / "alembic" / "versions"
CATALOGUE_MIGRATION = MIGRATION_DIRECTORY / "20261104_3690_pdf_catalogue_and_default_teams.py"
CORRECTION_MIGRATION = MIGRATION_DIRECTORY / "20261106_3720_venue_single_event_and_technician_day.py"


def _load_migration(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Approved catalogue migration could not be loaded")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> None:
    module = _load_migration("approved_catalogue_3690", CATALOGUE_MIGRATION)
    correction = _load_migration("venue_catalogue_correction_3720", CORRECTION_MIGRATION)
    with engine.begin() as connection:
        required = connection.execute(text("""
            SELECT to_regclass('commerce.plans') IS NOT NULL
               AND to_regclass('commerce.plan_versions') IS NOT NULL
               AND to_regclass('organizer_access.organization_teams') IS NOT NULL
        """)).scalar_one()
        if not required:
            raise RuntimeError("The database predates the versioned commercial/team foundations")
        module.seed_approved_catalogue(connection)
        correction.ensure_catalogue_corrections(connection)
        connection.execute(text("""
            UPDATE platform.organizations
            SET is_platform_org = true,
                is_internal_unrestricted = true,
                onboarding_completed = true,
                updated_at = now()
            WHERE lower(slug) = 'eventos'
        """))
        module.backfill_default_teams(connection)
        module.backfill_commercial_accounts(connection)
        module.protect_default_roles(connection)
        offer_count = connection.execute(text("""
            SELECT count(*) FROM commerce.plans
            WHERE code = ANY(:codes)
        """), {"codes": [offer[0] for offer in module.OFFERS]}).scalar_one()
        team_count = connection.execute(text("""
            SELECT count(*) FROM organizer_access.organization_teams
            WHERE deleted_at IS NULL
              AND lower(name) = ANY(:names)
        """), {"names": [name.lower() for name, _ in module.DEFAULT_TEAMS]}).scalar_one()
        account_count = connection.execute(text("""
            SELECT count(*) FROM commerce.billing_accounts account
            JOIN platform.organizations organization
              ON organization.id = account.owner_organization_id
            WHERE organization.is_platform_org = false
              AND organization.organization_kind IN ('NORMAL', 'EMC')
        """)).scalar_one()
    print(
        f"Approved catalogue offers present: {offer_count}; "
        f"default teams present: {team_count}; customer commercial accounts present: {account_count}"
    )


if __name__ == "__main__":
    main()
