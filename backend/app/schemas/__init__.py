"""Pydantic v2 schemas — re-exports from all schema modules."""

from app.schemas.auth import (
    LoginRequest, TokenResponse, RefreshRequest,
    ChangePasswordRequest, UserMeResponse,
)
from app.schemas.event import EventCreate, EventUpdate, EventResponse, EventSummary
from app.schemas.speaker import (
    SpeakerCreate, SpeakerUpdate, SpeakerResponse, SpeakerSummary,
    SpeakerBulkInviteRequest, SpeakerPortalResponse,
    SpeakerApproveFileRequest, SpeakerRejectFileRequest,
)
from app.schemas.file import (
    UploadRequestBody, PresignedUploadResponse, UploadConfirmRequest,
    PresentationFileResponse, FileValidationResponse,
    FileApproveRequest, FileRejectRequest, FileBatchApproveRequest,
    FileDownloadResponse,
)
from app.schemas.session import (
    SessionCreate, SessionUpdate, SessionResponse, SessionSummary,
    SessionSpeakerCreate, SessionSpeakerResponse, ReorderSpeakersRequest,
)
from app.schemas.room import RoomCreate, RoomUpdate, RoomResponse
from app.schemas.srr import (
    StationCreate, StationUpdate, StationResponse,
    StationAssignRequest, CheckinResponse,
    QRCheckinRequest, QRCheckinResponse, ActivityLogResponse,
)
from app.schemas.analytics import (
    DashboardStats, UploadFunnelStats, SessionReadinessRow,
    RoomBreakdownRow, ActivityItem, AnalyticsExportRequest,
)
from app.schemas.notification import (
    EmailTemplateCreate, EmailTemplateUpdate, EmailTemplateResponse,
    CampaignCreate, CampaignResponse, EmailLogResponse,
    SendCampaignRequest, InviteSpeakersRequest,
)
from app.schemas.import_job import (
    ImportJobResponse, ImportPreviewResponse, ImportConfirmRequest,
    ColumnMappingRequest,
)
from app.schemas.common import MessageResponse, PaginatedResponse
from app.schemas.participant import (
    ParticipantCreate, ParticipantUpdate, ParticipantResponse,
    CheckInCreate, CheckInResponse,
)
from app.schemas.print_template import (
    PrintTemplateCreate, PrintTemplateUpdate, PrintTemplateResponse,
)
from app.schemas.ticket_type import (
    TicketTypeCreate, TicketTypeUpdate, TicketTypeResponse,
)
from app.schemas.registration import (
    ParticipantRegistrationCreate, ParticipantRegistrationUpdate,
    ParticipantRegistrationResponse, RegistrationApprovalRequest,
    RegistrationRejectionRequest,
)
from app.schemas.capacity import (
    CapacityRuleCreate, CapacityRuleUpdate, CapacityRuleResponse,
    CapacityStatusResponse,
)
from app.schemas.badge import (
    PrinterRegister, PrinterResponse, BadgeGenerateRequest,
    BadgeReprintRequest, BadgeResponse, BadgeHistoryResponse,
    BadgePrintJobResponse, BadgeScanResponse,
)
from app.schemas.attendance import (
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