import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, apiPost } from "@/lib/api-client";
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
  version: number;
  status_reason?: string;
  status_changed_at?: string;
  status_changed_by?: string;
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
  updated_at: string;
  version: number;
  status_reason?: string;
  status_changed_at?: string;
  status_changed_by?: string;
}

export interface EventActivation {
  id: string;
  organization_id: string;
  event_id: string;
  subscription_id: string;
  grant_id?: string;
  grant_consumption_id?: string;
  status: string;
  activation_policy: string;
  current_snapshot_set_id?: string;
  activated_at: string;
  expires_at?: string;
  usage_locked_at?: string;
  transfer_locked_at?: string;
  deactivation_reason?: string;
  suspension_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface GrantConsumption {
  id: string;
  grant_id: string;
  organization_id: string;
  event_id?: string;
  quantity: number;
  unit_type: string;
  status: string;
  reserved_at?: string;
  consumed_at?: string;
  released_at?: string;
  reservation_expires_at?: string;
  transferred_to_consumption_id?: string;
  created_at: string;
}

export interface SnapshotSetSummary {
  id: string;
  version: number;
  resolution_reason: string;
  resolver_version: string;
  policy_type: string;
  checksum: string;
  previous_snapshot_set_id?: string;
  created_at: string;
  is_current: boolean;
}

export interface SnapshotFeatureItem {
  feature_key: string;
  enabled: boolean;
  scope_type: string;
  source_type: string;
  source_ref?: string;
  override_source?: string;
  denial_reason?: string;
}

export interface SnapshotLimitItem {
  limit_key: string;
  limit_value?: number;
  usage_value: number;
  remaining_value?: number;
  usage_strategy: string;
  scope_type: string;
  source_type: string;
  source_ref?: string;
  override_source?: string;
  denial_reason?: string;
}

export interface ActivationInspection {
  activation: EventActivation;
  event_name: string;
  plan_id?: string;
  plan_name?: string;
  grant?: EntitlementGrant;
  consumption?: GrantConsumption;
  current_snapshot?: SnapshotSetSummary;
  snapshot_history: SnapshotSetSummary[];
  features: SnapshotFeatureItem[];
  limits: SnapshotLimitItem[];
  usage: Record<string, number>;
  transfer_eligibility?: { action: string; decisions: Array<Record<string, unknown>> };
  denial_reason?: string;
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
  updated_at: string;
  version: number;
  status_reason?: string;
  status_changed_by?: string;
  applied_to_invoice_id?: string;
  applied_at?: string;
  cancelled_at?: string;
}

export interface BillingInvoice {
  id: string;
  organization_id: string;
  event_id?: string;
  activation_id?: string;
  invoice_number?: string;
  amount: number;
  gst_amount: number;
  total_amount_inr: number;
  currency: string;
  status: string;
  due_date?: string;
  paid_at?: string;
  issued_at: string;
  stripe_invoice_id?: string;
  version: number;
  status_reason?: string;
  status_changed_at?: string;
  status_changed_by?: string;
  created_at: string;
  updated_at: string;
}

export interface BillingInvoiceItem {
  id: string;
  invoice_id: string;
  description: string;
  amount: number;
  quantity: number;
}

export interface CommercialPayment {
  id: string;
  organization_id: string;
  invoice_id?: string;
  subscription_id?: string;
  plan_name: string;
  amount: number;
  currency: string;
  provider: string;
  provider_transaction_id?: string;
  provider_event_id?: string;
  parent_transaction_id?: string;
  refunded_amount?: number;
  status: string;
  reconciliation_status: string;
  reconciled_at?: string;
  reconciled_by?: string;
  reconciliation_reason?: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ProviderWebhookReceipt {
  id: string;
  gateway_id: string;
  organization_id: string;
  invoice_id?: string;
  transaction_id?: string;
  provider: string;
  provider_event_id: string;
  event_type: string;
  provider_created_at?: string;
  payload_hash: string;
  status: "RECEIVED" | "PROCESSED" | "REVIEW_REQUIRED" | "FAILED" | "IGNORED";
  attempt_count: number;
  failure_code?: string;
  failure_detail?: string;
  received_at: string;
  processed_at?: string;
}

export interface BillingInvoiceDetail {
  invoice: BillingInvoice;
  items: BillingInvoiceItem[];
  payments: CommercialPayment[];
  reconciled_amount: number;
  outstanding_amount: number;
  reconciliation_status: string;
}

export interface InvoiceArtifact {
  export_id: string;
  invoice_id: string;
  invoice_version: number;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
  created_at: string;
  completed_at?: string;
  expires_at?: string;
  failure_reason?: string;
}

export interface InvoiceArtifactDownload {
  download_url: string;
  filename: string;
  expires_in: number;
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

export interface BillingSupportParams {
  organizationId?: string;
  supportReason?: string;
  accessRequestId?: string;
  limit?: number;
}

function requireBillingScope(params: BillingSupportParams) {
  if (!params.organizationId || !params.supportReason || !params.accessRequestId) {
    throw new Error("Apply an audited tenant support scope before changing billing data.");
  }
  return {
    organizationId: params.organizationId,
    config: {
      headers: {
        "X-Support-Reason": params.supportReason,
      },
    },
  };
}

function mutationConfig(params: BillingSupportParams, idempotencyKey?: string) {
  const scope = requireBillingScope(params);
  return {
    organizationId: scope.organizationId,
    config: {
      headers: {
        ...scope.config.headers,
        "Idempotency-Key": idempotencyKey ?? crypto.randomUUID(),
      },
    },
  };
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

export function useEventActivations(
  params: BillingSupportParams & { status?: string } = {},
) {
  return useBillingCursor<EventActivation>(
    "billing-activations",
    "/superadmin/billing-admin/activations",
    { ...params, limit: params.limit ?? 100 },
    { status: params.status },
  );
}

export function useGrantConsumptions(
  grantId: string | null,
  params: BillingSupportParams & { status?: string } = {},
) {
  return useBillingCursor<GrantConsumption>(
    `billing-grant-consumptions-${grantId ?? "none"}`,
    `/superadmin/billing-admin/entitlements/${grantId ?? "none"}/consumptions`,
    { ...params, organizationId: grantId ? params.organizationId : undefined, limit: params.limit ?? 100 },
    { status: params.status },
  );
}

export function useActivationInspection(
  activationId: string | null,
  params: BillingSupportParams,
) {
  const { hasHydrated, isAuthenticated } = useAuthStore();
  return useQuery({
    queryKey: queryKeys.admin.domain("billing-activation-inspection", {
      activationId,
      organizationId: params.organizationId,
      accessRequestId: params.accessRequestId,
    }),
    queryFn: () => apiGet<ActivationInspection>(
      `/superadmin/billing-admin/activations/${activationId}?organization_id=${params.organizationId}`,
      { headers: { "X-Support-Reason": params.supportReason } },
    ),
    enabled: hasHydrated && isAuthenticated && !!activationId && !!params.organizationId
      && !!params.supportReason && !!params.accessRequestId,
  });
}

export function useCreditNotes(params: BillingSupportParams & { status?: string } = {}) {
  return useBillingCursor<CreditNote>(
    "billing-credit-notes",
    "/superadmin/billing-admin/credit-notes",
    params,
    { status: params.status },
  );
}

export function useBillingInvoices(params: BillingSupportParams & { status?: string } = {}) {
  return useBillingCursor<BillingInvoice>(
    "billing-invoices",
    "/superadmin/billing-admin/invoices",
    { ...params, limit: params.limit ?? 100 },
    { status: params.status },
  );
}

export function useBillingInvoiceDetail(invoiceId: string | null, params: BillingSupportParams) {
  const { hasHydrated, isAuthenticated } = useAuthStore();
  return useQuery({
    queryKey: queryKeys.admin.domain("billing-invoice-detail", {
      invoiceId,
      organizationId: params.organizationId,
      accessRequestId: params.accessRequestId,
    }),
    queryFn: () => apiGet<BillingInvoiceDetail>(
      `/superadmin/billing-admin/invoices/${invoiceId}?organization_id=${params.organizationId}`,
      { headers: { "X-Support-Reason": params.supportReason } },
    ),
    enabled: hasHydrated && isAuthenticated && !!invoiceId && !!params.organizationId
      && !!params.supportReason && !!params.accessRequestId,
  });
}

export function useCreateInvoiceArtifact(params: BillingSupportParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ invoiceId, version, reason, idempotencyKey }: { invoiceId: string; version: number; reason: string; idempotencyKey: string }) => {
      const scope = mutationConfig(params, idempotencyKey);
      return apiPost<InvoiceArtifact>(
        `/superadmin/billing-admin/invoices/${invoiceId}/artifacts?organization_id=${scope.organizationId}`,
        { version, reason },
        scope.config,
      );
    },
    onSuccess: (artifact) => queryClient.setQueryData(
      queryKeys.admin.domain("billing-invoice-artifact", {
        invoiceId: artifact.invoice_id,
        exportId: artifact.export_id,
        organizationId: params.organizationId,
        accessRequestId: params.accessRequestId,
      }),
      artifact,
    ),
  });
}

