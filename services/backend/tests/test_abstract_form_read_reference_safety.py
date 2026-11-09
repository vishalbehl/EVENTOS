"""Real PostgreSQL read paths must be usable and cannot hide broken bindings."""
import uuid

from fastapi import HTTPException, Response
import pytest
from sqlalchemy import func, select

from app.core.tenant_context import TenantContextGuard
from app.modules.abstracts.models import AbstractCall, AbstractForm
from app.modules.abstracts.router import get_form, get_setup
from app.modules.registration.models.form_category import FormCategory
from app.modules.registration.models.form_template import FormTemplate


@pytest.mark.asyncio
async def test_first_abstract_reads_do_not_lock_nullable_theme_or_seed_rows(db, event):
    async with TenantContextGuard.scoped(db, event.organization_id):
        setup_response, form_response = Response(), Response()
        call = await get_setup(event=event, response=setup_response, db=db)
        form = await get_form(event=event, response=form_response, db=db)
        assert call.version == form.version == 1
        assert form.form_schema["template_id"] == "tpl_abstract_submission"
        assert setup_response.headers["cache-control"] == form_response.headers["cache-control"] == "no-store"
        assert await db.scalar(select(func.count()).select_from(AbstractCall).where(AbstractCall.event_id == event.id)) == 0
        assert await db.scalar(select(func.count()).select_from(AbstractForm).where(AbstractForm.event_id == event.id)) == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("defect", ["retired_parent", "malformed_identifier"])
async def test_abstract_read_returns_safe_conflict_for_invalid_retained_reference(db, event, defect):
    category = FormCategory(name="Historical abstract parent", slug="abstract", is_system=True,
        is_active=defect != "retired_parent")
    db.add(category)
    await db.flush()
    source = FormTemplate(name="Historical abstract source", slug=f"abstract-read-{uuid.uuid4().hex}",
        category_id=category.id, category_key="abstract", scope_type="GLOBAL", fields=[], settings={})
    db.add(source)
    await db.flush()
    row = AbstractForm(organization_id=event.organization_id, event_id=event.id,
        title="Historical retained abstract", schema={"fields": [], "settings": {},
            "template_id": "not-an-identifier" if defect == "malformed_identifier" else str(source.id)})
    db.add(row)
    await db.commit()
    async with TenantContextGuard.scoped(db, event.organization_id):
        with pytest.raises(HTTPException) as denied:
            await get_form(event=event, response=Response(), db=db)
        assert denied.value.status_code == 409
        assert denied.value.detail == {"code": "ABSTRACT_TEMPLATE_RECONCILIATION_REQUIRED"}
        await db.refresh(row)
        assert row.version == 1
