import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiDelete, apiPost, apiPatch } from "@/lib/api-client";
import { formatApiError } from "@/lib/utils";
import { toast } from "sonner";

export interface SessionSummary {
  id: string;
  name: string;
  session_code: string;
  start_time: string;
  end_time: string;
  room_id?: string;
  room_name?: string;
  session_type?: string;
  moderator_name?: string;
  status: string;
  readiness_pct?: number;
  event_timezone?: string;
  speaker_count?: number;
  description?: string | null;
  speakers?: Array<{
    id: string;
    session_speaker_id: string;
    full_name: string;
    email?: string;
    presentation_title?: string;
    upload_status: string;
    talk_order: number;
    start_time?: string;
    end_time?: string;
  }>;
}

export function useSessions(eventId: string, filters?: { room_id?: string; status?: string }) {
  return useQuery({
    queryKey: ["sessions", eventId, filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters?.room_id) params.append("room_id", filters.room_id);
      if (filters?.status) params.append("status", filters.status);
      params.append("page_size", "1000");
      const queryString = params.toString();
      return apiGet<SessionSummary[]>(`/events/${eventId}/sessions${queryString ? `?${queryString}` : ""}`);
    },
    enabled: !!eventId && eventId !== "undefined" && eventId !== "[eventId]",
  });
}

export function useDeleteSession(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => apiDelete(`/events/${eventId}/sessions/${sessionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions", eventId] });
      queryClient.invalidateQueries({ queryKey: ["session-builder-snapshot", eventId] });
      toast.success("Session deleted successfully");
    },
    onError: () => {
      toast.error("Failed to delete session");
    }
  });
}

export function useCreateSession(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => apiPost(`/events/${eventId}/sessions`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions", eventId] });
      queryClient.invalidateQueries({ queryKey: ["session-builder-snapshot", eventId] });
      toast.success("Session created successfully");
    },
    onError: (error: any) => {
      toast.error(formatApiError(error, "Failed to create session"));
    }
  });
}

export function useUpdateSession(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, data }: { sessionId: string; data: any }) =>
      apiPatch(`/events/${eventId}/sessions/${sessionId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions", eventId] });
      queryClient.invalidateQueries({ queryKey: ["session-builder-snapshot", eventId] });
      toast.success("Session updated successfully");
    },
    onError: (error: any) => {
      toast.error(formatApiError(error, "Failed to update session"));
    }
  });
}
