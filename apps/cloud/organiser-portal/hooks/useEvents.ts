import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api-client";
import { EventSummary, EventResponse } from "@/types/backend";

export function useEvents(filters?: { status?: string; search?: string }) {
  return useQuery({
    queryKey: ["events", filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters?.status) params.append("status", filters.status);
      if (filters?.search) params.append("search", filters.search);
      const queryString = params.toString();
      return apiGet<EventSummary[]>(`/events${queryString ? `?${queryString}` : ""}`);
    },
  });
}

export function useEvent(eventId: string) {
  return useQuery({
    queryKey: ["event", eventId],
    queryFn: () => apiGet<EventResponse>(`/events/${eventId}`),
    enabled: !!eventId,
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => apiPost<EventResponse>("/events", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });
}

export function useUpdateEvent(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => apiPatch<EventResponse>(`/events/${eventId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["event", eventId] });
    },
  });
}

export function useDashboardStats(eventId?: string) {
  return useQuery({
    queryKey: ['dashboard-stats', eventId],
    queryFn: () => apiGet<any>(`/events/${eventId}/analytics/dashboard`),
    enabled: !!eventId,
    refetchInterval: 30000,
  });
}

export function useGlobalStats() {
  return useQuery({
    queryKey: ['global-stats'],
    queryFn: () => apiGet<any>(`/analytics/summary`),
    refetchInterval: 60000,
  });
}

export function useActivity(eventId?: string, limit: number = 10) {
  return useQuery({
    queryKey: ['activity', eventId, limit],
    queryFn: () => apiGet<any[]>(`/events/${eventId}/analytics/activity`, { params: { limit } }),
    enabled: !!eventId,
    refetchInterval: 15000,
  });
}
export function useDeleteEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) => apiDelete(`/events/${eventId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });
}

// ── New analytics hooks ────────────────────────────────────────

export function useMainDashboardStats(eventId?: string) {
  return useQuery({
    queryKey: ["main-dashboard-stats", eventId],
    queryFn: () => apiGet<any>(`/events/${eventId}/analytics/main-dashboard`),
    enabled: !!eventId,
    refetchInterval: 30000,
  });
}

export function useApprovalTimes(eventId?: string) {
  return useQuery({
    queryKey: ["approval-times", eventId],
    queryFn: () => apiGet<any[]>(`/events/${eventId}/analytics/approval-times`),
    enabled: !!eventId,
    staleTime: 60_000,
  });
}

export function useFileFormats(eventId?: string) {
  return useQuery({
    queryKey: ["file-formats", eventId],
    queryFn: () => apiGet<any[]>(`/events/${eventId}/analytics/formats`),
    enabled: !!eventId,
    staleTime: 60_000,
  });
}

export function useRoomBreakdown(eventId?: string) {
  return useQuery({
    queryKey: ["room-breakdown", eventId],
    queryFn: () => apiGet<any[]>(`/events/${eventId}/analytics/rooms/breakdown`),
    enabled: !!eventId,
    staleTime: 60_000,
  });
}

/** Triggers a file download by creating a temporary anchor element. */
export function useExportDownload(eventId: string) {
  return async (format: "csv" | "xlsx" | "pdf") => {
    // We need the bearer token for the download URL
    const storage = typeof window !== "undefined"
      ? localStorage.getItem("obsidian-auth-storage")
      : null;
    const token = storage ? JSON.parse(storage)?.state?.accessToken : null;

    const apiBase = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000") + "/api/v1";
    const url = `${apiBase}/events/${eventId}/analytics/export?format=${format}`;

    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!res.ok) throw new Error(`Export failed: ${res.statusText}`);

    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    // Derive filename from Content-Disposition header if present
    const cd = res.headers.get("Content-Disposition") || "";
    const match = cd.match(/filename="?([^"]+)"?/);
    a.download = match ? match[1] : `analytics.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  };
}

export function useDashboardSummary(eventId?: string, liveMode: boolean = false) {
  return useQuery({
    queryKey: ["dashboard-summary", eventId, liveMode],
    queryFn: () => apiGet<any>("/dashboard/summary", { params: { event_id: eventId } }),
    enabled: !!eventId,
    staleTime: liveMode ? 0 : 5 * 60 * 1000,
    refetchInterval: liveMode ? 15000 : false,
  });
}

export function useRegistrationsTimeline(eventId?: string) {
  return useQuery({
    queryKey: ["dashboard-timeline", eventId],
    queryFn: () => apiGet<any[]>("/dashboard/registrations/timeline", { params: { event_id: eventId } }),
    enabled: !!eventId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useRolesBreakdown(eventId?: string) {
  return useQuery({
    queryKey: ["dashboard-roles-breakdown", eventId],
    queryFn: () => apiGet<any[]>("/dashboard/roles-breakdown", { params: { event_id: eventId } }),
    enabled: !!eventId,
    staleTime: 5 * 60 * 1000,
  });
}

export function usePendingActions(eventId?: string, liveMode: boolean = false) {
  return useQuery({
    queryKey: ["dashboard-pending-actions", eventId, liveMode],
    queryFn: () => apiGet<any[]>("/dashboard/pending-actions", { params: { event_id: eventId } }),
    enabled: !!eventId,
    staleTime: liveMode ? 0 : 5 * 60 * 1000,
    refetchInterval: liveMode ? 15000 : false,
  });
}

export function useRecentActivity(eventId?: string, liveMode: boolean = false) {
  return useQuery({
    queryKey: ["dashboard-recent-activity", eventId, liveMode],
    queryFn: () => apiGet<any[]>("/dashboard/recent-activity", { params: { event_id: eventId } }),
    enabled: !!eventId,
    staleTime: liveMode ? 0 : 5 * 60 * 1000,
    refetchInterval: liveMode ? 15000 : false,
  });
}

export function useUpcomingDeadlines(eventId?: string) {
  return useQuery({
    queryKey: ["dashboard-deadlines", eventId],
    queryFn: () => apiGet<any[]>("/dashboard/deadlines", { params: { event_id: eventId } }),
    enabled: !!eventId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useBillingPlan() {
  return useQuery({
    queryKey: ["billing-plan"],
    queryFn: () => apiGet<any>("/billing/plan"),
    staleTime: 5 * 60 * 1000,
  });
}

