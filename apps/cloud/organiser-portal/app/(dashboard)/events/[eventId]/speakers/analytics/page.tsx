"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  BarChart3,
  TrendingUp,
  Users,
  FileUp,
  Globe,
  Zap,
  Clock,
  Layers,
  Activity,
  CheckCircle2,
  Mail,
  Fingerprint,
  Map,
  Presentation,
  FileText,
  Table2,
  PieChart,
  Timer,
  Loader2,
  FileSpreadsheet,
  FileImage,
  PlayCircle,
  MapPin,
  Calendar,
  Share2,
} from "lucide-react";
import { cn, getFallbackTimezone } from "@/lib/utils";
import {
  useDashboardStats,
  useApprovalTimes,
  useFileFormats,
  useRoomBreakdown,
  useExportDownload,
  useMainDashboardStats,
  useEvent,
} from "@/hooks/useEvents";
import { TooltipProvider } from "@/components/ui/Tooltip";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartTooltip,
  ResponsiveContainer,
  PieChart as RechartPie,
  Pie,
  Cell,
} from "recharts";
import { toast } from "sonner";

import { DailyUploadsChart } from "@/components/organizer/dashboard/DailyUploadsChart";
import { RoomReadinessChart } from "@/components/organizer/dashboard/RoomReadinessChart";
import { ReadinessHeatmap } from "@/components/organizer/dashboard/ReadinessHeatmap";

const CHART_COLORS = ["#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899"];

const FORMAT_LABELS: Record<string, string> = {
  pptx: "PowerPoint",
  pdf: "PDF",
  mp4: "Video",
  zip: "ZIP",
  ppt: "PPT (Old)",
  key: "Keynote",
  docx: "Word",
  unknown: "Other",
};

