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

export function useSessionDetail(eventId: string, sessionId: string) {
  return useQuery({
    queryKey: ["session-detail", eventId, sessionId],
    queryFn: () => apiGet<any>(`/events/${eventId}/sessions/${sessionId}`),
    enabled: !!eventId && !!sessionId && eventId !== "undefined" && sessionId !== "undefined",
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
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["sessions", eventId] });
      queryClient.invalidateQueries({ queryKey: ["session-detail", eventId, variables.sessionId] });
      queryClient.invalidateQueries({ queryKey: ["session-builder-snapshot", eventId] });
      toast.success("Session updated successfully");
    },
    onError: (error: any) => {
      toast.error(formatApiError(error, "Failed to update session"));
    }
  });
}

export function useAddSessionSpeaker(eventId: string, sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      speaker_id: string;
      presentation_title?: string;
      talk_order?: number;
      talk_duration_minutes?: number;
      role?: string;
      is_confirmed?: boolean;
    }) => apiPost(`/events/${eventId}/sessions/${sessionId}/speakers`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["session-detail", eventId, sessionId] });
      queryClient.invalidateQueries({ queryKey: ["sessions", eventId] });
      queryClient.invalidateQueries({ queryKey: ["speakers", eventId] });
      queryClient.invalidateQueries({ queryKey: ["speaker-talks", eventId] });
      toast.success("Speaker assigned to session");
    },
    onError: (error: any) => {
      toast.error(formatApiError(error, "Failed to assign speaker"));
    }
  });
}

export function useUpdateSessionSpeaker(eventId: string, sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      sessionSpeakerId,
      data,
    }: {
      sessionSpeakerId: string;
      data: any;
    }) => apiPatch(`/events/${eventId}/sessions/${sessionId}/speakers/${sessionSpeakerId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["session-detail", eventId, sessionId] });
      queryClient.invalidateQueries({ queryKey: ["sessions", eventId] });
      queryClient.invalidateQueries({ queryKey: ["speakers", eventId] });
      queryClient.invalidateQueries({ queryKey: ["speaker-talks", eventId] });
      toast.success("Talk updated successfully");
    },
    onError: (error: any) => {
      toast.error(formatApiError(error, "Failed to update talk"));
    }
  });
}

export function useRemoveSessionSpeaker(eventId: string, sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionSpeakerId: string) =>
      apiDelete(`/events/${eventId}/sessions/${sessionId}/speakers/${sessionSpeakerId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["session-detail", eventId, sessionId] });
      queryClient.invalidateQueries({ queryKey: ["sessions", eventId] });
      queryClient.invalidateQueries({ queryKey: ["speakers", eventId] });
      queryClient.invalidateQueries({ queryKey: ["speaker-talks", eventId] });
      toast.success("Speaker removed from session");
    },
    onError: (error: any) => {
      toast.error(formatApiError(error, "Failed to remove speaker"));
    }
  });
}

export function useReorderSessionSpeakers(eventId: string, sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: string[]) =>
      apiPost(`/events/${eventId}/sessions/${sessionId}/reorder-speakers`, { ordered_ids: orderedIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["session-detail", eventId, sessionId] });
      queryClient.invalidateQueries({ queryKey: ["sessions", eventId] });
      queryClient.invalidateQueries({ queryKey: ["speakers", eventId] });
      queryClient.invalidateQueries({ queryKey: ["speaker-talks", eventId] });
      toast.success("Speaker order updated");
    },
    onError: (error: any) => {
      toast.error(formatApiError(error, "Failed to reorder speakers"));
    }
  });
}

