"use client";

import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, apiPost, apiDelete } from "@/lib/api-client";
import { toast } from "sonner";
import {
  useSessionBuilderStore,
  type BuilderSession,
  type BuilderSpeaker,
} from "@/store/useSessionBuilderStore";

export function useSessionBuilderSnapshot(eventId: string) {
  const setSnapshot = useSessionBuilderStore((s) => s.setSnapshot);

  return useQuery({
    queryKey: ["session-builder-snapshot", eventId],
    queryFn: async () => {
      const data = await apiGet<any>(`/events/${eventId}/sessions/builder-snapshot`);
      if (data) {
        setSnapshot(data);
      }
      return data;
    },
    enabled: !!eventId && eventId !== "undefined" && eventId !== "[eventId]",
    refetchOnWindowFocus: false,
    staleTime: 30000,
  });
}

export function useBulkReorderSessions(eventId: string) {
  const queryClient = useQueryClient();
  const markSaved = useSessionBuilderStore((s) => s.markSaved);
  const setIsSaving = useSessionBuilderStore((s) => s.setIsSaving);
  const setServerConflicts = useSessionBuilderStore((s) => s.setServerConflicts);

  return useMutation({
    mutationFn: (items: Array<{ session_id: string; room_id: string | null; start_time: string; end_time: string; sort_order?: number; expected_version?: number }>) => {
      setIsSaving(true);
      return apiPatch(`/events/${eventId}/sessions/bulk-reorder`, { items });
    },
    onSuccess: (data: any) => {
      if (Array.isArray(data?.conflicts)) setServerConflicts(data.conflicts);
      markSaved();
      queryClient.invalidateQueries({ queryKey: ["sessions", eventId] });
      queryClient.invalidateQueries({ queryKey: ["session-builder-snapshot", eventId] });
    },
    onError: (err: any) => {
      setIsSaving(false);
      toast.error(err?.response?.data?.detail || "Failed to auto-save schedule changes");
    },
  });
}

export function useDuplicateSession(eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sessionId, offsetMinutes = 0, newRoomId = null, includeSpeakers = true, idempotencyKey }: { sessionId: string; offsetMinutes?: number; newRoomId?: string | null; includeSpeakers?: boolean; idempotencyKey?: string }) =>
      apiPost(`/events/${eventId}/sessions/${sessionId}/duplicate`, {
        offset_minutes: offsetMinutes,
        new_room_id: newRoomId,
        include_speakers: includeSpeakers,
      }, idempotencyKey ? { headers: { "Idempotency-Key": idempotencyKey } } : undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["session-builder-snapshot", eventId] });
      queryClient.invalidateQueries({ queryKey: ["sessions", eventId] });
      toast.success("Session duplicated successfully");
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || "Failed to duplicate session");
    },
  });
}

/**
 * Auto-save hook that watches isDirty and debounces bulk-reorder PATCH requests after 2 seconds.
 */
export function useAutoSaveSessionBuilder(eventId: string) {
  const isDirty = useSessionBuilderStore((s) => s.isDirty);
  const sessions = useSessionBuilderStore((s) => s.sessions);
  const bulkReorder = useBulkReorderSessions(eventId);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isDirty || !eventId) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      const items = sessions
        .filter((s) => !s.id.startsWith("temp_"))
        .map((s) => ({
          session_id: s.id,
          room_id: s.room_id || null,
          start_time: s.start_time,
          end_time: s.end_time,
          sort_order: s.sort_order || 0,
          expected_version: s.version,
        }));

      if (items.length > 0) {
        bulkReorder.mutate(items);
      }
    }, 2000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isDirty, sessions, eventId]);
}

export function useAssignSpeakerToSession(eventId: string) {
  const queryClient = useQueryClient();
  const assignSpeakerToSessionStore = useSessionBuilderStore((s) => s.assignSpeakerToSession);

  return useMutation({
    mutationFn: ({ sessionId, speaker }: { sessionId: string; speaker: BuilderSpeaker }) =>
      apiPost(`/events/${eventId}/sessions/${sessionId}/speakers`, {
        speaker_id: speaker.id,
      }),
    onMutate: async ({ sessionId, speaker }) => {
      // Optimistic update
      assignSpeakerToSessionStore(sessionId, speaker);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["session-builder-snapshot", eventId] });
      queryClient.invalidateQueries({ queryKey: ["sessions", eventId] });
      toast.success("Speaker assigned to session");
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || "Failed to assign speaker");
      // Ideally rollback optimistic update here
      queryClient.invalidateQueries({ queryKey: ["session-builder-snapshot", eventId] });
    },
  });
}

