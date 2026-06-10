# =============================================================
# Conference Platform — Schemas Package (Re-exporters)
# Pydantic v2 schemas — re-exports from all schema modules.
# =============================================================

from app.modules.identity.schemas.auth import (
    LoginRequest, TokenResponse, RefreshRequest,
    ChangePasswordRequest, UserMeResponse,
)
from app.modules.rbac.schemas.event import EventCreate, EventUpdate, EventResponse, EventSummary
from app.modules.speakers.schemas.speaker import (
    SpeakerCreate, SpeakerUpdate, SpeakerResponse, SpeakerSummary,
    SpeakerBulkInviteRequest, SpeakerPortalResponse,
    SpeakerApproveFileRequest, SpeakerRejectFileRequest,
)
from app.modules.presentations.schemas.file import (
    UploadRequestBody, PresignedUploadResponse, UploadConfirmRequest,
    PresentationFileResponse, FileValidationResponse,
    FileApproveRequest, FileRejectRequest, FileBatchApproveRequest,
    FileDownloadResponse,
)
from app.modules.speakers.schemas.session import (
    SessionCreate, SessionUpdate, SessionResponse, SessionSummary,
    SessionSpeakerCreate, SessionSpeakerResponse, ReorderSpeakersRequest,
)
from app.modules.venue.schemas.room import RoomCreate, RoomUpdate, RoomResponse
from app.modules.venue.schemas.srr import (
    StationCreate, StationUpdate, StationResponse,
    StationAssignRequest, CheckinResponse,
    QRCheckinRequest, QRCheckinResponse, ActivityLogResponse,
)
from app.modules.analytics.schemas.analytics import (
    DashboardStats, UploadFunnelStats, SessionReadinessRow,
    RoomBreakdownRow, ActivityItem, AnalyticsExportRequest,
)
from app.modules.notifications.schemas.notification import (
    EmailTemplateCreate, EmailTemplateUpdate, EmailTemplateResponse,
    CampaignCreate, CampaignResponse, EmailLogResponse,
    SendCampaignRequest, InviteSpeakersRequest,
)
from app.modules.registration.schemas.import_job import (
    ImportJobResponse, ImportPreviewResponse, ImportConfirmRequest,
    ColumnMappingRequest,
)
from app.schemas.common import MessageResponse, PaginatedResponse
from app.modules.registration.schemas.participant import (
    ParticipantCreate, ParticipantUpdate, ParticipantResponse,
    CheckInCreate, CheckInResponse,
)
from app.modules.registration.schemas.print_template import (
    PrintTemplateCreate, PrintTemplateUpdate, PrintTemplateResponse,
)
from app.modules.registration.schemas.ticket_type import (
    TicketTypeCreate, TicketTypeUpdate, TicketTypeResponse,
)
from app.modules.registration.schemas.registration import (
    ParticipantRegistrationCreate, ParticipantRegistrationUpdate,
    ParticipantRegistrationResponse, RegistrationApprovalRequest,
    RegistrationRejectionRequest,
)
from app.modules.venue.schemas.capacity import (
    CapacityRuleCreate, CapacityRuleUpdate, CapacityRuleResponse,
    CapacityStatusResponse,
)
from app.modules.registration.schemas.badge import (
    PrinterRegister, PrinterResponse, BadgeGenerateRequest,
    BadgeReprintRequest, BadgeResponse, BadgeHistoryResponse,
    BadgePrintJobResponse, BadgeScanResponse,
)
from app.modules.venue.schemas.attendance import (
    CheckInRequest, CheckOutRequest, AttendanceLogResponse,
    AttendanceMetricsResponse,
)

__all__ = [
    "LoginRequest", "TokenResponse", "RefreshRequest",
    "ChangePasswordRequest", "UserMeResponse",
    "EventCreate", "EventUpdate", "EventResponse", "EventSummary",
    "SpeakerCreate", "SpeakerUpdate", "SpeakerResponse", "SpeakerSummary",
    "SpeakerBulkInviteRequest", "SpeakerPortalResponse",
    "SpeakerApproveFileRequest", "SpeakerRejectFileRequest",
    "UploadRequestBody", "PresignedUploadResponse", "UploadConfirmRequest",
    "PresentationFileResponse", "FileValidationResponse",
    "FileApproveRequest", "FileRejectRequest", "FileBatchApproveRequest",
    "FileDownloadResponse",
    "SessionCreate", "SessionUpdate", "SessionResponse", "SessionSummary",
    "SessionSpeakerCreate", "SessionSpeakerResponse", "ReorderSpeakersRequest",
    "RoomCreate", "RoomUpdate", "RoomResponse",
    "StationCreate", "StationUpdate", "StationResponse",
    "StationAssignRequest", "CheckinResponse",
    "QRCheckinRequest", "QRCheckinResponse", "ActivityLogResponse",
    "DashboardStats", "UploadFunnelStats", "SessionReadinessRow",
    "RoomBreakdownRow", "ActivityItem", "AnalyticsExportRequest",
    "EmailTemplateCreate", "EmailTemplateUpdate", "EmailTemplateResponse",
    "CampaignCreate", "CampaignResponse", "EmailLogResponse",
    "SendCampaignRequest", "InviteSpeakersRequest",
    "ImportJobResponse", "ImportPreviewResponse", "ImportConfirmRequest",
    "ColumnMappingRequest",
    "MessageResponse", "PaginatedResponse",
    "ParticipantCreate", "ParticipantUpdate", "ParticipantResponse",
    "CheckInCreate", "CheckInResponse",
    "PrintTemplateCreate", "PrintTemplateUpdate", "PrintTemplateResponse",
    "TicketTypeCreate", "TicketTypeUpdate", "TicketTypeResponse",
    "ParticipantRegistrationCreate", "ParticipantRegistrationUpdate",
    "ParticipantRegistrationResponse", "RegistrationApprovalRequest",
    "RegistrationRejectionRequest",
    "CapacityRuleCreate", "CapacityRuleUpdate", "CapacityRuleResponse",
    "CapacityStatusResponse",
    "PrinterRegister", "PrinterResponse", "BadgeGenerateRequest",
    "BadgeReprintRequest", "BadgeResponse", "BadgeHistoryResponse",
    "BadgePrintJobResponse", "BadgeScanResponse",
    "CheckInRequest", "CheckOutRequest", "AttendanceLogResponse",
    "AttendanceMetricsResponse",
]
