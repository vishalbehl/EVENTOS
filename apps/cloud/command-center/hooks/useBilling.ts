import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api-client";
import { useAuthStore } from "@/store/use-auth-store";
import { queryKeys } from "@/lib/query-keys";

export interface CursorPage<T> { items: T[]; next_cursor: string | null; has_next: boolean; }
export interface CommercialOffer { id: string; code: string; name: string; display_name?: string; product_family: string; lifecycle_status: string; is_quote_only: boolean; }
export interface BillingInvoice { id: string; organization_id: string; event_id?: string; invoice_number?: string; offer_name?: string; amount: number; gst_amount: number; total_amount_inr: number; currency: string; status: string; due_date?: string; paid_at?: string; issued_at?: string; created_at: string; commercial_contract_id?: string; version: number; }
export interface BillingInvoiceItem { id: string; invoice_id: string; description: string; amount: number; quantity: number; offer_code?: string; offer_version_id?: string; tax_rate?: number; tax_amount?: number; }
export interface CommercialPayment { id: string; organization_id: string; invoice_id?: string; contract_id?: string; offer_name?: string; amount: number; currency: string; provider: string; provider_transaction_id?: string; provider_event_id?: string; parent_transaction_id?: string | null; refunded_amount?: number | null; status: string; reconciliation_status: string; version: number; created_at: string; updated_at?: string; }
export interface ProviderWebhookReceipt { id: string; organization_id: string; provider: string; provider_event_id: string; event_type: string; status: string; received_at: string; invoice_id?: string | null; transaction_id?: string | null; failure_code?: string | null; }
export interface BillingInvoiceDetail { invoice: BillingInvoice; items: BillingInvoiceItem[]; payments: CommercialPayment[]; reconciled_amount: number; outstanding_amount: number; reconciliation_status: string; }
export interface CreditNote { id: string; credit_note_number: string; organization_id: string; invoice_id: string; amount_inr: number; gst_amount: number; status: string; created_at: string; updated_at: string; version: number; applied_to_invoice_id?: string; }
export interface FinancialAuditEvent { id: string; activity_type: string; entity_type: string; entity_id?: string; entity_name?: string; organization_id?: string; amount_inr?: number; ip_address?: string | null; occurred_at: string; }
export interface RevenueMetric { id: string; organization_id: string; period: string; mrr: number; arr: number; add_on_revenue: number; created_at: string; }
export interface BillingSupportParams { organizationId?: string; supportReason?: string; accessRequestId?: string; limit?: number; }

function supportHeaders(params: BillingSupportParams) { return params.supportReason ? { headers: { "X-Support-Reason": params.supportReason } } : undefined; }
function canonicalPage<T>(items: T[]): CursorPage<T> { return { items, next_cursor: null, has_next: false }; }

function useCanonicalPage<T>(key: string, path: string, params: BillingSupportParams, query: Record<string, string | undefined> = {}, normalize: (item: any) => T = (item) => item as T) {
  const { hasHydrated, isAuthenticated } = useAuthStore();
  return useInfiniteQuery({
    queryKey: queryKeys.admin.domain(key, { ...params, ...query }),
    queryFn: async () => {
      const search = new URLSearchParams();
      if (params.organizationId) search.set("org_id", params.organizationId);
      if (params.limit) search.set("limit", String(params.limit));
      Object.entries(query).forEach(([name, value]) => value && search.set(name, value));
      const suffix = search.toString() ? `?${search.toString()}` : "";
      const result = await apiGet<{ items?: any[] }>(`${path}${suffix}`, supportHeaders(params));
      return canonicalPage((result.items ?? []).map(normalize));
    },
    initialPageParam: null as string | null,
    getNextPageParam: () => undefined,
    enabled: hasHydrated && isAuthenticated && !!params.organizationId && !!params.supportReason && !!params.accessRequestId,
  });
}

export function useWorkspaceOffers() {
  const { hasHydrated, isAuthenticated } = useAuthStore();
  return useQuery({ queryKey: queryKeys.admin.domain("commercial-workspace-offers"), queryFn: () => apiGet<CommercialOffer[]>("/platform/commercial/offers?family=WORKSPACE"), enabled: hasHydrated && isAuthenticated });
}

export function useBillingInvoices(params: BillingSupportParams & { status?: string } = {}) {
  return useCanonicalPage<BillingInvoice>("commercial-invoices", "/platform/invoices", params, { status: params.status }, (item) => ({ ...item, amount: Number(item.amount_inr ?? item.amount ?? 0), issued_at: item.issued_at ?? item.created_at, version: Number(item.version ?? 1) }));
}

export function useBillingInvoiceDetail(invoiceId: string | null, params: BillingSupportParams) {
  const { hasHydrated, isAuthenticated } = useAuthStore();
  return useQuery({
    queryKey: queryKeys.admin.domain("commercial-invoice-detail", { invoiceId, ...params }),
    queryFn: async (): Promise<BillingInvoiceDetail> => {
      const [invoicePage, items] = await Promise.all([
        apiGet<{ items?: any[] }>(`/platform/invoices?org_id=${params.organizationId}&limit=100`, supportHeaders(params)),
        apiGet<BillingInvoiceItem[]>(`/platform/invoices/${invoiceId}/items`, supportHeaders(params)),
      ]);
      const raw = (invoicePage.items ?? []).find((item) => item.id === invoiceId);
      if (!raw) throw new Error("Invoice is not available in the selected commercial scope.");
      const invoice = { ...raw, amount: Number(raw.amount_inr ?? raw.amount ?? 0), version: Number(raw.version ?? 1) } as BillingInvoice;
      return { invoice, items, payments: [], reconciled_amount: invoice.status === "PAID" ? invoice.total_amount_inr : 0, outstanding_amount: invoice.status === "PAID" ? 0 : invoice.total_amount_inr, reconciliation_status: invoice.status === "PAID" ? "RECONCILED" : "PENDING" };
    },
    enabled: hasHydrated && isAuthenticated && !!invoiceId && !!params.organizationId && !!params.supportReason && !!params.accessRequestId,
  });
}

