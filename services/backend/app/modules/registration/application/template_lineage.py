"""Historical provenance is ownership evidence, never operational authority."""
import uuid
import hashlib
import hmac
import json

from fastapi import HTTPException
from sqlalchemy import select

from app.core.tenant_context import TenantContextGuard, TenantContextRequired
from app.config import settings
from app.modules.registration.models.form_template import FormTemplate


def lineage_selector(template):
    settings = template.settings if isinstance(template.settings, dict) else {}
    value = settings.get("_source_template_id")
    if value is None:
        return None
    return uuid.UUID(str(value))


def lineage_is_owned(template, source):
    return source is not None and (
        source.scope_type == "GLOBAL" and source.organization_id is None
        or source.scope_type == "ORGANIZATION" and source.organization_id == template.organization_id
            and template.organization_id is not None)


def detached_lineage_evidence(template):
    """Keep reference history without copying arbitrary legacy secrets to audit."""
    try:
        return {"previous_source_reference_id": str(lineage_selector(template))}
    except (TypeError, ValueError):
        value = template.settings.get("_source_template_id")
        payload = b"category-a:lineage-detachment:v1:" + json.dumps(
            value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        return {"previous_source_reference_digest": hmac.new(
            settings.JWT_SECRET_KEY.encode("utf-8"), payload, hashlib.sha256).hexdigest(),
            "previous_source_reference_kind": "MALFORMED"}


async def lineage_roots(db, identifiers):
    if not identifiers:
        return {}
    if len(identifiers) > 100:
        raise ValueError("Historical lineage batch exceeds the page limit")
    if TenantContextGuard.current() is None:
        raise TenantContextRequired("Historical lineage requires a verified context")
    # Retired/soft-deleted blueprints remain historical provenance. They are
    # not returned as selectable sources or used to resolve permissions here.
    rows = (await db.execute(select(FormTemplate.id, FormTemplate.organization_id,
        FormTemplate.scope_type).where(FormTemplate.id.in_(identifiers))
        .execution_options(shared_form_catalogue=True))).all()
    return {row.id: row for row in rows}


async def require_historical_lineage(db, template):
    """Caller has validated event ownership and holds the lifecycle fence.

    Standalone copies do not create a self-reference. Existing legacy self IDs
    normalize to no external lineage, with the containing command's versioned
    audit preserving the transition. Other event copies cannot be root sources.
    """
    if (template.scope_type != "EVENT" or template.organization_id is None
            or TenantContextGuard.current() != template.organization_id):
        raise TenantContextRequired("Historical lineage requires its verified event owner")
    try:
        root = lineage_selector(template)
    except (TypeError, ValueError):
        raise HTTPException(409, detail={"code": "EVENT_TEMPLATE_LINEAGE_REPAIR_REQUIRED"}) from None
    if root is None or root == template.id:
        return None
    if not lineage_is_owned(template, (await lineage_roots(db, {root})).get(root)):
        raise HTTPException(409, detail={"code": "EVENT_TEMPLATE_LINEAGE_REPAIR_REQUIRED"})
    return root
