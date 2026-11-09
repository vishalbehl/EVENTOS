"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import { accessContextCacheKey, isPlatformSelfSession, useAuthStore } from "@/store/use-auth-store";

export type AccessBootstrap = {
  organization_id: string;
  organization_kind: "NORMAL" | "EMC" | "CLIENT";
  acting_organization_id: string;
  workspace_id: string | null;
  event_id: string | null;
  relationship_id: string | null;
  access_mode: "DIRECT" | "DELEGATED";
  role: string;
  actions: string[];
  policy_revision: number;
  policy_revisions: number[];
  operational_restrictions: string[];
  safe_denial_reasons: Record<string, string>;
  freshness_at: string;
};

export function useAccessBootstrap(enabled = true) {
  const platformSelf = useAuthStore(isPlatformSelfSession);
  const user = useAuthStore(state => state.user);
  const context = useAuthStore(state => state.activeContext);
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const isContextSwitching = useAuthStore(state => state.isContextSwitching);
  const contextKey = accessContextCacheKey(context, user?.organization_id);

  return useQuery({
    queryKey: ["access-bootstrap", user?.id, contextKey],
    enabled: enabled && isAuthenticated && !!user && !isContextSwitching && !platformSelf,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: ({ signal }) => apiGet<AccessBootstrap>("/access/bootstrap", { signal }),
  });
}

export function usePortalQueryScope() {
  const user = useAuthStore(state => state.user);
  const context = useAuthStore(state => state.activeContext);
  const supportSession = useAuthStore(state => state.impersonationSessionId);
  return [user?.id, accessContextCacheKey(context, user?.organization_id), supportSession] as const;
}
