"""The legacy live-toggle must not publish an invalid retained catalogue link."""
import uuid

from fastapi import HTTPException
import pytest
from sqlalchemy import select

from app.core.tenant_context import TenantContextGuard
from app.modules.platform.models.organization import Organization
from app.modules.platform.models.idempotency import IdempotencyRecord
from app.modules.registration.application.commands import RegistrationFormCommandService
from app.modules.registration.models.form_category import FormCategory
from app.modules.registration.models.form_template import FormTemplate
from app.modules.registration.models.registration_form_config import RegistrationFormConfig
from tests.conftest import activate_event_for_test


@pytest.mark.asyncio
@pytest.mark.parametrize("defect", ["retired_template", "retired_parent", "foreign_parent", "conflicting_events",
    "invalid_document", "foreign_document_event", "valid"])
async def test_publication_rechecks_retained_catalogue_scope(db, event, organizer, defect):
    await activate_event_for_test(db, event)
    owner, actor_id = event.organization_id, organizer.id
    foreign = Organization(name="Foreign publication parent", slug=f"publication-foreign-{uuid.uuid4().hex}")
    db.add(foreign)
    await db.flush()
    category = FormCategory(name="Publication category", slug="registration", is_system=True,
        is_active=defect != "retired_parent", organization_id=foreign.id if defect == "foreign_parent" else None)
    db.add(category)
    await db.flush()
    template = FormTemplate(name="Publication source", slug=f"publication-source-{uuid.uuid4().hex}",
        category_key="registration", category_id=category.id, is_active=defect != "retired_template",
        scope_type="EVENT" if defect == "conflicting_events" else "GLOBAL",
        organization_id=owner if defect == "conflicting_events" else None, fields=[],
        settings={"_event_id": str(event.id), "event_id": str(uuid.uuid4())} if defect == "conflicting_events" else {})
    db.add(template)
    await db.flush()
    form = RegistrationFormConfig(event_id=event.id, template_id=template.id,
        fields=[{"id": "question", "type": "text", "label": "Question", "unexpected": True}]
            if defect == "invalid_document" else [],
        settings={"_event_id": str(uuid.uuid4())} if defect == "foreign_document_event" else {}, is_live=False)
    db.add(form)
    await db.commit()
    form_id, retry_key = form.id, f"publication-reference-{uuid.uuid4()}"
    async with TenantContextGuard.scoped(db, owner):
        arguments = dict(event=event, actor_user_id=actor_id, is_live=True,
            expected_version=1, idempotency_key=retry_key)
        if defect == "valid":
            result = await RegistrationFormCommandService.set_live(db, **arguments)
            assert result["version"] == 2 and result["is_live"] is True
        else:
            with pytest.raises(HTTPException) as denied:
                await RegistrationFormCommandService.set_live(db, **arguments)
            assert denied.value.status_code == 409
            assert denied.value.detail["code"] == ("FORM_DOCUMENT_RECONCILIATION_REQUIRED"
                if defect in {"invalid_document", "foreign_document_event"} else "FORM_TEMPLATE_RECONCILIATION_REQUIRED")
            current = await db.get(RegistrationFormConfig, form_id, populate_existing=True)
            assert current.version == 1 and not current.is_live
            assert await db.scalar(select(IdempotencyRecord.id).where(IdempotencyRecord.idempotency_key == retry_key)) is None


