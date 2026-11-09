"""Owned event workspace transitions; no commercial or tenant ownership change."""
import uuid
from fastapi import HTTPException
from sqlalchemy import select, and_, or_, case, func, literal
from sqlalchemy.dialects.postgresql import JSONB
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response
from app.modules.audit.models.audit_log import AuditLog
from app.modules.events.models.event import Event
from app.modules.rbac.models.access_foundation import OperationalWorkspace
from app.modules.rbac.services.access_contexts import direct_request_context
from app.modules.rbac.services.access_foundation import check_version, lock_revision
from app.modules.rbac.services.permission_service import get_user_permissions
from app.modules.rbac.models.rbac import Permission, ScopedPermission, UserAccessNode
from app.modules.rbac.models.organization_member import OrganizationMember


def event_read_denied(user_id, organization_id, workspace_id):
    # This is a denial-only filter for an already organisation-authorised admin
    # projection, not an alternative grant evaluator. Apply it before LIMIT.
    scoped = or_(and_(ScopedPermission.scope_type == "ORGANIZATION", ScopedPermission.scope_id == organization_id),
        and_(ScopedPermission.scope_type == "WORKSPACE", ScopedPermission.scope_id == workspace_id),
        and_(ScopedPermission.scope_type == "EVENT", ScopedPermission.scope_id == Event.id))
    denial = select(ScopedPermission.id).join(Permission, Permission.id == ScopedPermission.permission_id).where(
        ScopedPermission.user_id == user_id, scoped, Permission.code == "EVENTS:VIEW",
        ScopedPermission.is_allowed.is_(False)).correlate(Event).exists()
    node_scope = or_(and_(UserAccessNode.node_type == "ORGANIZATION", UserAccessNode.node_id == organization_id),
        and_(UserAccessNode.node_type == "WORKSPACE", UserAccessNode.node_id == workspace_id),
        and_(UserAccessNode.node_type == "EVENT", UserAccessNode.node_id == Event.id))
    payload = case((func.jsonb_typeof(UserAccessNode.permissions) == "object", UserAccessNode.permissions),
        else_=literal({}, type_=JSONB))
    pairs = func.jsonb_each(payload).table_valued("key", "value")
    malformed = select(pairs.c.key).where(pairs.c.value.not_in(
        [literal(True, type_=JSONB), literal(False, type_=JSONB)])).exists()
    node_denial = select(UserAccessNode.id).where(UserAccessNode.user_id == user_id, node_scope,
        or_(UserAccessNode.permissions.contains({"EVENTS:VIEW": False}),
            func.jsonb_typeof(UserAccessNode.permissions).is_distinct_from("object"), malformed)).correlate(Event).exists()
    from app.modules.rbac.services.team_access import subject_team_bindings
    from app.modules.rbac.models.user_assignment import UserEventAssignment
    legacy_payload = case((func.jsonb_typeof(UserEventAssignment.permissions) == "object",
                           UserEventAssignment.permissions), else_=literal({}, type_=JSONB))
    legacy_pairs = func.jsonb_each(legacy_payload).table_valued("key", "value")
    oversized_legacy = select(func.count()).select_from(legacy_pairs).scalar_subquery() > 32
    legacy_denial = select(UserEventAssignment.id).where(
        UserEventAssignment.user_id == user_id, UserEventAssignment.event_id == Event.id,
        or_(UserEventAssignment.permissions.contains({"EVENTS:VIEW": False}),
            oversized_legacy,
            ~func.organizer_access.category_a_team_permissions_valid_v1(
                UserEventAssignment.permissions))).correlate(Event).exists()
    from app.modules.platform.models.organization_console import OrganizationTeamMember
    member = OrganizationMember.__table__
    binding, joins, filters = subject_team_bindings(member.c.id, organization_id)
    team_denial = select(binding.c.id).select_from(joins.join(member,
        and_(member.c.id == OrganizationTeamMember.__table__.c.organization_member_id,
            member.c.organization_id == organization_id))).where(
        *filters, member.c.user_id == user_id, member.c.is_active.is_(True), member.c.accepted_at.is_not(None),
        binding.c.event_id == Event.id, or_(binding.c.permissions.contains({"EVENTS:VIEW": False}),
            ~func.organizer_access.category_a_team_permissions_valid_v1(binding.c.permissions))).correlate(Event).exists()
    return or_(denial, node_denial, team_denial, legacy_denial)


def require_administrator(context):
    if context.role not in {"owner", "admin"} or not {"workspace:edit", "EVENTS:VIEW"} <= context.actions:
        raise HTTPException(403, detail={"code": "PERMISSION_DENIED"})


