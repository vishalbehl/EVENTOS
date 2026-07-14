import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, apiPost } from "@/lib/api-client";
import { useAuthStore } from "@/store/use-auth-store";
import { queryKeys } from "@/lib/query-keys";

export interface CRMAccount {
  id: string;
  organization_id: string;
  name: string;
  website?: string;
  industry?: string;
  created_at: string;
  updated_at: string;
  version: number;
  archived_at?: string;
}

export interface CRMContact {
  id: string;
  account_id: string;
  organization_id: string;
  first_name: string;
  last_name: string;
  email: string;
  created_at: string;
  updated_at: string;
  version: number;
  archived_at?: string;
}

export interface CRMLead {
  id: string;
  contact_id?: string;
  organization_id: string;
  status: string;
  source?: string;
  created_at: string;
  updated_at: string;
  version: number;
  archived_at?: string;
}

export interface CRMOpportunity {
  id: string;
  organization_id: string;
  account_id: string;
  stage_id?: string;
  name: string;
  amount: number;
  close_date?: string;
  created_at: string;
  updated_at: string;
  version: number;
  archived_at?: string;
}

export interface CRMPipelineStage {
  id: string;
  name: string;
  order: number;
}

export interface CRMSupportScope {
  organizationId?: string;
  supportReason?: string;
  accessRequestId?: string;
  includeArchived?: boolean;
}

export interface CursorPage<T> {
  items: T[];
  next_cursor: string | null;
  has_next: boolean;
}

const supportHeaders = (supportReason?: string) => ({
  headers: { "X-Support-Reason": supportReason },
});

export function useAccounts(scope: CRMSupportScope = {}) {
  const { hasHydrated, isAuthenticated } = useAuthStore();
  return useInfiniteQuery({
    queryKey: queryKeys.admin.domain("crm-accounts", { organizationId: scope.organizationId, accessRequestId: scope.accessRequestId, includeArchived: scope.includeArchived }),
    queryFn: ({ pageParam }) => apiGet<CursorPage<CRMAccount>>(
      `/superadmin/crm/accounts?organization_id=${scope.organizationId}&limit=50&include_archived=${scope.includeArchived ?? false}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
      supportHeaders(scope.supportReason),
    ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: hasHydrated && isAuthenticated && !!scope.organizationId && !!scope.supportReason && !!scope.accessRequestId,
  });
}

export function useContacts(scope: CRMSupportScope = {}) {
  const { hasHydrated, isAuthenticated } = useAuthStore();
  return useInfiniteQuery({
    queryKey: queryKeys.admin.domain("crm-contacts", { organizationId: scope.organizationId, accessRequestId: scope.accessRequestId, includeArchived: scope.includeArchived }),
    queryFn: ({ pageParam }) => apiGet<CursorPage<CRMContact>>(
      `/superadmin/crm/contacts?organization_id=${scope.organizationId}&limit=50&include_archived=${scope.includeArchived ?? false}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
      supportHeaders(scope.supportReason),
    ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: hasHydrated && isAuthenticated && !!scope.organizationId && !!scope.supportReason && !!scope.accessRequestId,
  });
}

export function useLeads(scope: CRMSupportScope = {}) {
  const { hasHydrated, isAuthenticated } = useAuthStore();
  return useInfiniteQuery({
    queryKey: queryKeys.admin.domain("crm-leads", { organizationId: scope.organizationId, accessRequestId: scope.accessRequestId, includeArchived: scope.includeArchived }),
    queryFn: ({ pageParam }) => apiGet<CursorPage<CRMLead>>(
      `/superadmin/crm/leads?organization_id=${scope.organizationId}&limit=50&include_archived=${scope.includeArchived ?? false}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
      supportHeaders(scope.supportReason),
    ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: hasHydrated && isAuthenticated && !!scope.organizationId && !!scope.supportReason && !!scope.accessRequestId,
  });
}

export function useOpportunities(scope: CRMSupportScope = {}) {
  const { hasHydrated, isAuthenticated } = useAuthStore();
  return useInfiniteQuery({
    queryKey: queryKeys.admin.domain("crm-opportunities", { organizationId: scope.organizationId, accessRequestId: scope.accessRequestId, includeArchived: scope.includeArchived }),
    queryFn: ({ pageParam }) => apiGet<CursorPage<CRMOpportunity>>(
      `/superadmin/crm/opportunities?organization_id=${scope.organizationId}&limit=50&include_archived=${scope.includeArchived ?? false}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
      supportHeaders(scope.supportReason),
    ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: hasHydrated && isAuthenticated && !!scope.organizationId && !!scope.supportReason && !!scope.accessRequestId,
  });
}

export function usePipelineStages() {
  const { hasHydrated, isAuthenticated } = useAuthStore();
  return useQuery({
    queryKey: queryKeys.admin.domain("crm-pipeline-stages"),
    queryFn: () => apiGet<CRMPipelineStage[]>("/superadmin/crm/pipeline-stages"),
    enabled: hasHydrated && isAuthenticated,
  });
}

export type CRMResourceType = "account" | "contact" | "lead" | "opportunity";
export type CRMMutationAction = "create" | "update" | "archive" | "restore";

const resourcePath: Record<CRMResourceType, string> = {
  account: "accounts",
  contact: "contacts",
  lead: "leads",
  opportunity: "opportunities",
};

export function useCrmMutation(scope: CRMSupportScope, resourceType: CRMResourceType) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      action,
      recordId,
      payload,
      idempotencyKey,
    }: {
      action: CRMMutationAction;
      recordId?: string;
      payload: Record<string, unknown>;
      idempotencyKey?: string;
    }) => {
      if (!scope.organizationId || !scope.supportReason || !scope.accessRequestId) {
        throw new Error("Apply an audited tenant support scope before changing CRM data.");
      }
      const path = resourcePath[resourceType];
      const baseUrl = `/superadmin/crm/${path}${recordId ? `/${recordId}` : ""}`;
      const url = `${baseUrl}${action === "archive" || action === "restore" ? `/${action}` : ""}?organization_id=${scope.organizationId}`;
      const config = {
        headers: {
          "X-Support-Reason": scope.supportReason,
          "Idempotency-Key": idempotencyKey ?? crypto.randomUUID(),
        },
      };
      if (action === "update") return apiPatch(url, payload, config);
      return apiPost(url, payload, config);
    },
    onSuccess: () => queryClient.invalidateQueries({
      queryKey: queryKeys.admin.domain(`crm-${resourcePath[resourceType]}`),
    }),
  });
}
