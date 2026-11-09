"""Bounded current-document checks, independent of immutable old approvals."""
from datetime import datetime, timezone

from pydantic import ConfigDict

from app.core.tenant_context import TenantContextGuard
from app.modules.registration.models.form_category import FormCategoryReconciliation
from app.modules.registration.models.catalogue_reconciliation import CatalogueDocumentReconciliation
from app.modules.registration.schemas.catalogue_contracts import CategoryRepairDocument


class StoredCategoryDocument(CategoryRepairDocument):
    # Inspect persisted fields without the repair form's whitespace projection.
    # Display text accepted by ordinary writes must not be silently rewritten.
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)


def validate_stored_category_document(row):
    document = StoredCategoryDocument.model_validate({key: getattr(row, key)
        for key in ("name", "slug", "description", "icon", "sort_order")})
    if len(document.name.strip()) < 2:
        raise ValueError("Category name requires reviewed reconciliation")
    return document


def category_document_is_valid(row):
    try:
        validate_stored_category_document(row)
    except (TypeError, ValueError):
        return False
    return True


def quarantine_category_documents(db, *, rows, organization_id, evidenced,
                                  duplicate_counts, actor_id):
    """Caller owns row/lifecycle/revision locks and the final transaction.

    No queries, reference fan-out or repair. An old VALID row is immutable: a
    newly discovered problem gets an ordering version and a current BLOCKED
    record. Existing current BLOCKED records stay blocked on retry.
    """
    if len(rows) > 100 or len({row.id for row in rows}) != len(rows):
        raise ValueError("Invalid bounded category validation page")
    if any(row.organization_id != organization_id for row in rows):
        raise ValueError("Category validation page crosses ownership")
    if organization_id is not None and TenantContextGuard.current() != organization_id:
        raise RuntimeError("Category validation requires its verified owner context")
    global_category = organization_id is None
    operation = "TAXONOMY_VALIDATION" if global_category else "DOCUMENT_VALIDATION"

    def record(row, *, version, operation, details):
        values = dict(operation=operation, status="BLOCKED", details=details,
            actor_user_id=actor_id, reason="Current category document requires reviewed reconciliation.")
        if global_category:
            return FormCategoryReconciliation(category_id=row.id, category_version=version, **values)
        return CatalogueDocumentReconciliation(organization_id=organization_id,
            resource_type="FORM_CATEGORY", resource_id=row.id, resource_version=version, **values)

    for row in rows:
        version = int(row.version or 1)
        if evidenced.get((row.id, version)) == "BLOCKED":
            continue
        issues = []
        if not category_document_is_valid(row):
            issues.append("CATEGORY_DOCUMENT_INVALID")
        if duplicate_counts.get(row.slug, 0) != 1:
            issues.append("DUPLICATE_ACTIVE_TAXONOMY")
        if not issues:
            continue
        if (row.id, version) in evidenced:
            row.version = version + 1
            row.updated_at = datetime.now(timezone.utc)
            db.add(record(row, version=version, operation="DOCUMENT_REVALIDATION",
                details={"resulting_version": row.version, "issues": issues}))
        db.add(record(row, version=int(row.version or 1), operation=operation,
            details={"previous_version": version, "issues": issues}))
        evidenced[(row.id, int(row.version or 1))] = "BLOCKED"
