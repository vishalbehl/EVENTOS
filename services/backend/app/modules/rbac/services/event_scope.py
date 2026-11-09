"""One SQL visibility predicate for customer event containers, never an action grant."""
from sqlalchemy import and_, false, or_, select
from fastapi import HTTPException

from app.modules.events.models.event import Event
from app.modules.platform.models.organization import Organization
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.rbac.models.access_foundation import OperationalWorkspace, WorkspaceRoleBinding
from app.modules.rbac.models.rbac import Role, UserRoleAssignment, UserAccessNode
from app.modules.rbac.models.user_assignment import UserEventAssignment


def visible_event_predicate(user_id, organization_id):
    """Filter before pagination/aggregation. Query count is independent of rows.

    Recorded event/room/session assignments remain event-scoped visibility proof.
    An operational workspace binding does not itself grant event write actions.
    """
    from app.modules.agenda.models import Room, Session
    accepted = and_(OrganizationMember.organization_id == organization_id,
        OrganizationMember.user_id == user_id, OrganizationMember.is_active.is_(True),
        OrganizationMember.accepted_at.is_not(None))
    membership = select(OrganizationMember.id).join(Organization, Organization.id == OrganizationMember.organization_id).where(
        accepted, Organization.is_active.is_(True), Organization.suspended_at.is_(None), Organization.is_platform_org.is_(False)).exists()
    admin = select(OrganizationMember.id).where(accepted, OrganizationMember.org_role.in_(("owner", "admin"))).exists()
    workspace = select(WorkspaceRoleBinding.id).join(OrganizationMember, OrganizationMember.id == WorkspaceRoleBinding.member_id).join(
        OperationalWorkspace, and_(OperationalWorkspace.id == WorkspaceRoleBinding.workspace_id,
                                  OperationalWorkspace.organization_id == WorkspaceRoleBinding.organization_id)).where(
        accepted, WorkspaceRoleBinding.organization_id == organization_id, WorkspaceRoleBinding.is_active.is_(True),
        WorkspaceRoleBinding.workspace_id == Event.operational_workspace_id, OperationalWorkspace.status == "ACTIVE").correlate(Event).exists()
    role = select(UserRoleAssignment.id).join(Role, Role.id == UserRoleAssignment.role_id).where(
        UserRoleAssignment.user_id == user_id, UserRoleAssignment.revoked_at.is_(None), UserRoleAssignment.event_id == Event.id,
        or_(UserRoleAssignment.organization_id == organization_id, UserRoleAssignment.organization_id.is_(None)),
        Role.deleted_at.is_(None), or_(Role.organization_id == organization_id,
            and_(Role.organization_id.is_(None), Role.is_system_role.is_(True)))).correlate(Event).exists()
    direct = select(UserAccessNode.id).where(UserAccessNode.user_id == user_id,
        UserAccessNode.node_type == "EVENT", UserAccessNode.node_id == Event.id).correlate(Event).exists()
    legacy = select(UserEventAssignment.id).where(UserEventAssignment.user_id == user_id,
        UserEventAssignment.event_id == Event.id).correlate(Event).exists()
    room = select(UserAccessNode.id).join(Room, Room.id == UserAccessNode.node_id).where(
        UserAccessNode.user_id == user_id, UserAccessNode.node_type == "ROOM", Room.event_id == Event.id).correlate(Event).exists()
    session = select(UserAccessNode.id).join(Session, Session.id == UserAccessNode.node_id).where(
        UserAccessNode.user_id == user_id, UserAccessNode.node_type == "SESSION", Session.event_id == Event.id).correlate(Event).exists()
    from app.modules.rbac.services.team_access import team_event_visibility
    team = team_event_visibility(user_id, organization_id, Event.__table__)
    owned_active_workspace = select(OperationalWorkspace.id).where(
        OperationalWorkspace.organization_id == organization_id,
        OperationalWorkspace.id == Event.operational_workspace_id,
        OperationalWorkspace.status == "ACTIVE").correlate(Event).exists()
    return and_(Event.organization_id == organization_id, membership, owned_active_workspace,
                or_(admin, Event.created_by == user_id, workspace, role, direct, legacy, room, session, team))


async def customer_event(db, user, event_id, token=None, *, action=None):
    from types import SimpleNamespace
    token = token or getattr(user, "_request_token_data", None)
    if token is None:
        org_id = getattr(user, "organization_id", None)
        token = SimpleNamespace(
            access_mode="DIRECT",
            active_organization_id=org_id,
            acting_organization_id=org_id,
            active_workspace_id=None,
            active_event_id=None,
            relationship_id=None,
        )
    from app.modules.rbac.services.access_contexts import selected_request_context
    delegated = token.access_mode == "DELEGATED"
    async with selected_request_context(
        db,
        user,
        token,
        event_id=event_id,
        action=(action or "EVENTS:VIEW") if delegated else action,
    ):
        query = select(Event).where(
            Event.id == event_id,
            Event.organization_id == token.active_organization_id,
            Event.deleted_at.is_(None),
        )
        if token.active_workspace_id is not None:
            query = query.where(Event.operational_workspace_id == token.active_workspace_id)
        if not delegated:
            query = query.where(visible_event_predicate(user.id, token.active_organization_id))
        event = await db.scalar(query)
        if event is None:
            raise HTTPException(404, detail={"code": "EVENT_NOT_FOUND"})
        return event


def owned_event_scope(db, event_id_column, organization_id):
    """SQL ownership/visibility projection for legacy event-derived services.

    Applies before LIMIT and resource row locks. This establishes container
    visibility, never a permission to mutate it. Background services preserve
    explicit tenant ownership and active-workspace checks without borrowing a
    browser identity. Query cost is independent of returned row count.
    """
    workspace = OperationalWorkspace.__table__.c
    events = select(Event.id).where(
        Event.organization_id == organization_id,
        Event.deleted_at.is_(None),
        select(workspace.id).where(
            workspace.id == Event.operational_workspace_id,
            workspace.organization_id == organization_id,
            workspace.status == "ACTIVE",
        ).correlate(Event).exists(),
    )
    token = db.info.get("customer_request_selector")
    actor_id = db.info.get("customer_request_identity")
    if token is not None:
        if token.active_organization_id != organization_id or actor_id is None:
            return false()
        if token.active_workspace_id is not None:
            events = events.where(Event.operational_workspace_id == token.active_workspace_id)
        if token.active_event_id is not None:
            events = events.where(Event.id == token.active_event_id)
        if token.access_mode == "DIRECT":
            events = events.where(visible_event_predicate(actor_id, organization_id))
        elif token.access_mode != "DELEGATED":
            return false()
    return event_id_column.in_(events.correlate(None))


def listed_event_predicate(db, user_id, organization_id):
    """Shared selected-context and denial fence for both event list adapters.

    Container visibility never grants a mutation. Correlated denial checks run
    before pagination, counts and summaries; no row-by-row permission queries.
    """
    from app.modules.rbac.services.workspace_events import event_read_denied
    if db.info.get("customer_request_identity") != user_id:
        return false()
    return and_(owned_event_scope(db, Event.id, organization_id),
        ~event_read_denied(user_id, organization_id, Event.operational_workspace_id))
