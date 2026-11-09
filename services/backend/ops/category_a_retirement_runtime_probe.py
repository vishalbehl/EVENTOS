"""Isolated local real-role retirement proof; failed transitions roll back.

Uses only generated fixtures in the approved synthetic customer cohort and its
dedicated test platform operator. No default platform/customer data is modified.
"""
from __future__ import annotations
import argparse
import asyncio
from datetime import date
import json
from pathlib import Path
import secrets
import sys
import uuid

sys.path.insert(0, str(Path(__file__).parents[1]))
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
from app.config import settings
from bootstrap_cloud_database import upsert_login


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--kind", choices=("template", "category"), required=True)
    parser.add_argument("--reference", choices=("registration", "abstract"), default="registration")
    args = parser.parse_args()
    if args.kind == "category" and args.reference == "abstract":
        parser.error("Abstract taxonomy does not use a direct category reference")
    if settings.is_production:
        raise RuntimeError("Local rehearsal is forbidden in production")
    target = make_url(settings.DATABASE_URL_SYNC).set(database="category_a_rehearsal_20261015")
    if target.host not in {"localhost", "127.0.0.1"}:
        raise RuntimeError("Only the explicit isolated local database is permitted")
    cohort_file = Path(__file__).parents[3] / "docs/category-a/plans-status-evidence/2026-10-15/rehearsal-cohort.json"
    cohort = json.loads(cohort_file.read_text(encoding="utf-8"))
    owner = uuid.UUID(cohort[0]["organization_id"])
    actor_id = uuid.UUID("cc935543-0b19-4495-a955-8485c6890e13")
    engine = create_engine(target)
    secret = secrets.token_urlsafe(40)
    raw = engine.raw_connection()
    try:
        with raw.cursor() as cursor:
            upsert_login(cursor, "category_a_rehearsal_runtime_20261015", secret, "event_runtime")
        raw.commit()
    finally:
        raw.close()
    with engine.connect() as connection:
        platform_id = connection.execute(text("""SELECT u.organization_id FROM identity.users u
            JOIN platform.organizations o ON o.id=u.organization_id
            WHERE u.id=:actor AND u.is_active AND o.is_platform_org AND o.is_active"""),
            {"actor": actor_id}).scalar_one()
        workspace_id = connection.execute(text("""SELECT w.id FROM organizer_access.operational_workspaces w
            JOIN platform.organizations o ON o.id=w.organization_id
            WHERE w.organization_id=:owner AND NOT o.is_platform_org AND w.status='ACTIVE'
            ORDER BY w.id LIMIT 1"""), {"owner": owner}).scalar_one()
    settings.DATABASE_URL_ASYNC = target.set(drivername="postgresql+asyncpg",
        username="category_a_rehearsal_runtime_20261015", password=secret).render_as_string(hide_password=False)
    import app.models
    from app.modules.events.models.event import Event
    from app.modules.registration.models.form_category import FormCategory
    from app.modules.registration.models.form_template import FormTemplate
    from app.modules.registration.models.registration_form_config import RegistrationFormConfig
    from app.modules.abstracts.models import AbstractForm
    run_id = uuid.uuid4().hex
    with Session(engine, expire_on_commit=False) as db:
        event = Event(organization_id=owner, operational_workspace_id=workspace_id,
            name="Category A retirement runtime proof", short_code=f"RET{run_id[:10]}",
            start_date=date.today(), end_date=date.today(), status="draft")
        db.add(event)
        db.flush()
        if args.kind == "category":
            source = FormCategory(name="Retirement source probe", slug=f"probe-source-{run_id}", is_system=True)
            replacement = FormCategory(name="Retirement replacement probe", slug=f"probe-destination-{run_id}", is_system=True)
        else:
            category_key = "abstract" if args.reference == "abstract" else "registration"
            source = FormTemplate(name="Retirement source probe", slug=f"probe-source-{run_id}",
                category_key=category_key, scope_type="GLOBAL", fields=[], settings={})
            replacement = FormTemplate(name="Retirement replacement probe", slug=f"probe-destination-{run_id}",
                category_key=category_key, scope_type="GLOBAL", fields=[], settings={})
        db.add_all([source, replacement])
        db.flush()
        category_template = None
        if args.kind == "category":
            category_template = FormTemplate(name="Live typed category reference", slug=f"typed-{run_id}",
                category_id=source.id, category_key="registration", scope_type="GLOBAL", fields=[], settings={})
            db.add(category_template)
            db.flush()
        form = (AbstractForm(organization_id=owner, event_id=event.id,
                    schema={"template_id": str(source.id), "fields": []}, is_active=True)
                if args.reference == "abstract" else RegistrationFormConfig(event_id=event.id,
                    fields=[], settings={}, is_live=False, **{f"{args.kind}_id": source.id}))
        db.add(form)
        if category_template is not None:
            form.template_id = category_template.id
        db.commit()
        ids = dict(event_id=event.id, form_id=form.id, source_id=source.id, replacement_id=replacement.id)
        if category_template is not None:
            ids["typed_template_id"] = category_template.id
    try:
        result = asyncio.run(probe(args.kind, args.reference, owner, platform_id, actor_id, ids))
    finally:
        # Generated fixture IDs only; failed business transition already rolled back.
        with engine.begin() as connection:
            form_table = "abstract.abstract_forms" if args.reference == "abstract" else "registration.registration_forms"
            connection.execute(text(f"DELETE FROM {form_table} WHERE id=:id"), {"id": ids["form_id"]})
            if "typed_template_id" in ids:
                connection.execute(text("DELETE FROM design.form_templates WHERE id=:id"),
                    {"id": ids["typed_template_id"]})
            table = "design.form_categories" if args.kind == "category" else "design.form_templates"
            connection.execute(text(f"DELETE FROM {table} WHERE id IN (:source,:replacement)"),
                {"source": ids["source_id"], "replacement": ids["replacement_id"]})
            connection.execute(text("DELETE FROM events.events WHERE id=:id"), {"id": ids["event_id"]})
            connection.execute(text("DELETE FROM commerce.capability_revisions WHERE scope_type='EVENT' AND scope_id=:id"),
                {"id": ids["event_id"]})
        engine.dispose()
    print(json.dumps(result, indent=2))
    return 0 if result["status"] == "PASSED" else 2


