"""Consent-ordered EMC/client commands using the existing revisions and receipts."""
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select, or_

from app.core.tenant_context import TenantContextGuard
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response
from app.modules.audit.models.audit_log import AuditLog
from app.modules.platform.models.organization import Organization
from app.modules.identity.models.user import User
from app.modules.events.models.event import Event
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.rbac.models.access_foundation import ClientRelationship, ClientDelegation, OperationalWorkspace
from app.modules.rbac.schemas.client_relationships import DELEGATABLE_ACTIONS
from app.modules.rbac.services.access_contexts import verify_direct_context
from app.modules.rbac.services.access_foundation import accepted_member, check_version, lock_revision
from app.modules.rbac.services.permission_service import get_user_permissions
from app.modules.billing.models.cloud_commercial import CommercialAccount, CommercialAccountWorkspace


def missing():
    raise HTTPException(404, detail={"code": "RELATIONSHIP_NOT_FOUND"})


async def administrator(db, user, organization_id):
    member = await accepted_member(db, user.id, organization_id)
    if member.org_role not in {"owner", "admin"}:
        raise HTTPException(403, detail={"code": "PERMISSION_DENIED"})
    if "relationships:manage" not in await get_user_permissions(db, user.id, organization_id=organization_id):
        raise HTTPException(403, detail={"code": "PERMISSION_DENIED"})
    organization = await db.scalar(select(Organization).where(Organization.id == organization_id))
    if organization.is_platform_org or organization.organization_kind not in {"EMC", "CLIENT"}:
        raise HTTPException(403, detail={"code": "RELATIONSHIP_AUDIENCE_DENIED"})
    return member, organization


@asynccontextmanager
async def party_locks(db, organization_ids, *, write):
    """Fixed order: all party revisions, then receipt, then relationship rows.

    Caller must authenticate the acting party first. Other party IDs come only
    from a participant-scoped relationship or the explicit consent request.
    No external network work is performed while these locks are held.
    """
    revisions = {}
    for organization_id in sorted(set(organization_ids), key=str):
        async with TenantContextGuard.scoped(db, organization_id):
            revisions[organization_id] = await lock_revision(db, organization_id, write=write)
    yield revisions


def actions_for(row, organization_id, role):
    client = row.client_organization_id == organization_id
    if client and role != "owner":
        return []
    if row.status == "REQUESTED":
        return ["accept", "reject", "transfer"] if client else ["detach"]
    if row.status == "ACTIVE":
        return ["suspend", "detach"]
    if row.status == "SUSPENDED":
        # Resumption always requires fresh client-owner approval.
        return ["resume", "detach"] if client else ["detach"]
    return []


def projection(row, organization_id, role):
    emc = row.emc_organization_id == organization_id
    if not isinstance(row.scopes, list) or len(row.scopes) > 100 or any(
        not isinstance(scope, dict) or not all(key in scope for key in ("member_id", "workspace_id", "actions")) or
        not isinstance(scope["actions"], list) or not 1 <= len(scope["actions"]) <= 32 or
        any(not isinstance(code, str) or code not in DELEGATABLE_ACTIONS for code in scope["actions"])
        for scope in row.scopes):
        raise HTTPException(503, detail={"code": "ACCESS_RECONCILIATION_REQUIRED"})
    scopes = [{"workspace_id": scope["workspace_id"], "event_id": scope.get("event_id"),
               "actions": scope["actions"], **({"member_id": scope["member_id"]} if emc else {})}
              for scope in row.scopes]
    return {"id": str(row.id), "emc_organization_id": str(row.emc_organization_id),
        "client_organization_id": str(row.client_organization_id), "status": row.status, "version": row.version,
        "policy_revision": row.policy_revision, "created_at": row.created_at.isoformat(),
        "approved_at": row.approved_at.isoformat() if row.approved_at else None,
        "scopes": scopes, "available_actions": actions_for(row, organization_id, role)}


