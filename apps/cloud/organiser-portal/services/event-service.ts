import { apiClient } from '@/lib/api-client';

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

export interface ActivityItem {
  id: string;
  event_type: string;
  speaker_name?: string;
  session_name?: string;
  description: string;
  occurred_at: string;
}

export interface EventSummary {
  id: string;
  name: string;
  short_code: string;
  location?: string;
  start_date: string;
  end_date: string;
  status: string;
  banner_url?: string;
}

export const eventService = {
  /**
   * List all events for the organization
   */
  listEvents: async (): Promise<EventSummary[]> => {
    return apiClient.get<EventSummary[]>('/events');
  },

  /**
   * Get dashboard KPI stats for a specific event
   */
  getDashboardStats: async (eventId: string): Promise<DashboardStats> => {
    return apiClient.get<DashboardStats>(`/events/${eventId}/analytics/dashboard`);
  },

  /**
   * Get recent activity feed for an event
   */
  getActivity: async (eventId: string, limit: number = 10): Promise<ActivityItem[]> => {
    return apiClient.get<ActivityItem[]>(`/events/${eventId}/analytics/activity`, {
      params: { limit }
    });
  }
};
