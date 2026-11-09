"""Pre-3510 maintenance cannot mistake a duplicate slug for equivalent scope."""
import uuid

import pytest
from sqlalchemy import select

from scripts.reconcile_catalogue_duplicates import _reconcile_template
from scripts.reconcile_catalogue_duplicates import _reconcile_category
from app.modules.registration.models.form_template import FormTemplate, FormTemplateReconciliation
from app.modules.registration.models.registration_form_config import RegistrationFormConfig
from app.modules.registration.models.form_category import FormCategory


@pytest.mark.asyncio
@pytest.mark.parametrize("case", [
    "purpose", "scope", "event", "conflicting_markers", "missing_markers",
    "malformed_marker", "foreign_event_owner", "retired_parent", "owned_parent_for_global",
    "valid_global", "valid_event",
])
async def test_duplicate_mapping_preserves_operational_identity(db, event, organizer, case):
    owner, event_id = event.organization_id, event.id
    slug = f"duplicate-purpose-{uuid.uuid4().hex}"
    source_scope = "GLOBAL" if case in {"purpose", "valid_global", "owned_parent_for_global"} else "EVENT"
    source_owner = None if source_scope == "GLOBAL" else owner
    source = FormTemplate(name="Reviewed duplicate", slug=slug,
        organization_id=source_owner, category_key="registration", scope_type=source_scope,
        fields=[], settings={} if source_scope == "GLOBAL" else {"_event_id": str(event_id)})
    replacement = FormTemplate(name="Approved target", slug=slug,
        organization_id=source_owner, category_key="registration", scope_type=source_scope,
        fields=[], settings=dict(source.settings))
    if case == "purpose":
        replacement.category_key = "abstract"
    elif case == "scope":
        replacement.scope_type, replacement.settings = "ORGANIZATION", {}
    elif case == "event":
        replacement.settings = {"_event_id": str(uuid.uuid4())}
    elif case == "conflicting_markers":
        replacement.settings = {"_event_id": str(event_id), "event_id": str(uuid.uuid4())}
    elif case == "missing_markers":
        replacement.settings = {}
    elif case == "malformed_marker":
        replacement.settings = {"_event_id": "not-an-event"}
    elif case == "foreign_event_owner":
        source.settings = replacement.settings = {"_event_id": str(uuid.uuid4())}
    elif case in {"retired_parent", "owned_parent_for_global"}:
        parent = FormCategory(name="Invalid replacement parent", slug=f"parent-{uuid.uuid4().hex}",
            organization_id=owner, is_active=case != "retired_parent")
        db.add(parent)
        await db.flush()
        replacement.category_id = parent.id
    db.add_all([source, replacement])
    await db.flush()
    source_id, replacement_id, actor_id = source.id, replacement.id, organizer.id
    form = RegistrationFormConfig(event_id=event_id, template_id=source_id, fields=[], settings={})
    db.add(form)
    await db.flush()
    form_id = form.id
    conn = await db.connection()
    def reconcile(connection):
        return _reconcile_template(connection, source_id, replacement_id, actor_id,
            "Explicitly reviewed synthetic duplicate correction", 10)
    if not case.startswith("valid_"):
        with pytest.raises(RuntimeError):
            await conn.run_sync(reconcile)
        # Rejection happens before any reference, version or ledger mutation.
        await db.refresh(form)
        await db.refresh(source)
        assert form.template_id == source_id and form.version == 1
        assert source.is_active and source.version == 1
        assert not (await db.scalars(select(FormTemplateReconciliation).where(
            FormTemplateReconciliation.template_id == source_id))).all()
    else:
        result = await conn.run_sync(reconcile)
        assert result["reference_updates"] == 1
        await db.refresh(form)
        await db.refresh(source)
        assert form.id == form_id and form.template_id == replacement_id and form.version == 2
        assert not source.is_active and source.version == 2
        receipt = await db.scalar(select(FormTemplateReconciliation).where(
            FormTemplateReconciliation.template_id == source_id))
        assert receipt.details["lineage_complete"] is True
        assert receipt.details["registration_form_lineage"][0]["resource_id"] == str(form_id)


