"""Versioned parent replacement through existing graph, revision and audit services."""
import uuid
from fastapi import HTTPException
from sqlalchemy import and_, or_, select
from sqlalchemy.exc import IntegrityError
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response
from app.modules.audit.models.audit_log import AuditLog
from app.modules.rbac.models.rbac import Role, RoleInheritanceMap
from app.modules.rbac.services.access_contexts import direct_administration_context
from app.modules.rbac.services.access_foundation import check_version, lock_revision
from app.modules.rbac.services.role_graph import effective_role_actions, replace_parents


async def inheritance_command(db, user, role_id, payload, expected, key):
    if expected is None:
        raise HTTPException(428, detail={"code": "VERSION_REQUIRED"})
    try:
        async with direct_administration_context(db, user, user.request_organization_id, write=True) as context:
            if "roles:manage" not in context.actions:
                raise HTTPException(403, detail={"code": "PERMISSION_DENIED"})
            child = await db.scalar(select(Role).where(Role.id == role_id,
                Role.organization_id == context.organization_id, Role.deleted_at.is_(None))
                .with_for_update().execution_options(populate_existing=True))
            if child is None:
                raise HTTPException(404, detail={"code": "ROLE_NOT_FOUND"})
            if child.is_system_role:
                raise HTTPException(403, detail={"code": "SYSTEM_ROLE_IMMUTABLE"})
            ids = [parent.id for parent in payload.parents]
            if len(set(ids)) != len(ids):
                raise HTTPException(422, detail={"code": "DUPLICATE_ROLE_PARENTS"})
            r = Role.__table__.c
            parents = dict((await db.execute(select(r.id, r.version).where(r.id.in_(ids),
                r.deleted_at.is_(None), or_(r.organization_id == context.organization_id,
                    and_(r.organization_id.is_(None), r.is_system_role.is_(True), r.name != "Super Admin"))))).all())
            if set(parents) != set(ids):
                raise HTTPException(404, detail={"code": "ROLE_NOT_FOUND"})
            receipt = await begin_idempotent(db, organization_id=context.organization_id, actor_id=user.id,
                operation="role.parents.replace", key=key, payload={**payload.model_dump(mode="json"),
                    "actor_id": str(user.id), "role_id": str(role_id), "version": expected})
            replay = replay_response(receipt)
            if replay is not None:
                await db.commit()
                return replay[1]
            check_version(child.version, expected)
            for parent in payload.parents:
                check_version(parents[parent.id], parent.version)
            old = (await db.scalars(select(RoleInheritanceMap.parent_role_id).where(
                RoleInheritanceMap.child_role_id == child.id))).all()
            # All edge edits hold the exclusive revision lock. Reuse the cycle
            # check and reject the transaction if its resulting grants exceed
            # operator authority; no partial replacement is committed.
            await replace_parents(db, context.organization_id, child.id, ids)
            await db.flush()
            if not await effective_role_actions(db, child.id, context.organization_id) <= context.actions:
                raise HTTPException(403, detail={"code": "GRANT_EXCEEDS_AUTHORITY"})
            child.version += 1
            revision = await lock_revision(db, context.organization_id, write=True)
            revision.revision += 1
            correlation = uuid.uuid4()
            result = {"role_id": str(child.id), "version": child.version, "parent_ids": [str(i) for i in ids],
                "policy_revision": revision.revision, "correlation_id": str(correlation)}
            db.add(AuditLog(organization_id=context.organization_id, actor_user_id=user.id, actor_role=user.role,
                resource_type="user_role", resource_id=child.id, action_type="USER_ROLE_PARENTS_REPLACED",
                correlation_id=correlation, is_sensitive=True, old_state={"parent_ids": [str(i) for i in old]},
                new_state={**result, "reason": payload.reason, "acting_organization_id": str(context.organization_id),
                    "target_organization_id": str(context.organization_id)}))
            await complete_idempotent(db, receipt, response_status=200, response_body=result, resource_id=child.id)
            await db.commit()
            return result
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, detail={"code": "ROLE_INHERITANCE_CONFLICT"}) from None
