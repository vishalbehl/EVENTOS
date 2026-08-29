"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import {
  DollarSign,
  CreditCard,
  Ticket,
  ClipboardList,
  RefreshCw,
  TrendingUp,
  Search,
  CheckCircle2,
  AlertCircle,
  Receipt,
} from "lucide-react";
import { useEvent } from "@/hooks/useEvents";
import { toast } from "sonner";
import { apiGet, apiPatch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
  OrganiserPage,
  Panel,
  MetricCard,
  StatusBadge,
} from "@/components/organizer/workspace/OrganiserPrimitives";
import { Button } from "@/components/ui/button";

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
  { id: "promos", label: "Promo Codes", icon: Ticket },
  { id: "gateways", label: "Payment Gateways", icon: CreditCard },
  { id: "ledger", label: "Transaction Ledger", icon: ClipboardList },
];

export default function FinancialsPage() {
  const params = useParams();
  const eid = (params?.eventId as string) || "";
  const { data: event } = useEvent(eid);

  const [activeTab, setActiveTab] = useState("overview");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [analytics, setAnalytics] = useState<any>({
    kpis: { total_revenue: 0, pending_payments: 0 },
  });
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const currency = event?.currency || "INR";

  const fetchFinanceData = async () => {
    try {
      setLoading(true);
      const [listRes, analyticsRes] = await Promise.all([
        apiGet<Participant[]>(`/events/${eid}/participants`),
        apiGet<any>(`/events/${eid}/participants/analytics-dashboard`).catch(() => ({
          kpis: { total_revenue: 0, pending_payments: 0 },
        })),
      ]);
      setParticipants(listRes || []);
      setAnalytics(analyticsRes || { kpis: { total_revenue: 0, pending_payments: 0 } });
    } catch {
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

  const handleTogglePaymentStatus = async (participant: Participant) => {
    const nextStatus = participant.paid_status === "Paid" ? "Unpaid" : "Paid";
    const confirmMsg =
      nextStatus === "Paid"
        ? `Mark registration of "${participant.name}" as PAID?`
        : `Mark registration of "${participant.name}" as UNPAID? This triggers a refund adjustment.`;

    if (!window.confirm(confirmMsg)) return;

    try {
      await apiPatch(`/events/${eid}/participants/${participant.id}`, { paid_status: nextStatus });
      toast.success(
        nextStatus === "Paid" ? "Payment status updated to Paid." : "Refund recorded successfully."
      );
      fetchFinanceData();
    } catch (err: any) {
      toast.error(err.message || "Failed to update transaction status.");
    }
  };

  const filteredLedger = useMemo(() => {
    return participants.filter((p) => {
      const name = (p.name || "").toLowerCase();
      const email = (p.email || "").toLowerCase();
      const query = searchQuery.toLowerCase();
      return name.includes(query) || email.includes(query) || (p.regno || "").toLowerCase().includes(query);
    });
  }, [participants, searchQuery]);

  const totalCollected = analytics?.kpis?.total_revenue || 0;
  const paidCount = participants.filter((p) => p.paid_status === "Paid").length;
  const unpaidCount = participants.filter((p) => p.paid_status !== "Paid").length;

  return (
    <OrganiserPage
      title="Financials & Accounting Console"
      description="Manage payment gateways, promo codes, transaction reconciliations, and the attendee ledger."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {/* Tab Navigation */}
          <div className="flex items-center rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-1 gap-1 shadow-sm">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-semibold transition-colors cursor-pointer",
                    isActive
                      ? "bg-[var(--pri)] text-[var(--primary-contrast)] shadow-sm font-bold"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  )}
                >
                  <Icon className="size-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={fetchFinanceData}
            disabled={loading}
            className="flex items-center gap-1.5 h-9"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin text-[var(--pri)]")} />
            Sync Data
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* OVERVIEW TAB */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label="Total Revenue Collected"
                value={`${currency} ${totalCollected.toLocaleString()}`}
                hint="Confirmed successful payments"
                icon={<DollarSign className="size-4" />}
                iconColor="success"
              />
              <MetricCard
                label="Paid Registrations"
                value={paidCount}
                hint={`${participants.length > 0 ? Math.round((paidCount / participants.length) * 100) : 0}% of attendees`}
                icon={<CheckCircle2 className="size-4" />}
                iconColor="brand"
              />
              <MetricCard
                label="Pending / Unpaid"
                value={unpaidCount}
                hint="Pending manual collection"
                icon={<AlertCircle className="size-4" />}
                iconColor="warning"
              />
              <MetricCard
                label="Total Transactions"
                value={participants.length}
                hint="Total attendee orders recorded"
                icon={<Receipt className="size-4" />}
                iconColor="info"
              />
            </div>

            {/* Reconciliation Policy Panel */}
            <Panel title="Financial Policy & Reconciliation">
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Delegate registration payments are processed securely via active gateways configured in the Gateways tab. Ticket pricing tiers and pass categories are configured under Pass Categories. Discount vouchers can be created and managed under Promo Codes. To review individual customer transactions or trigger payment status overrides, navigate to the Transaction Ledger tab.
              </p>
            </Panel>
          </div>
        )}

        {/* PROMO CODES TAB */}
        {activeTab === "promos" && <PromosTab eventId={eid} />}

        {/* PAYMENT GATEWAYS TAB */}
        {activeTab === "gateways" && <PaymentsTab eventId={eid} />}

        {/* TRANSACTION LEDGER TAB */}
        {activeTab === "ledger" && (
          <Panel
            title="Transaction Ledger"
            action={
              <div className="flex items-center gap-3">
                <div className="relative w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[var(--text-tertiary)]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name, email, or regno..."
                    className="h-8 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] pl-9 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--pri)] focus:outline-none"
                  />
                </div>
                <span className="text-xs text-[var(--text-secondary)] font-medium">
                  {filteredLedger.length} entries
                </span>
              </div>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-2)] text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                    <th className="py-3 px-4">Reg No</th>
                    <th className="py-3 px-4">Delegate Details</th>
                    <th className="py-3 px-4">Category Role</th>
                    <th className="py-3 px-4">Registered Date</th>
                    <th className="py-3 px-4">Payment Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {filteredLedger.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-xs text-[var(--text-secondary)]">
                        No ledger records found matching your query.
                      </td>
                    </tr>
                  ) : (
                    filteredLedger.map((p) => (
                      <tr key={p.id} className="hover:bg-[var(--bg-surface-hover)]">
                        <td className="py-3 px-4 font-mono font-bold text-xs text-[var(--pri)]">
                          {p.regno}
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-bold text-[var(--text-primary)]">{p.name}</p>
                          <p className="text-[11px] text-[var(--text-secondary)]">{p.email}</p>
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center rounded border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--text-secondary)]">
                            {p.role}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-[11px] text-[var(--text-secondary)]">
                          {p.registered_at
                            ? new Date(p.registered_at).toLocaleDateString("en-US", {
                                dateStyle: "medium",
                              })
                            : "N/A"}
                        </td>
                        <td className="py-3 px-4">
                          <StatusBadge status={p.paid_status === "Paid" ? "paid" : "pending"} />
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleTogglePaymentStatus(p)}
                            className="text-xs h-7 px-2.5 font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                          >
                            {p.paid_status === "Paid" ? "Mark Unpaid / Refund" : "Mark as Paid"}
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
      </div>
    </OrganiserPage>
  );
}
