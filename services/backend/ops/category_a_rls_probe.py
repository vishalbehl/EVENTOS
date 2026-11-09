"""Local migration-policy probe with a temporary non-owner role; always rolled back.

This tests policy behaviour, NOT the deployment's actual runtime credentials.
Requires an administrative local rehearsal connection and two existing workspaces.
"""
from pathlib import Path
import json
import sys
import uuid

sys.path.insert(0, str(Path(__file__).parents[1]))
from sqlalchemy import create_engine, text
from app.config import settings


def run():
    if settings.environment == "production":
        raise RuntimeError("Temporary-role probe is forbidden in production")
    engine = create_engine(settings.DATABASE_URL_SYNC)
    role = "category_a_probe_" + uuid.uuid4().hex
    result = {"environment": settings.environment, "actual_runtime_role_certified": False, "checks": {}}
    try:
        with engine.connect() as connection:
            transaction = connection.begin()
            try:
                rows = connection.execute(text("SELECT DISTINCT w.organization_id FROM organizer_access.operational_workspaces w JOIN platform.organizations o ON o.id = w.organization_id WHERE NOT o.is_platform_org ORDER BY w.organization_id LIMIT 2")).scalars().all()
                if len(rows) != 2:
                    raise RuntimeError("Two rehearsed organisations are required")
                platform_organization_id = connection.execute(text("""
                    SELECT id FROM platform.organizations
                     WHERE is_platform_org IS TRUE AND is_active IS TRUE
                       AND suspended_at IS NULL AND archived_at IS NULL
                     ORDER BY id LIMIT 1
                """)).scalar_one_or_none()
                if platform_organization_id is None:
                    raise RuntimeError("An active platform organisation is required")
                reconciliation_ids = [uuid.uuid4(), uuid.uuid4()]
                run_id = uuid.uuid4()
                for reconciliation_id, organization_id in zip(reconciliation_ids, rows):
                    connection.execute(text(
                        "SELECT set_config('app.current_organization_id', :org, true)"),
                        {"org": str(organization_id)})
                    connection.execute(text("""
                        INSERT INTO design.catalogue_document_reconciliations
                            (id, organization_id, resource_type, resource_id,
                             resource_version, operation, status, details)
                        VALUES (:id, :organization_id, 'FORM_CATEGORY', :resource_id,
                                1, 'DOCUMENT_VALIDATION', 'VALID', '{}'::jsonb)
                    """), {"id": reconciliation_id, "organization_id": organization_id,
                            "resource_id": uuid.uuid4()})
                connection.execute(text(
                    "SELECT set_config('app.current_organization_id', :org, true)"),
                    {"org": str(platform_organization_id)})
                connection.execute(text("""
                    INSERT INTO design.catalogue_reconciliation_runs
                        (id, organization_id, reason, status, dispatch_attempts)
                    VALUES (:id, :organization_id, 'RLS rollback-only probe', 'PENDING', 0)
                """), {"id": run_id, "organization_id": platform_organization_id})
                # Identifier contains only this generated fixed prefix and UUID hex.
                connection.execute(text(f"CREATE ROLE {role} NOLOGIN NOSUPERUSER NOBYPASSRLS"))
                connection.execute(text(f"GRANT USAGE ON SCHEMA organizer_access TO {role}"))
                connection.execute(text(f"GRANT SELECT, INSERT ON organizer_access.operational_workspaces TO {role}"))
                connection.execute(text(f"GRANT USAGE ON SCHEMA design, platform TO {role}"))
                connection.execute(text(f"GRANT SELECT ON platform.organizations TO {role}"))
                connection.execute(text(f"GRANT SELECT, INSERT ON design.catalogue_document_reconciliations TO {role}"))
                connection.execute(text(f"GRANT SELECT, INSERT, UPDATE ON design.catalogue_reconciliation_runs TO {role}"))
                connection.execute(text(f"SET LOCAL ROLE {role}"))
                connection.execute(text("SELECT set_config('app.current_organization_id', '', true)"))
                assert connection.execute(text("SELECT count(*) FROM organizer_access.operational_workspaces")).scalar_one() == 0
                result["checks"]["missing_context_denied"] = True
                assert connection.execute(text("""
                    SELECT count(*) FROM design.catalogue_document_reconciliations
                     WHERE id = ANY(:ids)
                """), {"ids": reconciliation_ids}).scalar_one() == 0
                assert connection.execute(text("""
                    SELECT count(*) FROM design.catalogue_reconciliation_runs WHERE id=:id
                """), {"id": run_id}).scalar_one() == 0
                result["checks"]["reconciliation_missing_context_denied"] = True
                connection.execute(text("SELECT set_config('app.current_organization_id', :org, true)"), {"org": str(rows[0])})
                visible = connection.execute(text("SELECT DISTINCT organization_id FROM organizer_access.operational_workspaces")).scalars().all()
                assert visible == [rows[0]]
                result["checks"]["foreign_rows_hidden"] = True
                visible_evidence = connection.execute(text("""
                    SELECT organization_id FROM design.catalogue_document_reconciliations
                     WHERE id = ANY(:ids) ORDER BY organization_id
                """), {"ids": reconciliation_ids}).scalars().all()
                assert visible_evidence == [rows[0]]
                assert connection.execute(text("""
                    SELECT count(*) FROM design.catalogue_reconciliation_runs WHERE id=:id
                """), {"id": run_id}).scalar_one() == 0
                result["checks"]["reconciliation_foreign_rows_hidden"] = True
                savepoint = connection.begin_nested()
                try:
                    connection.execute(text("INSERT INTO organizer_access.operational_workspaces(id, organization_id, name) VALUES (:id, :org, 'forbidden probe')"), {"id": uuid.uuid4(), "org": rows[1]})
                except Exception as error:
                    if getattr(error.orig, "pgcode", None) != "42501":
                        raise
                    result["checks"]["foreign_write_denied"] = True
                else:
                    raise AssertionError("Cross-tenant write was allowed")
                finally:
                    savepoint.rollback()
                savepoint = connection.begin_nested()
                try:
                    connection.execute(text("""
                        INSERT INTO design.catalogue_document_reconciliations
                            (id, organization_id, resource_type, resource_id,
                             resource_version, operation, status, details)
                        VALUES (:id, :organization_id, 'FORM_CATEGORY', :resource_id,
                                1, 'DOCUMENT_VALIDATION', 'VALID', '{}'::jsonb)
                    """), {"id": uuid.uuid4(), "organization_id": rows[1],
                            "resource_id": uuid.uuid4()})
                except Exception as error:
                    if getattr(error.orig, "pgcode", None) != "42501":
                        raise
                    result["checks"]["reconciliation_foreign_write_denied"] = True
                else:
                    raise AssertionError("Cross-tenant reconciliation write was allowed")
                finally:
                    savepoint.rollback()
                connection.execute(text("SELECT set_config('app.current_organization_id', :org, true)"),
                    {"org": str(platform_organization_id)})
                assert connection.execute(text("""
                    SELECT count(*) FROM design.catalogue_document_reconciliations
                     WHERE id = ANY(:ids)
                """), {"ids": reconciliation_ids}).scalar_one() == 2
                assert connection.execute(text("""
                    SELECT count(*) FROM design.catalogue_reconciliation_runs WHERE id=:id
                """), {"id": run_id}).scalar_one() == 1
                result["checks"]["platform_reconciliation_projection_visible"] = True
            finally:
                transaction.rollback()  # Also removes the temporary role/grants.
        with engine.connect() as connection:
            assert not connection.execute(text("SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = :role)"), {"role": role}).scalar_one()
            result["checks"]["probe_role_removed"] = True
            assert connection.execute(text("SELECT nullif(current_setting('app.current_organization_id', true), '')")).scalar_one() is None
            result["checks"]["transaction_context_reset"] = True
    finally:
        engine.dispose()
    return result


if __name__ == "__main__":
    print(json.dumps(run(), indent=2))
