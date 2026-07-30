import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  filename?: string | null;
  download_url?: string | null;
  preview_url?: string | null;
  thumbnail_url?: string | null;
  abstract_text?: string | null;
  abstract_keywords: string[];
  abstract_status:
    | "DRAFT"
    | "SUBMITTED"
    | "UNDER_REVIEW"
    | "ACCEPTED"
    | "REJECTED"
    | "REVISION_REQUESTED"
    | "WITHDRAWN";
  abstract_version: number;
  abstract_submitted_at?: string | null;
  abstract_review_notes?: string | null;
}

export interface AbstractMutationResponse {
  session_speaker_id: string;
  abstract_text?: string | null;
  keywords: string[];
  status: PortalTalk["abstract_status"];
  version: number;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
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
  download_url?: string | null;
  preview_url?: string | null;
  thumbnail_url?: string | null;
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
  terms_and_conditions?: string | null;
  faqs?: Array<{ q: string; a: string; is_default?: boolean }>;
  include_default_faqs?: boolean;
  start_date?: string | null;
  end_date?: string | null;
  location?: string | null;
  venue_name?: string | null;
  organizer_name?: string | null;
  state?: string;
  event_state?: string | null;
  event_country?: string | null;
  reg_no?: string;
  profile_settings?: {
    enabled_methods?: {
      form: boolean;
      template: boolean;
      cv: boolean;
    };
    template_url?: string | null;
    template_filename?: string | null;
  };
  srr_checked_in?: boolean;
  registration_mode_enabled?: boolean;
  abstract_submission_enabled: boolean;
  abstract_submission_reason?: string | null;
}

export interface SpeakerPortalConfigResponse {
  event_name: string;
  theme_color: string | null;
  speaker_mode_enabled: boolean;
  registration_mode_enabled: boolean;
  branding_settings: SpeakerBrandingSettings;
  terms_and_conditions?: string | null;
  faqs?: Array<{ q: string; a: string; is_default?: boolean }>;
  include_default_faqs?: boolean;
  start_date?: string | null;
  end_date?: string | null;
  location?: string | null;
  venue_name?: string | null;
  country?: string | null;
  event_state?: string | null;
  event_country?: string | null;
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
        params: { token },
        headers: { "Idempotency-Key": crypto.randomUUID() },
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
        params: { token },
        headers: { "Idempotency-Key": crypto.randomUUID() },
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

export function useSaveAbstractDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      eventId,
      token,
      talk,
      abstractText,
      keywords,
    }: {
      eventId: string;
      token: string;
      talk: PortalTalk;
      abstractText: string;
      keywords: string[];
    }) => {
      const response = await apiClient.patch<AbstractMutationResponse>(
        `/portal/abstracts/${talk.session_speaker_id}`,
        { abstract_text: abstractText, keywords },
        {
          params: { token },
          headers: {
            "If-Match": talk.abstract_version,
            "Idempotency-Key": crypto.randomUUID(),
          },
        },
      );
      return response.data;
    },
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({
        queryKey: ["portal-auth", variables.eventId, variables.token],
      }),
  });
}

export function useSubmitAbstract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      eventId,
      token,
      talk,
    }: {
      eventId: string;
      token: string;
      talk: PortalTalk;
    }) => {
      const response = await apiClient.post<AbstractMutationResponse>(
        `/portal/abstracts/${talk.session_speaker_id}/submit`,
        {},
        {
          params: { token },
          headers: {
            "If-Match": talk.abstract_version,
            "Idempotency-Key": crypto.randomUUID(),
          },
        },
      );
      return response.data;
    },
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({
        queryKey: ["portal-auth", variables.eventId, variables.token],
      }),
  });
}

export function useWithdrawAbstract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      eventId,
      token,
      talk,
    }: {
      eventId: string;
      token: string;
      talk: PortalTalk;
    }) => {
      const response = await apiClient.post<AbstractMutationResponse>(
        `/portal/abstracts/${talk.session_speaker_id}/withdraw`,
        {},
        {
          params: { token },
          headers: {
            "If-Match": talk.abstract_version,
            "Idempotency-Key": crypto.randomUUID(),
          },
        },
      );
      return response.data;
    },
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({
        queryKey: ["portal-auth", variables.eventId, variables.token],
      }),
  });
}
