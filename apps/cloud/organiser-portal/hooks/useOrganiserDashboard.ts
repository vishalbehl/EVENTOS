import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import type { AttentionItem } from "@/components/organizer/workspace/OrganiserPrimitives";

export type OrganiserDashboardEvent = {
  id: string;
  name: string;
  short_code: string;
  dates: string;
  venue: string;
  registrations: number;
  revenue: number;
  readiness_pct: number;
  status: string;
};

export type OrganiserDashboard = {
  organization: {
    id: string;
    name: string;
    slug?: string | null;
    is_internal_unrestricted?: boolean;
  };
  metrics: {
    active_events: number;
    team_members: number;
    total_registrations: number;
    total_revenue: number;
  };
  plan: {
    name: string;
    status: string;
    registrations_used: number;
    registrations_max: number | null;
    storage_used_gb: number;
    storage_max_gb: number | null;
    events_used: number;
    events_max: number | null;
    unrestricted: boolean;
  };
  trend: Array<{ label: string; registrations: number; revenue: number }>;
  events: OrganiserDashboardEvent[];
  recent_activity: Array<{
    id: string;
    action: string;
    resource_type: string;
    resource_id: string;
    actor_role?: string | null;
    occurred_at: string;
  }>;
  needs_attention: AttentionItem[];
  freshness_at: string;
  source: string;
};

export function useOrganiserDashboard() {
  return useQuery({
    queryKey: ["organiser-dashboard"],
    queryFn: () => apiGet<OrganiserDashboard>("/organiser/dashboard"),
    refetchInterval: 30_000,
  });
}

export function useOrganiserNeedsAttention() {
  return useQuery({
    queryKey: ["organiser-needs-attention"],
    queryFn: () => apiGet<AttentionItem[]>("/organiser/needs-attention"),
    refetchInterval: 30_000,
  });
}

export function useEventNeedsAttention(eventId?: string) {
  return useQuery({
    queryKey: ["event-needs-attention", eventId],
    queryFn: () => apiGet<AttentionItem[]>(`/organiser/events/${eventId}/needs-attention`),
    enabled: Boolean(eventId),
    refetchInterval: 30_000,
  });
}
