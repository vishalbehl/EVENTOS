"use client";

import type { ReactNode } from "react";
import { OrganiserSection } from "../../workspace/OrganiserSection";
import { accessContextCacheKey, useAuthStore } from "@/store/use-auth-store";

export const commercialTabs = [
  ["Overview", "/commercial/overview"],
  ["Plans & Add-ons", "/commercial/workspace"],
  ["Orders", "/commercial/requests"],
  ["Invoices", "/commercial/invoices"],
  ["Payments", "/commercial/payments"],
  ["Payment Methods", "/commercial/payment-methods"],
  ["Usage", "/commercial/usage"],
  ["History & Tax", "/commercial/billing-history"],
].map(([label, href]) => ({ label, href }));
export const asList = (value: any): any[] => Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : [];
export const money = (value: number | null | undefined, currency = "INR") => value == null || !Number.isFinite(value) ? "Unavailable" : new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
export const safeDownloadPart = (value: unknown, fallback: string) => String(value || fallback).replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || fallback;

export function useBillingQueryScope() {
  const user = useAuthStore(state => state.user);
  const activeContext = useAuthStore(state => state.activeContext);
  const supportSession = useAuthStore(state => state.impersonationSessionId);
  return [user?.id, accessContextCacheKey(activeContext, user?.organization_id), supportSession] as const;
}

export function CommercialPage({ actions, children }: { actions?: ReactNode; children: ReactNode }) {
  return <OrganiserSection title="Commercial" description="Manage plans, add-ons, invoices, payments, usage, and tax records in one place." tabs={commercialTabs} actions={actions}>{children}</OrganiserSection>;
}
