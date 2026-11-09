"""Authoritative category commands; customer and global catalogue audiences differ."""
import re
import uuid
from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy import select, or_, text, update
from app.core.concurrency import require_if_match
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response
from app.core.dependencies.feature_gate import enforce_org_operation
from app.modules.platform.models.organization import Organization
from app.modules.audit.models.audit_log import AuditLog
from app.modules.registration.models.form_category import FormCategory, FormCategoryReconciliation
from app.modules.registration.models.form_template import FormTemplate
from app.modules.registration.models.registration_form_config import RegistrationFormConfig
from app.modules.registration.schemas.form_builder import FormCategoryResponse
from .catalogue_retirement_scopes import reassign_reference_counts
from .template_purpose import OPERATIONAL_KEYS_SQL


async def retire_global_category(db, *, category_id, replacement_category_id, reason,
                                 actor, if_match, idempotency_key):
    """Reassign every known reference and retire one global category atomically."""
    expected = require_if_match(if_match)
    if not idempotency_key:
        raise HTTPException(428, detail={"code": "IDEMPOTENCY_KEY_REQUIRED"})
    if category_id == replacement_category_id:
        raise HTTPException(422, detail={"code": "REPLACEMENT_MUST_DIFFER"})
    authority = await category_authority(db, actor, "PLATFORM")
    try:
        receipt = await begin_idempotent(db, organization_id=authority, actor_id=actor.id,
            operation="registration.platform.form_category.retire", key=idempotency_key,
            payload={"category_id": str(category_id),
                "replacement_category_id": str(replacement_category_id),
                "version": expected, "reason": reason})
        replay = replay_response(receipt)
        if replay is not None:
            await db.commit()
            return replay[1]
        from .catalogue_lifecycle_locks import lock_category_retirement
        await lock_category_retirement(db)
        categories = list((await db.scalars(select(FormCategory).where(
            FormCategory.id.in_((category_id, replacement_category_id)),
            FormCategory.organization_id.is_(None), FormCategory.deleted_at.is_(None),
        ).order_by(FormCategory.id).with_for_update(of=FormCategory)
          .execution_options(shared_form_catalogue=True, populate_existing=True))).all())
        by_id = {row.id: row for row in categories}
        source, replacement = by_id.get(category_id), by_id.get(replacement_category_id)
        if source is None or replacement is None:
            raise HTTPException(404, detail="Category not found.")
        previous = int(source.version or 1)
        if previous != expected:
            raise HTTPException(412, detail={"code": "RESOURCE_VERSION_CONFLICT",
                "current_version": previous})
        if not source.is_active:
            raise HTTPException(409, detail={"code": "CATEGORY_ALREADY_RETIRED"})
        if not replacement.is_active:
            raise HTTPException(409, detail={"code": "REPLACEMENT_CATEGORY_INACTIVE"})
        # Carry current BLOCKED evidence to the reassigned aggregate version;
        # reference maintenance must never make an unresolved document vanish
        # from the operator queue merely because its version advanced.
        template_counts = await reassign_reference_counts(db, text("""
            WITH updated AS (
                UPDATE design.form_templates
                   SET category_id=:replacement_id,
                       category_key=CASE WHEN category_key IN __OPERATIONAL_KEYS__
                           THEN category_key ELSE :replacement_slug END,
                       version=version+1, updated_at=now()
                 WHERE category_id=:source_id AND organization_id IS NOT DISTINCT FROM :owner_id
                 RETURNING id, version
            ), lineage AS (
                INSERT INTO design.form_template_reconciliations
                    (id, template_id, replacement_template_id, template_version,
                     operation, status, reason, details, actor_user_id, created_at)
                SELECT gen_random_uuid(), updated.id, NULL, updated.version,
                       'CATEGORY_REASSIGNMENT', 'COMPLETED',
                       'Global category retirement reassigned this template.',
                       jsonb_build_object('source_category_id', CAST(:source_id AS text),
                                          'replacement_category_id', CAST(:replacement_id AS text),
                                          'previous_version', updated.version-1),
                       :actor_id, now()
                  FROM updated
                ON CONFLICT (template_id, template_version, operation) DO NOTHING
                RETURNING id
            ), carried AS (
                INSERT INTO design.form_template_reconciliations
                    (id, template_id, replacement_template_id, template_version,
                     operation, status, reason, details, actor_user_id, created_at)
                SELECT gen_random_uuid(), updated.id, NULL, updated.version,
                       'DOCUMENT_VALIDATION', 'BLOCKED',
                       'Blocked document remains unresolved after category reassignment.',
                       jsonb_build_object('carried_from_version', updated.version-1,
                                          'category_retirement', CAST(:source_id AS text)),
                       :actor_id, now()
                  FROM updated
                  JOIN design.form_template_reconciliations previous
                    ON previous.template_id=updated.id
                   AND previous.template_version=updated.version-1
                   AND previous.operation='DOCUMENT_VALIDATION'
                   AND previous.status='BLOCKED'
                ON CONFLICT (template_id, template_version, operation) DO NOTHING
                RETURNING id
            )
            SELECT (SELECT count(*) FROM updated) AS reassigned,
                   (SELECT count(*) FROM lineage) AS lineage_recorded,
                   (SELECT count(*) FROM carried) AS blocked_carried
        """.replace("__OPERATIONAL_KEYS__", OPERATIONAL_KEYS_SQL)), {"source_id": source.id, "replacement_id": replacement.id,
            "replacement_slug": replacement.slug, "actor_id": actor.id},
            kind="CATEGORY", actor=actor, include_global=True)
        registration_counts = await reassign_reference_counts(db, text("""
            WITH candidates AS (
                SELECT form.id, form.event_id, form.version, event.organization_id
                  FROM registration.registration_forms form
                  JOIN events.events event ON event.id=form.event_id
                 WHERE form.category_id=:source_id AND event.organization_id=:owner_id
            ), updated AS (
                UPDATE registration.registration_forms form
                   SET category_id=:replacement_id, version=form.version+1, updated_at=now()
                  FROM candidates
                 WHERE form.id=candidates.id
                 RETURNING form.id, form.event_id, form.version
            ), lineage AS (
                INSERT INTO design.catalogue_document_reconciliations
                    (id, organization_id, event_id, resource_type, resource_id,
                     resource_version, operation, status, reason, details,
                     actor_user_id, created_at)
                SELECT gen_random_uuid(), candidates.organization_id, updated.event_id,
                       'REGISTRATION_FORM', updated.id, updated.version,
                       'CATEGORY_REASSIGNMENT', 'COMPLETED',
                       'Global category retirement reassigned this registration form.',
                       jsonb_build_object('source_category_id', CAST(:source_id AS text),
                                          'replacement_category_id', CAST(:replacement_id AS text),
                                          'previous_version', updated.version-1),
                       :actor_id, now()
                  FROM updated JOIN candidates ON candidates.id=updated.id
                ON CONFLICT (resource_type, resource_id, resource_version, operation) DO NOTHING
                RETURNING id
            ), carried AS (
                INSERT INTO design.catalogue_document_reconciliations
                    (id, organization_id, event_id, resource_type, resource_id,
                     resource_version, operation, status, reason, details,
                     actor_user_id, created_at)
                SELECT gen_random_uuid(), candidates.organization_id, updated.event_id,
                       'REGISTRATION_FORM', updated.id, updated.version,
                       'DOCUMENT_VALIDATION', 'BLOCKED',
                       'Blocked registration form remains unresolved after category reassignment.',
                       jsonb_build_object('carried_from_version', updated.version-1,
                                          'category_retirement', CAST(:source_id AS text)),
                       :actor_id, now()
                  FROM updated JOIN candidates ON candidates.id=updated.id
                  JOIN design.catalogue_document_reconciliations previous
                    ON previous.resource_type='REGISTRATION_FORM'
                   AND previous.resource_id=updated.id
                   AND previous.resource_version=updated.version-1
                   AND previous.operation='DOCUMENT_VALIDATION'
                   AND previous.status='BLOCKED'
                ON CONFLICT (resource_type, resource_id, resource_version, operation) DO NOTHING
                RETURNING id
            )
            SELECT (SELECT count(*) FROM updated) AS reassigned,
                   (SELECT count(*) FROM lineage) AS lineage_recorded,
                   (SELECT count(*) FROM carried) AS blocked_carried
        """), {"source_id": source.id, "replacement_id": replacement.id,
            "actor_id": actor.id}, kind="CATEGORY", actor=actor)
        if (int(template_counts["lineage_recorded"] or 0)
                != int(template_counts["reassigned"] or 0)
                or int(registration_counts["lineage_recorded"] or 0)
                != int(registration_counts["reassigned"] or 0)):
            raise RuntimeError("CATEGORY_REASSIGNMENT_LINEAGE_INCOMPLETE")
        source.is_active = False
        source.version = previous + 1
        source.updated_at = datetime.now(timezone.utc)
        result = {"category_id": str(source.id),
            "replacement_category_id": str(replacement.id), "version": source.version,
            "status": "RETIRED", "reassigned": {
                "templates": int(template_counts["reassigned"] or 0),
                "registration_forms": int(registration_counts["reassigned"] or 0)}}
        db.add(FormCategoryReconciliation(category_id=source.id,
            replacement_category_id=replacement.id, category_version=source.version,
            operation="GLOBAL_RETIREMENT", status="COMPLETED", reason=reason,
            actor_user_id=actor.id, details={**result["reassigned"],
                "blocked_template_evidence_carried": int(template_counts["blocked_carried"] or 0),
                "blocked_registration_evidence_carried": int(registration_counts["blocked_carried"] or 0),
                "template_lineage_recorded": int(template_counts["lineage_recorded"] or 0),
                "registration_lineage_recorded": int(registration_counts["lineage_recorded"] or 0),
                "historical_lineage_preserved": True}))
        db.add(AuditLog(organization_id=authority, actor_user_id=actor.id,
            resource_type="form_category", resource_id=source.id,
            action_type="FORM_CATEGORY_GLOBAL_RETIRE", is_sensitive=True,
            correlation_id=receipt.id, old_state={"version": previous, "is_active": True},
            new_state={**result, "reason": reason}))
        await complete_idempotent(db, receipt, response_status=200,
            response_body=result, resource_id=source.id)
        await db.commit()
        return result
    except Exception:
        await db.rollback()
        raise


