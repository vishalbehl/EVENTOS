"""Identity-constrained discovery; never infer authority from a global role."""
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
import uuid

from fastapi import HTTPException
from sqlalchemy import String, cast, func, literal, select, text

from app.core.tenant_context import TenantContextGuard
from app.modules.platform.models.organization import Organization
from app.modules.audit.models.audit_log import AuditLog
from app.modules.identity.models.refresh_token import RefreshToken
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.rbac.models.access_foundation import (
    ClientDelegation,
    ClientRelationship,
    OperationalWorkspace,
    WorkspaceRoleBinding,
)
from app.modules.rbac.services.access_foundation import accepted_member, lock_revision


@dataclass(frozen=True, slots=True)
class DirectRequestContext:
    actor_id: uuid.UUID
    organization_id: uuid.UUID
    role: str
    actions: frozenset[str]
    policy_revision: int


@asynccontextmanager
async def actor_request_context(db, actor_id, organization_id, *, event_id=None, action=None):
    """Admit legacy services using the authenticated request's live selector.

    A selector is request-local server state, not authority supplied by callers.
    Non-browser callers retain explicit direct admission; they cannot borrow a
    different browser actor or fall back to direct access on selector failure.
    Revision locks remain transaction-owned until commit/rollback.
    """
    from types import SimpleNamespace
    selector = db.info.get("customer_request_selector")
    identity = db.info.get("customer_request_identity")
    if selector is not None or identity is not None:
        if (selector is None or identity != actor_id or
                selector.active_organization_id != organization_id):
            raise HTTPException(404, detail={"code": "CONTEXT_NOT_FOUND"})
        user = SimpleNamespace(id=actor_id, organization_id=selector.organization_id)
        validated_selector = db.info.get("customer_request_selector_validated")
        selector_prevalidated = bool(
            isinstance(validated_selector, tuple)
            and len(validated_selector) == 2
            and validated_selector[0] is selector
            and validated_selector[1] is db.sync_session.get_transaction()
            and db.in_transaction()
        )
        if not selector_prevalidated:
            await validate_request_selector(db, user, selector)
        if selector.access_mode == "DIRECT" and event_id is not None:
            from app.modules.events.models.event import Event
            from app.modules.rbac.services.event_scope import visible_event_predicate
            async with TenantContextGuard.scoped(db, organization_id):
                if await db.scalar(select(Event.id).where(
                    Event.id == event_id, Event.deleted_at.is_(None),
                    visible_event_predicate(actor_id, organization_id),
                )) is None:
                    raise HTTPException(404, detail={"code": "RESOURCE_NOT_FOUND"})
        async with selected_request_context(
            db, user, selector, event_id=event_id, action=action,
            selector_prevalidated=selector_prevalidated,
        ) as context:
            yield context
        return
    async with direct_request_context(
        db, SimpleNamespace(id=actor_id), organization_id, event_id=event_id
    ) as context:
        if event_id is not None:
            from app.modules.events.models.event import Event
            from app.modules.rbac.services.event_scope import visible_event_predicate
            if await db.scalar(select(Event.id).where(
                Event.id == event_id, Event.deleted_at.is_(None),
                visible_event_predicate(actor_id, organization_id),
            )) is None:
                raise HTTPException(404, detail={"code": "RESOURCE_NOT_FOUND"})
        if action is not None and action not in context.actions:
            raise HTTPException(403, detail={"code": "PERMISSION_DENIED"})
        yield context


@asynccontextmanager
async def direct_request_context(db, user, organization_id, *, workspace_id=None, event_id=None, write=False):
    """Verified request scope, not a replacement for the identity's home tenant.

    Discovery grants no write authority. Recheck membership after acquiring the
    revision lock so committed revocations win over previously discovered access.
    """
    await verify_direct_context(db, user, organization_id, workspace_id)
    async with TenantContextGuard.scoped(db, organization_id):
        revision = await lock_revision(db, organization_id, write=write)
        member = await accepted_member(db, user.id, organization_id)
        from app.modules.rbac.services.permission_service import get_user_permissions
        actions = frozenset(await get_user_permissions(
            db, user.id, event_id=event_id,
            organization_id=organization_id, workspace_id=workspace_id,
        ))
        yield DirectRequestContext(user.id, organization_id, member.org_role,
                                   actions, revision.revision)