@pytest.mark.asyncio
@pytest.mark.parametrize("reference", ["global_template", "foreign_event", "valid_owned", "valid_global"])
async def test_category_mapping_rejects_invalid_owned_references(db, event, organizer, reference):
    from app.modules.registration.models.form_category import FormCategoryReconciliation
    from app.modules.platform.models.organization import Organization
    owner = None if reference == "valid_global" else event.organization_id
    slug = f"duplicate-category-{uuid.uuid4().hex}"
    source = FormCategory(name="Duplicate", slug=slug, organization_id=owner)
    replacement = FormCategory(name="Reviewed replacement", slug=slug, organization_id=owner)
    db.add_all([source, replacement])
    await db.flush()
    if reference == "foreign_event":
        foreign = Organization(name="Foreign category owner", slug=f"foreign-{uuid.uuid4().hex}")
        db.add(foreign)
        await db.flush()
        source.organization_id = replacement.organization_id = foreign.id
    template = FormTemplate(name="Retained binding", slug=f"binding-{uuid.uuid4().hex}",
        organization_id=None if reference in {"global_template", "valid_global"} else event.organization_id,
        scope_type="GLOBAL" if reference in {"global_template", "valid_global"} else "ORGANIZATION",
        category_key="registration", category_id=source.id, fields=[], settings={})
    db.add(template)
    form = RegistrationFormConfig(event_id=event.id, category_id=source.id, fields=[], settings={})
    db.add(form)
    await db.flush()
    source_id, replacement_id, actor_id = source.id, replacement.id, organizer.id
    connection = await db.connection()
    def reconcile(conn):
        return _reconcile_category(conn, source_id, replacement_id, actor_id,
            "Reviewed category duplicate correction", 10)
    if not reference.startswith("valid_"):
        with pytest.raises(RuntimeError, match="foreign or unowned"):
            await connection.run_sync(reconcile)
        await db.refresh(template)
        await db.refresh(form)
        await db.refresh(source)
        assert source.is_active and source.version == 1
        assert template.category_id == source_id and template.version == 1
        assert form.category_id == source_id and form.version == 1
        assert not (await db.scalars(select(FormCategoryReconciliation).where(
            FormCategoryReconciliation.category_id == source_id))).all()
    else:
        result = await connection.run_sync(reconcile)
        assert result["reference_updates"] == 2
        await db.refresh(template)
        await db.refresh(form)
        assert template.category_id == replacement_id and template.category_key == "registration"
        assert form.category_id == replacement_id


@pytest.mark.asyncio
async def test_abstract_reference_reassignment_preserves_json_and_lineage(db, event, organizer):
    from app.modules.abstracts.models import AbstractForm
    slug = f"abstract-duplicate-{uuid.uuid4().hex}"
    source, replacement = [FormTemplate(name=name, slug=slug, category_key="abstract",
        scope_type="GLOBAL", fields=[], settings={}) for name in ("Duplicate", "Canonical")]
    db.add_all([source, replacement])
    await db.flush()
    form = AbstractForm(organization_id=event.organization_id, event_id=event.id,
        schema={"fields": [], "settings": {"max_words": 300}, "template_id": str(source.id)})
    db.add(form)
    await db.flush()
    source_id, replacement_id, form_id, actor_id = source.id, replacement.id, form.id, organizer.id
    connection = await db.connection()
    result = await connection.run_sync(lambda conn: _reconcile_template(conn, source_id,
        replacement_id, actor_id, "Reviewed abstract-only duplicate correction", 1))
    assert result["abstract_forms"] == 1 and result["registration_forms"] == 0
    await db.refresh(form)
    assert form.version == 2 and form.schema == {
        "fields": [], "settings": {"max_words": 300}, "template_id": str(replacement_id)}
    receipt = await db.scalar(select(FormTemplateReconciliation).where(
        FormTemplateReconciliation.template_id == source_id))
    assert receipt.details["abstract_form_lineage"] == [{"resource_id": str(form_id),
        "previous_version": 1, "resource_version": 2}]


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["template", "category"])
async def test_exhausted_reference_budget_changes_nothing(db, event, organizer, kind):
    slug = f"budget-duplicate-{uuid.uuid4().hex}"
    model = FormTemplate if kind == "template" else FormCategory
    source, replacement = [model(name=name, slug=slug) for name in ("Duplicate", "Canonical")]
    db.add_all([source, replacement])
    await db.flush()
    form = RegistrationFormConfig(event_id=event.id, fields=[], settings={},
        **{f"{kind}_id": source.id})
    db.add(form)
    await db.flush()
    source_id, replacement_id, actor_id = source.id, replacement.id, organizer.id
    connection = await db.connection()
    reconcile = _reconcile_template if kind == "template" else _reconcile_category
    with pytest.raises(RuntimeError, match="reference-update bound"):
        await connection.run_sync(lambda conn: reconcile(conn, source_id, replacement_id,
            actor_id, "Reviewed duplicate correction with exhausted budget", 0))
    await db.refresh(source)
    await db.refresh(form)
    assert source.is_active and source.version == 1
    assert getattr(form, f"{kind}_id") == source_id and form.version == 1