export function useCommercialPayments(params: BillingSupportParams & { reconciliationStatus?: string } = {}) {
  return useCanonicalPage<CommercialPayment>("commercial-payment-ledger", "/platform/financial/transactions", params, {}, (item) => ({ id: item.id, organization_id: item.organization_id, amount: Number(item.amount_inr ?? 0), currency: "INR", provider: item.gateway ?? "UNKNOWN", status: item.status, reconciliation_status: item.status === "COMPLETED" ? "RECONCILED" : "PENDING", version: 1, created_at: item.created_at }));
}

export function useProviderWebhookReceipts(params: BillingSupportParams = {}) {
  const { hasHydrated, isAuthenticated } = useAuthStore();
  return useInfiniteQuery({ queryKey: queryKeys.admin.domain("commercial-provider-webhooks", params), queryFn: async () => canonicalPage<ProviderWebhookReceipt>([]), initialPageParam: null as string | null, getNextPageParam: () => undefined, enabled: hasHydrated && isAuthenticated && !!params.organizationId && !!params.supportReason && !!params.accessRequestId });
}

export function useFinancialAuditTrail(params: BillingSupportParams & { activityType?: string; entityType?: string } = {}) {
  return useCanonicalPage<FinancialAuditEvent>("commercial-audit-trail", "/platform/financial/audit-trail", params, { activity_type: params.activityType }, (item) => ({ id: item.id, activity_type: item.activity_type, entity_type: "COMMERCIAL", organization_id: item.organization_id, amount_inr: item.amount, occurred_at: item.occurred_at }));
}

export function useRevenueMetrics(params: BillingSupportParams = {}) { return useCanonicalPage<RevenueMetric>("commercial-revenue-metrics", "/platform/revenue-metrics", params); }
function unsupportedMutation<T = never>(message: string): Promise<T> { return Promise.reject(new Error(message)); }

export function useInvoiceStatusMutation(params: BillingSupportParams) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: async ({ invoiceId, payload }: { invoiceId: string; payload: Record<string, any>; idempotencyKey?: string }) => { const status = String(payload.status ?? ""); if (status === "VOID") return apiPost(`/platform/invoices/${invoiceId}/void`, { reason: payload.reason }, supportHeaders(params)); if (status === "PAID") return apiPost(`/platform/invoices/${invoiceId}/mark-paid`, { reason: payload.reason }, supportHeaders(params)); return unsupportedMutation("This invoice transition is not supported by the canonical commercial ledger."); }, onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.admin.domain("commercial-invoices") }) });
}

export function useRecordInvoicePayment(params: BillingSupportParams) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: ({ invoiceId, payload }: { invoiceId: string; payload: Record<string, any>; idempotencyKey?: string }) => apiPost(`/platform/invoices/${invoiceId}/mark-paid`, { reason: payload.reason ?? "Verified commercial payment" }, supportHeaders(params)), onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.admin.domain("commercial-invoices") }) });
}

export async function downloadInvoiceArtifact(_invoiceId?: string, _exportId?: string, _params?: BillingSupportParams): Promise<{ download_url: string }> { throw new Error("Invoice artifact downloads are not available in the canonical commercial ledger yet."); }
export function useCreateInvoiceArtifact(_params?: BillingSupportParams) { return useMutation<{ export_id: string; status: string }, Error, { invoiceId: string; version: number; reason: string; idempotencyKey?: string }>({ mutationFn: async (_payload) => unsupportedMutation<{ export_id: string; status: string }>("Invoice artifact generation is not available in the canonical commercial ledger yet.") }); }
export function useInvoiceArtifact(invoiceId?: string | null, _exportId?: string | null, _params?: BillingSupportParams) { return useQuery<{ status: string; failure_reason?: string | null; download_url?: string | null }>({ queryKey: ["commercial-invoice-artifact", invoiceId], queryFn: async () => { throw new Error("Invoice artifact downloads are not available in the canonical commercial ledger yet."); }, enabled: false }); }
export function useCreditNotes(params: BillingSupportParams & { status?: string } = {}) { return useCanonicalPage<CreditNote>("commercial-credit-notes", "/platform/credit-notes", params, { status: params.status }); }
export function useIssueCreditNote(_params?: BillingSupportParams) { return useMutation({ mutationFn: (_payload: { payload: Record<string, unknown>; idempotencyKey?: string }) => unsupportedMutation("Credit-note issuance is not available in the canonical commercial ledger yet.") }); }
export function useCreditNoteStatusMutation(_params?: BillingSupportParams) { return useMutation({ mutationFn: (_payload: { creditNoteId: string; payload: Record<string, unknown>; idempotencyKey?: string }) => unsupportedMutation("Credit-note status changes are not available in the canonical commercial ledger yet.") }); }
export function useReconcileCommercialPayment(_params?: BillingSupportParams) { return useMutation({ mutationFn: (_payload: { paymentId: string; payload: Record<string, unknown>; idempotencyKey?: string }) => unsupportedMutation("Payment reconciliation is managed by the canonical payment provider workflow.") }); }
export function useRefundCommercialPayment(_params?: BillingSupportParams) { return useMutation({ mutationFn: (_payload: { paymentId: string; payload: Record<string, unknown>; idempotencyKey?: string }) => unsupportedMutation("Refunds require an approved commercial amendment and provider reference.") }); }
