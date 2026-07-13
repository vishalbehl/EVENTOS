"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

export interface PlatformRole {
  id: string;
  organization_id: string;
  department_id?: string | null;
  department_name?: string | null;
  name: string;
  code: string;
  description?: string | null;
  access_level: string;
  permissions_count: number;
  users_count: number;
  created_at: string;
  updated_at: string;
}

export interface PlatformPermission {
  id: string;
  code: string;
  name: string;
  module: string;
  description?: string | null;
}

export interface RolePayload {
  name: string;
  code: string;
  description?: string | null;
  access_level: string;
  department_id?: string | null;
}

export const platformAccessKeys = {
  roles: (params?: Record<string, unknown>) => queryKeys.admin.domain("platform-roles", params),
  permissions: () => queryKeys.admin.domain("platform-permissions"),
  rolePermissions: (roleId?: string) => queryKeys.admin.domain("platform-role-permissions", { roleId }),
};

export function usePlatformRoles(params?: { search?: string; limit?: number; skip?: number }) {
  return useQuery({
    queryKey: platformAccessKeys.roles(params),
    queryFn: () => apiClient.get<PlatformRole[]>("/platform/roles", { params }),
  });
}

export function usePlatformPermissions() {
  return useQuery({
    queryKey: platformAccessKeys.permissions(),
    queryFn: () => apiClient.get<PlatformPermission[]>("/platform/permissions"),
  });
}

export function useRolePermissions(roleId?: string) {
  return useQuery({
    queryKey: platformAccessKeys.rolePermissions(roleId),
    queryFn: () => apiClient.get<string[]>(`/platform/roles/${roleId}/permissions`),
    enabled: Boolean(roleId),
  });
}

export function useCreatePlatformRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: RolePayload) => apiClient.post<PlatformRole>("/platform/roles", payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.admin.all }),
  });
}

export function useUpdatePlatformRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, payload }: { roleId: string; payload: Partial<RolePayload> }) =>
      apiClient.patch<PlatformRole>(`/platform/roles/${roleId}`, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.all });
      queryClient.invalidateQueries({ queryKey: platformAccessKeys.rolePermissions(variables.roleId) });
    },
  });
}

export function useDeletePlatformRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (roleId: string) => apiClient.delete(`/platform/roles/${roleId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.admin.all }),
  });
}

export function useSeedPlatformPermissions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post("/platform/permissions/seed"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.admin.all }),
  });
}

export function useToggleRolePermission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, permissionId }: { roleId: string; permissionId: string }) =>
      apiClient.post(`/platform/roles/${roleId}/permissions/${permissionId}/toggle`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: platformAccessKeys.roles() });
      queryClient.invalidateQueries({ queryKey: platformAccessKeys.rolePermissions(variables.roleId) });
    },
  });
}