async def event_page(db, user, organization_id, workspace_id, after=None, limit=50):
    if not 1 <= limit <= 100:
        raise HTTPException(422, detail={"code": "INVALID_PAGE_SIZE"})
    async with direct_request_context(db, user, organization_id) as context:
        require_administrator(context)
        if "EVENTS:VIEW" not in await get_user_permissions(db, user.id,
            organization_id=organization_id, workspace_id=workspace_id):
            raise HTTPException(404, detail={"code": "RESOURCE_NOT_FOUND"})
        if await db.scalar(select(OperationalWorkspace.id).where(
            OperationalWorkspace.organization_id == organization_id, OperationalWorkspace.id == workspace_id)) is None:
            raise HTTPException(404, detail={"code": "RESOURCE_NOT_FOUND"})
        query = select(Event.id, Event.name, Event.version, Event.operational_workspace_id).where(
            Event.organization_id == organization_id, Event.operational_workspace_id == workspace_id,
            Event.deleted_at.is_(None), ~event_read_denied(user.id, organization_id, workspace_id))
        if after is not None:
            query = query.where(Event.id > after)
        rows = (await db.execute(query.order_by(Event.id).limit(limit + 1))).mappings().all()
        return {"items": [dict(row) for row in rows[:limit]],
            "next_cursor": str(rows[limit - 1]["id"]) if len(rows) > limit else None,
            "policy_revision": context.policy_revision}


async def reassign_event(db, user, organization_id, event_id, workspace_id, expected, reason, key):
    if type(expected) is not int or expected < 1:
        raise HTTPException(428, detail={"code": "VERSION_REQUIRED"})
    if not isinstance(reason, str) or not 3 <= len(reason.strip()) <= 500:
        raise HTTPException(422, detail={"code": "AUDIT_REASON_REQUIRED"})
    reason = reason.strip()
    try:
        async with direct_request_context(db, user, organization_id, write=True) as context:
            require_administrator(context)
            # Organisation-wide administration alone cannot override event denials.
            if "EVENTS:EDIT" not in await get_user_permissions(db, user.id, event_id,
                organization_id=organization_id):
                owned = await db.scalar(select(Event.id).where(Event.id == event_id,
                    Event.organization_id == organization_id, Event.deleted_at.is_(None)))
                raise HTTPException(403 if owned else 404, detail={"code": "PERMISSION_DENIED" if owned else "RESOURCE_NOT_FOUND"})
            if "EVENTS:EDIT" not in await get_user_permissions(db, user.id,
                organization_id=organization_id, workspace_id=workspace_id):
                raise HTTPException(404, detail={"code": "RESOURCE_NOT_FOUND"})
            receipt = await begin_idempotent(db, organization_id=organization_id, actor_id=user.id,
                operation="workspace.event.reassign", key=key,
                payload={"actor_id": str(user.id), "event_id": str(event_id),
                    "workspace_id": str(workspace_id), "version": expected, "reason": reason})
            replay = replay_response(receipt)
            if replay is not None:
                await db.commit()
                return replay[1]
            event = await db.scalar(select(Event).where(Event.id == event_id,
                Event.organization_id == organization_id, Event.deleted_at.is_(None))
                .with_for_update(of=Event).execution_options(populate_existing=True))
            if event is None:
                raise HTTPException(404, detail={"code": "RESOURCE_NOT_FOUND"})
            check_version(event.version, expected)
            destination = await db.scalar(select(OperationalWorkspace.id).where(
                OperationalWorkspace.id == workspace_id, OperationalWorkspace.organization_id == organization_id,
                OperationalWorkspace.status == "ACTIVE"))
            if destination is None:
                raise HTTPException(404, detail={"code": "RESOURCE_NOT_FOUND"})
            if event.operational_workspace_id == workspace_id:
                raise HTTPException(409, detail={"code": "EVENT_ALREADY_IN_WORKSPACE"})
            previous = event.operational_workspace_id
            event.operational_workspace_id = workspace_id
            event.version += 1
            event.updated_by = user.id
            revision = await lock_revision(db, organization_id, write=True)
            revision.revision += 1
            correlation_id = uuid.uuid4()
            output = {"id": str(event.id), "operational_workspace_id": str(workspace_id),
                "version": event.version, "policy_revision": revision.revision, "correlation_id": str(correlation_id)}
            db.add(AuditLog(organization_id=organization_id, actor_user_id=user.id,
                action_type="EVENT_WORKSPACE_REASSIGNED", resource_type="event", resource_id=event.id,
                old_state={"workspace_id": str(previous) if previous else None, "version": expected},
                new_state={**output, "acting_organization_id": str(organization_id),
                    "target_organization_id": str(organization_id)}, change_diff={"reason": reason},
                correlation_id=correlation_id, is_sensitive=True))
            await complete_idempotent(db, receipt, response_status=200, response_body=output, resource_id=event.id)
            await db.commit()
            return output
    except Exception:
        await db.rollback()
        raise
