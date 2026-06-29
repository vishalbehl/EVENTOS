"use client"
import React, { useState, useEffect } from "react"
import {
  useSubscriptions,
  useSubscriptionPlans,
  useExtendTrial,
  useChangePlan,
  useAdminDashboard,
  useRevenueAnalytics,
  formatINR,
} from "@/services/super-admin-service"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader"
import { Button } from "@/components/ui/button"
import {
  Search,
  FileSpreadsheet,
  AlertTriangle,
  Clock,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  Settings,
} from "lucide-react"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"
import { useRouter } from "next/navigation"

export default function SubscriptionsPage() {
  const router = useRouter()
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL")
  const [searchVal, setSearchVal] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [selectedPlanId, setSelectedPlanId] = useState<string>("ALL")
  const [page, setPage] = useState(1)
  const limit = 8

  // Modals / Action states
  const [activeActionOrgId, setActiveActionOrgId] = useState<string | null>(null)
  const [actionType, setActionType] = useState<"plan" | "trial" | null>(null)
  const [extendDays, setExtendDays] = useState(7)
  const [extendReason, setExtendReason] = useState("")
  const [targetPlanId, setTargetPlanId] = useState("")

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchVal)
      setPage(1)
    }, 300)
    return () => clearTimeout(handler)
  }, [searchVal])

  const { data: plansData = [] } = useSubscriptionPlans()
  const { data: dashData } = useAdminDashboard()
  const { data: revData } = useRevenueAnalytics("12m")

  const { data, isLoading, error, refetch } = useSubscriptions({
    status: selectedStatus === "ALL" ? undefined : selectedStatus,
    plan_id: selectedPlanId === "ALL" ? undefined : selectedPlanId,
    search: debouncedSearch || undefined,
    skip: (page - 1) * limit,
    limit,
  })

  const { mutate: extendTrial, isPending: isExtending } = useExtendTrial()
  const { mutate: changePlan, isPending: isChanging } = useChangePlan()

  const items = data?.items || []
  const total = data?.total || 0
  const totalPages = Math.ceil(total / limit) || 1

  // Status mapping and counts
  const STATUS_TABS = [
    { label: "ALL", value: "ALL", count: total },
    { label: "ACTIVE", value: "ACTIVE", count: dashData?.subscriptions_active || 0 },
    { label: "TRIAL", value: "TRIAL", count: dashData?.subscriptions_trial || 0 },
    { label: "GRACE PERIOD", value: "GRACE_PERIOD", count: dashData?.subscriptions_grace || 0 },
    { label: "SUSPENDED", value: "SUSPENDED", count: dashData?.subscriptions_suspended || 0 },
    { label: "EXPIRED", value: "EXPIRED", count: dashData?.subscriptions_expired || 0 },
    { label: "CANCELLED", value: "CANCELLED", count: dashData?.subscriptions_cancelled || 0 },
  ]

  const PLAN_COLORS: Record<string, string> = {
    Basic: "#64748B",
    Professional: "#4F46E5",
    Enterprise: "#7C3AED",
  }

  // Handle Export CSV
  const handleExportCSV = () => {
    if (items.length === 0) return
    const headers = ["Org Name", "Plan", "Status", "MRR (INR)", "Period End", "Trial Ends"]
    const rows = items.map(item => [
      item.org_name,
      item.plan_name,
      item.status,
      item.mrr_inr,
      item.current_period_end || "",
      item.trial_ends_at || "",
    ])
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n")
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `subscriptions_${new Date().toISOString().slice(0,10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <PageContainer>
      <SectionHeader
        title="Subscriptions"
        description="Monitor and manage all organization subscriptions and billing states."
      />

      <div className="flex gap-6 items-start">
        {/* ── MAIN CONTENT (TABLE + FILTERS) ────────────────── */}
        <div className="flex-1 space-y-4 min-w-0">
          
          {/* Status Pills */}
          <div className="flex flex-wrap gap-1 p-1 bg-[var(--bg-surface-2)] border border-[var(--border-subtle)] rounded-xl w-fit">
            {STATUS_TABS.map(tab => (
              <button
                key={tab.value}
                onClick={() => {
                  setSelectedStatus(tab.value)
                  setPage(1)
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors
                  ${selectedStatus === tab.value
                    ? "bg-brand-primary text-white"
                    : "text-secondary hover:text-primary hover:bg-surface-hover"}`}
              >
                <span>{tab.label}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full
                  ${selectedStatus === tab.value
                    ? "bg-white/20 text-white"
                    : "bg-surface-2 text-tertiary"}`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Filters Row */}
          <div className="flex gap-3 items-center">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-tertiary" />
              <input
                type="text"
                placeholder="Search organizations..."
                value={searchVal}
                onChange={e => setSearchVal(e.target.value)}
                className="w-full bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl pl-9 pr-4 py-2 text-sm text-primary focus:outline-none focus:border-brand-primary"
              />
            </div>
            
            <select
              value={selectedPlanId}
              onChange={e => {
                setSelectedPlanId(e.target.value)
                setPage(1)
              }}
              className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl px-3 py-2 text-sm text-primary cursor-pointer focus:outline-none focus:border-brand-primary"
            >
              <option value="ALL">All Plans</option>
              {plansData.map(plan => (
                <option key={plan.id} value={plan.id}>{plan.name}</option>
              ))}
            </select>

            <Button variant="outline" onClick={handleExportCSV} className="rounded-xl flex gap-1.5 text-xs py-2">
              <FileSpreadsheet className="w-4 h-4 text-secondary" />
              Export CSV
            </Button>
          </div>

          {/* Subscriptions Table */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl overflow-hidden shadow-sm">
            {isLoading ? (
              <div className="divide-y divide-[var(--border-subtle)]">
                {Array.from({ length: limit }).map((_, i) => (
                  <div key={i} className="h-16 bg-surface-2 animate-pulse" />
                ))}
              </div>
            ) : error ? (
              <div className="flex flex-col items-center gap-2 py-16">
                <AlertTriangle className="h-8 w-8 text-danger" />
                <p className="text-sm text-secondary">Failed to load subscriptions</p>
                <button onClick={() => refetch()} className="text-xs bg-brand-primary text-white px-3 py-1.5 rounded-lg">
                  Retry
                </button>
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-16 text-center">
                <Building2Icon className="h-10 w-10 text-tertiary" />
                <p className="text-sm text-secondary font-medium">No subscriptions found</p>
                <p className="text-xs text-tertiary">Try clearing your filters or changing search query</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border-default)] bg-[var(--bg-surface-2)] text-[11px] font-semibold text-secondary uppercase tracking-wider">
                    <th className="py-3.5 px-4">Organization</th>
                    <th className="py-3.5 px-4">Plan</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4">Trial Ends</th>
                    <th className="py-3.5 px-4">Period End</th>
                    <th className="py-3.5 px-4 text-right">MRR</th>
                    <th className="py-3.5 px-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] text-sm">
                  {items.map(item => {
                    const isExpiringSoon = item.status === "TRIAL" && item.days_until_trial_end !== null && item.days_until_trial_end <= 7
                    return (
                      <tr key={item.id} className="hover:bg-[var(--bg-surface-hover)] group transition-colors">
                        {/* Org details */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-brand-primary-muted text-brand-primary flex items-center justify-center font-bold text-xs shrink-0">
                              {item.org_name.slice(0,2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-primary truncate">{item.org_name}</p>
                              <p className="text-xs text-tertiary font-mono">{item.org_slug}</p>
                            </div>
                          </div>
                        </td>

                        {/* Plan */}
                        <td className="py-3.5 px-4">
                          <span
                            className="text-xs px-2 py-0.5 rounded-md text-white font-medium"
                            style={{ backgroundColor: item.plan_color_hex || PLAN_COLORS[item.plan_name] || "#64748B" }}
                          >
                            {item.plan_name}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase
                            ${item.status === 'ACTIVE' ? 'bg-success-muted text-success border-success/20'
                              : item.status === 'TRIAL' ? 'bg-info-muted text-info border-info/20'
                              : item.status === 'GRACE_PERIOD' ? 'bg-warning-muted text-warning border-warning/20'
                              : item.status === 'SUSPENDED' ? 'bg-danger-muted text-danger border-danger/20'
                              : 'bg-surface-2 text-secondary border-border'}`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-current" />
                            {item.status.replace('_', ' ')}
                          </span>
                        </td>

                        {/* Trial End */}
                        <td className="py-3.5 px-4">
                          {item.trial_ends_at ? (
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-secondary">
                                {new Date(item.trial_ends_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                              </span>
                              {isExpiringSoon && (
                                <span className="bg-danger-muted text-danger text-[10px] font-bold px-1.5 py-0.2 rounded flex items-center gap-0.5">
                                  <Clock className="w-3 h-3" />
                                  {item.days_until_trial_end}d
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-tertiary">—</span>
                          )}
                        </td>

                        {/* Period End */}
                        <td className="py-3.5 px-4 font-mono text-secondary">
                          {item.current_period_end ? (
                            new Date(item.current_period_end).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })
                          ) : (
                            <span className="text-tertiary">—</span>
                          )}
                        </td>

                        {/* MRR */}
                        <td className="py-3.5 px-4 text-right font-mono font-semibold text-success">
                          {formatINR(item.mrr_inr)}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="relative inline-block group/menu">
                            <button className="p-1 rounded-md hover:bg-surface-2 text-secondary">
                              <MoreVertical className="w-4 h-4" />
                            </button>
                            <div className="absolute right-0 bottom-full mb-1 w-40 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl py-1 shadow-lg hidden group-hover/menu:block hover:block z-10">
                              <button
                                onClick={() => {
                                  setActiveActionOrgId(item.organization_id)
                                  setActionType("plan")
                                  setTargetPlanId(item.plan_id)
                                }}
                                className="w-full text-left px-3.5 py-1.5 text-xs text-primary hover:bg-surface-hover"
                              >
                                Change Plan
                              </button>
                              {item.status === "TRIAL" && (
                                <button
                                  onClick={() => {
                                    setActiveActionOrgId(item.organization_id)
                                    setActionType("trial")
                                    setExtendDays(7)
                                    setExtendReason("")
                                  }}
                                  className="w-full text-left px-3.5 py-1.5 text-xs text-primary hover:bg-surface-hover"
                                >
                                  Extend Trial
                                </button>
                              )}
                              <button
                                onClick={() => router.push(`/organizations/${item.organization_id}`)}
                                className="w-full text-left px-3.5 py-1.5 text-xs text-primary hover:bg-surface-hover"
                              >
                                View Detail
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between py-2">
              <span className="text-xs text-secondary">
                Showing <span className="font-semibold text-primary">{(page - 1) * limit + 1}</span> to{" "}
                <span className="font-semibold text-primary">{Math.min(page * limit, total)}</span> of{" "}
                <span className="font-semibold text-primary">{total}</span> subscriptions
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage(p => p - 1)}
                  className="h-8 rounded-lg"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === totalPages}
                  onClick={() => setPage(p => p + 1)}
                  className="h-8 rounded-lg"
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT STICKY SIDEBAR (250px) ──────────────────── */}
        <div className="w-[260px] space-y-4 shrink-0 sticky top-4 self-start">
          {/* Donut MRR by Plan */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-secondary mb-3">MRR by Plan</h4>
            <div className="h-36 flex items-center justify-center relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={revData?.mrr_by_plan || []}
                    dataKey="mrr"
                    nameKey="plan"
                    innerRadius={36}
                    outerRadius={52}
                    paddingAngle={3}
                  >
                    {(revData?.mrr_by_plan || []).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PLAN_COLORS[entry.plan] || "#64748B"} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatINR(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[10px] text-tertiary font-medium uppercase tracking-wide">Total</span>
                <span className="text-xs font-bold text-primary font-mono mt-0.5">
                  {formatINR(revData?.summary?.mrr || 0)}
                </span>
              </div>
            </div>
            {/* Legend */}
            <div className="space-y-1.5 mt-2">
              {(revData?.mrr_by_plan || []).map(entry => (
                <div key={entry.plan} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PLAN_COLORS[entry.plan] || "#64748B" }} />
                    <span className="text-secondary font-medium">{entry.plan}</span>
                  </div>
                  <span className="font-mono text-primary font-semibold">{formatINR(entry.mrr)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Trials Expiring Soon */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-secondary mb-3">Expiring Trials</h4>
            <div className="space-y-3">
              {(dashData?.trials_expiring || []).slice(0, 4).map(trial => (
                <div key={trial.org_id} className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-primary truncate">{trial.org_name}</p>
                    <p className="text-[10px] text-tertiary">{trial.plan_name}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0
                    ${trial.days_remaining <= 3 ? "bg-danger-muted text-danger"
                      : trial.days_remaining <= 7 ? "bg-warning-muted text-warning"
                      : "bg-info-muted text-info"}`}>
                    {trial.days_remaining}d
                  </span>
                </div>
              ))}
              {(dashData?.trials_expiring || []).length === 0 && (
                <p className="text-xs text-tertiary text-center py-4">No expiring trials</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── ACTION MODAL / BOXES ──────────────────────────── */}
      {activeActionOrgId && actionType && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl p-5 w-full max-w-sm shadow-xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-[var(--border-subtle)]">
              <h4 className="font-bold text-primary text-sm uppercase tracking-wide">
                {actionType === "plan" ? "Migrate Plan Tier" : "Extend Sandbox Trial"}
              </h4>
              <button
                onClick={() => {
                  setActiveActionOrgId(null)
                  setActionType(null)
                }}
                className="text-secondary hover:text-primary text-xs"
              >
                ✕
              </button>
            </div>

            {actionType === "plan" ? (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-secondary">Target Billing Plan</label>
                  <select
                    value={targetPlanId}
                    onChange={e => setTargetPlanId(e.target.value)}
                    className="w-full bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl py-2 px-3 text-sm focus:outline-none focus:border-brand-primary"
                  >
                    <option value="" disabled>Select plan...</option>
                    {plansData.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setActiveActionOrgId(null)
                      setActionType(null)
                    }}
                    className="rounded-xl text-xs h-9"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      if (!targetPlanId) return
                      changePlan(
                        { orgId: activeActionOrgId, planId: targetPlanId },
                        {
                          onSuccess: () => {
                            setActiveActionOrgId(null)
                            setActionType(null)
                            refetch()
                          },
                        }
                      )
                    }}
                    disabled={isChanging || !targetPlanId}
                    className="bg-brand-primary text-white rounded-xl text-xs h-9"
                  >
                    {isChanging ? "Saving..." : "Transition Plan"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-3">
                  <div className="flex gap-2 items-center">
                    <label className="text-[10px] uppercase font-bold text-secondary">Days to Add</label>
                    <input
                      type="number"
                      min={1}
                      max={90}
                      value={extendDays}
                      onChange={e => setExtendDays(Number(e.target.value))}
                      className="w-16 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg text-center py-1 text-sm focus:outline-none focus:border-brand-primary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-secondary block">Extension Justification</label>
                    <textarea
                      placeholder="Reason for trial extension..."
                      rows={3}
                      value={extendReason}
                      onChange={e => setExtendReason(e.target.value)}
                      className="w-full bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl p-2.5 text-xs text-primary focus:outline-none focus:border-brand-primary resize-none"
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setActiveActionOrgId(null)
                      setActionType(null)
                    }}
                    className="rounded-xl text-xs h-9"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      if (extendReason.length < 5) return
                      extendTrial(
                        { orgId: activeActionOrgId, days: extendDays, reason: extendReason },
                        {
                          onSuccess: () => {
                            setActiveActionOrgId(null)
                            setActionType(null)
                            refetch()
                          },
                        }
                      )
                    }}
                    disabled={isExtending || extendReason.length < 5}
                    className="bg-brand-primary text-white rounded-xl text-xs h-9"
                  >
                    {isExtending ? "Extending..." : "Confirm Extension"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </PageContainer>
  )
}

function Building2Icon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21h10.5V3.75A1.125 1.125 0 0 0 16.125 2.625H7.875a1.125 1.125 0 0 0-1.125 1.125V21Z"
      />
    </svg>
  )
}
