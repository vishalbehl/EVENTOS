"""Use the existing scoped decision service inside legacy writer transactions."""
from fastapi import HTTPException
from sqlalchemy import select
from app.core.dependencies.feature_gate import enforce_event_operation
from app.modules.events.models.event import Event
from app.modules.audit.services.audit_service import AuditService


async def authorize_abstract_write(db, event, user, operation, *, exclusive=False):
    if user is None:
        raise HTTPException(401, detail={"code": "AUTHENTICATION_REQUIRED"})
    await enforce_event_operation(db, event.organization_id, event.id, operation, user_id=user.id)
    # Parent lifecycle updates conflict with this lock; policy revision locks are
    # acquired by the shared decision service before any resource locks.
    owned = await db.scalar(select(Event).where(Event.id == event.id,
        Event.organization_id == event.organization_id, Event.deleted_at.is_(None))
        .with_for_update(read=not exclusive, of=Event).execution_options(populate_existing=True))
    if owned is None:
        raise HTTPException(404, detail={"code": "EVENT_NOT_FOUND"})
    await enforce_event_operation(db, owned.organization_id, owned.id, operation, user_id=user.id)
    selector = db.info.get("customer_request_selector")
    db.info["abstract_write_scope"] = {
        "event_id": str(owned.id), "workspace_id": str(owned.operational_workspace_id),
        "target_organization_id": str(owned.organization_id),
        "acting_organization_id": str(getattr(selector, "acting_organization_id", None) or owned.organization_id),
        "access_mode": getattr(selector, "access_mode", "DIRECT"), "operation": operation,
    }
    return owned


async def write_abstract_audit(ctx, db, *, commit=False):
    scope = db.info.get("abstract_write_scope")
    if commit or scope is None or str(ctx.organization_id) != scope["target_organization_id"]:
        raise RuntimeError("Abstract audit requires the admitted writer transaction.")
    ctx.new_state = {**(ctx.new_state or {}), **scope}
    await AuditService.write_log_sync(ctx, db, commit=False)


async def validate_submission_references(db, event, payload):
    from app.modules.events.models.speaker import Speaker
    from app.modules.agenda.models import Session
    speaker_ids = {payload.get(key) for key in ("presenter_speaker_id", "submitter_speaker_id") if payload.get(key)}
    if speaker_ids:
        found = set((await db.scalars(select(Speaker.id).join(Event, Event.id == Speaker.event_id).where(
            Speaker.id.in_(speaker_ids), Speaker.event_id == event.id, Speaker.deleted_at.is_(None),
            Event.organization_id == event.organization_id).order_by(Speaker.id)
            .with_for_update(read=True, of=Speaker))).all())
        if found != speaker_ids:
            raise HTTPException(404, detail={"code": "SPEAKER_NOT_FOUND"})
    session_id = payload.get("linked_session_id")
    if session_id is not None and await db.scalar(select(Session.id).join(Event, Event.id == Session.event_id).where(
        Session.id == session_id, Session.event_id == event.id, Session.deleted_at.is_(None),
        Event.organization_id == event.organization_id).with_for_update(read=True, of=Session)) is None:
        raise HTTPException(404, detail={"code": "SESSION_NOT_FOUND"})
