import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import { useAuthStore } from "@/store/use-auth-store";
import { queryKeys } from "@/lib/query-keys";

export interface CursorPage<T> {
  items: T[];
  next_cursor: string | null;
  has_next: boolean;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  tagline?: string;
  billing_model: string;
  price_per_event?: number;
  currency: string;
  max_events: number;
  max_users: number;
  is_active: boolean;
  is_popular: boolean;
  display_order: number;
  created_at: string;
}

export interface OrgSubscription {
  id: string;
  organization_id: string;
  plan_id: string;
  status: string;
  stripe_subscription_id?: string;
  trial_ends_at?: string;
  current_period_end?: string;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}

export interface EntitlementGrant {
  id: string;
  organization_id: string;
  subscription_id?: string;
  grant_type: string;
  scope_type: string;
  consumption_model: string;
  unit_type: string;
  status: string;
  source_type: string;
  quantity_total?: number;
  quantity_consumed?: number;
  quantity_reserved?: number;
  valid_from?: string;
  valid_until?: string;
  created_at: string;
}

export interface CreditNote {
  id: string;
  credit_note_number: string;
  organization_id: string;
  invoice_id: string;
  amount_inr: number;
  gst_amount: number;
  reason?: string;
  status: string;
  issued_at?: string;
  created_at: string;
}

export interface FinancialAuditEvent {
  id: string;
  activity_type: string;
  entity_type: string;
  entity_id?: string;
  entity_name?: string;
  organization_id?: string;
  amount_inr?: number;
  ip_address?: string;
  occurred_at: string;
}

export interface RevenueMetric {
  id: string;
  organization_id: string;
  period: string;
  mrr: number;
  arr: number;
  add_on_revenue: number;
  created_at: string;
}

interface BillingSupportParams {
  organizationId?: string;
  supportReason?: string;
  accessRequestId?: string;
  limit?: number;
}

function useBillingCursor<T>(
  key: string,
  path: string,
  params: BillingSupportParams,
  filters: Record<string, string | undefined> = {},
) {
  const { hasHydrated, isAuthenticated } = useAuthStore();
  return useInfiniteQuery({
    queryKey: queryKeys.admin.domain(key, {
      organizationId: params.organizationId,
      accessRequestId: params.accessRequestId,
      limit: params.limit,
      ...filters,
    }),
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams();
      query.set("organization_id", params.organizationId ?? "");
      query.set("limit", String(params.limit ?? 50));
      if (pageParam) query.set("cursor", pageParam);
      Object.entries(filters).forEach(([name, value]) => {
        if (value) query.set(name, value);
      });
      return apiGet<CursorPage<T>>(`${path}?${query}`, {
        headers: { "X-Support-Reason": params.supportReason },
      });
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: hasHydrated
      && isAuthenticated
      && !!params.organizationId
      && !!params.supportReason
      && !!params.accessRequestId,
  });
}

export function useSubscriptionPlans() {
  const { hasHydrated, isAuthenticated } = useAuthStore();
  return useQuery({
    queryKey: queryKeys.admin.domain("billing-plans"),
    queryFn: () => apiGet<SubscriptionPlan[]>("/superadmin/billing-admin/plans"),
    enabled: hasHydrated && isAuthenticated,
  });
}

export function useOrgSubscriptions(params: BillingSupportParams & { status?: string } = {}) {
  return useBillingCursor<OrgSubscription>(
    "billing-subscriptions",
    "/superadmin/billing-admin/subscriptions",
    params,
    { status: params.status },
  );
}

export function useEntitlementGrants(
  params: BillingSupportParams & { status?: string; grantType?: string } = {},
) {
  return useBillingCursor<EntitlementGrant>(
    "billing-entitlements",
    "/superadmin/billing-admin/entitlements",
    { ...params, limit: params.limit ?? 100 },
    { status: params.status, grant_type: params.grantType },
  );
}

export function useCreditNotes(params: BillingSupportParams & { status?: string } = {}) {
  return useBillingCursor<CreditNote>(
    "billing-credit-notes",
    "/superadmin/billing-admin/credit-notes",
    params,
    { status: params.status },
  );
}

export function useFinancialAuditTrail(
  params: BillingSupportParams & { activityType?: string; entityType?: string } = {},
) {
  return useBillingCursor<FinancialAuditEvent>(
    "billing-audit-trail",
    "/superadmin/billing-admin/financial-audit-trail",
    { ...params, limit: params.limit ?? 100 },
    { activity_type: params.activityType, entity_type: params.entityType },
  );
}

export function useRevenueMetrics(params: BillingSupportParams = {}) {
  return useBillingCursor<RevenueMetric>(
    "billing-revenue-metrics",
    "/superadmin/billing-admin/revenue-metrics",
    params,
  );
}
