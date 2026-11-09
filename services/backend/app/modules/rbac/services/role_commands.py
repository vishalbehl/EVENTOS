"""Versioned role lifecycle using existing tenant revisions, receipts and audits."""
import uuid
from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy import and_, or_, select, func
from sqlalchemy.exc import IntegrityError
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response
from app.modules.audit.models.audit_log import AuditLog
from app.modules.rbac.models.rbac import Role, RolePermission, Permission, UserRoleAssignment, RoleInheritanceMap
from app.modules.rbac.services.access_contexts import direct_administration_context
from app.modules.rbac.services.access_foundation import lock_revision, check_version
from app.modules.rbac.services.role_graph import effective_role_actions


async def role_command(db, user, operation, payload, key, *, role_id=None, expected=None):
    try:
        return await _role_command(db, user, operation, payload, key, role_id=role_id, expected=expected)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, detail={"code": "ROLE_MUTATION_CONFLICT"}) from None


async def _role_command(db, user, operation, payload, key, *, role_id=None, expected=None):
    if operation not in {"create", "update", "clone", "archive"}:
        raise ValueError("Unsupported role lifecycle operation")
    async with direct_administration_context(db, user, user.request_organization_id, write=True) as context:
        if "roles:manage" not in context.actions:
            raise HTTPException(403, detail={"code": "PERMISSION_DENIED"})
        if operation != "create" and expected is None:
            raise HTTPException(428, detail={"code": "VERSION_REQUIRED"})
        role = None
        if operation != "create":
            r = Role.__table__.c
            permitted = r.organization_id == context.organization_id
            if operation == "clone":
                permitted = or_(permitted, and_(r.organization_id.is_(None), r.is_system_role.is_(True), r.name != "Super Admin"))
            source = (await db.execute(select(r.id, r.name, r.description, r.version, r.is_system_role).where(
                r.id == role_id, r.deleted_at.is_(None) if operation != "archive" else True, permitted))).mappings().first()
            if source is None:
                raise HTTPException(404, detail={"code": "ROLE_NOT_FOUND"})
            if operation != "clone":
                role = await db.scalar(select(Role).where(Role.id == role_id,
                    Role.organization_id == context.organization_id).with_for_update().execution_options(populate_existing=True))
                if role.is_system_role:
                    raise HTTPException(403, detail={"code": "SYSTEM_ROLE_IMMUTABLE"})
            if operation == "clone":
                source_actions = await effective_role_actions(db, role_id, context.organization_id)
                if not source_actions <= context.actions:
                    raise HTTPException(403, detail={"code": "GRANT_EXCEEDS_AUTHORITY"})
        receipt = await begin_idempotent(db, organization_id=context.organization_id, actor_id=user.id,
            operation=f"role.{operation}", key=key, payload={**payload.model_dump(mode="json"),
                "actor_id": str(user.id), "role_id": str(role_id) if role_id else None, "version": expected})
        replay = replay_response(receipt)
        if replay is not None:
            await db.commit()
            return replay[1]
        if operation != "create":
            check_version(source["version"], expected)
        old = dict(source) if operation != "create" else None
        if old:
            old["id"] = str(old["id"])
        if operation == "archive":
            if role.deleted_at is not None:
                raise HTTPException(409, detail={"code": "ROLE_ALREADY_ARCHIVED"})
            assignment = UserRoleAssignment.__table__.c
            used = await db.scalar(select(assignment.id).where(assignment.role_id == role.id, assignment.revoked_at.is_(None)).limit(1))
            inherited = await db.scalar(select(RoleInheritanceMap.id).where(RoleInheritanceMap.parent_role_id == role.id).limit(1))
            if used is not None or inherited is not None:
                raise HTTPException(409, detail={"code": "ROLE_IN_USE"})
            role.deleted_at = datetime.now(timezone.utc)
            role.version += 1
        else:
            duplicate = await db.scalar(select(Role.id).where(Role.organization_id == context.organization_id,
                Role.deleted_at.is_(None), func.lower(Role.name) == payload.name.lower(),
                Role.id != role_id if operation == "update" else True).limit(1))
            if duplicate is not None:
                raise HTTPException(409, detail={"code": "ROLE_NAME_EXISTS"})
            if operation == "update":
                role.name = payload.name; role.description = payload.description; role.version += 1
            else:
                role = Role(organization_id=context.organization_id, name=payload.name,
                    description=payload.description, is_system_role=False)
                db.add(role); await db.flush()
                if operation == "clone":
                    permissions = (await db.execute(select(Permission.id, Permission.code).where(
                        Permission.code.in_(source_actions)))).all()
                    if {code for _, code in permissions} != set(source_actions):
                        raise HTTPException(503, detail={"code": "ROLE_POLICY_RECONCILIATION_REQUIRED"})
                    # Snapshot inherited actions too; the cloned role does not
                    # retain a hidden dependency on another role's future edits.
                    db.add_all([RolePermission(role_id=role.id, permission_id=permission_id) for permission_id, _ in permissions])
        revision = await lock_revision(db, context.organization_id, write=True)
        revision.revision += 1
        correlation = uuid.uuid4()
        result = {"id": str(role.id), "name": role.name, "description": role.description,
            "is_system_role": False, "version": role.version, "scope": "Organization",
            "status": "Archived" if operation == "archive" else "Active", "policy_revision": revision.revision,
            "correlation_id": str(correlation)}
        db.add(AuditLog(organization_id=context.organization_id, actor_user_id=user.id, actor_role=user.role,
            resource_type="user_role", resource_id=role.id, action_type=f"USER_ROLE_{operation.upper()}",
            correlation_id=correlation, is_sensitive=True, old_state=old,
            new_state={**result, "reason": payload.reason, "acting_organization_id": str(context.organization_id),
                       "target_organization_id": str(context.organization_id)}))
        await complete_idempotent(db, receipt, response_status=200, response_body=result, resource_id=role.id)
        await db.commit()
        return result
