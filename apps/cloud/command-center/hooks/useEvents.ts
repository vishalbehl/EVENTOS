import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete, apiDownload, saveDownloadedFile } from "@/lib/api-client";
import { EventSummary, EventResponse } from "@/types/backend";
import { useAuthStore } from "@/store/use-auth-store";
import { queryKeys } from "@/lib/query-keys";

function useEventScope(eventId?: string) {
  const organizationId = useAuthStore((state) => state.user?.organization_id);
  return { organizationId, eventId: eventId || "global" };
}

export function useEvents(filters?: { status?: string; search?: string }) {
  const { user, hasHydrated, isAuthenticated } = useAuthStore();
  const orgId = user?.organization_id ?? null;

  return useQuery({
    queryKey: queryKeys.events.list(orgId, filters),
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters?.status) params.append("status", filters.status);
      if (filters?.search) params.append("search", filters.search);
      const queryString = params.toString();
      return apiGet<EventSummary[]>(`/events${queryString ? `?${queryString}` : ""}`);
    },
    enabled: hasHydrated && isAuthenticated,
  });
}

export function useEvent(eventId: string) {
  const { user, hasHydrated, isAuthenticated } = useAuthStore();
  const orgId = user?.organization_id ?? null;

  return useQuery({
    queryKey: queryKeys.events.detail(orgId, eventId),
    queryFn: () => apiGet<EventResponse>(`/events/${eventId}`),
    enabled: hasHydrated && isAuthenticated && !!eventId,
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  const organizationId = useAuthStore((state) => state.user?.organization_id);
  return useMutation({
    mutationFn: (data: any) => apiPost<EventResponse>("/events", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events.all(organizationId) });
    },
  });
}

export function useUpdateEvent(eventId: string) {
  const queryClient = useQueryClient();
  const organizationId = useAuthStore((state) => state.user?.organization_id);
  return useMutation({
    mutationFn: (data: any) => apiPatch<EventResponse>(`/events/${eventId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events.all(organizationId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.events.detail(organizationId, eventId) });
    },
  });
}

export function useDashboardStats(eventId?: string) {
  const scope = useEventScope(eventId);
  return useQuery({
    queryKey: queryKeys.events.analytics(scope.organizationId, scope.eventId, "dashboard"),
    queryFn: () => apiGet<any>(`/events/${eventId}/analytics/dashboard`),
    enabled: !!eventId,
    refetchInterval: 30000,
  });
}

export function useGlobalStats() {
  const organizationId = useAuthStore((state) => state.user?.organization_id);
  return useQuery({
    queryKey: queryKeys.admin.domain("global-analytics", { organizationId }),
    queryFn: () => apiGet<any>(`/analytics/summary`),
    refetchInterval: 60000,
  });
}

export function useActivity(eventId?: string, limit: number = 10) {
  const scope = useEventScope(eventId);
  return useQuery({
    queryKey: queryKeys.events.analytics(scope.organizationId, scope.eventId, "activity", { limit }),
    queryFn: () => apiGet<any[]>(`/events/${eventId}/analytics/activity`, { params: { limit } }),
    enabled: !!eventId,
    refetchInterval: 15000,
  });
}
export function useDeleteEvent() {
  const queryClient = useQueryClient();
  const organizationId = useAuthStore((state) => state.user?.organization_id);
  return useMutation({
    mutationFn: (eventId: string) => apiDelete(`/events/${eventId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events.all(organizationId) });
    },
  });
}

// ── New analytics hooks ────────────────────────────────────────

export function useMainDashboardStats(eventId?: string) {
  const scope = useEventScope(eventId);
  return useQuery({
    queryKey: queryKeys.events.analytics(scope.organizationId, scope.eventId, "main-dashboard"),
    queryFn: () => apiGet<any>(`/events/${eventId}/analytics/main-dashboard`),
    enabled: !!eventId,
    refetchInterval: 30000,
  });
}

export function useApprovalTimes(eventId?: string) {
  const scope = useEventScope(eventId);
  return useQuery({
    queryKey: queryKeys.events.analytics(scope.organizationId, scope.eventId, "approval-times"),
    queryFn: () => apiGet<any[]>(`/events/${eventId}/analytics/approval-times`),
    enabled: !!eventId,
    staleTime: 60_000,
  });
}

