# =============================================================
# Analytics schemas
# =============================================================
import uuid
from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel


class UploadFunnelStats(BaseModel):
    invited: int
    uploaded: int
    approved: int
    rejected: int
    pending: int
    upload_rate_pct: float      # uploaded / invited * 100
    approval_rate_pct: float    # approved / uploaded * 100


class SessionReadinessRow(BaseModel):
    session_id: uuid.UUID
    session_name: str
    session_code: str
    room_name: Optional[str] = None
    start_time: Optional[datetime] = None
    total_speakers: int
    files_approved: int
    files_pending: int
    readiness_pct: float



class RoomBreakdownRow(BaseModel):
    room_id: uuid.UUID
    room_name: str
    session_count: int
    speaker_count: int
    files_approved: int
    readiness_pct: float


class ChartDataPoint(BaseModel):
    label: str
    value: float


class RoomHeatmapData(BaseModel):
    room_name: str
    readiness_pct: float
    total_sessions: int
    ready_sessions: int


class DashboardStats(BaseModel):
    """Top-level event dashboard metrics."""
    event_id: uuid.UUID
    total_speakers: int
    total_sessions: int
    total_rooms: int
    files_uploaded: int
    files_approved: int
    files_pending: int
    files_rejected: int
    speakers_checked_in: int
    upload_rate_pct: float
    approval_rate_pct: float
    sessions_ready: int         # sessions where all speakers have approved files
    sessions_total: int
    talks_pending_upload: int = 0
    
    # New fields for charts
    daily_uploads: List[ChartDataPoint] = []
    room_readiness: List[RoomBreakdownRow] = []
    room_heatmap: List[RoomHeatmapData] = []


class ActivityItem(BaseModel):
    """Single item in the recent activity feed."""
    id: uuid.UUID
    event_type: str             # file_uploaded | file_approved | speaker_checkin etc.
    speaker_name: Optional[str] = None
    session_name: Optional[str] = None
    description: str
    occurred_at: datetime


class AnalyticsExportRequest(BaseModel):
    format: str = "csv"         # csv | pdf
    include_sessions: bool = True
    include_speakers: bool = True
    include_files: bool = True


class ApprovalTimeRow(BaseModel):
    """Average upload-to-approval time per session/room."""
    group_type: str        # "session" or "room"
    group_id: str
    group_name: str
    avg_days: float
    sample_count: int


class FileFormatRow(BaseModel):
    """Count of files by format for the pie chart."""
    format: str
    count: int
    pct: float             # percent of total


class PerRoomBreakdownRow(BaseModel):
    """Per-room upload / validation / approval breakdown."""
    room_id: str
    room_name: str
    session_count: int
    speaker_slots: int
    uploaded_count: int
    validated_count: int
    approved_count: int
    upload_pct: float
    validation_pct: float
    approval_pct: float


class DemographicPoint(BaseModel):
    label: str
    value: int


class DeviceStatusCount(BaseModel):
    online: int
    offline: int
    error: int
    maintenance: int


class UpcomingSession(BaseModel):
    id: uuid.UUID
    name: str
    room_name: Optional[str] = None
    start_time: datetime
    end_time: datetime
    speaker_names: List[str] = []


class UpcomingDeadline(BaseModel):
    title: str
    time: datetime
    status: str  # Passed, Critical, Upcoming, Scheduled


class AlertItem(BaseModel):
    id: str
    type: str  # failed_upload, offline_device, duplicate_registration, session_conflict, deadline_warning, missing_file
    message: str
    severity: str  # critical, warning, info
    timestamp: datetime
    details: Optional[Dict] = None


class MainEventDashboardData(BaseModel):
    # 1. Top KPI Cards
    total_registrations: int
    total_speakers: int
    total_sessions: int
    active_rooms: int
    uploads_completed: int
    uploads_pending: int
    attendees_checked_in: int
    event_readiness_pct: float
    device_status: DeviceStatusCount
    total_revenue: float
    active_staff_count: int
    alert_count: int

    # 2. Analytics Widgets
    registration_growth: List[ChartDataPoint] = []
    upload_completion_trends: List[ChartDataPoint] = []
    attendee_demographics: List[DemographicPoint] = []
    session_distribution: List[ChartDataPoint] = []
    room_occupancy: List[ChartDataPoint] = []
    daily_activity_heatmap: List[Dict] = []
    speaker_upload_progress: UploadFunnelStats

    # 3. Live Activity Feed
    recent_activity: List[ActivityItem] = []

    # 4. Centralized Alert Center
    alerts: List[AlertItem] = []

    # 5. Upcoming Section
    upcoming_sessions: List[UpcomingSession] = []
    upcoming_deadlines: List[UpcomingDeadline] = []

