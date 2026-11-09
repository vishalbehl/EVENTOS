import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api-client";
import { EventSummary, EventResponse } from "@/types/backend";
import { accessContextCacheKey, useAuthStore } from "@/store/use-auth-store";
import { useRef } from "react";

function useAccessQueryScope() {
  const {
    user,
    activeContext,
    hasHydrated,
    isAuthenticated,
    isContextSwitching,
  } = useAuthStore();
  return {
    key: `${user?.id ?? "anonymous"}:${accessContextCacheKey(activeContext, user?.organization_id)}`,
    enabled: hasHydrated && isAuthenticated && !isContextSwitching,
  };
}

export function useEvents(
  filters?: { status?: string; search?: string; page_size?: number },
  enabled = true,
) {
  const {
    user,
    activeContext,
    hasHydrated,
    isAuthenticated,
    isContextSwitching,
  } = useAuthStore();
  const contextKey = accessContextCacheKey(
    activeContext,
    user?.organization_id,
  );

  return useQuery({
    queryKey: ["events", contextKey, filters],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams();
      if (filters?.status) params.append("status", filters.status);
      if (filters?.search) params.append("search", filters.search);
      params.append("page_size", String(filters?.page_size || 100));
      const queryString = params.toString();
      const res = await apiGet<any>(
        `/events${queryString ? `?${queryString}` : ""}`,
        { signal },
      );
      if (Array.isArray(res)) return res as EventSummary[];
      if (Array.isArray(res?.items)) return res.items as EventSummary[];
      if (Array.isArray(res?.data)) return res.data as EventSummary[];
      return [] as EventSummary[];
    },
    enabled: enabled && hasHydrated && isAuthenticated && !isContextSwitching,
  });
}

export function useEvent(eventId: string) {
  const {
    user,
    activeContext,
    hasHydrated,
    isAuthenticated,
    isContextSwitching,
  } = useAuthStore();
  const contextKey = accessContextCacheKey(
    activeContext,
    user?.organization_id,
  );

  return useQuery({
    queryKey: ["event", contextKey, eventId],
    queryFn: ({ signal }) =>
      apiGet<EventResponse>(`/events/${eventId}`, { signal }),
    enabled: hasHydrated && isAuthenticated && !isContextSwitching && !!eventId,
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  const { user, activeContext } = useAuthStore();
  const contextKey = accessContextCacheKey(
    activeContext,
    user?.organization_id,
  );
  const receipt = useRef<{ fingerprint: string; key: string } | null>(null);
  return useMutation({
    mutationFn: (data: any) => {
      const fingerprint = JSON.stringify([user?.id, contextKey, data]);
      if (receipt.current?.fingerprint !== fingerprint) {
        receipt.current = { fingerprint, key: crypto.randomUUID() };
      }
      return apiPost<EventResponse>("/events", data, {
        headers: { "Idempotency-Key": receipt.current.key },
      });
    },
    onSuccess: () => {
      receipt.current = null;
      queryClient.invalidateQueries({ queryKey: ["events", contextKey] });
    },
  });
}

export function useUpdateEvent(
  eventId: string,
  expectedVersion: number | null,
) {
  const queryClient = useQueryClient();
  const { user, activeContext } = useAuthStore();
  const contextKey = accessContextCacheKey(
    activeContext,
    user?.organization_id,
  );
  const receipt = useRef<{ fingerprint: string; key: string } | null>(null);
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => {
      if (!Number.isInteger(expectedVersion) || Number(expectedVersion) < 1) {
        throw new Error(
          "Reload current event details before saving; no valid version is available.",
        );
      }
      const fingerprint = JSON.stringify([
        user?.id,
        contextKey,
        eventId,
        expectedVersion,
        data,
      ]);
      if (receipt.current?.fingerprint !== fingerprint) {
        receipt.current = { fingerprint, key: crypto.randomUUID() };
      }
      return apiPatch<EventResponse>(`/events/${eventId}`, data, {
        headers: {
          "Idempotency-Key": receipt.current.key,
          "If-Match": String(expectedVersion),
        },
      });
    },
    retry: false,
    onSuccess: () => {
      receipt.current = null;
      queryClient.invalidateQueries({ queryKey: ["events", contextKey] });
      queryClient.invalidateQueries({
        queryKey: ["event", contextKey, eventId],
      });
    },
  });
}

export function useDashboardStats(eventId?: string) {
  const scope = useAccessQueryScope();
  return useQuery({
    queryKey: ["dashboard-stats", scope.key, eventId],
    queryFn: ({ signal }) =>
      apiGet<any>(`/events/${eventId}/analytics/dashboard`, { signal }),
    enabled: scope.enabled && !!eventId,
    refetchInterval: 30000,
  });
}

export function useGlobalStats() {
  const scope = useAccessQueryScope();
  return useQuery({
    queryKey: ["global-stats", scope.key],
    queryFn: ({ signal }) => apiGet<any>(`/analytics/summary`, { signal }),
    enabled: scope.enabled,
    refetchInterval: 60000,
  });
}

