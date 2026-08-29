from app.modules.agenda.models.agenda import MasterAgenda, Agenda
from app.modules.agenda.models.agenda_day import AgendaDay
from app.modules.agenda.models.room_type import AgendaRoomType
from app.modules.agenda.models.room import AgendaRoom
from app.modules.agenda.models.track_type import AgendaTrackType
from app.modules.agenda.models.track import AgendaTrack
from app.modules.agenda.models.session_type import AgendaSessionType
from app.modules.agenda.models.session import AgendaSession
from app.modules.agenda.models.agenda_role import AgendaRole
from app.modules.agenda.models.session_person import AgendaSessionPerson
from app.modules.agenda.models.presentation_slot import AgendaPresentationSlot
from app.modules.agenda.models.session_template import AgendaSessionTemplate
from app.modules.agenda.models.agenda_template import AgendaTemplate
from app.modules.agenda.models.agenda_conflict import AgendaConflict
from app.modules.agenda.models.agenda_version import AgendaVersion
from app.modules.agenda.models.agenda_setting import AgendaSetting

# Aliases for domain code readability
RoomType = AgendaRoomType
Room = AgendaRoom
TrackType = AgendaTrackType
Track = AgendaTrack
SessionType = AgendaSessionType
Session = AgendaSession
SessionPerson = AgendaSessionPerson
PresentationSlot = AgendaPresentationSlot
SessionTemplate = AgendaSessionTemplate

__all__ = [
    "Agenda",
    "AgendaDay",
    "AgendaRoomType",
    "RoomType",
    "AgendaRoom",
    "Room",
    "AgendaTrackType",
    "TrackType",
    "AgendaTrack",
    "Track",
    "AgendaSessionType",
    "SessionType",
    "AgendaSession",
    "Session",
    "AgendaRole",
    "AgendaSessionPerson",
    "SessionPerson",
    "AgendaPresentationSlot",
    "PresentationSlot",
    "AgendaSessionTemplate",
    "SessionTemplate",
    "AgendaTemplate",
    "AgendaConflict",
    "AgendaVersion",
    "AgendaSetting",
]
