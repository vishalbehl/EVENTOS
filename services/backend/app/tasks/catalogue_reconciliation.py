"""Bounded, tenant-scoped fan-out for historical form and taxonomy validation."""
from __future__ import annotations

import uuid
from contextlib import AsyncExitStack
from datetime import datetime, timedelta, timezone

from pydantic import ValidationError
from sqlalchemy import and_, func, or_, select, text, tuple_

from app.database import AsyncSessionLocal
from app.worker import celery_app
from app.core.async_runner import run_async
from app.core.task_policy import is_retryable, policy_for
from app.core.tenant_context import TenantContextGuard
from app.modules.abstracts.models import AbstractForm
from app.modules.events.models.event import Event
from app.modules.identity.models.user import User
from app.modules.platform.models.organization import Organization
from app.modules.programme.models import ProgrammeEvaluationPlan
from app.modules.rbac.services.platform_permissions import platform_permission_authority
from app.modules.registration.models.catalogue_reconciliation import CatalogueDocumentReconciliation
from app.modules.registration.models.catalogue_reconciliation import CatalogueReconciliationRun
from app.modules.registration.models.form_category import FormCategory, FormCategoryReconciliation
from app.modules.registration.models.form_template import FormTemplate, FormTemplateReconciliation
from app.modules.registration.models.registration_form_config import RegistrationFormConfig
from app.modules.registration.schemas.catalogue_contracts import CatalogueDocument
from app.modules.registration.schemas.event_form_contracts import abstract_schema_projection, form_document

_POLICY = policy_for("reconciliation")
_LEGACY_STAGES = ("FORM_CATEGORY", "FORM_TEMPLATE", "REGISTRATION_FORM", "ABSTRACT_FORM")
_STAGES = (*_LEGACY_STAGES, "PROGRAMME_RUBRIC")
_PAGE_SIZE = 100
_MAX_DISPATCH_ATTEMPTS = 30
_RUN_LEASE_SECONDS = _POLICY.hard_timeout_seconds + 60


def _matches_dispatch_attempt(row, expected_attempt):
    # Pre-upgrade three-argument messages may participate in generation one
    # only. Recovered generations must carry their committed attempt number.
    expected = 1 if expected_attempt is None else expected_attempt
    return (type(expected) is int and 1 <= expected <= _MAX_DISPATCH_ATTEMPTS
        and row.dispatch_attempts == expected)


def _task_options(name: str) -> dict:
    return dict(bind=True, name=name, queue="reconciliation", acks_late=True,
        max_retries=_POLICY.max_retries)


async def _authorise_platform_actor(db, actor_id: uuid.UUID, *, for_write=False) -> uuid.UUID:
    if for_write:
        from app.modules.rbac.services.platform_permissions import lock_platform_permission
        await lock_platform_permission(db, actor_id, "platform:administration:manage")
    else:
        await platform_permission_authority(db, actor_id, "platform:administration:manage")
    identity, organization = User.__table__.c, Organization.__table__.c
    organization_id = await db.scalar(select(identity.organization_id).select_from(
        User.__table__.join(Organization.__table__, organization.id == identity.organization_id)).where(
        identity.id == actor_id,
        identity.is_active.is_(True),
        identity.deleted_at.is_(None),
        organization.is_platform_org.is_(True),
        organization.is_active.is_(True),
        organization.suspended_at.is_(None),
        organization.archived_at.is_(None),
    ))
    if organization_id is None:
        raise RuntimeError("Platform reconciliation actor has no active platform organisation")
    return organization_id


def _evidence(*, row, resource_type: str, actor_id: uuid.UUID, status: str,
              details: dict, reason: str | None = None) -> CatalogueDocumentReconciliation:
    return CatalogueDocumentReconciliation(
        organization_id=getattr(row, "organization_id", None),
        event_id=getattr(row, "event_id", None), resource_type=resource_type,
        resource_id=row.id, resource_version=int(row.version or 1),
        operation="DOCUMENT_VALIDATION", status=status, reason=reason,
        details=details, actor_user_id=actor_id)


async def _require_tenant_target(db, organization_id):
    """Caller holds the target revision; cached ORM state is not lifecycle proof."""
    async with TenantContextGuard.scoped(db, organization_id):
        target = (await db.execute(select(Organization.id, Organization.is_platform_org,
            Organization.archived_at).where(Organization.id == organization_id))).one_or_none()
    if target is None or target.is_platform_org or target.archived_at is not None:
        raise PermissionError("Reconciliation target no longer available")


async def _lock_tenant_page_authority(db, organization_id, actor_id):
    from app.modules.rbac.services.access_foundation import lock_revision
    platform = await _authorise_platform_actor(db, actor_id)
    # Match durable work and canonical lifecycle ordering. Do not first lock
    # the operator home and then take a potentially lower-ID tenant revision.
    for owner in sorted({platform, organization_id}):
        async with TenantContextGuard.scoped(db, owner):
            await lock_revision(db, owner, write=False)
    if await _authorise_platform_actor(db, actor_id) != platform:
        raise PermissionError("Reconciliation actor owner changed")
    await _require_tenant_target(db, organization_id)