export function useActivity(eventId?: string, limit: number = 10) {
  const scope = useAccessQueryScope();
  return useQuery({
    queryKey: ["activity", scope.key, eventId, limit],
    queryFn: ({ signal }) =>
      apiGet<any[]>(`/events/${eventId}/analytics/activity`, {
        signal,
        params: { limit },
      }),
    enabled: scope.enabled && !!eventId,
    refetchInterval: 15000,
  });
}
export function useDeleteEvent() {
  const queryClient = useQueryClient();
  const { user, activeContext } = useAuthStore();
  const contextKey = accessContextCacheKey(
    activeContext,
    user?.organization_id,
  );
  return useMutation({
    mutationFn: (eventId: string) => apiDelete(`/events/${eventId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events", contextKey] });
    },
  });
}

// ── New analytics hooks ────────────────────────────────────────

export function useMainDashboardStats(eventId?: string) {
  const scope = useAccessQueryScope();
  return useQuery({
    queryKey: ["main-dashboard-stats", scope.key, eventId],
    queryFn: ({ signal }) =>
      apiGet<any>(`/events/${eventId}/analytics/main-dashboard`, { signal }),
    enabled: scope.enabled && !!eventId,
    refetchInterval: 30000,
  });
}

export function useApprovalTimes(eventId?: string) {
  const scope = useAccessQueryScope();
  return useQuery({
    queryKey: ["approval-times", scope.key, eventId],
    queryFn: ({ signal }) =>
      apiGet<any[]>(`/events/${eventId}/analytics/approval-times`, { signal }),
    enabled: scope.enabled && !!eventId,
    staleTime: 60_000,
  });
}

export function useFileFormats(eventId?: string) {
  const scope = useAccessQueryScope();
  return useQuery({
    queryKey: ["file-formats", scope.key, eventId],
    queryFn: ({ signal }) =>
      apiGet<any[]>(`/events/${eventId}/analytics/formats`, { signal }),
    enabled: scope.enabled && !!eventId,
    staleTime: 60_000,
  });
}

export function useRoomBreakdown(eventId?: string) {
  const scope = useAccessQueryScope();
  return useQuery({
    queryKey: ["room-breakdown", scope.key, eventId],
    queryFn: ({ signal }) =>
      apiGet<any[]>(`/events/${eventId}/analytics/rooms/breakdown`, { signal }),
    enabled: scope.enabled && !!eventId,
    staleTime: 60_000,
  });
}

/** Triggers a file download by creating a temporary anchor element. */
export function useExportDownload(eventId: string) {
  return async (format: "csv" | "xlsx" | "pdf") => {
    // Use the shared client so context-switch blocking, stale-token response
    // rejection and safe throttling/unavailable errors also cover downloads.
    const blob = await apiGet<Blob>(`/events/${eventId}/analytics/export`, {
      params: { format },
      responseType: "blob",
    });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `analytics.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  };
}

export function useDashboardSummary(
  eventId?: string,
  liveMode: boolean = false,
) {
  const scope = useAccessQueryScope();
  return useQuery({
    queryKey: ["dashboard-summary", scope.key, eventId, liveMode],
    queryFn: ({ signal }) =>
      apiGet<any>("/dashboard/summary", {
        signal,
        params: { event_id: eventId },
      }),
    enabled: scope.enabled && !!eventId,
    staleTime: liveMode ? 0 : 5 * 60 * 1000,
    refetchInterval: liveMode ? 15000 : false,
  });
}

export function useRegistrationsTimeline(eventId?: string) {
  const scope = useAccessQueryScope();
  return useQuery({
    queryKey: ["dashboard-timeline", scope.key, eventId],
    queryFn: ({ signal }) =>
      apiGet<any[]>("/dashboard/registrations/timeline", {
        signal,
        params: { event_id: eventId },
      }),
    enabled: scope.enabled && !!eventId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useRolesBreakdown(eventId?: string) {
  const scope = useAccessQueryScope();
  return useQuery({
    queryKey: ["dashboard-roles-breakdown", scope.key, eventId],
    queryFn: ({ signal }) =>
      apiGet<any[]>("/dashboard/roles-breakdown", {
        signal,
        params: { event_id: eventId },
      }),
    enabled: scope.enabled && !!eventId,
    staleTime: 5 * 60 * 1000,
  });
}

export function usePendingActions(eventId?: string, liveMode: boolean = false) {
  const scope = useAccessQueryScope();
  return useQuery({
    queryKey: ["dashboard-pending-actions", scope.key, eventId, liveMode],
    queryFn: ({ signal }) =>
      apiGet<any[]>("/dashboard/pending-actions", {
        signal,
        params: { event_id: eventId },
      }),
    enabled: scope.enabled && !!eventId,
    staleTime: liveMode ? 0 : 5 * 60 * 1000,
    refetchInterval: liveMode ? 15000 : false,
  });
}

export function useRecentActivity(eventId?: string, liveMode: boolean = false) {
  const scope = useAccessQueryScope();
  return useQuery({
    queryKey: ["dashboard-recent-activity", scope.key, eventId, liveMode],
    queryFn: ({ signal }) =>
      apiGet<any[]>("/dashboard/recent-activity", {
        signal,
        params: { event_id: eventId },
      }),
    enabled: scope.enabled && !!eventId,
    staleTime: liveMode ? 0 : 5 * 60 * 1000,
    refetchInterval: liveMode ? 15000 : false,
  });
}

export function useUpcomingDeadlines(eventId?: string) {
  const scope = useAccessQueryScope();
  return useQuery({
    queryKey: ["dashboard-deadlines", scope.key, eventId],
    queryFn: ({ signal }) =>
      apiGet<any[]>("/dashboard/deadlines", {
        signal,
        params: { event_id: eventId },
      }),
    enabled: scope.enabled && !!eventId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useBillingPlan() {
  const scope = useAccessQueryScope();
  return useQuery({
    queryKey: ["billing-plan", scope.key],
    queryFn: ({ signal }) => apiGet<any[]>("/commercial/contracts", { signal }),
    enabled: scope.enabled,
    staleTime: 5 * 60 * 1000,
  });
}
