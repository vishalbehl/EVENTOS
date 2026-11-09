"""Transaction-owning organization-member commands."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.models.audit_log import AuditLog
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.rbac.services.access_foundation import accepted_member, lock_revision
from app.modules.rbac.services.invitations import issue_token, admission
from app.core.cache import invalidate_organization
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response


class OrganizationMemberCommandService:
    def __init__(self, db: AsyncSession, *, platform_administration: bool = False):
        self.db = db
        self._revision = None
        self._platform_administration = platform_administration

    async def _authorize(self, organization_id, actor, *, owner_only=False, platform_action="platform:members:manage"):
        if self._platform_administration:
            from app.core.tenant_context import TenantContextGuard
            from app.modules.rbac.services.platform_permissions import platform_permission_authority
            from app.modules.platform.models.organization import Organization
            if owner_only:
                raise HTTPException(403, detail={"code": "CLIENT_OWNER_CONSENT_REQUIRED"})
            if platform_action not in {"platform:members:manage", "platform:members:grant"}:
                raise ValueError("Unreviewed membership administration action")
            await platform_permission_authority(self.db, actor.id, platform_action)
            for tenant_id in sorted({actor.organization_id, organization_id}, key=str):
                async with TenantContextGuard.scoped(self.db, tenant_id):
                    revision = await lock_revision(self.db, tenant_id, write=True)
                    if tenant_id == organization_id:
                        self._revision = revision
            await platform_permission_authority(self.db, actor.id, platform_action)
            organization = await self.db.scalar(select(Organization.id).where(
                Organization.id == organization_id, Organization.is_platform_org.is_(False),
                Organization.is_active.is_(True), Organization.suspended_at.is_(None)))
            if organization is None:
                raise HTTPException(404, detail={"code": "RESOURCE_NOT_FOUND"})
            return None  # Explicit platform audience, never a synthetic customer owner.
        # All membership commands take the same lock before target/idempotency
        # locks. This serializes owner changes and orders writes after revocation.
        self._revision = await lock_revision(self.db, organization_id, write=True)
        member = await accepted_member(self.db, actor.id, organization_id)
        if member.org_role not in ({"owner"} if owner_only else {"owner", "admin"}):
            raise HTTPException(403, detail={"code": "MEMBERSHIP_ADMIN_REQUIRED"})
        from app.modules.rbac.services.permission_service import get_user_permissions
        if "members:manage" not in await get_user_permissions(self.db, actor.id, organization_id=organization_id):
            raise HTTPException(403, detail={"code": "PERMISSION_DENIED"})
        return member

    @staticmethod
    def _validate_reason(reason):
        if not isinstance(reason, str) or not 3 <= len(reason.strip()) <= 1000:
            raise HTTPException(422, detail={"code": "AUDIT_REASON_REQUIRED"})

    async def create_invitation(self, *, organization_id, actor, email, org_role, idempotency_key, reason="Create membership invitation"):
        from app.modules.billing.services.usage_reservation_service import UsageReservationService
        from app.modules.identity.models.user import User
        from sqlalchemy import func, or_
        try:
            await self._authorize(organization_id, actor)
            self._validate_reason(reason)
            if org_role not in {"admin", "member", "billing_only"}:
                raise HTTPException(422, detail={"code": "INVALID_ORGANIZATION_ROLE"})
            normalized = email.strip().lower()
            idem = await begin_idempotent(self.db, organization_id=organization_id, actor_id=actor.id,
                operation="organization.invitation.create", key=idempotency_key,
                payload={"email": normalized, "org_role": org_role, "reason": reason})
            replay = replay_response(idem)
            if replay is not None:
                await self.db.commit()
                return {**replay[1], "invite_token": None, "replayed": True}
            member_table, user_table = OrganizationMember.__table__, User.__table__
            existing = await self.db.scalar(select(member_table.c.id).outerjoin(
                user_table, user_table.c.id == member_table.c.user_id).where(
                member_table.c.organization_id == organization_id,
                or_(func.lower(member_table.c.invite_email) == normalized,
                    func.lower(user_table.c.email) == normalized),
                or_(member_table.c.is_active.is_(True), member_table.c.accepted_at.is_not(None)),
            ).limit(1))
            if existing is not None:
                raise HTTPException(409, detail={"code": "MEMBERSHIP_EXISTS"})
            await admission(actor.id, organization_id)
            reservation = await UsageReservationService.reserve(self.db, organization_id=organization_id,
                event_id=None, limit_key="max_users", quantity=1, unit="user",
                idempotency_key=f"organization-member-invite:{idempotency_key}", metadata={"invite_email": normalized})
            member = OrganizationMember(organization_id=organization_id, org_role=org_role,
                                        invited_by=actor.id, invite_email=normalized)
            token = issue_token(member)
            self.db.add(member)
            await self.db.flush()
            await UsageReservationService.consume(self.db, reservation.id, source="organization.members.invite", actor_user_id=actor.id)
            result = {"membership_id": str(member.id), "version": member.version,
                "expires_at": member.invite_expires_at.isoformat(), "delivery_mode": "MANUAL",
                "message": "Invitation created. Share the one-time link with the intended recipient."}
            self._audit(organization_id, actor, member.id, "ORGANIZATION_MEMBER_INVITED", None,
                        {"invite_email": normalized, "org_role": org_role, "reason": reason})
            await complete_idempotent(self.db, idem, response_status=200, response_body=result, resource_id=member.id)
            await self.db.commit()
            await invalidate_organization(organization_id)
            return {**result, "invite_token": token, "replayed": False}
        except Exception:
            await self.db.rollback()
            raise

    async def resend_invitation(self, *, organization_id, member_id, actor, if_match: int, idempotency_key: str | None = None, reason="Rotate pending invitation credential") -> tuple[OrganizationMember, str | None]:
        try:
            await self._authorize(organization_id, actor)
            self._validate_reason(reason)
            idem = None
            if idempotency_key:
                idem = await begin_idempotent(
                    self.db, organization_id=organization_id, actor_id=actor.id,
                    operation="organiser.member.invitation.resend", key=idempotency_key,
                    payload={"member_id": str(member_id), "if_match": if_match, "reason": reason},
                )
                if replay_response(idem) is not None:
                    member = await self._member_by_id(organization_id, member_id)
                    if member is None:
                        raise RuntimeError("Completed invitation idempotency resource is missing.")
                    await self.db.commit()
                    return member, None
            member = await self._pending_member(organization_id, member_id)
            if member is None:
                raise HTTPException(status_code=404, detail={"code": "PENDING_INVITATION_NOT_FOUND"})
            self._check_version(member.version, if_match)
            await admission(actor.id, organization_id)
            token = issue_token(member)
            member.version = int(member.version or 1) + 1
            self._audit(organization_id, actor, member.id, "ORGANIZATION_INVITATION_RESENT",
                        None, {"invite_email": member.invite_email, "version": member.version, "reason": reason})
            if idem is not None:
                await complete_idempotent(
                    self.db, idem, response_status=200,
                    response_body={"id": str(member.id), "version": member.version},
                    resource_id=member.id,
                )
            await self.db.commit()
            await invalidate_organization(organization_id)
            return member, token
        except Exception:
            await self.db.rollback()
            raise

    async def revoke_invitation(self, *, organization_id, member_id, actor, if_match: int, idempotency_key: str | None = None) -> OrganizationMember:
        try:
            await self._authorize(organization_id, actor)
            idem = None
            if idempotency_key:
                idem = await begin_idempotent(
                    self.db, organization_id=organization_id, actor_id=actor.id,
                    operation="organiser.member.invitation.revoke", key=idempotency_key,
                    payload={"member_id": str(member_id), "if_match": if_match},
                )
                if replay_response(idem) is not None:
                    member = await self._member_by_id(organization_id, member_id)
                    if member is None:
                        raise RuntimeError("Completed invitation idempotency resource is missing.")
                    await self.db.commit()
                    return member
            member = await self._pending_member(organization_id, member_id)
            if member is None:
                raise HTTPException(status_code=404, detail={"code": "PENDING_INVITATION_NOT_FOUND"})
            self._check_version(member.version, if_match)
            old = {"invite_email": member.invite_email, "is_active": member.is_active, "version": member.version}
            member.is_active = False
            member.invite_token = None
            member.invite_token_digest = None
            member.version = int(member.version or 1) + 1
            self._audit(organization_id, actor, member.id, "ORGANIZATION_INVITATION_REVOKED",
                        old, {"is_active": False, "version": member.version})
            if idem is not None:
                await complete_idempotent(
                    self.db, idem, response_status=200,
                    response_body={"id": str(member.id), "version": member.version},
                    resource_id=member.id,
                )
            await self.db.commit()
            await invalidate_organization(organization_id)
            return member
        except Exception:
            await self.db.rollback()
            raise

    async def update_role(self, *, organization_id, member_id, actor, org_role: str, if_match: int, reason: str, idempotency_key: str | None = None) -> OrganizationMember:
        try:
            operator = await self._authorize(organization_id, actor)
            self._validate_reason(reason)
            if org_role not in {"owner", "admin", "member", "billing_only"}:
                raise HTTPException(422, detail={"code": "INVALID_ORGANIZATION_ROLE"})
            idem = None
            if idempotency_key:
                idem = await begin_idempotent(
                    self.db, organization_id=organization_id, actor_id=actor.id,
                    operation="organiser.member.role.update", key=idempotency_key,
                    payload={"member_id": str(member_id), "org_role": org_role, "reason": reason, "if_match": if_match},
                )
                if replay_response(idem) is not None:
                    member = await self._member_by_id(organization_id, member_id)
                    if member is None:
                        raise RuntimeError("Completed member idempotency resource is missing.")
                    await self.db.commit()
                    return member
            member = await self._accepted_member(organization_id, member_id)
            if member is None:
                raise HTTPException(status_code=404, detail={"code": "MEMBER_NOT_FOUND"})
            self._check_version(member.version, if_match)
            if (member.org_role == "owner" or org_role == "owner") and (operator is None or operator.org_role != "owner"):
                raise HTTPException(403, detail={"code": "OWNER_AUTHORITY_REQUIRED"})
            if org_role == "owner":
                from app.modules.identity.models.user import User
                identity = (await self.db.execute(select(User.__table__.c.id).where(
                    User.__table__.c.id == member.user_id, User.__table__.c.is_active.is_(True),
                    User.__table__.c.deleted_at.is_(None)).with_for_update())).first()
                if identity is None or not member.is_active:
                    raise HTTPException(409, detail={"code": "ACTIVE_OWNER_IDENTITY_REQUIRED"})
            if member.org_role == "owner" and org_role != "owner":
                from app.modules.identity.models.user import User
                other_owner = await self.db.scalar(select(OrganizationMember.id).join(
                    User, User.id == OrganizationMember.user_id).where(
                    OrganizationMember.organization_id == organization_id,
                    OrganizationMember.id != member.id,
                    OrganizationMember.org_role == "owner",
                    OrganizationMember.is_active.is_(True),
                    OrganizationMember.accepted_at.is_not(None),
                    User.is_active.is_(True), User.deleted_at.is_(None),
                ).limit(1))
                if other_owner is None:
                    raise HTTPException(status_code=422, detail={"code": "LAST_OWNER_CANNOT_BE_DEMOTED"})
            old_role = member.org_role
            member.org_role = org_role
            member.version = int(member.version or 1) + 1
            self._audit(organization_id, actor, member.id, "ORGANIZATION_MEMBER_ROLE_CHANGED",
                        {"org_role": old_role, "version": if_match},
                        {"org_role": org_role, "reason": reason, "version": member.version})
            if idem is not None:
                await complete_idempotent(
                    self.db, idem, response_status=200,
                    response_body={"id": str(member.id), "org_role": member.org_role, "version": member.version},
                    resource_id=member.id,
                )
            await self.db.commit()
            await invalidate_organization(organization_id)
            return member
        except Exception:
            await self.db.rollback()
            raise

    async def update_status(self, *, organization_id, member_id, actor, is_active: bool, if_match: int, reason: str, idempotency_key: str | None = None) -> OrganizationMember:
        try:
            await self._authorize(organization_id, actor)
            self._validate_reason(reason)
            idem = None
            if idempotency_key:
                idem = await begin_idempotent(
                    self.db, organization_id=organization_id, actor_id=actor.id,
                    operation="organiser.member.status.update", key=idempotency_key,
                    payload={"member_id": str(member_id), "is_active": is_active, "reason": reason, "if_match": if_match},
                )
                if replay_response(idem) is not None:
                    member = await self._member_by_id(organization_id, member_id)
                    if member is None:
                        raise RuntimeError("Completed member idempotency resource is missing.")
                    await self.db.commit()
                    return member
            member = await self._accepted_member(organization_id, member_id)
            if member is None:
                raise HTTPException(status_code=404, detail={"code": "MEMBER_NOT_FOUND"})
            if member.org_role == "owner" and not is_active:
                raise HTTPException(status_code=422, detail={"code": "OWNER_CANNOT_BE_SUSPENDED"})
            self._check_version(member.version, if_match)
            old = {"is_active": member.is_active, "version": member.version}
            member.is_active = is_active
            member.suspension_reason = None if is_active else reason
            member.version = int(member.version or 1) + 1
            action = "ORGANIZATION_MEMBER_REACTIVATED" if is_active else "ORGANIZATION_MEMBER_SUSPENDED"
            self._audit(organization_id, actor, member.id, action, old,
                        {"is_active": is_active, "reason": reason, "version": member.version})
            if idem is not None:
                await complete_idempotent(
                    self.db, idem, response_status=200,
                    response_body={"id": str(member.id), "is_active": member.is_active, "version": member.version},
                    resource_id=member.id,
                )
            await self.db.commit()
            await invalidate_organization(organization_id)
            return member
        except Exception:
            await self.db.rollback()
            raise

    async def bulk_update_status(self, *, organization_id, members: list[tuple[object, int]], actor,
                                 is_active: bool, reason: str,
                                 idempotency_key: str) -> list[dict[str, object]]:
        """Apply one validated status mutation and one commit for a bounded member batch."""
        try:
            await self._authorize(organization_id, actor)
            self._validate_reason(reason)
            if not 1 <= len(members) <= 100:
                raise HTTPException(422, detail={"code": "MEMBER_BATCH_SIZE_EXCEEDED"})
            requested = dict(members)
            if len(requested) != len(members):
                raise HTTPException(status_code=422, detail={"code": "DUPLICATE_MEMBER_IDS"})
            idem = await begin_idempotent(
                self.db,
                organization_id=organization_id,
                actor_id=actor.id,
                operation="organization.members.bulk-status",
                key=idempotency_key,
                payload={
                    "members": sorted(
                        ({"id": str(member_id), "version": version}
                         for member_id, version in members),
                        key=lambda item: item["id"],
                    ),
                    "is_active": is_active,
                    "reason": reason,
                },
            )
            replay = replay_response(idem)
            if replay is not None:
                await self.db.commit()
                return replay["items"]
            rows = (await self.db.scalars(select(OrganizationMember).where(
                OrganizationMember.organization_id == organization_id,
                OrganizationMember.id.in_(requested),
                OrganizationMember.accepted_at.is_not(None),
            ).order_by(OrganizationMember.id).with_for_update().execution_options(populate_existing=True))).all()
            if len(rows) != len(requested):
                raise HTTPException(status_code=404, detail={"code": "MEMBER_NOT_FOUND"})
            conflicts = [{"id": str(row.id), "current_version": row.version}
                         for row in rows if row.version != requested[row.id]]
            if conflicts:
                raise HTTPException(status_code=412, detail={"code": "VERSION_CONFLICT", "members": conflicts})
            if not is_active and any(row.org_role == "owner" for row in rows):
                raise HTTPException(status_code=422, detail={"code": "OWNER_CANNOT_BE_SUSPENDED"})

            updated = []
            action = "ORGANIZATION_MEMBER_REACTIVATED" if is_active else "ORGANIZATION_MEMBER_SUSPENDED"
            for member in rows:
                old = {"is_active": member.is_active, "version": member.version}
                member.is_active = is_active
                member.suspension_reason = None if is_active else reason
                member.version = int(member.version or 1) + 1
                self._audit(organization_id, actor, member.id, action, old, {
                    "is_active": member.is_active, "reason": reason,
                    "version": member.version, "bulk": True,
                })
                updated.append({"id": str(member.id), "is_active": member.is_active, "version": member.version})
            await complete_idempotent(
                self.db, idem, response_status=200,
                response_body={"items": updated, "updated": len(updated)},
            )
            await self.db.commit()
            await invalidate_organization(organization_id)
            return updated
        except Exception:
            await self.db.rollback()
            raise

    async def transfer_ownership(self, *, organization_id, actor, target_member_id,
                                 source_version, target_version, reason, idempotency_key):
        """Promote the accepted successor and demote the acting owner atomically."""
        from app.modules.identity.models.user import User
        try:
            source = await self._authorize(organization_id, actor, owner_only=True)
            self._validate_reason(reason)
            if source.id == target_member_id:
                raise HTTPException(409, detail={"code": "OWNER_TRANSFER_SAME_MEMBER"})
            idem = await begin_idempotent(self.db, organization_id=organization_id, actor_id=actor.id,
                operation="organization.owner.transfer", key=idempotency_key, payload={"actor_id": str(actor.id),
                    "target_member_id": str(target_member_id), "source_version": source_version,
                    "target_version": target_version, "reason": reason})
            replay = replay_response(idem)
            if replay is not None:
                await self.db.commit()
                return replay[1]
            self._check_version(source.version, source_version)
            target = await self._accepted_member(organization_id, target_member_id)
            if target is None or not target.is_active or target.user_id is None:
                raise HTTPException(404, detail={"code": "MEMBER_NOT_FOUND"})
            u = User.__table__
            identity = await self.db.scalar(select(u.c.id).where(u.c.id == target.user_id,
                u.c.is_active.is_(True), u.c.deleted_at.is_(None)).with_for_update())
            if identity is None:
                raise HTTPException(404, detail={"code": "MEMBER_NOT_FOUND"})
            self._check_version(target.version, target_version)
            if target.org_role == "owner":
                raise HTTPException(409, detail={"code": "MEMBER_ALREADY_OWNER"})
            before_target = target.org_role
            target.org_role = "owner"; target.version += 1
            source.org_role = "admin"; source.version += 1
            correlation = uuid.uuid4()
            result = {"previous_owner_member_id": str(source.id), "previous_owner_version": source.version,
                "owner_member_id": str(target.id), "owner_version": target.version,
                "reason": reason, "correlation_id": str(correlation)}
            self._audit(organization_id, actor, source.id, "ORGANIZATION_OWNERSHIP_TRANSFERRED",
                {"org_role": "owner", "version": source_version}, {**result, "org_role": "admin"}, correlation_id=correlation)
            self._audit(organization_id, actor, target.id, "ORGANIZATION_OWNERSHIP_RECEIVED",
                {"org_role": before_target, "version": target_version}, {**result, "org_role": "owner"}, correlation_id=correlation)
            result["policy_revision"] = self._revision.revision
            await complete_idempotent(self.db, idem, response_status=200, response_body=result, resource_id=target.id)
            await self.db.commit()
            await invalidate_organization(organization_id)
            return result
        except Exception:
            await self.db.rollback()
            raise

    async def set_platform_event_assignment(self, *, organization_id, member_id, event_id, actor,
                                            permissions, assigned, if_match, reason, idempotency_key):
        """Existing event binding, deliberately admitted through the platform audience."""
        from app.modules.identity.models.user import User
        from app.modules.events.models.event import Event
        from app.modules.rbac.models.access_foundation import OperationalWorkspace
        from app.modules.rbac.models.user_assignment import UserEventAssignment
        from app.modules.rbac.services.permission_catalogue import OPERATIONAL_ACTIONS
        from app.modules.billing.services.usage_reservation_service import UsageReservationService
        try:
            if not self._platform_administration:
                raise HTTPException(403, detail={"code": "PLATFORM_PERMISSION_DENIED"})
            await self._authorize(organization_id, actor, platform_action="platform:members:grant")
            self._validate_reason(reason)
            if (not isinstance(permissions, dict) or len(permissions) > 32
                    or any(code not in OPERATIONAL_ACTIONS or type(value) is not bool for code, value in permissions.items())):
                raise HTTPException(422, detail={"code": "INVALID_EVENT_PERMISSIONS"})
            member = await self._accepted_member(organization_id, member_id)
            if member is None or member.user_id is None or (assigned and not member.is_active):
                raise HTTPException(404, detail={"code": "MEMBER_OR_EVENT_NOT_FOUND"})
            event = await self.db.scalar(select(Event.id).join(OperationalWorkspace,
                (OperationalWorkspace.id == Event.operational_workspace_id) &
                (OperationalWorkspace.organization_id == Event.organization_id)).where(
                Event.id == event_id, Event.organization_id == organization_id, Event.deleted_at.is_(None),
                OperationalWorkspace.status == "ACTIVE"))
            identity = await self.db.scalar(select(User.__table__.c.id).where(
                User.__table__.c.id == member.user_id, User.__table__.c.is_active.is_(True), User.__table__.c.deleted_at.is_(None)))
            if event is None or (assigned and identity is None):
                raise HTTPException(404, detail={"code": "MEMBER_OR_EVENT_NOT_FOUND"})
            receipt = await begin_idempotent(self.db, organization_id=organization_id, actor_id=actor.id,
                operation="platform.member.event.assign" if assigned else "platform.member.event.remove",
                key=idempotency_key, payload={"member_id": str(member_id), "event_id": str(event_id),
                    "permissions": permissions, "version": if_match, "reason": reason})
            replay = replay_response(receipt)
            if replay is not None:
                await self.db.commit()
                return replay[1]
            self._check_version(member.version, if_match)
            binding = await self.db.scalar(select(UserEventAssignment).where(
                UserEventAssignment.user_id == member.user_id, UserEventAssignment.event_id == event_id
            ).with_for_update().execution_options(populate_existing=True))
            before = {"permissions": binding.permissions, "assignment_id": str(binding.id)} if binding else None
            if assigned:
                if binding is None:
                    reservation = await UsageReservationService.reserve(self.db, organization_id=organization_id,
                        event_id=event_id, limit_key="max_event_team_members", quantity=1, unit="member",
                        idempotency_key=f"platform-event-assignment:{idempotency_key}", metadata={"member_id": str(member_id)})
                    binding = UserEventAssignment(user_id=member.user_id, event_id=event_id, permissions=permissions)
                    self.db.add(binding)
                    await self.db.flush()
                    await UsageReservationService.consume(self.db, reservation.id,
                        source="command_center.event_assignments.create", actor_user_id=actor.id)
                else:
                    binding.permissions = permissions
                binding_id = binding.id
            else:
                if binding is None:
                    raise HTTPException(404, detail={"code": "ASSIGNMENT_NOT_FOUND"})
                binding_id = binding.id
                await self.db.delete(binding)
            member.version += 1
            correlation = uuid.uuid4()
            result = {"assignment_id": str(binding_id), "event_id": str(event_id), "assigned": assigned,
                "permissions": permissions if assigned else {}, "version": member.version,
                "correlation_id": str(correlation)}
            self._audit(organization_id, actor, binding_id,
                "EVENT_MEMBER_ASSIGNED" if assigned else "EVENT_MEMBER_UNASSIGNED", before,
                {**result, "member_id": str(member_id), "reason": reason},
                correlation_id=correlation, resource_type="user_event_assignment")
            result["policy_revision"] = self._revision.revision
            await complete_idempotent(self.db, receipt, response_status=200, response_body=result, resource_id=binding_id)
            await self.db.commit()
            await invalidate_organization(organization_id)
            return result
        except Exception:
            await self.db.rollback()
            raise

    async def _pending_member(self, organization_id, member_id):
        return await self.db.scalar(select(OrganizationMember).where(
            OrganizationMember.id == member_id,
            OrganizationMember.organization_id == organization_id,
            OrganizationMember.accepted_at.is_(None),
            OrganizationMember.invite_email.is_not(None),
            OrganizationMember.is_active.is_(True),
        ).with_for_update().execution_options(populate_existing=True))

    async def _accepted_member(self, organization_id, member_id):
        return await self.db.scalar(select(OrganizationMember).where(
            OrganizationMember.id == member_id,
            OrganizationMember.organization_id == organization_id,
            OrganizationMember.accepted_at.is_not(None),
        ).with_for_update().execution_options(populate_existing=True))

    async def _member_by_id(self, organization_id, member_id):
        return await self.db.scalar(select(OrganizationMember).where(
            OrganizationMember.id == member_id,
            OrganizationMember.organization_id == organization_id,
        ).with_for_update())

    @staticmethod
    def _check_version(current: int, expected: int) -> None:
        if current != expected:
            raise HTTPException(status_code=status.HTTP_412_PRECONDITION_FAILED,
                                detail={"code": "VERSION_CONFLICT", "current_version": current})

    def _audit(self, organization_id, actor, resource_id, action, old_state, new_state, *, correlation_id=None, resource_type="organization_member") -> None:
        self._revision.revision += 1
        self.db.add(AuditLog(
            organization_id=organization_id,
            actor_user_id=actor.id,
            actor_role=actor.role,
            resource_type=resource_type,
            resource_id=resource_id,
            action_type=action,
            old_state=old_state,
            new_state={**new_state, "acting_organization_id": str(actor.organization_id),
                       "target_organization_id": str(organization_id)},
            correlation_id=correlation_id or uuid.uuid4(),
            is_sensitive=True,
        ))
