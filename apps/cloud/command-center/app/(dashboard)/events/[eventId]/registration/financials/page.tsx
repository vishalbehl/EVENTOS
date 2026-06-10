"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  DollarSign, BadgePercent, CreditCard, Ticket, ClipboardList, 
  RefreshCw, TrendingUp, ArrowDownRight, ArrowUpRight, Search, 
  Printer, Trash2, CheckCircle2, XCircle, Save
} from "lucide-react";
import { useEvent } from "@/hooks/useEvents";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { apiGet, apiPatch } from "@/lib/api-client";

// Import financial tab sub-components
import PricingTab from "@/components/organizer/registration/financials/PricingTab";
import PaymentsTab from "@/components/organizer/registration/financials/PaymentsTab";
import PromosTab from "@/components/organizer/registration/financials/PromosTab";

interface Participant {
  id: string;
  regno: string;
  name: string;
  email: string;
  role: string;
  paid_status: string;
  registered_at: string;
  source: string;
  company?: string;
  is_free?: boolean;
  [key: string]: any;
}

const TABS = [
  { id: "overview", label: "Overview", icon: TrendingUp },
  { id: "pricing", label: "Ticket Pricing", icon: BadgePercent },
  { id: "promos", label: "Promo Codes", icon: Ticket },
  { id: "gateways", label: "Payment Gateways", icon: CreditCard },
  { id: "ledger", label: "Transaction Ledger", icon: ClipboardList }
];