async def relationship_page(db, user, organization_id, after=None, limit=50):
    if not 1 <= limit <= 100:
        raise HTTPException(422, detail={"code": "INVALID_PAGE_SIZE"})
    await verify_direct_context(db, user, organization_id)
    async with TenantContextGuard.scoped(db, organization_id):
        await lock_revision(db, organization_id, write=False)
        member, organization = await administrator(db, user, organization_id)
        # Two separate indexed inbox/portfolio shapes, not an unrestricted tenant scan.
        column = ClientRelationship.emc_organization_id if organization.organization_kind == "EMC" else ClientRelationship.client_organization_id
        query = select(ClientRelationship).where(column == organization_id)
        if after is not None:
            query = query.where(ClientRelationship.id > after)
        rows = (await db.scalars(query.order_by(ClientRelationship.id).limit(limit + 1))).all()
        permissions = await get_user_permissions(db, user.id, organization_id=organization_id)
        return {"items": [projection(row, organization_id, member.org_role) for row in rows[:limit]],
            "next_cursor": str(rows[limit - 1].id) if len(rows) > limit else None,
            "organization_kind": organization.organization_kind, "role": member.org_role,
            "grantable_actions": sorted(set(permissions) & DELEGATABLE_ACTIONS)}


async def validate_scopes(db, emc_id, client_id, scopes, *, requester_id):
    """Bounded batched validation; query count does not grow with scope count."""
    if not isinstance(scopes, list) or not 1 <= len(scopes) <= 100:
        raise HTTPException(503, detail={"code": "ACCESS_RECONCILIATION_REQUIRED"})
    from pydantic import ValidationError
    from app.modules.rbac.schemas.client_relationships import ScopeRequest
    try:
        # Persisted legacy JSON is not trusted merely because it is in the DB.
        scopes = [ScopeRequest.model_validate(scope).model_dump(mode="json") for scope in scopes]
        member_ids = {uuid.UUID(scope["member_id"]) for scope in scopes}
        workspace_ids = {uuid.UUID(scope["workspace_id"]) for scope in scopes}
        event_ids = {uuid.UUID(scope["event_id"]) for scope in scopes if scope.get("event_id")}
        requested_actions = {action for scope in scopes for action in scope["actions"]}
    except (ValidationError, ValueError, TypeError, KeyError, AttributeError):
        raise HTTPException(503, detail={"code": "ACCESS_RECONCILIATION_REQUIRED"}) from None
    async with TenantContextGuard.scoped(db, emc_id):
        org = await db.scalar(select(Organization).where(Organization.id == emc_id, Organization.organization_kind == "EMC",
            Organization.is_active.is_(True), Organization.suspended_at.is_(None), Organization.is_platform_org.is_(False)))
        if org is None:
            missing()
        m, u = OrganizationMember.__table__, User.__table__
        members = set((await db.scalars(select(m.c.id).select_from(m.join(u, u.c.id == m.c.user_id)).where(
            m.c.organization_id == emc_id, m.c.id.in_(member_ids),
            m.c.is_active.is_(True), m.c.accepted_at.is_not(None),
            u.c.is_active.is_(True), u.c.deleted_at.is_(None)))).all())
        if members != member_ids:
            raise HTTPException(404, detail={"code": "SCOPE_NOT_FOUND"})
        requester = await accepted_member(db, requester_id, emc_id)
        if requester.org_role not in {"owner", "admin"}:
            raise HTTPException(403, detail={"code": "DELEGATOR_AUTHORITY_REVOKED"})
        grantable = set(await get_user_permissions(db, requester_id, organization_id=emc_id)) & DELEGATABLE_ACTIONS
        if not requested_actions <= grantable:
            raise HTTPException(403, detail={"code": "DELEGATION_EXCEEDS_AUTHORITY"})
    async with TenantContextGuard.scoped(db, client_id):
        org = await db.scalar(select(Organization.id).where(Organization.id == client_id, Organization.organization_kind == "CLIENT",
            Organization.is_active.is_(True), Organization.suspended_at.is_(None), Organization.is_platform_org.is_(False)))
        if org is None:
            missing()
        workspaces = set((await db.scalars(select(OperationalWorkspace.id).where(
            OperationalWorkspace.organization_id == client_id, OperationalWorkspace.id.in_(workspace_ids),
            OperationalWorkspace.status == "ACTIVE"))).all())
        events = dict((await db.execute(select(Event.id, Event.operational_workspace_id).where(
            Event.organization_id == client_id, Event.id.in_(event_ids), Event.deleted_at.is_(None)))).all()) if event_ids else {}
        if workspaces != workspace_ids or set(events) != event_ids or any(
            scope.get("event_id") and events[uuid.UUID(scope["event_id"])] != uuid.UUID(scope["workspace_id"]) for scope in scopes):
            raise HTTPException(404, detail={"code": "SCOPE_NOT_FOUND"})


