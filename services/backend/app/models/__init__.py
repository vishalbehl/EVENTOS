# =============================================================
# Conference Platform — Models Package (Re-exporters)
# Import all models here so SQLAlchemy metadata is populated
# before alembic or create_all is called.
# =============================================================

from app.modules.rbac.models.organization import Organization
from app.modules.auth.models.user import User
from app.modules.rbac.models.user_assignment import UserEventAssignment
from app.modules.rbac.models.event import Event
from app.modules.venue.models.room import Room
from app.modules.speakers.models.session import Session
from app.modules.speakers.models.speaker import Speaker
from app.modules.speakers.models.session_speaker import SessionSpeaker
from app.modules.presentations.models.presentation_file import PresentationFile
from app.modules.presentations.models.file_validation import FileValidation
from app.modules.presentations.models.file_integrity_log import FileIntegrityLog
from app.modules.notifications.models.notification_event import NotificationEvent
from app.modules.notifications.models.email_template import EmailTemplate
from app.modules.notifications.models.email_campaign import EmailCampaign
from app.modules.notifications.models.email_log import EmailLog
from app.modules.registration.models.import_job import ImportJob
from app.modules.venue.models.srr_station import SRRStation
from app.modules.venue.models.srr_checkin import SRRCheckin
from app.modules.venue.models.venue_activity_log import VenueActivityLog
from app.modules.venue.models.room_device import RoomDevice
from app.modules.presentations.models.presentation_queue import PresentationQueue
from app.modules.presentations.models.playback_event import PlaybackEvent
from app.modules.venue.models.venue_sync_job import VenueSyncJob
from app.models.audit_log import AuditLog
from app.modules.presentations.models.poster import Poster
from app.modules.auth.models.refresh_token import RefreshToken
from app.modules.notifications.models.webhook import Webhook
from app.modules.presentations.models.presentation_bundle import BundleFile, PresentationBundle
from app.modules.auth.models.security_event import SecurityEvent, SystemErrorLog
from app.modules.auth.models.user_organization_membership import UserOrganizationMembership
from app.models.api_request_log import APIRequestLog, WorkerJobLog
from app.modules.venue.models.venue_telemetry import DeviceHeartbeat, RoomRuntimeEvent, WebsocketEvent
from app.modules.venue.models.venue_infrastructure import VenueNetworkEvent, VenueSecurityEvent, SyncTransferLog
from app.modules.rbac.models.rbac import Role, Permission, RolePermission, UserRoleAssignment, UserAccessNode, ScopedPermission, PermissionAuditLog, RoleInheritanceMap
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.check_in import CheckIn
from app.modules.registration.models.print_template import PrintTemplate
from app.modules.registration.models.ticket_type import TicketType
from app.modules.registration.models.registration_form_config import RegistrationFormConfig
from app.modules.registration.models.participant_role import ParticipantRole
from app.modules.registration.models.participant_registration import ParticipantRegistration
from app.modules.venue.models.capacity_rule import CapacityRule
from app.modules.registration.models.badge_models import Printer, Badge, BadgeHistory, BadgePrintJob, BadgeScan
from app.modules.venue.models.attendance_log import AttendanceLog
from app.modules.registration.models.promo_code import PromoCode
from app.modules.registration.models.payment_transaction import PaymentTransaction
from app.modules.registration.models.portal_otp_token import PortalOtpToken
from app.modules.rbac.models.system_setting import SystemSetting
from app.modules.notifications.models.announcement import Announcement

__all__ = [
    "Organization", "User", "Event", "Room", "Session",
    "Speaker", "SessionSpeaker", "PresentationFile", "FileValidation",
    "FileIntegrityLog", "NotificationEvent",
    "EmailTemplate", "EmailCampaign", "EmailLog", "ImportJob",
    "SRRStation", "SRRCheckin", "VenueActivityLog", "RoomDevice",
    "PresentationQueue", "PlaybackEvent", "VenueSyncJob",
    "AuditLog", "Poster", "RefreshToken", "Webhook",
    "PresentationBundle", "BundleFile", "SecurityEvent", "SystemErrorLog",
    "UserOrganizationMembership",
    "APIRequestLog", "WorkerJobLog", "DeviceHeartbeat", "RoomRuntimeEvent",
    "WebsocketEvent", "VenueNetworkEvent", "VenueSecurityEvent", "SyncTransferLog",
    "Role", "Permission", "RolePermission", "UserRoleAssignment", "UserAccessNode", "ScopedPermission", "PermissionAuditLog", "RoleInheritanceMap",
    "Participant", "CheckIn", "PrintTemplate", "TicketType", "RegistrationFormConfig",
    "ParticipantRole", "ParticipantRegistration", "CapacityRule",
    "Printer", "Badge", "BadgeHistory", "BadgePrintJob", "BadgeScan", "AttendanceLog",
    "PromoCode", "PaymentTransaction", "PortalOtpToken", "SystemSetting", "Announcement"
]