export function useInvoiceArtifact(invoiceId: string | null, exportId: string | null, params: BillingSupportParams) {
  const { hasHydrated, isAuthenticated } = useAuthStore();
  return useQuery({
    queryKey: queryKeys.admin.domain("billing-invoice-artifact", {
      invoiceId,
      exportId,
      organizationId: params.organizationId,
      accessRequestId: params.accessRequestId,
    }),
    queryFn: () => apiGet<InvoiceArtifact>(
      `/superadmin/billing-admin/invoices/${invoiceId}/artifacts/${exportId}?organization_id=${params.organizationId}`,
      { headers: { "X-Support-Reason": params.supportReason } },
    ),
    enabled: hasHydrated && isAuthenticated && !!invoiceId && !!exportId && !!params.organizationId && !!params.supportReason && !!params.accessRequestId,
    refetchInterval: (query) => ["QUEUED", "RUNNING"].includes(query.state.data?.status ?? "") ? 2000 : false,
  });
}

export async function downloadInvoiceArtifact(invoiceId: string, exportId: string, params: BillingSupportParams) {
  const scope = requireBillingScope(params);
  return apiGet<InvoiceArtifactDownload>(
    `/superadmin/billing-admin/invoices/${invoiceId}/artifacts/${exportId}/download?organization_id=${scope.organizationId}`,
    scope.config,
  );
}

