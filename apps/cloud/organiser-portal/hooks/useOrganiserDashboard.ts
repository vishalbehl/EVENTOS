import { useQuery } from "@tanstack/react-query";
import { apiGet, shouldRetryRead } from "@/lib/api-client";
import type { AttentionItem } from "@/components/organizer/workspace/OrganiserPrimitives";
import { accessContextCacheKey, isPlatformSelfSession, useAuthStore } from "@/store/use-auth-store";

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
    lifecycle_state?: string;
  };
  metrics: {
    active_events: number;
    total_events: number;
    team_members: number;
    total_registrations: number;
    total_sessions: number;
    total_speakers: number;
    total_checkins: number;
    total_revenue: number;
  };
  registration_overview: {
    approved: number;
    pending: number;
    waitlisted: number;
    other: number;
  };
  commercial: {
    offer_name: string;
    status: string;
    billing_cycle?: string | null;
    valid_till?: string | null;
    registrations_used: number;
    registrations_max: number | null;
    storage_used_gb: number;
    storage_max_gb: number | null;
    events_used: number;
    events_max: number | null;
    unrestricted: boolean;
  };
  trend: Array<{ label: string; registrations: number; revenue: number }>;
  session_distribution: Array<{ label: string; oral: number; poster: number }>;
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
  const state = useAuthStore();
  const { user, activeContext, isContextSwitching, isAuthenticated, hasHydrated } = state;
  const contextKey = accessContextCacheKey(activeContext, user?.organization_id);
  return useQuery({
    queryKey: ["organiser-dashboard", user?.id, contextKey, state.impersonationSessionId],
    queryFn: ({ signal }) => apiGet<OrganiserDashboard>("/organiser/dashboard", { signal }),
    enabled: hasHydrated && isAuthenticated && !isContextSwitching && !isPlatformSelfSession(state),
    retry: shouldRetryRead,
    refetchInterval: query => query.state.error ? false : 30_000,
  });
}

export function useOrganiserNeedsAttention() {
  const state = useAuthStore();
  const { user, activeContext, isContextSwitching, isAuthenticated, hasHydrated } = state;
  const contextKey = accessContextCacheKey(activeContext, user?.organization_id);
  return useQuery({
    queryKey: ["organiser-needs-attention", user?.id, contextKey, state.impersonationSessionId],
    queryFn: ({ signal }) => apiGet<AttentionItem[]>("/organiser/needs-attention", { signal }),
    enabled: hasHydrated && isAuthenticated && !isContextSwitching && !isPlatformSelfSession(state),
    retry: shouldRetryRead,
    refetchInterval: query => query.state.error ? false : 30_000,
  });
}

export function useEventNeedsAttention(eventId?: string) {
  const { user, activeContext, isContextSwitching } = useAuthStore();
  const contextKey = accessContextCacheKey(activeContext, user?.organization_id);
  return useQuery({
    queryKey: ["event-needs-attention", contextKey, eventId],
    queryFn: () => apiGet<AttentionItem[]>(`/organiser/events/${eventId}/needs-attention`),
    enabled: Boolean(eventId) && !isContextSwitching,
    refetchInterval: 30_000,
  });
}
