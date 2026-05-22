// =============================================================
// TypeScript models — mirror backend Pydantic schemas exactly
// =============================================================

// ── Auth ──────────────────────────────────────────────────
export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user_id: string;
  role: UserRole;
  organization_id: string;
}

export interface UserMe {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  organization_id: string;
  avatar_url: string | null;
  is_active: boolean;
  last_login_at: string | null;
}

export type UserRole =
  | "super_admin"
  | "event_organizer"
  | "session_manager"
  | "technical_manager";

// ── Organization ──────────────────────────────────────────
export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  plan: string;
  created_at: string;
}

// ── Event ─────────────────────────────────────────────────
export type EventStatus = "draft" | "active" | "completed" | "archived";

export interface Event {
  id: string;
  organization_id: string;
  name: string;
  short_code: string;
  location: string | null;
  venue_name: string | null;
  organizer_name: string | null;
  start_date: string;
  end_date: string;
  timezone: string;
  upload_deadline: string | null;
  max_file_size_mb: number;
  allowed_formats: string[];
  status: EventStatus;
  banner_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventSummary {
  id: string;
  name: string;
  short_code: string;
  location: string | null;
  start_date: string;
  end_date: string;
  status: EventStatus;
  banner_url: string | null;
}

// ── Room ──────────────────────────────────────────────────
export type RoomType = "presentation" | "workshop" | "poster" | "plenary";

export interface Room {
  id: string;
  event_id: string;
  name: string;
  capacity: number | null;
  screen_count: number;
  room_type: RoomType;
  av_technician: string | null;
  location_notes: string | null;
  is_active: boolean;
  created_at: string;
}

// ── Session ───────────────────────────────────────────────
export type SessionType = "regular" | "keynote" | "workshop" | "panel" | "poster";
export type SessionStatus = "scheduled" | "in_progress" | "completed" | "cancelled";

export interface SessionSpeakerSlot {
  id: string;
  speaker_id: string;
  presentation_title: string | null;
  talk_order: number;
  talk_duration_minutes: number | null;
  is_confirmed: boolean;
  speaker_first_name?: string;
  speaker_last_name?: string;
  speaker_upload_status?: UploadStatus;
}

export interface Session {
  id: string;
  event_id: string;
  room_id: string | null;
  session_code: string;
  name: string;
  session_type: SessionType;
  start_time: string;
  end_time: string;
  moderator_id: string | null;
  moderator_name: string | null;
  description: string | null;
  status: SessionStatus;
  created_at: string;
  updated_at: string;
  session_speakers: SessionSpeakerSlot[];
}

export interface SessionSummary {
  id: string;
  session_code: string;
  name: string;
  room_id: string | null;
  session_type: SessionType;
  start_time: string;
  end_time: string;
  status: SessionStatus;
  speaker_count: number | null;
  readiness_pct: number | null;
}

// ── Speaker ───────────────────────────────────────────────
export type UploadStatus = "pending" | "uploaded" | "replaced" | "approved" | "rejected";

export interface Speaker {
  id: string;
  event_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  affiliation: string | null;
  country: string | null;
  bio: string | null;
  photo_url: string | null;
  upload_status: UploadStatus;
  qr_code_url: string | null;
  checked_in_at: string | null;
  token_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SpeakerSummary {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  affiliation: string | null;
  upload_status: UploadStatus;
  checked_in_at: string | null;
}

// ── Presentation Files ────────────────────────────────────
export type FileUploadStatus =
  | "processing" | "valid" | "invalid"
  | "approved" | "rejected" | "locked";

export type ValidationResult = "pass" | "warning" | "fail";

export interface FileValidation {
  id: string;
  file_id: string;
  slide_count: number | null;
  has_missing_fonts: boolean;
  missing_fonts_list: string[] | null;
  has_unsupported_video: boolean;
  has_corrupted_slides: boolean;
  has_large_images: boolean;
  overall_result: ValidationResult;
  error_details: Record<string, unknown> | null;
  thumbnail_url: string | null;
  validated_at: string;
}

export interface PresentationFile {
  id: string;
  speaker_id: string;
  session_speaker_id: string;
  event_id: string;
  original_filename: string;
  file_format: string;
  file_size_bytes: number;
  version_number: number;
  is_current_version: boolean;
  upload_source: string;
  upload_status: FileUploadStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  is_locked: boolean;
  local_sync_status: string;
  uploaded_at: string;
  validation: FileValidation | null;
}

// ── Import Job ────────────────────────────────────────────
export type ImportJobStatus =
  | "uploaded" | "validating" | "validated"
  | "importing" | "completed" | "failed";

export interface ImportJob {
  id: string;
  event_id: string;
  filename: string;
  status: ImportJobStatus;
  rows_total: number;
  rows_imported: number;
  rows_failed: number;
  sessions_created: number;
  speakers_created: number;
  rooms_created: number;
  error_summary: unknown;
  completed_at: string | null;
  created_at: string;
}

export interface ImportPreviewRow {
  row_number: number;
  session_code: string | null;
  session_name: string | null;
  room_name: string | null;
  start_time: string | null;
  end_time: string | null;
  speaker_first_name: string | null;
  speaker_last_name: string | null;
  speaker_email: string | null;
  errors: string[];
  warnings: string[];
  is_valid: boolean;
}

export interface ImportPreview {
  job_id: string;
  rows_total: number;
  rows_valid: number;
  rows_with_errors: number;
  rows_with_warnings: number;
  sessions_to_create: number;
  speakers_to_create: number;
  rooms_to_create: number;
  preview_rows: ImportPreviewRow[];
  can_import: boolean;
}

// ── Email & Campaigns ─────────────────────────────────────
export interface EmailTemplate {
  id: string;
  event_id: string | null;
  name: string;
  template_type: string;
  subject: string;
  body_html: string;
  body_text: string | null;
  is_default: boolean;
  created_at: string;
}

export interface Campaign {
  id: string;
  event_id: string;
  template_id: string;
  name: string;
  recipient_filter: string;
  session_id_filter: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  status: string;
  total_recipients: number;
  sent_count: number;
  created_at: string;
}

// ── SRR ───────────────────────────────────────────────────
export type StationStatus =
  | "idle" | "occupied" | "uploading"
  | "previewing" | "completed" | "error" | "locked";

export interface Station {
  id: string;
  event_id: string;
  station_number: number;
  device_name: string | null;
  ip_address: string | null;
  status: StationStatus;
  assigned_speaker_id: string | null;
  session_assigned_at: string | null;
  last_heartbeat_at: string | null;
  notes: string | null;
  is_active: boolean;
  updated_at: string;
}

// ── Analytics ─────────────────────────────────────────────
export interface DashboardStats {
  event_id: string;
  total_speakers: number;
  total_sessions: number;
  total_rooms: number;
  files_uploaded: number;
  files_approved: number;
  files_pending: number;
  files_rejected: number;
  speakers_checked_in: number;
  upload_rate_pct: number;
  approval_rate_pct: number;
  sessions_ready: number;
  sessions_total: number;
}

export interface SessionReadinessRow {
  session_id: string;
  session_name: string;
  session_code: string;
  room_name: string | null;
  start_time: string;
  total_speakers: number;
  files_approved: number;
  files_pending: number;
  readiness_pct: number;
}

export interface ActivityItem {
  id: string;
  event_type: string;
  speaker_name: string | null;
  session_name: string | null;
  description: string;
  occurred_at: string;
}

// ── Pagination ────────────────────────────────────────────
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}
