"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api-client";
import { useRef } from "react";
import { accessContextCacheKey, useAuthStore } from "@/store/use-auth-store";

export type CloudOffer = {
  id: string;
  code: string;
  product_family:
    "WORKSPACE" | "EVENT" | "EMC" | "CAPACITY_ADDON" | "VENUE" | "VENUE_ADDON";
  name: string;
  display_name: string;
  description?: string | null;
  scope_type: string;
  is_quote_only: boolean;
  lifecycle_status: string;
  version_id: string;
  version_number: number;
  effective_from: string;
  eligible_addon_codes: string[];
  prices: Array<{
    billing_interval: string;
    pricing_unit: string;
    amount: number;
    currency: string;
    tax_mode: string;
  }>;
  entitlements: Array<{
    key: string;
    scope_type: string;
    quantity?: number | null;
    unit_type?: string | null;
    value_type: string;
  }>;
};

export type CloudPricingPreview = {
  price_book_version: string;
  quote_required: boolean;
  currency: string;
  line_items: Array<{
    code: string;
    display_name: string;
    product_family: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    billing_interval: string;
  }>;
  subtotal: number;
  gst_rate: number;
  gst: number;
  total: number;
  warnings: string[];
};

export type CloudCartCheckoutResponse = {
  items: Array<{
    contract_id: string;
    contract_type: string;
    contract_status: string;
    invoice_id: string;
    invoice_status: string;
    subtotal: number;
    gst: number;
    total: number;
    payment_required: boolean;
  }>;
  invoice_count: number;
};

export type CloudMockPaymentResponse = {
  status: "PAID";
  paid_at: string;
  payment_reference: string;
  invoice_ids: string[];
  activated_contract_ids: string[];
  total: number;
  currency: string;
};

const baseKeys = {
  overview: ["cloud-commercial", "overview"] as const,
  catalog: ["cloud-commercial", "catalog"] as const,
  pendingCheckout: ["cloud-commercial", "pending-checkout"] as const,
  account: ["cloud-commercial", "account"] as const,
  contracts: ["cloud-commercial", "contracts"] as const,
  usage: ["cloud-commercial", "usage"] as const,
  requests: ["cloud-commercial", "requests"] as const,
  capacityPurchases: ["cloud-commercial", "capacity-purchases"] as const,
  emcWorkspaces: ["cloud-commercial", "emc-workspaces"] as const,
  emcAllocations: ["cloud-commercial", "emc-allocations"] as const,
  internalEnterprise: ["cloud-commercial", "internal-enterprise"] as const,
};

export type CommercialOverview = {
  plan?: {
    name: string;
    status: string;
    unrestricted?: boolean;
    billing_cycle?: string | null;
    renews_at?: string | null;
  };
  account: {
    account_type: string;
    status: string;
    currency?: string;
    version?: number;
  };
  active_contracts: number;
  next_payment?: {
    amount: number;
    currency: string;
    due_at?: string | null;
  } | null;
  contracts: any[];
  usage: { items?: any[] };
  open_orders: number;
  recent_orders: any[];
  purchased_addons: number;
  recent_purchases: any[];
  commitment_trend: Array<{ month: string; amount: number }>;
  recent_transactions: Array<{
    id: string;
    reference?: string | null;
    amount: number;
    currency: string;
    status: string;
    issued_at: string;
  }>;
  source: string;
};

export type InternalEnterpriseSummary = {
  plan: {
    name: string;
    status: string;
    billing_cycle: string;
    renews_at?: string | null;
    unrestricted: true;
  };
  usage: Record<string, { used: number; max: null }>;
  recent_invoices: Array<{
    id: string;
    reference?: string | null;
    amount: number;
    currency: string;
    status: string;
    issued_at: string;
  }>;
  outstanding: number;
  invoice_count: number;
  default_payment_method: null;
  commercial: CommercialOverview;
  freshness_at: string;
  source: string;
};

function useCommercialKeys() {
  const userId = useAuthStore((state) => state.user?.id);
  const loginOrganizationId = useAuthStore(
    (state) => state.user?.organization_id,
  );
  const activeContext = useAuthStore((state) => state.activeContext);
  const supportSession = useAuthStore((state) => state.impersonationSessionId);
  const contextKey = accessContextCacheKey(activeContext, loginOrganizationId);
  return Object.fromEntries(
    Object.entries(baseKeys).map(([name, key]) => [
      name,
      [key[0], userId, contextKey, supportSession, key[1]],
    ]),
  ) as unknown as Record<keyof typeof baseKeys, readonly unknown[]>;
}

