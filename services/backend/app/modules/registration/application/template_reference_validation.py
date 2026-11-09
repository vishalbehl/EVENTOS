"""Bounded revalidation of live references, independent of old document evidence."""
import uuid
from datetime import datetime, timezone
from pydantic import ValidationError

from sqlalchemy import select

from app.modules.events.models.event import Event
from app.modules.registration.models.form_category import FormCategory
from app.modules.registration.models.form_template import FormTemplateReconciliation
from .template_purpose import category_key_matches
from .category_document_validation import category_document_is_valid


async def quarantine_invalid_template_references(db, *, rows, evidenced, actor_id):
    """Caller holds lifecycle fences and row locks in the verified owner context.

    At most three reference queries per page, never one per template. Old VALID
    evidence is immutable: a newly discovered violation advances the version and
    appends a current BLOCKED record. Retried pages do not advance it again.
    Missing/foreign references deliberately share a non-enumerating issue code.
    Null category IDs are legacy unbound keys, not authority to resolve by slug.
    """
    live = [row for row in rows if row.is_active]
    category_ids = {row.category_id for row in live if row.category_id is not None}
    categories = {} if not category_ids else {row.id: row for row in (await db.scalars(
        select(FormCategory).where(FormCategory.id.in_(category_ids))
        .execution_options(shared_form_catalogue=True, populate_existing=True))).all()}
    event_ids = {}
    for row in live:
        if row.scope_type != "EVENT":
            continue
        settings = row.settings if isinstance(row.settings, dict) else {}
        try:
            event_ids[row.id] = uuid.UUID(str(settings.get("_event_id") or settings.get("event_id")))
        except (TypeError, ValueError):
            event_ids[row.id] = None
    wanted = {value for value in event_ids.values() if value is not None}
    events = {} if not wanted else dict((await db.execute(select(Event.id, Event.organization_id).where(
        Event.id.in_(wanted), Event.deleted_at.is_(None)))).all())
    from .template_lineage import lineage_selector, lineage_is_owned, lineage_roots
    roots, malformed = {}, set()
    for row in live:
        if row.scope_type != "EVENT":
            continue
        try:
            roots[row.id] = lineage_selector(row)
        except (TypeError, ValueError):
            malformed.add(row.id)
    external = {value for row_id, value in roots.items() if value is not None and value != row_id}
    root_rows = await lineage_roots(db, external)
    for row in live:
        version = int(row.version or 1)
        if evidenced.get((row.id, version)) == "BLOCKED":
            continue
        issues = []
        if row.category_id is not None:
            category = categories.get(row.category_id)
            if (category is None or category.deleted_at is not None or not category.is_active
                    or category.organization_id not in (None, row.organization_id)):
                issues.append("CATEGORY_REFERENCE_UNAVAILABLE")
            elif not category_document_is_valid(category):
                issues.append("CATEGORY_DOCUMENT_INVALID")
            elif not category_key_matches(row.category_key, category.slug):
                issues.append("CATEGORY_KEY_MISMATCH")
        if row.scope_type == "EVENT" and (
                row.organization_id is None or event_ids[row.id] is None
                or events.get(event_ids[row.id]) != row.organization_id):
            issues.append("EVENT_REFERENCE_UNAVAILABLE")
        root = roots.get(row.id)
        if row.id in malformed or root is not None and root != row.id and not lineage_is_owned(row, root_rows.get(root)):
            issues.append("LINEAGE_REFERENCE_UNAVAILABLE")
        if not issues:
            # An old VALID marker is immutable history, not a waiver of the
            # current nested schema. This also covers global/manual entry paths.
            from app.modules.registration.schemas.catalogue_contracts import CatalogueDocument
            from app.modules.registration.schemas.event_form_contracts import form_document
            try:
                if row.scope_type == "EVENT":
                    form_document(row.fields or [], row.settings or {}, stored=True,
                        event_id=event_ids[row.id])
                else:
                    CatalogueDocument.model_validate({"fields": row.fields or [], "settings": row.settings or {}})
            except (ValidationError, TypeError, ValueError):
                issues.append("DOCUMENT_SCHEMA_REVALIDATION_REQUIRED")
        if not issues:
            continue
        previous = evidenced.get((row.id, version))
        if previous is not None:
            row.version = version + 1
            row.updated_at = datetime.now(timezone.utc)
            db.add(FormTemplateReconciliation(template_id=row.id, template_version=version,
                operation="REFERENCE_VALIDATION", status="BLOCKED", actor_user_id=actor_id,
                reason="Current live template checks supersede historical approval.",
                details={"resulting_version": row.version, "issues": issues}))
        db.add(FormTemplateReconciliation(template_id=row.id, template_version=int(row.version or 1),
            operation="DOCUMENT_VALIDATION", status="BLOCKED", actor_user_id=actor_id,
            reason="Live template references require reviewed reconciliation.",
            details={"previous_version": version, "issues": issues}))
        evidenced[(row.id, int(row.version or 1))] = "BLOCKED"
