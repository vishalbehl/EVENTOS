import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import { hasPermission, PermissionCode } from "@/lib/permissions";
import { useMemo } from "react";
import { accessContextCacheKey, useAuthStore } from "@/store/use-auth-store";
const NO_PERMISSIONS: string[] = [];

/**
 * Conference Platform — Permission Hook
 * hooks/usePermissions.ts
 * 
 * Fetches the user's effective permissions for the current context (optional eventId).
 * Returns helper functions to check specific permission codes.
 */

export function usePermissions(eventId?: string) {
  const { isAuthenticated, accessToken, user, activeContext, isContextSwitching } = useAuthStore();
  const contextKey = accessContextCacheKey(activeContext, user?.organization_id);
  const activeOrganizationId = activeContext?.organization_id ?? user?.organization_id;
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["permissions", user?.id, contextKey, eventId],
    queryFn: ({ signal }) => {
      const url = eventId ? `/me/permissions?event_id=${eventId}` : '/me/permissions';
      return apiGet<{ permissions: string[]; organization_id: string; policy_revision: number }>(url, { signal });
    },
    enabled: isAuthenticated && !!accessToken && !isContextSwitching,
    // Revalidate on mount/focus; cached permissions are not authority.
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: true,
  });

  // Hide cached allows while checking current authority or after an error.
  const permissions = !isContextSwitching && !isFetching && !error && isAuthenticated && !!accessToken &&
    !!data && data.organization_id === activeOrganizationId ? data.permissions : NO_PERMISSIONS;

  const checkPermission = useMemo(() => {
    return (code: PermissionCode) => hasPermission(permissions, code);
  }, [permissions]);

  return {
    permissions,
    checkPermission,
    isLoading,
    isFetching,
    policyRevision: data?.policy_revision,
    error,
    refetch,
  };
}

/**
 * Shorthand hook for a single permission check.
 */
export function usePermission(code: PermissionCode, eventId?: string) {
  const { checkPermission, isLoading } = usePermissions(eventId);
  return {
    allowed: checkPermission(code),
    isLoading
  };
}
