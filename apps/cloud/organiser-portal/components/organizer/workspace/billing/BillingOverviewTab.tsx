"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, FileText } from "lucide-react";
import { useCurrentPlan } from "@/hooks/useBilling";
import { apiGet } from "@/lib/api-client";
import { DataTable, Panel, StatusBadge } from "../OrganiserPrimitives";
import { asList, BillingPage, money } from "./shared";

export function BillingOverviewTab() {
  const current = useCurrentPlan();
  const invoices = useQuery({ queryKey: ["organiser", "billing", "overview"], queryFn: () => apiGet<any>("/organiser/billing/overview?page=1&page_size=5") });
  const plan: any = current.data || {};
  const unrestricted = Boolean(plan.unrestricted || plan.is_internal_unrestricted || plan.status === "INTERNAL_UNLIMITED" || plan.source === "INTERNAL_UNRESTRICTED_ORGANIZATION");
  const usage = plan.usage || {};
  return <BillingPage>
    <div className="op-content-grid">
      <Panel title="Subscription details" action={<Link href="/plans-entitlements/overview" className="text-xs font-bold text-[var(--op-primary)]">Manage plan</Link>}>
        <div className="mb-5 flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-md bg-[var(--op-metric-purple)] text-[var(--op-primary)]"><CreditCard className="h-5 w-5" /></span><div><p className="text-lg font-extrabold text-[var(--op-text)]">{unrestricted ? "Internal Unlimited" : plan.plan?.name || plan.plan_name || "Unavailable"}</p><StatusBadge status={unrestricted ? "Active" : plan.status || "Unavailable"} /></div></div>
        <dl className="op-detail-list"><dt>Billing cycle</dt><dd>{unrestricted ? "Not applicable" : plan.billing_cycle || plan.interval || "Unavailable"}</dd><dt>Current period ends</dt><dd>{unrestricted ? "Not applicable" : plan.current_period_end ? new Date(plan.current_period_end).toLocaleDateString() : "Unavailable"}</dd><dt>Entitlement policy</dt><dd>{unrestricted ? "Internal unrestricted" : "Subscription controlled"}</dd></dl>
      </Panel>
      <Panel title="Usage & limits"><div className="space-y-4">{Object.entries(usage).slice(0, 4).map(([key, value]: [string, any]) => { const rawUsed = value?.used ?? value?.used_mb; const used = rawUsed == null ? null : Number(rawUsed); const maximum = value?.max ?? value?.max_mb ?? null; const pct = used != null && maximum ? Math.min(100, used / Number(maximum) * 100) : 0; return <div key={key}><div className="mb-1 flex justify-between text-xs font-bold text-[var(--op-muted)]"><span>{key.replaceAll("_", " ")}</span><span>{used == null ? "Unavailable" : used.toLocaleString()} / {unrestricted || maximum == null ? "Unlimited" : Number(maximum).toLocaleString()}</span></div><div className="h-2 overflow-hidden rounded-full bg-[var(--op-panel-soft)]"><div className="h-full rounded-full bg-[var(--op-primary)]" style={{ width: `${pct}%` }} /></div></div>; })}{!current.isLoading && !Object.keys(usage).length ? <p className="op-state-copy">Usage measurements are unavailable from the active subscription.</p> : null}</div></Panel>
    </div>
    <Panel title="Recent invoices" action={<Link href="/billing/invoices" className="text-xs font-bold text-[var(--op-primary)]">View all invoices</Link>} className="p-0"><DataTable columns={["Reference", "Issued", "Due", "Status", "Amount"]} rows={asList(invoices.data).map((row) => [<span key={row.id} className="flex items-center gap-2"><FileText className="h-4 w-4 text-[var(--op-primary)]" />{row.reference || row.id}</span>, row.issued_at ? new Date(row.issued_at).toLocaleDateString() : "-", row.due_date ? new Date(row.due_date).toLocaleDateString() : "-", <StatusBadge key={`${row.id}-status`} status={row.status || "Unavailable"} />, money(Number(row.amount), row.currency || "INR")])} empty={invoices.isError ? "Invoice data is unavailable." : "No invoices found."} /></Panel>
  </BillingPage>;
}