@asynccontextmanager
async def direct_administration_context(db, user, organization_id, *, write=False):
    """Direct-only legacy administration without discarding selected restrictions.

    Use this for organisation administration, not delegated operations. Browser
    selectors must match the authenticated actor and requested tenant. Background
    callers still require accepted direct membership and bounded action checks.
    """
    selector = db.info.get("customer_request_selector")
    actor_id = db.info.get("customer_request_identity")
    if selector is not None or actor_id is not None:
        if (selector is None or actor_id != user.id or
                selector.active_organization_id != organization_id):
            raise HTTPException(404, detail={"code": "CONTEXT_NOT_FOUND"})
        if selector.access_mode != "DIRECT":
            raise HTTPException(403, detail={"code": "DIRECT_MEMBERSHIP_REQUIRED"})
        await validate_request_selector(db, user, selector)
        async with selected_request_context(db, user, selector, write=write) as context:
            yield context
        return
    async with direct_request_context(db, user, organization_id, write=write) as context:
        yield context


@asynccontextmanager
async def discovery_identity(db, user_id):
    # Only server-authenticated identity is set here, never a caller's selector.
    await db.execute(text("SELECT set_config('app.access_discovery_user_id', :id, true)"), {"id": str(user_id)})
    try:
        yield
    finally:
        if db.is_active:
            await db.execute(text("SELECT set_config('app.access_discovery_user_id', '', true)"))


def direct_query(user_id):
    member, org = OrganizationMember.__table__, Organization.__table__
    return select(org.c.id.label("organization_id"), org.c.name.label("organization_name"),
                  org.c.organization_kind, member.c.org_role.label("role"), member.c.version.label("membership_version")).select_from(
        member.join(org, org.c.id == member.c.organization_id)
    ).where(member.c.user_id == user_id, member.c.is_active.is_(True), member.c.accepted_at.is_not(None),
            org.c.is_active.is_(True), org.c.suspended_at.is_(None), org.c.is_platform_org.is_(False))


def _direct_directory_query(user_id):
    member, org = OrganizationMember.__table__, Organization.__table__
    cursor_key = literal("D|") + cast(org.c.id, String)
    return select(
        cursor_key.label("cursor_key"),
        org.c.id.label("organization_id"),
        org.c.name.label("organization_name"),
        org.c.organization_kind,
        member.c.org_role.label("role"),
        member.c.version.label("membership_version"),
        literal("DIRECT").label("access_mode"),
        org.c.id.label("acting_organization_id"),
        org.c.name.label("acting_organization_name"),
        literal(None).cast(OperationalWorkspace.id.type).label("workspace_id"),
        literal(None).cast(String).label("workspace_name"),
        literal(None).cast(ClientDelegation.event_id.type).label("event_id"),
        literal(None).cast(ClientRelationship.id.type).label("relationship_id"),
    ).select_from(member.join(org, org.c.id == member.c.organization_id)).where(
        member.c.user_id == user_id,
        member.c.is_active.is_(True),
        member.c.accepted_at.is_not(None),
        org.c.is_active.is_(True),
        org.c.suspended_at.is_(None),
        org.c.is_platform_org.is_(False),
    )


