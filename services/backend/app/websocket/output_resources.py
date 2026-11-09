"""Constant-query ownership predicates for bounded realtime payload identifiers."""
import uuid

from sqlalchemy import and_, exists, or_, select

from app.websocket.auth import RealtimeAuthError


def _uuid(value):
    try:
        if not isinstance(value, (str, uuid.UUID)):
            raise ValueError
        return uuid.UUID(str(value))
    except (ValueError, TypeError) as exc:
        raise RealtimeAuthError("Realtime resource is unavailable.") from exc


async def validate_output_resources(db, principal, event_id, payload, kind, *, channel_room_id=None):
    from app.modules.agenda.models.room import AgendaRoom
    from app.modules.agenda.models.session import AgendaSession
    from app.modules.agenda.models.session_person import AgendaSessionPerson
    from app.modules.events.models.speaker import Speaker
    from app.modules.presentations.models.presentation_file import PresentationFile
    from app.modules.venue.models.srr_station import SRRStation
    from app.modules.venue.models.venue_sync_job import VenueSyncJob
    from app.modules.registration.models.import_job import ImportJob
    from app.modules.communications.models.email_campaign import EmailCampaign
    from app.modules.technology_services.models import (
        ServiceRequest, ServiceRequestComment, ServiceRequestAttachment,
    )

    # Projected commands may contain one nested payload. Each level is validated,
    # including consistency when the same identity is supplied at both levels.
    nested = payload.get("payload", {})
    identifiers = {}
    keys = {"event_id", "file_id", "speaker_id", "session_id", "room_id",
            "station_id", "request_id", "comment_id", "attachment_id", "job_id", "campaign_id"}
    for source in (payload, nested):
        for key in keys:
            if key not in source or source[key] is None:
                continue
            value = _uuid(source[key])
            if key in identifiers and identifiers[key] != value:
                raise RealtimeAuthError("Realtime resource is unavailable.")
            identifiers[key] = value
    common = {"event_id"}
    if kind.startswith("file."):
        allowed = common | {"file_id", "speaker_id", "session_id", "room_id"}
    elif kind.startswith("speaker."):
        allowed = common | {"speaker_id", "session_id", "room_id"}
        if kind == "speaker.switch":
            allowed |= {"file_id"}
    elif kind.startswith("srr."):
        allowed = common | {"station_id", "speaker_id", "session_id", "room_id"}
    elif kind.startswith("session."):
        allowed = common | {"session_id", "room_id", "speaker_id"}
    elif kind.startswith("import."):
        allowed = common | {"job_id"}
    elif kind.startswith("venue.sync_"):
        allowed = common | {"job_id", "file_id", "room_id"}
    elif kind.startswith("venue_ops."):
        allowed = common | {"request_id", "comment_id", "attachment_id"}
    elif kind.startswith("campaign."):
        allowed = common | {"campaign_id"}
    else:
        allowed = common | {"file_id", "speaker_id", "session_id", "room_id"}
    if identifiers.keys() - allowed:
        raise RealtimeAuthError("Realtime resource is unavailable.")
    if "event_id" in identifiers and identifiers["event_id"] != event_id:
        raise RealtimeAuthError("Realtime resource is unavailable.")
    if channel_room_id is not None:
        if "room_id" in identifiers and identifiers["room_id"] != channel_room_id:
            raise RealtimeAuthError("Realtime resource is unavailable.")
        identifiers["room_id"] = channel_room_id

    predicates = []
    tables = {
        "file_id": PresentationFile.__table__, "speaker_id": Speaker.__table__,
        "session_id": AgendaSession.__table__, "room_id": AgendaRoom.__table__,
        "station_id": SRRStation.__table__, "request_id": ServiceRequest.__table__,
        "campaign_id": EmailCampaign.__table__,
    }
    for key, table in tables.items():
        if key not in identifiers:
            continue
        conditions = [table.c.id == identifiers[key], table.c.event_id == event_id]
        if "deleted_at" in table.c:
            conditions.append(table.c.deleted_at.is_(None))
        if key == "request_id":
            conditions.append(table.c.organization_id == principal.organization_id)
        if key == "file_id" and "speaker_id" in identifiers:
            conditions.append(table.c.speaker_id == identifiers["speaker_id"])
        if key == "session_id" and "room_id" in identifiers:
            conditions.append(table.c.room_id == identifiers["room_id"])
        if key == "file_id":
            speaker = Speaker.__table__
            conditions.append(exists(select(speaker.c.id).where(
                speaker.c.id == table.c.speaker_id, speaker.c.event_id == event_id,
                speaker.c.deleted_at.is_(None))))
            person, session = AgendaSessionPerson.__table__, AgendaSession.__table__
            assignment_conditions = [person.c.id == table.c.session_speaker_id,
                person.c.speaker_id == table.c.speaker_id, session.c.event_id == event_id,
                session.c.deleted_at.is_(None)]
            if "session_id" in identifiers:
                assignment_conditions.append(session.c.id == identifiers["session_id"])
            assignment = exists(select(person.c.id).select_from(person.join(
                session, person.c.session_id == session.c.id)).where(*assignment_conditions))
            conditions.append(assignment if "session_id" in identifiers else or_(
                table.c.session_speaker_id.is_(None), assignment))
        predicates.append(exists(select(table.c.id).where(*conditions)))

    request = ServiceRequest.__table__
    for key, model in (("comment_id", ServiceRequestComment), ("attachment_id", ServiceRequestAttachment)):
        if key not in identifiers:
            continue
        child = model.__table__
        conditions = [child.c.id == identifiers[key], request.c.event_id == event_id,
                      request.c.organization_id == principal.organization_id]
        if "request_id" in identifiers:
            conditions.append(child.c.request_id == identifiers["request_id"])
        predicates.append(exists(select(child.c.id).select_from(child.join(
            request, request.c.id == child.c.request_id)).where(*conditions)))

    if "job_id" in identifiers:
        model = ImportJob if kind.startswith("import.") else VenueSyncJob if kind.startswith("venue.sync_") else None
        if model is None:
            raise RealtimeAuthError("Realtime resource is unavailable.")
        job = model.__table__
        conditions = [job.c.id == identifiers["job_id"], job.c.event_id == event_id]
        if model is VenueSyncJob and "file_id" in identifiers:
            conditions.append(job.c.file_id == identifiers["file_id"])
        predicates.append(exists(select(job.c.id).where(*conditions)))

    if principal.kind == "device":
        # Room credentials do not turn into event-wide speaker, import, campaign,
        # station or commercial subscriptions through an event channel.
        if principal.room_id is None or kind.startswith(("import.", "venue_ops.", "campaign.", "srr.")):
            raise RealtimeAuthError("Realtime resource is unavailable.")
        if "room_id" in identifiers and identifiers["room_id"] != principal.room_id:
            raise RealtimeAuthError("Realtime resource is unavailable.")
        session, person, file = AgendaSession.__table__, AgendaSessionPerson.__table__, PresentationFile.__table__
        conditions = [session.c.event_id == event_id, session.c.room_id == principal.room_id,
                      session.c.deleted_at.is_(None)]
        source = session
        if "file_id" in identifiers:
            source = file.join(person, file.c.session_speaker_id == person.c.id).join(
                session, person.c.session_id == session.c.id)
            conditions.extend([file.c.id == identifiers["file_id"], file.c.event_id == event_id,
                               file.c.deleted_at.is_(None), person.c.speaker_id == file.c.speaker_id])
        elif "speaker_id" in identifiers:
            source = person.join(session, person.c.session_id == session.c.id)
            conditions.append(person.c.speaker_id == identifiers["speaker_id"])
        if "session_id" in identifiers:
            conditions.append(session.c.id == identifiers["session_id"])
        if not any(key in identifiers for key in {"room_id", "file_id", "speaker_id", "session_id"}):
            raise RealtimeAuthError("Realtime resource is unavailable.")
        if any(key in identifiers for key in {"file_id", "speaker_id", "session_id"}):
            predicates.append(exists(select(session.c.id).select_from(source).where(*conditions)))
        if "job_id" in identifiers:
            job = VenueSyncJob.__table__
            chain = job.join(file, job.c.file_id == file.c.id).join(
                person, file.c.session_speaker_id == person.c.id).join(
                session, person.c.session_id == session.c.id)
            predicates.append(exists(select(job.c.id).select_from(chain).where(
                job.c.id == identifiers["job_id"], job.c.event_id == event_id,
                file.c.event_id == event_id, file.c.deleted_at.is_(None),
                person.c.speaker_id == file.c.speaker_id,
                session.c.event_id == event_id, session.c.room_id == principal.room_id,
                session.c.deleted_at.is_(None))))

    if predicates and not await db.scalar(select(and_(*predicates))):
        raise RealtimeAuthError("Realtime resource is unavailable.")
