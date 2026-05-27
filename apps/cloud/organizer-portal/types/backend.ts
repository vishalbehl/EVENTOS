export type EventStatus = 'draft' | 'active' | 'completed' | 'archived';

export interface EventSummary {
  id: string;
  name: string;
  short_code: string;
  location?: string;
  organizer_name?: string;
  start_date: string;
  end_date: string;
  status: EventStatus;
  banner_url?: string;
  speaker_mode_enabled?: boolean;
  registration_mode_enabled?: boolean;
}

export interface EventResponse extends EventSummary {
  organization_id: string;
  venue_name?: string;
  organizer_name?: string;
  timezone: string;
  upload_deadline?: string;
  max_file_size_mb: number;
  allowed_formats: string[];
  feature_toggles: Record<string, any>;
  registration_allowed: boolean;
  speaker_window_required: boolean;
  currency: string;
  participants_list_allowed: boolean;
  speaker_settings: Record<string, any>;
  registration_settings: Record<string, any>;
  theme_color?: string | null;
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
