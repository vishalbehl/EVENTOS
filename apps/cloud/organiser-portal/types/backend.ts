import { OrganizerDetails, SpeakerSettings, RegistrationSettings, BrandingSettings } from "./models";

export type EventStatus = 'draft' | 'active' | 'completed' | 'archived';

export interface EventSummary {
  id: string;
  name: string;
  short_code: string;
  description?: string;
  logo_url?: string;
  theme_color?: string;
  support_email?: string;
  support_phone?: string;
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
  licensing_details?: {
    activated_at: string | null;
  } | null;
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

export const SPEAKER_TYPES = [
  { code: 'KEY', label: 'Keynote Speaker', uploadRequired: true, defaultDuration: 45, color: '#f59e0b' },
  { code: 'INV', label: 'Invited Speaker', uploadRequired: true, defaultDuration: 25, color: '#3b82f6' },
  { code: 'ORL', label: 'Oral Presenter', uploadRequired: true, defaultDuration: 12, color: '#6366f1' },
  { code: 'PST', label: 'Poster Presenter', uploadRequired: false, defaultDuration: 0, color: '#10b981' },
  { code: 'PNL', label: 'Panel Member', uploadRequired: false, defaultDuration: 0, color: '#8b5cf6' },
  { code: 'MOD', label: 'Moderator / Chair', uploadRequired: false, defaultDuration: 0, color: '#64748b' },
  { code: 'WRK', label: 'Workshop Leader', uploadRequired: true, defaultDuration: 90, color: '#f97316' },
  { code: 'ORA', label: 'Oration Awardee', uploadRequired: true, defaultDuration: 30, color: '#ec4899' },
  { code: 'VIR', label: 'Virtual Speaker', uploadRequired: true, defaultDuration: 20, color: '#06b6d4' },
  { code: 'IND', label: 'Industry Speaker', uploadRequired: true, defaultDuration: 20, color: '#84cc16' },
] as const;
