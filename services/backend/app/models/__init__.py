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
    PlatformFlagDefinition, PlatformFlagOverride,
    GlobalAnnouncement, TenantLimit, TenantUsage
)
from app.modules.platform.departments.models import Department, DepartmentMember
from app.modules.platform.teams.models import Team, TeamMember
from app.modules.platform.roles.models import DepartmentRole, UserAssignment
from app.modules.platform.permissions.models import PlatformPermission, PlatformRolePermission
# Phase 1 — Super Admin Console platform models
from app.modules.platform.models.maintenance_window import MaintenanceWindow
from app.modules.platform.models.platform_integration import PlatformIntegration
from app.modules.platform.models.organization_console import (
    CapabilityRevision,
    EntitlementOverrideRequest,
    EntitlementShadowComparison,
    EventCommercialContract,
    PrivilegedAccessSession,
    UsageLedgerEntry,
    UsageCounterEpoch,
    UsageReconciliationRun,
    CapabilityDiagnosticEvent,
    UsageReservation,
    CapabilityRestriction,
    OrganizationFinancialAdjustment,
    CommercialAccessRequest,
    OrganizationBrandProfile,
    OrganizationComplianceControl,
    OrganizationComplianceEvidence,
    OrganizationInsightSnapshot,
    OrganizationLegalHold,
    OrganizationLifecycleJob,
    OrganizationTeam,
    OrganizationTeamMember,
    OrganizationTeamEvent,
    OrganizationLocation,
    OrganizationNotificationChannelConfig,
    OrganizationNotificationRule,
    OrganizationPrivacyRequest,
    OrganizationRetentionPolicy,
    OrganizationSecurityPolicy,
    OrganizationTrustedDevice,
)

from app.modules.billing.models.subscription import (
    SubscriptionPlan, OrganizationSubscription, PlanFeature,
    OrganizationFeature, Addon, AddonFeature, CommercialTemplateVersion, OrganizationAddon,
    ActivityTimeline, RevenueMetric
)
from app.modules.billing.models.event_activation import EventActivation
from app.modules.billing.models.licensing import (
    ActivationTransferPolicy, BillingOperationRequest, EntitlementGrant,
    EventEntitlementSnapshotItem, EventEntitlementSnapshotSet, EventLimitSnapshotItem,
    GrantConsumption
)
from app.modules.billing.models.billing_domain_tables import (
    Invoice, InvoiceItem, PaymentMethod
)
# Phase 1 — Super Admin Console billing models
from app.modules.billing.models.subscription_analytics import SubscriptionAnalytics
from app.modules.billing.models.org_credits import OrgCredit
from app.modules.billing.models.payment_gateway import PaymentGateway
from app.modules.billing.models.provider_webhook_event import ProviderWebhookEvent
from app.modules.billing.models.financial_audit_trail import FinancialAuditTrail
from app.modules.billing.models.credit_notes import CreditNote

from app.modules.support.models.ticket import SupportTicket, TicketComment
from app.modules.support.models.support_domain_tables import (
    TicketAttachment, Escalation, SlaPolicy, SupportAgent, KnowledgeArticle
)

from app.modules.identity.models.user import User
from app.modules.identity.models.refresh_token import RefreshToken
from app.modules.identity.models.security_event import SecurityEvent
from app.modules.identity.models.portal_otp_token import PortalOtpToken
from app.modules.identity.models.identity_domain_tables import (
    MfaDevice, UserSession, PasswordHistory, LoginAttempt,
    PasswordResetToken, TrustedDevice, UserPreference, SsoIdentity
)

from app.modules.rbac.models.rbac import Role, Permission, RolePermission, UserRoleAssignment, ScopedPermission, RoleInheritanceMap
from app.modules.rbac.models.user_assignment import UserEventAssignment
from app.modules.rbac.models.organization_member import OrganizationMember
UserOrganizationMembership = OrganizationMember

