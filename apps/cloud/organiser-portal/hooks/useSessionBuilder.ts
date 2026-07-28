"use client";

import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, apiPost } from "@/lib/api-client";
import { toast } from "sonner";
import { useSessionBuilderStore, BuilderSession } from "@/store/useSessionBuilderStore";

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

  return useMutation({
    mutationFn: (items: Array<{ session_id: string; room_id: string | null; start_time: string; end_time: string; sort_order?: number }>) => {
      setIsSaving(true);
      return apiPatch(`/events/${eventId}/sessions/bulk-reorder`, { items });
    },
    onSuccess: () => {
      markSaved();
      queryClient.invalidateQueries({ queryKey: ["sessions", eventId] });
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
    mutationFn: ({ sessionId, offsetMinutes = 0, newRoomId = null, includeSpeakers = true }: { sessionId: string; offsetMinutes?: number; newRoomId?: string | null; includeSpeakers?: boolean }) =>
      apiPost(`/events/${eventId}/sessions/${sessionId}/duplicate`, {
        offset_minutes: offsetMinutes,
        new_room_id: newRoomId,
        include_speakers: includeSpeakers,
      }),
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
      const items = sessions.map((s) => ({
        session_id: s.id,
        room_id: s.room_id || null,
        start_time: s.start_time,
        end_time: s.end_time,
        sort_order: s.sort_order || 0,
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
