"""Versioned workspace access, using existing membership and policy locks."""
from fastapi import HTTPException
from sqlalchemy import and_, select

from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response
from app.modules.identity.models.user import User
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.rbac.models.access_foundation import OperationalWorkspace, WorkspaceRoleBinding, OrganizationAccessRevision
from app.modules.rbac.services.access_contexts import direct_request_context
from app.modules.rbac.services.access_foundation import audit, check_version


async def workspace_admin(db, context, workspace_id):
    workspace = await db.scalar(select(OperationalWorkspace).where(
        OperationalWorkspace.organization_id == context.organization_id,
        OperationalWorkspace.id == workspace_id, OperationalWorkspace.status == "ACTIVE"))
    if workspace is None:
        raise HTTPException(404, detail={"code": "WORKSPACE_NOT_FOUND"})
    if "members:manage" not in context.actions:
        raise HTTPException(403, detail={"code": "PERMISSION_DENIED"})


async def member_page(db, user, organization_id, workspace_id, after=None, limit=50):
    if not 1 <= limit <= 100:
        raise HTTPException(422, detail={"code": "INVALID_PAGE_SIZE"})
    async with direct_request_context(db, user, organization_id) as context:
        await workspace_admin(db, context, workspace_id)
        # Explicit projection through accepted membership is the only identity
        # directory exposed here. No global user directory/filter bypass.
        m, u, b = OrganizationMember.__table__, User.__table__, WorkspaceRoleBinding.__table__
        query = select(m.c.id.label("member_id"), u.c.first_name, u.c.last_name,
                       b.c.role, b.c.version, b.c.is_active).select_from(
            m.join(u, u.c.id == m.c.user_id).outerjoin(b, and_(b.c.organization_id == organization_id,
                b.c.workspace_id == workspace_id, b.c.member_id == m.c.id))).where(
            m.c.organization_id == organization_id, m.c.is_active.is_(True), m.c.accepted_at.is_not(None),
            u.c.is_active.is_(True), u.c.deleted_at.is_(None))
        if after is not None:
            query = query.where(m.c.id > after)
        rows = (await db.execute(query.order_by(m.c.id).limit(limit + 1))).mappings().all()
        return {"items": [{"member_id": row["member_id"], "name": f"{row['first_name']} {row['last_name']}",
                           "role": row["role"] if row["is_active"] else None, "version": row["version"] or 0}
                          for row in rows[:limit]],
                "next_cursor": str(rows[limit-1]["member_id"]) if len(rows) > limit else None,
                "policy_revision": context.policy_revision}


async def save_binding(db, user, organization_id, workspace_id, member_id, *, role, reason, expected, key):
    async with direct_request_context(db, user, organization_id, write=True) as context:
        await workspace_admin(db, context, workspace_id)
        m, u = OrganizationMember.__table__, User.__table__
        member = await db.scalar(select(m.c.id).select_from(m.join(u, u.c.id == m.c.user_id)).where(
            m.c.id == member_id, m.c.organization_id == organization_id,
            m.c.is_active.is_(True), m.c.accepted_at.is_not(None),
            u.c.is_active.is_(True), u.c.deleted_at.is_(None)))
        if member is None:
            raise HTTPException(404, detail={"code": "MEMBER_NOT_FOUND"})
        reservation = await begin_idempotent(db, organization_id=organization_id, actor_id=user.id,
            operation="workspace.member.change", key=key, payload={"workspace_id": str(workspace_id),
                "actor_id": str(user.id), "member_id": str(member_id), "role": role, "reason": reason, "version": expected})
        replay = replay_response(reservation)
        if replay is not None:
            await db.commit()
            return replay[1]
        binding = await db.scalar(select(WorkspaceRoleBinding).where(
            WorkspaceRoleBinding.organization_id == organization_id, WorkspaceRoleBinding.workspace_id == workspace_id,
            WorkspaceRoleBinding.member_id == member_id).with_for_update().execution_options(populate_existing=True))
        check_version(binding.version if binding else 0, expected)
        previous_role = binding.role if binding and binding.is_active else None
        if binding is None:
            if role is None:
                raise HTTPException(409, detail={"code": "NO_WORKSPACE_GRANT"})
            binding = WorkspaceRoleBinding(organization_id=organization_id, workspace_id=workspace_id, member_id=member_id, role=role)
            db.add(binding); await db.flush()
        else:
            if role is not None:
                binding.role = role
            binding.is_active = role is not None
            binding.version += 1
        revision = await db.get(OrganizationAccessRevision, organization_id)
        revision.revision += 1
        result = {"member_id": str(member_id), "role": role, "version": binding.version, "policy_revision": revision.revision}
        audit(db, user, organization_id, "WORKSPACE_MEMBER_CHANGED", workspace_id,
              {**result, "binding_id": str(binding.id), "previous_role": previous_role, "previous_version": expected, "reason": reason})
        await complete_idempotent(db, reservation, response_status=200, response_body=result, resource_id=binding.id)
        await db.commit()
        return result
