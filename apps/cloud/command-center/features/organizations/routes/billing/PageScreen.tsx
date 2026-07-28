"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { CircleDollarSign, FileText } from "lucide-react";
import { useOrganizationDomain } from "@/features/organizations/api/organization-console-api";
import {
  OrgPageHeader, OrgCard, OrgTabBar, OrgDataTable, OrgStatusBadge,
  OrgSectionTitle, OrgMetricCard, UnavailableDomain, LoadingPage,
} from "@/features/organizations/components/OrgPageShared";

function formatCurrency(amount: number | null) {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

export default function BillingPageScreen() {
  const params = useParams<{ orgId: string }>();
  const [activeTab, setActiveTab] = useState("overview");
  const { data, isLoading } = useOrganizationDomain(params.orgId, "billing");

  if (isLoading) return <LoadingPage />;
  if (!data?.availability?.available) return <UnavailableDomain reason={data?.availability?.reason} />;

  const domainData = data?.data as any;
  const subscriptions: any[] = domainData?.subscriptions ?? [];
  const invoiceAgg = domainData?.invoices ?? { count: 0, total: 0 };
  const invoices: any[] = invoiceAgg.items ?? [];
  const payments: any[] = domainData?.payments ?? [];
  const paymentMethods: any[] = domainData?.payment_methods ?? [];
  const active = subscriptions.find((s: any) => s.status === "active") ?? subscriptions[0];

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "invoices", label: "Invoices" },
    { key: "subscriptions", label: "History" },
    { key: "payments", label: "Payments & refunds" },
    { key: "methods", label: "Payment methods" },
  ];

  return (
    <div className="p-6 space-y-6">
      <OrgPageHeader
        icon={CircleDollarSign}
        title="Subscription & Billing"
        description="Manage your plan, usage, invoices and payment methods."
        generatedAt={data?.generated_at}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <OrgMetricCard label="Current Plan" value={active?.status ? active.status.toUpperCase() : "No subscription"} />
        <OrgMetricCard label="Period End" value={active?.current_period_end ? new Date(active.current_period_end).toLocaleDateString() : "—"} />
        <OrgMetricCard label="Total Invoices" value={invoiceAgg.count ?? 0} />
        <OrgMetricCard label="Total Billed" value={formatCurrency(invoiceAgg.total)} />
      </div>

      <OrgTabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {activeTab === "overview" && active && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <OrgCard>
            <OrgSectionTitle>Subscription Details</OrgSectionTitle>
            <div className="space-y-3">
              {[
                { label: "Plan ID", value: active.plan_id },
                { label: "Status", value: active.status },
                { label: "Trial Ends", value: active.trial_ends_at ? new Date(active.trial_ends_at).toLocaleDateString() : "N/A" },
                { label: "Period End", value: active.current_period_end ? new Date(active.current_period_end).toLocaleDateString() : "—" },
                { label: "Auto-renew", value: active.cancel_at_period_end ? "Off (cancels at period end)" : "On" },
                { label: "Created", value: active.created_at ? new Date(active.created_at).toLocaleDateString() : "—" },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-center border-b border-[var(--border-subtle)] pb-2 last:border-0">
                  <span className="text-xs text-[var(--text-tertiary)]">{label}</span>
                  <span className="text-xs font-bold text-[var(--text-primary)]">{value || "—"}</span>
                </div>
              ))}
            </div>
          </OrgCard>

          <OrgCard>
            <OrgSectionTitle>Invoice Summary</OrgSectionTitle>
            <div className="text-4xl font-black text-[var(--text-primary)] mb-1">
              {formatCurrency(invoiceAgg.total)}
            </div>
            <p className="text-xs text-[var(--text-tertiary)] mb-4">Total billed across {invoiceAgg.count} invoice{invoiceAgg.count !== 1 ? "s" : ""}</p>
            <div className="rounded-xl bg-[var(--bg-surface-3)] border border-[var(--border-subtle)] p-3 flex items-center gap-3">
              <FileText className="w-4 h-4 text-[var(--text-tertiary)]" />
              <div>
                <p className="text-xs font-bold text-[var(--text-primary)]">Invoice history</p>
                <p className="text-[10px] text-[var(--text-tertiary)]">Switch to the Invoices tab to view all records</p>
              </div>
            </div>
          </OrgCard>
        </div>
      )}

      {activeTab === "overview" && !active && (
        <OrgCard>
          <p className="text-xs text-[var(--text-tertiary)]">No active subscription found for this organization.</p>
        </OrgCard>
      )}

      {activeTab === "invoices" && (
        <OrgDataTable columns={[
          { key: "number", header: "Invoice", render: (row: any) => <div><p className="text-xs font-bold">{row.invoice_number || row.id}</p><p className="text-[10px] text-[var(--text-tertiary)]">{row.items?.length ?? 0} line items</p></div> },
          { key: "event", header: "Event", render: (row: any) => <span className="font-mono text-[10px]">{row.event_id || "Organization"}</span> },
          { key: "amount", header: "Total", render: (row: any) => <span className="text-xs font-bold">{new Intl.NumberFormat("en-US", { style: "currency", currency: row.currency || "INR" }).format(Number(row.total_amount_inr || row.amount || 0))}</span> },
          { key: "status", header: "Status", render: (row: any) => <OrgStatusBadge status={row.status} /> },
          { key: "issued", header: "Issued / due", render: (row: any) => <span className="text-[10px]">{row.issued_at ? new Date(row.issued_at).toLocaleDateString() : "—"}<br />{row.due_date ? new Date(row.due_date).toLocaleDateString() : "No due date"}</span> },
        ]} rows={invoices} keyFn={(row: any) => row.id} emptyMessage="No invoice records found" />
      )}

      {activeTab === "payments" && <OrgDataTable columns={[
        { key: "provider", header: "Provider reference", render: (row: any) => <div><p className="text-xs font-bold">{row.provider}</p><p className="font-mono text-[10px] text-[var(--text-tertiary)]">{row.provider_transaction_id || "No provider reference"}</p></div> },
        { key: "invoice", header: "Invoice", render: (row: any) => <span className="font-mono text-[10px]">{row.invoice_id || "Unlinked"}</span> },
        { key: "amount", header: "Amount / refunded", render: (row: any) => <span className="text-xs">{Number(row.amount).toFixed(2)} {row.currency}<br /><span className="text-[10px] text-[var(--text-tertiary)]">Refunded {Number(row.refunded_amount || 0).toFixed(2)}</span></span> },
        { key: "status", header: "Status", render: (row: any) => <OrgStatusBadge status={row.status} /> },
        { key: "reconciliation", header: "Reconciliation", render: (row: any) => <OrgStatusBadge status={row.reconciliation_status} /> },
      ]} rows={payments} keyFn={(row: any) => row.id} emptyMessage="No payment or refund records found" />}

      {activeTab === "methods" && <OrgCard><OrgSectionTitle>Masked payment methods</OrgSectionTitle><p className="mb-3 text-[10px] text-[var(--text-tertiary)]">Provider tokens and complete payment credentials are never exposed.</p><OrgDataTable columns={[
        { key: "provider", header: "Provider", render: (row: any) => <span className="text-xs font-bold">{row.provider}</span> },
        { key: "card", header: "Method", render: (row: any) => <span className="text-xs">{row.card_brand || "Payment method"} •••• {row.card_last4 || "••••"}</span> },
        { key: "default", header: "Default", render: (row: any) => <OrgStatusBadge status={row.is_default ? "DEFAULT" : "AVAILABLE"} /> },
        { key: "created", header: "Created", render: (row: any) => <span className="text-[10px]">{row.created_at ? new Date(row.created_at).toLocaleDateString() : "—"}</span> },
      ]} rows={paymentMethods} keyFn={(row: any) => row.id} emptyMessage="No payment methods recorded" /></OrgCard>}

      {activeTab === "subscriptions" && (
        <OrgDataTable
          columns={[
            { key: "status", header: "Status", render: (s: any) => <OrgStatusBadge status={s.status?.toUpperCase()} /> },
            { key: "plan", header: "Plan", render: (s: any) => (
              <span className="text-xs font-mono text-[var(--text-secondary)]">{s.plan_id?.slice(0, 18) || "—"}</span>
            )},
            { key: "period_end", header: "Period End", render: (s: any) => (
              <span className="text-[10px] font-mono text-[var(--text-tertiary)]">
                {s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : "—"}
              </span>
            )},
            { key: "cancel", header: "Cancel at Period End", render: (s: any) => (
              <span className="text-[10px] font-bold text-[var(--text-secondary)]">
                {s.cancel_at_period_end ? "Yes" : "No"}
              </span>
            )},
            { key: "created", header: "Created", render: (s: any) => (
              <span className="text-[10px] font-mono text-[var(--text-tertiary)]">
                {s.created_at ? new Date(s.created_at).toLocaleDateString() : "—"}
              </span>
            )},
          ]}
          rows={subscriptions}
          keyFn={(s: any) => s.id}
          emptyMessage="No subscription records found"
        />
      )}
    </div>
  );
}