function SectionHeader({ title, sub, icon: Icon }: { title: string; sub: string; icon: any }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--pri)]/10 text-[var(--pri)] border border-[var(--pri)]/20">
        <Icon className="size-4" />
      </div>
      <div>
        <h3 className="text-sm font-bold text-[var(--text-primary)]">{title}</h3>
        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          {sub}
        </p>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const params = useParams();
  const eventIdStr = (params?.eventId as string) || "";
  const [exportLoading, setExportLoading] = useState<string | null>(null);

  const { data, isLoading } = useDashboardStats(eventIdStr);
  const { data: event, isLoading: eventLoading } = useEvent(eventIdStr);
  const { data: mainStats, isLoading: mainLoading } = useMainDashboardStats(eventIdStr);
  const { data: approvalTimes, isLoading: atLoading } = useApprovalTimes(eventIdStr);
  const { data: formats, isLoading: fmtLoading } = useFileFormats(eventIdStr);
  const { data: roomBreakdown, isLoading: rbLoading } = useRoomBreakdown(eventIdStr);
  const triggerExport = useExportDownload(eventIdStr);

  const handleExport = async (format: "csv" | "xlsx" | "pdf") => {
    setExportLoading(format);
    try {
      await triggerExport(format);
      toast.success(`${format.toUpperCase()} export downloaded.`);
    } catch (e: any) {
      toast.error(e.message || "Export failed.");
    } finally {
      setExportLoading(null);
    }
  };

  if (isLoading || eventLoading) {
    return (
      <div className="h-[70vh] flex flex-col items-center justify-center gap-3 text-xs text-[var(--text-secondary)]">
        <Loader2 className="size-6 text-[var(--pri)] animate-spin" />
        <span className="font-semibold">Loading real-time analytics telemetry...</span>
      </div>
    );
  }

  const overview = data?.overview ?? {
    total_speakers: data?.total_speakers ?? mainStats?.total_speakers ?? 0,
    total_sessions: data?.total_sessions ?? mainStats?.total_sessions ?? 0,
    files_uploaded: data?.files_uploaded ?? 0,
    files_approved: data?.files_approved ?? 0,
    files_pending: data?.files_pending ?? 0,
    files_rejected: data?.files_rejected ?? 0,
    sessions_ready: data?.sessions_ready ?? 0,
  };
  const funnel = data?.upload_funnel ?? {
    invited: overview.total_speakers ?? 0,
    uploaded: overview.files_uploaded ?? 0,
    approved: overview.files_approved ?? 0,
    upload_rate_pct: data?.upload_rate_pct ?? 0,
    approval_rate_pct: data?.approval_rate_pct ?? 0,
  };

  return (
    <TooltipProvider>
      <div className="w-full space-y-6 p-6">
        {/* ── Header ── */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Activity className="size-4 text-[var(--pri)]" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--pri)]">
                Telemetry & Insights
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              {event?.name} Intelligence
            </h1>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Live funnel performance, venue readiness scans, and file distribution analytics.
            </p>
          </div>

          {/* Export Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {(["csv", "xlsx", "pdf"] as const).map((fmt) => {
              const icons = { csv: FileText, xlsx: FileSpreadsheet, pdf: FileImage };
              const Icon = icons[fmt];
              const labels = { csv: "CSV", xlsx: "Excel", pdf: "PDF Report" };
              return (
                <button
                  type="button"
                  key={fmt}
                  onClick={() => handleExport(fmt)}
                  disabled={exportLoading !== null}
                  className="flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-3 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-40 transition-colors shadow-sm cursor-pointer"
                >
                  {exportLoading === fmt ? (
                    <Loader2 className="size-3.5 animate-spin text-[var(--pri)]" />
                  ) : (
                    <Icon className="size-3.5 text-[var(--pri)]" />
                  )}
                  Export {labels[fmt]}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── KPI Row ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-4 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Total Speakers
            </span>
            <div className="text-2xl font-bold text-[var(--text-primary)] mt-1">
              {overview.total_speakers ?? 0}
            </div>
            <span className="text-[11px] text-[var(--text-secondary)]">Registered faculty slots</span>
          </div>

          <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-4 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Upload Rate
            </span>
            <div className="text-2xl font-bold text-[var(--pri)] mt-1">
              {Math.round(funnel.upload_rate_pct ?? 0)}%
            </div>
            <span className="text-[11px] text-[var(--text-secondary)]">
              {overview.files_uploaded ?? 0} files received
            </span>
          </div>

          <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-4 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Approval Rate
            </span>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
              {Math.round(funnel.approval_rate_pct ?? 0)}%
            </div>
            <span className="text-[11px] text-[var(--text-secondary)]">
              {overview.files_approved ?? 0} verified & approved
            </span>
          </div>

          <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-4 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Sessions Ready
            </span>
            <div className="text-2xl font-bold text-[var(--text-primary)] mt-1">
              {overview.sessions_ready ?? 0} / {overview.total_sessions ?? 0}
            </div>
            <span className="text-[11px] text-[var(--text-secondary)]">Fully staged session rooms</span>
          </div>
        </div>

        {/* ── Conversion Funnel Card ── */}
        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-5 shadow-sm space-y-4">
          <SectionHeader
            title="Conversion Architecture"
            sub="Upload → Validation → Approval Funnel"
            icon={TrendingUp}
          />
          <div className="space-y-4">
            {[
              {
                label: "Total Invited Speakers",
                val: overview.total_speakers ?? 0,
                p: 100,
                color: "bg-[var(--pri)]/40",
              },
              {
                label: "Files Uploaded",
                val: overview.files_uploaded ?? 0,
                p: funnel.upload_rate_pct ?? 0,
                color: "bg-[var(--pri)]",
              },
              {
                label: "Files Approved",
                val: overview.files_approved ?? 0,
                p: funnel.approval_rate_pct ?? 0,
                color: "bg-emerald-500",
              },
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="w-48 shrink-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                    {step.label}
                  </p>
                  <p className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
                    {step.val.toLocaleString()}
                  </p>
                </div>
                <div className="flex-1 h-3 rounded-full bg-[var(--bg-surface-2)] overflow-hidden border border-[var(--border-subtle)]">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${step.p}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className={cn("h-full rounded-full", step.color)}
                  />
                </div>
                <div className="w-14 text-right font-mono text-xs font-bold text-[var(--text-primary)]">
                  {Math.round(step.p)}%
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Upload Velocity & Upcoming Sessions ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-5 shadow-sm lg:col-span-2">
            <SectionHeader
              title="Asset Upload Velocity"
              sub="Daily submission intake volume"
              icon={TrendingUp}
            />
            <DailyUploadsChart data={data.daily_uploads || []} />
          </div>

          <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-5 shadow-sm flex flex-col justify-between">
            <div>
              <SectionHeader
                title="Upcoming Session Timeline"
                sub="Next scheduled rooms"
                icon={PlayCircle}
              />
              <div className="space-y-2.5 overflow-y-auto max-h-[280px] pr-1">
                {mainLoading ? (
                  <div className="py-12 text-center text-xs text-[var(--text-secondary)]">
                    <Loader2 className="size-4 animate-spin mx-auto mb-1 text-[var(--pri)]" />
                    Loading upcoming sessions...
                  </div>
                ) : mainStats?.upcoming_sessions?.length > 0 ? (
                  mainStats.upcoming_sessions.map((sess: any) => (
                    <div
                      key={sess.id}
                      className="p-2.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] flex justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-[var(--text-primary)] truncate">
                          {sess.name}
                        </h4>
                        <span className="text-[10px] text-[var(--text-secondary)] font-medium block truncate">
                          {sess.room_name || "Unassigned Room"}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-mono text-xs font-bold text-[var(--pri)] block">
                          {new Date(sess.start_time).toLocaleTimeString("en-IN", {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: true,
                            timeZone: getFallbackTimezone(),
                          })}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center text-xs text-[var(--text-secondary)]">
                    No scheduled sessions pending.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Room Readiness Bar & Heatmap ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-5 shadow-sm lg:col-span-2">
            <SectionHeader
              title="Room-Wise Completion"
              sub="Ready sessions per venue"
              icon={Layers}
            />
            <RoomReadinessChart data={data.room_readiness || []} />
          </div>

          <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-5 shadow-sm">
            <SectionHeader
              title="Readiness Scan Map"
              sub="Venue readiness percentages"
              icon={Map}
            />
            <div className="overflow-y-auto max-h-[280px] pr-1">
              <ReadinessHeatmap data={data.room_heatmap || []} />
            </div>
          </div>
        </div>

        {/* ── Formats & Approval Times ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Format Pie Chart */}
          <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-5 shadow-sm space-y-4">
            <SectionHeader
              title="File Format Distribution"
              sub="Submission types breakdown"
              icon={PieChart}
            />
            {fmtLoading ? (
              <div className="h-56 flex items-center justify-center text-xs text-[var(--text-secondary)]">
                <Loader2 className="size-5 text-[var(--pri)] animate-spin" />
              </div>
            ) : !formats?.length ? (
              <div className="h-56 flex flex-col items-center justify-center text-xs text-[var(--text-secondary)]">
                <Presentation className="size-8 text-[var(--text-tertiary)] mx-auto mb-2" />
                No files uploaded yet.
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={180}>
                  <RechartPie>
                    <Pie
                      data={formats}
                      dataKey="count"
                      nameKey="format"
                      cx="50%"
                      cy="50%"
                      outerRadius={70}
                      innerRadius={40}
                      paddingAngle={2}
                    >
                      {formats.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartTooltip
                      formatter={(val: any, name: any) => [
                        `${val} files`,
                        FORMAT_LABELS[name] || name,
                      ]}
                    />
                  </RechartPie>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {formats.map((f: any, i: number) => (
                    <div key={f.format} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div
                          className="size-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                        />
                        <span className="font-semibold text-[var(--text-primary)]">
                          {FORMAT_LABELS[f.format] || f.format}
                        </span>
                      </div>
                      <span className="font-mono text-[var(--text-secondary)] font-bold">
                        {f.count} ({f.pct}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Approval Times Bar Chart */}
          <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-5 shadow-sm space-y-4">
            <SectionHeader
              title="Approval Performance"
              sub="Avg. days upload → approval per room"
              icon={Timer}
            />
            {atLoading ? (
              <div className="h-56 flex items-center justify-center text-xs text-[var(--text-secondary)]">
                <Loader2 className="size-5 text-[var(--pri)] animate-spin" />
              </div>
            ) : !approvalTimes?.length ? (
              <div className="h-56 flex flex-col items-center justify-center text-xs text-[var(--text-secondary)]">
                <Clock className="size-8 text-[var(--text-tertiary)] mx-auto mb-2" />
                No approved files yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart
                  data={approvalTimes}
                  margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis
                    dataKey="group_name"
                    tick={{ fontSize: 10, fill: "var(--text-secondary)" }}
                    tickFormatter={(value) => value?.toUpperCase()}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "var(--text-secondary)" }}
                    axisLine={false}
                    tickLine={false}
                    unit=" d"
                  />
                  <RechartTooltip
                    formatter={(val: any) => [`${val} days`, "Avg. Approval Time"]}
                  />
                  <Bar dataKey="avg_days" radius={[4, 4, 0, 0]}>
                    {approvalTimes.map((_: any, i: number) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* ── Per-Room Breakdown Table ── */}
        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-5 shadow-sm space-y-4">
          <SectionHeader
            title="Per-Room Breakdown"
            sub="Upload · Validation · Approval rates by venue"
            icon={Table2}
          />
          {rbLoading ? (
            <div className="py-12 text-center text-xs text-[var(--text-secondary)]">
              <Loader2 className="size-5 text-[var(--pri)] animate-spin mx-auto mb-1" />
              Loading venue metrics...
            </div>
          ) : !roomBreakdown?.length ? (
            <div className="py-12 text-center text-xs text-[var(--text-secondary)]">
              No venue room data available yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                    <th className="py-2.5 px-3">Room</th>
                    <th className="py-2.5 px-3">Sessions</th>
                    <th className="py-2.5 px-3">Speaker Slots</th>
                    <th className="py-2.5 px-3">Upload %</th>
                    <th className="py-2.5 px-3">Validation %</th>
                    <th className="py-2.5 px-3">Approval %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {roomBreakdown.map((r: any, i: number) => (
                    <tr key={r.room_id} className="hover:bg-[var(--bg-surface-hover)]">
                      <td className="py-2.5 px-3 font-semibold text-[var(--text-primary)]">
                        <div className="flex items-center gap-2">
                          <div
                            className="size-2 rounded-full"
                            style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                          />
                          {r.room_name}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-[var(--text-secondary)]">{r.session_count}</td>
                      <td className="py-2.5 px-3 text-[var(--text-secondary)]">{r.speaker_slots}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-[var(--pri)]">
                        {r.upload_pct}% ({r.uploaded_count})
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-[var(--sec)]">
                        {r.validation_pct}% ({r.validated_count})
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {r.approval_pct}% ({r.approved_count})
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
