"use client";

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { SupportAccessSelection } from "@/components/super-admin/ui/SupportAccessScope";

export interface AccessReview {
  id: string;
  organization_id: string;
  target_user_id: string;
  requested_by?: string;
  reviewer_id?: string;
  review_type: "PERIODIC" | "ROLE_CHANGE" | "BREAK_GLASS";
  status: string;
  scope_json: Record<string, unknown>;
  request_reason?: string;
  decision_reason?: string;
  due_at?: string;
  decided_at?: string;
  version: number;
  created_at: string;
}

function config(scope: SupportAccessSelection) {
  return { params: { organization_id: scope.organizationId }, headers: { "X-Support-Reason": scope.reason } };
}

const key = (scope?: SupportAccessSelection | null) => queryKeys.admin.domain("access-reviews", { organizationId: scope?.organizationId, accessRequestId: scope?.accessRequestId });

export function useAccessReviews(scope: SupportAccessSelection | null) {
  return useInfiniteQuery({
    queryKey: key(scope),
    queryFn: ({ pageParam }) => apiClient.get<{ items: AccessReview[]; next_cursor: string | null; has_next: boolean }>("/superadmin/security-governance/access-reviews", { ...config(scope!), params: { organization_id: scope!.organizationId, cursor: pageParam || undefined, limit: 50 } }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    enabled: Boolean(scope),
  });
}

export function useCreateAccessReview(scope: SupportAccessSelection | null) {
  const client = useQueryClient();
  return useMutation({ mutationFn: (payload: Record<string, unknown>) => apiClient.post<AccessReview>("/superadmin/security-governance/access-reviews", payload, config(scope!)), onSuccess: () => client.invalidateQueries({ queryKey: key(scope) }) });
}

export function useDecideAccessReview(scope: SupportAccessSelection | null) {
  const client = useQueryClient();
  return useMutation({ mutationFn: ({ reviewId, payload }: { reviewId: string; payload: Record<string, unknown> }) => apiClient.patch<AccessReview>(`/superadmin/security-governance/access-reviews/${reviewId}`, payload, config(scope!)), onSuccess: () => client.invalidateQueries({ queryKey: key(scope) }) });
}