from app.modules.events.models.event import Event
from app.modules.events.models.room import Room
from app.modules.events.models.capacity_rule import CapacityRule
from app.modules.events.models.session import Session
from app.modules.events.models.speaker import Speaker
from app.modules.events.models.session_speaker import SessionSpeaker
from app.modules.events.models.speaker_profile import SpeakerProfile
from app.modules.events.models.events_domain_tables import (
    Track, Agenda, AgendaItem, SessionTemplate, EventSetting, EventAsset
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
from app.modules.registration.models.confirmation_qr import RegistrationConfirmationQR
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
from app.modules.communications.models.channel_delivery import (
    CommunicationDelivery,
    CommunicationDeliveryBatch,
)
from app.modules.communications.models.communications_domain_tables import (
    PushNotification, DeviceToken, SmsMessage, NotificationPreference, NotificationQueue
)

from app.modules.integrations.models.webhook import Webhook
from app.modules.integrations.models.integrations_domain_tables import (
    IntegrationProvider, IntegrationConnection, IntegrationOAuthConnection,
    IntegrationWebhookDelivery, IntegrationExternalResource, IntegrationLog, IntegrationSetting
)

from app.modules.analytics.models.attendance_log import AttendanceLog
from app.modules.analytics.models.usage import OrganizationUsage, UsageEvent, UsageSnapshot
from app.modules.analytics.models.analytics_domain_tables import (
    DashboardMetric, FeatureUsage, ApplicationUsage, ApiUsageMetric, EventMetric, AdoptionMetric
)
UsageMetric = OrganizationUsage

from app.modules.audit.models.audit_log import AuditLog
from app.modules.audit.models.api_request_log import APIRequestLog, WorkerJobLog
from app.modules.audit.models.audit_domain_tables import DataExport, SystemChange, AccessReview, ImpersonationLog, PermissionAuditLog

from app.modules.applications.models.app_registry import AppRegistry, AppVersion, OrganizationApp, MobileConfiguration
from app.modules.applications.models.applications_domain_tables import (
    AppRelease, AppConfiguration, PushNotificationConfig
)

from app.modules.developer.models.developer_registry import ApiKey, OAuthClient, RateLimit
from app.modules.developer.models.developer_domain_tables import (
    DeveloperApiScope, DeveloperApiProduct, DeveloperApiSubscription,
    DeveloperOAuthAuthorization, DeveloperOAuthToken
)

from app.modules.crm.models.core import Account, Contact, Lead
from app.modules.crm.models.crm_domain_tables import (
    PipelineStage, Opportunity, Task, Activity, Note, Contract, Proposal, ProposalVersion,
    ProposalShare, ProposalShareAccess, CustomerHealth, Renewal, CrmOperationRequest
)

from app.modules.workflow.models.workflow import (
    Workflow, WorkflowStep, WorkflowInstance, WorkflowTask, WorkflowAssignment, WorkflowHistory
)
from app.modules.files.models.file import (
    Asset, AssetVersion, AssetTag, AssetPermission, StorageLocation, UploadSession, VirusScan
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

# commercial models
from app.modules.commercial.models import (
    ServiceCategory, Service, ServiceFeature, ServicePackage,
    PackageService, StaffRole, CommercialQuote, CommercialQuoteLineItem,
    CommercialQuoteRevision, QuoteApprovalWorkflow, QuoteApprovalStep
)

# inventory models
from app.modules.inventory.models import (
    HardwareCategory, HardwareItem, HardwareStock, HardwareMovement, HardwareMaintenance
)

# pricing models
from app.modules.pricing.models import (
    PricingRule, PricingRuleCondition, PricingRuleAction, ServicePricing,
    DiscountRule, TaxRule, CurrencyRate, PricingSimulation, CostFormula,
    MarginPolicy, RevenueForecast
)

# procurement models
from app.modules.procurement.models import (
    Vendor, VendorService
)

# V1 pricing template models retain their existing templates schema.
from app.modules.pricing.template_models import RoomTemplate, RegistrationTemplate, SrrTemplate
from app.modules.templates.models import TemplateInstallation

# design_system models
from app.modules.design_system.models import (
    DesignToken, ThemePreset, ComponentLibrary
)

# technology_services models
from app.modules.technology_services.models import (
    ServiceRequest, ServiceRequestItem, Requirement, ServiceLevel, ServiceSlaPolicy,
    ServiceSlaTarget, ServiceSlaBreach, RequirementTemplate,
    RequirementFormTemplate, RequirementFormField, RequirementResponse,
    RequestAssignment,
)

# operations_planning models
from app.modules.operations_planning.models import (
    Project, Milestone, ProjectTask, TaskDependency,
    ProjectTemplate, ProjectTemplateTask, EventTimeline, ProjectVendor, ProjectBlocker
)

# resource_management models
from app.modules.resource_management.models import (
    ResourcePlan, ResourceAllocation, StaffAssignment, EquipmentAssignment, TravelPlan,
    ResourceAvailability, EmployeeCalendar, EquipmentCalendar, TravelBooking, HotelBooking, TransportBooking
)

# deployment_management models
from app.modules.deployment_management.models import (
    Deployment, DeploymentChecklist, DeploymentLog, ReadinessScore, Risk,
    DeploymentRunbook, DeploymentStep, Issue, RiskAction, RiskEscalation, RiskComment, RiskEvidence,
    ProjectCost, ProjectActual, ProjectProfitability
)

from app.modules.operations_control.models import (
    JobControlRequest, VenueSupplierAssignment, VenueSupplierContact,
    VenueReadinessAttestation, VenueOperationalIncident,
    VenueCredentialOperation,
)

# Register after every mapped class is loaded so capability revisions can be
# collected without introducing model-import cycles.
from app.modules.billing.services.capability_cache_service import register_capability_revision_listeners
register_capability_revision_listeners()