async def category_authority(db, actor, audience):
    if actor is None:
        raise HTTPException(401, detail="Authentication required.")
    if audience == "PLATFORM":
        from app.modules.rbac.services.platform_permissions import lock_platform_permission
        organization_id = await lock_platform_permission(db, actor.id, "platform:administration:manage")
    elif audience == "CUSTOMER":
        organization_id = getattr(actor, "request_organization_id", None)
        if organization_id is None:
            raise HTTPException(403, detail="Organization context is required.")
        # Event/workspace form delegation is not organisation catalogue authority.
        from app.modules.rbac.services.access_contexts import direct_administration_context
        async with direct_administration_context(db, actor, organization_id):
            await enforce_org_operation(db, organization_id, "registration.forms.manage", user_id=actor.id)
    else:
        raise ValueError("Unsupported category audience")
    if organization_id is None:
        raise HTTPException(403, detail="Authority context is required.")
    return organization_id


class CategoryCommands:
    @staticmethod
    async def execute(db, *, operation, actor, payload=None, category_id=None,
                      if_match=None, idempotency_key=None, audience="CUSTOMER"):
        expected = require_if_match(if_match) if operation != "create" else None
        if not idempotency_key:
            raise HTTPException(428, detail={"code": "IDEMPOTENCY_KEY_REQUIRED"})
        if not 16 <= len(idempotency_key.strip()) <= 160:
            raise HTTPException(400, detail={"code": "INVALID_IDEMPOTENCY_KEY"})
        if operation not in {"create", "update", "delete"}:
            raise ValueError("Unsupported category operation")
        changes = payload.model_dump(mode="json", exclude_unset=True) if payload is not None else {}
        try:
            organization_id = await category_authority(db, actor, audience)
            owner_id = None if audience == "PLATFORM" else organization_id
            receipt = await begin_idempotent(db, organization_id=organization_id, actor_id=actor.id,
                operation=f"registration.{audience.lower()}.form_category.{operation}",
                key=idempotency_key, payload={"id": str(category_id) if category_id else None,
                    "version": expected, "changes": changes})
            replay = replay_response(receipt)
            if replay is not None:
                result = None if operation == "delete" else FormCategoryResponse.model_validate(replay[1])
                await db.commit()
                return result
            if audience == "PLATFORM":
                await db.execute(text("SELECT pg_advisory_xact_lock(1128353876, 1)"))
            from .catalogue_lifecycle_locks import lock_catalogue_reference_writes
            await lock_catalogue_reference_writes(db)
            # NO KEY UPDATE is compatible with waiting receipt FK locks.
            owner = await db.scalar(select(Organization).where(Organization.id == organization_id)
                .with_for_update(key_share=True).execution_options(populate_existing=True))
            if owner is None:
                raise HTTPException(404, detail="Organization not found.")
            await category_authority(db, actor, audience)
            if operation == "create":
                name = payload.name.strip()
                slug = payload.slug or re.sub(r"[^a-z0-9_-]+", "_", name.lower()).strip("_")
                if len(name) < 2 or not slug or len(slug) > 100:
                    raise HTTPException(422, detail={"code": "INVALID_CATEGORY_NAME"})
                duplicate = await db.scalar(select(FormCategory.id).where(
                    FormCategory.slug == slug, FormCategory.deleted_at.is_(None),
                    or_(FormCategory.organization_id == owner_id, FormCategory.organization_id.is_(None)))
                    .limit(1).execution_options(shared_form_catalogue=True))
                if duplicate is not None:
                    raise HTTPException(409, detail={"code": "CATEGORY_SLUG_CONFLICT"})
                category = FormCategory(id=uuid.uuid4(), organization_id=owner_id,
                    name=name, slug=slug, description=payload.description, icon=payload.icon or "ClipboardList",
                    sort_order=payload.sort_order or 0, is_system=audience == "PLATFORM",
                    is_active=True, version=1)
                db.add(category)
                previous = None
            else:
                category = await db.scalar(select(FormCategory).where(
                    FormCategory.id == category_id, FormCategory.organization_id == owner_id,
                    FormCategory.deleted_at.is_(None)).with_for_update(of=FormCategory)
                    .execution_options(shared_form_catalogue=True, populate_existing=True))
                if category is None:
                    raise HTTPException(404, detail="Category not found.")
                previous = int(category.version or 1)
                if expected != previous:
                    raise HTTPException(412, detail={"code": "RESOURCE_VERSION_CONFLICT", "current_version": previous})
                if audience == "CUSTOMER" and category.is_system:
                    raise HTTPException(403, detail="System categories are protected.")
                retiring = operation == "delete" or changes.get("is_active") is False
                if retiring:
                    if audience == "PLATFORM":
                        raise HTTPException(409, detail={
                            "code": "GLOBAL_CATEGORY_REPLACEMENT_REQUIRED",
                            "action": f"/api/v1/platform/forms/categories/{category.id}/retire",
                        })
                    for model in (FormTemplate, RegistrationFormConfig):
                        reference = await db.scalar(select(model.id).where(
                            model.category_id == category.id).limit(1))
                        if reference is not None:
                            raise HTTPException(409, detail={"code": "CATEGORY_IN_USE"})
                if operation == "delete":
                    category.deleted_at = datetime.now(timezone.utc)
                    category.is_active = False
                else:
                    for key, value in changes.items():
                        setattr(category, key, value)
                category.version = previous + 1
            await db.flush()
            result = FormCategoryResponse.model_validate(category)
            selector = db.info.get("customer_request_selector")
            db.add(AuditLog(organization_id=organization_id, actor_user_id=actor.id,
                resource_type="form_category", resource_id=category.id,
                action_type=f"FORM_CATEGORY_{operation.upper()}", correlation_id=receipt.id,
                old_state={"version": previous}, new_state={"version": result.version,
                    "audience": audience, "changed_fields": sorted(changes),
                    "target_organization_id": str(owner_id) if owner_id else None,
                    "acting_organization_id": str(getattr(selector, "acting_organization_id", None) or organization_id),
                    "access_mode": getattr(selector, "access_mode", "DIRECT")}))
            await complete_idempotent(db, receipt, response_status=204 if operation == "delete" else 201 if operation == "create" else 200,
                response_body={} if operation == "delete" else result.model_dump(mode="json"), resource_id=category.id)
            await db.commit()
            return None if operation == "delete" else result
        except Exception:
            await db.rollback()
            raise
