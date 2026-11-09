"""Non-repairing historical validation of the separate programme rubric store."""
from datetime import datetime, timezone

from app.core.tenant_context import TenantContextGuard
from app.modules.registration.models.catalogue_reconciliation import CatalogueDocumentReconciliation
from app.modules.registration.schemas.event_form_contracts import evaluation_rubric_projection


def quarantine_programme_rubrics(db, *, rows, organization_id, owned_event_ids, evidenced, actor_id):
    """Caller owns bounded plan row locks and commits evidence with its checkpoint.

    Never normalize scoring keys, weights, reviewers, assignments or score data.
    Old approvals are immutable; revalidation uses an ordering version instead.
    """
    if len(rows) > 100 or len({row.id for row in rows}) != len(rows):
        raise ValueError("Invalid bounded programme rubric page")
    if any(row.organization_id != organization_id for row in rows):
        raise ValueError("Programme rubric page crosses ownership")
    if TenantContextGuard.current() != organization_id:
        raise RuntimeError("Programme rubric validation requires verified owner context")

    def record(row, *, version, operation, issues, previous_version):
        return CatalogueDocumentReconciliation(organization_id=organization_id,
            event_id=row.event_id, resource_type="PROGRAMME_RUBRIC", resource_id=row.id,
            resource_version=version, operation=operation, status="BLOCKED",
            reason="Programme rubric requires reviewed reconciliation.",
            details={"issues": issues, "previous_version": previous_version,
                "resulting_version": int(row.version or 1)}, actor_user_id=actor_id)

    for row in rows:
        version = int(row.version or 1)
        if evidenced.get((row.id, version)) == "BLOCKED":
            continue
        issues = []
        if row.event_id not in owned_event_ids:
            issues.append("PROGRAMME_EVENT_OWNERSHIP_INVALID")
        try:
            evaluation_rubric_projection(row.rubric)
        except (TypeError, ValueError):
            issues.append("PROGRAMME_RUBRIC_INVALID")
        if not issues:
            continue
        if (row.id, version) in evidenced:
            row.version = version + 1
            row.updated_at = datetime.now(timezone.utc)
            db.add(record(row, version=version, operation="DOCUMENT_REVALIDATION",
                issues=issues, previous_version=version))
        db.add(record(row, version=int(row.version or 1), operation="DOCUMENT_VALIDATION",
            issues=issues, previous_version=version))
        evidenced[(row.id, int(row.version or 1))] = "BLOCKED"
