export interface VenueEvent {
  id: string;
  name: string;
  short_code?: string;
  status: string;
  start_date: string;
  end_date: string;
  venue_name?: string;
}

export interface DashboardMetrics {
  generated_at: string;
  freshness_at?: string;
  state: "ready" | "no_event";
  participants: number;
  checked_in: number;
  pending_checkin: number;
  badges_printed: number;
  print_jobs?: number;
  kits_distributed: number;
  total_kits: number;
  devices_online: number;
  devices_total: number;
  comparisons?: {
    today: number;
    yesterday: number;
    current_7_days: number;
    previous_7_days: number;
  };
  event?: VenueEvent;
  summary: {
    participants: number;
    checked_in: number;
    pending_checkin: number;
    cancelled: number;
    badges_printed: number;
    kits_distributed: number;
    total_kits: number;
    print_jobs: number;
    devices_online: number;
    devices_total: number;
  };
  sync_status: {
    status: string;
    last_sync?: string | null;
    pending_records: number;
    failed_records: number;
  };
  trend: Array<{
    date: string;
    registrations: number;
    checkins: number;
  }>;
  recent_activity: Array<{
    id: string;
    timestamp: string;
    action: string;
    details: string;
    status: string;
    operator?: string | null;
  }>;
  storage: {
    db_used_gb: number;
    db_total_gb: number;
    db_percentage: number;
    media_used_gb: number;
    media_total_gb: number;
    media_percentage: number;
  };
  system: {
    api: { status: string };
    database: any;
    disk: any;
  };
}

export interface RoomOverviewItem {
  room_id: string;
  room_name: string;
  capacity: number;
  current_session?: {
    id: string;
    title: string;
    track?: string;
    start_time?: string;
    end_time?: string;
    status: "live" | "upcoming" | "scheduled";
  } | null;
  active_presentation?: {
    file_id?: string | null;
    file_name: string;
    file_format: string;
    speaker_name?: string | null;
    speaker_affiliation?: string | null;
  } | null;
  queued_presentations_count: number;
  connected_devices_count: number;
  is_online: boolean;
  devices: Array<{
    id: string;
    device_name: string;
    device_type: string;
    status: string;
    ip_address?: string;
    last_seen?: string;
  }>;
}

export interface SRROverview {
  metrics: {
    total_speakers: number;
    checked_in_count: number;
    ready_count: number;
    pending_review_count: number;
    missing_slides_count: number;
    active_stations_count: number;
  };
  speakers: Array<{
    speaker_id: string;
    name: string;
    first_name: string;
    last_name: string;
    email?: string;
    affiliation?: string;
    is_checked_in: boolean;
    last_checkin_at?: string;
    status: "ready" | "pending_review" | "missing_slides";
    files: Array<{
      file_id: string;
      filename: string;
      file_format: string;
      file_size_bytes?: number;
      upload_status: string;
      created_at?: string;
    }>;
    sessions: Array<{
      session_id: string;
      session_title: string;
      room_name: string;
      start_time?: string;
      end_time?: string;
    }>;
  }>;
  stations: Array<{
    id: string;
    name: string;
    station_number?: string;
    is_active: boolean;
  }>;
}

export interface WorkstationDTO {
  id: string;
  device_name: string;
  device_type: string;
  hostname?: string;
  ip_address?: string;
  mac_address?: string;
  status: string;
  room_name?: string;
  os_version?: string;
  last_seen?: string;
  registered_at?: string;
  mode?: string;
  allowed_modes: string[];
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  name: string;
  role: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  phone?: string;
  allowed_modes?: string[];
  mode_preferences?: Record<string, any>;
  notification_preferences?: Record<string, any>;
}