def _delegated_directory_query(user_id):
    member = OrganizationMember.__table__
    delegation = ClientDelegation.__table__
    relationship = ClientRelationship.__table__
    workspace = OperationalWorkspace.__table__
    client = Organization.__table__.alias("delegated_client")
    emc = Organization.__table__.alias("delegating_emc")
    event_sort = cast(delegation.c.event_id, String)
    cursor_key = (
        literal("G|") + cast(delegation.c.emc_organization_id, String) + literal("|") +
        cast(delegation.c.client_organization_id, String) + literal("|") +
        cast(delegation.c.workspace_id, String) + literal("|") +
        func.coalesce(event_sort, "00000000-0000-0000-0000-000000000000") + literal("|") +
        cast(delegation.c.relationship_id, String)
    )
    return select(
        cursor_key.label("cursor_key"),
        client.c.id.label("organization_id"),
        client.c.name.label("organization_name"),
        client.c.organization_kind,
        literal("emc_staff").label("role"),
        member.c.version.label("membership_version"),
        literal("DELEGATED").label("access_mode"),
        emc.c.id.label("acting_organization_id"),
        emc.c.name.label("acting_organization_name"),
        workspace.c.id.label("workspace_id"),
        workspace.c.name.label("workspace_name"),
        delegation.c.event_id.label("event_id"),
        relationship.c.id.label("relationship_id"),
    ).select_from(
        member.join(delegation, delegation.c.member_id == member.c.id)
        .join(relationship, relationship.c.id == delegation.c.relationship_id)
        .join(workspace, (workspace.c.id == delegation.c.workspace_id) &
              (workspace.c.organization_id == delegation.c.client_organization_id))
        .join(client, client.c.id == delegation.c.client_organization_id)
        .join(emc, emc.c.id == delegation.c.emc_organization_id)
    ).where(
        member.c.user_id == user_id,
        member.c.organization_id == delegation.c.emc_organization_id,
        member.c.is_active.is_(True),
        member.c.accepted_at.is_not(None),
        relationship.c.status == "ACTIVE",
        relationship.c.approved_at.is_not(None),
        workspace.c.status == "ACTIVE",
        client.c.organization_kind == "CLIENT",
        client.c.is_active.is_(True),
        client.c.suspended_at.is_(None),
        client.c.is_platform_org.is_(False),
        emc.c.organization_kind == "EMC",
        emc.c.is_active.is_(True),
        emc.c.suspended_at.is_(None),
        emc.c.is_platform_org.is_(False),
    )


async def available_contexts(db, user, token=None, after=None, limit=50):
    if token is not None and not hasattr(token, "access_mode") and not hasattr(token, "role"):
        after = token
        token = None
    if not 1 <= limit <= 100:
        raise HTTPException(422, detail={"code": "INVALID_PAGE_SIZE"})
    cursor = None
    if after is not None:
        try:
            parts = str(after).split("|")
            if len(parts) == 1:
                # Existing direct-directory cursors remain compatible.
                cursor = f"D|{uuid.UUID(parts[0])}"
            elif len(parts) == 2 and parts[0] == "D":
                cursor = f"D|{uuid.UUID(parts[1])}"
            elif len(parts) == 6 and parts[0] == "G":
                cursor = "G|" + "|".join(str(uuid.UUID(value)) for value in parts[1:])
            else:
                raise ValueError("Invalid cursor shape")
        except (ValueError, TypeError, AttributeError):
            raise HTTPException(422, detail={"code": "INVALID_CURSOR"})

    async with discovery_identity(db, user.id):
        # UNION deduplicates multiple grants to the same selectable scope. All
        # ownership filters run in PostgreSQL before pagination, not in memory.
        directory = _direct_directory_query(user.id).union(
            _delegated_directory_query(user.id)
        ).subquery("available_access_contexts")
        query = select(directory)
        if cursor is not None:
            query = query.where(directory.c.cursor_key > cursor)
        rows = (await db.execute(query.order_by(directory.c.cursor_key).limit(limit + 1))).mappings().all()

    page = rows[:limit]
    items = []
    for row in page:
        item = dict(row)
        item.pop("cursor_key")
        if token is not None:
            current = (
                getattr(token, "access_mode", None) == item["access_mode"]
                and getattr(token, "active_organization_id", None) == item["organization_id"]
                and (item["access_mode"] == "DIRECT" or (
                    token.acting_organization_id == item["acting_organization_id"]
                    and token.active_workspace_id == item["workspace_id"]
                    and token.active_event_id == item["event_id"]
                    and token.relationship_id == item["relationship_id"]
                ))
            )
        else:
            current = False
        item.update(
            is_current=current,
            activation_available=token is not None and token.session_id is not None,
        )
        items.append(item)

    next_cursor = page[-1]["cursor_key"] if len(rows) > limit and page else None
    return {
        "items": items,
        "next_cursor": next_cursor,
        "delegation_available": True,
    }