@pytest.mark.asyncio
@pytest.mark.parametrize("asset_state", ["quarantined", "pending_scan", "no_scan", "infected", "foreign", "unsafe_mime", "clean"])
async def test_publication_requires_owned_scan_ready_assets(db, event, organizer, asset_state):
    from app.modules.files.models.file import Asset, VirusScan
    await activate_event_for_test(db, event)
    owner, actor_id = event.organization_id, organizer.id
    foreign = Organization(name="Foreign image owner", slug=f"publication-image-{uuid.uuid4().hex}")
    db.add(foreign)
    await db.flush()
    asset = Asset(organization_id=foreign.id if asset_state == "foreign" else owner,
        name="Synthetic publication image", file_path=f"assets/publication-test/{uuid.uuid4()}",
        file_size_bytes=20, mime_type="text/html" if asset_state == "unsafe_mime" else "image/png",
        processing_status="QUARANTINED" if asset_state == "quarantined" else "READY")
    db.add(asset)
    await db.flush()
    if asset_state != "no_scan":
        db.add(VirusScan(asset_id=asset.id, status={"pending_scan": "pending", "infected": "infected"}.get(asset_state, "clean")))
    form = RegistrationFormConfig(event_id=event.id, fields=[], is_live=False,
        settings={"theme": {"header_banner_asset_id": str(asset.id)}})
    db.add(form)
    await db.commit()
    form_id, retry_key = form.id, f"publication-asset-{uuid.uuid4()}"
    async with TenantContextGuard.scoped(db, owner):
        arguments = dict(event=event, actor_user_id=actor_id, is_live=True, expected_version=1,
            idempotency_key=retry_key)
        if asset_state == "clean":
            result = await RegistrationFormCommandService.set_live(db, **arguments)
            assert result["version"] == 2 and result["is_live"] is True
        else:
            with pytest.raises(HTTPException) as denied:
                await RegistrationFormCommandService.set_live(db, **arguments)
            assert denied.value.detail["code"] == ("MANAGED_FORM_ASSET_TYPE_INVALID"
                if asset_state == "unsafe_mime" else "MANAGED_ASSET_NOT_SCAN_READY")
            assert denied.value.status_code == (422 if asset_state == "unsafe_mime" else 409)
            current = await db.get(RegistrationFormConfig, form_id, populate_existing=True)
            assert current.version == 1 and not current.is_live
            assert await db.scalar(select(IdempotencyRecord.id).where(IdempotencyRecord.idempotency_key == retry_key)) is None


@pytest.mark.asyncio
async def test_first_publication_creation_and_replay_are_single_record(db, event, organizer):
    from app.modules.audit.models.audit_log import AuditLog, compute_audit_hash
    await activate_event_for_test(db, event)
    owner, actor_id, event_id = event.organization_id, organizer.id, event.id
    key = f"first-publication-{uuid.uuid4()}"
    async with TenantContextGuard.scoped(db, owner):
        arguments = dict(event=event, actor_user_id=actor_id, is_live=True, expected_version=1, idempotency_key=key)
        result = await RegistrationFormCommandService.set_live(db, **arguments)
        assert result["version"] == 2 and result["is_live"] is True
        assert await RegistrationFormCommandService.set_live(db, **arguments) == result
        forms = list((await db.scalars(select(RegistrationFormConfig).where(RegistrationFormConfig.event_id == event_id))).all())
        assert len(forms) == 1 and forms[0].version == 2
        receipt = await db.scalar(select(IdempotencyRecord).where(IdempotencyRecord.idempotency_key == key))
        audits = list((await db.scalars(select(AuditLog).where(AuditLog.correlation_id == receipt.id))).all())
        assert len(audits) == 1 and audits[0].row_hash == compute_audit_hash(audits[0])


@pytest.mark.asyncio
async def test_publication_audit_failure_rolls_back_state_and_receipt(db, event, organizer, monkeypatch):
    import app.modules.audit.models.audit_log as audit_module
    await activate_event_for_test(db, event)
    owner, actor_id = event.organization_id, organizer.id
    form = RegistrationFormConfig(event_id=event.id, is_live=False, fields=[], settings={})
    db.add(form)
    await db.commit()
    form_id, key = form.id, f"publication-audit-rollback-{uuid.uuid4()}"
    def unavailable_audit(**kwargs):
        raise RuntimeError("Injected mandatory publication audit failure")
    async with TenantContextGuard.scoped(db, owner):
        with monkeypatch.context() as patch:
            patch.setattr(audit_module, "AuditLog", unavailable_audit)
            with pytest.raises(RuntimeError, match="mandatory publication audit failure"):
                await RegistrationFormCommandService.set_live(db, event=event, actor_user_id=actor_id,
                    is_live=True, expected_version=1, idempotency_key=key)
        current = await db.get(RegistrationFormConfig, form_id, populate_existing=True)
        assert not current.is_live and current.version == 1
        assert await db.scalar(select(IdempotencyRecord.id).where(IdempotencyRecord.idempotency_key == key)) is None