function useStableMutationReceipts() {
  const receipts = useRef(new Map<string, string>());
  return {
    key(signature: string) {
      const existing = receipts.current.get(signature);
      if (existing) return existing;
      const created = crypto.randomUUID();
      receipts.current.set(signature, created);
      return created;
    },
    clear(signature: string) {
      receipts.current.delete(signature);
    },
  };
}

export function useCloudCatalog(family?: string, enabled = true) {
  const keys = useCommercialKeys();
  return useQuery({
    queryKey: [...keys.catalog, family || "all"],
    queryFn: ({ signal }) =>
      apiGet<CloudOffer[]>(
        `/commercial/catalog${family ? `?family=${encodeURIComponent(family)}` : ""}`,
        { signal },
      ),
    enabled,
    staleTime: 60_000,
  });
}

export function useCloudCommercialAccount(enabled = true) {
  const keys = useCommercialKeys();
  return useQuery({
    queryKey: keys.account,
    queryFn: ({ signal }) => apiGet<any>("/commercial/account", { signal }),
    enabled,
    staleTime: 30_000,
  });
}

export function useCloudCommercialOverview(enabled = true) {
  const keys = useCommercialKeys();
  return useQuery({
    queryKey: keys.overview,
    queryFn: ({ signal }) =>
      apiGet<CommercialOverview>("/commercial/overview", { signal }),
    enabled,
    staleTime: 30_000,
  });
}

export function useCloudContracts(enabled = true) {
  const keys = useCommercialKeys();
  return useQuery({
    queryKey: keys.contracts,
    queryFn: ({ signal }) => apiGet<any[]>("/commercial/contracts", { signal }),
    enabled,
    staleTime: 30_000,
  });
}

export function useCloudUsage(eventId?: string, enabled = true) {
  const keys = useCommercialKeys();
  return useQuery({
    queryKey: [...keys.usage, eventId || "all"],
    queryFn: ({ signal }) =>
      apiGet<any>(
        `/commercial/usage${eventId ? `?event_id=${encodeURIComponent(eventId)}` : ""}`,
        { signal },
      ),
    enabled,
    staleTime: 30_000,
  });
}

export function useCloudCommercialRequests(enabled = true) {
  const keys = useCommercialKeys();
  return useQuery({
    queryKey: keys.requests,
    queryFn: ({ signal }) => apiGet<any[]>("/commercial/requests", { signal }),
    enabled,
    staleTime: 30_000,
  });
}

export function useCloudCapacityPurchases(enabled = true) {
  const keys = useCommercialKeys();
  return useQuery({
    queryKey: keys.capacityPurchases,
    queryFn: ({ signal }) =>
      apiGet<any[]>("/commercial/capacity-purchases", { signal }),
    enabled,
    staleTime: 30_000,
  });
}

export function useInternalEnterpriseSummary(enabled = true) {
  const keys = useCommercialKeys();
  return useQuery({
    queryKey: keys.internalEnterprise,
    queryFn: ({ signal }) =>
      apiGet<InternalEnterpriseSummary>(
        "/organiser/internal-enterprise/summary",
        { signal },
      ),
    enabled,
    retry: false,
    staleTime: 30_000,
  });
}

export function useEmcWorkspaces(enabled = true) {
  const keys = useCommercialKeys();
  return useQuery({
    queryKey: keys.emcWorkspaces,
    queryFn: ({ signal }) =>
      apiGet<any[]>("/commercial/emc/workspaces", { signal }),
    enabled,
    staleTime: 30_000,
  });
}

export function useCreateEmcWorkspace() {
  const keys = useCommercialKeys();
  const client = useQueryClient();
  const receipt = useRef<{ signature: string; key: string } | null>(null);
  return useMutation({
    retry: false,
    mutationFn: ({
      organization_id,
      reason,
      version,
    }: {
      organization_id: string;
      reason: string;
      version: number;
    }) => {
      const signature = JSON.stringify([
        keys.emcWorkspaces,
        organization_id,
        reason,
        version,
      ]);
      if (receipt.current?.signature !== signature)
        receipt.current = { signature, key: crypto.randomUUID() };
      return apiPost<any>(
        "/commercial/emc/workspaces",
        { organization_id, reason },
        {
          headers: {
            "If-Match": String(version),
            "Idempotency-Key": receipt.current.key,
          },
        },
      );
    },
    onSuccess: () => {
      receipt.current = null;
      return Promise.all([
        client.invalidateQueries({ queryKey: keys.emcWorkspaces }),
        client.invalidateQueries({ queryKey: keys.account }),
      ]);
    },
  });
}

