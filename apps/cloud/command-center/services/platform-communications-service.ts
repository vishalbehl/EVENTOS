"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

export interface GlobalAnnouncement {
  id: string;
  title: string;
  content: string;
  is_active: boolean;
  created_at: string;
}

export interface GlobalAnnouncementPayload {
  title: string;
  content: string;
  is_active: boolean;
}

export interface MaintenanceWindow {
  id: string;
  title: string;
  description?: string | null;
  starts_at: string;
  ends_at: string;
  affected_services?: string[] | null;
  status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  notification_sent: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface MaintenanceWindowPayload {
  title: string;
  description?: string | null;
  starts_at: string;
  ends_at: string;
  affected_services?: string[] | null;
  status: MaintenanceWindow["status"];
}

export const platformCommunicationKeys = {
  announcements: () => queryKeys.admin.domain("platform-announcements"),
  announcement: (announcementId?: string) => queryKeys.admin.domain("platform-announcement", { announcementId }),
  maintenanceWindows: () => queryKeys.admin.domain("platform-maintenance-windows"),
};

export function useGlobalAnnouncements() {
  return useQuery({
    queryKey: platformCommunicationKeys.announcements(),
    queryFn: () => apiClient.get<GlobalAnnouncement[]>("/platform/communications/announcements"),
  });
}

export function useGlobalAnnouncement(announcementId?: string) {
  return useQuery({
    queryKey: platformCommunicationKeys.announcement(announcementId),
    queryFn: () => apiClient.get<GlobalAnnouncement>(`/platform/communications/announcements/${announcementId}`),
    enabled: Boolean(announcementId),
  });
}

export function useCreateGlobalAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: GlobalAnnouncementPayload) =>
      apiClient.post<GlobalAnnouncement>("/platform/communications/announcements", payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.admin.all }),
  });
}

export function useUpdateGlobalAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ announcementId, payload }: { announcementId: string; payload: Partial<GlobalAnnouncementPayload> }) =>
      apiClient.patch<GlobalAnnouncement>(`/platform/communications/announcements/${announcementId}`, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: platformCommunicationKeys.announcements() });
      queryClient.invalidateQueries({ queryKey: platformCommunicationKeys.announcement(variables.announcementId) });
    },
  });
}

export function useDeleteGlobalAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ announcementId, reason }: { announcementId: string; reason: string }) =>
      apiClient.delete(`/platform/communications/announcements/${announcementId}`, { data: { reason } }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: platformCommunicationKeys.announcements() });
      queryClient.invalidateQueries({ queryKey: platformCommunicationKeys.announcement(variables.announcementId) });
    },
  });
}

export function useMaintenanceWindows() {
  return useQuery({
    queryKey: platformCommunicationKeys.maintenanceWindows(),
    queryFn: () => apiClient.get<MaintenanceWindow[]>("/platform/communications/maintenance-windows"),
  });
}

export function useCreateMaintenanceWindow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: MaintenanceWindowPayload) =>
      apiClient.post<MaintenanceWindow>("/platform/communications/maintenance-windows", payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: platformCommunicationKeys.maintenanceWindows() }),
  });
}

export function useUpdateMaintenanceWindow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ windowId, payload }: { windowId: string; payload: Partial<MaintenanceWindowPayload> & { notification_sent?: boolean } }) =>
      apiClient.patch<MaintenanceWindow>(`/platform/communications/maintenance-windows/${windowId}`, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: platformCommunicationKeys.maintenanceWindows() }),
  });
}

export function useDeleteMaintenanceWindow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ windowId, reason }: { windowId: string; reason: string }) =>
      apiClient.delete(`/platform/communications/maintenance-windows/${windowId}`, { data: { reason } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: platformCommunicationKeys.maintenanceWindows() }),
  });
}