async def _process_page(organization_id: uuid.UUID, actor_id: uuid.UUID,
                        stage: str, cursor: uuid.UUID | None) -> dict:
    async with AsyncSessionLocal() as db:
        await _lock_tenant_page_authority(db, organization_id, actor_id)
        # Broker headers can carry the acting platform context. Bind both the
        # application selector and PostgreSQL RLS to this explicit target.
        async with TenantContextGuard.scoped(db, organization_id):
            return await _process_page_with_session(db, organization_id, actor_id, stage, cursor)


async def _process_page_with_session(db, organization_id: uuid.UUID, actor_id: uuid.UUID,
                                     stage: str, cursor: uuid.UUID | None, *, commit: bool = True) -> dict:
    from app.modules.registration.application.catalogue_lifecycle_locks import (
        lock_catalogue_reference_writes, lock_category_retirement,
    )
    if stage == "FORM_CATEGORY":
        await lock_category_retirement(db)
    else:
        await lock_catalogue_reference_writes(db)
    if stage == "FORM_TEMPLATE":
        statement = select(FormTemplate).where(
            FormTemplate.organization_id == organization_id,
            FormTemplate.deleted_at.is_(None),
        )
        if cursor:
            statement = statement.where(FormTemplate.id > cursor)
        rows = list((await db.scalars(statement.order_by(FormTemplate.id)
            .limit(_PAGE_SIZE + 1).with_for_update(of=FormTemplate)
            .execution_options(shared_form_catalogue=True))).all())
        resource_type = "FORM_TEMPLATE"
    elif stage == "REGISTRATION_FORM":
        statement = select(RegistrationFormConfig, Event.organization_id).join(
            Event, Event.id == RegistrationFormConfig.event_id).where(
            Event.organization_id == organization_id)
        if cursor:
            statement = statement.where(RegistrationFormConfig.id > cursor)
        pairs = list((await db.execute(statement.order_by(RegistrationFormConfig.id)
            .limit(_PAGE_SIZE + 1)
            .with_for_update(of=RegistrationFormConfig))).all())
        rows = [pair[0] for pair in pairs]
        resource_type = "REGISTRATION_FORM"
    elif stage == "ABSTRACT_FORM":
        statement = select(AbstractForm).where(AbstractForm.organization_id == organization_id)
        if cursor:
            statement = statement.where(AbstractForm.id > cursor)
        rows = list((await db.scalars(statement.order_by(AbstractForm.id)
            .limit(_PAGE_SIZE + 1)
            .with_for_update(of=AbstractForm))).all())
        resource_type = "ABSTRACT_FORM"
    elif stage == "PROGRAMME_RUBRIC":
        # Include every status, including active plans with submitted grades.
        # Validation is not authority to repair or reinterpret those grades.
        statement = select(ProgrammeEvaluationPlan).where(
            ProgrammeEvaluationPlan.organization_id == organization_id)
        if cursor:
            statement = statement.where(ProgrammeEvaluationPlan.id > cursor)
        rows = list((await db.scalars(statement.order_by(ProgrammeEvaluationPlan.id)
            .limit(_PAGE_SIZE + 1).with_for_update(of=ProgrammeEvaluationPlan))).all())
        resource_type = "PROGRAMME_RUBRIC"
    elif stage == "FORM_CATEGORY":
        statement = select(FormCategory).where(FormCategory.organization_id == organization_id,
            FormCategory.is_active.is_(True), FormCategory.deleted_at.is_(None))
        if cursor:
            statement = statement.where(FormCategory.id > cursor)
        rows = list((await db.scalars(statement.order_by(FormCategory.id)
            .limit(_PAGE_SIZE + 1).with_for_update(of=FormCategory)
            .execution_options(shared_form_catalogue=True))).all())
        resource_type = "FORM_CATEGORY"
    else:
        raise ValueError("Unsupported reconciliation stage")

    has_next = len(rows) > _PAGE_SIZE
    page = rows[:_PAGE_SIZE]
    owned_event_ids: set[uuid.UUID] = set()
    if stage == "PROGRAMME_RUBRIC":
        owned_event_ids = set((await db.scalars(select(Event.id).where(
            Event.organization_id == organization_id,
            Event.id.in_({row.event_id for row in page})))).all()) if page else set()
    elif stage == "FORM_TEMPLATE":
        candidate_event_ids = set()
        for row in page:
            if row.scope_type != "EVENT":
                continue
            settings = row.settings if isinstance(row.settings, dict) else {}
            raw_event_id = settings.get("_event_id") or settings.get("event_id")
            try:
                candidate_event_ids.add(uuid.UUID(str(raw_event_id)))
            except (TypeError, ValueError):
                continue
        if candidate_event_ids:
            owned_event_ids = set((await db.scalars(select(Event.id).where(
                Event.organization_id == organization_id,
                Event.id.in_(candidate_event_ids),
                Event.deleted_at.is_(None),
            ))).all())
    page_ids = [row.id for row in page]
    page_versions = [(row.id, int(row.version or 1)) for row in page]
    if not page_ids:
        evidenced: dict[tuple[uuid.UUID, int], str] = {}
    elif stage == "FORM_TEMPLATE":
        evidenced = {(row_id, version): status for row_id, version, status in (await db.execute(select(
            FormTemplateReconciliation.template_id,
            FormTemplateReconciliation.template_version,
            FormTemplateReconciliation.status,
        ).where(
            tuple_(FormTemplateReconciliation.template_id,
                FormTemplateReconciliation.template_version).in_(page_versions),
            FormTemplateReconciliation.operation == "DOCUMENT_VALIDATION",
        ))).all()}
    else:
        evidenced = {(row_id, version): status for row_id, version, status in (await db.execute(select(
            CatalogueDocumentReconciliation.resource_id,
            CatalogueDocumentReconciliation.resource_version,
            CatalogueDocumentReconciliation.status,
        ).where(
            CatalogueDocumentReconciliation.resource_type == resource_type,
            tuple_(CatalogueDocumentReconciliation.resource_id,
                CatalogueDocumentReconciliation.resource_version).in_(page_versions),
            CatalogueDocumentReconciliation.operation == "DOCUMENT_VALIDATION",
        ))).all()}
    projected_ids = set()
    if stage == "PROGRAMME_RUBRIC":
        from app.modules.registration.application.programme_rubric_validation import quarantine_programme_rubrics
        quarantine_programme_rubrics(db, rows=page, organization_id=organization_id,
            owned_event_ids=owned_event_ids, evidenced=evidenced, actor_id=actor_id)
    elif stage == "FORM_TEMPLATE":
        from app.modules.registration.application.category_key_projection import normalize_template_page_category_keys
        projected_ids = await normalize_template_page_category_keys(db, rows=page,
            organization_id=organization_id, evidenced=evidenced, actor_id=actor_id)
        from app.modules.registration.application.template_reference_validation import quarantine_invalid_template_references
        await quarantine_invalid_template_references(db, rows=page, evidenced=evidenced, actor_id=actor_id)
    elif stage in {"REGISTRATION_FORM", "ABSTRACT_FORM"}:
        from app.modules.registration.application.aggregate_reference_validation import quarantine_aggregate_references
        await quarantine_aggregate_references(db, rows=page, organization_id=organization_id,
            resource_type=resource_type, evidenced=evidenced, actor_id=actor_id)
    category_duplicate_counts: dict[str, int] = {}
    if stage == "FORM_CATEGORY" and page:
        category_duplicate_counts = {slug: int(count) for slug, count in (await db.execute(
            select(FormCategory.slug, func.count(FormCategory.id)).where(
                FormCategory.organization_id == organization_id,
                FormCategory.slug.in_({row.slug for row in page}),
                FormCategory.deleted_at.is_(None),
                FormCategory.is_active.is_(True),
            ).group_by(FormCategory.slug).execution_options(shared_form_catalogue=True)
        )).all()}
        from app.modules.registration.application.category_document_validation import quarantine_category_documents
        quarantine_category_documents(db, rows=page, organization_id=organization_id,
            evidenced=evidenced, duplicate_counts=category_duplicate_counts, actor_id=actor_id)
    normalized, blocked, checked = len(projected_ids), 0, 0
    for row in page:
        checked += 1
        if (row.id, int(row.version or 1)) in evidenced:
            blocked += int(evidenced[(row.id, int(row.version or 1))] == "BLOCKED")
            continue
        original_version = int(row.version or 1)
        try:
            if stage == "FORM_TEMPLATE":
                if row.scope_type == "EVENT":
                    raw_event_id = (row.settings or {}).get("_event_id") or (row.settings or {}).get("event_id")
                    template_event_id = uuid.UUID(str(raw_event_id))
                    if template_event_id not in owned_event_ids:
                        raise ValueError("Event template ownership is invalid")
                    projected = form_document(row.fields or [], row.settings or {},
                        stored=True, event_id=template_event_id)
                elif row.scope_type == "ORGANIZATION":
                    projected = CatalogueDocument.model_validate({
                        "fields": row.fields or [], "settings": row.settings or {},
                    }).model_dump(mode="json", exclude_none=True)
                else:
                    raise ValueError("Owned template has an invalid scope")
                changed = (projected["fields"] != (row.fields or [])
                    or projected["settings"] != (row.settings or {}))
                if changed:
                    row.fields, row.settings = projected["fields"], projected["settings"]
            elif stage == "REGISTRATION_FORM":
                projected = form_document(row.fields or [], row.settings or {},
                    stored=True, event_id=row.event_id)
                changed = projected["fields"] != (row.fields or []) or projected["settings"] != (row.settings or {})
                if changed:
                    row.fields, row.settings = projected["fields"], projected["settings"]
            elif stage == "ABSTRACT_FORM":
                projected = abstract_schema_projection(row.schema or {},
                    stored=True, event_id=row.event_id)
                changed = projected != (row.schema or {})
                if changed:
                    row.schema = projected
            elif stage == "PROGRAMME_RUBRIC":
                # quarantine_programme_rubrics already validated this exact
                # document, without copying defaults into persisted criteria.
                changed = False
            else:
                # Reference projection belongs to the later, cursor-paged
                # template stage, not this category's potentially huge fan-out.
                changed = False
            if changed and stage != "FORM_CATEGORY":
                row.version = original_version + 1
                row.updated_at = datetime.now(timezone.utc)
                normalized += int(row.id not in projected_ids)
            elif changed:
                normalized += 1
            if stage == "FORM_TEMPLATE":
                db.add(FormTemplateReconciliation(template_id=row.id,
                    template_version=original_version, operation="DOCUMENT_VALIDATION",
                    status="NORMALIZED" if changed else "VALID", actor_user_id=actor_id,
                    details={"resulting_version": int(row.version or 1)}))
                if changed:
                    db.add(FormTemplateReconciliation(template_id=row.id,
                        template_version=int(row.version or 1),
                        operation="DOCUMENT_VALIDATION", status="VALID",
                        actor_user_id=actor_id,
                        details={"normalized_from_version": original_version}))
            else:
                db.add(CatalogueDocumentReconciliation(
                    organization_id=organization_id,
                    event_id=getattr(row, "event_id", None), resource_type=resource_type,
                    resource_id=row.id, resource_version=original_version,
                    operation="DOCUMENT_VALIDATION", status="NORMALIZED" if changed else "VALID",
                    details={"resulting_version": int(row.version or 1),
                        **({"reference_projection": "BOUNDED_TEMPLATE_STAGE"}
                           if stage == "FORM_CATEGORY" else {})},
                    actor_user_id=actor_id))
                if changed and stage != "FORM_CATEGORY":
                    db.add(CatalogueDocumentReconciliation(
                        organization_id=organization_id,
                        event_id=getattr(row, "event_id", None),
                        resource_type=resource_type, resource_id=row.id,
                        resource_version=int(row.version or 1),
                        operation="DOCUMENT_VALIDATION", status="VALID",
                        details={"normalized_from_version": original_version},
                        actor_user_id=actor_id))
        except (ValidationError, TypeError, ValueError) as exc:
            blocked += 1
            if stage == "FORM_TEMPLATE":
                db.add(FormTemplateReconciliation(template_id=row.id,
                    template_version=original_version, operation="DOCUMENT_VALIDATION",
                    status="BLOCKED", actor_user_id=actor_id,
                    reason="Historical template requires explicit operator reconciliation.",
                    details={"error_type": type(exc).__name__}))
            else:
                db.add(CatalogueDocumentReconciliation(
                    organization_id=organization_id,
                    event_id=getattr(row, "event_id", None), resource_type=resource_type,
                    resource_id=row.id, resource_version=original_version,
                    operation="DOCUMENT_VALIDATION", status="BLOCKED",
                    reason="Historical aggregate requires explicit operator reconciliation.",
                    details={"error_type": type(exc).__name__}, actor_user_id=actor_id))
    if commit:
        await db.commit()
    else:
        await db.flush()
    return {"checked": checked, "normalized": normalized, "blocked": blocked,
        "next_cursor": str(page[-1].id) if has_next and page else None}


