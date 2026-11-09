"""Bounded operational catalogue checks for persisted event-form aggregates."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from pydantic import ValidationError

from app.core.tenant_context import TenantContextGuard, TenantContextRequired
from app.modules.events.models.event import Event
from app.modules.registration.models.form_template import FormTemplate
from app.modules.registration.models.form_category import FormCategory
from app.modules.registration.models.catalogue_reconciliation import CatalogueDocumentReconciliation
from app.modules.registration.schemas.event_form_contracts import form_document, abstract_schema_projection


async def aggregate_reference_issues(db, *, rows, organization_id, resource_type, lock=False):
    if resource_type not in {"REGISTRATION_FORM", "ABSTRACT_FORM"} or len(rows) > 100:
        raise ValueError("Invalid aggregate reference batch")
    if TenantContextGuard.current() != organization_id:
        raise TenantContextRequired("Aggregate references require the verified owner")
    if not rows:
        return {}
    events = set((await db.scalars(select(Event.id).where(Event.id.in_({row.event_id for row in rows}),
        Event.organization_id == organization_id))).all())
    if any(row.event_id not in events or getattr(row, "organization_id", organization_id) != organization_id for row in rows):
        raise TenantContextRequired("Form event ownership requires explicit reconciliation")
    identifiers, malformed = {}, set()
    for row in rows:
        raw = row.template_id if resource_type == "REGISTRATION_FORM" else (
            row.schema.get("template_id") if isinstance(row.schema, dict) else None)
        if raw is None or resource_type == "ABSTRACT_FORM" and raw == "tpl_abstract_submission":
            identifiers[row.id] = None
            continue
        try:
            identifiers[row.id] = uuid.UUID(str(raw))
        except (ValueError, TypeError):
            malformed.add(row.id)
    wanted = {value for value in identifiers.values() if value is not None}
    statement = select(
        FormTemplate.id, FormTemplate.organization_id, FormTemplate.scope_type, FormTemplate.category_key,
        FormTemplate.category_id, FormTemplate.is_active, FormTemplate.deleted_at,
        FormTemplate.settings["_event_id"].astext.label("bound_event"),
        FormTemplate.settings["event_id"].astext.label("legacy_event"),
    ).where(FormTemplate.id.in_(wanted)).order_by(FormTemplate.id).execution_options(shared_form_catalogue=True)
    if lock:
        statement = statement.with_for_update(read=True, of=FormTemplate)
    templates = {} if not wanted else {row.id: row for row in (await db.execute(statement)).all()}
    category_ids = {row.category_id for row in rows if resource_type == "REGISTRATION_FORM" and row.category_id is not None}
    category_ids.update(row.category_id for row in templates.values() if row.category_id is not None)
    statement = (select(
        FormCategory.id, FormCategory.organization_id, FormCategory.is_system, FormCategory.is_active,
        FormCategory.deleted_at).where(FormCategory.id.in_(category_ids))
        .order_by(FormCategory.id).execution_options(shared_form_catalogue=True))
    if lock:
        statement = statement.with_for_update(read=True, of=FormCategory)
    categories = {} if not category_ids else {row.id: row for row in (await db.execute(statement)).all()}
    result = {}
    for row in rows:
        issues = []
        required = resource_type == "REGISTRATION_FORM" or row.is_active
        template = templates.get(identifiers.get(row.id))
        if row.id in malformed:
            issues.append("TEMPLATE_REFERENCE_UNAVAILABLE")
        elif identifiers.get(row.id) is not None:
            valid = template is not None
            if valid:
                valid = template.category_key == ("registration" if resource_type == "REGISTRATION_FORM" else "abstract")
                valid = valid and (not required or template.is_active and template.deleted_at is None)
                if template.scope_type == "GLOBAL":
                    valid = valid and template.organization_id is None
                elif template.scope_type in {"ORGANIZATION", "EVENT"}:
                    valid = valid and template.organization_id == organization_id
                    if template.scope_type == "EVENT":
                        markers = [value for value in (template.bound_event, template.legacy_event) if value is not None]
                        valid = valid and bool(markers) and all(value == str(row.event_id) for value in markers)
                else:
                    valid = False
                if valid and template.category_id is not None:
                    parent = categories.get(template.category_id)
                    valid = parent is not None and parent.organization_id in (None, template.organization_id)
                    valid = valid and (not required or parent.is_active and parent.deleted_at is None)
            if not valid:
                issues.append("TEMPLATE_REFERENCE_UNAVAILABLE")
        if resource_type == "REGISTRATION_FORM" and row.category_id is not None:
            category = categories.get(row.category_id)
            if (category is None or not category.is_active or category.deleted_at is not None
                    or not (category.organization_id == organization_id
                        or category.organization_id is None and category.is_system)):
                issues.append("CATEGORY_REFERENCE_UNAVAILABLE")
        result[row.id] = issues
    return result


async def quarantine_aggregate_references(db, *, rows, organization_id, resource_type, evidenced, actor_id):
    candidates = [row for row in rows if evidenced.get((row.id, int(row.version or 1))) != "BLOCKED"]
    issues = await aggregate_reference_issues(db, rows=candidates, organization_id=organization_id, resource_type=resource_type)
    for row in candidates:
        if not issues[row.id]:
            try:
                if resource_type == "REGISTRATION_FORM":
                    form_document(row.fields or [], row.settings or {}, stored=True, event_id=row.event_id)
                else:
                    abstract_schema_projection(row.schema or {}, stored=True, event_id=row.event_id)
            except (ValidationError, ValueError, TypeError):
                issues[row.id].append("DOCUMENT_SCHEMA_REVALIDATION_REQUIRED")
        if not issues[row.id]:
            continue
        previous = int(row.version or 1)
        if (row.id, previous) in evidenced:
            row.version = previous + 1
            row.updated_at = datetime.now(timezone.utc)
            db.add(CatalogueDocumentReconciliation(organization_id=organization_id, event_id=row.event_id,
                resource_type=resource_type, resource_id=row.id, resource_version=previous,
                operation="AGGREGATE_REVALIDATION", status="BLOCKED", actor_user_id=actor_id,
                reason="Historical document approval did not satisfy current aggregate checks.",
                details={"resulting_version": row.version, "issues": issues[row.id]}))
        db.add(CatalogueDocumentReconciliation(organization_id=organization_id, event_id=row.event_id,
            resource_type=resource_type, resource_id=row.id, resource_version=int(row.version or 1),
            operation="DOCUMENT_VALIDATION", status="BLOCKED", actor_user_id=actor_id,
            reason="Operational catalogue references require reviewed reconciliation.",
            details={"previous_version": previous, "issues": issues[row.id]}))
        evidenced[(row.id, int(row.version or 1))] = "BLOCKED"
