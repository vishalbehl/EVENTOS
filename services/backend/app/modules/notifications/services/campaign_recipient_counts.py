"""Bounded-page recipient count assembly with duplicate filter reuse."""
import uuid
from fastapi import HTTPException
from sqlalchemy import literal, select, union_all

def recipient_count_statement(campaign):
    from sqlalchemy import func, or_
    from app.modules.notifications.services.campaign_recipient_filters import parse_recipient_ids, validate_recipient_filter
    from app.modules.registration.models.participant import Participant
    from app.modules.events.models.speaker import Speaker
    from app.modules.presentations.models.poster import Poster
    from app.modules.agenda.models import Session, Room, SessionPerson
    from app.modules.speakers.constants.speaker_types import UPLOAD_REQUIRED_CODES

    ids = parse_recipient_ids(campaign.speaker_id_list)
    validate_recipient_filter(target_type=campaign.target_type, recipient_filter=campaign.recipient_filter,
        session_id_filter=campaign.session_id_filter, room_id_filter=campaign.room_id_filter,
        recipient_ids=ids, stored=True)
    model = Participant if campaign.target_type == "participant" else Speaker
    query = select(func.count(func.distinct(model.email))).where(
        model.event_id == campaign.event_id, model.deleted_at.is_(None))
    selected = campaign.recipient_filter
    if ids:
        return query.where(model.id.in_(ids))
    if campaign.target_type == "participant":
        statuses = {"paid": "Paid", "unpaid": "Unpaid", "pending": "Pending"}
        return query.where(Participant.paid_status == statuses[selected]) if selected in statuses else query
    if selected in {"pending", "pending_upload"}:
        assignment = select(SessionPerson.speaker_id).join(Session, Session.id == SessionPerson.session_id).where(
            SessionPerson.speaker_id == Speaker.id, Session.event_id == campaign.event_id,
            Session.deleted_at.is_(None),
            or_(SessionPerson.role.in_(UPLOAD_REQUIRED_CODES), SessionPerson.role.is_(None))).exists()
        return query.where(Speaker.upload_status == "pending", assignment)
    if selected in {"uploaded", "approved", "rejected"}:
        return query.where(Speaker.upload_status == selected)
    if selected == "posters":
        return query.where(select(Poster.id).where(
            Poster.speaker_id == Speaker.id, Poster.event_id == campaign.event_id).exists())
    if selected in {"specific_session", "specific_room"}:
        sessions = select(Session.id).where(Session.event_id == campaign.event_id, Session.deleted_at.is_(None))
        if selected == "specific_session":
            sessions = sessions.where(Session.id == campaign.session_id_filter)
        else:
            owned_room = select(Room.id).where(Room.id == campaign.room_id_filter,
                Room.event_id == campaign.event_id, Room.is_active.is_(True)).exists()
            sessions = sessions.where(Session.room_id == campaign.room_id_filter, owned_room)
        assigned = select(SessionPerson.speaker_id).where(
            SessionPerson.speaker_id == Speaker.id, SessionPerson.session_id.in_(sessions)).exists()
        poster = select(Poster.id).where(Poster.speaker_id == Speaker.id,
            Poster.event_id == campaign.event_id, Poster.session_id.in_(sessions)).exists()
        return query.where(or_(assigned, poster))
    return query


def recipient_selection_statement(campaign):
    from app.modules.registration.models.participant import Participant
    from app.modules.events.models.speaker import Speaker
    # Reuse the exact predicates; no second interpretation in the send worker.
    model = Participant if campaign.target_type == "participant" else Speaker
    return recipient_count_statement(campaign).with_only_columns(model, maintain_column_froms=True)


async def batch_recipient_counts(db, campaigns):
    groups = {}
    for campaign in campaigns:
        if campaign.status != "draft":
            continue
        key = (campaign.event_id, campaign.target_type, campaign.recipient_filter,
               campaign.session_id_filter, campaign.room_id_filter, campaign.speaker_id_list)
        groups.setdefault(key, []).append(campaign)
    if not groups:
        return {}
    if len(groups) > 100:
        raise HTTPException(503, detail={"code": "CAMPAIGN_PAGE_LIMIT_REQUIRED"})
    statements = [select(literal(items[0].id).label("campaign_id"),
        recipient_count_statement(items[0]).scalar_subquery().label("recipient_count"))
        for items in groups.values()]
    rows = (await db.execute(union_all(*statements))).all()
    totals = {row.campaign_id: int(row.recipient_count) for row in rows}
    return {campaign.id: totals[items[0].id] for items in groups.values() for campaign in items}
