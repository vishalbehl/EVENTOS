"""One event-scoped projection of reviewed team grants and explicit denials."""
from fastapi import HTTPException
from sqlalchemy import and_, case, func, literal, or_, select, true
from sqlalchemy.dialects.postgresql import JSONB
from app.modules.platform.models.organization_console import OrganizationTeam, OrganizationTeamEvent, OrganizationTeamMember
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.rbac.services.permission_catalogue import OPERATIONAL_ACTIONS


def subject_team_bindings(member_id, organization_id):
    team, binding, staff = OrganizationTeam.__table__, OrganizationTeamEvent.__table__, OrganizationTeamMember.__table__
    joins = binding.join(team, and_(team.c.id == binding.c.team_id,
        team.c.organization_id == binding.c.organization_id)).join(staff, and_(
        staff.c.team_id == team.c.id, staff.c.organization_id == team.c.organization_id))
    filters = (binding.c.organization_id == organization_id, staff.c.organization_member_id == member_id,
        team.c.organization_id == organization_id, team.c.status == "ACTIVE", team.c.deleted_at.is_(None),
        binding.c.authorization_version == 1)
    return binding, joins, filters


async def team_event_overrides(db, member_id, organization_id, event_id):
    binding, joins, filters = subject_team_bindings(member_id, organization_id)
    filters = (*filters, binding.c.event_id == event_id)
    valid = func.organizer_access.category_a_team_permissions_valid_v1(binding.c.permissions)
    # Guard jsonb_each independently of planner predicate ordering. Legacy JSON
    # arrays/nulls must not cause an exception or disappear as a false clean grant.
    payload = case((func.jsonb_typeof(binding.c.permissions) == "object", binding.c.permissions),
                   else_=literal({}, type_=JSONB))
    pairs = func.jsonb_each(payload).table_valued("key", "value").lateral()
    projection = select(pairs.c.key, func.bool_and(pairs.c.value == func.to_jsonb(literal(True)))).select_from(
        joins.join(pairs, true())).where(*filters, valid).group_by(pairs.c.key)
    invalid = select(literal("__INVALID_TEAM_POLICY__"), literal(False)).where(
        select(binding.c.id).select_from(joins).where(*filters, ~valid).exists())
    rows = (await db.execute(projection.union_all(invalid))).all()
    if any(code not in OPERATIONAL_ACTIONS or type(allowed) is not bool for code, allowed in rows):
        raise HTTPException(503, detail={"code": "TEAM_ACCESS_RECONCILIATION_REQUIRED"})
    # At most the finite catalogue size; query count does not grow with teams.
    return [(code, allowed) for code, allowed in rows]


def team_event_visibility(user_id, organization_id, event):
    member = OrganizationMember.__table__
    binding, joins, filters = subject_team_bindings(member.c.id, organization_id)
    joins = joins.join(member, and_(member.c.id == OrganizationTeamMember.__table__.c.organization_member_id,
        member.c.organization_id == organization_id))
    # Visibility is only a container predicate. It never grants an action and
    # team ownership/administration does not substitute for explicit membership.
    permitted = or_(*(binding.c.permissions.contains({code: True}) for code in sorted(OPERATIONAL_ACTIONS)))
    return select(binding.c.id).select_from(joins).where(*filters,
        member.c.user_id == user_id, member.c.accepted_at.is_not(None), member.c.is_active.is_(True),
        binding.c.event_id == event.c.id,
        func.organizer_access.category_a_team_permissions_valid_v1(binding.c.permissions), permitted,
    ).correlate(event).exists()
