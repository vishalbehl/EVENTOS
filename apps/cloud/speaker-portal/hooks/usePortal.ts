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

export interface SpeakerPortalAuthResponse {
  speaker_id: string;
  first_name: string;
  last_name: string;
  email: string;
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
}

export function usePortalAuth(token: string) {
  return useQuery({
    queryKey: ["portal-auth", token],
    queryFn: async () => {
      const response = await apiClient.get<SpeakerPortalAuthResponse>(`/portal/auth/${token}`);
      return response.data;
    },
    enabled: !!token,
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
