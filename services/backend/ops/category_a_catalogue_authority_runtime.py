"""Restricted-login catalogue writes against real canonical role administration."""
import asyncio
import json
from pathlib import Path
import re
import traceback
import uuid

from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings


async def run(fixture_path):
    fixture = json.loads(fixture_path.read_text())
    url = make_url(settings.DATABASE_URL_ASYNC)
    if (settings.is_production or url.host not in {"localhost", "127.0.0.1"}
            or url.database != fixture["database"] or url.username != fixture["login"]
            or not re.fullmatch(r"category_a_restore_20261021_[0-9a-f]{12}", url.database or "")
            or not re.fullmatch(r"category_a_checkpoint_[0-9a-f]{12}", url.username or "")
            or fixture_path.resolve().parent != (Path(__file__).parents[1] / "test-results").resolve()):
        raise RuntimeError("Only a newly provisioned restricted-login local clone is permitted")
    import app.models  # Register all relationship targets before the first ORM query.
    from app.database import AsyncSessionLocal, async_engine
    from app.core.database_security import inspect_database_security
    from app.core.tenant_context import TenantContextGuard
    from app.modules.identity.models.user import User
    from app.modules.platform.application.identity_commands import IdentityAdminCommandService
    from app.modules.platform.models.idempotency import IdempotencyRecord
    from app.modules.audit.models.audit_log import AuditLog, compute_audit_hash
    from app.modules.registration.application.category_commands import CategoryCommands, retire_global_category
    from app.modules.registration.application.template_commands import TemplateCommands, retire_global_template
    from app.modules.registration.application.aggregate_reconciliation import repair_aggregate_document
    from app.modules.registration.models.form_category import FormCategoryReconciliation
    from app.modules.registration.schemas.form_builder import FormCategoryCreate, FormTemplateCreate
    from app.modules.registration.schemas.catalogue_contracts import AggregateRepairRequest
    platform, actor_id, revoker_id = [uuid.UUID(fixture[key]) for key in ("platform", "actor", "revoker")]
    assert actor_id != revoker_id
    result = dict(status="FAILED", stage="runtime_preflight", database=url.database,
        actual_restricted_login=True, actual_identity_command=False, identity_command_count=0, cases=[],
        staging_acceptance="NOT_RUN", production_acceptance="NOT_RUN")
    tasks = []
    try:
        async with AsyncSessionLocal() as db:
            security = await inspect_database_security(db)
            assert security.runtime_role_is_safe and not security.missing_canary_policies
            assert await db.scalar(text("SELECT current_user")) == fixture["login"]
            result.update(runtime_role_is_safe=True, missing_canary_policies=[])

        async def change_role(db, next_role, key):
            async with TenantContextGuard.scoped(db, platform):
                operator = await db.get(User, revoker_id)
                version = await db.scalar(select(User.version).where(User.id == actor_id))
                changed = await IdentityAdminCommandService(db).update_platform_role(
                    user_id=actor_id, actor=operator, platform_role=next_role,
                    reason="Approved isolated catalogue runtime authority ordering",
                    expected=int(version), idempotency_key=key)
                result["actual_identity_command"] = True
                result["identity_command_count"] += 1
                return changed

        async def counts(db):
            async with TenantContextGuard.scoped(db, platform):
                receipts = await db.scalar(select(func.count()).select_from(IdempotencyRecord).where(
                    IdempotencyRecord.organization_id == platform, IdempotencyRecord.actor_id == actor_id))
                audits = list((await db.scalars(select(AuditLog).where(
                    AuditLog.organization_id == platform, AuditLog.actor_user_id == actor_id))).all())
                assert all(row.row_hash == compute_audit_hash(row) for row in audits)
                return int(receipts), len(audits)

        for operation in ("create", "template_retire", "category_retire", "repair"):
            for writer_first in (False, True):
                result["stage"] = f"{operation}_{'writer' if writer_first else 'revocation'}_first"
                case_key = uuid.uuid4().hex
                async with AsyncSessionLocal() as setup:
                    async with TenantContextGuard.scoped(setup, platform):
                        result["stage"] = f"{operation}_setup_categories"
                        operator = await setup.get(User, revoker_id)
                        categories = []
                        for index in range(2):
                            categories.append(await CategoryCommands.execute(setup, operation="create", actor=operator,
                                audience="PLATFORM", idempotency_key=f"runtime-category-{case_key}-{index}",
                                payload=FormCategoryCreate(name="Isolated runtime catalogue", slug=f"rt-{case_key}-{index}")))
                        templates = []
                        result["stage"] = f"{operation}_setup_templates"
                        for index in range(2):
                            templates.append(await TemplateCommands.execute(setup, operation="create", actor=operator,
                                audience="PLATFORM", idempotency_key=f"runtime-template-{case_key}-{index}",
                                payload=FormTemplateCreate(name="Runtime source" if index == 0 else "Runtime replacement",
                                    slug=f"rt-template-{case_key}-{index}", scope_type="GLOBAL", fields=[], settings={},
                                    category_key=categories[0].slug, category_id=categories[0].id)))
                        if operation == "repair":
                            setup.add(FormCategoryReconciliation(category_id=categories[0].id, category_version=1,
                                operation="TAXONOMY_VALIDATION", status="BLOCKED", actor_user_id=revoker_id,
                                reason="Explicit synthetic blocked category fixture"))
                            await setup.commit()

                async def mutate(db):
                    async with TenantContextGuard.scoped(db, platform):
                        actor = await db.get(User, actor_id)
                        assert actor.role == "super_admin"  # This label must not substitute for canonical authority.
                        key = f"runtime-writer-{case_key}"
                        if operation == "create":
                            return await TemplateCommands.execute(db, operation="create", actor=actor, audience="PLATFORM",
                                idempotency_key=key, payload=FormTemplateCreate(name="Ordered runtime write",
                                    slug=f"rt-written-{case_key}", scope_type="GLOBAL", fields=[], settings={},
                                    category_key=categories[0].slug, category_id=categories[0].id))
                        if operation == "repair":
                            return await repair_aggregate_document(db, resource_type="FORM_CATEGORY", resource_id=categories[0].id,
                                actor=actor, if_match='"1"', idempotency_key=key,
                                payload=AggregateRepairRequest(document={"name": "Reviewed runtime category", "slug": categories[0].slug,
                                    "description": None, "icon": None, "sort_order": 0}, reason="Approved isolated runtime reviewed repair"))
                        if operation == "template_retire":
                            return await retire_global_template(db, template_id=templates[0].id, replacement_template_id=templates[1].id,
                                actor=actor, if_match='"1"', idempotency_key=key, reason="Approved isolated runtime retirement")
                        return await retire_global_category(db, category_id=categories[0].id, replacement_category_id=categories[1].id,
                            actor=actor, if_match='"1"', idempotency_key=key, reason="Approved isolated runtime retirement")

                async with AsyncSessionLocal() as observer:
                    result["stage"] = f"{operation}_before_counts"
                    before = await counts(observer)
                async with AsyncSessionLocal() as outer, AsyncSessionLocal() as second:
                    connection = await outer.connection()
                    async with AsyncSession(bind=connection, expire_on_commit=False,
                            join_transaction_mode="create_savepoint") as first:
                        if writer_first:
                            result["stage"] = f"{operation}_hold_writer"
                            await mutate(first)
                            pid = await second.scalar(text("SELECT pg_backend_pid()"))
                            task = asyncio.create_task(change_role(second, "NONE", f"runtime-revoke-{case_key}"))
                        else:
                            result["stage"] = f"{operation}_hold_revocation"
                            await change_role(first, "NONE", f"runtime-revoke-{case_key}")
                            pid = await second.scalar(text("SELECT pg_backend_pid()"))
                            task = asyncio.create_task(mutate(second))
                        tasks.append(task)
                        async def blocked():
                            while not await first.scalar(text("SELECT cardinality(pg_blocking_pids(:pid))>0"), {"pid": pid}):
                                if task.done():
                                    task.result()
                                    raise AssertionError("Runtime competitor did not wait")
                                await asyncio.sleep(0.02)
                        await asyncio.wait_for(blocked(), 10)
                        result["stage"] = f"{operation}_commit_ordered_transaction"
                        await first.close()
                        await outer.commit()
                        if writer_first:
                            outcome = await asyncio.wait_for(task, 15)
                            assert outcome["platform_role"] is None
                        else:
                            try:
                                await asyncio.wait_for(task, 15)
                            except HTTPException as denied:
                                assert denied.status_code == 403
                            else:
                                raise AssertionError("Committed revocation allowed a runtime mutation")
                            await second.rollback()
                async with AsyncSessionLocal() as observer:
                    result["stage"] = f"{operation}_after_counts_and_replay"
                    try:
                        await mutate(observer)  # Same retry key must not replay after revocation.
                    except HTTPException as denied:
                        assert denied.status_code == 403
                    else:
                        raise AssertionError("Revoked runtime actor replayed a catalogue mutation")
                    await observer.rollback()
                    after = await counts(observer)
                    assert after == (before[0] + int(writer_first), before[1] + int(writer_first))
                    async with TenantContextGuard.scoped(observer, platform):
                        role_audit = await observer.scalar(select(AuditLog).where(
                            AuditLog.organization_id == platform, AuditLog.resource_id == actor_id,
                            AuditLog.action_type == "USER_PLATFORM_ROLE_CHANGED").order_by(AuditLog.occurred_at.desc()).limit(1))
                        assert role_audit and role_audit.actor_user_id == revoker_id and role_audit.new_state["platform_role"] is None
                        assert role_audit.row_hash == compute_audit_hash(role_audit)
                result["cases"].append(dict(operation=operation, writer_first=writer_first, outcome="PASSED",
                    committed_writer=int(writer_first), blocked_on_revision=True, later_replay_status=403,
                    receipt_and_audit_delta=int(writer_first), actual_role_audit_verified=True))
                async with AsyncSessionLocal() as restore:
                    await change_role(restore, "SUPER_ADMIN", f"runtime-restore-{case_key}")
        result.update(status="PASSED", stage="completed", default_platform_customer_flow="NOT_RUN", provider_io="NOT_RUN")
    except Exception as error:
        result["error_type"] = type(error).__name__
        root = Path(__file__).parents[1]
        result["project_frames"] = [dict(file=str(Path(frame.filename).relative_to(root)),
            line=frame.lineno, function=frame.name) for frame in traceback.extract_tb(error.__traceback__)
            if Path(frame.filename).is_relative_to(root)
            and ".venv" not in Path(frame.filename).relative_to(root).parts][-8:]
        result["sqlstate"] = getattr(getattr(error, "orig", None), "sqlstate", None)
        if isinstance(getattr(error, "detail", None), dict):
            result["denial_code"] = error.detail.get("code")
        diagnostic = getattr(getattr(error, "orig", None), "diag", None)
        if diagnostic:
            result["database_error"] = {key: getattr(diagnostic, key, None) for key in ("schema_name", "table_name", "constraint_name")}
    finally:
        for task in tasks:
            if not task.done():
                task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        await async_engine.dispose()
        with fixture_path.with_name(fixture_path.stem + "-runtime.json").open("x", encoding="utf-8") as output:
            json.dump(result, output, indent=2)
        print(json.dumps(dict(status=result["status"], stage=result["stage"])))
    return 0 if result["status"] == "PASSED" else 1
