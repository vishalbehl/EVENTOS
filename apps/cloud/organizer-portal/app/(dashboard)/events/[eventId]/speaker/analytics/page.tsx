"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3, TrendingUp, Users, FileUp, Globe, Shield,
  Zap, Clock, Download, Share2, Layers, Activity,
  ArrowUpRight, CheckCircle2, Mail, Server, Fingerprint,
  Map, Presentation, FileText, Table2, PieChart, Timer,
  Loader2, FileSpreadsheet, FileImage,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  useDashboardStats,
  useApprovalTimes,
  useFileFormats,
  useRoomBreakdown,
  useExportDownload,
} from "@/hooks/useEvents";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/Tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartTooltip,
  ResponsiveContainer, PieChart as RechartPie, Pie, Cell, Legend,
} from "recharts";
import { toast } from "sonner";

// ── Colour palette for charts ──────────────────────────────────
const CHART_COLORS = ["#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899"];

const FORMAT_LABELS: Record<string, string> = {
  pptx: "PowerPoint", pdf: "PDF", mp4: "Video", zip: "ZIP",
  ppt: "PPT (Old)", key: "Keynote", docx: "Word", unknown: "Other",
};

// ── Sub-components ─────────────────────────────────────────────

function SectionHeader({ title, sub, icon: Icon }: { title: string; sub: string; icon: any }) {
  return (
    <div className="flex items-center gap-4 mb-8">
      <div className="h-10 w-10 rounded-xl bg-[var(--pri)]/10 flex items-center justify-center border border-[var(--pri)]/20">
        <Icon className="h-5 w-5 text-[var(--pri)]" />
      </div>
      <div>
        <h3 className="text-xl font-black text-[var(--text)] tracking-tight">{title}</h3>
        <p className="text-[10px] font-black text-muted uppercase tracking-[0.3em] mt-0.5">{sub}</p>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, icon: Icon, color }: any) {
  return (
    <div className="glass-3d p-6 rounded-[2rem] border-default flex items-center gap-5 group hover-lift-3d">
      <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center border", color ? `bg-[${color}]/10 border-[${color}]/20` : "bg-[var(--pri)]/10 border-[var(--pri)]/20")}>
        <Icon className="h-6 w-6 text-[var(--pri)]" />
      </div>
      <div>
        <p className="text-[10px] font-black text-muted uppercase tracking-[0.2em]">{label}</p>
        <p className="text-2xl font-black text-[var(--text)] tracking-tighter">{value}</p>
        {sub && <p className="text-[10px] font-bold text-muted mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────
export default function AnalyticsPage() {
  const { eventId } = useParams();
  const eventIdStr = eventId as string;
  const [exportLoading, setExportLoading] = useState<string | null>(null);

  const { data, isLoading } = useDashboardStats(eventIdStr);
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

  if (isLoading) {
    return (
      <div className="h-[80vh] flex flex-col items-center justify-center gap-4">
        <div className="relative h-20 w-20">
          <Activity className="h-20 w-20 text-[var(--pri)] animate-spin opacity-20" />
          <Activity className="absolute inset-0 h-20 w-20 text-[var(--pri)] animate-pulse" />
        </div>
        <p className="text-[11px] font-black text-muted uppercase tracking-[0.4em] animate-pulse">
          Synchronizing Analytics...
        </p>
      </div>
    );
  }

  if (!data) return null;

  const overview = data.overview ?? {};
  const funnel = data.upload_funnel ?? {};

  return (
    <TooltipProvider>
      <div className="space-y-14 max-w-[1600px] mx-auto pb-32 animate-fade-in">

        {/* ── Header ── */}
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 px-2">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[var(--pri)]/10 flex items-center justify-center border border-[var(--pri)]/20">
                <Activity className="h-5 w-5 text-[var(--pri)]" />
              </div>
              <h1 className="text-4xl font-black tracking-tighter text-[var(--text)] text-glow-indigo">
                Strategic <span className="text-[var(--sec)]">Intelligence</span>
              </h1>
            </div>
            <p className="text-[12px] font-bold text-muted uppercase tracking-[0.4em] ml-1">
              Real-time analytics dashboard
            </p>
          </div>

          {/* Export Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            {(["csv", "xlsx", "pdf"] as const).map((fmt) => {
              const icons = { csv: FileText, xlsx: FileSpreadsheet, pdf: FileImage };
              const Icon = icons[fmt];
              const labels = { csv: "CSV", xlsx: "Excel", pdf: "PDF Summary" };
              return (
                <Button
                  key={fmt}
                  onClick={() => handleExport(fmt)}
                  disabled={exportLoading !== null}
                  className="h-11 px-5 glass-3d border-default text-[var(--text)] font-black uppercase tracking-widest text-[10px] rounded-2xl hover:border-[var(--pri)]/50 transition-all"
                  variant="outline"
                >
                  {exportLoading === fmt ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                  ) : (
                    <Icon className="h-3.5 w-3.5 mr-2" />
                  )}
                  Export {labels[fmt]}
                </Button>
              );
            })}
          </div>
        </header>

        {/* ── KPI Row ── */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-6 px-2">
          <StatCard label="Total Speakers" value={overview.total_speakers ?? 0} icon={Users} />
          <StatCard label="Upload Rate" value={`${Math.round(funnel.upload_rate_pct ?? 0)}%`} sub={`${overview.files_uploaded ?? 0} files received`} icon={FileUp} />
          <StatCard label="Approval Rate" value={`${Math.round(funnel.approval_rate_pct ?? 0)}%`} sub={`${overview.files_approved ?? 0} approved`} icon={CheckCircle2} />
          <StatCard label="Sessions Ready" value={`${overview.sessions_ready ?? 0} / ${overview.total_sessions ?? 0}`} icon={Zap} />
        </section>

        {/* ── Conversion Funnel ── */}
        <section className="px-2">
          <Card className="glass-3d border-default rounded-[3rem] p-10 md:p-14 overflow-hidden relative">
            <div className="absolute top-0 right-0 p-12 opacity-5">
              <Layers className="h-64 w-64 text-[var(--pri)] rotate-12" />
            </div>
            <SectionHeader title="Conversion Architecture" sub="Upload → Validation → Approval funnel" icon={TrendingUp} />
            <div className="space-y-8">
              {[
                { label: "Total Speakers (Invited)", val: overview.total_speakers ?? 0, p: 100, color: "bg-[var(--pri)]/20" },
                { label: "Files Uploaded", val: overview.files_uploaded ?? 0, p: funnel.upload_rate_pct ?? 0, color: "bg-[var(--pri)]/50" },
                { label: "Files Approved", val: overview.files_approved ?? 0, p: funnel.approval_rate_pct ?? 0, color: "bg-[var(--sec)]" },
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-8">
                  <div className="w-44 shrink-0">
                    <p className="text-[11px] font-black text-muted uppercase tracking-widest mb-1">{step.label}</p>
                    <p className="text-2xl font-black text-[var(--text)] tracking-tighter">{step.val.toLocaleString()}</p>
                  </div>
                  <div className="flex-1 h-12 relative">
                    <div className="absolute inset-0 bg-muted/5 rounded-2xl overflow-hidden border border-default/30">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${step.p}%` }}
                        transition={{ duration: 1.8, delay: 0.5 + i * 0.2, ease: [0.16, 1, 0.3, 1] }}
                        className={cn("h-full rounded-2xl relative", step.color)}
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent" />
                      </motion.div>
                    </div>
                  </div>
                  <div className="w-16 text-right font-mono text-[13px] font-black text-[var(--text)]">
                    {Math.round(step.p)}%
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </section>

        {/* ── Format Distribution + Approval Times side by side ── */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 px-2">

          {/* Format Pie Chart */}
          <Card className="glass-3d border-default rounded-[3rem] p-10">
            <SectionHeader title="File Format Distribution" sub="Submission types breakdown" icon={PieChart} />
            {fmtLoading ? (
              <div className="h-64 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-[var(--pri)] animate-spin" />
              </div>
            ) : !formats?.length ? (
              <div className="h-64 flex flex-col items-center justify-center text-muted">
                <Presentation className="h-12 w-12 opacity-20 mb-4" />
                <p className="text-[12px] font-black uppercase tracking-widest">No files uploaded yet</p>
              </div>
            ) : (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="55%" height={220}>
                  <RechartPie>
                    <Pie
                      data={formats}
                      dataKey="count"
                      nameKey="format"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      innerRadius={50}
                      paddingAngle={2}
                    >
                      {formats.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartTooltip
                      contentStyle={{ background: "var(--base)", border: "1px solid color-mix(in srgb,var(--text) 10%,transparent)", borderRadius: "1rem", fontSize: 12 }}
                      formatter={(val: any, name: any) => [`${val} files`, FORMAT_LABELS[name] || name]}
                    />
                  </RechartPie>
                </ResponsiveContainer>
                <div className="flex-1 space-y-3">
                  {formats.map((f: any, i: number) => (
                    <div key={f.format} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="text-[11px] font-black text-[var(--text)] uppercase">
                          {FORMAT_LABELS[f.format] || f.format}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-muted">{f.count}</span>
                        <span className="text-[10px] font-black text-muted bg-muted/10 px-2 py-0.5 rounded-full">
                          {f.pct}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Approval Times Bar Chart */}
          <Card className="glass-3d border-default rounded-[3rem] p-10">
            <SectionHeader title="Approval Performance" sub="Avg. days upload → approval per room" icon={Timer} />
            {atLoading ? (
              <div className="h-64 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-[var(--pri)] animate-spin" />
              </div>
            ) : !approvalTimes?.length ? (
              <div className="h-64 flex flex-col items-center justify-center text-muted">
                <Clock className="h-12 w-12 opacity-20 mb-4" />
                <p className="text-[12px] font-black uppercase tracking-widest">No approved files yet</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={approvalTimes} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in srgb,var(--text) 8%,transparent)" vertical={false} />
                  <XAxis
                    dataKey="group_name"
                    tick={{ fontSize: 10, fontWeight: 700, fill: "var(--text)", opacity: 0.5 }}
                    tickFormatter={(value) => value?.toUpperCase()}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fontWeight: 700, fill: "var(--text)", opacity: 0.5 }}
                    axisLine={false}
                    tickLine={false}
                    unit=" d"
                  />
                  <RechartTooltip
                    contentStyle={{ background: "var(--base)", border: "1px solid color-mix(in srgb,var(--text) 10%,transparent)", borderRadius: "1rem", fontSize: 12 }}
                    formatter={(val: any) => [`${val} days`, "Avg. Approval Time"]}
                  />
                  <Bar dataKey="avg_days" radius={[6, 6, 0, 0]}>
                    {approvalTimes.map((_: any, i: number) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
            {!!approvalTimes?.length && (
              <p className="text-[10px] font-bold text-muted mt-3 text-center">
                Based on {approvalTimes.reduce((s: number, r: any) => s + r.sample_count, 0)} approved files
              </p>
            )}
          </Card>
        </section>

        {/* ── Per-Room Breakdown Table ── */}
        <section className="px-2">
          <Card className="glass-3d border-default rounded-[3rem] p-10 md:p-14 overflow-hidden">
            <SectionHeader title="Per-Room Breakdown" sub="Upload · Validation · Approval rates side by side" icon={Table2} />
            {rbLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full rounded-xl bg-muted/10" />)}
              </div>
            ) : !roomBreakdown?.length ? (
              <div className="py-16 text-center text-muted">
                <Map className="h-12 w-12 opacity-20 mx-auto mb-4" />
                <p className="text-[12px] font-black uppercase tracking-widest">No room data yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-default">
                      {["Room", "Sessions", "Speaker Slots", "Upload %", "Validation %", "Approval %"].map(h => (
                        <th key={h} className="text-left p-4 text-[10px] font-black text-muted uppercase tracking-[0.2em]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                    {roomBreakdown.map((r: any, i: number) => (
                      <tr key={r.room_id} className="group hover:bg-[var(--pri)]/5 transition-all">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                            <span className="text-[13px] font-black text-[var(--text)]">{r.room_name}</span>
                          </div>
                        </td>
                        <td className="p-4 text-[12px] font-bold text-muted">{r.session_count}</td>
                        <td className="p-4 text-[12px] font-bold text-muted">{r.speaker_slots}</td>
                        {[
                          { pct: r.upload_pct, count: r.uploaded_count, color: "var(--pri)" },
                          { pct: r.validation_pct, count: r.validated_count, color: "var(--sec)" },
                          { pct: r.approval_pct, count: r.approved_count, color: "var(--success)" },
                        ].map((col, ci) => (
                          <td key={ci} className="p-4">
                            <div className="flex items-center gap-3">
                              <div className="flex-1 h-2 bg-muted/10 rounded-full overflow-hidden max-w-[80px]">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${col.pct}%` }}
                                  transition={{ duration: 1, delay: i * 0.05 }}
                                  style={{ backgroundColor: col.color }}
                                  className="h-full rounded-full"
                                />
                              </div>
                              <span className="text-[12px] font-black text-[var(--text)] w-12">{col.pct}%</span>
                              <span className="text-[10px] text-muted">({col.count})</span>
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </section>

        {/* ── Secondary Row: Communication Matrix + Format Cards ── */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-8 px-2">

          {/* Communication Matrix */}
          <Card className="glass-3d border-default rounded-[3rem] p-10 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <Mail className="h-48 w-48 text-[var(--success)]" />
            </div>
            <SectionHeader title="Communication Matrix" sub="Email delivery stats" icon={Mail} />
            <div className="space-y-8 relative">
              {[
                { label: "Transmission Rate", val: `${data.email_stats?.delivery_rate_pct ?? 0}%`, color: "var(--success)" },
                { label: "User Interaction (Open Rate)", val: `${data.email_stats?.open_rate_pct ?? 0}%`, color: "var(--pri)" },
              ].map((stat, i) => (
                <div key={i} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-black text-muted uppercase tracking-widest">{stat.label}</p>
                    <span className="text-lg font-black text-[var(--text)]">{stat.val}</span>
                  </div>
                  <div className="h-2.5 bg-muted/10 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: stat.val }}
                      transition={{ duration: 1.5, delay: 0.8 + i * 0.2 }}
                      style={{ backgroundColor: stat.color }}
                      className="h-full rounded-full"
                    />
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-2 gap-6 pt-4 border-t border-default">
                <div>
                  <p className="text-[10px] font-black text-muted uppercase tracking-widest">Total Sent</p>
                  <p className="text-2xl font-black text-[var(--text)]">{(data.email_stats?.total_sent ?? 0).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-muted uppercase tracking-widest">Unique Opens</p>
                  <p className="text-2xl font-black text-[var(--text)]">{(data.email_stats?.opened ?? 0).toLocaleString()}</p>
                </div>
              </div>
            </div>
          </Card>

          {/* Cluster Health */}
          <Card className="glass-3d border-default rounded-[3rem] p-10 bg-gradient-to-br from-[var(--sec)]/5 to-transparent">
            <SectionHeader title="Cluster Overview" sub="Event-wide health summary" icon={Globe} />
            <div className="grid grid-cols-2 gap-5">
              {[
                { label: "Active Sessions", val: overview.total_sessions ?? 0, icon: Layers, color: "text-[var(--pri)]" },
                { label: "SRR Check-ins", val: data.srr_stats?.total_checkins ?? 0, icon: Fingerprint, color: "text-[var(--sec)]" },
                { label: "Email Open Rate", val: `${data.email_stats?.open_rate_pct ?? 0}%`, icon: Mail, color: "text-[var(--success)]" },
                { label: "Format Types", val: formats?.length ?? 0, icon: Share2, color: "text-[var(--warn)]" },
              ].map((item) => (
                <div key={item.label} className="p-5 rounded-2xl bg-muted/5 border border-default/50 flex flex-col gap-2 hover:border-[var(--pri)]/20 transition-all">
                  <div className="flex items-center gap-2">
                    <item.icon className={cn("h-4 w-4", item.color)} />
                    <span className="text-[9px] font-black text-muted uppercase tracking-widest">{item.label}</span>
                  </div>
                  <p className="text-2xl font-black text-[var(--text)] tracking-tighter">{item.val}</p>
                </div>
              ))}
            </div>
          </Card>
        </section>

      </div>
    </TooltipProvider>
  );
}