export default function FinancialsPage() {
  const { eventId } = useParams();
  const eid = eventId as string;
  const { data: event } = useEvent(eid);

  const [activeTab, setActiveTab] = useState("overview");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [analytics, setAnalytics] = useState<any>({ kpis: { total_revenue: 0, pending_payments: 0 } });
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const currency = event?.currency || "INR";
  const [pricingSaving, setPricingSaving] = useState(false);
  const pricingRef = useRef<{ handleSave: () => Promise<void> }>(null);

  const fetchFinanceData = async () => {
    try {
      setLoading(true);
      const [listRes, analyticsRes] = await Promise.all([
        apiGet<Participant[]>(`/events/${eid}/participants`),
        apiGet<any>(`/events/${eid}/participants/analytics-dashboard`).catch(() => ({ kpis: { total_revenue: 0, pending_payments: 0 } }))
      ]);
      setParticipants(listRes || []);
      setAnalytics(analyticsRes || { kpis: { total_revenue: 0, pending_payments: 0 } });
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to load financial operations ledger.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (eid) {
      fetchFinanceData();
    }
  }, [eid]);

  // Toggle delegate payment status as refund/mark-paid action
  const handleTogglePaymentStatus = async (participant: Participant) => {
    const nextStatus = participant.paid_status === "Paid" ? "Unpaid" : "Paid";
    const confirmMsg = nextStatus === "Paid" 
      ? `Mark registration of "${participant.name}" as PAID?`
      : `Mark registration of "${participant.name}" as UNPAID? This triggers a simulated refund.`;
    
    if (!window.confirm(confirmMsg)) return;

    try {
      await apiPatch(`/events/${eid}/participants/${participant.id}`, { paid_status: nextStatus });
      toast.success(nextStatus === "Paid" ? "Payment status updated to Paid." : "Simulated refund processed successfully.");
      fetchFinanceData();
    } catch (err: any) {
      toast.error(err.message || "Failed to update transaction status.");
    }
  };

  // Filter paid/unpaid participants for the Ledger
  const filteredLedger = useMemo(() => {
    return participants.filter(p => {
      const name = p.name.toLowerCase();
      const email = p.email.toLowerCase();
      const query = searchQuery.toLowerCase();
      return name.includes(query) || email.includes(query) || p.regno.toLowerCase().includes(query);
    });
  }, [participants, searchQuery]);

  return (
    <div className="flex-1 flex flex-col space-y-4 min-h-0 overflow-hidden text-[var(--text)] p-0">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-[var(--pri)] animate-pulse" />
            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-[var(--pri)]/85">Finance Operations</span>
          </div>
          <h1 className="text-3xl font-black tracking-tighter text-[var(--text)] mt-0.5 text-glow-indigo">
            Financials <span className="text-[var(--pri)]">Console</span>
          </h1>
        </div>

        {/* Tab Navigation and Actions Row */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Navigation Tab Bar */}
          <div className="relative flex flex-wrap gap-1 p-1 rounded-2xl bg-white/5 border border-white/5 w-fit shrink-0">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all z-10 cursor-pointer ${
                    isActive ? "text-white" : "text-muted hover:text-[var(--text)]"
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="tab-bg-finance"
                      className="absolute inset-0 rounded-xl bg-[var(--pri)] shadow-lg shadow-[var(--pri)]/30"
                      transition={{ type: "spring", stiffness: 400, damping: 35 }}
                    />
                  )}
                  <Icon className="h-3 w-3 relative z-10" />
                  <span className="relative z-10">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Sync Button & Dynamic Action Button */}
          <div className="flex items-center gap-2">
            <Button 
              onClick={fetchFinanceData} 
              disabled={loading} 
              className="h-9 px-4 bg-white/5 hover:bg-white/10 text-[var(--text)] font-black uppercase tracking-widest text-[9px] rounded-xl border border-white/5"
            >
              <RefreshCw className={`h-3 w-3 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              Sync
            </Button>

            {activeTab === "pricing" && (
              <Button
                onClick={() => pricingRef.current?.handleSave()}
                disabled={pricingSaving}
                className="flex items-center gap-1.5 h-9 px-5 bg-[var(--pri)] hover:bg-[var(--pri-hover)] text-white rounded-xl text-[9px] font-black uppercase tracking-widest disabled:opacity-50 transition-all shadow-lg shadow-[var(--pri)]/20 animate-in fade-in duration-300"
              >
                <Save className="h-3 w-3" />
                {pricingSaving ? 'Saving...' : 'Save Pricing'}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Tab Contents */}
      <div className={`flex-1 min-h-0 ${activeTab === "overview" ? "overflow-y-auto custom-scrollbar" : "overflow-hidden flex flex-col"} pr-1`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className={`space-y-6 pb-6 ${activeTab === "overview" ? "" : "h-full min-h-0 flex flex-col overflow-hidden"}`}
          >
          {/* OVERVIEW TAB */}
          {activeTab === "overview" && (
            <div className="space-y-8">
              {/* Financial KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <Card className="glass-3d p-6 rounded-3xl border-default flex flex-col justify-between h-36 bg-gradient-to-br from-indigo-500/10 to-transparent relative overflow-hidden group hover-lift-3d">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-[0.25em] text-muted">Total Revenue</span>
                    <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center text-indigo-400">
                      <TrendingUp className="h-5 w-5" />
                    </div>
                  </div>
                  <div className="mt-4">
                    <span className="text-3xl font-black tracking-tighter text-[var(--text)]">
                      {new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(analytics.kpis?.total_revenue || 0)}
                    </span>
                    <span className="text-[9px] text-emerald-400 font-bold block mt-1 uppercase tracking-wider flex items-center gap-1">
                      <ArrowUpRight className="h-3.5 w-3.5" /> Direct portal intakes
                    </span>
                  </div>
                </Card>

                <Card className="glass-3d p-6 rounded-3xl border-default flex flex-col justify-between h-36 bg-gradient-to-br from-amber-500/10 to-transparent relative overflow-hidden group hover-lift-3d">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-[0.25em] text-muted">Receivables / Pending</span>
                    <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400">
                      <ArrowDownRight className="h-5 w-5" />
                    </div>
                  </div>
                  <div className="mt-4">
                    <span className="text-3xl font-black tracking-tighter text-[var(--text)]">
                      {analytics.kpis?.pending_payments || 0} Accounts
                    </span>
                    <span className="text-[9px] text-amber-400 font-bold block mt-1 uppercase tracking-wider">
                      Requires manual invoice reconciliation
                    </span>
                  </div>
                </Card>

                <Card className="glass-3d p-6 rounded-3xl border-default flex flex-col justify-between h-36 bg-gradient-to-br from-emerald-500/10 to-transparent relative overflow-hidden group hover-lift-3d">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-[0.25em] text-muted">Conversion Rate</span>
                    <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                  </div>
                  <div className="mt-4">
                    <span className="text-3xl font-black tracking-tighter text-[var(--text)]">
                      {participants.length > 0 
                        ? `${Math.round((participants.filter(p => p.paid_status === "Paid").length / participants.length) * 100)}%` 
                        : "0%"}
                    </span>
                    <span className="text-[9px] text-muted font-bold block mt-1 uppercase tracking-wider">
                      Paid registrations vs total intake
                    </span>
                  </div>
                </Card>
              </div>

              {/* Financial Policy Disclaimer */}
              <Card className="p-6 glass-3d border-default rounded-[2rem] bg-white/[0.02]">
                <h3 className="text-sm font-black uppercase tracking-wider mb-2 flex items-center gap-2">
                  <DollarSign className="h-4.5 w-4.5 text-[var(--pri)]" /> Financial Operations Policy
                </h3>
                <p className="text-xs text-muted leading-relaxed">
                  Delegate registration payments are processed securely through active gateways configured in the Gateways tab. Ticket prices are automatically calculated by delegate category roles defined in the Pricing Matrix. Discount voucher logs can be inspected inside Promo Codes tab. To reconcile manual registrations or process simulated refunds, use the Transaction Ledger.
                </p>
              </Card>
            </div>
          )}

          {/* TICKET PRICING TAB */}
          {activeTab === "pricing" && (
            <PricingTab eventId={eid} ref={pricingRef} onSavingChange={setPricingSaving} />
          )}
 
          {/* PROMO CODES TAB */}
          {activeTab === "promos" && <PromosTab eventId={eid} />}
 
          {/* PAYMENT GATEWAYS TAB */}
          {activeTab === "gateways" && <PaymentsTab eventId={eid} />}
 
          {/* TRANSACTION LEDGER TAB */}
          {activeTab === "ledger" && (
            <div className="space-y-6 h-full flex flex-col min-h-0 overflow-hidden">
              {/* Ledger search controls */}
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-[var(--surf)]/40 p-4 rounded-xl border border-default glass-3d shrink-0">
                <div className="relative w-full md:w-80">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name, email, or regno..."
                    className="pl-9 bg-background/50 border-default focus-visible:ring-[var(--pri)] text-xs h-10"
                  />
                </div>
                <div className="text-[10px] font-black uppercase tracking-widest text-muted bg-white/5 border border-default px-3 py-1.5 rounded-full shrink-0">
                  Total ledger size: {filteredLedger.length} transaction entries
                </div>
              </div>
 
              {/* Ledger Table */}
              <Card className="glass-3d overflow-hidden border-default bg-[var(--surf)]/20 rounded-[2rem] flex-1 min-h-0 flex flex-col">
                <div className="flex-1 overflow-auto custom-scrollbar">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-default bg-[var(--surf)]/50 text-[10px] font-black uppercase tracking-wider text-muted sticky top-0 z-20">
                        <th className="p-4 pl-6 bg-[#141318] sticky top-0 z-20">Registration No</th>
                        <th className="p-4 bg-[#141318] sticky top-0 z-20">Customer Details</th>
                        <th className="p-4 bg-[#141318] sticky top-0 z-20">Billing Category</th>
                        <th className="p-4 bg-[#141318] sticky top-0 z-20">Date</th>
                        <th className="p-4 bg-[#141318] sticky top-0 z-20">Gateway Status</th>
                        <th className="p-4 text-right pr-6 bg-[#141318] sticky top-0 z-20">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLedger.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-16 text-center text-xs font-black uppercase tracking-widest text-muted">
                            No ledger records found.
                          </td>
                        </tr>
                      ) : (
                        filteredLedger.map((p) => (
                          <tr key={p.id} className="border-b border-default last:border-b-0 hover:bg-[var(--surf)]/40 transition-colors">
                            <td className="p-4 pl-6 text-xs font-bold font-mono text-[var(--pri)]">{p.regno}</td>
                            <td className="p-4">
                              <div className="flex flex-col">
                                <span className="font-bold text-xs text-[var(--text)]">{p.name}</span>
                                <span className="text-[10px] text-muted mt-0.5">{p.email}</span>
                              </div>
                            </td>
                            <td className="p-4">
                              <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border border-white/10 bg-white/5 text-muted">
                                {p.role}
                              </span>
                            </td>
                            <td className="p-4 text-[10px] text-muted font-semibold">
                              {p.registered_at ? new Date(p.registered_at).toLocaleDateString("en-US", { dateStyle: "medium" }) : "N/A"}
                            </td>
                            <td className="p-4">
                              {p.is_free ? (
                                <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border text-sky-400 bg-sky-500/10 border-sky-500/20 select-none cursor-default">
                                  <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                                  Free
                                </span>
                              ) : (
                                <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${
                                  p.paid_status === "Paid" 
                                    ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" 
                                    : "text-amber-400 bg-amber-500/10 border-amber-500/20"
                                }`}>
                                  <span className={`h-1.5 w-1.5 rounded-full ${p.paid_status === "Paid" ? "bg-emerald-400" : "bg-amber-400"}`} />
                                  {p.paid_status === "Paid" ? "Paid" : "Unpaid / Pending"}
                                </span>
                              )}
                            </td>
                            <td className="p-4 text-right pr-6">
                              {p.is_free ? (
                                <span className="text-[9px] font-black uppercase tracking-widest text-muted select-none cursor-default pr-4">
                                  No Action Needed
                                </span>
                              ) : (
                                <Button
                                  size="sm"
                                  onClick={() => handleTogglePaymentStatus(p)}
                                  className={`h-8 px-4 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${
                                    p.paid_status === "Paid"
                                      ? "bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/20"
                                      : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20"
                                  }`}
                                >
                                  {p.paid_status === "Paid" ? "Simulate Refund" : "Mark Paid"}
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
