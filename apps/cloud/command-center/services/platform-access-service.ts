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
  reason: string;
}

const ACCESS_REASON = "Administering tenant role and permission configuration";

function scopedConfig(organizationId: string) {
  return {
    params: { organization_id: organizationId },
    headers: { "X-Support-Reason": ACCESS_REASON },
  };
}

export const platformAccessKeys = {
  roles: (organizationId?: string, params?: Record<string, unknown>) => queryKeys.admin.domain("platform-roles", { organizationId, ...params }),
  permissions: (organizationId?: string) => queryKeys.admin.domain("platform-permissions", { organizationId }),
  rolePermissions: (organizationId?: string, roleId?: string) => queryKeys.admin.domain("platform-role-permissions", { organizationId, roleId }),
};

export function usePlatformRoles(organizationId?: string, params?: { search?: string; limit?: number; skip?: number }) {
  return useQuery({
    queryKey: platformAccessKeys.roles(organizationId, params),
    queryFn: () => apiClient.get<PlatformRole[]>("/superadmin/access/roles", {
      ...scopedConfig(organizationId!),
      params: { ...params, organization_id: organizationId },
    }),
    enabled: Boolean(organizationId),
  });
}

export function usePlatformPermissions(organizationId?: string) {
  return useQuery({
    queryKey: platformAccessKeys.permissions(organizationId),
    queryFn: () => apiClient.get<PlatformPermission[]>("/superadmin/access/permissions", scopedConfig(organizationId!)),
    enabled: Boolean(organizationId),
  });
}

export function useRolePermissions(organizationId?: string, roleId?: string) {
  return useQuery({
    queryKey: platformAccessKeys.rolePermissions(organizationId, roleId),
    queryFn: () => apiClient.get<string[]>(`/superadmin/access/roles/${roleId}/permissions`, scopedConfig(organizationId!)),
    enabled: Boolean(organizationId && roleId),
  });
}

export function useCreatePlatformRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ organizationId, payload }: { organizationId: string; payload: RolePayload }) =>
      apiClient.post<PlatformRole>("/superadmin/access/roles", payload, scopedConfig(organizationId)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.admin.all }),
  });
}

export function useUpdatePlatformRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ organizationId, roleId, payload, expectedUpdatedAt }: { organizationId: string; roleId: string; payload: Partial<RolePayload>; expectedUpdatedAt: string }) =>
      apiClient.patch<PlatformRole>(`/superadmin/access/roles/${roleId}`, {
        ...payload,
        expected_updated_at: expectedUpdatedAt,
      }, scopedConfig(organizationId)),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.all });
      queryClient.invalidateQueries({ queryKey: platformAccessKeys.rolePermissions(variables.organizationId, variables.roleId) });
    },
  });
}

export function useDeletePlatformRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ organizationId, roleId, reason }: { organizationId: string; roleId: string; reason: string }) =>
      apiClient.delete(`/superadmin/access/roles/${roleId}`, { ...scopedConfig(organizationId), data: { reason } }),
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
    mutationFn: ({ organizationId, roleId, permissionId, reason }: { organizationId: string; roleId: string; permissionId: string; reason: string }) =>
      apiClient.post(`/superadmin/access/roles/${roleId}/permissions/${permissionId}/toggle`, { reason }, scopedConfig(organizationId)),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: platformAccessKeys.roles(variables.organizationId) });
      queryClient.invalidateQueries({ queryKey: platformAccessKeys.rolePermissions(variables.organizationId, variables.roleId) });
    },
  });
}
