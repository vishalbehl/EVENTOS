"use client";

import type { ReactNode } from "react";
import { Banknote, CreditCard, Receipt, WalletCards } from "lucide-react";
import { useBillingHistory, useCurrentPlan } from "@/hooks/useBilling";
import { MetricCard } from "../OrganiserPrimitives";
import { OrganiserSection } from "../OrganiserSection";

export const billingTabs = [["Overview", "/billing/overview"], ["Subscription", "/billing/subscription"], ["Invoices", "/billing/invoices"], ["Payments", "/billing/payments"], ["Receipts", "/billing/receipts"], ["Tax & GST", "/billing/tax"]].map(([label, href]) => ({ label, href }));
export const asList = (value: any): any[] => Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : [];
export const money = (value: number | null | undefined, currency = "INR") => value == null || !Number.isFinite(value) ? "Unavailable" : new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);

export function BillingPage({ actions, children }: { actions?: ReactNode; children: ReactNode }) {
  const history = useBillingHistory();
  const current = useCurrentPlan();
  const records = asList(history.data);
  const paid = records.reduce((sum, row) => sum + Number(row.amount_paid ?? row.amount ?? 0), 0);
  const due = records.filter((row) => String(row.status).toLowerCase().includes("due")).reduce((sum, row) => sum + Number(row.balance_due || row.amount || 0), 0);
  const plan: any = current.data || {};
  const unrestricted = plan.status === "INTERNAL_UNLIMITED" || plan.source === "INTERNAL_UNRESTRICTED_ORGANIZATION" || plan.unrestricted || plan.is_internal_unrestricted;
  return <OrganiserSection title="Billing" description="Manage the organisation subscription, invoices, receipts, payments, and tax records." tabs={billingTabs} actions={actions}>
    <div className="op-metric-grid"><MetricCard label="Total paid" value={history.isError ? "Unavailable" : money(paid)} tone="purple" icon={<Banknote className="h-5 w-5" />} /><MetricCard label="Invoices" value={history.isError ? "Unavailable" : records.length} tone="blue" icon={<Receipt className="h-5 w-5" />} /><MetricCard label="Current plan" value={unrestricted ? "Internal Unlimited" : plan.plan?.name || plan.plan_name || "Unavailable"} tone="green" icon={<CreditCard className="h-5 w-5" />} /><MetricCard label="Due" value={history.isError ? "Unavailable" : money(due)} tone="amber" icon={<WalletCards className="h-5 w-5" />} /></div>
    {children}
  </OrganiserSection>;
}
