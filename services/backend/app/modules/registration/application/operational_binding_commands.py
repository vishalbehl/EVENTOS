"""Versioned event-purpose form binding with atomic copy, audit, and receipt."""
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import joinedload, raiseload

from app.core.concurrency import require_if_match
from app.core.dependencies.feature_gate import enforce_event_operation
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response
from app.modules.audit.models.audit_log import AuditLog
from app.modules.events.models.event import Event
from app.modules.registration.models.form_template import EventFormTemplateBinding, FormTemplate
from app.modules.registration.models.form_category import FormCategory
from app.modules.registration.schemas.form_builder import FormTemplateSaveEventCopy
from app.modules.registration.schemas.operational_binding import OperationalBindingResponse
from app.modules.registration.application.commands import (
    FormTemplateCommandService,
    _EVENT_COPY_AUTHORIZATION,
)

PURPOSE_CATEGORY = {"SPEAKER_INTAKE": "speaker_intake", "SURVEY": "survey"}


async def _validated_binding(db, *, event, purpose, public=False):
    """Read one binding/hierarchy under the same fence as reference writers.

    Absence and configured-but-unavailable are different states. Global taxonomy
    parents are allowed, never another customer's category or conflicting event
    markers. Historical source lineage is provenance, not a live grant.
    """
    from .catalogue_lifecycle_locks import lock_catalogue_reference_writes
    await lock_catalogue_reference_writes(db)
    binding = await db.scalar(select(EventFormTemplateBinding).where(
        EventFormTemplateBinding.organization_id == event.organization_id,
        EventFormTemplateBinding.event_id == event.id,
        EventFormTemplateBinding.purpose == purpose).execution_options(populate_existing=True))
    if binding is None:
        return None, None
    template = await db.scalar(select(FormTemplate).where(
        FormTemplate.id == binding.template_id,
        FormTemplate.organization_id == event.organization_id,
        FormTemplate.scope_type == "EVENT", FormTemplate.is_active.is_(True),
        FormTemplate.deleted_at.is_(None)).options(joinedload(FormTemplate.category.and_(or_(
            FormCategory.organization_id.is_(None), FormCategory.organization_id == event.organization_id))))
        .execution_options(shared_form_catalogue=True, populate_existing=True))
    expected = {"speaker", "speaker_intake"} if purpose == "SPEAKER_INTAKE" else {"survey"}
    valid = template is not None and template.category_key in expected and isinstance(template.settings, dict)
    if valid:
        markers = [template.settings[key] for key in ("_event_id", "event_id")
            if template.settings.get(key) is not None]
        valid = bool(markers) and all(str(value) == str(event.id) for value in markers)
        if valid and template.category_id is not None:
            category = template.category
            valid = (category is not None and category.is_active and category.deleted_at is None
                and category.organization_id in (None, event.organization_id))
        if valid:
            from .template_lineage import require_historical_lineage
            try:
                await require_historical_lineage(db, template)
            except HTTPException:
                valid = False
    if not valid:
        raise HTTPException(503 if public else 409, detail={"code":
            "OPERATIONAL_FORM_RECONCILIATION_REQUIRED" if public else "FORM_BINDING_RECONCILIATION_REQUIRED"})
    return binding, template


def _response(binding, event_id, purpose, template=None):
    return OperationalBindingResponse(
        id=binding.id if binding else None, event_id=event_id, purpose=purpose,
        template_id=binding.template_id if binding else None,
        version=int(binding.version or 1) if binding else 1, template=template)


async def get_operational_binding(db, *, event, purpose):
    if purpose not in PURPOSE_CATEGORY:
        raise HTTPException(404, detail={"code": "FORM_BINDING_NOT_FOUND"})
    binding, template = await _validated_binding(db, event=event, purpose=purpose)
    if binding is None:
        return _response(None, event.id, purpose)
    return _response(binding, event.id, purpose, FormTemplateCommandService._response(template))


async def get_operational_form_projection(db, *, event, purpose):
    """Allowlisted runtime document for an already-authorised event consumer."""
    if purpose not in PURPOSE_CATEGORY:
        return None
    binding, template = await _validated_binding(db, event=event, purpose=purpose, public=True)
    if binding is None:
        return None
    try:
        from app.modules.registration.schemas.event_form_contracts import public_form_projection
        from app.modules.registration.services.managed_form_assets import document_asset_ids, require_form_assets
        document = public_form_projection(template.fields or [], template.settings or {}, event_id=event.id)
        await require_form_assets(db, organization_id=event.organization_id, settings=document["settings"])
    except HTTPException as exc:
        if exc.status_code in {409, 422}:
            raise HTTPException(503, detail={"code": "OPERATIONAL_FORM_UNAVAILABLE"}) from exc
        raise
    except (TypeError, ValueError) as exc:
        raise HTTPException(503, detail={"code": "OPERATIONAL_FORM_RECONCILIATION_REQUIRED"}) from exc
    asset_ids = document_asset_ids(document["settings"])
    if asset_ids:
        asset_id = next(iter(asset_ids))
        public_theme = document["settings"].setdefault("theme", {})
        public_theme.pop("header_banner_asset_id", None)
        public_theme["header_banner_url"] = f"/api/v1/public/events/{event.id}/form-assets/{asset_id}"
    return {"purpose": purpose, "title": template.name, "fields": document["fields"],
        "settings": document["settings"], "binding_version": int(binding.version or 1),
        "template_version": int(template.version or 1)}


