"""Versioned organisation/global catalogue writes; event forms use aggregates."""
import uuid
import re
from contextlib import AsyncExitStack
from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy import select, and_, or_, text, update, bindparam, Uuid, tuple_
from app.core.concurrency import require_if_match
from app.modules.registration.catalogue_limits import MAX_CATEGORY_KEY_LENGTH
from app.core.tenant_context import TenantContextGuard
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response
from app.modules.registration.application.category_commands import category_authority
from app.modules.platform.models.organization import Organization
from app.modules.events.models.event import Event
from app.modules.registration.models.form_template import FormTemplate, FormTemplateReconciliation
from app.modules.registration.models.form_category import FormCategory
from app.modules.registration.models.registration_form_config import RegistrationFormConfig
from app.modules.abstracts.models import AbstractForm
from app.modules.audit.models.audit_log import AuditLog
from app.modules.registration.schemas.form_builder import FormTemplateResponse
from app.modules.registration.schemas.catalogue_contracts import CatalogueDocument
from pydantic import ValidationError
from .catalogue_retirement_scopes import reassign_reference_counts
from .template_purpose import category_key_matches, reassigned_category_key, OPERATIONAL_TEMPLATE_KEYS


async def retire_global_template(db, *, template_id, replacement_template_id, reason,
                                 actor, if_match, idempotency_key):
    """Atomically retire one global blueprint and reassign live references."""
    expected = require_if_match(if_match)
    if not idempotency_key:
        raise HTTPException(428, detail={"code": "IDEMPOTENCY_KEY_REQUIRED"})
    if template_id == replacement_template_id:
        raise HTTPException(422, detail={"code": "REPLACEMENT_MUST_DIFFER"})
    authority = await category_authority(db, actor, "PLATFORM")
    try:
        receipt = await begin_idempotent(db, organization_id=authority, actor_id=actor.id,
            operation="registration.platform.form_template.retire", key=idempotency_key,
            payload={"template_id": str(template_id), "replacement_template_id": str(replacement_template_id),
                "version": expected, "reason": reason})
        replay = replay_response(receipt)
        if replay is not None:
            await db.commit()
            return replay[1]
        from .catalogue_lifecycle_locks import lock_template_retirement
        await lock_template_retirement(db)
        rows = list((await db.scalars(select(FormTemplate).where(
            FormTemplate.id.in_((template_id, replacement_template_id)),
            FormTemplate.organization_id.is_(None), FormTemplate.scope_type == "GLOBAL",
            FormTemplate.deleted_at.is_(None),
        ).order_by(FormTemplate.id).with_for_update(of=FormTemplate)
          .execution_options(shared_form_catalogue=True, populate_existing=True))).all())
        by_id = {row.id: row for row in rows}
        source, replacement = by_id.get(template_id), by_id.get(replacement_template_id)
        if source is None or replacement is None:
            raise HTTPException(404, detail="Template not found.")
        if int(source.version or 1) != expected:
            raise HTTPException(412, detail={"code": "RESOURCE_VERSION_CONFLICT",
                "current_version": int(source.version or 1)})
        if not source.is_active:
            raise HTTPException(409, detail={"code": "TEMPLATE_ALREADY_RETIRED"})
        if not replacement.is_active:
            raise HTTPException(409, detail={"code": "REPLACEMENT_TEMPLATE_INACTIVE"})
        if source.category_key != replacement.category_key:
            raise HTTPException(422, detail={"code": "REPLACEMENT_CATEGORY_MISMATCH"})
        # Validate the replacement before moving a single live reference.
        catalogue_projection(replacement)
        registration_counts = await reassign_reference_counts(db, text("""
            WITH candidates AS (
                SELECT form.id, form.event_id, form.version, event.organization_id
                  FROM registration.registration_forms form
                  JOIN events.events event ON event.id=form.event_id
                 WHERE form.template_id=:source_id AND event.organization_id=:owner_id
            ), updated AS (
                UPDATE registration.registration_forms form
                   SET template_id=:replacement_id, version=form.version+1, updated_at=now()
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
                       'TEMPLATE_REASSIGNMENT', 'COMPLETED', :reason,
                       jsonb_build_object(
                           'source_template_id', CAST(:source_id AS text),
                           'replacement_template_id', CAST(:replacement_id AS text),
                           'previous_version', updated.version-1
                       ), :actor_id, now()
                  FROM updated JOIN candidates ON candidates.id=updated.id
                RETURNING id
            ), carried AS (
                INSERT INTO design.catalogue_document_reconciliations
                    (id, organization_id, event_id, resource_type, resource_id,
                     resource_version, operation, status, reason, details,
                     actor_user_id, created_at)
                SELECT gen_random_uuid(), candidates.organization_id, updated.event_id,
                       'REGISTRATION_FORM', updated.id, updated.version,
                       'DOCUMENT_VALIDATION', 'BLOCKED',
                       'Blocked registration form remains unresolved after template reassignment.',
                       jsonb_build_object('carried_from_version', updated.version-1,
                                          'template_retirement', CAST(:source_id AS text)),
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
            "actor_id": actor.id, "reason": reason}, kind="TEMPLATE", actor=actor)
        abstract_counts = await reassign_reference_counts(db, text("""
            WITH candidates AS (
                SELECT id, organization_id, event_id, version
                  FROM abstract.abstract_forms
                 WHERE is_active=true AND schema->>'template_id'=CAST(:source_id AS text)
                   AND organization_id=:owner_id
            ), updated AS (
                UPDATE abstract.abstract_forms form
                   SET schema=jsonb_set(form.schema, '{template_id}',
                           to_jsonb(CAST(:replacement_id AS text)), true),
                       version=form.version+1, updated_at=now()
                  FROM candidates
                 WHERE form.id=candidates.id
                 RETURNING form.id, form.organization_id, form.event_id, form.version
            ), lineage AS (
                INSERT INTO design.catalogue_document_reconciliations
                    (id, organization_id, event_id, resource_type, resource_id,
                     resource_version, operation, status, reason, details,
                     actor_user_id, created_at)
                SELECT gen_random_uuid(), updated.organization_id, updated.event_id,
                       'ABSTRACT_FORM', updated.id, updated.version,
                       'TEMPLATE_REASSIGNMENT', 'COMPLETED', :reason,
                       jsonb_build_object(
                           'source_template_id', CAST(:source_id AS text),
                           'replacement_template_id', CAST(:replacement_id AS text),
                           'previous_version', updated.version-1
                       ), :actor_id, now()
                  FROM updated
                RETURNING id
            ), carried AS (
                INSERT INTO design.catalogue_document_reconciliations
                    (id, organization_id, event_id, resource_type, resource_id,
                     resource_version, operation, status, reason, details,
                     actor_user_id, created_at)
                SELECT gen_random_uuid(), updated.organization_id, updated.event_id,
                       'ABSTRACT_FORM', updated.id, updated.version,
                       'DOCUMENT_VALIDATION', 'BLOCKED',
                       'Blocked abstract form remains unresolved after template reassignment.',
                       jsonb_build_object('carried_from_version', updated.version-1,
                                          'template_retirement', CAST(:source_id AS text)),
                       :actor_id, now()
                  FROM updated
                  JOIN design.catalogue_document_reconciliations previous
                    ON previous.resource_type='ABSTRACT_FORM'
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
        """).bindparams(bindparam("source_id", type_=Uuid), bindparam("replacement_id", type_=Uuid)),
            {"source_id": source.id, "replacement_id": replacement.id,
            "actor_id": actor.id, "reason": reason}, kind="TEMPLATE", actor=actor)
        if (int(registration_counts["lineage_recorded"] or 0)
                != int(registration_counts["reassigned"] or 0)
                or int(abstract_counts["lineage_recorded"] or 0)
                != int(abstract_counts["reassigned"] or 0)):
            raise RuntimeError("TEMPLATE_REASSIGNMENT_LINEAGE_INCOMPLETE")
        previous = int(source.version or 1)
        was_default = bool(source.is_default)
        source.is_active = False
        source.is_default = False
        source.version = previous + 1
        source.updated_at = datetime.now(timezone.utc)
        if was_default:
            replacement.is_default = True
            replacement.version = int(replacement.version or 1) + 1
            replacement.updated_at = datetime.now(timezone.utc)
        db.add(FormTemplateReconciliation(template_id=source.id,
            replacement_template_id=replacement.id, template_version=source.version,
            operation="GLOBAL_RETIREMENT", status="COMPLETED", reason=reason,
            actor_user_id=actor.id, details={
                "registration_references": int(registration_counts["reassigned"] or 0),
                "active_abstract_references": int(abstract_counts["reassigned"] or 0),
                "registration_lineage_recorded": int(registration_counts["lineage_recorded"] or 0),
                "abstract_lineage_recorded": int(abstract_counts["lineage_recorded"] or 0),
                "blocked_registration_evidence_carried": int(registration_counts["blocked_carried"] or 0),
                "blocked_abstract_evidence_carried": int(abstract_counts["blocked_carried"] or 0),
                "historical_lineage_preserved": True,
            }))
        response = {"template_id": str(source.id), "replacement_template_id": str(replacement.id),
            "version": source.version, "status": "RETIRED",
            "reassigned": {"registration": int(registration_counts["reassigned"] or 0),
                "active_abstract_forms": int(abstract_counts["reassigned"] or 0)}}
        db.add(AuditLog(organization_id=authority, actor_user_id=actor.id,
            resource_type="form_template", resource_id=source.id,
            action_type="FORM_TEMPLATE_GLOBAL_RETIRE", is_sensitive=True,
            correlation_id=receipt.id, old_state={"version": previous, "is_active": True},
            new_state={**response, "reason": reason}))
        await complete_idempotent(db, receipt, response_status=200,
            response_body=response, resource_id=source.id)
        await db.commit()
        return response
    except Exception:
        await db.rollback()
        raise


async def reconcile_catalogue_documents(db, *, actor, cursor=None, page_size=50,
                                        idempotency_key=None):
    """Validate a bounded historical page and normalize only lossless documents."""
    if type(page_size) is not int or not 1 <= page_size <= 100:
        raise HTTPException(422, detail={"code": "INVALID_PAGE_SIZE"})
    authority = await category_authority(db, actor, "PLATFORM")
    if not idempotency_key:
        raise HTTPException(428, detail={"code": "IDEMPOTENCY_KEY_REQUIRED"})
    receipt = await begin_idempotent(db, organization_id=authority, actor_id=actor.id,
        operation="registration.platform.form_template.reconcile", key=idempotency_key,
        payload={"cursor": str(cursor) if cursor else None, "page_size": page_size})
    replay = replay_response(receipt)
    if replay is not None:
        await db.commit()
        return replay[1]
    from .catalogue_lifecycle_locks import lock_catalogue_reference_writes
    await lock_catalogue_reference_writes(db)
    # Event copies use the event-form ownership contract and are reconciled by
    # the tenant-scoped cohort worker. This manual page is catalogue-only.
    statement = select(FormTemplate).where(FormTemplate.deleted_at.is_(None),
        FormTemplate.scope_type.in_(("GLOBAL", "ORGANIZATION")))
    if cursor is not None:
        statement = statement.where(FormTemplate.id > cursor)
    rows = list((await db.scalars(statement.order_by(FormTemplate.id).limit(page_size + 1)
        .with_for_update(of=FormTemplate).execution_options(shared_form_catalogue=True))).all())
    page, has_next = rows[:page_size], len(rows) > page_size
    page_ids = [template.id for template in page]
    page_versions = [(template.id, int(template.version or 1)) for template in page]
    evidenced = {} if not page_ids else {(row_id, version): status for row_id, version, status in
        (await db.execute(select(FormTemplateReconciliation.template_id,
            FormTemplateReconciliation.template_version, FormTemplateReconciliation.status).where(
            tuple_(FormTemplateReconciliation.template_id,
                FormTemplateReconciliation.template_version).in_(page_versions),
            FormTemplateReconciliation.operation == "DOCUMENT_VALIDATION"))).all()}
    from .template_reference_validation import quarantine_invalid_template_references
    await quarantine_invalid_template_references(db, rows=page, evidenced=evidenced, actor_id=actor.id)
    normalized = blocked = 0
    for template in page:
        existing = evidenced.get((template.id, int(template.version or 1)))
        if existing is not None:
            blocked += int(existing == "BLOCKED")
            continue
        try:
            document = CatalogueDocument.model_validate({
                "fields": template.fields or [], "settings": template.settings or {}})
            projected = document.model_dump(mode="json", exclude_none=True)
            changed = projected["fields"] != (template.fields or []) or projected["settings"] != (template.settings or {})
            checked_version = int(template.version or 1)
            if changed:
                template.fields, template.settings = projected["fields"], projected["settings"]
                template.version = checked_version + 1
                template.updated_at = datetime.now(timezone.utc)
                normalized += 1
            db.add(FormTemplateReconciliation(template_id=template.id,
                template_version=checked_version, operation="DOCUMENT_VALIDATION",
                status="NORMALIZED" if changed else "VALID", actor_user_id=actor.id,
                details={"resulting_version": int(template.version or 1)}))
            if changed:
                db.add(FormTemplateReconciliation(template_id=template.id,
                    template_version=int(template.version or 1),
                    operation="DOCUMENT_VALIDATION", status="VALID",
                    actor_user_id=actor.id,
                    details={"normalized_from_version": checked_version}))
        except (ValidationError, TypeError, ValueError) as exc:
            blocked += 1
            db.add(FormTemplateReconciliation(template_id=template.id,
                template_version=int(template.version or 1), operation="DOCUMENT_VALIDATION",
                status="BLOCKED", actor_user_id=actor.id,
                reason="Historical document requires explicit operator reconciliation.",
                details={"error_type": type(exc).__name__}))
    next_cursor = page[-1].id if has_next and page else None
    db.add(AuditLog(organization_id=authority, actor_user_id=actor.id,
        resource_type="form_template_catalogue", resource_id=receipt.id,
        correlation_id=receipt.id, action_type="FORM_TEMPLATE_RECONCILE_PAGE",
        is_sensitive=True, new_state={"checked": len(page), "normalized": normalized,
            "blocked": blocked, "next_cursor": str(next_cursor) if next_cursor else None}))
    result = {"checked": len(page), "normalized": normalized, "blocked": blocked,
        "next_cursor": next_cursor}
    await complete_idempotent(db, receipt, response_status=200,
        response_body={**result, "next_cursor": str(next_cursor) if next_cursor else None})
    await db.commit()
    return result


async def repair_catalogue_document(db, *, template_id, payload, actor,
                                    if_match, idempotency_key):
    """Apply an operator-supplied valid document to one blocked historical row."""
    expected = require_if_match(if_match)
    authority = await category_authority(db, actor, "PLATFORM")
    if not idempotency_key:
        raise HTTPException(428, detail={"code": "IDEMPOTENCY_KEY_REQUIRED"})
    projected = payload.document.model_dump(mode="json", exclude_none=True)
    platform_scope, target_scope = AsyncExitStack(), AsyncExitStack()
    try:
        await platform_scope.enter_async_context(TenantContextGuard.scoped(db, authority))
        receipt = await begin_idempotent(db, organization_id=authority, actor_id=actor.id,
            operation="registration.platform.form_template.repair", key=idempotency_key,
            payload={"template_id": str(template_id), "version": expected,
                "document": projected, "reason": payload.reason,
                **({"replacement_category_id": str(payload.replacement_category_id)}
                   if payload.replacement_category_id is not None else {}),
                **({"detach_invalid_source_lineage": True} if payload.detach_invalid_source_lineage else {})})
        replay = replay_response(receipt)
        if replay is not None:
            await db.commit()
            return replay[1]
        from .catalogue_lifecycle_locks import lock_catalogue_reference_writes
        await lock_catalogue_reference_writes(db)
        from .catalogue_review_queries import template_review_rows
        targets = await template_review_rows(db, actor=actor, template_id=template_id)
        if not targets:
            raise HTTPException(404, detail="Template not found.")
        owner_id = targets[0]["organization_id"]
        if owner_id is not None:
            await target_scope.enter_async_context(TenantContextGuard.scoped(db, owner_id))
        owner = await db.scalar(select(Organization).where(
            Organization.id == (owner_id or authority)).with_for_update(read=True)
            .execution_options(populate_existing=True))
        if owner is None or not owner.is_active or owner.suspended_at is not None or owner.archived_at is not None:
            raise HTTPException(409, detail={"code": "ORGANIZATION_NOT_OPERATIONAL"})
        template = await db.scalar(select(FormTemplate).where(
            FormTemplate.id == template_id, FormTemplate.organization_id == owner_id,
            FormTemplate.deleted_at.is_(None))
            .with_for_update(of=FormTemplate)
            .execution_options(shared_form_catalogue=True, populate_existing=True))
        if template is None:
            raise HTTPException(404, detail="Template not found.")
        if template.scope_type not in ({"GLOBAL"} if owner_id is None else {"ORGANIZATION", "EVENT"}):
            raise HTTPException(409, detail={"code": "TEMPLATE_SCOPE_RECONCILIATION_REQUIRED"})
        current = int(template.version or 1)
        if current != expected:
            raise HTTPException(412, detail={"code": "RESOURCE_VERSION_CONFLICT",
                "current_version": current})
        blocked = await db.scalar(select(FormTemplateReconciliation.id).where(
            FormTemplateReconciliation.template_id == template.id,
            FormTemplateReconciliation.template_version == current,
            FormTemplateReconciliation.operation == "DOCUMENT_VALIDATION",
            FormTemplateReconciliation.status == "BLOCKED"))
        if blocked is None:
            raise HTTPException(409, detail={"code": "TEMPLATE_IS_NOT_BLOCKED"})
        if not template.is_active:
            raise HTTPException(409, detail={"code": "TEMPLATE_RETIRED"})
        if payload.detach_invalid_source_lineage and template.scope_type != "EVENT":
            raise HTTPException(409, detail={"code": "LINEAGE_DETACH_REQUIRES_EVENT_TEMPLATE"})
        lineage_detachment = None
        previous_category_id, previous_category_key = template.category_id, template.category_key
        selected_category_id = payload.replacement_category_id or template.category_id
        if selected_category_id is not None:
            category = await db.scalar(select(FormCategory).where(
                FormCategory.id == selected_category_id,
                FormCategory.is_active.is_(True),
                FormCategory.deleted_at.is_(None),
                (FormCategory.organization_id.is_(None)
                    if template.organization_id is None
                    else or_(FormCategory.organization_id.is_(None),
                        FormCategory.organization_id == template.organization_id)),
            ).with_for_update(read=True)
              .execution_options(shared_form_catalogue=True, populate_existing=True))
            # The additive category-key migration aligns storage and HTTP limits
            # with category identities. Never truncate a reviewed replacement.
            if category is None or len(reassigned_category_key(template.category_key, category.slug)) > MAX_CATEGORY_KEY_LENGTH:
                raise HTTPException(409, detail={
                    "code": "TEMPLATE_CATEGORY_RECONCILIATION_REQUIRED",
                })
            if payload.replacement_category_id is None and not category_key_matches(template.category_key, category.slug):
                raise HTTPException(409, detail={
                    "code": "TEMPLATE_CATEGORY_RECONCILIATION_REQUIRED",
                })
            if payload.replacement_category_id is not None:
                template.category_id = category.id
                template.category_key = reassigned_category_key(template.category_key, category.slug)
        if template.scope_type == "EVENT":
            raw_settings = template.settings if isinstance(template.settings, dict) else {}
            try:
                event_id = uuid.UUID(str(raw_settings.get("_event_id") or raw_settings.get("event_id")))
            except (TypeError, ValueError):
                raise HTTPException(409, detail={"code": "EVENT_TEMPLATE_OWNERSHIP_REPAIR_REQUIRED"}) from None
            if template.organization_id is None:
                raise HTTPException(409, detail={"code": "EVENT_TEMPLATE_OWNERSHIP_REPAIR_REQUIRED"})
            async with TenantContextGuard.scoped(db, template.organization_id):
                owned_event = await db.scalar(select(Event.id).where(
                    Event.id == event_id,
                    Event.organization_id == template.organization_id,
                    Event.deleted_at.is_(None)))
            if owned_event is None:
                raise HTTPException(409, detail={"code": "EVENT_TEMPLATE_OWNERSHIP_REPAIR_REQUIRED"})
            repaired_settings = dict(projected["settings"])
            repaired_settings["_event_id"] = str(event_id)
            from .template_lineage import require_historical_lineage
            if payload.detach_invalid_source_lineage:
                try:
                    await require_historical_lineage(db, template)
                except HTTPException as exc:
                    if exc.status_code != 409 or exc.detail != {"code": "EVENT_TEMPLATE_LINEAGE_REPAIR_REQUIRED"}:
                        raise
                    from .template_lineage import detached_lineage_evidence
                    lineage_detachment = detached_lineage_evidence(template)
                else:
                    raise HTTPException(409, detail={"code": "LINEAGE_DETACH_NOT_REQUIRED"})
                historical_root = None
            else:
                historical_root = await require_historical_lineage(db, template)
            if historical_root is not None:
                repaired_settings["_source_template_id"] = str(historical_root)
            from app.modules.registration.schemas.event_form_contracts import form_document
            projected = form_document(projected["fields"], repaired_settings,
                stored=True, event_id=event_id)
        from app.modules.registration.services.managed_form_assets import require_form_assets
        await require_form_assets(db, organization_id=template.organization_id,
            settings=projected["settings"], lock=True)
        template.fields = projected["fields"]
        template.settings = projected["settings"]
        template.version = current + 1
        template.updated_at = datetime.now(timezone.utc)
        if lineage_detachment is not None:
            db.add(FormTemplateReconciliation(template_id=template.id,
                template_version=current, operation="LINEAGE_DETACHMENT", status="COMPLETED",
                reason=payload.reason, actor_user_id=actor.id,
                details={**lineage_detachment, "resulting_version": template.version,
                    "event_id": str(event_id), "organization_id": str(owner_id)}))
        db.add(FormTemplateReconciliation(template_id=template.id,
            template_version=current, operation="EXPLICIT_REPAIR", status="COMPLETED",
            reason=payload.reason, actor_user_id=actor.id,
            details={"resulting_version": template.version,
                "field_count": len(template.fields),
                "previous_category_id": str(previous_category_id) if previous_category_id else None,
                "category_id": str(template.category_id) if template.category_id else None}))
        db.add(FormTemplateReconciliation(template_id=template.id,
            template_version=template.version, operation="DOCUMENT_VALIDATION",
            status="VALID", reason="Validated by reviewed explicit repair.",
            actor_user_id=actor.id,
            details={"repaired_from_version": current}))
        result = {"template_id": str(template.id), "previous_version": current,
            "version": template.version, "status": "REPAIRED"}
        db.add(AuditLog(organization_id=owner_id or authority, actor_user_id=actor.id,
            resource_type="form_template", resource_id=template.id,
            action_type="FORM_TEMPLATE_EXPLICIT_REPAIR", is_sensitive=True,
            correlation_id=receipt.id, old_state={"version": current,
                "category_id": str(previous_category_id) if previous_category_id else None,
                "category_key": previous_category_key},
            new_state={**result, "reason": payload.reason,
                **({"lineage_detachment": lineage_detachment} if lineage_detachment is not None else {}),
                "category_id": str(template.category_id) if template.category_id else None,
                "category_key": template.category_key,
                "field_count": len(template.fields)}))
        await db.flush()
        await target_scope.aclose()
        await complete_idempotent(db, receipt, response_status=200,
            response_body=result, resource_id=template.id)
        await db.commit()
        return result
    except Exception:
        await db.rollback()
        raise
    finally:
        await target_scope.aclose()
        await platform_scope.aclose()


def catalogue_projection(template):
    """Legacy nested data is not a response allowlist or permission to clone."""
    try:
        document = CatalogueDocument.model_validate({
            "fields": template.fields or [], "settings": template.settings or {}})
    except (ValidationError, TypeError, ValueError):
        raise HTTPException(409, detail={"code": "TEMPLATE_DOCUMENT_RECONCILIATION_REQUIRED"})
    from .commands import FormTemplateCommandService
    # Receipt projections already contain the committed category label. Running
    # them back through the ORM adapter loses it because no relationship exists.
    # Copy the allowlisted response, then revalidate/filter nested data as usual.
    result = template.model_copy() if isinstance(template, FormTemplateResponse) else FormTemplateCommandService._response(template)
    projected = document.model_dump(mode="json", exclude_none=True)
    result.fields, result.settings = projected["fields"], projected["settings"]
    # Raw stored preview references are not authorised managed assets.
    result.preview_image_url = None
    return result


class TemplateCommands:
    @staticmethod
    async def execute(db, *, operation, actor, payload=None, template_id=None,
                      if_match=None, idempotency_key=None, audience="CUSTOMER"):
        expected = require_if_match(if_match) if operation != "create" else None
        if not idempotency_key:
            raise HTTPException(428, detail={"code": "IDEMPOTENCY_KEY_REQUIRED"})
        if not 16 <= len(idempotency_key.strip()) <= 160:
            raise HTTPException(400, detail={"code": "INVALID_IDEMPOTENCY_KEY"})
        changes = payload.model_dump(mode="json", exclude_unset=True) if payload is not None else {}
        if operation not in {"create", "update", "duplicate", "delete"}:
            raise ValueError("Unsupported template operation")
        try:
            org = await category_authority(db, actor, audience)
            owner = None if audience == "PLATFORM" else org
            scope = "GLOBAL" if audience == "PLATFORM" else "ORGANIZATION"
            if changes.get("organization_id") not in (None, owner) or changes.get("event_id") is not None:
                raise HTTPException(422, detail={"code": "CATALOGUE_OWNER_IS_SERVER_CONTROLLED"})
            if operation == "create" and changes.get("scope_type", scope) != scope:
                raise HTTPException(422, detail={"code": "USE_SCOPED_CATALOGUE_OR_EVENT_AGGREGATE"})
            if audience == "CUSTOMER" and changes.get("is_default"):
                raise HTTPException(403, detail={"code": "GLOBAL_DEFAULT_IS_PLATFORM_CONTROLLED"})
            receipt = await begin_idempotent(db, organization_id=org, actor_id=actor.id,
                operation=f"registration.{audience.lower()}.form_template.{operation}", key=idempotency_key,
                payload={"id": str(template_id) if template_id else None, "version": expected, "changes": changes})
            replay = replay_response(receipt)
            if replay is not None:
                result = None if operation == "delete" else catalogue_projection(FormTemplateResponse.model_validate(replay[1]))
                await db.commit()
                return result
            if audience == "PLATFORM":
                # Also used by category commands and bounded initial provisioning.
                await db.execute(text("SELECT pg_advisory_xact_lock(1128353876, 1)"))
            from .catalogue_lifecycle_locks import lock_catalogue_reference_writes
            await lock_catalogue_reference_writes(db)
            # NO KEY UPDATE preserves serialization without deadlocking on a
            # competing request's already-inserted receipt foreign key.
            authority_row = await db.scalar(select(Organization).where(Organization.id == org)
                .with_for_update(key_share=True).execution_options(populate_existing=True))
            if authority_row is None:
                raise HTTPException(404, detail="Authority context not found.")
            await category_authority(db, actor, audience)
            previous = None
            source = None
            if operation != "create":
                visibility = and_(FormTemplate.organization_id == owner, FormTemplate.scope_type == scope)
                if operation == "duplicate" and audience == "CUSTOMER":
                    visibility = or_(visibility, and_(FormTemplate.organization_id.is_(None), FormTemplate.scope_type == "GLOBAL"))
                source = await db.scalar(select(FormTemplate).where(FormTemplate.id == template_id,
                    FormTemplate.deleted_at.is_(None), visibility).with_for_update(of=FormTemplate)
                    .execution_options(shared_form_catalogue=True, populate_existing=True))
                if source is None:
                    raise HTTPException(404, detail="Template not found.")
                previous = int(source.version or 1)
                if previous != expected:
                    raise HTTPException(412, detail={"code": "RESOURCE_VERSION_CONFLICT", "current_version": previous})
                if (operation == "update" and source.category_key in OPERATIONAL_TEMPLATE_KEYS
                        and "category_key" in changes and changes["category_key"] != source.category_key):
                    raise HTTPException(409, detail={"code": "TEMPLATE_PURPOSE_IMMUTABLE"})
            if operation == "duplicate":
                if not source.is_active:
                    raise HTTPException(409, detail={"code": "SOURCE_TEMPLATE_INACTIVE"})
                if len(source.fields or []) > 100:
                    raise HTTPException(409, detail={"code": "TEMPLATE_EXCEEDS_FIELD_BOUND"})
                # No event lineage, submitted defaults, credentials or asset/redirect references.
                try:
                    document = CatalogueDocument.model_validate({
                        "fields": source.fields or [], "settings": source.settings or {}})
                    fields = [field.model_dump(mode="json", exclude_none=True) for field in document.fields]
                    for field in fields:
                        field.pop("default_value", None)
                        for option in field.get("options") or []:
                            if isinstance(option, dict):
                                option["is_default"] = False
                        if field["type"] in {"role", "file", "image", "signature"} or field["id"].lower() in {"role", "category"}:
                            field["options"] = []
                except (ValidationError, TypeError, ValueError):
                    raise HTTPException(409, detail={"code": "SOURCE_TEMPLATE_RECONCILIATION_REQUIRED"})
                safe_settings = {key: value for key, value in (source.settings or {}).items() if key in {
                    "submit_button_label", "success_title", "success_message", "allow_multiple_submissions",
                    "require_login", "send_email_confirmation", "enable_terms", "enable_preview", "enable_payment", "steps"}}
                changes = {"name": f"{source.name[:130]} (Custom Copy)", "category_id": str(source.category_id) if source.category_id else None,
                    "category_key": source.category_key, "description": source.description,
                    "fields": fields, "settings": safe_settings, "slug": f"copy-{uuid.uuid4().hex}"}
            category_id = changes.get("category_id", source.category_id if source is not None else None)
            category = None
            if operation != "delete" and category_id is None:
                category_key = changes.get("category_key", source.category_key if source is not None else "registration")
                matches = list((await db.scalars(select(FormCategory).where(
                    FormCategory.slug == category_key, FormCategory.deleted_at.is_(None),
                    FormCategory.is_active.is_(True),
                    or_(FormCategory.organization_id == owner, FormCategory.organization_id.is_(None)))
                    .order_by(FormCategory.id).limit(2).with_for_update(read=True, of=FormCategory)
                    .execution_options(shared_form_catalogue=True))).all())
                if not matches:
                    raise HTTPException(404, detail="Category not found.")
                if len(matches) != 1:
                    raise HTTPException(409, detail={"code": "CATEGORY_RECONCILIATION_REQUIRED"})
                category_id = matches[0].id
            if category_id is not None:
                category = await db.scalar(select(FormCategory).where(FormCategory.id == uuid.UUID(str(category_id)),
                    FormCategory.deleted_at.is_(None), FormCategory.is_active.is_(True),
                    or_(FormCategory.organization_id == owner, FormCategory.organization_id.is_(None)))
                    .with_for_update(read=True, of=FormCategory).execution_options(shared_form_catalogue=True))
                if category is None:
                    raise HTTPException(404, detail="Category not found.")
                if not category_key_matches(
                        changes.get("category_key", source.category_key if source is not None else "registration"), category.slug):
                    raise HTTPException(422, detail={"code": "CATEGORY_ID_KEY_MISMATCH"})
            if operation in ("create", "duplicate"):
                name = changes.get("name", payload.name if payload is not None else "").strip()
                slug = changes.get("slug") or re.sub(r"[^a-z0-9_-]+", "-", name.lower()).strip("-")
                if len(name) < 2 or not slug or len(slug) > 150:
                    raise HTTPException(422, detail={"code": "INVALID_TEMPLATE_NAME"})
                collision = await db.scalar(select(FormTemplate.id).where(FormTemplate.organization_id == owner,
                    FormTemplate.scope_type == scope, FormTemplate.slug == slug, FormTemplate.deleted_at.is_(None))
                    .limit(1).execution_options(shared_form_catalogue=True))
                if collision is not None:
                    raise HTTPException(409, detail={"code": "TEMPLATE_SLUG_CONFLICT"})
                template = FormTemplate(id=uuid.uuid4(), organization_id=owner, created_by=actor.id,
                    scope_type=scope, is_system=audience == "PLATFORM", is_active=True,
                    is_default=bool(changes.get("is_default", False)), version=1, name=name, slug=slug,
                    category_id=uuid.UUID(str(category_id)) if category_id else None,
                    category_key=changes.get("category_key", "registration"), description=changes.get("description"),
                    fields=changes.get("fields", []), settings=changes.get("settings") or {})
                db.add(template)
            else:
                template = source
                if operation == "delete" or changes.get("is_active") is False:
                    if audience == "PLATFORM":
                        raise HTTPException(409, detail={
                            "code": "GLOBAL_TEMPLATE_REPLACEMENT_REQUIRED",
                            "action": f"/api/v1/platform/forms/templates/{template.id}/retire",
                        })
                    references = (
                        select(RegistrationFormConfig.id).where(RegistrationFormConfig.template_id == template.id),
                        select(AbstractForm.id).where(AbstractForm.schema["template_id"].astext == str(template.id)),
                        select(FormTemplate.id).where(FormTemplate.settings["_source_template_id"].astext == str(template.id)),
                    )
                    for query in references:
                        if await db.scalar(query.limit(1)) is not None:
                            raise HTTPException(409, detail={"code": "TEMPLATE_IN_USE"})
                if operation == "delete":
                    template.deleted_at, template.deleted_by, template.is_active = datetime.now(timezone.utc), actor.id, False
                elif operation == "update":
                    for key in ("name", "description", "category_key", "fields", "settings", "is_active"):
                        if key in changes:
                            setattr(template, key, changes[key])
                    if "category_id" in changes:
                        template.category_id = uuid.UUID(str(category_id)) if category_id else None
                    if audience == "PLATFORM" and "is_default" in changes:
                        template.is_default = changes["is_default"]
                else:
                    raise ValueError("Unsupported template operation")
                template.version = previous + 1
                template.updated_at = datetime.now(timezone.utc)
            if audience == "PLATFORM" and template.is_default and template.is_active:
                another_default = await db.scalar(select(FormTemplate.id).where(
                    FormTemplate.id != template.id, FormTemplate.organization_id.is_(None),
                    FormTemplate.scope_type == "GLOBAL", FormTemplate.deleted_at.is_(None),
                    FormTemplate.is_active.is_(True), FormTemplate.is_default.is_(True),
                    FormTemplate.category_key == template.category_key).limit(1)
                    .execution_options(shared_form_catalogue=True))
                if another_default is not None:
                    raise HTTPException(409, detail={"code": "GLOBAL_DEFAULT_CONFLICT"})
            # Reserved lineage is authored only by event aggregate commands.
            if operation != "delete":
                try:
                    document = CatalogueDocument.model_validate({
                        "fields": template.fields or [], "settings": template.settings or {}})
                except (ValidationError, TypeError, ValueError):
                    raise HTTPException(422, detail={"code": "INVALID_CATALOGUE_DOCUMENT"})
                projected = document.model_dump(mode="json", exclude_none=True)
                template.fields, template.settings = projected["fields"], projected["settings"]
                from app.modules.registration.services.managed_form_assets import require_form_assets
                await require_form_assets(db, organization_id=owner,
                    settings=template.settings, lock=True)
            await db.flush()
            from .commands import FormTemplateCommandService
            result = FormTemplateCommandService._response(template) if operation == "delete" else catalogue_projection(template)
            if category is not None:
                result.category_name = category.name
            selector = db.info.get("customer_request_selector")
            db.add(AuditLog(organization_id=org, actor_user_id=actor.id, resource_type="form_template",
                resource_id=template.id, action_type=f"FORM_TEMPLATE_{operation.upper()}",
                correlation_id=receipt.id, old_state={"version": previous},
                new_state={"version": result.version, "audience": audience, "target_organization_id": str(owner) if owner else None,
                    "changed_fields": sorted(changes), "field_count": len(result.fields),
                    "acting_organization_id": str(getattr(selector, "acting_organization_id", None) or org),
                    "access_mode": getattr(selector, "access_mode", "DIRECT")}))
            await complete_idempotent(db, receipt, response_status=204 if operation == "delete" else 201 if operation in ("create", "duplicate") else 200,
                response_body={} if operation == "delete" else result.model_dump(mode="json"), resource_id=template.id)
            await db.commit()
            return None if operation == "delete" else result
        except Exception:
            await db.rollback()
            raise