async def verify_direct_context(db, user, organization_id, workspace_id=None):
    async with discovery_identity(db, user.id):
        row = (await db.execute(direct_query(user.id).where(Organization.__table__.c.id == organization_id))).mappings().first()
    if row is None:
        raise HTTPException(404, detail={"code": "CONTEXT_NOT_FOUND"})
    if workspace_id is not None:
        async with TenantContextGuard.scoped(db, organization_id):
            member = await db.scalar(select(OrganizationMember).where(OrganizationMember.organization_id == organization_id,
                OrganizationMember.user_id == user.id, OrganizationMember.is_active.is_(True), OrganizationMember.accepted_at.is_not(None)))
            # Scoped predicates are enforced even when runtime RLS is misconfigured.
            query = select(OperationalWorkspace.id).where(OperationalWorkspace.organization_id == organization_id,
                OperationalWorkspace.id == workspace_id, OperationalWorkspace.status == "ACTIVE")
            if member is None:
                raise HTTPException(404, detail={"code": "CONTEXT_NOT_FOUND"})
            if member.org_role not in {"owner", "admin"}:
                query = query.where(select(WorkspaceRoleBinding.id).where(
                    WorkspaceRoleBinding.organization_id == organization_id, WorkspaceRoleBinding.workspace_id == workspace_id,
                    WorkspaceRoleBinding.member_id == member.id, WorkspaceRoleBinding.is_active.is_(True)).exists())
            if await db.scalar(query) is None:
                raise HTTPException(404, detail={"code": "CONTEXT_NOT_FOUND"})
    return row


async def validate_persisted_context(db, user, record) -> None:
    """Revalidate a refresh-family selector before minting a new access token."""
    if record.access_mode == "DIRECT":
        await verify_direct_context(
            db, user, record.active_organization_id, record.active_workspace_id
        )
        return
    if record.access_mode != "DELEGATED":
        raise HTTPException(401, detail={"code": "SESSION_CONTEXT_REVOKED"})
    from app.modules.rbac.services.delegated_access import delegated_request_context
    async with delegated_request_context(
        db,
        user,
        emc_organization_id=record.acting_organization_id,
        client_organization_id=record.active_organization_id,
        relationship_id=record.relationship_id,
        workspace_id=record.active_workspace_id,
        event_id=record.active_event_id,
    ):
        return


async def validate_request_selector(db, user, token) -> None:
    """Cheap live ownership proof without prelocking multi-party commands.

    Action admissions acquire revisions in their own deterministic ordering.
    Identity loading must never lock one party ahead of those commands.
    """
    if token.session_id is not None:
        session_query = select(RefreshToken.id).where(
            RefreshToken.family_id == token.session_id,
            RefreshToken.user_id == user.id,
            RefreshToken.is_revoked.is_(False),
            RefreshToken.expires_at > datetime.now(timezone.utc),
            RefreshToken.access_mode == token.access_mode,
            RefreshToken.active_organization_id == token.active_organization_id,
            RefreshToken.acting_organization_id == token.acting_organization_id,
            RefreshToken.active_workspace_id.is_not_distinct_from(token.active_workspace_id),
            RefreshToken.active_event_id.is_not_distinct_from(token.active_event_id),
            RefreshToken.relationship_id.is_not_distinct_from(token.relationship_id),
        )
        if await db.scalar(session_query.limit(1)) is None:
            raise HTTPException(401, detail={"code": "SESSION_CONTEXT_CHANGED"})
    elif (token.access_mode != "DIRECT" or
          token.active_organization_id != user.organization_id or
          token.active_workspace_id is not None):
        raise HTTPException(401, detail={"code": "SESSION_CONTEXT_REQUIRED"})
    if token.access_mode == "DIRECT":
        await verify_direct_context(
            db, user, token.active_organization_id, token.active_workspace_id
        )
        return
    if token.access_mode != "DELEGATED":
        raise HTTPException(401, detail={"code": "INVALID_SESSION_CONTEXT"})
    query = _delegated_directory_query(user.id).where(
        ClientDelegation.__table__.c.emc_organization_id == token.acting_organization_id,
        ClientDelegation.__table__.c.client_organization_id == token.active_organization_id,
        ClientDelegation.__table__.c.workspace_id == token.active_workspace_id,
        ClientDelegation.__table__.c.relationship_id == token.relationship_id,
        (ClientDelegation.__table__.c.event_id == token.active_event_id
         if token.active_event_id is not None else
         ClientDelegation.__table__.c.event_id.is_(None)),
    )
    async with discovery_identity(db, user.id):
        if (await db.execute(query.limit(1))).first() is None:
            raise HTTPException(404, detail={"code": "CONTEXT_NOT_FOUND"})


