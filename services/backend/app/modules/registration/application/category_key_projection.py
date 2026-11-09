"""Owned category-key maintenance with immutable per-template lineage."""
from types import SimpleNamespace

from datetime import datetime, timezone

from sqlalchemy import select, text, tuple_

from app.core.tenant_context import TenantContextGuard
from app.modules.registration.catalogue_limits import MAX_CATEGORY_KEY_LENGTH
from .catalogue_retirement_scopes import reassign_reference_counts
from .template_purpose import OPERATIONAL_KEYS_SQL


async def normalize_template_page_category_keys(db, *, rows, organization_id, evidenced, actor_id):
    """Project at most one already-locked template page, never category fan-out.

    The caller holds shared template/category lifecycle fences and has admitted
    the platform actor and target revision. Only current validated taxonomy may
    supply a legacy key; purpose keys and foreign-owner references are untouched.
    Return changed IDs for per-resource accounting. BLOCKED validation is carried
    forward, not silently cleared by a taxonomy-only version change.
    """
    from app.modules.registration.models.form_category import FormCategory, FormCategoryReconciliation
    from app.modules.registration.models.form_template import FormTemplateReconciliation
    from app.modules.registration.models.catalogue_reconciliation import CatalogueDocumentReconciliation
    from .template_purpose import OPERATIONAL_TEMPLATE_KEYS
    from .category_document_validation import category_document_is_valid

    if len(rows) > 100 or len({row.id for row in rows}) != len(rows):
        raise ValueError("Invalid bounded template projection page")
    if any(row.organization_id != organization_id for row in rows):
        raise ValueError("Template projection page crosses ownership")
    if organization_id is not None and TenantContextGuard.current() != organization_id:
        raise RuntimeError("Template projection requires its verified owner context")
    wanted = {row.category_id for row in rows
        if row.category_id is not None and row.category_key not in OPERATIONAL_TEMPLATE_KEYS}
    if not wanted:
        return set()
    categories = {row.id: row for row in (await db.scalars(select(FormCategory).where(
        FormCategory.id.in_(wanted), FormCategory.is_active.is_(True),
        FormCategory.deleted_at.is_(None)).execution_options(
            shared_form_catalogue=True, populate_existing=True))).all()
        if row.organization_id in (None, organization_id) and category_document_is_valid(row)}
    global_pairs = [(row.id, int(row.version or 1)) for row in categories.values()
        if row.organization_id is None]
    owned_pairs = [(row.id, int(row.version or 1)) for row in categories.values()
        if row.organization_id is not None]
    validated = set()
    if global_pairs:
        validated.update((await db.scalars(select(FormCategoryReconciliation.category_id).where(
            tuple_(FormCategoryReconciliation.category_id,
                FormCategoryReconciliation.category_version).in_(global_pairs),
            FormCategoryReconciliation.operation == "TAXONOMY_VALIDATION",
            FormCategoryReconciliation.status.in_(("VALID", "NORMALIZED"))))).all())
    if owned_pairs:
        validated.update((await db.scalars(select(CatalogueDocumentReconciliation.resource_id).where(
            CatalogueDocumentReconciliation.organization_id == organization_id,
            CatalogueDocumentReconciliation.resource_type == "FORM_CATEGORY",
            tuple_(CatalogueDocumentReconciliation.resource_id,
                CatalogueDocumentReconciliation.resource_version).in_(owned_pairs),
            CatalogueDocumentReconciliation.operation == "DOCUMENT_VALIDATION",
            CatalogueDocumentReconciliation.status.in_(("VALID", "NORMALIZED"))))).all())
    changed = set()
    for row in rows:
        category = categories.get(row.category_id)
        if (category is None or category.id not in validated
                or not category.slug or len(category.slug) > MAX_CATEGORY_KEY_LENGTH
                or category.slug in OPERATIONAL_TEMPLATE_KEYS
                or row.category_key in OPERATIONAL_TEMPLATE_KEYS
                or row.category_key == category.slug):
            continue
        previous = int(row.version or 1)
        row.category_key, row.version = category.slug, previous + 1
        row.updated_at = datetime.now(timezone.utc)
        db.add(FormTemplateReconciliation(template_id=row.id,
            template_version=row.version, operation="CATEGORY_KEY_NORMALIZATION", status="COMPLETED",
            actor_user_id=actor_id, reason="Validated taxonomy projected within a bounded template page.",
            details={"category_id": str(category.id), "category_version": int(category.version or 1),
                "previous_version": previous}))
        if evidenced.get((row.id, previous)) == "BLOCKED":
            db.add(FormTemplateReconciliation(template_id=row.id,
                template_version=row.version, operation="DOCUMENT_VALIDATION", status="BLOCKED",
                actor_user_id=actor_id,
                reason="Blocked document remains unresolved after category normalization.",
                details={"carried_from_version": previous, "category_normalization": str(category.id)}))
            evidenced[(row.id, row.version)] = "BLOCKED"
        changed.add(row.id)
    return changed


