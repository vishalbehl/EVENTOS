"use client";

import { useState } from "react";
import { useAdminInvoices } from "@/services/super-admin-service";
import { Receipt, RefreshCw } from "lucide-react";

const STATUS_STYLES: Record<string, string> = {
  PAID: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  UNPAID: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  VOID: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  REFUNDED: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

export default function InvoicesPage() {
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [page, setPage] = useState(0);
  const limit = 25;

  const { data, isLoading, refetch } = useAdminInvoices({
    skip: page * limit,
    limit,
    status: statusFilter === "ALL" ? undefined : statusFilter,
  });

  const items = data?.items || [];
  const total = data?.total || 0;
  const totalRevenue = items.filter(i => i.status === "PAID").reduce((sum, i) => sum + i.amount, 0);

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20">
            <Receipt className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Invoices</h1>
            <p className="text-[11px] text-white/35">{total} invoices · ${totalRevenue.toLocaleString()} collected (this page)</p>
          </div>
        </div>
        <button onClick={() => refetch()} className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-white/40 hover:text-white">
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Status Filter */}
      <div className="flex gap-1.5">
        {["ALL", "PAID", "UNPAID", "VOID", "REFUNDED"].map((s) => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(0); }}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-150 ${
              statusFilter === s
                ? "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                : "text-white/30 hover:text-white/60 hover:bg-white/5"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-white/5 bg-white/3 overflow-hidden">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 px-5 py-3 border-b border-white/5">
          {["Organization", "Amount", "Status", "Issued"].map((h) => (
            <div key={h} className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/25">{h}</div>
          ))}
        </div>

        {isLoading ? (
          <div className="p-8 flex items-center gap-2 text-white/25 text-sm"><RefreshCw className="w-4 h-4 animate-spin" /> Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-white/20 text-sm">No invoices found</div>
        ) : (
          <div className="divide-y divide-white/3">
            {items.map((inv) => (
              <div key={inv.id} className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 px-5 py-4 hover:bg-white/3 transition-colors items-center">
                <p className="text-[13px] font-bold text-white/70 truncate">{inv.organization_name}</p>
                <p className="text-[13px] font-bold text-white/80 tabular-nums">
                  ${inv.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border w-fit ${STATUS_STYLES[inv.status] || "bg-white/5 text-white/30 border-white/10"}`}>
                  {inv.status}
                </span>
                <p className="text-[11px] text-white/30 font-mono">
                  {new Date(inv.issued_at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] text-white/25 font-mono">Page {page + 1} · {total} total</span>
        <div className="flex gap-2">
          <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] font-bold text-white/40 hover:text-white disabled:opacity-30 transition-all">Previous</button>
          <button onClick={() => setPage(page + 1)} disabled={items.length < limit} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] font-bold text-white/40 hover:text-white disabled:opacity-30 transition-all">Next</button>
        </div>
      </div>
    </div>
  );
}