async def update_operational_binding(db, *, event, purpose, payload, actor,
                                     if_match=None, idempotency_key=None):
    if purpose not in PURPOSE_CATEGORY:
        raise HTTPException(404, detail={"code": "FORM_BINDING_NOT_FOUND"})
    expected = require_if_match(if_match)
    if not idempotency_key:
        raise HTTPException(428, detail={"code": "IDEMPOTENCY_KEY_REQUIRED"})
    key = idempotency_key.strip()
    if not 16 <= len(key) <= 160:
        raise HTTPException(400, detail={"code": "INVALID_IDEMPOTENCY_KEY"})
    organization_id = event.organization_id
    try:
        await enforce_event_operation(db, organization_id, event.id,
            "registration.forms.manage", user_id=actor.id)
        receipt = await begin_idempotent(db, organization_id=organization_id, actor_id=actor.id,
            operation=f"registration.operational-form.{purpose.lower()}", key=key,
            payload={"event_id": str(event.id), "purpose": purpose, "version": expected,
                "changes": payload.model_dump(mode="json")})
        replay = replay_response(receipt)
        if replay is not None:
            result = OperationalBindingResponse.model_validate(replay[1])
            await db.commit()
            return result
        from .catalogue_lifecycle_locks import lock_catalogue_reference_writes
        await lock_catalogue_reference_writes(db)
        owned = await db.scalar(select(Event).where(Event.id == event.id,
            Event.organization_id == organization_id, Event.deleted_at.is_(None))
            .options(raiseload(Event.portal_theme_setting)).with_for_update(of=Event)
            .execution_options(populate_existing=True))
        if owned is None:
            raise HTTPException(404, detail={"code": "EVENT_NOT_FOUND"})
        binding = await db.scalar(select(EventFormTemplateBinding).where(
            EventFormTemplateBinding.organization_id == organization_id,
            EventFormTemplateBinding.event_id == event.id,
            EventFormTemplateBinding.purpose == purpose).with_for_update()
            .execution_options(populate_existing=True))
        current_version = int(binding.version or 1) if binding else 1
        if current_version != expected:
            raise HTTPException(412, detail={"code": "RESOURCE_VERSION_CONFLICT",
                "current_version": current_version})
        copy_payload = FormTemplateSaveEventCopy(event_id=event.id, name=payload.name,
            fields=payload.fields, settings=payload.settings)
        saved = await FormTemplateCommandService.save_event_copy(db,
            source_template_id=payload.source_template_id, payload=copy_payload, actor=actor,
            if_match=str(payload.source_version), idempotency_key=key,
            _transaction_receipt=receipt, _organization_id=organization_id,
            _authorization_proof=_EVENT_COPY_AUTHORIZATION)
        expected_categories = {"speaker", "speaker_intake"} if purpose == "SPEAKER_INTAKE" else {"survey"}
        if saved.category_key not in expected_categories:
            raise HTTPException(422, detail={"code": "FORM_BINDING_CATEGORY_MISMATCH"})
        if binding is None:
            binding = EventFormTemplateBinding(organization_id=organization_id,
                event_id=event.id, purpose=purpose, template_id=saved.id,
                version=2, created_by=actor.id, updated_by=actor.id)
            db.add(binding)
        else:
            binding.template_id = saved.id
            binding.version = current_version + 1
            binding.updated_by = actor.id
            binding.updated_at = datetime.now(timezone.utc)
        await db.flush()
        result = _response(binding, event.id, purpose, saved)
        selector = db.info.get("customer_request_selector")
        db.add(AuditLog(organization_id=organization_id, actor_user_id=actor.id,
            resource_type="event_form_binding", resource_id=binding.id,
            action_type="EVENT_FORM_BINDING_UPDATED", correlation_id=receipt.id,
            old_state={"version": current_version}, new_state={"version": binding.version,
                "purpose": purpose, "template_id": str(saved.id), "event_id": str(event.id),
                "workspace_id": str(owned.operational_workspace_id),
                "acting_organization_id": str(getattr(selector, "acting_organization_id", None) or organization_id),
                "target_organization_id": str(organization_id),
                "access_mode": getattr(selector, "access_mode", "DIRECT")}))
        await complete_idempotent(db, receipt, response_status=200,
            response_body=result.model_dump(mode="json"), resource_id=binding.id)
        await db.commit()
        return result
    except Exception:
        await db.rollback()
        raise