@celery_app.task(**_task_options("app.tasks.catalogue_reconciliation.tenant_page"),
    soft_time_limit=_POLICY.soft_timeout_seconds, time_limit=_POLICY.hard_timeout_seconds)
def reconcile_tenant_page(self, organization_id_str: str, actor_id_str: str,
                          stage: str = _STAGES[0], cursor_str: str | None = None) -> dict:
    # Keep the task name registered so old messages fail deterministically,
    # rather than running unaudited/uncheckpointed pages or being unrecognised.
    # The existing process_catalogue_work task is the sole page dispatch path.
    raise ValueError("CATALOGUE_DURABLE_RUN_REQUIRED")


async def _organization_page(actor_id: uuid.UUID, cursor: uuid.UUID | None, run_id=None) -> list[uuid.UUID]:
    async with AsyncSessionLocal() as db:
        platform = await _authorise_platform_actor(db, actor_id)
        statement = select(Organization.id).where(Organization.is_platform_org.is_(False),
            Organization.archived_at.is_(None))
        if run_id is not None:
            async with TenantContextGuard.scoped(db, platform):
                run = await db.get(CatalogueReconciliationRun, run_id)
                if run is None or run.actor_user_id != actor_id:
                    raise PermissionError("Reconciliation cohort unavailable")
                statement = statement.where(Organization.created_at <= run.created_at)
        if cursor:
            statement = statement.where(Organization.id > cursor)
        return list((await db.scalars(statement.order_by(Organization.id).limit(101))).all())


