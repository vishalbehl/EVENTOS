"""Actual restricted-login long-key transitions on the named disposable clone."""
import uuid

from sqlalchemy import select, text

from app.core.tenant_context import TenantContextGuard
from app.modules.audit.models.audit_log import AuditLog, compute_audit_hash
from app.modules.identity.models.user import User
from app.modules.platform.models.idempotency import IdempotencyRecord
from app.modules.registration.application.aggregate_reconciliation import repair_aggregate_document
from app.modules.registration.application.category_commands import retire_global_category
from app.modules.registration.application.template_commands import repair_catalogue_document
from app.modules.registration.models.form_template import FormTemplate, FormTemplateReconciliation
from app.modules.registration.schemas.catalogue_contracts import AggregateRepairRequest, CatalogueRepairRequest


async def exercise(db, fixture):
    values = fixture["long_category_key"]
    platform, owner, actor_id = [uuid.UUID(fixture[name]) for name in ("platform", "owner", "actor")]
    identities = [uuid.UUID(value) for value in values["templates"]]
    assert await db.scalar(text("SELECT atttypmod=104 FROM pg_attribute WHERE "
        "attrelid='design.form_templates'::regclass AND attname='category_key' AND NOT attisdropped"))
    history_table = FormTemplateReconciliation.__table__
    async with TenantContextGuard.scoped(db, owner):
        previous = dict((await db.execute(select(FormTemplate.id, FormTemplate.version).where(
            FormTemplate.id.in_(identities)).execution_options(shared_form_catalogue=True))).all())
        assert set(previous) == set(identities)
    # Global reconciliation history is platform-only, even though global
    # template summaries are customer-readable. Snapshot exactly these fixture
    # IDs in the explicit platform scope rather than assuming customer RLS can
    # see all five histories.
    async with TenantContextGuard.scoped(db, platform):
        history_rows = (await db.execute(select(history_table).where(
            history_table.c.template_id.in_(identities)))).all()
        assert {row.template_id for row in history_rows} == set(identities)
        old_history = {row.id: tuple(row) for row in history_rows}
    keys = [f"long-runtime-{uuid.uuid4()}" for _ in range(4)]
    results = []
    async with TenantContextGuard.scoped(db, platform):
        actor = await db.get(User, actor_id)
        for index, (category_id, slug) in enumerate(((values["owned_category"], values["owned_slug"]),
                (values["global_category"], values["global_slug"]))):
            args = dict(resource_type="FORM_CATEGORY", resource_id=uuid.UUID(category_id), actor=actor,
                payload=AggregateRepairRequest(document={"name": "Reviewed long category runtime", "slug": slug,
                    "description": None, "icon": "ClipboardList", "sort_order": 0},
                    reason="Reviewed untruncated retained taxonomy fixture transition"),
                if_match='"1"', idempotency_key=keys[index])
            result = await repair_aggregate_document(db, **args)
            assert result["status"] == "REPAIRED" and result["version"] == 2
            assert await repair_aggregate_document(db, **args) == result
            results.append(result)
        args = dict(category_id=uuid.UUID(values["retire_source"]),
            replacement_category_id=uuid.UUID(values["target_category"]), actor=actor,
            if_match='"1"', idempotency_key=keys[2],
            reason="Retire to the complete approved long category identity")
        result = await retire_global_category(db, **args)
        assert result["status"] == "RETIRED"
        assert await retire_global_category(db, **args) == result
        results.append(result)
        args = dict(template_id=identities[4], actor=actor, if_match='"1"', idempotency_key=keys[3],
            payload=CatalogueRepairRequest(document={"fields": [], "settings": {}},
                replacement_category_id=uuid.UUID(values["target_category"]),
                reason="Reviewed full-length template reference fixture repair"))
        result = await repair_catalogue_document(db, **args)
        assert result["status"] == "REPAIRED" and result["version"] == 2
        assert await repair_catalogue_document(db, **args) == result
        results.append(result)
        receipts = list((await db.scalars(select(IdempotencyRecord).where(
            IdempotencyRecord.idempotency_key.in_(keys)))).all())
        assert len(receipts) == 4 and all(row.status == "COMPLETED" for row in receipts)
        receipt_ids = [row.id for row in receipts]
    async with TenantContextGuard.scoped(db, owner):
        rows = {row.id: row for row in (await db.scalars(select(FormTemplate).where(
            FormTemplate.id.in_(identities)).execution_options(shared_form_catalogue=True, populate_existing=True))).all()}
        expected = [values["owned_slug"], values["global_slug"], values["target_slug"], "registration", values["target_slug"]]
        for index, identity in enumerate(identities):
            assert rows[identity].category_key == expected[index]
            assert rows[identity].version == previous[identity] + 1
    async with TenantContextGuard.scoped(db, platform):
        retained = {row.id: tuple(row) for row in (await db.execute(select(history_table).where(
            history_table.c.id.in_(old_history)))).all()}
        assert retained == old_history
    audits = []
    for context in (platform, owner):
        async with TenantContextGuard.scoped(db, context):
            audits.extend((await db.scalars(select(AuditLog).where(AuditLog.correlation_id.in_(receipt_ids)))).all())
    assert len(audits) == 4 and {row.correlation_id for row in audits} == set(receipt_ids)
    assert all(row.row_hash == compute_audit_hash(row) for row in audits)
    assert sorted(row.action_type for row in audits) == sorted([
        "CATALOGUE_AGGREGATE_EXPLICIT_REPAIR", "CATALOGUE_AGGREGATE_EXPLICIT_REPAIR",
        "FORM_CATEGORY_GLOBAL_RETIRE", "FORM_TEMPLATE_EXPLICIT_REPAIR"])
    return dict(long_key_transition_commands=len(results), actual_key_lengths=[len(value) for value in expected],
        replay_audit_count=len(audits), mandatory_receipts=len(receipts), historical_evidence_unchanged=True,
        operational_purpose_preserved=True, actual_column_limit=100)
