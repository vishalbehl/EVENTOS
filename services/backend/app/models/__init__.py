# =============================================================
# Conference Platform — Models Package (Re-exporters)
# Import all models here so SQLAlchemy metadata is populated
# before alembic or create_all is called.
# =============================================================

from app.modules.platform.models.organization import Organization
from app.modules.platform.models.system_setting import SystemSetting
from app.modules.platform.models.feature import FeatureCatalog
from app.modules.platform.models.health import OrganizationHealth
from app.modules.platform.models.platform_domain_tables import (
    OrganizationDomain, OrganizationSetting, FeatureFlag,
    GlobalAnnouncement, TenantLimit, TenantUsage
)

from app.modules.billing.models.subscription import (
    SubscriptionPlan, OrganizationSubscription, PlanFeature,
    OrganizationFeature, Addon, AddonFeature, OrganizationAddon,
    ActivityTimeline, RevenueMetric
)
from app.modules.billing.models.billing_domain_tables import (
    Invoice, InvoiceItem, PaymentMethod, MarketplaceSubscription as BillingMarketplaceSubscription,
    MarketplaceTransaction as BillingMarketplaceTransaction
)

from app.modules.support.models.ticket import SupportTicket, TicketComment
from app.modules.support.models.support_domain_tables import (
    TicketAttachment, Escalation, SlaPolicy, SupportAgent, KnowledgeArticle
)

from app.modules.identity.models.user import User
from app.modules.identity.models.refresh_token import RefreshToken
from app.modules.identity.models.security_event import SecurityEvent, SystemErrorLog
from app.modules.identity.models.portal_otp_token import PortalOtpToken
from app.modules.identity.models.identity_domain_tables import (
    MfaDevice, UserSession, PasswordHistory, LoginAttempt, UserApiKey,
    PasswordResetToken, TrustedDevice, UserPreference, SsoIdentity
)

from app.modules.rbac.models.rbac import Role, Permission, RolePermission, UserRoleAssignment, UserAccessNode, ScopedPermission, RoleInheritanceMap
from app.modules.rbac.models.user_assignment import UserEventAssignment
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.rbac.models.rbac_domain_tables import (
    PermissionGroup, PermissionSet, ApplicationPermission, FeaturePermission
)
UserOrganizationMembership = OrganizationMember

from app.modules.events.models.event import Event
from app.modules.events.models.room import Room
from app.modules.events.models.capacity_rule import CapacityRule
from app.modules.events.models.session import Session
from app.modules.events.models.speaker import Speaker
from app.modules.events.models.session_speaker import SessionSpeaker
from app.modules.events.models.speaker_profile import SpeakerProfile
from app.modules.events.models.events_domain_tables import (
    Track, Agenda, AgendaItem, SessionTemplate, RoomAllocation, EventSetting, EventAsset
)

from app.modules.presentations.models.presentation_file import PresentationFile
from app.modules.presentations.models.file_validation import FileValidation
from app.modules.presentations.models.file_integrity_log import FileIntegrityLog
from app.modules.presentations.models.presentation_bundle import BundleFile, PresentationBundle
from app.modules.presentations.models.poster import Poster
from app.modules.presentations.models.presentations_domain_tables import (
    PresentationFileVersion, PresentationReviewComment, PresentationApproval, PresentationProcessingJob
)

from app.modules.registration.models.participant import Participant
from app.modules.registration.models.participant_role import ParticipantRole
from app.modules.registration.models.participant_registration import ParticipantRegistration
from app.modules.registration.models.ticket_type import TicketType
from app.modules.registration.models.promo_code import PromoCode
from app.modules.registration.models.payment_transaction import PaymentTransaction
from app.modules.registration.models.registration_form_config import RegistrationFormConfig
from app.modules.registration.models.badge_models import Badge, BadgeHistory, BadgePrintJob, BadgeScan
from app.modules.registration.models.print_template import PrintTemplate
from app.modules.registration.models.check_in import CheckIn
from app.modules.registration.models.registration_theme_setting import RegistrationThemeSetting
from app.modules.registration.models.import_job import ImportJob
from app.modules.registration.models.registration_domain_tables import (
    FormField, FormSubmission, Waitlist
)

from app.modules.speakers.models.speaker_theme_setting import SpeakerThemeSetting
from app.modules.speakers.models.speakers_domain_tables import (
    SpeakerInvitation, SpeakerUploadToken, SpeakerTravelRequest,
    SpeakerAccommodationRequest, SpeakerHonorarium, SpeakerCommunicationHistory, SpeakerProfileVersion
)