export function useFileFormats(eventId?: string) {
  const scope = useEventScope(eventId);
  return useQuery({
    queryKey: queryKeys.events.analytics(scope.organizationId, scope.eventId, "file-formats"),
    queryFn: () => apiGet<any[]>(`/events/${eventId}/analytics/formats`),
    enabled: !!eventId,
    staleTime: 60_000,
  });
}

export function useRoomBreakdown(eventId?: string) {
  const scope = useEventScope(eventId);
  return useQuery({
    queryKey: queryKeys.events.analytics(scope.organizationId, scope.eventId, "room-breakdown"),
    queryFn: () => apiGet<any[]>(`/events/${eventId}/analytics/rooms/breakdown`),
    enabled: !!eventId,
    staleTime: 60_000,
  });
}

/** Triggers a file download by creating a temporary anchor element. */
export function useExportDownload(eventId: string) {
  return async (format: "csv" | "xlsx" | "pdf") => {
    const file = await apiDownload(`/events/${eventId}/analytics/export`, { params: { format } });
    saveDownloadedFile(file, `analytics.${format}`);
  };
}

export function useDashboardSummary(eventId?: string, liveMode: boolean = false) {
  const scope = useEventScope(eventId);
  return useQuery({
    queryKey: queryKeys.events.analytics(scope.organizationId, scope.eventId, "summary", { liveMode }),
    queryFn: () => apiGet<any>("/dashboard/summary", { params: { event_id: eventId } }),
    enabled: !!eventId,
    staleTime: liveMode ? 0 : 5 * 60 * 1000,
    refetchInterval: liveMode ? 15000 : false,
  });
}

export function useRegistrationsTimeline(eventId?: string) {
  const scope = useEventScope(eventId);
  return useQuery({
    queryKey: queryKeys.events.analytics(scope.organizationId, scope.eventId, "registrations-timeline"),
    queryFn: () => apiGet<any[]>("/dashboard/registrations/timeline", { params: { event_id: eventId } }),
    enabled: !!eventId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useRolesBreakdown(eventId?: string) {
  const scope = useEventScope(eventId);
  return useQuery({
    queryKey: queryKeys.events.analytics(scope.organizationId, scope.eventId, "roles-breakdown"),
    queryFn: () => apiGet<any[]>("/dashboard/roles-breakdown", { params: { event_id: eventId } }),
    enabled: !!eventId,
    staleTime: 5 * 60 * 1000,
  });
}

export function usePendingActions(eventId?: string, liveMode: boolean = false) {
  const scope = useEventScope(eventId);
  return useQuery({
    queryKey: queryKeys.events.analytics(scope.organizationId, scope.eventId, "pending-actions", { liveMode }),
    queryFn: () => apiGet<any[]>("/dashboard/pending-actions", { params: { event_id: eventId } }),
    enabled: !!eventId,
    staleTime: liveMode ? 0 : 5 * 60 * 1000,
    refetchInterval: liveMode ? 15000 : false,
  });
}

export function useRecentActivity(eventId?: string, liveMode: boolean = false) {
  const scope = useEventScope(eventId);
  return useQuery({
    queryKey: queryKeys.events.analytics(scope.organizationId, scope.eventId, "recent-activity", { liveMode }),
    queryFn: () => apiGet<any[]>("/dashboard/recent-activity", { params: { event_id: eventId } }),
    enabled: !!eventId,
    staleTime: liveMode ? 0 : 5 * 60 * 1000,
    refetchInterval: liveMode ? 15000 : false,
  });
}

export function useUpcomingDeadlines(eventId?: string) {
  const scope = useEventScope(eventId);
  return useQuery({
    queryKey: queryKeys.events.analytics(scope.organizationId, scope.eventId, "deadlines"),
    queryFn: () => apiGet<any[]>("/dashboard/deadlines", { params: { event_id: eventId } }),
    enabled: !!eventId,
    staleTime: 5 * 60 * 1000,
  });
}