export function useRemoveSpeakerFromSession(eventId: string) {
  const queryClient = useQueryClient();
  const removeSpeakerStore = useSessionBuilderStore((s) => s.removeSpeakerFromSession);

  return useMutation({
    mutationFn: async ({ sessionId, speakerId }: { sessionId: string; speakerId: string }) => {
      // Backend now accepts either speaker_id or session_speaker_id
      return apiDelete(`/events/${eventId}/sessions/${sessionId}/speakers/${speakerId}`);
    },
    onMutate: async ({ sessionId, speakerId }) => {
      removeSpeakerStore(sessionId, speakerId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["session-builder-snapshot", eventId] });
      queryClient.invalidateQueries({ queryKey: ["sessions", eventId] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || "Failed to remove speaker");
      queryClient.invalidateQueries({ queryKey: ["session-builder-snapshot", eventId] });
    },
  });
}

export function usePublishSchedule(eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionIds?: string[]) => {
      return apiPost<{ success: boolean; published_count: number; message: string }>(
        `/events/${eventId}/sessions/publish-schedule`,
        sessionIds && sessionIds.length > 0 ? { session_ids: sessionIds } : {},
        { headers: { "Idempotency-Key": `session-builder-publish:${eventId}:${sessionIds?.join(",") || "all"}` } } as any,
      );
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["session-builder-snapshot", eventId] });
      queryClient.invalidateQueries({ queryKey: ["sessions", eventId] });
      queryClient.invalidateQueries({ queryKey: ["events", eventId] });
      queryClient.invalidateQueries({ queryKey: ["website-builder-snapshot", eventId] });
      toast.success(data?.message || "Schedule published successfully! Sessions are now live.");
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || "Failed to publish schedule");
    },
  });
}

export function useMaterializeAbstractCandidate(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ submissionId, durationMinutes = 30 }: { submissionId: string; durationMinutes?: number }) =>
      apiPost(`/events/${eventId}/sessions/candidates/${submissionId}/materialize`, { duration_minutes: durationMinutes }, { headers: { "Idempotency-Key": `programme-candidate-materialize:${submissionId}:${durationMinutes}` } } as any),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["session-builder-snapshot", eventId] });
      queryClient.invalidateQueries({ queryKey: ["sessions", eventId] });
      toast.success(data?.message || "Accepted content added to the schedule queue");
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail?.message || err?.response?.data?.detail || "Unable to add accepted content"),
  });
}

export interface ScheduleRevision {
  id: string;
  revision_number: number;
  label?: string | null;
  reason?: string | null;
  checksum: string;
  created_at: string;
}

export function useScheduleRevisions(eventId: string) {
  return useQuery({
    queryKey: ["session-builder-revisions", eventId],
    queryFn: () => apiGet<ScheduleRevision[]>(`/events/${eventId}/sessions/revisions`),
    enabled: !!eventId && eventId !== "undefined",
    staleTime: 15_000,
  });
}

export function useSchedulePreview(eventId: string, enabled = false) {
  return useQuery({
    queryKey: ["schedule-preview", eventId],
    queryFn: () => apiGet<{ publication_status: string; publication_ready: boolean; sessions: Array<{ id: string; code: string; title: string; type: string; starts_at: string; ends_at: string; room?: string | null; track?: string | null; published: boolean; status: string }>; conflicts: Array<{ type: string; description: string; severity: string }> }>(`/events/${eventId}/sessions/schedule-preview`),
    enabled: Boolean(eventId) && enabled,
  });
}

export interface ScheduleAnnouncementRequest {
  template_id: string;
  recipient_filter?: "all" | "paid" | "pending";
  target_type?: "participant" | "speaker";
  scheduled_at?: string | null;
}

export function useScheduleAnnouncement(eventId: string) {
  return useMutation({
    mutationFn: (payload: ScheduleAnnouncementRequest) => apiPost<{ campaign_id: string; status: string }>(
      `/events/${eventId}/sessions/schedule-announcement`,
      payload,
      { headers: { "Idempotency-Key": `programme-schedule-announcement:${eventId}:${payload.template_id}:${payload.scheduled_at || "immediate"}` } } as any,
    ),
    onSuccess: () => toast.success("Schedule announcement queued through the durable campaign outbox."),
    onError: (err: any) => toast.error(err?.response?.data?.detail?.message || err?.response?.data?.detail || "Unable to queue schedule announcement"),
  });
}

export function useCreateScheduleCheckpoint(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ label, reason }: { label?: string; reason?: string }) => apiPost<ScheduleRevision>(`/events/${eventId}/sessions/revisions`, { label, reason }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["session-builder-revisions", eventId] }); toast.success("Schedule checkpoint saved"); },
    onError: () => toast.error("Unable to save schedule checkpoint"),
  });
}

export function useRestoreScheduleRevision(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (revisionId: string) => apiPost<ScheduleRevision>(`/events/${eventId}/sessions/revisions/${revisionId}/restore`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["session-builder-snapshot", eventId] });
      queryClient.invalidateQueries({ queryKey: ["session-builder-revisions", eventId] });
      toast.success("Schedule restored. A safety checkpoint was saved first.");
    },
    onError: () => toast.error("Unable to restore this checkpoint"),
  });
}