export function useEmcAllocations(enabled = true) {
  const keys = useCommercialKeys();
  return useQuery({
    queryKey: keys.emcAllocations,
    queryFn: ({ signal }) =>
      apiGet<any[]>("/commercial/emc/allocations", { signal }),
    enabled,
    staleTime: 30_000,
  });
}

export function useCreateEmcAllocation() {
  const keys = useCommercialKeys();
  const client = useQueryClient();
  const receipts = useStableMutationReceipts();
  return useMutation({
    mutationFn: (payload: {
      client_workspace_id: string;
      entitlement_key: string;
      quantity: number;
      event_id?: string;
      reason: string;
    }) =>
      apiPost<any>("/commercial/emc/allocations", payload, {
        headers: {
          "Idempotency-Key": receipts.key(
            JSON.stringify([keys.emcAllocations, payload]),
          ),
        },
      }),
    onSuccess: (_, payload) => {
      receipts.clear(JSON.stringify([keys.emcAllocations, payload]));
      return client.invalidateQueries({ queryKey: keys.emcAllocations });
    },
  });
}

export function useTransferEmcAllocation() {
  const keys = useCommercialKeys();
  const client = useQueryClient();
  const receipts = useStableMutationReceipts();
  return useMutation({
    mutationFn: (payload: {
      source_allocation_id: string;
      target_allocation_id: string;
      entitlement_key: string;
      quantity: number;
      reason: string;
    }) =>
      apiPost<any>("/commercial/emc/allocations/transfers", payload, {
        headers: {
          "Idempotency-Key": receipts.key(
            JSON.stringify([keys.emcAllocations, "transfer", payload]),
          ),
        },
      }),
    onSuccess: (_, payload) => {
      receipts.clear(
        JSON.stringify([keys.emcAllocations, "transfer", payload]),
      );
      return client.invalidateQueries({ queryKey: keys.emcAllocations });
    },
  });
}

export function useCloudPricingPreview() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: any) =>
      apiPost<CloudPricingPreview>("/commercial/pricing/preview", payload),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["cloud-commercial"] }),
  });
}

export function useCloudCheckout() {
  const keys = useCommercialKeys();
  const client = useQueryClient();
  const receipts = useStableMutationReceipts();
  return useMutation({
    mutationFn: (payload: any) =>
      apiPost<any>("/commercial/checkout", payload, {
        headers: {
          "Idempotency-Key": receipts.key(
            JSON.stringify([keys.account, "checkout", payload]),
          ),
        },
      }),
    onSuccess: (_, payload) => {
      receipts.clear(JSON.stringify([keys.account, "checkout", payload]));
      return client.invalidateQueries({ queryKey: ["cloud-commercial"] });
    },
  });
}

export function useCloudCartCheckout() {
  const keys = useCommercialKeys();
  const client = useQueryClient();
  const receipts = useStableMutationReceipts();
  return useMutation({
    mutationFn: (payload: { items: any[] }) =>
      apiPost<CloudCartCheckoutResponse>("/commercial/cart/checkout", payload, {
        headers: {
          "Idempotency-Key": receipts.key(
            JSON.stringify([keys.account, "cart-checkout", payload]),
          ),
        },
      }),
    onSuccess: (_, payload) => {
      receipts.clear(JSON.stringify([keys.account, "cart-checkout", payload]));
      // Checkout has already returned the authoritative invoice identifiers.
      // Mark commercial snapshots stale without refetching them between
      // checkout and payment confirmation; an eager catalogue refresh can be
      // substantially more expensive than the payment transition itself.
      void client.invalidateQueries({
        queryKey: ["cloud-commercial"],
        refetchType: "none",
      });
    },
  });
}

export function useCloudPendingCheckout(enabled = true) {
  const keys = useCommercialKeys();
  return useQuery({
    queryKey: keys.pendingCheckout,
    queryFn: ({ signal }) =>
      apiGet<CloudCartCheckoutResponse | null>(
        "/commercial/cart/pending-payment",
        { signal },
      ),
    enabled,
    staleTime: 0,
  });
}

