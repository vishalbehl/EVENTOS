import { useQuery, useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export interface PortalTalk {
  session_speaker_id: string;
  session_name: string;
  session_code: string;
  start_time: string;
  end_time: string;
  talk_title: string | null;
  room_name: string | null;
  upload_status: "pending" | "uploaded" | "pending_validation" | "valid" | "warning" | "invalid" | "approved" | "rejected";
  is_locked: boolean;
  rejection_reason: string | null;
}

export interface PortalPoster {
  id: string;
  title: string;
  authors: string | null;
  category: string | null;
  status: "pending" | "submitted" | "under_review" | "approved" | "rejected" | "withdrawn" | "pending_validation" | "valid" | "invalid";
  original_filename: string | null;
  submitted_at: string | null;
  rejection_reason: string | null;
}

export interface SpeakerBrandingSettings {
  theme?: string;
  logo_url?: string | null;
  header_images?: string[];
  banner_url?: string | null;
  footer_terms?: string | null;
  footer_support_emails?: string[];
  footer_support_phones?: string[];
  footer_websites?: string[];
  footer_locations?: string[];
  footer_show_logo?: boolean;
}

export interface SpeakerPortalAuthResponse {
  speaker_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  designation?: string;
  affiliation?: string;
  country?: string;
  bio?: string;
  photo_url?: string;
  event_id: string;
  event_name: string;
  upload_deadline: string | null;
  max_file_size_mb: number;
  allowed_formats: string[];
  allow_override: boolean;
  talks: PortalTalk[];
  posters: PortalPoster[];
  speaker_code?: string;
  qr_code_url?: string;
  theme_color?: string | null;
  upload_token?: string | null;
  announcements: any[];
  social_links?: Record<string, string> | null;
  research_interests?: string[] | null;
  profile_completeness: number;
  branding_settings: SpeakerBrandingSettings;
  start_date?: string | null;
  end_date?: string | null;
  location?: string | null;
  venue_name?: string | null;
  organizer_name?: string | null;
}

export interface SpeakerPortalConfigResponse {
  event_name: string;
  theme_color: string | null;
  speaker_mode_enabled: boolean;
  registration_mode_enabled: boolean;
  branding_settings: SpeakerBrandingSettings;
  start_date?: string | null;
  end_date?: string | null;
  location?: string | null;
  venue_name?: string | null;
  country?: string | null;
  organizer_name?: string | null;
}

export function usePortalConfig(eventId: string) {
  return useQuery({
    queryKey: ["portal-config", eventId],
    queryFn: async () => {
      const response = await apiClient.get<SpeakerPortalConfigResponse>(`/portal/config/${eventId}`);
      return response.data;
    },
    enabled: !!eventId,
    retry: false,
  });
}

export function usePortalAuth(eventId: string, token: string) {
  return useQuery({
    queryKey: ["portal-auth", eventId, token],
    queryFn: async () => {
      const response = await apiClient.get<SpeakerPortalAuthResponse>(`/portal/auth/${eventId}/${token}`);
      return response.data;
    },
    enabled: !!token && !!eventId,
    retry: false,
  });
}

export function useRequestUploadUrl() {
  return useMutation({
    mutationFn: async ({ token, data }: { token: string; data: any }) => {
      const response = await apiClient.post(`/portal/upload-url`, data, {
        params: { token }
      });
      return response.data;
    },
  });
}

export function useConfirmUpload() {
  return useMutation({
    mutationFn: async ({ token, data }: { token: string; data: any }) => {
      const response = await apiClient.post(`/portal/confirm-upload`, data, {
        params: { token }
      });
      return response.data;
    },
  });
}

export function useRequestPosterUploadUrl() {
  return useMutation({
    mutationFn: async ({ token, posterId, data }: { token: string; posterId: string; data: any }) => {
      const response = await apiClient.post(`/portal/poster/${posterId}/upload-url`, data, {
        params: { token }
      });
      return response.data;
    },
  });
}

export function useConfirmPosterUpload() {
  return useMutation({
    mutationFn: async ({ token, posterId }: { token: string; posterId: string }) => {
      const response = await apiClient.post(`/portal/poster/${posterId}/confirm`, {}, {
        params: { token }
      });
      return response.data;
    },
  });
}