async def _mark_run_started(run_id: uuid.UUID, actor_id: uuid.UUID,
                            expected_attempt: int | None = None) -> int | None:
    async with AsyncSessionLocal() as db, AsyncExitStack() as scope:
        platform_organization_id = await _authorise_platform_actor(db, actor_id)
        await scope.enter_async_context(TenantContextGuard.scoped(db, platform_organization_id))
        row = await db.scalar(select(CatalogueReconciliationRun).where(
            CatalogueReconciliationRun.id == run_id).with_for_update())
        if (row is None or row.actor_user_id != actor_id
                or row.status in {"FAILED", "DISPATCHED"}
                or not _matches_dispatch_attempt(row, expected_attempt)):
            return None
        if row.started_at is None:
            row.started_at = datetime.now(timezone.utc)
        row.status = "RUNNING"
        row.failure_code = None
        row.next_dispatch_at = datetime.now(timezone.utc) + timedelta(seconds=_RUN_LEASE_SECONDS)
        attempt = row.dispatch_attempts
        await db.commit()
        return attempt


async def _mark_run_dispatched(run_id: uuid.UUID, actor_id: uuid.UUID,
                               expected_attempt: int | None = None) -> None:
    from app.modules.audit.models.audit_log import AuditLog
    async with AsyncSessionLocal() as db, AsyncExitStack() as scope:
        platform_organization_id = await _authorise_platform_actor(db, actor_id)
        await scope.enter_async_context(TenantContextGuard.scoped(db, platform_organization_id))
        row = await db.scalar(select(CatalogueReconciliationRun).where(
            CatalogueReconciliationRun.id == run_id).with_for_update())
        if (row is not None and row.actor_user_id == actor_id and row.status != "FAILED"
                and _matches_dispatch_attempt(row, expected_attempt)):
            if row.status == "DISPATCHED":
                return
            row.status = "DISPATCHED"
            row.dispatched_at = datetime.now(timezone.utc)
            row.failure_code = None
            db.add(AuditLog(organization_id=row.organization_id,
                actor_user_id=row.actor_user_id, actor_role="SYSTEM",
                resource_type="catalogue_reconciliation_run", resource_id=row.id,
                action_type="CATALOGUE_RECONCILIATION_WORKERS_DISPATCHED",
                is_sensitive=True, correlation_id=row.id,
                new_state={"dispatch_attempts": row.dispatch_attempts,
                    "dispatched_at": row.dispatched_at.isoformat()}))
            await db.commit()