@asynccontextmanager
async def selected_request_context(
    db,
    user,
    token,
    *,
    event_id=None,
    action=None,
    write=False,
    selector_prevalidated=False,
    include_archived_event=False,
):
    """Resolve a signed selector against current authoritative access rows."""
    if token.access_mode == "DIRECT":
        if token.active_event_id is not None:
            raise HTTPException(401, detail={"code": "INVALID_SESSION_CONTEXT"})
        if event_id is not None and token.active_workspace_id is not None:
            from app.modules.events.models.event import Event
            async with TenantContextGuard.scoped(db, token.active_organization_id):
                ownership_query = select(Event.id).where(
                    Event.id == event_id,
                    Event.organization_id == token.active_organization_id,
                    Event.operational_workspace_id == token.active_workspace_id,
                )
                if not include_archived_event:
                    ownership_query = ownership_query.where(Event.deleted_at.is_(None))
                owned = await db.scalar(ownership_query)
            if owned is None:
                raise HTTPException(404, detail={"code": "EVENT_NOT_FOUND"})
        async with direct_request_context(
            db, user, token.active_organization_id,
            workspace_id=token.active_workspace_id, event_id=event_id, write=write
        ) as context:
            if token.active_workspace_id is not None:
                await verify_direct_context(
                    db, user, token.active_organization_id, token.active_workspace_id
                )
            if action is not None and action not in context.actions:
                raise HTTPException(403, detail={"code": "PERMISSION_DENIED"})
            yield context
        return
    if token.access_mode != "DELEGATED":
        raise HTTPException(401, detail={"code": "INVALID_SESSION_CONTEXT"})
    if include_archived_event:
        # Detached/deactivated event grants cannot be used to revive a client
        # resource. Restore remains a direct tenant administration operation.
        raise HTTPException(403, detail={"code": "DIRECT_MEMBERSHIP_REQUIRED"})
    if token.active_event_id is not None and event_id != token.active_event_id:
        raise HTTPException(404, detail={"code": "EVENT_NOT_FOUND"})
    from app.modules.rbac.services.delegated_access import delegated_request_context
    async with delegated_request_context(
        db,
        user,
        emc_organization_id=token.acting_organization_id,
        client_organization_id=token.active_organization_id,
        relationship_id=token.relationship_id,
        workspace_id=token.active_workspace_id,
        event_id=event_id or token.active_event_id,
        action=action,
        selector_prevalidated=selector_prevalidated,
    ) as context:
        yield context


