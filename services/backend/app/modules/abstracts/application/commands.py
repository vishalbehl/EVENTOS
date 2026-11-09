"""Transaction-owning commands for abstract configuration."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import raiseload

from app.modules.abstracts.models import (
    AbstractCall,
    AbstractCategory,
    AbstractFormat,
    AbstractForm,
    AbstractPortalSettings,
    AbstractTopic,
)
from app.modules.audit.services.audit_service import AuditContext, AuditService


class AbstractConfigurationCommandService:
    """Persist abstract-call and form configuration without router transactions."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _sync_taxonomy(self, model, key, names, *, event, call, uppercase=False):
        normalized = [name.strip().upper() if uppercase else name.strip() for name in names]
        if len(normalized) != len(set(normalized)) or any(not name for name in normalized):
            raise HTTPException(422, detail={"code": "INVALID_ABSTRACT_TAXONOMY"})
        rows = list((await self.db.scalars(select(model).where(
            model.event_id == event.id, model.organization_id == event.organization_id)
            .order_by(model.id).limit(501).with_for_update()
            .execution_options(populate_existing=True))).all())
        if len(rows) > 500:
            raise HTTPException(409, detail={"code": "ABSTRACT_TAXONOMY_RECONCILIATION_REQUIRED"})
        by_name = {getattr(row, key): row for row in rows}
        if len(by_name) != len(rows):
            raise HTTPException(409, detail={"code": "ABSTRACT_TAXONOMY_RECONCILIATION_REQUIRED"})
        retained = set(normalized)
        for row in rows:
            row.is_active = getattr(row, key) in retained
        for index, name in enumerate(normalized):
            row = by_name.get(name)
            if row is None:
                attrs = {key: name}
                if key == "code":
                    attrs["name"] = name.replace("_", " ").title()
                row = model(organization_id=event.organization_id, event_id=event.id,
                    call_id=call.id, **attrs)
                self.db.add(row)
            row.sort_order, row.is_active = index, True

    async def _audit(self, *, event, user, action: str, resource_id, old: dict[str, Any], new: dict[str, Any]) -> None:
        await AuditService.write_log_sync(
            AuditContext(action_type=action, resource_type="abstract", resource_id=resource_id,
                         actor_user_id=user.id, organization_id=event.organization_id,
                         actor_role=getattr(user, "role", None), old_state=old,
                         new_state={**new, "event_id": str(event.id)}),
            self.db,
            commit=False,
        )

    async def update_call(self, *, payload: dict[str, Any], event, user,
                          expected_version: int | str | None, idempotency_key: str | None = None):
        from app.core.concurrency import require_if_match
        from app.core.dependencies.feature_gate import enforce_event_operation
        from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response
        from app.modules.events.models.event import Event
        from app.modules.programme.models import ProgrammeEvaluationPlan
        from app.modules.audit.models.audit_log import AuditLog
        from app.modules.abstracts.call_contracts import AbstractCallPayload, AbstractCallResponse
        from .call_projection import call_response
        from app.core.cache import cache_service
        if user is None:
            raise HTTPException(401, detail={"code": "AUTHENTICATION_REQUIRED"})
        expected = require_if_match(expected_version)
        if not idempotency_key:
            raise HTTPException(428, detail={"code": "IDEMPOTENCY_KEY_REQUIRED"})
        if not 16 <= len(idempotency_key.strip()) <= 160:
            raise HTTPException(400, detail={"code": "INVALID_IDEMPOTENCY_KEY"})
        request = AbstractCallPayload.model_validate(payload)
        payload = request.model_dump()
        organization_id, event_id = event.organization_id, event.id
        try:
            await enforce_event_operation(self.db, organization_id, event_id,
                "abstracts.configure", user_id=user.id)
            receipt = await begin_idempotent(self.db, organization_id=organization_id,
                actor_id=user.id, operation="abstract.call.configuration", key=idempotency_key,
                payload={"event_id": str(event_id), "version": expected,
                    "changes": request.model_dump(mode="json")})
            replay = replay_response(receipt)
            if replay is not None:
                result = AbstractCallResponse.model_validate(replay[1]).model_dump(mode="json")
                await self.db.commit()
                return result
            owned = await self.db.scalar(select(Event).where(Event.id == event_id,
                Event.organization_id == organization_id, Event.deleted_at.is_(None))
                .options(raiseload(Event.portal_theme_setting)).with_for_update(of=Event)
                .execution_options(populate_existing=True))
            if owned is None:
                raise HTTPException(404, detail={"code": "EVENT_NOT_FOUND"})
            await enforce_event_operation(self.db, organization_id, event_id,
                "abstracts.configure", user_id=user.id)
            call = await self.db.scalar(
                select(AbstractCall).where(
                    AbstractCall.event_id == event.id,
                    AbstractCall.organization_id == event.organization_id,
                ).with_for_update().execution_options(populate_existing=True)
            )
            current_version = int(call.version or 1) if call is not None else 1
            if expected != current_version:
                raise HTTPException(412, detail={"code": "RESOURCE_VERSION_CONFLICT", "current_version": current_version})
            if call is None:
                call = AbstractCall(organization_id=event.organization_id, event_id=event.id, version=1)
                self.db.add(call)
            if payload["min_words"] > payload["max_words"]:
                raise HTTPException(status_code=422, detail={"code": "INVALID_WORD_LIMITS"})
            old = {"status": call.status or "DRAFT", "version": current_version}

            # 1. Update direct attributes on AbstractCall
            direct_fields = {
                "status", "opens_at", "closes_at", "revision_deadline", "min_words", "max_words",
                "blind_review_enabled", "allow_coauthors", "max_coauthors", "require_presenter",
                "require_affiliation", "require_country", "max_submissions_per_author",
                "require_attachments", "allowed_file_extensions", "max_file_size_mb",
                "require_disclosures", "evaluation_plan_id", "target_reviews_per_submission",
                "abstract_types", "topics", "author_rules", "attachment_rules", "disclosure_rules",
                "email_triggers",
            }
            for key, value in payload.items():
                if key in direct_fields:
                    if key == "allowed_file_extensions" and isinstance(value, list):
                        value = ",".join(str(x).strip().lstrip(".") for x in value if str(x).strip())
                    setattr(call, key, value)

            # Normalized input columns are authoritative, not truthy legacy JSON flags.
            author_rules = call.author_rules or {}
            plan_ids = {str(value) for value in (payload.get("evaluation_plan_id"),
                author_rules.get("selected_evaluation_plan_id"), author_rules.get("evaluation_plan_id")) if value}
            if len(plan_ids) > 1:
                raise HTTPException(422, detail={"code": "CONFLICTING_EVALUATION_PLAN"})
            if plan_ids:
                import uuid as _uuid
                try:
                    plan_id = _uuid.UUID(next(iter(plan_ids)))
                except (ValueError, TypeError):
                    raise HTTPException(422, detail={"code": "INVALID_EVALUATION_PLAN"})
                plan = await self.db.scalar(select(ProgrammeEvaluationPlan.id).where(
                    ProgrammeEvaluationPlan.id == plan_id,
                    ProgrammeEvaluationPlan.organization_id == organization_id,
                    ProgrammeEvaluationPlan.event_id == event_id,
                    ProgrammeEvaluationPlan.source_type == "ABSTRACT",
                    ProgrammeEvaluationPlan.status == "ACTIVE").with_for_update(read=True))
                if plan is None:
                    raise HTTPException(404, detail={"code": "EVALUATION_PLAN_NOT_FOUND"})
                call.evaluation_plan_id = plan_id

            call.version = int(call.version or 1) + 1
            if call.status == "PUBLISHED" and call.published_at is None:
                call.published_at = datetime.now(timezone.utc)
            await self.db.flush()

            # Constant query count: one bounded batch per taxonomy, no per-item SELECT.
            await self._sync_taxonomy(AbstractTopic, "name", payload["topics"], event=event, call=call)
            await self._sync_taxonomy(AbstractCategory, "name", payload["categories"], event=event, call=call)
            await self._sync_taxonomy(AbstractFormat, "code", payload["abstract_types"], event=event, call=call, uppercase=True)

            # 5. Relational Synchronization for Portal Settings
            raw_portal = payload.get("portal_settings") or (author_rules.get("portal_settings") if isinstance(author_rules, dict) else None)
            if isinstance(raw_portal, dict) and raw_portal:
                portal_row = await self.db.scalar(
                    select(AbstractPortalSettings).where(
                        AbstractPortalSettings.event_id == event.id,
                        AbstractPortalSettings.organization_id == event.organization_id
                    ).with_for_update().execution_options(populate_existing=True)
                )
                if portal_row is None:
                    portal_row = AbstractPortalSettings(
                        organization_id=event.organization_id,
                        event_id=event.id,
                        call_id=call.id,
                    )
                    self.db.add(portal_row)

                sub = raw_portal.get("submission_portal") or {}
                if isinstance(sub, dict):
                    if "access_mode" in sub: portal_row.sub_access_mode = str(sub["access_mode"])
                    if "show_countdown_banner" in sub: portal_row.sub_show_countdown = bool(sub["show_countdown_banner"])
                    if "show_taxonomy_guide" in sub: portal_row.sub_show_taxonomy_guide = bool(sub["show_taxonomy_guide"])
                    if "guidelines_text" in sub: portal_row.sub_guidelines_text = sub["guidelines_text"]
                    if "allow_author_edits" in sub: portal_row.sub_allow_edits = bool(sub["allow_author_edits"])
                    if "allow_author_withdrawal" in sub: portal_row.sub_allow_withdrawal = bool(sub["allow_author_withdrawal"])
                    if "require_coauthor_verification" in sub: portal_row.sub_require_coauthor_verify = bool(sub["require_coauthor_verification"])
                    if "feedback_release_policy" in sub: portal_row.sub_feedback_policy = str(sub["feedback_release_policy"])
                    if "success_message" in sub: portal_row.sub_success_message = sub["success_message"]
                    if "support_email" in sub: portal_row.sub_support_email = sub["support_email"]
                    if "support_phone" in sub: portal_row.sub_support_phone = sub["support_phone"]

                rev = raw_portal.get("review_portal") or {}
                if isinstance(rev, dict):
                    if "redact_author_names" in rev: portal_row.rev_redact_author_names = bool(rev["redact_author_names"])
                    if "redact_affiliations" in rev: portal_row.rev_redact_affiliations = bool(rev["redact_affiliations"])
                    if "redact_coauthors" in rev: portal_row.rev_redact_coauthors = bool(rev["redact_coauthors"])
                    if "peer_visibility_mode" in rev: portal_row.rev_peer_visibility = str(rev["peer_visibility_mode"])
                    if "show_aggregate_scores" in rev: portal_row.rev_show_aggregate_scores = bool(rev["show_aggregate_scores"])
                    if "allow_review_editing" in rev: portal_row.rev_allow_editing = bool(rev["allow_review_editing"])
                    if "mandatory_comments_policy" in rev: portal_row.rev_mandatory_comments = str(rev["mandatory_comments_policy"])
                    if "enforce_coi_declaration" in rev: portal_row.rev_enforce_coi = bool(rev["enforce_coi_declaration"])
                    if "auto_warn_institutional_conflict" in rev: portal_row.rev_auto_warn_institution = bool(rev["auto_warn_institutional_conflict"])
                    if "in_browser_pdf_viewer" in rev: portal_row.rev_in_browser_pdf = bool(rev["in_browser_pdf_viewer"])
                    reminders = rev.get("reminders") or {}
                    if isinstance(reminders, dict):
                        if "remind_72h" in reminders: portal_row.rev_remind_72h = bool(reminders["remind_72h"])
                        if "remind_48h" in reminders: portal_row.rev_remind_48h = bool(reminders["remind_48h"])
                        if "remind_24h" in reminders: portal_row.rev_remind_24h = bool(reminders["remind_24h"])

                portal_row.version = int(portal_row.version or 1) + 1

            await self.db.flush()
            result = (await call_response(self.db, call)).model_dump(mode="json")
            selector = self.db.info.get("customer_request_selector")
            self.db.add(AuditLog(organization_id=organization_id, actor_user_id=user.id,
                resource_type="abstract_call", resource_id=call.id,
                action_type="ABSTRACT_CALL_UPDATED", is_sensitive=True, correlation_id=receipt.id,
                old_state=old, new_state={"status": call.status, "version": call.version,
                    "event_id": str(event_id), "workspace_id": str(owned.operational_workspace_id),
                    "target_organization_id": str(organization_id),
                    "acting_organization_id": str(getattr(selector, "acting_organization_id", None) or organization_id),
                    "access_mode": getattr(selector, "access_mode", "DIRECT")}))
            await complete_idempotent(self.db, receipt, response_status=200,
                response_body=result, resource_id=call.id)
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise
        await cache_service.invalidate_event(organization_id, event_id)
        return result

    async def update_form(self, *, payload: dict[str, Any], event, user,
                          expected_version: int | str | None, idempotency_key: str | None = None):
        from app.core.concurrency import require_if_match
        from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response
        from app.core.dependencies.feature_gate import enforce_event_operation
        from app.core.cache import cache_service
        from app.modules.events.models.event import Event
        from app.modules.audit.models.audit_log import AuditLog
        from app.modules.abstracts.form_contracts import AbstractFormPayload, AbstractFormResponse
        from app.modules.registration.application.commands import (
            FormTemplateCommandService,
            _EVENT_COPY_AUTHORIZATION,
        )
        from app.modules.registration.schemas.form_builder import FormTemplateSaveEventCopy
        from app.modules.registration.models.form_template import FormTemplate
        from pydantic import ValidationError
        if user is None:
            raise HTTPException(401, detail={"code": "AUTHENTICATION_REQUIRED"})
        expected = require_if_match(expected_version)
        if not idempotency_key:
            raise HTTPException(428, detail={"code": "IDEMPOTENCY_KEY_REQUIRED"})
        if not 16 <= len(idempotency_key.strip()) <= 160:
            raise HTTPException(400, detail={"code": "INVALID_IDEMPOTENCY_KEY"})
        try:
            request = AbstractFormPayload.model_validate(payload)
        except ValidationError:
            raise HTTPException(422, detail={"code": "INVALID_FORM_CONFIGURATION"})
        organization_id, event_id = event.organization_id, event.id
        actions = ["abstracts.configure"]
        if request.source_template_id is not None:
            actions.append("registration.forms.manage")
        try:
            for action in actions:
                await enforce_event_operation(self.db, organization_id, event_id, action, user_id=user.id)
            receipt = await begin_idempotent(self.db, organization_id=organization_id,
                actor_id=user.id, operation="abstract.form.configuration",
                key=idempotency_key, payload={"event_id": str(event_id), "version": expected,
                    "changes": request.model_dump(mode="json")})
            replay = replay_response(receipt)
            if replay is not None:
                response = AbstractFormResponse.model_validate(replay[1])
                await self.db.commit()
                return response
            from app.modules.registration.application.catalogue_lifecycle_locks import (
                lock_catalogue_reference_writes,
            )
            await lock_catalogue_reference_writes(self.db)
            owned = await self.db.scalar(select(Event).where(Event.id == event_id,
                Event.organization_id == organization_id, Event.deleted_at.is_(None))
                .options(raiseload(Event.portal_theme_setting)).with_for_update(of=Event)
                .execution_options(populate_existing=True))
            if owned is None:
                raise HTTPException(404, detail="Event not found.")
            rows = list((await self.db.scalars(select(AbstractForm).where(
                AbstractForm.event_id == event_id, AbstractForm.organization_id == organization_id,
                AbstractForm.is_active.is_(True)).order_by(AbstractForm.id).limit(2)
                .with_for_update().execution_options(populate_existing=True))).all())
            if len(rows) > 1:
                raise HTTPException(409, detail={"code": "ABSTRACT_FORM_RECONCILIATION_REQUIRED"})
            form = rows[0] if rows else None
            current_version = int(form.version or 1) if form is not None else 1
            if expected != current_version:
                raise HTTPException(412, detail={"code": "RESOURCE_VERSION_CONFLICT",
                    "current_version": current_version})
            schema = dict(request.form_schema)
            from app.modules.registration.services.managed_form_assets import require_form_assets
            await require_form_assets(self.db, organization_id=organization_id,
                settings=schema.get("settings") or {}, lock=True)
            saved = None
            if request.source_template_id is not None:
                source = await self.db.scalar(select(FormTemplate).where(
                    FormTemplate.id == request.source_template_id,
                    FormTemplate.deleted_at.is_(None),
                    or_(and_(FormTemplate.scope_type == "GLOBAL", FormTemplate.organization_id.is_(None)),
                        and_(FormTemplate.organization_id == organization_id,
                            FormTemplate.scope_type == "ORGANIZATION"),
                        and_(FormTemplate.organization_id == organization_id,
                            FormTemplate.scope_type == "EVENT",
                            FormTemplate.settings["_event_id"].astext == str(event_id))))
                    .with_for_update(of=FormTemplate)
                    .execution_options(shared_form_catalogue=True, populate_existing=True))
                if source is None:
                    raise HTTPException(404, detail="Template not found.")
                if source.category_key != "abstract":
                    raise HTTPException(422, detail={"code": "ABSTRACT_TEMPLATE_REQUIRED"})
                copy_payload = FormTemplateSaveEventCopy(event_id=event_id, name=request.title,
                    fields=schema.get("fields", []), settings=schema.get("settings", {}))
                saved = await FormTemplateCommandService.save_event_copy(self.db,
                    source_template_id=source.id, payload=copy_payload, actor=user,
                    if_match=str(request.source_version), idempotency_key=idempotency_key,
                    _transaction_receipt=receipt, _organization_id=organization_id,
                    _authorization_proof=_EVENT_COPY_AUTHORIZATION)
                schema["template_id"] = str(saved.id)
                schema["fields"], schema["settings"] = saved.fields, saved.settings
            else:
                linked = schema.get("template_id")
                previous_link = (form.schema or {}).get("template_id") if form is not None else "tpl_abstract_submission"
                if linked is not None and str(linked) != str(previous_link):
                    raise HTTPException(422, detail={"code": "VERSIONED_TEMPLATE_SOURCE_REQUIRED"})
                if previous_link is not None:
                    schema["template_id"] = previous_link
                from types import SimpleNamespace
                import uuid
                from app.modules.registration.application.aggregate_reference_validation import aggregate_reference_issues
                candidate = SimpleNamespace(id=form.id if form is not None else uuid.uuid4(),
                    organization_id=organization_id, event_id=event_id, schema=schema, is_active=True)
                issues = (await aggregate_reference_issues(self.db, rows=[candidate],
                    organization_id=organization_id, resource_type="ABSTRACT_FORM", lock=True))[candidate.id]
                if issues:
                    raise HTTPException(409, detail={"code": "ABSTRACT_TEMPLATE_RECONCILIATION_REQUIRED"})
                try:
                    linked_id = uuid.UUID(str(previous_link)) if previous_link else None
                except ValueError:
                    linked_id = None
                if linked_id is not None:
                    template = await self.db.scalar(select(FormTemplate).where(
                        FormTemplate.id == linked_id, FormTemplate.category_key == "abstract",
                        FormTemplate.is_active.is_(True),
                        FormTemplate.deleted_at.is_(None),
                        or_(and_(FormTemplate.scope_type == "GLOBAL", FormTemplate.organization_id.is_(None)),
                            and_(FormTemplate.scope_type == "ORGANIZATION", FormTemplate.organization_id == organization_id),
                            and_(FormTemplate.scope_type == "EVENT", FormTemplate.organization_id == organization_id,
                                FormTemplate.settings["_event_id"].astext == str(event_id))))
                        .with_for_update(read=True, of=FormTemplate)
                        .execution_options(shared_form_catalogue=True, populate_existing=True))
                    if template is None:
                        raise HTTPException(409, detail={"code": "ABSTRACT_TEMPLATE_RECONCILIATION_REQUIRED"})
                    from app.modules.registration.schemas.event_form_contracts import abstract_schema_projection
                    try:
                        previous_schema = abstract_schema_projection(form.schema or {}, stored=True, event_id=event_id)
                        for key in ("event_id", "_event_id", "_source_template_id"):
                            previous_schema["settings"].pop(key, None)
                    except ValueError:
                        raise HTTPException(409, detail={"code": "ABSTRACT_FORM_RECONCILIATION_REQUIRED"})
                    if (request.title != form.title or
                        any(schema.get(key) != previous_schema.get(key) for key in ("fields", "settings"))):
                        raise HTTPException(422, detail={"code": "VERSIONED_TEMPLATE_SOURCE_REQUIRED"})
                    saved = FormTemplateCommandService._response(template)
            if form is None:
                form = AbstractForm(organization_id=organization_id, event_id=event_id, version=1)
                self.db.add(form)
            form.title, form.schema, form.is_active = request.title, schema, True
            form.version = current_version + 1
            form.published_at = (form.published_at or datetime.now(timezone.utc)) if request.publish else None
            await self.db.flush()
            response = AbstractFormResponse(id=form.id, event_id=event_id, title=form.title,
                schema=form.schema, is_active=True, publish=bool(form.published_at),
                version=form.version, published_at=form.published_at, saved_template=saved)
            selector = self.db.info.get("customer_request_selector")
            self.db.add(AuditLog(organization_id=organization_id, actor_user_id=user.id,
                resource_type="abstract_form", resource_id=form.id,
                action_type="ABSTRACT_FORM_UPDATED", correlation_id=receipt.id,
                old_state={"version": current_version},
                new_state={"version": form.version, "published": bool(form.published_at),
                    "event_id": str(event_id), "workspace_id": str(owned.operational_workspace_id),
                    "target_organization_id": str(organization_id),
                    "acting_organization_id": str(getattr(selector, "acting_organization_id", None) or organization_id),
                    "access_mode": getattr(selector, "access_mode", "DIRECT")}))
            await complete_idempotent(self.db, receipt, response_status=200,
                response_body=response.model_dump(mode="json", by_alias=True), resource_id=form.id)
            await self.db.commit()
        except ValidationError:
            await self.db.rollback()
            raise HTTPException(422, detail={"code": "INVALID_TEMPLATE_CONFIGURATION"})
        except Exception:
            await self.db.rollback()
            raise
        await cache_service.invalidate_domain("registration_form", organization_id, event_id)
        return response
