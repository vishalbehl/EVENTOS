import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import { hasPermission, PermissionCode } from "@/lib/permissions";
import { useMemo } from "react";
import { useAuthStore } from "@/store/use-auth-store";
import { queryKeys } from "@/lib/query-keys";

/**
 * Conference Platform — Permission Hook
 * hooks/usePermissions.ts
 * 
 * Fetches the user's effective permissions for the current context (optional eventId).
 * Returns helper functions to check specific permission codes.
 */

export function usePermissions(eventId?: string) {
  const { isAuthenticated, accessToken } = useAuthStore();
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.permissions.effective(eventId),
    queryFn: () => {
      const url = eventId ? `/me/permissions?event_id=${eventId}` : '/me/permissions';
      return apiGet<{ permissions: string[] }>(url);
    },
    enabled: isAuthenticated && !!accessToken,
    // Context-sensitive permissions don't change often, but we want them ready
    staleTime: 1000 * 60, // 1 minute
    placeholderData: keepPreviousData,
  });

  const permissions = data?.permissions || [];

  const checkPermission = useMemo(() => {
    return (code: PermissionCode) => hasPermission(permissions, code);
  }, [permissions]);

  return {
    permissions,
    checkPermission,
    isLoading,
    error
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