export function useCommercialPayments(
  params: BillingSupportParams & { status?: string; reconciliationStatus?: string; provider?: string } = {},
) {
  return useBillingCursor<CommercialPayment>(
    "billing-commercial-payments",
    "/superadmin/billing-admin/payments",
    { ...params, limit: params.limit ?? 100 },
    {
      status: params.status,
      reconciliation_status: params.reconciliationStatus,
      provider: params.provider,
    },
  );
}

export function useProviderWebhookReceipts(
  params: BillingSupportParams & { status?: string; provider?: string } = {},
) {
  return useBillingCursor<ProviderWebhookReceipt>(
    "billing-provider-webhooks",
    "/superadmin/billing-admin/provider-webhooks",
    { ...params, limit: params.limit ?? 50 },
    { status: params.status, provider: params.provider },
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

export function useSubscriptionStatusMutation(params: BillingSupportParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ subscriptionId, payload, idempotencyKey }: { subscriptionId: string; payload: Record<string, unknown>; idempotencyKey?: string }) => {
      const scope = mutationConfig(params, idempotencyKey);
      return apiPost<OrgSubscription>(`/superadmin/billing-admin/subscriptions/${subscriptionId}/status?organization_id=${scope.organizationId}`, payload, scope.config);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.domain("billing-subscriptions") }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.domain("billing-entitlements") }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.domain("billing-audit-trail") }),
      ]);
    },
  });
}