_NORMALIZE = text("""
    WITH updated AS (
        UPDATE design.form_templates
           SET category_key=:slug, version=version+1, updated_at=now()
         WHERE category_id=:source_id AND category_key IS DISTINCT FROM :slug
           AND category_key NOT IN __OPERATIONAL_KEYS__
           AND organization_id IS NOT DISTINCT FROM :owner_id
         RETURNING id, version
    ), lineage AS (
        INSERT INTO design.form_template_reconciliations
            (id,template_id,replacement_template_id,template_version,operation,status,reason,
             details,actor_user_id,created_at)
        SELECT gen_random_uuid(),id,NULL,version,'CATEGORY_KEY_NORMALIZATION','COMPLETED',
               'Category taxonomy updated this owned template projection.',
               jsonb_build_object('category_id',CAST(:source_id AS text),
                                  'previous_version',version-1),:actor_id,now()
          FROM updated
        ON CONFLICT (template_id,template_version,operation) DO NOTHING
        RETURNING id
    ), carried AS (
        INSERT INTO design.form_template_reconciliations
            (id,template_id,replacement_template_id,template_version,operation,status,reason,
             details,actor_user_id,created_at)
        SELECT gen_random_uuid(),updated.id,NULL,updated.version,'DOCUMENT_VALIDATION','BLOCKED',
               'Blocked document remains unresolved after category normalization.',
               jsonb_build_object('carried_from_version',updated.version-1,
                                  'category_normalization',CAST(:source_id AS text)),:actor_id,now()
          FROM updated JOIN design.form_template_reconciliations previous
            ON previous.template_id=updated.id AND previous.template_version=updated.version-1
           AND previous.operation='DOCUMENT_VALIDATION' AND previous.status='BLOCKED'
        ON CONFLICT (template_id,template_version,operation) DO NOTHING
        RETURNING id
    )
    SELECT (SELECT count(*) FROM updated) AS reassigned,
           (SELECT count(*) FROM lineage) AS lineage_recorded,
           (SELECT count(*) FROM carried) AS blocked_carried
""".replace("__OPERATIONAL_KEYS__", OPERATIONAL_KEYS_SQL))


async def normalize_category_template_keys(db, *, category_id, organization_id, slug, actor_id):
    """Caller has authorised the actor and locked category lifecycle then row.

    Global updates use the existing allowlisted, cursor-paged owner discovery.
    Owned updates never follow corrupt foreign-owner references.
    """
    parameters = {"source_id": category_id, "slug": slug, "actor_id": actor_id}
    if organization_id is None:
        counts = await reassign_reference_counts(db, _NORMALIZE, parameters,
            kind="CATEGORY", actor=SimpleNamespace(id=actor_id), include_global=True)
    else:
        if TenantContextGuard.current() != organization_id:
            raise RuntimeError("Category projection requires its verified owner context")
        counts = (await db.execute(_NORMALIZE, {**parameters, "owner_id": organization_id})).mappings().one()
    if int(counts["reassigned"]) != int(counts["lineage_recorded"]):
        raise RuntimeError("Category projection lineage is incomplete")
    return int(counts["reassigned"]), int(counts["blocked_carried"])