async def commercial_clear(db, client_id, emc_id):
    async with TenantContextGuard.scoped(db, client_id):
        conflict = await db.scalar(select(CommercialAccountWorkspace.id).join(CommercialAccount,
            CommercialAccount.id == CommercialAccountWorkspace.commercial_account_id).where(
            CommercialAccountWorkspace.organization_id == client_id, CommercialAccountWorkspace.status == "ACTIVE",
            CommercialAccount.owner_organization_id.not_in((client_id, emc_id))).limit(1))
        if conflict is not None:
            raise HTTPException(409, detail={"code": "COMMERCIAL_SPONSORSHIP_CONFLICT"})


def history(db, user, acting_id, row, previous, reason, correlation_id):
    db.add(AuditLog(organization_id=acting_id, actor_user_id=user.id, actor_role=user.role,
        correlation_id=correlation_id, is_sensitive=True, resource_type="client_relationship", resource_id=row.id,
        action_type="CLIENT_RELATIONSHIP_CHANGED", old_state={"status": previous},
        new_state={"acting_organization_id": str(acting_id), "target_organization_id": str(row.client_organization_id),
            "emc_organization_id": str(row.emc_organization_id), "status": row.status,
            "version": row.version, "policy_revision": row.policy_revision, "reason": reason}))


async def request_relationship(db, user, acting_id, payload, key):
    await verify_direct_context(db, user, acting_id)
    async with TenantContextGuard.scoped(db, acting_id):
        _, org = await administrator(db, user, acting_id)
        if org.organization_kind != "EMC" or payload.client_organization_id == acting_id:
            raise HTTPException(403, detail={"code": "EMC_REQUIRED"})
    # Allowlisted existence projection only, after authenticating an EMC admin.
    client = await db.scalar(select(Organization.id).where(Organization.id == payload.client_organization_id,
        Organization.organization_kind == "CLIENT", Organization.is_platform_org.is_(False),
        Organization.is_active.is_(True), Organization.suspended_at.is_(None)))
    if client is None:
        missing()
    scopes = [scope.model_dump(mode="json") for scope in payload.scopes]
    async with party_locks(db, (acting_id, client), write=True) as revisions:
        async with TenantContextGuard.scoped(db, acting_id):
            member, _ = await administrator(db, user, acting_id)
            await validate_scopes(db, acting_id, client, scopes, requester_id=user.id)
            reservation = await begin_idempotent(db, organization_id=acting_id, actor_id=user.id,
                operation="relationship.request", key=key,
                payload={**payload.model_dump(mode="json"), "actor_id": str(user.id)})
            replay = replay_response(reservation)
            if replay is not None:
                await db.commit()
                return replay[1]
            pending = await db.scalar(select(ClientRelationship.id).where(ClientRelationship.emc_organization_id == acting_id,
                ClientRelationship.client_organization_id == client, ClientRelationship.status == "REQUESTED").limit(1))
            if pending is not None:
                raise HTTPException(409, detail={"code": "RELATIONSHIP_REQUEST_PENDING"})
            row = ClientRelationship(emc_organization_id=acting_id, client_organization_id=client,
                requested_by=user.id, scopes=scopes, status="REQUESTED")
            db.add(row); await db.flush()
            revisions[acting_id].revision += 1
            revisions[client].revision += 1
            # Flush every revision in its owning tenant's RLS context.
            await flush_revisions(db, revisions)
            history(db, user, acting_id, row, None, payload.reason, uuid.uuid4())
            result = projection(row, acting_id, member.org_role)
            await complete_idempotent(db, reservation, response_status=200, response_body=result, resource_id=row.id)
            await db.commit()
            return result


async def flush_revisions(db, revisions):
    for organization_id, revision in revisions.items():
        async with TenantContextGuard.scoped(db, organization_id):
            await db.flush([revision])


async def activate(db, row, user):
    row.status = "ACTIVE"
    row.approved_by = user.id
    row.approved_at = datetime.now(timezone.utc)
    for scope in row.scopes:
        db.add(ClientDelegation(relationship_id=row.id, client_organization_id=row.client_organization_id,
            emc_organization_id=row.emc_organization_id, member_id=uuid.UUID(scope["member_id"]),
            workspace_id=uuid.UUID(scope["workspace_id"]), event_id=uuid.UUID(scope["event_id"]) if scope.get("event_id") else None,
            actions=scope["actions"]))


