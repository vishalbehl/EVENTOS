"""Reviewed repair commands for blocked historical event-form aggregates."""
import uuid
from contextlib import AsyncExitStack
from datetime import datetime, timezone

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select, text

from app.core.concurrency import require_if_match
from app.core.tenant_context import TenantContextGuard
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response
from app.modules.abstracts.models import AbstractForm
from app.modules.audit.models.audit_log import AuditLog
from app.modules.events.models.event import Event
from app.modules.platform.models.organization import Organization
from app.modules.programme.models import ProgrammeEvaluationPlan
from app.modules.rbac.services.platform_permissions import platform_permission_authority
from app.modules.registration.models.catalogue_reconciliation import CatalogueDocumentReconciliation
from app.modules.registration.models.form_category import FormCategory, FormCategoryReconciliation
from app.modules.registration.schemas.catalogue_contracts import CategoryRepairDocument
from app.modules.registration.models.registration_form_config import RegistrationFormConfig
from app.modules.registration.schemas.event_form_contracts import abstract_schema_projection, evaluation_rubric_projection, form_document


async def repair_aggregate_document(db, *, resource_type, resource_id, payload,
                                    actor, if_match, idempotency_key):
    expected = require_if_match(if_match)
    from app.modules.rbac.services.platform_permissions import lock_platform_permission
    authority = await lock_platform_permission(db, actor.id, "platform:administration:manage")
    if not idempotency_key:
        raise HTTPException(428, detail={"code": "IDEMPOTENCY_KEY_REQUIRED"})
    if resource_type not in {"FORM_CATEGORY", "REGISTRATION_FORM", "ABSTRACT_FORM", "PROGRAMME_RUBRIC"}:
        raise HTTPException(404, detail={"code": "RECONCILIATION_RESOURCE_NOT_FOUND"})
    if payload.detach_invalid_registration_references and resource_type != "REGISTRATION_FORM":
        raise HTTPException(409, detail={"code": "REFERENCE_DETACH_REQUIRES_REGISTRATION_FORM"})
    platform_scope, target_scope = AsyncExitStack(), AsyncExitStack()
    try:
        await platform_scope.enter_async_context(TenantContextGuard.scoped(db, authority))
        receipt = await begin_idempotent(db, organization_id=authority, actor_id=actor.id,
            operation=f"registration.platform.aggregate-repair.{resource_type.lower()}",
            key=idempotency_key, payload={"resource_id": str(resource_id),
                "version": expected, "document": payload.document, "reason": payload.reason,
                **({"detach_invalid_registration_references": True} if payload.detach_invalid_registration_references else {})})
        replay = replay_response(receipt)
        if replay is not None:
            await db.commit()
            return replay[1]
        from .catalogue_lifecycle_locks import lock_catalogue_reference_writes, lock_category_retirement
        if resource_type == "FORM_CATEGORY":
            await lock_category_retirement(db)
        else:
            await lock_catalogue_reference_writes(db)
        await platform_permission_authority(db, actor.id, "platform:administration:manage")
        global_category = resource_type == "FORM_CATEGORY" and await db.scalar(
            select(FormCategory.id).where(FormCategory.id == resource_id,
                FormCategory.organization_id.is_(None), FormCategory.deleted_at.is_(None))
            .execution_options(shared_form_catalogue=True)) is not None
        target_organization = None
        if not global_category:
            # This is an allowlisted immutable-evidence owner projection under
            # the explicit platform read policy, not a customer-table bypass.
            # A caller's resource ID alone cannot manufacture a repair scope.
            evidence = CatalogueDocumentReconciliation.__table__.c
            owners = list((await db.scalars(select(evidence.organization_id).where(
                evidence.resource_type == resource_type, evidence.resource_id == resource_id,
                evidence.operation == "DOCUMENT_VALIDATION", evidence.status == "BLOCKED")
                .distinct().limit(2))).all())
            if len(owners) != 1 or not isinstance(owners[0], uuid.UUID):
                raise HTTPException(404, detail={"code": "RECONCILIATION_RESOURCE_NOT_FOUND"})
            target_organization = owners[0]
            await target_scope.enter_async_context(TenantContextGuard.scoped(db, target_organization))
        projected = None
        if resource_type == "FORM_CATEGORY":
            ownership = (await db.execute(select(FormCategory.id, FormCategory.organization_id).where(
                FormCategory.id == resource_id,
                FormCategory.deleted_at.is_(None),
            ).execution_options(shared_form_catalogue=True))).one_or_none()
            if ownership is None:
                raise HTTPException(404, detail={"code": "RECONCILIATION_RESOURCE_NOT_FOUND"})
            owner_id = ownership.organization_id
            global_category = owner_id is None
            # PostgreSQL NO KEY UPDATE still serializes lifecycle changes, but
            # is compatible with receipt FK KEY SHARE locks held by waiters.
            owner = await db.scalar(select(Organization).where(
                Organization.id == (authority if global_category else owner_id)).with_for_update(key_share=True)
                .execution_options(populate_existing=True))
            if owner is None:
                raise HTTPException(404, detail={"code": "RECONCILIATION_RESOURCE_NOT_FOUND"})
            if not owner.is_active or owner.suspended_at is not None or owner.archived_at is not None:
                raise HTTPException(409, detail={"code": "ORGANIZATION_NOT_OPERATIONAL"})
            row = await db.scalar(select(FormCategory).where(
                FormCategory.id == resource_id,
                FormCategory.organization_id == owner_id,
                FormCategory.deleted_at.is_(None),
            ).with_for_update(of=FormCategory)
             .execution_options(shared_form_catalogue=True, populate_existing=True))
            if row is None:
                raise HTTPException(404, detail={"code": "RECONCILIATION_RESOURCE_NOT_FOUND"})
            if not row.is_active:
                raise HTTPException(409, detail={"code": "CATEGORY_RETIRED"})
            organization_id = row.organization_id
            try:
                category_document = CategoryRepairDocument.model_validate(payload.document)
            except ValidationError as exc:
                raise HTTPException(422, detail={
                    "code": "INVALID_CATEGORY_REPAIR_DOCUMENT",
                    "errors": exc.errors(include_url=False, include_input=False),
                }) from exc
        elif resource_type == "REGISTRATION_FORM":
            pair = (await db.execute(select(RegistrationFormConfig, Event.organization_id).join(
                Event, Event.id == RegistrationFormConfig.event_id).where(
                RegistrationFormConfig.id == resource_id,
                Event.organization_id == target_organization).with_for_update(
                    of=RegistrationFormConfig))).one_or_none()
            if pair is None:
                raise HTTPException(404, detail={"code": "RECONCILIATION_RESOURCE_NOT_FOUND"})
            row, organization_id = pair
            if set(payload.document) - {"fields", "settings"}:
                raise HTTPException(422, detail={"code": "INVALID_REGISTRATION_REPAIR_DOCUMENT"})
            projected = form_document(payload.document.get("fields", []),
                payload.document.get("settings", {}), event_id=row.event_id)
        elif resource_type == "PROGRAMME_RUBRIC":
            if set(payload.document) != {"rubric"} or len(payload.reason.strip()) < 8:
                raise HTTPException(422, detail={"code": "INVALID_PROGRAMME_RUBRIC_REPAIR_DOCUMENT"})
            projected = {"rubric": evaluation_rubric_projection(payload.document["rubric"])}
            event_id = await db.scalar(select(ProgrammeEvaluationPlan.event_id).where(
                ProgrammeEvaluationPlan.id == resource_id,
                ProgrammeEvaluationPlan.organization_id == target_organization))
            if event_id is None:
                raise HTTPException(404, detail={"code": "RECONCILIATION_RESOURCE_NOT_FOUND"})
            from app.modules.programme.rubric_integrity import lock_scoring_event, require_unscored_event
            owned_event = await lock_scoring_event(db, organization_id=target_organization,
                event_id=event_id, exclusive=True)
            row = await db.scalar(select(ProgrammeEvaluationPlan).where(
                ProgrammeEvaluationPlan.id == resource_id,
                ProgrammeEvaluationPlan.organization_id == target_organization,
                ProgrammeEvaluationPlan.event_id == event_id).with_for_update()
                .execution_options(populate_existing=True))
            if row is None:
                raise HTTPException(404, detail={"code": "RECONCILIATION_RESOURCE_NOT_FOUND"})
            organization_id = target_organization
        else:
            row = await db.scalar(select(AbstractForm).where(AbstractForm.id == resource_id,
                AbstractForm.organization_id == target_organization)
                .with_for_update(of=AbstractForm))
            if row is None:
                raise HTTPException(404, detail={"code": "RECONCILIATION_RESOURCE_NOT_FOUND"})
            organization_id = row.organization_id
            projected = abstract_schema_projection(payload.document,
                event_id=row.event_id)
        reference_detachment = None
        if resource_type == "REGISTRATION_FORM":
            from .aggregate_reference_validation import aggregate_reference_issues
            issues = (await aggregate_reference_issues(db, rows=[row], organization_id=organization_id,
                resource_type=resource_type, lock=True))[row.id]
            if payload.detach_invalid_registration_references:
                if not issues:
                    raise HTTPException(409, detail={"code": "REFERENCE_DETACH_NOT_REQUIRED"})
                reference_detachment = {}
                if "TEMPLATE_REFERENCE_UNAVAILABLE" in issues:
                    reference_detachment["previous_template_id"] = str(row.template_id)
                    row.template_id = None
                if "CATEGORY_REFERENCE_UNAVAILABLE" in issues:
                    reference_detachment["previous_category_id"] = str(row.category_id)
                    row.category_id = None
            elif issues:
                raise HTTPException(409, detail={"code": "FORM_TEMPLATE_RECONCILIATION_REQUIRED"
                    if "TEMPLATE_REFERENCE_UNAVAILABLE" in issues else "FORM_CATEGORY_RECONCILIATION_REQUIRED"})
        elif resource_type == "ABSTRACT_FORM":
            from types import SimpleNamespace
            from .aggregate_reference_validation import aggregate_reference_issues
            candidate = SimpleNamespace(id=row.id, event_id=row.event_id,
                organization_id=organization_id, schema=projected, is_active=True)
            issues = (await aggregate_reference_issues(db, rows=[candidate], organization_id=organization_id,
                resource_type="ABSTRACT_FORM", lock=True))[row.id]
            if issues:
                raise HTTPException(409, detail={"code": "ABSTRACT_TEMPLATE_RECONCILIATION_REQUIRED"})
        current = int(row.version or 1)
        if current != expected:
            raise HTTPException(412, detail={"code": "RESOURCE_VERSION_CONFLICT",
                "current_version": current})
        if global_category:
            blocked = await db.scalar(select(FormCategoryReconciliation.id).where(
                FormCategoryReconciliation.category_id == row.id,
                FormCategoryReconciliation.category_version == current,
                FormCategoryReconciliation.operation == "TAXONOMY_VALIDATION",
                FormCategoryReconciliation.status == "BLOCKED"))
        else:
            blocked = await db.scalar(select(CatalogueDocumentReconciliation.id).where(
                CatalogueDocumentReconciliation.resource_type == resource_type,
                CatalogueDocumentReconciliation.resource_id == row.id,
                CatalogueDocumentReconciliation.resource_version == current,
                CatalogueDocumentReconciliation.operation == "DOCUMENT_VALIDATION",
                CatalogueDocumentReconciliation.status == "BLOCKED"))
        if blocked is None:
            raise HTTPException(409, detail={"code": "RESOURCE_IS_NOT_BLOCKED"})
        if resource_type == "PROGRAMME_RUBRIC":
            await require_unscored_event(db, organization_id=organization_id, event_id=row.event_id)
        if resource_type == "FORM_CATEGORY":
            duplicate = await db.scalar(select(FormCategory.id).where(
                FormCategory.id != row.id,
                FormCategory.organization_id == organization_id,
                FormCategory.slug == category_document.slug,
                FormCategory.is_active.is_(True),
                FormCategory.deleted_at.is_(None),
            ).limit(1).execution_options(shared_form_catalogue=True))
            if duplicate is not None:
                raise HTTPException(409, detail={"code": "CATEGORY_SLUG_CONFLICT"})
            from .category_key_projection import normalize_category_template_keys
            templates_updated, blocked_carried = await normalize_category_template_keys(db,
                category_id=row.id, organization_id=organization_id,
                slug=category_document.slug, actor_id=actor.id)
            row.name = category_document.name
            row.slug = category_document.slug
            row.description = category_document.description
            row.icon = category_document.icon
            row.sort_order = category_document.sort_order
            repair_details = {"resulting_version": current + 1,
                "templates_updated": templates_updated,
                "blocked_template_evidence_carried": blocked_carried}
        elif resource_type == "PROGRAMME_RUBRIC":
            row.rubric = projected["rubric"]
            repair_details = {"resulting_version": current + 1,
                "acting_organization_id": str(authority), "target_organization_id": str(organization_id),
                "event_id": str(row.event_id), "workspace_id": str(owned_event.operational_workspace_id)}
        else:
            from app.modules.registration.services.managed_form_assets import require_form_assets
            settings = projected.get("settings") or {}
            await require_form_assets(db, organization_id=organization_id,
                settings=settings, lock=True)
            if resource_type == "REGISTRATION_FORM":
                row.fields, row.settings = projected["fields"], projected["settings"]
            else:
                row.schema = projected
            repair_details = {"resulting_version": current + 1,
                **({"reference_detachment": reference_detachment} if reference_detachment is not None else {})}
        row.version = current + 1
        row.updated_at = datetime.now(timezone.utc)
        if reference_detachment is not None:
            db.add(CatalogueDocumentReconciliation(organization_id=organization_id, event_id=row.event_id,
                resource_type=resource_type, resource_id=row.id, resource_version=current,
                operation="CATALOGUE_REF_DETACHMENT", status="COMPLETED", reason=payload.reason,
                details={**reference_detachment, "resulting_version": row.version}, actor_user_id=actor.id))
        if global_category:
            db.add(FormCategoryReconciliation(category_id=row.id, category_version=current,
                operation="EXPLICIT_REPAIR", status="COMPLETED", reason=payload.reason,
                details=repair_details, actor_user_id=actor.id))
            db.add(FormCategoryReconciliation(category_id=row.id, category_version=row.version,
                operation="TAXONOMY_VALIDATION", status="VALID",
                reason="Validated by reviewed explicit repair.",
                details={"repaired_from_version": current}, actor_user_id=actor.id))
        else:
            db.add(CatalogueDocumentReconciliation(organization_id=organization_id,
                event_id=getattr(row, "event_id", None), resource_type=resource_type, resource_id=row.id,
                resource_version=current, operation="EXPLICIT_REPAIR", status="COMPLETED",
                reason=payload.reason, details=repair_details,
                actor_user_id=actor.id))
            db.add(CatalogueDocumentReconciliation(organization_id=organization_id,
                event_id=getattr(row, "event_id", None), resource_type=resource_type, resource_id=row.id,
                resource_version=row.version, operation="DOCUMENT_VALIDATION", status="VALID",
                reason="Validated by reviewed explicit repair.",
                details={"repaired_from_version": current}, actor_user_id=actor.id))
        result = {"resource_type": resource_type, "resource_id": str(row.id),
            "previous_version": current, "version": row.version, "status": "REPAIRED"}
        db.add(AuditLog(organization_id=authority if global_category else organization_id, actor_user_id=actor.id,
            resource_type=resource_type.lower(), resource_id=row.id,
            action_type="CATALOGUE_AGGREGATE_EXPLICIT_REPAIR", is_sensitive=True,
            correlation_id=receipt.id, old_state={"version": current},
            new_state={**result, "reason": payload.reason, **repair_details}))
        # Persist customer rows and mandatory audit under customer RLS, then
        # finish the platform-owned receipt under its original platform scope.
        await db.flush()
        await target_scope.aclose()
        await complete_idempotent(db, receipt, response_status=200,
            response_body=result, resource_id=row.id)
        await db.commit()
        return result
    except (ValidationError, ValueError, TypeError):
        await db.rollback()
        raise HTTPException(422, detail={"code": "INVALID_AGGREGATE_REPAIR_DOCUMENT"}) from None
    except Exception:
        await db.rollback()
        raise
    finally:
        await target_scope.aclose()
        await platform_scope.aclose()