async def _mark_run_failed(run_id: uuid.UUID, actor_id: uuid.UUID, code: str,
                            expected_attempt: int | None = None) -> None:
    from app.modules.audit.models.audit_log import AuditLog
    async with AsyncSessionLocal() as db, AsyncExitStack() as scope:
        platform_organization_id = await _authorise_platform_actor(db, actor_id)
        await scope.enter_async_context(TenantContextGuard.scoped(db, platform_organization_id))
        row = await db.scalar(select(CatalogueReconciliationRun).where(
            CatalogueReconciliationRun.id == run_id).with_for_update())
        if (row is None or row.actor_user_id != actor_id or row.status in {"DISPATCHED", "FAILED"}
                or not _matches_dispatch_attempt(row, expected_attempt)):
            return
        row.status = "FAILED"
        row.failure_code = code[:120]
        db.add(AuditLog(organization_id=row.organization_id,
            actor_user_id=row.actor_user_id, actor_role="SYSTEM",
            resource_type="catalogue_reconciliation_run", resource_id=row.id,
            action_type="CATALOGUE_RECONCILIATION_DISPATCH_FAILED", is_sensitive=True,
            correlation_id=row.id, new_state={"failure_code": row.failure_code,
                "dispatch_attempts": row.dispatch_attempts}))
        await db.commit()


async def _claim_reconciliation_runs(*, run_id: uuid.UUID | None = None) -> list[tuple[uuid.UUID, uuid.UUID, int]]:
    from app.modules.audit.models.audit_log import AuditLog
    if run_id is not None and not isinstance(run_id, uuid.UUID):
        raise ValueError("Invalid reconciliation run selector")
    now = datetime.now(timezone.utc)
    messages: list[tuple[uuid.UUID, uuid.UUID, int]] = []
    async with AsyncSessionLocal() as db:
        platform_organizations = list((await db.scalars(select(Organization.id).where(
            Organization.is_platform_org.is_(True),
            Organization.is_active.is_(True),
            Organization.suspended_at.is_(None),
            Organization.archived_at.is_(None),
        ).order_by(Organization.id))).all())
        for platform_organization_id in platform_organizations:
            remaining = 100 - len(messages)
            if remaining <= 0:
                break
            async with TenantContextGuard.scoped(db, platform_organization_id):
                statement = select(CatalogueReconciliationRun).where(
                    CatalogueReconciliationRun.organization_id == platform_organization_id,
                    CatalogueReconciliationRun.status.in_(("PENDING", "RUNNING")),
                    CatalogueReconciliationRun.next_dispatch_at <= now,
                )
                if run_id is not None:
                    statement = statement.where(CatalogueReconciliationRun.id == run_id)
                rows = list((await db.scalars(statement.order_by(CatalogueReconciliationRun.next_dispatch_at,
                    CatalogueReconciliationRun.id).limit(remaining)
                  .with_for_update(skip_locked=True))).all())
                for row in rows:
                    if row.actor_user_id is None or row.dispatch_attempts >= _MAX_DISPATCH_ATTEMPTS:
                        row.status = "FAILED"
                        row.failure_code = ("ACTOR_UNAVAILABLE" if row.actor_user_id is None
                            else "DISPATCH_ATTEMPTS_EXHAUSTED")
                        db.add(AuditLog(organization_id=row.organization_id,
                            actor_user_id=row.actor_user_id, actor_role="SYSTEM",
                            resource_type="catalogue_reconciliation_run", resource_id=row.id,
                            action_type="CATALOGUE_RECONCILIATION_DISPATCH_FAILED", is_sensitive=True,
                            correlation_id=row.id, new_state={"failure_code": row.failure_code,
                                "dispatch_attempts": row.dispatch_attempts}))
                        continue
                    previous_status, previous_attempt = row.status, row.dispatch_attempts
                    row.dispatch_attempts += 1
                    row.status = "PENDING"
                    if previous_status == "RUNNING":
                        db.add(AuditLog(organization_id=row.organization_id,
                            actor_user_id=row.actor_user_id, actor_role="SYSTEM",
                            resource_type="catalogue_reconciliation_run", resource_id=row.id,
                            action_type="CATALOGUE_RECONCILIATION_DISPATCH_RECLAIMED", is_sensitive=True,
                            correlation_id=row.id,
                            old_state={"status": previous_status, "dispatch_attempts": previous_attempt},
                            new_state={"status": "PENDING", "dispatch_attempts": row.dispatch_attempts}))
                    delay = min(900, 30 * (2 ** min(row.dispatch_attempts - 1, 5)))
                    row.next_dispatch_at = now + timedelta(seconds=delay)
                    messages.append((row.id, row.actor_user_id, row.dispatch_attempts))
                await db.commit()
    return messages


