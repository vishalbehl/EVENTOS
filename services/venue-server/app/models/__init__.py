# =============================================================
# Conference Platform — Venue Models Package
# Import all models here so SQLAlchemy metadata is populated
# before alembic or create_all is called.
# =============================================================

from app.models.organization import Organization
from app.models.user import User
from app.models.event import Event
from app.models.room import Room
from app.models.session import Session
from app.models.speaker import Speaker
from app.models.session_speaker import SessionSpeaker
from app.models.presentation_file import PresentationFile
from app.models.file_validation import FileValidation
from app.models.email_template import EmailTemplate
from app.models.email_campaign import EmailCampaign
from app.models.email_log import EmailLog
from app.models.import_job import ImportJob
from app.models.srr_station import SRRStation
from app.models.srr_checkin import SRRCheckin
from app.models.srr_activity_log import SRRActivityLog
from app.models.room_device import RoomDevice
from app.models.presentation_queue import PresentationQueue
from app.models.playback_event import PlaybackEvent
from app.models.venue_sync_job import VenueSyncJob
from app.models.audit_log import AuditLog
from app.models.poster import Poster
from app.models.refresh_token import RefreshToken
from app.models.webhook import Webhook

# New models for registration, capacity, badges, and attendance
from app.models.print_template import PrintTemplate
from app.models.participant_role import ParticipantRole
from app.models.participant import Participant
from app.models.participant_registration import ParticipantRegistration
from app.models.capacity_rule import CapacityRule
from app.models.badge_models import Printer, Badge, BadgeHistory, BadgePrintJob, BadgeScan
from app.models.attendance_log import AttendanceLog
from app.models.sync_outbox import SyncOutbox

__all__ = [
    "Organization", "User", "Event", "Room", "Session",
    "Speaker", "SessionSpeaker", "PresentationFile", "FileValidation",
    "EmailTemplate", "EmailCampaign", "EmailLog", "ImportJob",
    "SRRStation", "SRRCheckin", "SRRActivityLog", "RoomDevice",
    "PresentationQueue", "PlaybackEvent", "VenueSyncJob",
    "AuditLog", "Poster", "RefreshToken", "Webhook",
    "PrintTemplate", "ParticipantRole", "Participant", "ParticipantRegistration",
    "CapacityRule", "Printer", "Badge", "BadgeHistory", "BadgePrintJob",
    "BadgeScan", "AttendanceLog", "SyncOutbox"
]
