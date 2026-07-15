import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { useAuthStore } from "@/store/use-auth-store";

export interface PosterSummary {
  id: string;
  event_id: string;
  speaker_id?: string;
  speaker_name?: string;
  speaker_email?: string;
  reviewed_by?: string;
  title: string;
  authors?: string;
  category?: string;
  abstract?: string;
  storage_path?: string;
  original_filename?: string;
  file_size_bytes?: number;
  thumbnail_url?: string;
  status: "pending" | "submitted" | "under_review" | "approved" | "rejected" | "withdrawn";
  rejection_reason?: string;
  reviewed_at?: string;
  display_screen?: string;
  display_order: number;
  is_featured: boolean;
  version_number: number;
  session_id?: string;
  submitted_at: string;
  created_at: string;
}

export interface PosterFilters {
  status?: string;
  screen?: string;
  featured_only?: boolean;
}

export function usePosters(eventId: string, filters?: PosterFilters) {
  const organizationId = useAuthStore((state) => state.user?.organization_id);
  return useQuery({
    queryKey: queryKeys.events.posters(organizationId, eventId, filters),
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters?.status) params.append("status", filters.status);
      if (filters?.screen) params.append("screen", filters.screen);
      if (filters?.featured_only) params.append("featured_only", String(filters.featured_only));
      const queryString = params.toString();
      return apiGet<PosterSummary[]>(
        `/events/${eventId}/posters${queryString ? `?${queryString}` : ""}`
      );
    },
    enabled: !!eventId && eventId !== "undefined" && eventId !== "[eventId]",
  });
}

export function usePoster(eventId: string, posterId: string | null) {
  const organizationId = useAuthStore((state) => state.user?.organization_id);
  return useQuery({
    queryKey: queryKeys.events.poster(organizationId, eventId, posterId),
    queryFn: () => apiGet<PosterSummary>(`/events/${eventId}/posters/${posterId}`),
    enabled: !!eventId && eventId !== "undefined" && eventId !== "[eventId]" && !!posterId,
  });
}

export function useSchedulePoster(eventId: string) {
  const queryClient = useQueryClient();
  const organizationId = useAuthStore((state) => state.user?.organization_id);
  return useMutation({
    mutationFn: ({
      posterId,
      data,
    }: {
      posterId: string;
      data: {
        display_screen: string;
        display_order?: number;
        is_featured?: boolean;
      };
    }) => apiPost(`/events/${eventId}/posters/${posterId}/schedule`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events.posters(organizationId, eventId) });
    },
  });
}

export function useUnschedulePoster(eventId: string) {
  const queryClient = useQueryClient();
  const organizationId = useAuthStore((state) => state.user?.organization_id);
  return useMutation({
    mutationFn: (posterId: string) =>
      apiDelete(`/events/${eventId}/posters/${posterId}/schedule`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events.posters(organizationId, eventId) });
    },
  });
}

export function useUpdatePoster(eventId: string) {
  const queryClient = useQueryClient();
  const organizationId = useAuthStore((state) => state.user?.organization_id);
  return useMutation({
    mutationFn: ({
      posterId,
      data,
    }: {
      posterId: string;
      data: Partial<PosterSummary>;
    }) => apiPatch(`/events/${eventId}/posters/${posterId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events.posters(organizationId, eventId) });
    },
  });
}

export function useDeletePoster(eventId: string) {
  const queryClient = useQueryClient();
  const organizationId = useAuthStore((state) => state.user?.organization_id);
  return useMutation({
    mutationFn: (posterId: string) => apiDelete(`/events/${eventId}/posters/${posterId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events.posters(organizationId, eventId) });
    },
  });
}

export function useBatchUpdatePostersStatus(eventId: string) {
  const queryClient = useQueryClient();
  const organizationId = useAuthStore((state) => state.user?.organization_id);
  return useMutation({
    mutationFn: ({
      poster_ids,
      status,
    }: {
      poster_ids: string[];
      status: string;
    }) => apiPost(`/events/${eventId}/posters/batch-status`, { poster_ids, status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events.posters(organizationId, eventId) });
    },
  });
}

export function useBatchDeletePosters(eventId: string) {
  const queryClient = useQueryClient();
  const organizationId = useAuthStore((state) => state.user?.organization_id);
  return useMutation({
    mutationFn: (posterIds: string[]) => apiPost(`/events/${eventId}/posters/batch-delete`, { poster_ids: posterIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events.posters(organizationId, eventId) });
    },
  });
}

export function useBatchSchedulePosters(eventId: string) {
  const queryClient = useQueryClient();
  const organizationId = useAuthStore((state) => state.user?.organization_id);
  return useMutation({
    mutationFn: (assignments: Record<string, string[]>) =>
      apiPost(`/events/${eventId}/posters/batch-schedule`, { assignments }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events.posters(organizationId, eventId) });
    },
  });
}

export function usePosterCategories(eventId: string) {
  const organizationId = useAuthStore((state) => state.user?.organization_id);
  return useQuery({
    queryKey: queryKeys.events.posterCategories(organizationId, eventId),
    queryFn: () => apiGet<string[]>(`/events/${eventId}/posters/categories`),
    enabled: !!eventId && eventId !== "undefined" && eventId !== "[eventId]",
  });
}

export function useReviewPoster(eventId: string) {
  const queryClient = useQueryClient();
  const organizationId = useAuthStore((state) => state.user?.organization_id);
  return useMutation({
    mutationFn: ({ 
      posterId, 
      decision, 
      rejection_reason 
    }: { 
      posterId: string; 
      decision: "approved" | "rejected"; 
      rejection_reason?: string 
    }) => apiPost(`/events/${eventId}/posters/${posterId}/review`, { decision, rejection_reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events.posters(organizationId, eventId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.events.files(organizationId, eventId) });
    },
  });
}

export function useDownloadPoster(eventId: string) {
  return useMutation({
    mutationFn: async (posterId: string) => {
      const data = await apiGet<{ download_url: string }>(`/events/${eventId}/posters/${posterId}/download`);
      window.open(data.download_url, '_blank');
      return data;
    }
  });
}
