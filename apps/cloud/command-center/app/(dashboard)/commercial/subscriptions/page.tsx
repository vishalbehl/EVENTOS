"use client";

import React, { useState, useMemo } from "react";
import { 
  useSubscriptions, 
  useSubscriptionPlans, 
  useExtendTrial, 
  useChangePlan, 
  useCancelSubscription, 
  useReactivateSubscription,
  Subscription,
  SubscriptionPlan
} from "@/services/super-admin-service";
import { 
  useReactTable, 
  getCoreRowModel, 
  ColumnDef 
} from "@tanstack/react-table";
import { 
  RefreshCw, Search, Calendar, ChevronDown, ChevronRight, Info, Filter, FileSpreadsheet
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { DataTable } from "@/components/super-admin/ui/DataTable";

// ── Helpers ────────────────────────────────────────────────────
function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

// ── Collapsible Row Details Panel ──────────────────────────────
function SubscriptionDetailsPanel({ 
  sub, 
  plans, 
  onClose 
}: { 
  sub: Subscription; 
  plans: SubscriptionPlan[]; 
  onClose: () => void 
}) {
  const extendTrial = useExtendTrial();
  const changePlan = useChangePlan();
  const cancelSub = useCancelSubscription();
  const reactivateSub = useReactivateSubscription();

  const [days, setDays] = useState(14);
  const [reason, setReason] = useState("");
  const [extending, setExtending] = useState(false);

  const handleExtend = async () => {
    if (days < 1 || days > 90) {
      toast.error("Extension days must be between 1 and 90");
      return;
    }
    if (reason.trim().length < 5) {
      toast.error("Please provide a valid reason (min 5 chars)");
      return;
    }
    setExtending(true);
    try {
      await extendTrial.mutateAsync({ orgId: sub.organization_id, days, reason });
      toast.success(`Extended trial for ${sub.org_name} by ${days} days.`);
      setReason("");
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to extend trial period");
    } finally {
      setExtending(false);
    }
  };

  const handlePlanChange = async (planId: string) => {
    if (planId === sub.plan_id) return;
    const planName = plans.find(p => p.id === planId)?.name || "selected plan";
    toast.promise(
      changePlan.mutateAsync({ orgId: sub.organization_id, planId }),
      {
        loading: `Transitioning organization to ${planName}...`,
        success: `Plan tier updated to ${planName}`,
        error: "Failed to modify subscription tier",
      }
    );
  };

  const handleCancel = async () => {
    if (!confirm("Are you sure you want to cancel this subscription at period end?")) return;
    toast.promise(
      cancelSub.mutateAsync(sub.id),
      {
        loading: "Scheduling cancellation...",
        success: "Subscription scheduled for cancellation",
        error: "Failed to cancel subscription",
      }
    );
  };

  const handleReactivate = async () => {
    toast.promise(
      reactivateSub.mutateAsync(sub.id),
      {
        loading: "Reactivating subscription...",
        success: "Subscription reactivated successfully",
        error: "Failed to reactivate subscription",
      }
    );
  };

  return (
    <div className="space-y-4 text-xs">
      <div className="flex items-center justify-between pb-2 border-b border-border/60">
        <div>
          <h4 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wide">
            Subscription Management console
          </h4>
          <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
            Organization name: <span className="font-semibold text-[var(--text-secondary)]">{sub.org_name}</span> · ID: <span className="font-mono">{sub.organization_id}</span>
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-6 w-6 p-0 rounded-full hover:bg-surface-hover">
          ✕
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Tier Shift */}
        <div className="space-y-3.5 p-4 rounded-xl border border-border bg-surface shadow-sm">
          <div>
            <h5 className="font-bold text-[var(--text-secondary)] uppercase tracking-wider text-[9px]">Tier Migration</h5>
            <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">Change this tenant's billing entitlement package</p>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] text-[var(--text-tertiary)] block font-semibold">Entitled Plan</label>
            <select
              value={sub.plan_id}
              onChange={(e) => handlePlanChange(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg text-xs py-1.5 px-3 focus:outline-none cursor-pointer focus:border-[var(--brand-primary)]"
            >
              {plans.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Trial Extension */}
        <div className="space-y-3.5 p-4 rounded-xl border border-border bg-surface shadow-sm md:col-span-2">
          <div>
            <h5 className="font-bold text-[var(--text-secondary)] uppercase tracking-wider text-[9px]">Sandbox Operations</h5>
            <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">Add grace testing days to active organization trials</p>
          </div>

          {sub.status === "TRIAL" ? (
            <div className="space-y-3.5">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-[var(--text-tertiary)] font-semibold">Extension Period (Days)</label>
                  <input
                    type="number"
                    value={days}
                    onChange={(e) => setDays(Number(e.target.value))}
                    min={1}
                    max={90}
                    className="w-16 rounded bg-surface border border-border px-2 py-1 text-xs text-[var(--text-primary)] text-center focus:outline-none focus:border-[var(--brand-primary)]"
                  />
                </div>
                <span className="text-[10px] text-[var(--text-tertiary)] italic">
                  New ends at: {sub.trial_ends_at ? new Date(new Date(sub.trial_ends_at).getTime() + days * 86400000).toLocaleDateString() : "—"}
                </span>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] text-[var(--text-tertiary)] font-semibold">Extension Reason / Justification</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Justification for trial extension..."
                  rows={2}
                  className="w-full rounded bg-surface border border-border px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-primary)] resize-none"
                />
              </div>
              <Button
                onClick={handleExtend}
                disabled={extending || reason.trim().length < 5}
                className="bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-white font-bold text-xs px-4 py-1.5 h-8 rounded-lg transition-all"
              >
                Apply Extension
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 bg-surface-2 border border-border rounded-lg text-[var(--text-tertiary)]">
              <Info className="w-4 h-4 text-[var(--text-secondary)]" />
              <span>Sandbox operations and extensions are only accessible for organizations in TRIAL status.</span>
            </div>
          )}
        </div>
      </div>

      {/* Lifecycle Actions */}
      <div className="flex items-center justify-between pt-3.5 border-t border-border/60">
        <div className="flex items-center gap-4 text-[10px]">
          <div>
            <span className="text-[9px] text-[var(--text-tertiary)] block font-semibold uppercase tracking-wider">Stripe Cust ID</span>
            <span className="font-mono text-[var(--text-secondary)] select-all">{sub.stripe_customer_id || "—"}</span>
          </div>
          <div>
            <span className="text-[9px] text-[var(--text-tertiary)] block font-semibold uppercase tracking-wider">Subscription ID</span>
            <span className="font-mono text-[var(--text-secondary)] select-all">{sub.stripe_subscription_id || "—"}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {sub.status === "ACTIVE" ? (
            <Button
              variant="outline"
              onClick={handleCancel}
              className="border-red-900/40 text-red-400 hover:bg-red-950/20 hover:text-red-300 text-xs font-semibold h-8 rounded-lg"
            >
              Cancel Subscription
            </Button>
          ) : sub.status === "CANCELLED" || sub.status === "EXPIRED" ? (
            <Button
              variant="outline"
              onClick={handleReactivate}
              className="border-green-900/40 text-green-400 hover:bg-green-950/20 hover:text-green-300 text-xs font-semibold h-8 rounded-lg"
            >
              Reactivate Subscription
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────
export default function SubscriptionsPage() {
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedPlanId, setSelectedPlanId] = useState<string>("ALL");
  const [expandedSubId, setExpandedSubId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const limit = 10;

  const { data: plans = [] } = useSubscriptionPlans();
  const { data, isLoading, refetch } = useSubscriptions({
    status: selectedStatus === "ALL" ? undefined : selectedStatus,
    plan_id: selectedPlanId === "ALL" ? undefined : selectedPlanId,
    search: searchQuery === "" ? undefined : searchQuery,
    skip: page * limit,
    limit,
  });

  // Load all subscriptions to calculate real stats dynamically without dummy values
  const { data: allSubsData } = useSubscriptions({ limit: 1000 });
  const allSubs = useMemo(() => allSubsData?.items || [], [allSubsData]);

  const subscriptions = data?.items || [];
  const totalItems = data?.total || 0;

  // Real KPI calculations from backend subscriptions
  const stats = useMemo(() => {
    const totalMrr = allSubs.reduce((sum, s) => sum + (s.mrr || 0), 0);
    const activeCount = allSubs.filter(s => s.status === "ACTIVE").length;
    const trialCount = allSubs.filter(s => s.status === "TRIAL").length;
    const atRiskCount = allSubs.filter(s => s.status === "SUSPENDED" || s.status === "GRACE_PERIOD").length;
    
    // Expiring in next 14 days
    const expiringCount = allSubs.filter(s => {
      if (s.status !== "TRIAL" || !s.trial_ends_at) return false;
      const diff = new Date(s.trial_ends_at).getTime() - Date.now();
      return diff > 0 && diff < 14 * 86400 * 1000;
    }).length;

    return {
      mrr: formatCurrency(totalMrr),
      active: activeCount.toString(),
      trials: trialCount.toString(),
      atRisk: atRiskCount.toString(),
      expiring: expiringCount.toString()
    };
  }, [allSubs]);

  // Compute status counts for tabs dynamically
  const counts = useMemo(() => {
    return {
      ALL: allSubs.length,
      ACTIVE: allSubs.filter(s => s.status === "ACTIVE").length,
      TRIAL: allSubs.filter(s => s.status === "TRIAL").length,
      GRACE_PERIOD: allSubs.filter(s => s.status === "GRACE_PERIOD").length,
      SUSPENDED: allSubs.filter(s => s.status === "SUSPENDED").length,
      EXPIRED: allSubs.filter(s => s.status === "EXPIRED").length,
      CANCELLED: allSubs.filter(s => s.status === "CANCELLED").length
    };
  }, [allSubs]);

  // Expose Row columns
  const columns: ColumnDef<Subscription>[] = useMemo(() => [
    {
      accessorKey: "org_name",
      header: "Organization",
      cell: ({ row }) => {
        const initials = row.original.org_name ? row.original.org_name.slice(0, 2).toUpperCase() : "OR";
        return (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/10 text-indigo-400 font-black text-xs flex items-center justify-center flex-shrink-0 border border-indigo-500/10">
              {initials}
            </div>
            <div>
              <p className="text-xs font-bold text-[var(--text-primary)]">{row.original.org_name}</p>
              <p className="text-[10px] text-[var(--text-tertiary)] font-mono">{row.original.org_slug}</p>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "plan_name",
      header: "Plan",
      cell: ({ row }) => (
        <span className="inline-flex px-2 py-0.5 rounded-lg bg-surface-2 border border-border text-[9px] text-[var(--text-secondary)] font-mono font-semibold uppercase tracking-wider">
          {row.original.plan_name}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.original.status;
        let badgeStyle = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
        if (status === "TRIAL") badgeStyle = "bg-amber-500/10 text-amber-400 border-amber-500/20";
        else if (status === "GRACE_PERIOD") badgeStyle = "bg-orange-500/10 text-orange-400 border-orange-500/20";
        else if (status === "SUSPENDED" || status === "CANCELLED") badgeStyle = "bg-red-500/10 text-red-400 border-red-500/20";
        else if (status === "EXPIRED") badgeStyle = "bg-slate-500/10 text-slate-400 border-slate-500/20";

        return (
          <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-black uppercase border", badgeStyle)}>
            <span className="w-1 h-1 rounded-full bg-current"></span>
            {status}
          </span>
        );
      },
    },
    {
      accessorKey: "mrr",
      header: "MRR",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-black text-[var(--text-primary)]">
          {formatCurrency(row.original.mrr || 0)}
        </span>
      ),
    },
    {
      accessorKey: "current_period_end",
      header: "Period End",
      cell: ({ row }) => (
        <span className="text-[11px] font-mono text-[var(--text-secondary)]">
          {row.original.current_period_end ? new Date(row.original.current_period_end).toLocaleDateString("en-US", { month: 'short', day: 'numeric', year: 'numeric' }) : "—"}
        </span>
      ),
    },
    {
      accessorKey: "trial_ends_at",
      header: "Trial End",
      cell: ({ row }) => (
        <span className="text-[11px] font-mono text-[var(--text-secondary)]">
          {row.original.trial_ends_at ? new Date(row.original.trial_ends_at).toLocaleDateString("en-US", { month: 'short', day: 'numeric', year: 'numeric' }) : "—"}
        </span>
      ),
    },
  ], []);

  const table = useReactTable({
    data: subscriptions,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <PageContainer>
      <SectionHeader
        title="Subscriptions"
        description="Monitor and manage all organization subscriptions and billing status."
        actions={
          <Button variant="outline" onClick={() => refetch()} className="border-border hover:bg-surface-hover/30">
            <RefreshCw className={cn("w-3.5 h-3.5 mr-2", isLoading && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      {/* Dynamic Metrics Row without dummy data */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {[
          { label: "Total MRR", value: stats.mrr },
          { label: "Active Subscriptions", value: stats.active },
          { label: "Trials", value: stats.trials },
          { label: "At Risk", value: stats.atRisk },
          { label: "Expiring Soon", value: stats.expiring },
        ].map((stat, idx) => (
          <div key={idx} className="bg-surface border border-border rounded-2xl p-5 flex flex-col justify-center shadow-sm h-24">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-tertiary)]">{stat.label}</span>
            <p className="text-xl font-black text-[var(--text-primary)] leading-tight tracking-tight mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Main Tabular Dashboard */}
      <div className="space-y-4">
        
        {/* Filters Toolbar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-1">
          {/* Status Tabs */}
          <div className="flex flex-wrap gap-1 p-1 bg-surface border border-border rounded-xl w-fit">
            {[
              { label: "All Status", value: "ALL", count: counts.ALL },
              { label: "Active", value: "ACTIVE", count: counts.ACTIVE },
              { label: "Trial", value: "TRIAL", count: counts.TRIAL },
              { label: "Grace Period", value: "GRACE_PERIOD", count: counts.GRACE_PERIOD },
              { label: "Suspended", value: "SUSPENDED", count: counts.SUSPENDED },
              { label: "Expired", value: "EXPIRED", count: counts.EXPIRED },
              { label: "Canceled", value: "CANCELLED", count: counts.CANCELLED },
            ].map((tab) => {
              const isActive = selectedStatus === tab.value;
              return (
                <button
                  key={tab.value}
                  onClick={() => {
                    setSelectedStatus(tab.value);
                    setPage(0);
                    setExpandedSubId(null);
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all duration-150",
                    isActive
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-surface-2"
                  )}
                >
                  <span>{tab.label}</span>
                  <span
                    className={cn(
                      "text-[9px] px-1.5 py-0.2 rounded-full",
                      isActive ? "bg-white/20 text-white" : "bg-surface-2 text-[var(--text-tertiary)]"
                    )}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Right Toolbar Actions */}
          <div className="flex items-center gap-3">
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 transform -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(0);
                }}
                placeholder="Search organizations..."
                className="w-full bg-surface border border-border rounded-xl pl-9 pr-4 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-indigo-500 placeholder-[var(--text-tertiary)]"
              />
            </div>
            
            <Button variant="outline" className="border-border hover:bg-surface-hover/30 text-xs h-9 rounded-xl">
              <Filter className="w-3.5 h-3.5 mr-1.5 text-[var(--text-tertiary)]" />
              Filters
            </Button>

            <Button variant="outline" className="border-border hover:bg-surface-hover/30 text-xs h-9 rounded-xl">
              <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5 text-[var(--text-tertiary)]" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Full-width Data Table */}
        <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
          <DataTable 
            table={table} 
            isLoading={isLoading} 
            onRowClick={(sub: Subscription) => setExpandedSubId(expandedSubId === sub.id ? null : sub.id)}
          />
        </div>

        {/* Collapsible Details Drawer Panel */}
        <AnimatePresence>
          {expandedSubId && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="px-5 py-4 border border-border bg-surface rounded-2xl mt-2 shadow-lg">
                {(() => {
                  const matchedSub = subscriptions.find((s: Subscription) => s.id === expandedSubId);
                  return matchedSub ? (
                    <SubscriptionDetailsPanel 
                      sub={matchedSub} 
                      plans={plans} 
                      onClose={() => setExpandedSubId(null)} 
                    />
                  ) : (
                    <p className="text-[var(--text-tertiary)] text-xs">Error loading subscription details</p>
                  );
                })()}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PageContainer>
  );
}
