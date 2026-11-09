"""Scoped assignment commands ordered against policy revocation, with receipts."""
import uuid
from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy import and_, or_, select
from sqlalchemy.exc import IntegrityError
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response
from app.modules.audit.models.audit_log import AuditLog
from app.modules.identity.models.user import User
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.rbac.models.rbac import Role, UserRoleAssignment
from app.modules.rbac.services.access_contexts import direct_administration_context
from app.modules.rbac.services.access_foundation import check_version, lock_revision
from app.modules.rbac.services.event_scope import owned_event_scope
from app.modules.rbac.services.permission_service import get_user_permissions
from app.modules.rbac.services.permission_catalogue import OPERATIONAL_ACTIONS
from app.modules.rbac.services.role_graph import effective_role_actions
from app.modules.events.models.event import Event


async def assignment_command(db, user, payload, key, expected, *, assignment_id=None):
    if expected is None:
        raise HTTPException(428, detail={"code": "VERSION_REQUIRED"})
    try:
        return await _assignment_command(db, user, payload, key, expected, assignment_id=assignment_id)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, detail={"code": "ASSIGNMENT_CONFLICT"}) from None


async def _assignment_command(db, user, payload, key, expected, *, assignment_id):
    async with direct_administration_context(db, user, user.request_organization_id, write=True) as context:
        if "roles:manage" not in context.actions:
            raise HTTPException(403, detail={"code": "PERMISSION_DENIED"})
        operation = "revoke" if assignment_id else "create"
        assignment = None
        old_state = None
        if assignment_id:
            assignment = await db.scalar(select(UserRoleAssignment).where(
                UserRoleAssignment.id == assignment_id,
                UserRoleAssignment.organization_id == context.organization_id)
                .with_for_update().execution_options(populate_existing=True))
            if assignment is None:
                raise HTTPException(404, detail={"code": "ROLE_ASSIGNMENT_NOT_FOUND"})
            old_state = {"user_id": str(assignment.user_id), "role_id": str(assignment.role_id),
                "event_id": str(assignment.event_id) if assignment.event_id else None,
                "version": assignment.version, "revoked": assignment.revoked_at is not None}
            # A roles manager can reduce authority even when the subject is
            # suspended or the old role has subsequently been archived.
            if assignment.event_id is not None and not await db.scalar(select(Event.id).where(
                Event.id == assignment.event_id, Event.deleted_at.is_(None),
                owned_event_scope(db, Event.id, context.organization_id))):
                raise HTTPException(404, detail={"code": "ROLE_ASSIGNMENT_NOT_FOUND"})
        else:
            r, m, identity = Role.__table__.c, OrganizationMember.__table__.c, User.__table__.c
            role = (await db.execute(select(r.id, r.version).where(r.id == payload.role_id,
                r.deleted_at.is_(None), or_(r.organization_id == context.organization_id,
                    and_(r.organization_id.is_(None), r.is_system_role.is_(True), r.name != "Super Admin"))))).mappings().first()
            member = (await db.execute(select(m.id, m.version).select_from(OrganizationMember.__table__.join(
                User.__table__, identity.id == m.user_id)).where(m.organization_id == context.organization_id,
                m.user_id == payload.user_id, m.is_active.is_(True), m.accepted_at.is_not(None),
                identity.is_active.is_(True), identity.deleted_at.is_(None)))).mappings().first()
            if role is None or member is None:
                raise HTTPException(404, detail={"code": "ROLE_OR_MEMBER_NOT_FOUND"})
            if payload.event_id is not None and not await db.scalar(select(Event.id).where(
                Event.id == payload.event_id, Event.deleted_at.is_(None),
                owned_event_scope(db, Event.id, context.organization_id))):
                raise HTTPException(404, detail={"code": "EVENT_NOT_FOUND"})
            actions = await effective_role_actions(db, payload.role_id, context.organization_id)
            selector = db.info.get("customer_request_selector")
            operator = set(await get_user_permissions(db, user.id, organization_id=context.organization_id,
                event_id=payload.event_id, workspace_id=selector.active_workspace_id if selector else None))
            if not actions <= operator or (payload.event_id is not None and not actions <= OPERATIONAL_ACTIONS):
                raise HTTPException(403, detail={"code": "GRANT_EXCEEDS_AUTHORITY"})
        receipt = await begin_idempotent(db, organization_id=context.organization_id, actor_id=user.id,
            operation=f"role.assignment.{operation}", key=key, payload={**payload.model_dump(mode="json"),
                "actor_id": str(user.id), "assignment_id": str(assignment_id) if assignment_id else None,
                "version": expected})
        replay = replay_response(receipt)
        if replay is not None:
            await db.commit()
            return replay[1]
        if assignment_id:
            check_version(assignment.version, expected)
            if assignment.revoked_at is not None:
                raise HTTPException(409, detail={"code": "ASSIGNMENT_ALREADY_REVOKED"})
            assignment.revoked_at = datetime.now(timezone.utc)
            assignment.version += 1
        else:
            check_version(0, expected)
            check_version(role["version"], payload.role_version)
            check_version(member["version"], payload.member_version)
            existing = await db.scalar(select(UserRoleAssignment.id).where(
                UserRoleAssignment.organization_id == context.organization_id,
                UserRoleAssignment.user_id == payload.user_id, UserRoleAssignment.role_id == payload.role_id,
                UserRoleAssignment.event_id == payload.event_id if payload.event_id else UserRoleAssignment.event_id.is_(None),
                UserRoleAssignment.revoked_at.is_(None)).limit(1))
            if existing is not None:
                raise HTTPException(409, detail={"code": "ASSIGNMENT_ALREADY_EXISTS"})
            assignment = UserRoleAssignment(user_id=payload.user_id, role_id=payload.role_id,
                organization_id=context.organization_id, event_id=payload.event_id, assigned_by=user.id)
            db.add(assignment)
        await db.flush()
        revision = await lock_revision(db, context.organization_id, write=True)
        revision.revision += 1
        correlation = uuid.uuid4()
        result = {"id": str(assignment.id), "user_id": str(assignment.user_id), "role_id": str(assignment.role_id),
            "event_id": str(assignment.event_id) if assignment.event_id else None,
            "version": assignment.version, "revoked": assignment.revoked_at is not None,
            "policy_revision": revision.revision, "correlation_id": str(correlation)}
        db.add(AuditLog(organization_id=context.organization_id, actor_user_id=user.id, actor_role=user.role,
            resource_type="user_role_assignment", resource_id=assignment.id,
            action_type="USER_ROLE_REVOKED" if assignment_id else "USER_ROLE_ASSIGNED",
            correlation_id=correlation, is_sensitive=True, old_state=old_state,
            new_state={**result, "reason": payload.reason,
                "acting_organization_id": str(context.organization_id), "target_organization_id": str(context.organization_id)}))
        await complete_idempotent(db, receipt, response_status=200 if assignment_id else 201,
            response_body=result, resource_id=assignment.id)
        await db.commit()
        return result
