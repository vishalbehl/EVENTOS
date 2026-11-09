import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";

export type ProgrammeLifecycle = {
  event_id: string;
  call_status: string | null;
  submissions: Record<string, number>;
  reviewers: Record<string, number>;
  speakers: { TOTAL: number };
  schedule: {
    total_sessions: number;
    scheduled_sessions: number;
    publication_status: string;
    embed_enabled: boolean;
    json_feed_enabled: boolean;
  };
  actions: Array<{ severity: "info" | "warning" | "critical"; label: string; destination: string }>;
};

export function useProgrammeLifecycle(eventId: string) {
  return useQuery({
    queryKey: ["programme-lifecycle", eventId],
    queryFn: () => apiGet<ProgrammeLifecycle>(`/events/${eventId}/programme/lifecycle`),
    enabled: Boolean(eventId) && eventId !== "undefined",
    staleTime: 15_000,
  });
}