async def probe(kind, reference, owner, platform_id, actor_id, ids):
    from sqlalchemy.ext.asyncio import AsyncSession
    from app.database import async_engine
    from app.core.tenant_context import TenantContextGuard
    from app.modules.identity.models.user import User
    from app.modules.registration.application.category_commands import retire_global_category
    from app.modules.registration.application.template_commands import retire_global_template
    from app.modules.registration.models.registration_form_config import RegistrationFormConfig
    from app.modules.abstracts.models import AbstractForm
    try:
        async with async_engine.connect() as connection:
            transaction = await connection.begin()
            async with AsyncSession(bind=connection, expire_on_commit=False,
                join_transaction_mode="create_savepoint") as db:
                try:
                    async with TenantContextGuard.scoped(db, platform_id):
                        actor = await db.get(User, actor_id)
                        command = retire_global_category if kind == "category" else retire_global_template
                        result = await command(db, actor=actor, if_match='"1"',
                            idempotency_key=f"runtime-retire-{uuid.uuid4()}",
                            reason="Approved isolated real-role retirement verification",
                            **{f"{kind}_id": ids["source_id"], f"replacement_{kind}_id": ids["replacement_id"]})
                    async with TenantContextGuard.scoped(db, owner):
                        model = AbstractForm if reference == "abstract" else RegistrationFormConfig
                        form = await db.scalar(select(model).where(model.id == ids["form_id"]))
                        actual_reference = (uuid.UUID(form.schema["template_id"]) if reference == "abstract"
                            else getattr(form, f"{kind}_id"))
                        passed = actual_reference == ids["replacement_id"] and form.version == 2
                        binding_usable = None
                        if "typed_template_id" in ids:
                            from app.modules.registration.application.aggregate_reference_validation import aggregate_reference_issues
                            from app.modules.registration.models.form_template import FormTemplate
                            typed = await db.scalar(select(FormTemplate).where(
                                FormTemplate.id == ids["typed_template_id"])
                                .execution_options(shared_form_catalogue=True))
                            issues = await aggregate_reference_issues(db, rows=[form], organization_id=owner,
                                resource_type="REGISTRATION_FORM")
                            binding_usable = (typed is not None and not issues[form.id] and typed.category_key == "registration"
                                and typed.category_id == ids["replacement_id"])
                            passed = passed and binding_usable
                    return {"status": "PASSED" if passed else "FAILED_REFERENCE_REASSIGNMENT",
                        "kind": kind, "reference": reference, "reported_reassigned": result["reassigned"],
                        "customer_reference_reassigned": passed,
                        "operational_binding_usable": binding_usable,
                        "business_transition_rolled_back": True}
                finally:
                    await db.rollback()
                    await transaction.rollback()
    finally:
        await async_engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
