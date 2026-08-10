# =============================================================
# Conference Platform — Venue Models Package
# Import all models here so SQLAlchemy metadata is populated
# before alembic or create_all is called.
# =============================================================

from app.models.organization import Organization
from app.models.event import Event
from app.models.room import Room
from app.models.session import Session
from app.models.speaker import Speaker
from app.models.session_speaker import SessionSpeaker
from app.models.presentation_file import PresentationFile
from app.models.srr_station import SRRStation
from app.models.srr_checkin import SRRCheckin
from app.models.srr_activity_log import SRRActivityLog
from app.models.room_device import RoomDevice
from app.models.presentation_queue import PresentationQueue
from app.models.playback_event import PlaybackEvent
from app.models.venue_sync_job import VenueSyncJob
from app.models.poster import Poster

# New models for registration, capacity, badges, and attendance
from app.models.print_template import PrintTemplate
from app.models.participant_role import ParticipantRole
from app.models.participant import Participant
from app.models.participant_registration import ParticipantRegistration
from app.models.capacity_rule import CapacityRule
from app.models.badge_models import Printer, Badge, BadgeHistory, BadgePrintJob, BadgeScan
from app.models.sync_outbox import SyncOutbox
from app.models.companion import Companion
from app.models.kit_models import Kit, ParticipantKit
from app.models.participant_extension import ParticipantExtension
from app.models.venue_capacity_rule import VenueCapacityRule
from app.models.venue_node import VenueNodeAssignment, VenueNodeOperation
from app.models.venue_user import VenueUser
from app.models.event_report import EventReportSnapshot, EventReportAudit
from app.models.registration_source_key import RegistrationSourceApiKey

__all__ = [
    "Organization", "Event", "Room", "Session",
    "Speaker", "SessionSpeaker", "PresentationFile",
    "SRRStation", "SRRCheckin", "SRRActivityLog", "RoomDevice",
    "PresentationQueue", "PlaybackEvent", "VenueSyncJob",
    "Poster", "PrintTemplate", "ParticipantRole", "Participant", "ParticipantRegistration",
    "CapacityRule", "Printer", "Badge", "BadgeHistory", "BadgePrintJob",
    "BadgeScan", "SyncOutbox", "VenueNodeAssignment", "VenueNodeOperation",
    "Companion", "Kit", "ParticipantKit", "ParticipantExtension", "VenueCapacityRule",
    "VenueUser", "EventReportSnapshot", "EventReportAudit", "RegistrationSourceApiKey"
]