async def _global_category_page(actor_id: uuid.UUID, cursor: uuid.UUID | None, *, session=None, commit=True) -> dict:
    async with AsyncExitStack() as scope:
        db = session if session is not None else await scope.enter_async_context(AsyncSessionLocal())
        platform_organization_id = await _authorise_platform_actor(db, actor_id, for_write=True)
        await scope.enter_async_context(TenantContextGuard.scoped(db, platform_organization_id))
        from app.modules.registration.application.catalogue_lifecycle_locks import (
            lock_category_retirement,
        )
        await lock_category_retirement(db)
        statement = select(FormCategory).where(FormCategory.organization_id.is_(None),
            FormCategory.is_active.is_(True), FormCategory.deleted_at.is_(None))
        if cursor:
            statement = statement.where(FormCategory.id > cursor)
        rows = list((await db.scalars(statement.order_by(FormCategory.id)
            .limit(_PAGE_SIZE + 1).with_for_update(of=FormCategory)
            .execution_options(shared_form_catalogue=True))).all())
        has_next, page = len(rows) > _PAGE_SIZE, rows[:_PAGE_SIZE]
        page_ids = [row.id for row in page]
        page_versions = [(row.id, int(row.version or 1)) for row in page]
        evidenced = {} if not page_ids else {(row_id, version): status for row_id, version, status in (await db.execute(select(
            FormCategoryReconciliation.category_id,
            FormCategoryReconciliation.category_version,
            FormCategoryReconciliation.status,
        ).where(
            tuple_(FormCategoryReconciliation.category_id,
                FormCategoryReconciliation.category_version).in_(page_versions),
            FormCategoryReconciliation.operation == "TAXONOMY_VALIDATION",
        ))).all()}
        duplicate_counts = {} if not page else {slug: int(count) for slug, count in (await db.execute(
            select(FormCategory.slug, func.count(FormCategory.id)).where(
                FormCategory.organization_id.is_(None),
                FormCategory.slug.in_({row.slug for row in page}),
                FormCategory.deleted_at.is_(None), FormCategory.is_active.is_(True),
            ).group_by(FormCategory.slug).execution_options(shared_form_catalogue=True)
        )).all()}
        from app.modules.registration.application.category_document_validation import quarantine_category_documents
        quarantine_category_documents(db, rows=page, organization_id=None,
            evidenced=evidenced, duplicate_counts=duplicate_counts, actor_id=actor_id)
        blocked = normalized = 0
        for row in page:
            if (row.id, int(row.version or 1)) in evidenced:
                blocked += int(evidenced[(row.id, int(row.version or 1))] == "BLOCKED")
                continue
            db.add(FormCategoryReconciliation(category_id=row.id,
                category_version=int(row.version or 1), operation="TAXONOMY_VALIDATION",
                status="VALID",
                details={"reference_projection": "BOUNDED_TEMPLATE_STAGE"},
                actor_user_id=actor_id))
        if commit:
            await db.commit()
        else:
            await db.flush()
        return {"checked": len(page), "normalized": normalized, "blocked": blocked,
            "next_cursor": str(page[-1].id) if has_next and page else None}


