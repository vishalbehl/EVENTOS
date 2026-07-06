"use client";

import { useMemo } from "react";
import { FileText, Landmark, Receipt, Wallet } from "lucide-react";
import { useBillingHistory } from "@/hooks/useBilling";
import {
  EnterpriseEmptyState,
  EnterprisePageIntro,
  EnterprisePanel,
  EnterpriseStatCard,
} from "@/components/organizer/platform/EnterprisePortal";

function getHistoryItems(history: any): Array<Record<string, any>> {
  if (Array.isArray(history)) return history;
  if (Array.isArray(history?.items)) return history.items;
  return [];
}

function formatCurrency(amount: number) {
  return `₹${amount.toLocaleString("en-IN")}`;
}

export default function BillingPage() {
  const { data: billingHistory } = useBillingHistory();

  const metrics = useMemo(() => {
    const items = getHistoryItems(billingHistory);
    const totalSpent = items.reduce(
      (sum, item) => sum + Number(item.amount_paid ?? item.amount ?? item.total ?? 0),
      0
    );
    const unpaidAmount = items
      .filter((item) => String(item.status || "").toLowerCase().includes("due"))
      .reduce((sum, item) => sum + Number(item.balance_due ?? item.amount_due ?? item.amount ?? 0), 0);
    const paymentMethods = new Set(
      items
        .map((item) => item.payment_method || item.method)
        .filter(Boolean)
        .map((value) => String(value))
    );

    return {
      totalSpent,
      unpaidAmount,
      invoiceCount: items.length,
      paymentMethods: paymentMethods.size,
    };
  }, [billingHistory]);

  const items = getHistoryItems(billingHistory);

  return (
    <div className="space-y-6 pb-8">
      <EnterprisePageIntro
        title="Billing"
        subtitle="View your invoices and payment history."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <EnterpriseStatCard
          label="Total Spent"
          value={formatCurrency(metrics.totalSpent)}
          hint={metrics.totalSpent > 0 ? "Across your organizer account" : "No transactions yet"}
        />
        <EnterpriseStatCard
          label="Unpaid Amount"
          value={formatCurrency(metrics.unpaidAmount)}
          hint={metrics.unpaidAmount > 0 ? "Outstanding invoices require action" : "No outstanding payments"}
        />
        <EnterpriseStatCard
          label="Invoices"
          value={String(metrics.invoiceCount)}
          hint={metrics.invoiceCount > 0 ? "Billing documents available" : "No invoices"}
        />
        <EnterpriseStatCard
          label="Payment Methods"
          value={String(metrics.paymentMethods)}
          hint={metrics.paymentMethods > 0 ? "Methods used in history" : "No payment methods"}
        />
      </div>

      <EnterprisePanel className="overflow-hidden">
        {items.length === 0 ? (
          <EnterpriseEmptyState
            icon={Receipt}
            title="No billing history"
            description="Your invoices and payment history will appear here once you purchase a subscription."
            actionLabel="Choose a Plan"
            actionHref="/subscriptions"
          />
        ) : (
          <div>
            <div className="border-b border-slate-200 px-6 py-4">
              <div className="grid grid-cols-[1.5fr_1fr_1fr_auto] gap-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                <span>Invoice</span>
                <span>Date</span>
                <span>Method</span>
                <span className="text-right">Amount</span>
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {items.map((item, index) => (
                <div
                  key={`${item.id || item.invoice_number || "invoice"}-${index}`}
                  className="grid grid-cols-[1.5fr_1fr_1fr_auto] gap-4 px-6 py-5"
                >
                  <div>
                    <p className="text-[14px] font-semibold text-slate-950">
                      {item.invoice_number || item.reference || `INV-${index + 1}`}
                    </p>
                    <p className="mt-1 text-[12px] text-slate-500">
                      {item.status || "Processed"}
                    </p>
                  </div>
                  <p className="text-[13px] text-slate-500">
                    {item.created_at
                      ? new Date(item.created_at).toLocaleDateString("en-IN")
                      : "Pending"}
                  </p>
                  <p className="text-[13px] capitalize text-slate-500">
                    {item.payment_method || item.method || "Online"}
                  </p>
                  <p className="text-right text-[14px] font-semibold text-slate-950">
                    {formatCurrency(Number(item.amount_paid ?? item.amount ?? item.total ?? 0))}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </EnterprisePanel>

      <EnterprisePanel className="p-6">
        <p className="text-center text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          We accept
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {[
            { label: "Visa", icon: Wallet },
            { label: "Mastercard", icon: Landmark },
            { label: "UPI", icon: FileText },
            { label: "Paytm", icon: Wallet },
            { label: "Stripe", icon: Receipt },
            { label: "Razorpay", icon: Landmark },
          ].map((method) => (
            <div
              key={method.label}
              className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] font-semibold text-slate-600"
            >
              <method.icon className="h-4 w-4 text-violet-500" />
              {method.label}
            </div>
          ))}
        </div>
      </EnterprisePanel>
    </div>
  );
}
