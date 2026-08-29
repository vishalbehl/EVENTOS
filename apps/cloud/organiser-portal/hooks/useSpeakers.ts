import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, apiDelete } from "@/lib/api-client";
import { toast } from "sonner";

export interface SpeakerSummary {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  country?: string;
  affiliation?: string;
  upload_status: string;
  checked_in_at?: string | null;
  is_checked_in?: boolean;
  talks_count: number;
  speaker_code?: string;
  qr_code_url?: string;
  track_id?: string;
  track_name?: string;
  track_color?: string;
  participant_id?: string;
  role?: string;
  roles?: string[];
  email_logs?: Array<{
    id: string;
    subject: string;
    sent_at: string;
    status: string;
  }>;
  next_talk_start?: string;
  next_talk_end?: string;
  files_uploaded?: number;
  files_approved?: number;
  files_pending?: number;
  files_total?: number;
  profile_completeness?: number;
}

export interface TrackItem {
  id: string;
  name: string;
  code?: string;
  display_color?: string;
  sort_order: number;
}

export function useTracks(eventId: string) {
  return useQuery({
    queryKey: ["tracks", eventId],
    queryFn: () => apiGet<TrackItem[]>(`/events/${eventId}/tracks`),
    enabled: !!eventId && eventId !== "undefined" && eventId !== "[eventId]",
  });
}

export interface SpeakerTalk {
  session_speaker_id: string;
  session_id: string;
  session_name: string;
  session_code: string;
  room_name?: string;
  start_time: string;
  end_time: string;
  talk_title?: string;
  talk_order: number;
  speaker_type?: string;
  session_status: string;
  file_status: string; // "approved" | "uploaded" | "pending"
  files_uploaded: number;
  files_total: number;
  event_timezone: string;
}

export interface SpeakerFilters {
  upload_status?: string;
  search?: string;
  room_id?: string;
  session_id?: string;
}

export function useSpeakers(eventId: string, filters?: SpeakerFilters) {
  return useQuery({
    queryKey: ["speakers", eventId, filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters?.upload_status) params.append("upload_status", filters.upload_status);
      if (filters?.search) params.append("search", filters.search);
      if (filters?.room_id) params.append("room_id", filters.room_id);
      if (filters?.session_id) params.append("session_id", filters.session_id);
      params.append("page_size", "1000");
      const queryString = params.toString();
      return apiGet<SpeakerSummary[]>(
        `/events/${eventId}/speakers${queryString ? `?${queryString}` : ""}`
      );
    },
    enabled: !!eventId && eventId !== "undefined" && eventId !== "[eventId]",
  });
}

export function useSpeakerTalks(eventId: string, speakerId: string | null) {
  return useQuery({
    queryKey: ["speaker-talks", eventId, speakerId],
    queryFn: () =>
      apiGet<SpeakerTalk[]>(`/events/${eventId}/speakers/${speakerId}/sessions`),
    enabled: !!eventId && eventId !== "undefined" && eventId !== "[eventId]" && !!speakerId,
  });
}

export function useUpdateSpeaker(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      speakerId,
      data,
    }: {
      speakerId: string;
      data: {
        first_name?: string;
        last_name?: string;
        email?: string;
        phone?: string;
        country?: string;
        affiliation?: string;
        bio?: string;
      };
    }) => apiPatch(`/events/${eventId}/speakers/${speakerId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["speakers", eventId] });
      queryClient.invalidateQueries({ queryKey: ["speaker-talks", eventId] });
    },
  });
}

export function useDeleteSpeaker(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (speakerId: string) => apiDelete(`/events/${eventId}/speakers/${speakerId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["speakers", eventId] });
      toast.success("Speaker deleted successfully");
    },
    onError: () => {
      toast.error("Failed to delete speaker");
    }
  });
}

