# =============================================================
# Conference Platform — Models Package
# Import all models here so SQLAlchemy metadata is populated
# before alembic or create_all is called.
# =============================================================

from app.models.organization import Organization
from app.models.user import User
from app.models.user_assignment import UserEventAssignment
from app.models.event import Event
from app.models.room import Room
from app.models.session import Session
from app.models.speaker import Speaker
from app.models.session_speaker import SessionSpeaker
from app.models.presentation_file import PresentationFile
from app.models.file_validation import FileValidation
from app.models.file_integrity_log import FileIntegrityLog
from app.models.notification_event import NotificationEvent
from app.models.email_template import EmailTemplate
from app.models.email_campaign import EmailCampaign
from app.models.email_log import EmailLog
from app.models.import_job import ImportJob
from app.models.srr_station import SRRStation
from app.models.srr_checkin import SRRCheckin
from app.models.venue_activity_log import VenueActivityLog
from app.models.room_device import RoomDevice
from app.models.presentation_queue import PresentationQueue
from app.models.playback_event import PlaybackEvent
from app.models.venue_sync_job import VenueSyncJob
from app.models.audit_log import AuditLog
from app.models.poster import Poster
from app.models.refresh_token import RefreshToken
from app.models.webhook import Webhook
from app.models.presentation_bundle import BundleFile, PresentationBundle
from app.models.security_event import SecurityEvent, SystemErrorLog
from app.models.api_request_log import APIRequestLog, WorkerJobLog
from app.models.venue_telemetry import DeviceHeartbeat, RoomRuntimeEvent, WebsocketEvent
from app.models.venue_infrastructure import VenueNetworkEvent, VenueSecurityEvent, SyncTransferLog
from app.models.rbac import Role, Permission, RolePermission, UserRoleAssignment, UserAccessNode, ScopedPermission, PermissionAuditLog, RoleInheritanceMap
from app.models.participant import Participant
from app.models.check_in import CheckIn
from app.models.print_template import PrintTemplate
from app.models.ticket_type import TicketType
from app.models.registration_form_config import RegistrationFormConfig
from app.models.participant_role import ParticipantRole
from app.models.participant_registration import ParticipantRegistration
from app.models.capacity_rule import CapacityRule
from app.models.badge_models import Printer, Badge, BadgeHistory, BadgePrintJob, BadgeScan
from app.models.attendance_log import AttendanceLog

__all__ = [
    "Organization", "User", "Event", "Room", "Session",
    "Speaker", "SessionSpeaker", "PresentationFile", "FileValidation",
    "FileIntegrityLog", "NotificationEvent",
    "EmailTemplate", "EmailCampaign", "EmailLog", "ImportJob",
    "SRRStation", "SRRCheckin", "VenueActivityLog", "RoomDevice",
    "PresentationQueue", "PlaybackEvent", "VenueSyncJob",
    "AuditLog", "Poster", "RefreshToken", "Webhook",
    "PresentationBundle", "BundleFile", "SecurityEvent", "SystemErrorLog",
    "APIRequestLog", "WorkerJobLog", "DeviceHeartbeat", "RoomRuntimeEvent",
    "WebsocketEvent", "VenueNetworkEvent", "VenueSecurityEvent", "SyncTransferLog",
    "Role", "Permission", "RolePermission", "UserRoleAssignment", "UserAccessNode", "ScopedPermission", "PermissionAuditLog", "RoleInheritanceMap",
    "Participant", "CheckIn", "PrintTemplate", "TicketType", "RegistrationFormConfig",
    "ParticipantRole", "ParticipantRegistration", "CapacityRule",
    "Printer", "Badge", "BadgeHistory", "BadgePrintJob", "BadgeScan", "AttendanceLog"
]