async def _global_template_page(actor_id: uuid.UUID, cursor: uuid.UUID | None, *, session=None, commit=True) -> dict:
    async with AsyncExitStack() as scope:
        db = session if session is not None else await scope.enter_async_context(AsyncSessionLocal())
        platform_organization_id = await _authorise_platform_actor(db, actor_id, for_write=True)
        await scope.enter_async_context(TenantContextGuard.scoped(db, platform_organization_id))
        from app.modules.registration.application.catalogue_lifecycle_locks import (
            lock_catalogue_reference_writes,
        )
        await lock_catalogue_reference_writes(db)
        statement = select(FormTemplate).where(
            FormTemplate.organization_id.is_(None),
            FormTemplate.scope_type == "GLOBAL",
            FormTemplate.deleted_at.is_(None),
        )
        if cursor:
            statement = statement.where(FormTemplate.id > cursor)
        rows = list((await db.scalars(statement.order_by(FormTemplate.id)
            .limit(_PAGE_SIZE + 1).with_for_update(of=FormTemplate)
            .execution_options(shared_form_catalogue=True))).all())
        has_next, page = len(rows) > _PAGE_SIZE, rows[:_PAGE_SIZE]
        page_ids = [row.id for row in page]
        page_versions = [(row.id, int(row.version or 1)) for row in page]
        evidenced = {} if not page_ids else {(row_id, version): status for row_id, version, status in (await db.execute(select(
            FormTemplateReconciliation.template_id,
            FormTemplateReconciliation.template_version,
            FormTemplateReconciliation.status,
        ).where(
            tuple_(FormTemplateReconciliation.template_id,
                FormTemplateReconciliation.template_version).in_(page_versions),
            FormTemplateReconciliation.operation == "DOCUMENT_VALIDATION",
        ))).all()}
        from app.modules.registration.application.category_key_projection import normalize_template_page_category_keys
        projected_ids = await normalize_template_page_category_keys(db, rows=page,
            organization_id=None, evidenced=evidenced, actor_id=actor_id)
        from app.modules.registration.application.template_reference_validation import quarantine_invalid_template_references
        await quarantine_invalid_template_references(db, rows=page, evidenced=evidenced, actor_id=actor_id)
        blocked, normalized, checked = 0, len(projected_ids), 0
        for row in page:
            original_version = int(row.version or 1)
            if (row.id, original_version) in evidenced:
                checked += 1
                blocked += int(evidenced[(row.id, original_version)] == "BLOCKED")
                continue
            try:
                projected = CatalogueDocument.model_validate({
                    "fields": row.fields or [], "settings": row.settings or {},
                }).model_dump(mode="json", exclude_none=True)
                changed = (projected["fields"] != (row.fields or [])
                    or projected["settings"] != (row.settings or {}))
                if changed:
                    row.fields, row.settings = projected["fields"], projected["settings"]
                    row.version = original_version + 1
                    row.updated_at = datetime.now(timezone.utc)
                    normalized += int(row.id not in projected_ids)
                checked += 1
                db.add(FormTemplateReconciliation(template_id=row.id,
                    template_version=original_version, operation="DOCUMENT_VALIDATION",
                    status="NORMALIZED" if changed else "VALID", actor_user_id=actor_id,
                    details={"resulting_version": int(row.version or 1)}))
                if changed:
                    db.add(FormTemplateReconciliation(template_id=row.id,
                        template_version=int(row.version or 1),
                        operation="DOCUMENT_VALIDATION", status="VALID",
                        actor_user_id=actor_id,
                        details={"normalized_from_version": original_version}))
            except (ValidationError, TypeError, ValueError) as exc:
                blocked += 1
                db.add(FormTemplateReconciliation(template_id=row.id,
                    template_version=original_version, operation="DOCUMENT_VALIDATION",
                    status="BLOCKED", actor_user_id=actor_id,
                    reason="Historical global template requires explicit operator reconciliation.",
                    details={"error_type": type(exc).__name__}))
        if commit:
            await db.commit()
        else:
            await db.flush()
        return {"checked": checked, "normalized": normalized, "blocked": blocked,
            "next_cursor": str(page[-1].id) if has_next and page else None}


@celery_app.task(**_task_options("app.tasks.catalogue_reconciliation.global_templates"),
    soft_time_limit=_POLICY.soft_timeout_seconds, time_limit=_POLICY.hard_timeout_seconds)
def reconcile_global_templates(self, actor_id_str: str,
                               cursor_str: str | None = None) -> dict:
    raise ValueError("CATALOGUE_DURABLE_RUN_REQUIRED")


@celery_app.task(**_task_options("app.tasks.catalogue_reconciliation.global_categories"),
    soft_time_limit=_POLICY.soft_timeout_seconds, time_limit=_POLICY.hard_timeout_seconds)
def reconcile_global_categories(self, actor_id_str: str,
                                cursor_str: str | None = None) -> dict:
    raise ValueError("CATALOGUE_DURABLE_RUN_REQUIRED")


@celery_app.task(**_task_options("app.tasks.catalogue_reconciliation.fanout"),
    soft_time_limit=_POLICY.soft_timeout_seconds, time_limit=_POLICY.hard_timeout_seconds)