async def transition_relationship(db, user, acting_id, relationship_id, payload, expected, key):
    await verify_direct_context(db, user, acting_id)
    async with TenantContextGuard.scoped(db, acting_id):
        await administrator(db, user, acting_id)
        row = await db.scalar(select(ClientRelationship).where(ClientRelationship.id == relationship_id,
            or_(ClientRelationship.emc_organization_id == acting_id, ClientRelationship.client_organization_id == acting_id)))
        if row is None:
            missing()
        parties = {row.emc_organization_id, row.client_organization_id}
        previous_emc = None
        if payload.action == "transfer":
            previous = await db.scalar(select(ClientRelationship).where(ClientRelationship.id == payload.previous_relationship_id,
                ClientRelationship.client_organization_id == row.client_organization_id))
            if previous is None:
                missing()
            previous_emc = previous.emc_organization_id
            parties.add(previous_emc)
    async with party_locks(db, parties, write=True) as revisions:
        async with TenantContextGuard.scoped(db, acting_id):
            member, _ = await administrator(db, user, acting_id)
            row = await db.scalar(select(ClientRelationship).where(ClientRelationship.id == relationship_id,
                or_(ClientRelationship.emc_organization_id == acting_id, ClientRelationship.client_organization_id == acting_id))
                .with_for_update().execution_options(populate_existing=True))
            if row is None:
                missing()
            client_actor = acting_id == row.client_organization_id
            if client_actor and member.org_role != "owner":
                raise HTTPException(403, detail={"code": "CLIENT_OWNER_REQUIRED"})
            if payload.action in {"accept", "reject", "resume", "transfer"} and not client_actor:
                raise HTTPException(403, detail={"code": "CLIENT_OWNER_REQUIRED"})
            reservation = await begin_idempotent(db, organization_id=acting_id, actor_id=user.id,
                operation="relationship.transition", key=key, payload={**payload.model_dump(mode="json"),
                    "relationship_id": str(relationship_id), "version": expected, "actor_id": str(user.id)})
            replay = replay_response(reservation)
            if replay is not None:
                await db.commit()
                return replay[1]
            check_version(row.version, expected)
            if payload.action not in actions_for(row, acting_id, member.org_role):
                raise HTTPException(409, detail={"code": "RELATIONSHIP_TRANSITION_INVALID"})
            before = row.status
            correlation = uuid.uuid4()
            if payload.action in {"accept", "resume", "transfer"}:
                await validate_scopes(db, row.emc_organization_id, row.client_organization_id, row.scopes, requester_id=row.requested_by)
                await commercial_clear(db, row.client_organization_id, row.emc_organization_id)
                if payload.action == "transfer":
                    previous = await db.scalar(select(ClientRelationship).where(ClientRelationship.id == payload.previous_relationship_id,
                        ClientRelationship.client_organization_id == row.client_organization_id).with_for_update().execution_options(populate_existing=True))
                    if previous is None or previous.emc_organization_id != previous_emc:
                        missing()
                    check_version(previous.version, payload.previous_version)
                    if previous.status not in {"ACTIVE", "SUSPENDED"} or previous.id == row.id or previous.emc_organization_id == row.emc_organization_id:
                        raise HTTPException(409, detail={"code": "TRANSFER_SOURCE_INVALID"})
                    old = previous.status
                    previous.status = "DETACHED"; previous.version += 1; previous.policy_revision += 1
                    history(db, user, acting_id, previous, old, payload.reason, correlation)
                    await db.flush()  # Release unique managing slot before activating the replacement.
                occupied = await db.scalar(select(ClientRelationship.id).where(
                    ClientRelationship.client_organization_id == row.client_organization_id,
                    ClientRelationship.status.in_(("ACTIVE", "SUSPENDED")), ClientRelationship.id != row.id).limit(1))
                if occupied is not None:
                    raise HTTPException(409, detail={"code": "CLIENT_ALREADY_MANAGED"})
                if payload.action == "resume":
                    # Existing approved scopes remain immutable; no duplicate grant creation.
                    if row.approved_at is None:
                        raise HTTPException(409, detail={"code": "CONSENT_RECONCILIATION_REQUIRED"})
                    row.status = "ACTIVE"
                    row.approved_by = user.id
                    row.approved_at = datetime.now(timezone.utc)
                else:
                    await activate(db, row, user)
            else:
                row.status = {"reject": "REJECTED", "suspend": "SUSPENDED", "detach": "DETACHED"}[payload.action]
            row.version += 1; row.policy_revision += 1
            row.updated_at = datetime.now(timezone.utc)
            await db.flush()
            for revision in revisions.values():
                revision.revision += 1
            await flush_revisions(db, revisions)
            history(db, user, acting_id, row, before, payload.reason, correlation)
            result = projection(row, acting_id, member.org_role)
            await complete_idempotent(db, reservation, response_status=200, response_body=result, resource_id=row.id)
            await db.commit()
            return result
