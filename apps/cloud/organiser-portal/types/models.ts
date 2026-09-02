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
  | "organiser"
  | "event_organizer"
  | "admin"
  | "registration_manager"
  | "registration_coordinator"
  | "registration_reviewer"
  | "badge_manager"
  | "checkin_staff"
  | "registration_viewer"
  | "speaker_manager"
  | "session_manager"
  | "room_manager"
  | "venue_operator"
  | "technician"
  | "technical_manager"
  | "volunteer"
  | "viewer";

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

export interface OrganizerDetails {
  name: string;
  email: string;
  phone: string;
  website: string;
}

export interface SpeakerSettings {
  enabled: boolean;
  window_required: boolean;
  [key: string]: unknown;
}

export interface RegistrationSettings {
  enabled: boolean;
  registration_allowed: boolean;
  participants_list_allowed: boolean;
  [key: string]: unknown;
}

export interface BrandingSettings {
  theme_color: string;
  logo_url: string | null;
  banner_url: string | null;
  [key: string]: unknown;
}

export interface Event {
  id: string;
  organization_id: string;
  name: string;
  short_code: string;
  location: string | null;
  venue_name: string | null;
  country: string | null;
  state: string | null;
  organizer_name: string | null;
  organizer_details: OrganizerDetails;
  start_date: string;
  end_date: string;
  timezone: string;
  upload_deadline: string | null;
  max_file_size_mb: number;
  allowed_formats: string[];
  status: EventStatus;
  speaker_settings: SpeakerSettings;
  registration_settings: RegistrationSettings;
  branding_settings: BrandingSettings;
  feature_toggles: Record<string, boolean>;
  currency: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventSummary {
  id: string;
  name: string;
  short_code: string;
  location: string | null;
  venue_name: string | null;
  country: string | null;
  state: string | null;
  organizer_name: string | null;
  organizer_details: OrganizerDetails;
  start_date: string;
  end_date: string;
  status: EventStatus;
  speaker_settings: SpeakerSettings;
  registration_settings: RegistrationSettings;
  branding_settings: BrandingSettings;
}

// ── Room ──────────────────────────────────────────────────
export type RoomType = "presentation" | "workshop" | "poster" | "plenary";

export interface Room {
  id: string;
  event_id: string;
  name: string;
  code?: string | null;
  room_type: string;
  room_type_id?: string | null;
  room_coordinator?: string | null;
  is_active: boolean;
  created_at: string;
}

// ── Session ───────────────────────────────────────────────
export type SessionCategory = "CONTENT" | "NETWORKING" | "EXHIBITION" | "CEREMONY" | "BREAK" | "ADMINISTRATIVE";

export type SessionType =
  | "regular"
  | "keynote"
  | "workshop"
  | "panel"
  | "poster"
  | "eposter"
  | "KEYNOTE"
  | "EXECUTIVE_KEYNOTE"
  | "TECHNICAL_SESSION"
  | "INVITED_TALK"
  | "CASE_STUDY"
  | "PANEL_DISCUSSION"
  | "FIRESIDE_CHAT"
  | "ROUNDTABLE"
  | "WORKSHOP"
  | "TUTORIAL"
  | "POSTER_SESSION"
  | "DEMO_SESSION"
  | "PRODUCT_SHOWCASE"
  | "INDUSTRY_FORUM"
  | "LEADERSHIP_FORUM"
  | "LIGHTNING_TALKS"
  | "BREAKOUT_SESSION"
  | "REGISTRATION"
  | "OPENING_CEREMONY"
  | "WELCOME_ADDRESS"
  | "COFFEE_BREAK"
  | "LUNCH_BREAK"
  | "NETWORKING_BREAK"
  | "SPONSOR_SHOWCASE"
  | "EXHIBITION_VISIT"
  | "AWARDS_CEREMONY"
  | "CLOSING_CEREMONY"
  | "GALA_DINNER"
  | "RECEPTION";

export const SESSION_TYPE_CATEGORIES: Record<string, SessionCategory> = {
  regular: "CONTENT",
  keynote: "CONTENT",
  workshop: "CONTENT",
  panel: "CONTENT",
  poster: "EXHIBITION",
  eposter: "EXHIBITION",
  KEYNOTE: "CONTENT",
  EXECUTIVE_KEYNOTE: "CONTENT",
  TECHNICAL_SESSION: "CONTENT",
  INVITED_TALK: "CONTENT",
  CASE_STUDY: "CONTENT",
  PANEL_DISCUSSION: "CONTENT",
  FIRESIDE_CHAT: "CONTENT",
  ROUNDTABLE: "CONTENT",
  WORKSHOP: "CONTENT",
  TUTORIAL: "CONTENT",
  INDUSTRY_FORUM: "CONTENT",
  LEADERSHIP_FORUM: "CONTENT",
  LIGHTNING_TALKS: "CONTENT",
  BREAKOUT_SESSION: "CONTENT",
  GALA_DINNER: "NETWORKING",
  RECEPTION: "NETWORKING",
  POSTER_SESSION: "EXHIBITION",
  DEMO_SESSION: "EXHIBITION",
  PRODUCT_SHOWCASE: "EXHIBITION",
  SPONSOR_SHOWCASE: "EXHIBITION",
  EXHIBITION_VISIT: "EXHIBITION",
  OPENING_CEREMONY: "CEREMONY",
  WELCOME_ADDRESS: "CEREMONY",
  AWARDS_CEREMONY: "CEREMONY",
  CLOSING_CEREMONY: "CEREMONY",
  COFFEE_BREAK: "BREAK",
  LUNCH_BREAK: "BREAK",
  NETWORKING_BREAK: "BREAK",
  REGISTRATION: "ADMINISTRATIVE",
};

export const SESSION_CATEGORIES: Record<SessionCategory, { value: SessionType; label: string }[]> = {
  CONTENT: [
    { value: "KEYNOTE", label: "Keynote" },
    { value: "EXECUTIVE_KEYNOTE", label: "Executive Keynote" },
    { value: "TECHNICAL_SESSION", label: "Technical Session" },
    { value: "INVITED_TALK", label: "Invited Talk" },
    { value: "CASE_STUDY", label: "Case Study" },
    { value: "PANEL_DISCUSSION", label: "Panel Discussion" },
    { value: "FIRESIDE_CHAT", label: "Fireside Chat" },
    { value: "ROUNDTABLE", label: "Roundtable" },
    { value: "WORKSHOP", label: "Workshop" },
    { value: "TUTORIAL", label: "Tutorial" },
    { value: "INDUSTRY_FORUM", label: "Industry Forum" },
    { value: "LEADERSHIP_FORUM", label: "Leadership Forum" },
    { value: "LIGHTNING_TALKS", label: "Lightning Talks" },
    { value: "BREAKOUT_SESSION", label: "Breakout Session" },
  ],
  NETWORKING: [
    { value: "GALA_DINNER", label: "Gala Dinner" },
    { value: "RECEPTION", label: "Reception" },
  ],
  EXHIBITION: [
    { value: "POSTER_SESSION", label: "Poster Session" },
    { value: "DEMO_SESSION", label: "Demo Session" },
    { value: "PRODUCT_SHOWCASE", label: "Product Showcase" },
    { value: "SPONSOR_SHOWCASE", label: "Sponsor Showcase" },
    { value: "EXHIBITION_VISIT", label: "Exhibition Visit" },
  ],
  CEREMONY: [
    { value: "OPENING_CEREMONY", label: "Opening Ceremony" },
    { value: "WELCOME_ADDRESS", label: "Welcome Address" },
    { value: "AWARDS_CEREMONY", label: "Awards Ceremony" },
    { value: "CLOSING_CEREMONY", label: "Closing Ceremony" },
  ],
  BREAK: [
    { value: "COFFEE_BREAK", label: "Coffee Break" },
    { value: "LUNCH_BREAK", label: "Lunch Break" },
    { value: "NETWORKING_BREAK", label: "Networking Break" },
  ],
  ADMINISTRATIVE: [
    { value: "REGISTRATION", label: "Registration" },
  ],
};

export type SessionStatus = "scheduled" | "in_progress" | "completed" | "cancelled";

export interface SessionSpeakerSlot {
  id: string;
  speaker_id: string;
  presentation_title: string | null;
  talk_order: number;
  talk_duration_minutes: number | null;
  speaker_type?: string;
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
