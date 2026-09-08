"""Transaction-owning organization-member commands."""

from __future__ import annotations

import secrets
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.models.audit_log import AuditLog
from app.modules.identity.models.refresh_token import RefreshToken
from app.modules.identity.models.user import User
from app.modules.rbac.models.organization_member import OrganizationMember
from app.core.cache import invalidate_organization
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response


class OrganizationMemberCommandService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def resend_invitation(self, *, organization_id, member_id, actor, if_match: int, idempotency_key: str | None = None) -> OrganizationMember:
        try:
            idem = None
            if idempotency_key:
                idem = await begin_idempotent(
                    self.db, organization_id=organization_id, actor_id=actor.id,
                    operation="organiser.member.invitation.resend", key=idempotency_key,
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
            member.invite_token = secrets.token_urlsafe(32)[:64]
            member.invited_at = datetime.now(timezone.utc)
            member.version = int(member.version or 1) + 1
            self._audit(organization_id, actor, member.id, "ORGANIZATION_INVITATION_RESENT",
                        None, {"invite_email": member.invite_email, "version": member.version})
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

    async def revoke_invitation(self, *, organization_id, member_id, actor, if_match: int, idempotency_key: str | None = None) -> OrganizationMember:
        try:
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
            if member.org_role == "owner" and org_role != "owner":
                owners = int(await self.db.scalar(select(func.count(OrganizationMember.id)).where(
                    OrganizationMember.organization_id == organization_id,
                    OrganizationMember.org_role == "owner",
                    OrganizationMember.is_active.is_(True),
                )) or 0)
                if owners <= 1:
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
            if member.user_id:
                user = await self.db.scalar(select(User).where(User.id == member.user_id).with_for_update())
                if user:
                    user.is_active = is_active
                if not is_active:
                    await self.db.execute(update(RefreshToken).where(
                        RefreshToken.user_id == member.user_id,
                        RefreshToken.is_revoked.is_(False),
                    ).values(is_revoked=True, revoked_at=datetime.now(timezone.utc)))
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
                                 is_active: bool, reason: str) -> list[dict[str, object]]:
        """Apply one validated status mutation and one commit for a bounded member batch."""
        try:
            requested = dict(members)
            if len(requested) != len(members):
                raise HTTPException(status_code=422, detail={"code": "DUPLICATE_MEMBER_IDS"})
            rows = (await self.db.scalars(select(OrganizationMember).where(
                OrganizationMember.organization_id == organization_id,
                OrganizationMember.id.in_(requested),
                OrganizationMember.accepted_at.is_not(None),
            ).with_for_update())).all()
            if len(rows) != len(requested):
                raise HTTPException(status_code=404, detail={"code": "MEMBER_NOT_FOUND"})
            conflicts = [{"id": str(row.id), "current_version": row.version}
                         for row in rows if row.version != requested[row.id]]
            if conflicts:
                raise HTTPException(status_code=409, detail={"code": "VERSION_CONFLICT", "members": conflicts})
            if not is_active and any(row.org_role == "owner" for row in rows):
                raise HTTPException(status_code=422, detail={"code": "OWNER_CANNOT_BE_SUSPENDED"})

            now = datetime.now(timezone.utc)
            user_ids = {row.user_id for row in rows if row.user_id}
            users = {}
            if user_ids:
                users = {user.id: user for user in (await self.db.scalars(
                    select(User).where(User.id.in_(user_ids)).with_for_update()
                )).all()}
            if not is_active and user_ids:
                await self.db.execute(update(RefreshToken).where(
                    RefreshToken.user_id.in_(user_ids),
                    RefreshToken.is_revoked.is_(False),
                ).values(is_revoked=True, revoked_at=now))

            updated = []
            action = "ORGANIZATION_MEMBER_REACTIVATED" if is_active else "ORGANIZATION_MEMBER_SUSPENDED"
            for member in rows:
                old = {"is_active": member.is_active, "version": member.version}
                member.is_active = is_active
                member.suspension_reason = None if is_active else reason
                member.version = int(member.version or 1) + 1
                if member.user_id and member.user_id in users:
                    users[member.user_id].is_active = is_active
                self._audit(organization_id, actor, member.id, action, old, {
                    "is_active": member.is_active, "reason": reason,
                    "version": member.version, "bulk": True,
                })
                updated.append({"id": str(member.id), "is_active": member.is_active, "version": member.version})
            await self.db.commit()
            await invalidate_organization(organization_id)
            return updated
        except Exception:
            await self.db.rollback()
            raise

    async def _pending_member(self, organization_id, member_id):
        return await self.db.scalar(select(OrganizationMember).where(
            OrganizationMember.id == member_id,
            OrganizationMember.organization_id == organization_id,
            OrganizationMember.accepted_at.is_(None),
            OrganizationMember.invite_email.is_not(None),
        ).with_for_update())

    async def _accepted_member(self, organization_id, member_id):
        return await self.db.scalar(select(OrganizationMember).where(
            OrganizationMember.id == member_id,
            OrganizationMember.organization_id == organization_id,
            OrganizationMember.accepted_at.is_not(None),
        ).with_for_update())

    async def _member_by_id(self, organization_id, member_id):
        return await self.db.scalar(select(OrganizationMember).where(
            OrganizationMember.id == member_id,
            OrganizationMember.organization_id == organization_id,
        ).with_for_update())

    @staticmethod
    def _check_version(current: int, expected: int) -> None:
        if current != expected:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                                detail={"code": "VERSION_CONFLICT", "current_version": current})

    def _audit(self, organization_id, actor, resource_id, action, old_state, new_state) -> None:
        self.db.add(AuditLog(
            organization_id=organization_id,
            actor_user_id=actor.id,
            actor_role=actor.role,
            resource_type="organization_member",
            resource_id=resource_id,
            action_type=action,
            old_state=old_state,
            new_state=new_state,
            is_sensitive=True,
        ))