export function useIssueGrant(params: BillingSupportParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ payload, idempotencyKey }: { payload: Record<string, unknown>; idempotencyKey?: string }) => {
      const scope = mutationConfig(params, idempotencyKey);
      return apiPost<EntitlementGrant>(`/superadmin/billing-admin/entitlements?organization_id=${scope.organizationId}`, payload, scope.config);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.domain("billing-entitlements") }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.domain("billing-audit-trail") }),
      ]);
    },
  });
}

export function useGrantCapacityMutation(params: BillingSupportParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ grantId, payload, idempotencyKey }: { grantId: string; payload: Record<string, unknown>; idempotencyKey?: string }) => {
      const scope = mutationConfig(params, idempotencyKey);
      return apiPatch<EntitlementGrant>(`/superadmin/billing-admin/entitlements/${grantId}/capacity?organization_id=${scope.organizationId}`, payload, scope.config);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.domain("billing-entitlements") }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.domain("billing-audit-trail") }),
      ]);
    },
  });
}

export function useGrantStatusMutation(params: BillingSupportParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ grantId, payload, idempotencyKey }: { grantId: string; payload: Record<string, unknown>; idempotencyKey?: string }) => {
      const scope = mutationConfig(params, idempotencyKey);
      return apiPost<EntitlementGrant>(`/superadmin/billing-admin/entitlements/${grantId}/status?organization_id=${scope.organizationId}`, payload, scope.config);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.domain("billing-entitlements") }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.domain("billing-audit-trail") }),
      ]);
    },
  });
}

export function useSnapshotRefreshMutation(params: BillingSupportParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ activationId, payload, idempotencyKey }: { activationId: string; payload: Record<string, unknown>; idempotencyKey?: string }) => {
      const scope = mutationConfig(params, idempotencyKey);
      return apiPost<ActivationInspection>(`/superadmin/billing-admin/activations/${activationId}/refresh-snapshot?organization_id=${scope.organizationId}`, payload, scope.config);
    },
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.domain("billing-activations") }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.domain("billing-activation-inspection", { activationId: variables.activationId, organizationId: params.organizationId, accessRequestId: params.accessRequestId }) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.domain("billing-audit-trail") }),
      ]);
    },
  });
}

export function useDeactivateActivationMutation(params: BillingSupportParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ activationId, reason, idempotencyKey }: { activationId: string; reason: string; idempotencyKey?: string }) => {
      const scope = mutationConfig(params, idempotencyKey);
      return apiPost<EventActivation>(`/superadmin/billing-admin/activations/${activationId}/deactivate?organization_id=${scope.organizationId}`, { reason }, scope.config);
    },
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.domain("billing-activations") }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.domain("billing-entitlements") }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.domain("billing-activation-inspection", { activationId: variables.activationId, organizationId: params.organizationId, accessRequestId: params.accessRequestId }) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.domain("billing-audit-trail") }),
      ]);
    },
  });
}

export function useTransferActivationMutation(params: BillingSupportParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ activationId, targetEventId, reason, idempotencyKey }: { activationId: string; targetEventId: string; reason: string; idempotencyKey?: string }) => {
      const scope = mutationConfig(params, idempotencyKey);
      return apiPost<{ status: string; eligibility?: Record<string, unknown>; activation?: Partial<EventActivation> }>(`/superadmin/billing-admin/activations/${activationId}/transfer?organization_id=${scope.organizationId}`, { target_event_id: targetEventId, reason }, scope.config);
    },
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.domain("billing-activations") }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.domain("billing-entitlements") }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.domain("billing-activation-inspection", { activationId: variables.activationId, organizationId: params.organizationId, accessRequestId: params.accessRequestId }) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.domain("billing-audit-trail") }),
      ]);
    },
  });
}

