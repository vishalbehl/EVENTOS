"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { SupportAccessSelection } from "@/components/super-admin/ui/SupportAccessScope";

export interface AuditExportRecord {
  export_id: string;
  organization_id: string;
  status: string;
  file_format: string;
  created_at: string;
  completed_at?: string | null;
  expires_at?: string | null;
  failure_reason?: string | null;
}

function requireScope(scope: SupportAccessSelection | null) {
  if (!scope?.organizationId || !scope.reason || !scope.accessRequestId) {
    throw new Error("Apply an audited tenant scope before exporting audit evidence.");
  }
  return {
    query: `organization_id=${scope.organizationId}`,
    headers: { "X-Support-Reason": scope.reason },
  };
}

const key = (scope: SupportAccessSelection | null) => queryKeys.admin.domain("audit-exports", {
  organizationId: scope?.organizationId,
  accessRequestId: scope?.accessRequestId,
});

export function useAuditExports(scope: SupportAccessSelection | null) {
  return useQuery({
    queryKey: key(scope),
    queryFn: () => {
      const target = requireScope(scope);
      return apiClient.get<AuditExportRecord[]>(`/superadmin/audit-exports?${target.query}`, { headers: target.headers });
    },
    enabled: Boolean(scope?.organizationId && scope.reason && scope.accessRequestId),
    refetchInterval: (query) => query.state.data?.some((item) => ["QUEUED", "RUNNING"].includes(item.status)) ? 3000 : false,
  });
}

export function useCreateAuditExport(scope: SupportAccessSelection | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => {
      const target = requireScope(scope);
      return apiClient.post<AuditExportRecord>(`/superadmin/audit-exports?${target.query}`, payload, {
        headers: { ...target.headers, "Idempotency-Key": crypto.randomUUID() },
      });
    },
    onSuccess: () => client.invalidateQueries({ queryKey: key(scope) }),
  });
}

export function useDownloadAuditExport(scope: SupportAccessSelection | null) {
  return useMutation({
    mutationFn: async (exportId: string) => {
      const target = requireScope(scope);
      const result = await apiClient.get<{ download_url: string; filename: string }>(
        `/superadmin/audit-exports/${exportId}/download?${target.query}`,
        { headers: target.headers },
      );
      window.open(result.download_url, "_blank", "noopener,noreferrer");
      return result;
    },
  });
}
