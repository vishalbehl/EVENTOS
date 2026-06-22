"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api-client";

export type BillingApiRecord = Record<string, any>;

const billingKeys = {
  currentPlan: ["billing", "current-plan"] as const,
  plans: ["billing", "plans"] as const,
  featureMatrix: ["billing", "feature-matrix"] as const,
  addons: ["billing", "addons"] as const,
  history: ["billing", "history"] as const,
  cart: ["billing", "cart"] as const,
};

function invalidateBilling(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["billing"] });
}

export function useCurrentPlan() {
  return useQuery({
    queryKey: billingKeys.currentPlan,
    queryFn: () => apiGet<BillingApiRecord>("/billing/plan"),
    staleTime: 60_000,
  });
}

export function usePlans() {
  return useQuery({
    queryKey: billingKeys.plans,
    queryFn: () => apiGet<BillingApiRecord[]>("/organisations/plans"),
    staleTime: 5 * 60_000,
  });
}

export function useFeatureMatrix() {
  return useQuery({
    queryKey: billingKeys.featureMatrix,
    queryFn: () => apiGet<BillingApiRecord[] | BillingApiRecord>("/organisations/features/matrix"),
    staleTime: 5 * 60_000,
  });
}

export function useAddons() {
  return useQuery({
    queryKey: billingKeys.addons,
    queryFn: () => apiGet<BillingApiRecord[]>("/organisations/addons"),
    staleTime: 5 * 60_000,
  });
}

export function useBillingHistory() {
  return useQuery({
    queryKey: billingKeys.history,
    queryFn: () => apiGet<BillingApiRecord[] | { items?: BillingApiRecord[] }>("/organisations/me/billing-history"),
    staleTime: 60_000,
  });
}

export function useBillingCart() {
  return useQuery({
    queryKey: billingKeys.cart,
    queryFn: () => apiGet<BillingApiRecord>("/organisations/calculate-price"),
    staleTime: 10_000,
  });
}

export function useSelectPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: BillingApiRecord) => apiPost("/organisations/calculate-price", payload),
    onSuccess: () => invalidateBilling(qc),
  });
}

export function useSelectAddon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: BillingApiRecord) => apiPost("/organisations/calculate-price", payload),
    onSuccess: () => invalidateBilling(qc),
  });
}

export function useRemoveAddon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: BillingApiRecord) => apiPost("/organisations/calculate-price", payload),
    onSuccess: () => invalidateBilling(qc),
  });
}

export function useCheckout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: BillingApiRecord) => apiPost("/organisations/me/subscribe", payload),
    onSuccess: () => invalidateBilling(qc),
  });
}