export function useIssueCreditNote(params: BillingSupportParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ payload, idempotencyKey }: { payload: Record<string, unknown>; idempotencyKey?: string }) => {
      const scope = mutationConfig(params, idempotencyKey);
      return apiPost<CreditNote>(`/superadmin/billing-admin/credit-notes?organization_id=${scope.organizationId}`, payload, scope.config);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.domain("billing-credit-notes") }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.domain("billing-audit-trail") }),
      ]);
    },
  });
}

export function useCreditNoteStatusMutation(params: BillingSupportParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ creditNoteId, payload, idempotencyKey }: { creditNoteId: string; payload: Record<string, unknown>; idempotencyKey?: string }) => {
      const scope = mutationConfig(params, idempotencyKey);
      return apiPost<CreditNote>(`/superadmin/billing-admin/credit-notes/${creditNoteId}/status?organization_id=${scope.organizationId}`, payload, scope.config);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.domain("billing-credit-notes") }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.domain("billing-audit-trail") }),
      ]);
    },
  });
}

export function useRecordInvoicePayment(params: BillingSupportParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ invoiceId, payload, idempotencyKey }: { invoiceId: string; payload: Record<string, unknown>; idempotencyKey?: string }) => {
      const scope = mutationConfig(params, idempotencyKey);
      return apiPost<CommercialPayment>(`/superadmin/billing-admin/invoices/${invoiceId}/payments?organization_id=${scope.organizationId}`, payload, scope.config);
    },
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.domain("billing-invoices") }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.domain("billing-commercial-payments") }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.domain("billing-invoice-detail", { invoiceId: variables.invoiceId, organizationId: params.organizationId, accessRequestId: params.accessRequestId }) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.domain("billing-audit-trail") }),
      ]);
    },
  });
}

export function useReconcileCommercialPayment(params: BillingSupportParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, payload, idempotencyKey }: { paymentId: string; payload: Record<string, unknown>; idempotencyKey?: string }) => {
      const scope = mutationConfig(params, idempotencyKey);
      return apiPost<CommercialPayment>(`/superadmin/billing-admin/payments/${paymentId}/reconcile?organization_id=${scope.organizationId}`, payload, scope.config);
    },
    onSuccess: async (payment) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.domain("billing-invoices") }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.domain("billing-commercial-payments") }),
        ...(payment.invoice_id ? [queryClient.invalidateQueries({ queryKey: queryKeys.admin.domain("billing-invoice-detail", { invoiceId: payment.invoice_id, organizationId: params.organizationId, accessRequestId: params.accessRequestId }) })] : []),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.domain("billing-audit-trail") }),
      ]);
    },
  });
}

export function useRefundCommercialPayment(params: BillingSupportParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, payload, idempotencyKey }: { paymentId: string; payload: Record<string, unknown>; idempotencyKey?: string }) => {
      const scope = mutationConfig(params, idempotencyKey);
      return apiPost<CommercialPayment>(`/superadmin/billing-admin/payments/${paymentId}/refund?organization_id=${scope.organizationId}`, payload, scope.config);
    },
    onSuccess: async (refund) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.domain("billing-invoices") }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.domain("billing-commercial-payments") }),
        ...(refund.invoice_id ? [queryClient.invalidateQueries({ queryKey: queryKeys.admin.domain("billing-invoice-detail", { invoiceId: refund.invoice_id, organizationId: params.organizationId, accessRequestId: params.accessRequestId }) })] : []),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.domain("billing-audit-trail") }),
      ]);
    },
  });
}

export function useInvoiceStatusMutation(params: BillingSupportParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ invoiceId, payload, idempotencyKey }: { invoiceId: string; payload: Record<string, unknown>; idempotencyKey?: string }) => {
      const scope = mutationConfig(params, idempotencyKey);
      return apiPost<BillingInvoice>(`/superadmin/billing-admin/invoices/${invoiceId}/status?organization_id=${scope.organizationId}`, payload, scope.config);
    },
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.domain("billing-invoices") }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.domain("billing-invoice-detail", { invoiceId: variables.invoiceId, organizationId: params.organizationId, accessRequestId: params.accessRequestId }) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.domain("billing-audit-trail") }),
      ]);
    },
  });
}
