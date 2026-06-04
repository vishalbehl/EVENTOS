import { OrganizerDetails, SpeakerSettings, RegistrationSettings, BrandingSettings } from "./models";

export type EventStatus = 'draft' | 'active' | 'completed' | 'archived';

export interface EventSummary {
  id: string;
  name: string;
  short_code: string;
  location?: string;
  venue_name?: string;
  country?: string;
  state?: string;
  organizer_name?: string;
  organizer_details?: OrganizerDetails;
  start_date: string;
  end_date: string;
  status: EventStatus;
  speaker_settings: SpeakerSettings;
  registration_settings: RegistrationSettings;
  branding_settings: BrandingSettings;
}

export interface EventResponse extends EventSummary {
  organization_id: string;
  timezone: string;
  upload_deadline?: string;
  max_file_size_mb: number;
  allowed_formats: string[];
  feature_toggles: Record<string, boolean>;
  currency: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

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