def fanout_catalogue_reconciliation(self, actor_id_str: str,
                                    cursor_str: str | None = None,
                                    run_id_str: str | None = None,
                                    dispatch_attempt: int | None = None) -> dict:
    actor_id = uuid.UUID(actor_id_str)
    cursor = uuid.UUID(cursor_str) if cursor_str else None
    run_id = uuid.UUID(run_id_str) if run_id_str else None
    if run_id is None:
        # Independent legacy publication races tenant template validation with
        # global taxonomy and strands work on broker failure. Operators must
        # create the existing versioned/audited durable run, not bypass it.
        raise ValueError("CATALOGUE_DURABLE_RUN_REQUIRED")
    if dispatch_attempt is not None and (run_id is None or type(dispatch_attempt) is not int
            or not 1 <= dispatch_attempt <= _MAX_DISPATCH_ATTEMPTS):
        raise ValueError("Invalid reconciliation dispatch generation")
    try:
        if run_id is not None:
            dispatch_attempt = run_async(_mark_run_started(run_id, actor_id, dispatch_attempt))
            if dispatch_attempt is None:
                return {"scheduled": 0, "status": "run_unavailable"}
            from app.modules.registration.services.catalogue_work import run_cursor
            durable_cursor = run_async(run_cursor(run_id, actor_id, dispatch_attempt))
            if cursor is not None and cursor != durable_cursor:
                return {"scheduled": 0, "status": "stale_cursor"}
            cursor = durable_cursor
        rows = run_async(_organization_page(actor_id, cursor, run_id))
        page, has_next = rows[:100], len(rows) > 100
        if run_id is not None:
            from app.modules.registration.services.catalogue_work import stage_streams
            run_async(stage_streams(run_id, actor_id, dispatch_attempt, cursor, tuple(page), enumeration_complete=not has_next))
        if has_next and page:
            fanout_catalogue_reconciliation.apply_async(
                args=(actor_id_str, str(page[-1]), run_id_str, dispatch_attempt), retry=False)
        elif run_id is not None:
            run_async(_mark_run_dispatched(run_id, actor_id, dispatch_attempt))
        return {"scheduled": len(page), "next_cursor": str(page[-1]) if has_next and page else None}
    except Exception as exc:
        if not is_retryable(exc):
            if run_id is not None:
                run_async(_mark_run_failed(run_id, actor_id, "NON_RETRYABLE_DISPATCH_FAILURE", dispatch_attempt))
            raise
        if int(getattr(self.request, "retries", 0)) >= _POLICY.max_retries:
            if run_id is not None:
                run_async(_mark_run_failed(run_id, actor_id, "DISPATCH_RETRY_EXHAUSTED", dispatch_attempt))
            raise
        raise self.retry(exc=exc,
            countdown=_POLICY.retry_delay(self.request.retries, apply_jitter=True))


@celery_app.task(**_task_options("app.tasks.catalogue_reconciliation.recover_runs"),
    soft_time_limit=_POLICY.soft_timeout_seconds, time_limit=_POLICY.hard_timeout_seconds)
def recover_catalogue_reconciliation_runs(self) -> dict:
    try:
        messages = run_async(_claim_reconciliation_runs())
        published = 0
        for run_id, actor_id, attempt in messages:
            try:
                fanout_catalogue_reconciliation.apply_async(
                    args=(str(actor_id), None, str(run_id), attempt),
                    task_id=f"catalogue-reconcile-{run_id}-{attempt}", retry=False)
                published += 1
            except Exception:
                # The committed PENDING row becomes eligible after its lease.
                continue
        from app.modules.registration.services.catalogue_work import claim_pages
        pages = run_async(claim_pages())
        pages_published = 0
        for work_id, platform_id, generation in pages:
            try:
                process_catalogue_work.apply_async(args=(str(work_id), str(platform_id), generation),
                    task_id=f"catalogue-page-{work_id}-{generation}", retry=False)
                pages_published += 1
            except Exception:
                continue
        return {"claimed": len(messages), "published": published,
            "pages_claimed": len(pages), "pages_published": pages_published}
    except Exception as exc:
        if not is_retryable(exc):
            raise
        raise self.retry(exc=exc,
            countdown=_POLICY.retry_delay(self.request.retries, apply_jitter=True))


@celery_app.task(**_task_options("app.tasks.catalogue_reconciliation.process_work"),
    soft_time_limit=_POLICY.soft_timeout_seconds, time_limit=_POLICY.hard_timeout_seconds)
def process_catalogue_work(self, work_id_str, platform_id_str, generation):
    # Durable work retries/leases, not broker acknowledgement, own recovery.
    from app.modules.registration.services.catalogue_work import execute_page, claim_pages
    work_id, platform_id = uuid.UUID(work_id_str), uuid.UUID(platform_id_str)
    result = run_async(execute_page(work_id, platform_id, generation))
    try:
        if result["status"] == "PENDING":
            for next_id, owner, attempt in run_async(claim_pages(platform_id, work_id)):
                process_catalogue_work.apply_async(args=(str(next_id), str(owner), attempt),
                    task_id=f"catalogue-page-{next_id}-{attempt}", retry=False)
        elif result["status"] == "COMPLETED":
            recover_catalogue_reconciliation_runs.apply_async(retry=False)
    except Exception:
        # Data/checkpoint and optional next claim already committed. The beat
        # recovers any missing publication without rerunning a committed page.
        pass
    return result