from app.modules.venue.models.srr_station import SRRStation
from app.modules.venue.models.srr_checkin import SRRCheckin
from app.modules.venue.models.room_device import RoomDevice
from app.modules.venue.models.presentation_queue import PresentationQueue
from app.modules.venue.models.playback_event import PlaybackEvent
from app.modules.venue.models.venue_sync_job import VenueSyncJob
from app.modules.venue.models.venue_activity_log import VenueActivityLog
from app.modules.venue.models.venue_telemetry import DeviceHeartbeat, RoomRuntimeEvent, WebsocketEvent
from app.modules.venue.models.venue_infrastructure import VenueNetworkEvent, VenueSecurityEvent, SyncTransferLog
from app.modules.venue.models.printer import Printer

from app.modules.communications.models.email_template import EmailTemplate
from app.modules.communications.models.email_campaign import EmailCampaign
from app.modules.communications.models.email_log import EmailLog
from app.modules.communications.models.announcement import Announcement
from app.modules.communications.models.notification_event import NotificationEvent
from app.modules.communications.models.communications_domain_tables import (
    PushNotification, DeviceToken, SmsMessage, NotificationPreference, NotificationQueue
)

from app.modules.integrations.models.webhook import Webhook
from app.modules.integrations.models.integrations_domain_tables import (
    IntegrationProvider, IntegrationConnection, IntegrationOAuthConnection,
    IntegrationSyncJob, IntegrationSyncHistory, IntegrationWebhookDelivery,
    IntegrationExternalResource, IntegrationLog, IntegrationSetting, IntegrationMarketplaceApp
)

from app.modules.analytics.models.attendance_log import AttendanceLog
from app.modules.analytics.models.usage import OrganizationUsage, UsageEvent, UsageSnapshot
from app.modules.analytics.models.analytics_domain_tables import (
    DashboardMetric, FeatureUsage, ApplicationUsage, ApiUsageMetric, EventMetric, AdoptionMetric
)
UsageMetric = OrganizationUsage

from app.modules.audit.models.audit_log import AuditLog
from app.modules.audit.models.api_request_log import APIRequestLog, WorkerJobLog
from app.modules.audit.models.audit_domain_tables import SecurityLog, DataExport, SystemChange, AccessReview, ImpersonationLog, PermissionAuditLog

from app.modules.applications.models.app_registry import AppRegistry, AppVersion, OrganizationApp, MobileConfiguration
from app.modules.applications.models.applications_domain_tables import (
    AppFeature, AppPermission, DeviceApp, AppRelease, AppConfiguration, PushNotificationConfig, AppAuditLog
)

from app.modules.developer.models.developer_registry import ApiKey, OAuthClient, RateLimit
from app.modules.developer.models.developer_domain_tables import (
    DeveloperApiScope, DeveloperApiUsage, DeveloperApiProduct, DeveloperApiSubscription,
    DeveloperOAuthAuthorization, DeveloperOAuthToken, DeveloperSdkVersion, DeveloperApiAuditLog
)

from app.modules.crm.models.core import Account, Contact, Lead
from app.modules.crm.models.crm_domain_tables import (
    PipelineStage, Opportunity, Task, Activity, Note, Contract, Proposal, CustomerHealth, Renewal, Interaction
)

from app.modules.marketplace.models.core import MarketplaceApp, MarketplaceReview, MarketplaceInstallation
from app.modules.marketplace.models.marketplace_domain_tables import (
    MarketplaceCategory, MarketplacePermission, MarketplaceAppSubscription,
    MarketplaceAppTransaction, MarketplaceVersionHistory, MarketplacePackage
)

from app.modules.workflow.models.workflow import (
    Workflow, WorkflowStep, WorkflowInstance, WorkflowTask, WorkflowAssignment, WorkflowHistory
)
from app.modules.files.models.file import (
    Asset, AssetVersion, AssetTag, AssetPermission, StorageLocation, UploadSession, VirusScan
)
from app.modules.jobs.models.job import (
    BackgroundJob, JobExecution, JobFailure, JobSchedule, JobLock
)
from app.modules.search.models.search import (
    SearchIndex, SearchDocument, SearchJob
)
from app.modules.sponsors.models.sponsor import (
    Sponsor, SponsorContact, SponsorPackage, SponsorBooth, SponsorDeliverable, SponsorInvoice, SponsorAsset
)

from app.modules.mobile.models.mobile import (
    MobileDevice, MobileSession, MobileDeviceToken, MobileAppVersion, MobileCrashLog, MobilePushQueue, MobileSyncQueue, MobileOfflineChange
)

from app.modules.ai.models.ai import (
    AiAssistant, AiPrompt, AiPromptVersion, AiConversation, AiMessage, AiAction, AiUsage, AiCostTracking, AiFeedback, AiEmbedding
)
