"""Fresh local 3500 -> reviewed duplicate CLI -> 3510 rehearsal.

Never stamps, downgrades, edits applied history, or modifies an existing tenant.
Retains its uniquely named database quarantined; does not start applications.
"""
from datetime import datetime, timezone
import hashlib
import json
import os
import re
from pathlib import Path
import subprocess
import sys
import uuid

sys.path.insert(0, str(Path(__file__).parents[1]))
from sqlalchemy import MetaData, Table, create_engine, text
from sqlalchemy.engine import make_url
from app.config import settings
from ops.category_a_backup_restore_rehearsal import SOURCE, quarantine_database


def seed(connection, schema, name, values):
    """Insert explicit synthetic data using the actual historical columns.

    Python defaults only fill required columns absent from the fixture input;
    future columns are never added to the historical schema or INSERT.
    """
    from app.database import Base
    historical = Table(name, MetaData(), schema=schema, autoload_with=connection,
        resolve_fks=False)
    current = Base.metadata.tables[f"{schema}.{name}"]
    payload = dict(values)
    for column in historical.columns:
        if column.name in payload or column.nullable or column.server_default is not None:
            continue
        default = current.c[column.name].default if column.name in current.c else None
        if default is None:
            raise RuntimeError(f"Explicit synthetic value required: {schema}.{name}.{column.name}")
        payload[column.name] = default.arg(None) if default.is_callable else default.arg
    connection.execute(historical.insert().values(**payload))