async def activate_session_context(db, user, token, payload):
    """Persist a validated selector in the caller's refresh-token family."""
    workspace_id = payload.workspace_id
    if payload.access_mode == "DIRECT":
        if payload.acting_organization_id is not None or payload.relationship_id is not None or payload.event_id is not None:
            raise HTTPException(422, detail={"code": "INVALID_CONTEXT_SELECTION"})
        await verify_direct_context(db, user, payload.organization_id)
        if token.session_id is None:
            correlation_id = uuid.uuid4()
            raise HTTPException(
                status_code=503,
                detail={"code": "CONTEXT_ACTIVATION_UNAVAILABLE", "correlation_id": str(correlation_id)},
                headers={"x-correlation-id": str(correlation_id)},
            )
        await lock_session_family(db, token.session_id)
        if workspace_id is None:
            async with TenantContextGuard.scoped(db, payload.organization_id):
                workspace_id = await db.scalar(select(OperationalWorkspace.id).where(
                    OperationalWorkspace.organization_id == payload.organization_id,
                    OperationalWorkspace.is_default.is_(True),
                    OperationalWorkspace.status == "ACTIVE",
                ))
            if workspace_id is None:
                raise HTTPException(409, detail={"code": "DEFAULT_WORKSPACE_REQUIRED"})
        await verify_direct_context(db, user, payload.organization_id, workspace_id)
        acting_organization_id = payload.organization_id
        relationship_id = None
        event_id = None
        async with direct_request_context(
            db, user, payload.organization_id, workspace_id=workspace_id
        ) as selected:
            role, actions, revisions = selected.role, selected.actions, (selected.policy_revision,)
    else:
        if not all((payload.acting_organization_id, payload.relationship_id, workspace_id)):
            raise HTTPException(422, detail={"code": "INVALID_CONTEXT_SELECTION"})
        if token.session_id is None:
            correlation_id = uuid.uuid4()
            raise HTTPException(
                status_code=503,
                detail={"code": "CONTEXT_ACTIVATION_UNAVAILABLE", "correlation_id": str(correlation_id)},
                headers={"x-correlation-id": str(correlation_id)},
            )
        await lock_session_family(db, token.session_id)
        acting_organization_id = payload.acting_organization_id
        relationship_id = payload.relationship_id
        event_id = payload.event_id
        from app.modules.rbac.services.delegated_access import delegated_request_context
        async with delegated_request_context(
            db,
            user,
            emc_organization_id=acting_organization_id,
            client_organization_id=payload.organization_id,
            relationship_id=relationship_id,
            workspace_id=workspace_id,
            event_id=event_id,
        ) as selected:
            role, actions, revisions = "emc_staff", selected.actions, selected.policy_revisions

    records = (await db.scalars(select(RefreshToken).where(
        RefreshToken.family_id == token.session_id,
        RefreshToken.user_id == user.id,
        RefreshToken.is_revoked.is_(False),
        RefreshToken.expires_at > datetime.now(timezone.utc),
    ).order_by(RefreshToken.created_at.desc()).limit(2).with_for_update())).all()
    if len(records) != 1:
        raise HTTPException(401, detail={"code": "SESSION_NOT_ACTIVE"})
    record = records[0]
    record.access_mode = payload.access_mode
    record.active_organization_id = payload.organization_id
    record.acting_organization_id = acting_organization_id
    record.active_workspace_id = workspace_id
    record.active_event_id = event_id
    record.relationship_id = relationship_id
    await db.flush([record])

    correlation_id = uuid.uuid4()
    audit = AuditLog(
        organization_id=acting_organization_id,
        actor_user_id=user.id,
        actor_role=user.role,
        correlation_id=correlation_id,
        is_sensitive=True,
        resource_type="access_context",
        resource_id=payload.organization_id,
        action_type="ACCESS_CONTEXT_SELECTED",
        new_state={
            "access_mode": payload.access_mode,
            "acting_organization_id": str(acting_organization_id),
            "organization_id": str(payload.organization_id),
            "workspace_id": str(workspace_id),
            "event_id": str(event_id) if event_id else None,
            "relationship_id": str(relationship_id) if relationship_id else None,
        },
    )
    async with TenantContextGuard.scoped(db, acting_organization_id):
        db.add(audit)
        await db.flush([audit])

    from app.modules.identity.services.auth_service import create_access_token
    access_token = create_access_token(
        user,
        session_id=record.family_id,
        access_mode=record.access_mode,
        active_organization_id=record.active_organization_id,
        acting_organization_id=record.acting_organization_id,
        active_workspace_id=record.active_workspace_id,
        active_event_id=record.active_event_id,
        relationship_id=record.relationship_id,
        mfa_authenticated_at=record.mfa_authenticated_at,
    )
    await db.commit()
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "context": {
            "organization_id": payload.organization_id,
            "acting_organization_id": acting_organization_id,
            "workspace_id": workspace_id,
            "event_id": event_id,
            "relationship_id": relationship_id,
            "access_mode": payload.access_mode,
            "role": role,
            "actions": sorted(actions),
            "policy_revisions": list(revisions),
            "correlation_id": correlation_id,
        },
    }


async def lock_session_family(db, family_id):
    """Serialise context selection and refresh before acquiring policy locks.

    Fixed-size PostgreSQL advisory state avoids persisting a second session
    model. A hash collision only serialises unrelated families; it grants no
    authority. Row locks and identity predicates still protect the mutation.
    """
    await db.execute(text(
        "SELECT pg_advisory_xact_lock(hashtextextended(:family, 3440))"
    ), {"family": str(family_id)})