export function useCloudMockPayment() {
  const keys = useCommercialKeys();
  const client = useQueryClient();
  const receipts = useStableMutationReceipts();
  return useMutation({
    mutationFn: (payload: { invoice_ids: string[] }) =>
      apiPost<CloudMockPaymentResponse>(
        "/commercial/cart/mock-payment",
        payload,
        {
          headers: {
            "Idempotency-Key": receipts.key(
              JSON.stringify([keys.account, "mock-payment", payload]),
            ),
          },
        },
      ),
    onSuccess: (_, payload) => {
      receipts.clear(JSON.stringify([keys.account, "mock-payment", payload]));
      // A successful settlement is authoritative: no completed checkout may
      // remain eligible for recovery or reopen the payment dialog from cache.
      client.setQueryData(keys.pendingCheckout, null);
      // Render the confirmed receipt immediately. Mounted dashboards do not
      // need to block the success state while every commercial projection is
      // reloaded; the invalidated data refreshes on its next normal read.
      void client.invalidateQueries({ queryKey: ["events"], refetchType: "none" });
      void client.invalidateQueries({ queryKey: ["event"], refetchType: "none" });
      void client.invalidateQueries({ queryKey: keys.contracts });
      void client.invalidateQueries({ queryKey: keys.overview });
      void client.invalidateQueries({ queryKey: keys.usage });
    },
  });
}

export function useCloudCapacityPurchase() {
  const keys = useCommercialKeys();
  const client = useQueryClient();
  const receipts = useStableMutationReceipts();
  return useMutation({
    mutationFn: (payload: any) =>
      apiPost<any>("/commercial/capacity-purchases", payload, {
        headers: {
          "Idempotency-Key": receipts.key(
            JSON.stringify([keys.capacityPurchases, payload]),
          ),
        },
      }),
    onSuccess: (_, payload) => {
      receipts.clear(JSON.stringify([keys.capacityPurchases, payload]));
      return client.invalidateQueries({ queryKey: ["cloud-commercial"] });
    },
  });
}

export function useCloudCommercialRequest() {
  const keys = useCommercialKeys();
  const client = useQueryClient();
  const receipts = useStableMutationReceipts();
  return useMutation({
    mutationFn: (payload: any) =>
      apiPost<any>("/commercial/requests", payload, {
        headers: {
          "Idempotency-Key": receipts.key(
            JSON.stringify([keys.requests, payload]),
          ),
        },
      }),
    onSuccess: (_, payload) => {
      receipts.clear(JSON.stringify([keys.requests, payload]));
      return client.invalidateQueries({ queryKey: keys.requests });
    },
  });
}

export function useAcceptCloudCommercialQuote() {
  const keys = useCommercialKeys();
  const client = useQueryClient();
  const receipts = useStableMutationReceipts();
  return useMutation({
    mutationFn: (payload: { requestId: string; expectedVersion: number }) =>
      apiPost<any>(
        `/commercial/requests/${payload.requestId}/accept-quote`,
        undefined,
        {
          headers: {
            "If-Match": String(payload.expectedVersion),
            "Idempotency-Key": receipts.key(
              JSON.stringify([keys.requests, "accept", payload]),
            ),
          },
        },
      ),
    onSuccess: (_, payload) => {
      receipts.clear(JSON.stringify([keys.requests, "accept", payload]));
      return client.invalidateQueries({ queryKey: keys.requests });
    },
  });
}

export function useCloudCancelContract() {
  const keys = useCommercialKeys();
  const client = useQueryClient();
  const receipts = useStableMutationReceipts();
  return useMutation({
    mutationFn: (payload: {
      contractId: string;
      expectedVersion: number;
      reason: string;
    }) =>
      apiPost<any>(
        `/commercial/contracts/${payload.contractId}/cancel`,
        { reason: payload.reason },
        {
          headers: {
            "If-Match": String(payload.expectedVersion),
            "Idempotency-Key": receipts.key(
              JSON.stringify([keys.contracts, "cancel", payload]),
            ),
          },
        },
      ),
    onSuccess: (_, payload) => {
      receipts.clear(JSON.stringify([keys.contracts, "cancel", payload]));
      return client.invalidateQueries({ queryKey: keys.contracts });
    },
  });
}
