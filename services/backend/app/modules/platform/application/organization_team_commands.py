"""Transaction-owning organization team commands."""

from __future__ import annotations

from datetime import datetime, timezone
from functools import wraps
import uuid

from fastapi import HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response

from app.core.cache import invalidate_organization
from app.core.concurrency import raise_version_conflict
from app.modules.audit.models.audit_log import AuditLog
from app.modules.events.models.event import Event
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.identity.models.user import User
from app.core.tenant_context import TenantContextGuard
from app.modules.rbac.services.access_foundation import lock_revision, check_version
from app.modules.platform.models.organization_console import (
    OrganizationTeam,
    OrganizationTeamEvent,
    OrganizationTeamMember,
)


_KEEP_OWNER = object()


def ordered_team_mutation(command):
    """Target scope is not actor authority: callers require separate admission.

    Acquire the policy revision before team/member locks for both customer and
    explicitly authorised platform commands. Hold it through commit/rollback.
    """
    @wraps(command)
    async def ordered(self, *, organization_id, **kwargs):
        async with TenantContextGuard.scoped(self.db, organization_id):
            await lock_revision(self.db, organization_id, write=True)
            return await command(self, organization_id=organization_id, **kwargs)
    return ordered


class OrganizationTeamCommandService:
    def __init__(self, db: AsyncSession):
        self.db = db

    def _accepted_subject(self, organization_id, member_id):
        identity = User.__table__.c
        return select(OrganizationMember.id).where(
            OrganizationMember.id == member_id, OrganizationMember.organization_id == organization_id,
            OrganizationMember.is_active.is_(True), OrganizationMember.accepted_at.is_not(None),
            select(identity.id).where(identity.id == OrganizationMember.user_id,
                identity.is_active.is_(True), identity.deleted_at.is_(None)).correlate(OrganizationMember).exists())

    @ordered_team_mutation
    async def create(self, *, organization_id, actor, name: str, description: str | None, owner_member_id=None, reason: str, idempotency_key: str | None = None) -> dict:
        try:
            name, reason = name.strip(), reason.strip()
            if not 2 <= len(name) <= 160 or not 3 <= len(reason) <= 2000 or (description is not None and len(description) > 2000):
                raise HTTPException(422, detail={"code": "INVALID_TEAM_INPUT"})
            if not idempotency_key:
                raise HTTPException(428, detail={"code": "IDEMPOTENCY_KEY_REQUIRED"})
            receipt = await begin_idempotent(self.db, organization_id=organization_id, actor_id=actor.id,
                operation="organization.team.create", key=idempotency_key,
                payload={"actor_id": str(actor.id), "name": name, "description": description, "reason": reason,
                    "owner_member_id": str(owner_member_id) if owner_member_id else None})
            replay = replay_response(receipt)
            if replay is not None:
                await self.db.commit()
                return replay[1]
            duplicate = await self.db.scalar(select(OrganizationTeam.id).where(
                OrganizationTeam.organization_id == organization_id, func.lower(OrganizationTeam.name) == name.lower(),
                OrganizationTeam.deleted_at.is_(None)).limit(1))
            if duplicate is not None:
                raise HTTPException(409, detail={"code": "ORGANIZATION_TEAM_NAME_EXISTS"})
            if owner_member_id and not await self.db.scalar(self._accepted_subject(organization_id, owner_member_id)):
                raise HTTPException(404, detail={"code": "TEAM_OWNER_NOT_FOUND"})
            row = OrganizationTeam(organization_id=organization_id, name=name, description=description,
                owner_member_id=owner_member_id, created_by=actor.id)
            self.db.add(row)
            await self.db.flush()
            result = {"id": str(row.id), "name": row.name, "description": row.description,
                "owner_member_id": str(row.owner_member_id) if row.owner_member_id else None,
                "status": row.status, "version": row.version, "member_ids": [], "events": [],
                "created_at": row.created_at.isoformat(), "updated_at": row.updated_at.isoformat()}
            revision, correlation = await self._audit(organization_id, actor, "ORGANIZATION_TEAM_CREATED",
                row.id, None, {**result, "reason": reason})
            result.update(policy_revision=revision, correlation_id=str(correlation))
            await complete_idempotent(self.db, receipt, response_status=201, response_body=result, resource_id=row.id)
            await self.db.commit()
            await invalidate_organization(organization_id)
            return result
        except IntegrityError:
            await self.db.rollback()
            raise HTTPException(409, detail={"code": "TEAM_MUTATION_CONFLICT"}) from None
        except Exception:
            await self.db.rollback()
            raise

    @ordered_team_mutation
    async def update(self, *, organization_id, team_id, actor, name: str, description: str | None,
                     owner_member_id=_KEEP_OWNER, if_match: int | None, reason: str, idempotency_key: str | None = None) -> dict:
        return await self._change_details(organization_id=organization_id, team_id=team_id, actor=actor,
            name=name, description=description, owner_member_id=owner_member_id, if_match=if_match,
            reason=reason, key=idempotency_key, archive=False, audit_action="ORGANIZATION_TEAM_UPDATED")

    @ordered_team_mutation
    async def archive(self, *, organization_id, team_id, actor, if_match: int | None, reason: str,
                      audit_action: str = "ORGANIZATION_TEAM_ARCHIVED", idempotency_key: str | None = None) -> dict:
        return await self._change_details(organization_id=organization_id, team_id=team_id, actor=actor,
            if_match=if_match, reason=reason, key=idempotency_key, archive=True, audit_action=audit_action)

    async def _change_details(self, *, organization_id, team_id, actor, if_match, reason, key, archive,
                              audit_action, name=None, description=None, owner_member_id=_KEEP_OWNER):
        try:
            if if_match is None:
                raise HTTPException(428, detail={"code": "VERSION_REQUIRED"})
            if not key:
                raise HTTPException(428, detail={"code": "IDEMPOTENCY_KEY_REQUIRED"})
            reason = reason.strip()
            if not 3 <= len(reason) <= 2000:
                raise HTTPException(422, detail={"code": "INVALID_TEAM_REASON"})
            if not archive:
                name = name.strip()
                if not 2 <= len(name) <= 160 or (description is not None and len(description) > 2000):
                    raise HTTPException(422, detail={"code": "INVALID_TEAM_INPUT"})
            row = await self.db.scalar(select(OrganizationTeam).where(OrganizationTeam.id == team_id,
                OrganizationTeam.organization_id == organization_id).with_for_update().execution_options(populate_existing=True))
            if row is None:
                raise HTTPException(404, detail={"code": "ORGANIZATION_TEAM_NOT_FOUND"})
            receipt = await begin_idempotent(self.db, organization_id=organization_id, actor_id=actor.id,
                operation="organization.team.archive" if archive else "organization.team.update", key=key,
                payload={"actor_id": str(actor.id), "team_id": str(team_id), "version": if_match, "reason": reason,
                    "name": name, "description": description, "owner_member_id":
                    "KEEP_CURRENT" if owner_member_id is _KEEP_OWNER else str(owner_member_id) if owner_member_id else None})
            replay = replay_response(receipt)
            if replay is not None:
                await self.db.commit()
                return replay[1]
            check_version(row.version, if_match)
            if row.deleted_at is not None or row.status != "ACTIVE":
                raise HTTPException(409, detail={"code": "TEAM_NOT_ACTIVE"})
            old = {"name": row.name, "description": row.description,
                "owner_member_id": str(row.owner_member_id) if row.owner_member_id else None,
                "status": row.status, "version": row.version}
            if archive:
                row.deleted_at = datetime.now(timezone.utc)
                row.status = "ARCHIVED"
            else:
                duplicate = await self.db.scalar(select(OrganizationTeam.id).where(
                    OrganizationTeam.organization_id == organization_id, OrganizationTeam.id != team_id,
                    OrganizationTeam.deleted_at.is_(None), func.lower(OrganizationTeam.name) == name.lower()).limit(1))
                if duplicate is not None:
                    raise HTTPException(409, detail={"code": "ORGANIZATION_TEAM_NAME_EXISTS"})
                if owner_member_id is not _KEEP_OWNER:
                    if owner_member_id and not await self.db.scalar(self._accepted_subject(organization_id, owner_member_id)):
                        raise HTTPException(404, detail={"code": "TEAM_OWNER_NOT_FOUND"})
                    row.owner_member_id = owner_member_id
                row.name = name
                row.description = description
            row.version += 1
            await self.db.flush()
            result = {"id": str(row.id), "name": row.name, "description": row.description,
                "owner_member_id": str(row.owner_member_id) if row.owner_member_id else None,
                "status": row.status, "version": row.version,
                "deleted_at": row.deleted_at.isoformat() if row.deleted_at else None,
                "updated_at": row.updated_at.isoformat()}
            revision, correlation = await self._audit(organization_id, actor, audit_action, row.id, old,
                {**result, "reason": reason})
            result.update(policy_revision=revision, correlation_id=str(correlation))
            await complete_idempotent(self.db, receipt, response_status=200, response_body=result, resource_id=row.id)
            await self.db.commit()
            await invalidate_organization(organization_id)
            return result
        except IntegrityError:
            await self.db.rollback()
            raise HTTPException(409, detail={"code": "TEAM_MUTATION_CONFLICT"}) from None
        except Exception:
            await self.db.rollback()
            raise

    @ordered_team_mutation
    async def assign_member(self, *, organization_id, team_id, member_id, actor, reason: str,
                            if_match: int | None = None, idempotency_key: str | None = None) -> dict:
        return await self._change_member(organization_id=organization_id, team_id=team_id,
            member_id=member_id, actor=actor, reason=reason, assigned=True,
            if_match=if_match, idempotency_key=idempotency_key,
            audit_action="ORGANIZATION_TEAM_MEMBER_ASSIGNED")

    @ordered_team_mutation
    async def unassign_member(self, *, organization_id, team_id, member_id, actor, reason: str,
                              audit_action: str = "ORGANIZATION_TEAM_MEMBER_UNASSIGNED",
                              if_match: int | None = None, idempotency_key: str | None = None) -> dict:
        return await self._change_member(organization_id=organization_id, team_id=team_id,
            member_id=member_id, actor=actor, reason=reason, assigned=False,
            if_match=if_match, idempotency_key=idempotency_key, audit_action=audit_action)

    async def _change_member(self, *, organization_id, team_id, member_id, actor, reason,
                             assigned, if_match, idempotency_key, audit_action) -> dict:
        try:
            reason = reason.strip()
            if not 3 <= len(reason) <= 2000:
                raise HTTPException(422, detail={"code": "INVALID_TEAM_REASON"})
            if if_match is None:
                raise HTTPException(428, detail={"code": "VERSION_REQUIRED"})
            if not idempotency_key:
                raise HTTPException(428, detail={"code": "IDEMPOTENCY_KEY_REQUIRED"})
            # Policy revision is already locked by both public command adapters.
            # Load archived rows only to permit an immutable successful replay.
            team = await self.db.scalar(select(OrganizationTeam).where(
                OrganizationTeam.id == team_id, OrganizationTeam.organization_id == organization_id,
            ).with_for_update().execution_options(populate_existing=True))
            if team is None:
                raise HTTPException(404, detail={"code": "TEAM_NOT_FOUND"})
            receipt = await begin_idempotent(self.db, organization_id=organization_id, actor_id=actor.id,
                operation="organization.team.member.assign" if assigned else "organization.team.member.remove",
                key=idempotency_key, payload={"actor_id": str(actor.id), "team_id": str(team_id),
                    "member_id": str(member_id), "version": if_match, "assigned": assigned, "reason": reason})
            replay = replay_response(receipt)
            if replay is not None:
                await self.db.commit()
                return replay[1]
            check_version(team.version, if_match)
            if team.deleted_at is not None or team.status != "ACTIVE":
                raise HTTPException(409, detail={"code": "TEAM_INACTIVE"})
            if assigned and not await self.db.scalar(self._accepted_subject(organization_id, member_id)):
                raise HTTPException(404, detail={"code": "TEAM_MEMBER_NOT_FOUND"})
            binding = await self.db.scalar(select(OrganizationTeamMember).where(
                OrganizationTeamMember.organization_id == organization_id,
                OrganizationTeamMember.team_id == team_id,
                OrganizationTeamMember.organization_member_id == member_id,
            ).with_for_update())
            if assigned and binding is not None:
                raise HTTPException(409, detail={"code": "TEAM_MEMBER_ALREADY_ASSIGNED"})
            if not assigned and binding is None:
                raise HTTPException(404, detail={"code": "TEAM_MEMBERSHIP_NOT_FOUND"})
            if not assigned and team.owner_member_id == member_id:
                raise HTTPException(409, detail={"code": "TEAM_OWNER_REASSIGNMENT_REQUIRED"})
            before = {"member_id": str(member_id), "assigned": binding is not None, "team_version": team.version}
            if assigned:
                self.db.add(OrganizationTeamMember(organization_id=organization_id, team_id=team_id,
                    organization_member_id=member_id, created_by=actor.id))
            else:
                await self.db.delete(binding)
            team.version += 1
            await self.db.flush()
            revision, correlation = await self._audit(organization_id, actor, audit_action, team.id,
                before, {"member_id": str(member_id), "assigned": assigned, "team_version": team.version,
                         "reason": reason}, resource_type="organization_team_member")
            result = {"team_id": str(team_id), "member_id": str(member_id), "assigned": assigned,
                "team_version": team.version, "policy_revision": revision, "correlation_id": str(correlation)}
            await complete_idempotent(self.db, receipt, response_status=200, response_body=result, resource_id=team.id)
            await self.db.commit()
            await invalidate_organization(organization_id)
            return result
        except IntegrityError:
            await self.db.rollback()
            raise HTTPException(409, detail={"code": "TEAM_BINDING_CONFLICT"}) from None
        except Exception:
            await self.db.rollback()
            raise

    @ordered_team_mutation
    async def assign_event(self, *, organization_id, team_id, event_id, actor, permissions: dict, reason: str,
                           if_match: int | None = None, idempotency_key: str | None = None,
                           audience: str = "CUSTOMER") -> dict:
        return await self._change_event(organization_id=organization_id, team_id=team_id,
            event_id=event_id, actor=actor, permissions=permissions, reason=reason, assigned=True,
            if_match=if_match, idempotency_key=idempotency_key, audience=audience)

    @ordered_team_mutation
    async def unassign_event(self, *, organization_id, team_id, event_id, actor, reason: str,
                             if_match: int | None = None, idempotency_key: str | None = None,
                             audience: str = "CUSTOMER") -> dict:
        return await self._change_event(organization_id=organization_id, team_id=team_id,
            event_id=event_id, actor=actor, permissions={}, reason=reason, assigned=False,
            if_match=if_match, idempotency_key=idempotency_key, audience=audience)

    async def _change_event(self, *, organization_id, team_id, event_id, actor, permissions, reason,
                            assigned, if_match, idempotency_key, audience) -> dict:
        from app.modules.rbac.schemas.teams import TeamEventBindingWrite
        from app.modules.rbac.services.event_scope import visible_event_predicate
        from app.modules.rbac.services.permission_service import get_user_permissions
        from app.modules.rbac.services.platform_permissions import platform_team_authority
        from pydantic import ValidationError
        try:
            if if_match is None:
                raise HTTPException(428, detail={"code": "VERSION_REQUIRED"})
            if not idempotency_key:
                raise HTTPException(428, detail={"code": "IDEMPOTENCY_KEY_REQUIRED"})
            try:
                validated = TeamEventBindingWrite(reason=reason, permissions=permissions)
            except ValidationError:
                raise HTTPException(422, detail={"code": "INVALID_TEAM_EVENT_BINDING"}) from None
            permissions, reason = validated.permissions, validated.reason
            if audience not in {"CUSTOMER", "PLATFORM"}:
                raise HTTPException(403, detail={"code": "INVALID_ACCESS_AUDIENCE"})
            if audience == "PLATFORM":
                operator = await platform_team_authority(self.db, actor.id, "platform:teams:grant")
            else:
                operator = frozenset(await get_user_permissions(self.db, actor.id, organization_id=organization_id, event_id=event_id))
            team = await self.db.scalar(select(OrganizationTeam).where(
                OrganizationTeam.id == team_id, OrganizationTeam.organization_id == organization_id,
            ).with_for_update().execution_options(populate_existing=True))
            if team is None:
                raise HTTPException(404, detail={"code": "TEAM_NOT_FOUND"})
            receipt = await begin_idempotent(self.db, organization_id=organization_id, actor_id=actor.id,
                operation="organization.team.event.assign" if assigned else "organization.team.event.remove",
                key=idempotency_key, payload={"actor_id": str(actor.id), "team_id": str(team_id),
                    "event_id": str(event_id), "version": if_match, "assigned": assigned,
                    "permissions": permissions, "reason": reason, "audience": audience})
            replay = replay_response(receipt)
            if replay is not None:
                await self.db.commit()
                return replay[1]
            check_version(team.version, if_match)
            if team.deleted_at is not None or team.status != "ACTIVE":
                raise HTTPException(409, detail={"code": "TEAM_INACTIVE"})
            event_query = select(Event.id).where(Event.id == event_id, Event.organization_id == organization_id)
            if assigned:
                from app.modules.platform.models.organization import Organization
                active_organization = await self.db.scalar(select(Organization.id).where(
                    Organization.id == organization_id, Organization.is_active.is_(True),
                    Organization.suspended_at.is_(None), Organization.is_platform_org.is_(False)))
                if active_organization is None:
                    raise HTTPException(409, detail={"code": "ORGANIZATION_UNAVAILABLE"})
                event_query = event_query.where(Event.deleted_at.is_(None))
            if audience == "CUSTOMER":
                event_query = event_query.where(visible_event_predicate(actor.id, organization_id))
            if await self.db.scalar(event_query.with_for_update()) is None:
                raise HTTPException(404, detail={"code": "EVENT_NOT_FOUND"})
            if assigned and not set(permissions) <= operator:
                raise HTTPException(403, detail={"code": "GRANT_EXCEEDS_AUTHORITY"})
            binding = await self.db.scalar(select(OrganizationTeamEvent).where(
                OrganizationTeamEvent.organization_id == organization_id,
                OrganizationTeamEvent.team_id == team_id, OrganizationTeamEvent.event_id == event_id,
            ).with_for_update())
            if not assigned and binding is None:
                raise HTTPException(404, detail={"code": "TEAM_EVENT_BINDING_NOT_FOUND"})
            before = {"event_id": str(event_id), "assigned": binding is not None,
                "permissions": binding.permissions if binding else {}, "team_version": team.version,
                "authorization_version": binding.authorization_version if binding else 0}
            if assigned:
                if binding is None:
                    self.db.add(OrganizationTeamEvent(organization_id=organization_id, team_id=team_id,
                        event_id=event_id, permissions=permissions, authorization_version=1, created_by=actor.id))
                else:
                    binding.permissions = permissions
                    binding.authorization_version = 1
            else:
                await self.db.delete(binding)
            team.version += 1
            await self.db.flush()
            revision, correlation = await self._audit(organization_id, actor,
                "ORGANIZATION_TEAM_EVENT_ASSIGNED" if assigned else "ORGANIZATION_TEAM_EVENT_UNASSIGNED",
                team.id, before, {"event_id": str(event_id), "assigned": assigned,
                    "permissions": permissions, "authorization_version": 1 if assigned else 0,
                    "team_version": team.version, "reason": reason, "audience": audience})
            result = {"team_id": str(team_id), "event_id": str(event_id), "assigned": assigned,
                "permissions": permissions, "authorization_version": 1 if assigned else 0, "team_version": team.version,
                "policy_revision": revision, "correlation_id": str(correlation)}
            await complete_idempotent(self.db, receipt, response_status=200, response_body=result, resource_id=team.id)
            await self.db.commit()
            await invalidate_organization(organization_id)
            return result
        except IntegrityError:
            await self.db.rollback()
            raise HTTPException(409, detail={"code": "TEAM_BINDING_CONFLICT"}) from None
        except Exception:
            await self.db.rollback()
            raise

    async def _active_team(self, organization_id, team_id):
        return await self.db.scalar(
            select(OrganizationTeam).where(
                OrganizationTeam.id == team_id,
                OrganizationTeam.organization_id == organization_id,
                OrganizationTeam.deleted_at.is_(None),
                OrganizationTeam.status == "ACTIVE",
            ).with_for_update()
        )

    async def _audit(self, organization_id, actor, action: str, resource_id, old_state, new_state, resource_type: str = "organization_team") -> tuple[int, uuid.UUID]:
        revision = await lock_revision(self.db, organization_id, write=True)
        revision.revision += 1
        correlation = uuid.uuid4()
        self.db.add(AuditLog(
            organization_id=organization_id,
            actor_user_id=actor.id,
            actor_role=actor.role,
            correlation_id=correlation,
            action_type=action,
            resource_type=resource_type,
            resource_id=resource_id,
            old_state=old_state,
            new_state={**(new_state or {}), "policy_revision": revision.revision,
                "acting_organization_id": str(actor.organization_id) if actor.organization_id else None,
                "target_organization_id": str(organization_id)},
            change_diff={},
            is_sensitive=True,
            occurred_at=datetime.now(timezone.utc),
        ))
        return revision.revision, correlation
