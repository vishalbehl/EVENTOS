"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowRight,
  Award,
  BarChart3,
  BookOpenCheck,
  CheckSquare,
  Clock,
  FileText,
  Inbox,
  RefreshCw,
  SlidersHorizontal,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAbstractDashboard, useAbstractSubmissions } from "@/hooks/useAbstractWorkflow";
import { AbstractShell, EmptyState, StatusPill } from "./AbstractShell";

export const CHART_COLORS = ["#6366F1", "#8B5CF6", "#EC4899", "#10B981", "#F59E0B", "#06B6D4", "#3B82F6", "#14B8A6"];

export function AbstractDashboardView() {
  const { eventId } = useParams<{ eventId: string }>();
  const dashboard = useAbstractDashboard(eventId);
  const submissionsQuery = useAbstractSubmissions(eventId);
  const data = dashboard.data;
  const counts = data?.counts || {};
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    try {
      setSyncing(true);
      await Promise.all([dashboard.refetch(), submissionsQuery.refetch()]);
      toast.success("Dashboard metrics updated");
    } finally {
      setSyncing(false);
    }
  };

  const allSubmissions = submissionsQuery.data?.items || data?.recent || [];

  // Intake timeline (Group by submitted date)
  const timelineData = useMemo(() => {
    if (!allSubmissions.length) {
      return [
        { date: "Day 1", count: 0 },
        { date: "Day 2", count: 0 },
        { date: "Day 3", count: 0 },
      ];
    }
    const dateCounts: Record<string, number> = {};
    allSubmissions.forEach((sub) => {
      const d = sub.submitted_at
        ? new Date(sub.submitted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
        : "Draft";
      dateCounts[d] = (dateCounts[d] || 0) + 1;
    });
    return Object.entries(dateCounts).map(([date, count]) => ({ date, count }));
  }, [allSubmissions]);

  // Category / Topic distribution
  const categoryData = useMemo(() => {
    const topicCounts: Record<string, number> = {};
    allSubmissions.forEach((sub) => {
      const key = sub.topic || sub.abstract_type || "General";
      topicCounts[key] = (topicCounts[key] || 0) + 1;
    });

    if (Object.keys(topicCounts).length === 0) {
      const configuredTopics = data?.call?.topics || [];
      if (configuredTopics.length > 0) {
        return configuredTopics.map((t) => ({ name: t, value: 0 }));
      }
      return [{ name: "General", value: 0 }];
    }

    return Object.entries(topicCounts).map(([name, value]) => ({ name, value }));
  }, [allSubmissions, data?.call]);

  // Status Funnel / Pipeline Data
  const statusPipelineData = useMemo(() => {
    return [
      { name: "Draft", count: counts.DRAFT || 0, fill: "#94a3b8" },
      { name: "Submitted", count: counts.SUBMITTED || 0, fill: "#38bdf8" },
      { name: "In Review", count: counts.UNDER_REVIEW || 0, fill: "#f59e0b" },
      { name: "Accepted", count: counts.ACCEPTED || 0, fill: "#10b981" },
      { name: "Rejected", count: counts.REJECTED || 0, fill: "#f43f5e" },
      { name: "Revision", count: counts.REVISION_REQUESTED || 0, fill: "#8b5cf6" },
    ];
  }, [counts]);

  const totalSubmissions =
    (counts.SUBMITTED || 0) +
    (counts.UNDER_REVIEW || 0) +
    (counts.ACCEPTED || 0) +
    (counts.REJECTED || 0) +
    (counts.REVISION_REQUESTED || 0) +
    (counts.DRAFT || 0);

  const decidedCount = (counts.ACCEPTED || 0) + (counts.REJECTED || 0);
  const acceptanceRate = decidedCount > 0 ? `${Math.round(((counts.ACCEPTED || 0) / decidedCount) * 100)}%` : "N/A";

  const kpis = [
    {
      label: "Total Submissions",
      value: totalSubmissions,
      subtext: `${counts.SUBMITTED || 0} waiting intake`,
      icon: Inbox,
      color: "text-[var(--brand-primary)]",
      borderColor: "border-[var(--brand-primary)]/20",
    },
    {
      label: "Under Review",
      value: counts.UNDER_REVIEW || 0,
      subtext: `${data?.reviewer_load?.assigned || 0} reviews assigned`,
      icon: CheckSquare,
      color: "text-amber-500",
      borderColor: "border-amber-500/20",
    },
    {
      label: "Accepted",
      value: counts.ACCEPTED || 0,
      subtext: `${acceptanceRate} decision rate`,
      icon: CheckSquare,
      color: "text-emerald-500",
      borderColor: "border-emerald-500/20",
    },
    {
      label: "Published",
      value: data?.publication.published || 0,
      subtext: `${data?.publication.ready || 0} ready for schedule`,
      icon: BookOpenCheck,
      color: "text-indigo-500",
      borderColor: "border-indigo-500/20",
    },
    {
      label: "Reviewer Load",
      value: `${data?.reviewer_load?.completed || 0} / ${data?.reviewer_load?.assigned || 0}`,
      subtext: `${data?.reviewer_load?.reviewers || 0} active reviewers`,
      icon: Users,
      color: "text-sky-500",
      borderColor: "border-sky-500/20",
    },
    {
      label: "Acceptance Rate",
      value: acceptanceRate,
      subtext: `${decidedCount} total decided`,
      icon: TrendingUp,
      color: "text-violet-500",
      borderColor: "border-violet-500/20",
    },
  ];

  const recentItems = data?.recent || [];

  const dashboardActions = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleSync}
        disabled={syncing || dashboard.isFetching}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-2)] shadow-sm transition-colors cursor-pointer"
      >
        <RefreshCw className={cn("size-3.5", (syncing || dashboard.isFetching) && "animate-spin text-[var(--brand-primary)]")} />
        <span>Sync</span>
      </button>
      <Link
        href={`/events/${eventId}/abstracts/setup`}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--pri)] px-3.5 text-xs font-bold text-[var(--primary-contrast)] hover:opacity-90 shadow-sm transition-opacity"
      >
        <SlidersHorizontal className="size-3.5" />
        <span>Abstract Setup</span>
      </Link>
    </div>
  );

  return (
    <AbstractShell view="dashboard" actions={dashboardActions}>
      {dashboard.isLoading ? (
        <EmptyState title="Loading abstract dashboard" body="The event abstract ledger is being loaded from the backend." />
      ) : dashboard.isError ? (
        <EmptyState title="Abstract service unavailable" body="Failed to load dashboard metrics. Check API connectivity and reload." />
      ) : (
        <div className="space-y-6">
          {/* KPI Cards Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
            {kpis.map((kpi) => (
              <div
                key={kpi.label}
                className={cn(
                  "rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 shadow-sm flex flex-col justify-between hover:border-[var(--border-hover)] transition-all",
                  kpi.borderColor
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                    {kpi.label}
                  </span>
                  <kpi.icon className={cn("size-4", kpi.color)} />
                </div>
                <div className="mt-3">
                  <div className="font-mono text-2xl font-bold text-[var(--text-primary)]">
                    {kpi.value}
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--text-secondary)] truncate">
                    {kpi.subtext}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Charts Row: Intake Trend & Category Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Intake Growth Trend */}
            <div className="lg:col-span-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="size-4 text-[var(--brand-primary)]" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    Submission Intake Velocity
                  </h3>
                </div>
                <span className="text-[10px] font-semibold text-[var(--text-tertiary)]">
                  Intake timeline
                </span>
              </div>
              <div className="h-64 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timelineData}>
                    <defs>
                      <linearGradient id="abstractGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--brand-primary)" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="var(--brand-primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                    <XAxis dataKey="date" fontSize={11} tick={{ fill: "var(--text-secondary)" }} />
                    <YAxis allowDecimals={false} fontSize={11} tick={{ fill: "var(--text-secondary)" }} />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border-default)",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      name="Submissions"
                      stroke="var(--brand-primary)"
                      strokeWidth={2.5}
                      fill="url(#abstractGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Category / Topic Distribution */}
            <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 shadow-sm space-y-3 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Award className="size-4 text-purple-500" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    Category Breakdown
                  </h3>
                </div>
                <span className="text-[10px] font-semibold text-[var(--text-tertiary)]">
                  By Topic
                </span>
              </div>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={42}
                      outerRadius={65}
                      paddingAngle={3}
                    >
                      {categoryData.map((entry, index) => (
                        <Cell key={`cat-cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border-default)",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-2 text-[10px] font-semibold text-[var(--text-secondary)] max-h-24 overflow-y-auto">
                {categoryData.map((item, idx) => (
                  <span key={item.name} className="flex items-center gap-1.5 rounded bg-[var(--bg-surface-2)] px-2 py-0.5 border border-[var(--border-subtle)]">
                    <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
                    <span className="truncate max-w-[100px]">{item.name}</span>
                    <span className="font-mono text-[var(--text-tertiary)]">({item.value})</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Workflow Status Distribution Bar Chart */}
          <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="size-4 text-[var(--brand-primary)]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                  Workflow Funnel Distribution
                </h3>
              </div>
              <span className="text-[10px] font-semibold text-[var(--text-tertiary)]">
                Active pipeline stages
              </span>
            </div>
            <div className="h-48 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusPipelineData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                  <XAxis dataKey="name" fontSize={11} tick={{ fill: "var(--text-secondary)" }} />
                  <YAxis allowDecimals={false} fontSize={11} tick={{ fill: "var(--text-secondary)" }} />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-default)",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="count" name="Abstracts" radius={[4, 4, 0, 0]}>
                    {statusPipelineData.map((entry, index) => (
                      <Cell key={`status-bar-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Recent Activity Table */}
          <div className="overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <Clock className="size-4 text-[var(--brand-primary)]" />
                  <h2 className="text-sm font-bold text-[var(--text-primary)]">Recent Activity</h2>
                  <span className="rounded-full bg-[var(--bg-surface-2)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                    {recentItems.length} submissions
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                  Live ledger of recent abstract submissions, author intake, and scoring state.
                </p>
              </div>
              <Link
                href={`/events/${eventId}/abstracts/submissions`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
              >
                <span>Submission Inbox</span>
                <ArrowRight className="size-3.5" />
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--bg-surface-2)] border-b border-[var(--border-subtle)] text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                  <tr>
                    <th className="px-5 py-3">Code & Title</th>
                    <th className="px-4 py-3">Category / Topic</th>
                    <th className="px-4 py-3">Presenter</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Reviews</th>
                    <th className="px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {recentItems.length > 0 ? (
                    recentItems.map((item) => (
                      <tr key={item.id} className="hover:bg-[var(--bg-surface-2)]/50 transition-colors">
                        <td className="px-5 py-3.5 max-w-[280px]">
                          <div className="font-mono text-[11px] font-bold text-[var(--brand-primary)]">
                            {item.code}
                          </div>
                          <div className="truncate font-semibold text-[var(--text-primary)] mt-0.5" title={item.title}>
                            {item.title}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="inline-flex items-center rounded-md bg-[var(--bg-surface-2)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                            {item.topic || item.abstract_type || "General"}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="font-medium text-[var(--text-primary)]">
                            {item.presenter_name || "—"}
                          </div>
                          {item.presenter_email && (
                            <div className="text-[11px] text-[var(--text-tertiary)] truncate max-w-[150px]">
                              {item.presenter_email}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <StatusPill status={item.status} />
                        </td>
                        <td className="px-4 py-3.5 text-[11px] text-[var(--text-secondary)] whitespace-nowrap">
                          {item.submitted_at
                            ? new Date(item.submitted_at).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })
                            : "Draft"}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-[var(--text-primary)]">
                              {item.review_count}
                            </span>
                            <span className="text-[10px] text-[var(--text-tertiary)]">
                              {item.average_score != null ? `(avg: ${item.average_score.toFixed(1)})` : "reviews"}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <Link
                            href={`/events/${eventId}/abstracts/submissions?search=${encodeURIComponent(item.code)}`}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--brand-primary)] hover:underline"
                          >
                            <span>Inspect</span>
                            <ArrowRight className="size-3" />
                          </Link>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="p-8 text-center">
                        <FileText className="mx-auto size-8 text-[var(--text-tertiary)]" />
                        <p className="mt-2 text-xs font-bold text-[var(--text-primary)]">No submissions received yet</p>
                        <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
                          Submitted abstracts will appear in this real-time activity log as authors complete intake.
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </AbstractShell>
  );
}
export default AbstractDashboardView;
