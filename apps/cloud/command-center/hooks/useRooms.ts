import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api-client";

export interface RoomSummary {
  id: string;
  event_id: string;
  name: string;
  capacity?: number;
  screen_count: number;
  room_type: string;
  av_technician?: string;
  location_notes?: string;
  is_active: boolean;
  created_at: string;
  // Computed fields from merged analytics
  sessions_count?: number;
  readiness?: number;
  speaker_count?: number;
  files_approved?: number;
}

export interface RoomAnalytics {
  room_id: string;
  room_name: string;
  session_count: number;
  speaker_count: number;
  files_approved: number;
  readiness_pct: number;
}

export interface RoomDevice {
  id: string;
  device_type: string;
  device_name: string;
  status: 'online' | 'offline' | 'error' | 'maintenance';
  last_heartbeat_at?: string;
}

export function useRooms(eventId: string) {
  return useQuery({
    queryKey: ["rooms", eventId],
    queryFn: () => apiGet<RoomSummary[]>(`/events/${eventId}/rooms`),
    enabled: !!eventId && eventId !== "undefined" && eventId !== "[eventId]",
  });
}

export function useRoomAnalytics(eventId: string) {
  return useQuery({
    queryKey: ["room-analytics", eventId],
    queryFn: () => apiGet<RoomAnalytics[]>(`/events/${eventId}/analytics/rooms`),
    enabled: !!eventId && eventId !== "undefined" && eventId !== "[eventId]",
  });
}

export function useRoomDevices(eventId: string, roomId: string) {
  return useQuery({
    queryKey: ["room-devices", eventId, roomId],
    queryFn: () => apiGet<RoomDevice[]>(`/events/${eventId}/rooms/${roomId}/devices`),
    enabled: !!eventId && eventId !== "undefined" && eventId !== "[eventId]" && !!roomId,
  });
}

export function useCreateRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, data }: { eventId: string, data: any }) => 
      apiPost(`/events/${eventId}/rooms`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["rooms", variables.eventId] });
    },
  });
}

export function useUpdateRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, roomId, data }: { eventId: string, roomId: string, data: any }) => 
      apiPatch(`/events/${eventId}/rooms/${roomId}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["rooms", variables.eventId] });
    },
  });
}

export function useDeleteRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, roomId }: { eventId: string, roomId: string }) => 
      apiDelete(`/events/${eventId}/rooms/${roomId}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["rooms", variables.eventId] });
    },
  });
}