def main():
    target = make_url(settings.DATABASE_URL_SYNC).set(database=SOURCE)
    if settings.is_production or target.host not in {"localhost", "127.0.0.1"}:
        raise RuntimeError("Only the named local rehearsal control database is permitted")
    root = Path(__file__).parents[1]
    run_id = uuid.uuid4().hex
    name = f"category_a_restore_{datetime.now(timezone.utc):%Y%m%d}_{run_id[:12]}"
    output = root / "test-results" / f"category-a-duplicate-cli-{run_id}.json"
    mapping_file = root / "test-results" / f"category-a-duplicate-mapping-{run_id}.json"
    result = dict(status="FAILED", run_id=run_id, database=name, environment="local_fresh_rehearsal",
        applied_history_rewritten=False, applications_workers_providers="NOT_STARTED",
        production_acceptance="NOT_RUN", checks=[])
    control, database, created = create_engine(target), None, False
    environment = dict(os.environ)
    url = target.set(database=name)
    environment.update(MIGRATION_DATABASE_URL_SYNC=url.render_as_string(hide_password=False),
        DATABASE_URL_SYNC=url.render_as_string(hide_password=False),
        DATABASE_URL_ASYNC=url.set(drivername="postgresql+asyncpg").render_as_string(hide_password=False))

    def command(arguments, *, expected=0, marker=None):
        child = subprocess.run([sys.executable, *arguments], cwd=root, env=environment,
            capture_output=True, text=True, timeout=240)
        combined = child.stdout + child.stderr
        if (child.returncode == 0) != (expected == 0) or marker and marker not in combined:
            # No raw exception/connection strings or child output in evidence.
            result["child_failure"] = {"returncode": child.returncode,
                "output_sha256": hashlib.sha256(combined.encode()).hexdigest()}
            lines = [line for line in combined.splitlines()
                if re.match(r"^[A-Za-z_.]+(?:Error|Exception):", line)]
            if lines:
                diagnostic = re.sub(r"[a-zA-Z][a-zA-Z0-9+.-]*://\S+", "[redacted-url]", lines[-1])
                if target.password:
                    diagnostic = diagnostic.replace(target.password, "[redacted]")
                result["child_failure"]["diagnostic"] = diagnostic[:500]
            raise RuntimeError("Rehearsal child command failed its expected outcome")
        return child

    def check(label):
        result["checks"].append(label)
        print(json.dumps({"stage": label}), flush=True)

    try:
        with control.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
            assert connection.scalar(text("SELECT rolsuper FROM pg_roles WHERE rolname=current_user"))
            assert connection.scalar(text("SELECT count(*) FROM pg_database WHERE datname=:name"), {"name": name}) == 0
            quote = connection.dialect.identifier_preparer.quote
            connection.execute(text(f"CREATE DATABASE {quote(name)} TEMPLATE template0"))
            created = True
        # The older seed migrations intentionally reproduce duplicate agenda
        # defaults. Use the existing data-preserving preflight, not a migration
        # edit/stamp or destructive seed deletion. Canonical choices below are
        # fixture decisions ONLY: this database was just created empty by us.
        command(["-m", "alembic", "upgrade", "20260909_1400"])
        agenda_cli = ["ops/prepare_agenda_global_uniqueness.py", "--expected-database", name]
        agenda = json.loads(command(agenda_cli).stdout)
        assert agenda["status"] == "DRY_RUN" and len(agenda["duplicates"]) <= 100
        fixture_decisions = []
        for group in agenda["duplicates"]:
            candidates = group["candidates"]
            assert len(candidates) >= 2 and all(row["is_active"] for row in candidates)
            # All candidates are new migration-seed fixtures, not retained data.
            fixture_decisions.extend(dict(table=group["table"], source_id=row["id"],
                replacement_id=candidates[0]["id"]) for row in candidates[1:])
        agenda_mapping = root / "test-results" / f"category-a-fresh-agenda-mapping-{run_id}.json"
        with agenda_mapping.open("x", encoding="utf-8") as handle:
            json.dump(fixture_decisions, handle)
        prepared = json.loads(command([*agenda_cli, "--mapping-file", str(agenda_mapping),
            "--apply", "--approval-reference", f"isolated-new-seed-fixture-{run_id}"]).stdout)
        assert prepared["rows_deleted"] == 0 and not prepared["migration_history_modified"]
        result["fresh_agenda_fixture_decisions"] = len(fixture_decisions)
        result["agenda_mapping_sha256"] = hashlib.sha256(agenda_mapping.read_bytes()).hexdigest()
        check("fresh_seed_preflight_archives_only_explicit_new_fixture_ids")
        command(["-m", "alembic", "upgrade", "20261009_3500"])
        check("fresh_history_traversed_to_3500")
        database = create_engine(url)
        import app.models
        platform, customer, actor, event = [uuid.uuid4() for _ in range(4)]
        category_source, category_target, template_source, template_target = [uuid.uuid4() for _ in range(4)]
        registration, abstract = uuid.uuid4(), uuid.uuid4()
        with database.begin() as connection:
            assert connection.scalar(text("SELECT version_num FROM public.alembic_version")) == "20261009_3500"
            for org_id, is_platform in [(platform, True), (customer, False)]:
                seed(connection, "platform", "organizations", dict(id=org_id,
                    name="Synthetic duplicate CLI rehearsal", slug=f"duplicate-cli-{org_id.hex}",
                    is_platform_org=is_platform, is_active=True))
            seed(connection, "identity", "users", dict(id=actor, organization_id=platform,
                email=f"duplicate-cli-{run_id}@example.test", first_name="Synthetic", last_name="Operator",
                role="super_admin", platform_role="SUPER_ADMIN", is_active=True))
            seed(connection, "organizer_access", "organization_access_revisions", dict(organization_id=platform))
            workspace = uuid.uuid4()
            seed(connection, "organizer_access", "operational_workspaces", dict(id=workspace,
                organization_id=customer, name="Synthetic maintenance workspace", is_default=True))
            seed(connection, "events", "events", dict(id=event, organization_id=customer,
                created_by=actor, operational_workspace_id=workspace,
                name="Synthetic retained event", short_code=run_id[:8],
                start_date=datetime(2026, 10, 20).date(), end_date=datetime(2026, 10, 21).date(), status="draft"))
            for category_id in (category_source, category_target):
                seed(connection, "design", "form_categories", dict(id=category_id, name="Reviewed duplicate category",
                    slug=f"duplicate-category-{run_id}", is_system=True, is_active=True))
            for template_id in (template_source, template_target):
                seed(connection, "design", "form_templates", dict(id=template_id,
                    name="Reviewed duplicate template", slug=f"duplicate-template-{run_id}", category_key="registration",
                    category_id=category_source, scope_type="GLOBAL", fields=[], settings={}, is_active=True))
            seed(connection, "registration", "registration_forms", dict(id=registration, event_id=event,
                template_id=template_source, category_id=category_source, fields=[], settings={}))
            # Match operational purpose: abstract uses a separate approved pair.
            abstract_source, abstract_target = uuid.uuid4(), uuid.uuid4()
            for template_id in (abstract_source, abstract_target):
                seed(connection, "design", "form_templates", dict(id=template_id,
                    name="Reviewed abstract duplicate", slug=f"duplicate-abstract-{run_id}", category_key="abstract",
                    category_id=category_source, scope_type="GLOBAL", fields=[], settings={}, is_active=True))
            seed(connection, "abstract", "abstract_forms", dict(id=abstract, organization_id=customer,
                event_id=event, title="Retained synthetic abstract", schema={"fields": [],
                    "settings": {"max_words": 300}, "template_id": str(abstract_source)}))
        mapping = {"categories": {str(category_source): str(category_target)},
            "templates": {str(template_source): str(template_target), str(abstract_source): str(abstract_target)}}
        with mapping_file.open("x", encoding="utf-8") as handle:
            json.dump(mapping, handle)
        result["mapping_sha256"] = hashlib.sha256(mapping_file.read_bytes()).hexdigest()

        def snapshot():
            with database.connect() as connection:
                rows = {}
                for table in ("design.form_templates", "design.form_categories", "registration.registration_forms",
                        "abstract.abstract_forms", "design.form_template_reconciliations", "design.form_category_reconciliations"):
                    rows[table] = connection.execute(text(f"SELECT to_jsonb(t)::text FROM {table} t ORDER BY id")).scalars().all()
                return hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest()

        original = snapshot()
        command(["-m", "alembic", "upgrade", "20261009_3510"], expected=1,
            marker="CATALOGUE_RECONCILIATION_REQUIRED")
        assert snapshot() == original
        check("3510_rejects_unreviewed_duplicates_without_data_changes")
        cli = ["scripts/reconcile_catalogue_duplicates.py", "--mapping", str(mapping_file),
            "--actor-user-id", str(actor), "--reason", "Reviewed synthetic migration acceptance mapping"]
        dry = json.loads(command(cli).stdout)
        assert dry["mode"] == "DRY_RUN" and not dry["remaining_conflicts"]
        assert snapshot() == original
        check("full_cli_dry_run_rolls_back_all_reference_and_evidence_changes")
        command([*cli, "--apply", "--max-reference-updates", "5"], expected=1,
            marker="reference-update bound")
        assert snapshot() == original
        check("full_cli_budget_failure_rolls_back_partial_mapping")
        applied = json.loads(command([*cli, "--apply"]).stdout)
        assert applied["mode"] == "APPLY" and not applied["remaining_conflicts"]
        with database.connect() as connection:
            form = connection.execute(text("SELECT template_id,category_id,version FROM registration.registration_forms WHERE id=:id"), {"id": registration}).one()
            assert form.template_id == template_target and form.category_id == category_target and form.version == 3
            form = connection.execute(text("SELECT schema,version FROM abstract.abstract_forms WHERE id=:id"), {"id": abstract}).one()
            assert form.schema == {"fields": [], "settings": {"max_words": 300}, "template_id": str(abstract_target)} and form.version == 2
            assert connection.scalar(text("SELECT count(*) FROM design.form_template_reconciliations WHERE operation='PRECONSTRAINT_REASSIGN'")) == 2
            assert connection.scalar(text("SELECT count(*) FROM design.form_category_reconciliations WHERE operation='PRECONSTRAINT_REASSIGN'")) == 1
        check("full_cli_applies_category_registration_and_abstract_references_atomically")
        committed = snapshot()
        command(["-m", "alembic", "upgrade", "20261009_3510"])
        assert snapshot() == committed
        check("3510_enforces_uniqueness_after_reviewed_reconciliation")
        command(cli, expected=1, marker="Run only at revision 20261009_3500")
        assert snapshot() == committed
        check("historical_cli_rejects_post_enforcement_revision")
        result.update(status="PASSED", migration_revision="20261009_3510",
            reference_updates=applied["reference_updates"])
    except Exception as error:
        result["error_type"] = type(error).__name__
        diagnostic = getattr(getattr(error, "orig", None), "diag", None)
        if diagnostic is not None:
            result["database_error"] = {key: getattr(diagnostic, key, None) for key in
                ("message_primary", "schema_name", "table_name", "column_name", "constraint_name")}
        if str(error).startswith("Explicit synthetic value required:"):
            result["fixture_requirement"] = str(error)
    finally:
        if database is not None:
            database.dispose()
        if created:
            try:
                quarantine_database(control, name)
                result["database_quarantined"] = True
            except Exception as error:
                result.update(status="FAILED", quarantine_error_type=type(error).__name__)
        control.dispose()
        result["completed_at"] = datetime.now(timezone.utc).isoformat()
        with output.open("x", encoding="utf-8") as handle:
            json.dump(result, handle, indent=2)
        print(json.dumps({"status": result["status"], "evidence": output.name,
            "database_quarantined": result.get("database_quarantined", False)}), flush=True)
    return 0 if result["status"] == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
