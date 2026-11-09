"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/api-client";
import { isPlatformSelfSession, useAuthStore } from "@/store/use-auth-store";
import { Panel, StatusBadge } from "../../workspace/OrganiserPrimitives";
import { money, useBillingQueryScope } from "./shared";

type Summary = {
  plan: { name: string; status: string; billing_cycle?: string | null; renews_at?: string | null; unrestricted?: boolean };
  outstanding: number;
  invoice_count: number;
  usage: Record<string, { used: number; max: number | null }>;
  recent_invoices: Array<{ id: string; reference?: string; status: string; amount: number; currency: string; issued_at: string }>;
  default_payment_method?: { id: string; provider: string; card_brand?: string; card_last4?: string; expires_month?: number; expires_year?: number } | null;
};

export function CommercialBillingOverviewContent() {
  const scope = useBillingQueryScope();
  const internalEnterprise = useAuthStore(isPlatformSelfSession);
  const summaryPath = internalEnterprise ? "/organiser/internal-enterprise/summary" : "/organiser/billing/summary";
  const query = useQuery({
    queryKey: ["organiser", "billing", ...scope, "summary", internalEnterprise ? "internal-enterprise" : "customer"],
    queryFn: ({ signal }) => apiGet<Summary>(summaryPath, { signal }),
    staleTime: 30_000,
  });
  const data = query.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--org-purple)]">Billing and payments</p>
              <h2 className="mt-1 text-xl font-semibold">Financial position</h2>
              <p className="mt-1 text-sm text-[var(--org-muted)]">Invoices and the default payment method.</p>
            </div>
            <Button asChild variant="outline" size="sm"><Link href="/commercial/billing-history">Open financial history</Link></Button>
          </div>
          <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
            <Panel title="Recent invoices" action={<Link href="/commercial/invoices" className="text-xs font-semibold">View all invoices</Link>}>
              {!data?.recent_invoices.length ? <p className="py-8 text-center text-sm text-[var(--org-muted)]">No invoices are available.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-xs"><thead><tr className="rounded-xl bg-[var(--org-surface-soft)] text-[var(--org-muted)]"><th className="px-3 py-2">Invoice no.</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Amount</th></tr></thead><tbody>{data.recent_invoices.map((invoice) => <tr key={invoice.id} className="border-b border-[var(--org-border)]"><td className="px-3 py-3 font-semibold">{invoice.reference || invoice.id}</td><td className="px-3 py-3 text-[var(--org-muted)]">{new Date(invoice.issued_at).toLocaleDateString()}</td><td className="px-3 py-3"><StatusBadge status={invoice.status} /></td><td className="px-3 py-3 text-right font-semibold">{money(invoice.amount, invoice.currency)}</td></tr>)}</tbody></table></div>}
            </Panel>
            <Panel title="Payment method" action={<Link href="/commercial/payment-methods" className="text-xs font-semibold">Manage</Link>}>
              {data?.default_payment_method ? <div className="flex items-center gap-4 rounded-2xl border border-[var(--org-border)] p-4"><span className="grid size-12 place-items-center rounded-xl bg-[var(--org-surface-soft)] text-[var(--org-purple)]"><CreditCard /></span><div><strong className="block capitalize">{data.default_payment_method.card_brand || data.default_payment_method.provider} •••• {data.default_payment_method.card_last4}</strong><span className="text-xs text-[var(--org-muted)]">Default payment method</span></div></div> : <div className="rounded-2xl border border-dashed border-[var(--org-border)] p-6 text-center"><Receipt className="mx-auto size-6 text-[var(--org-muted)]" /><p className="mt-2 text-sm">No payment method is available.</p><Button asChild size="sm" className="mt-4"><Link href="/commercial/payment-methods">Add payment method</Link></Button></div>}
            </Panel>
      </div>
    </div>
  );
}
