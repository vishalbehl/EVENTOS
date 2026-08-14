"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Users, CheckCircle2, Printer, Package,
  RefreshCw, UserPlus, CreditCard, Clock,
} from "lucide-react";
import { apiClient } from "@/lib/api-client";

// ─── Types ───────────────────────────────────────────────────────────────────

type KitStat = {
  id: string;
  name: string;
  distributed: number;
  total: number;
  pct: number;
};

type RoleItem = { role: string; count: number };
type HourItem = { hour: string; count: number };
type PaymentStatusItem = { status: string; count: number };

type Summary = {
  total_participants: number;
  checked_in: number;
  checkin_rate_pct: number;
  total_companions: number;
  companions_checked_in: number;
  badges_printed: number;
  paid_count: number;
  unpaid_count: number;
  payment_breakdown?: PaymentStatusItem[];
  kits: KitStat[];
  kits_total_distributed: number;
  kits_total_quantity: number;
  role_breakdown: RoleItem[];
  checkin_by_hour: HourItem[];
};

export const PAYMENT_STATUS_COLORS: Record<string, string> = {
  paid: "#10b981",          // Emerald
  unpaid: "#f43f5e",        // Rose
  pending: "#f59e0b",       // Amber
  "partially paid": "#0ea5e9", // Sky Blue
  partial: "#0ea5e9",
  refunded: "#a855f7",      // Purple
  complimentary: "#6366f1", // Indigo
  "complimentary / n/a": "#6366f1",
  free: "#6366f1",
  waived: "#14b8a6",        // Teal
  exempted: "#14b8a6",
  unspecified: "#94a3b8",
};

export function getPaymentColor(status: string): string {
  return PAYMENT_STATUS_COLORS[(status || "").trim().toLowerCase()] || "#94a3b8";
}

// ─── Colour palette ──────────────────────────────────────────────────────────

const ROLE_COLORS = [
  "#6366f1", "#22c55e", "#f59e0b", "#ec4899",
  "#14b8a6", "#f97316", "#a855f7", "#3b82f6",
];

// ─── SVG Donut chart ─────────────────────────────────────────────────────────

function DonutChart({
  value, max, color, size = 120, strokeWidth = 14, label, sublabel,
}: {
  value: number; max: number; color: string; size?: number;
  strokeWidth?: number; label: string; sublabel: string;
}) {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const dash = pct * circumference;
  const gap = circumference - dash;
  const center = size / 2;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={center} cy={center} r={r} fill="none" stroke="var(--border)" strokeWidth={strokeWidth} />
          <circle
            cx={center} cy={center} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
            strokeDasharray={`${dash} ${gap}`} strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.8s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-black" style={{ color }}>{Math.round(pct * 100)}%</span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-[11px] font-bold text-[var(--text)]">{label}</p>
        <p className="text-[10px] text-[var(--muted)]">{sublabel}</p>
      </div>
    </div>
  );
}

// ─── Horizontal bar chart ────────────────────────────────────────────────────

function RoleBarChart({ data, total }: { data: RoleItem[]; total: number }) {
  const maxCount = data.reduce((m, r) => Math.max(m, r.count), 1);
  return (
    <div className="space-y-2 w-full">
      {data.slice(0, 8).map((item, i) => {
        const barPct = (item.count / maxCount) * 100;
        const ofTotal = total > 0 ? ((item.count / total) * 100).toFixed(1) : "0";
        return (
          <div key={item.role} className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-[var(--muted)] w-20 shrink-0 truncate">{item.role}</span>
            <div className="flex-1 h-5 rounded-full bg-[var(--border)] overflow-hidden relative">
              <div
                className="h-full rounded-full flex items-center justify-end pr-2 transition-all duration-700"
                style={{ width: `${barPct}%`, backgroundColor: ROLE_COLORS[i % ROLE_COLORS.length], minWidth: "20px" }}
              >
                <span className="text-[9px] font-black text-white">{item.count}</span>
              </div>
            </div>
            <span className="text-[10px] text-[var(--muted)] w-10 text-right shrink-0">{ofTotal}%</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Sparkline / area chart ──────────────────────────────────────────────────

function SparklineChart({ data, color = "#6366f1" }: { data: HourItem[]; color?: string }) {
  const W = 320; const H = 80;
  const pad = { t: 8, r: 8, b: 24, l: 28 };

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-20 text-[11px] text-[var(--muted)]">
        No check-in activity in the last 24 h
      </div>
    );
  }

  const maxV = Math.max(...data.map((d) => d.count), 1);
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const pts = data.map((d, i) => ({
    x: pad.l + (i / Math.max(data.length - 1, 1)) * innerW,
    y: pad.t + innerH - (d.count / maxV) * innerH,
  }));
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const area = `${line} L ${pts[pts.length - 1].x} ${H - pad.b} L ${pts[0].x} ${H - pad.b} Z`;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="sparkg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#sparkg)" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3" fill={color} />)}
      {[...new Set([0, Math.floor((data.length - 1) / 2), data.length - 1])].filter((idx) => idx < data.length).map((idx) => (
        <text key={`label-${idx}`} x={pts[idx]?.x ?? 0} y={H - 4} textAnchor="middle" fontSize="8" fill="var(--muted)">{data[idx].hour}</text>
      ))}
      <text x={pad.l - 4} y={pad.t + 4} textAnchor="end" fontSize="8" fill="var(--muted)">{maxV}</text>
      <text x={pad.l - 4} y={H - pad.b} textAnchor="end" fontSize="8" fill="var(--muted)">0</text>
    </svg>
  );
}

// ─── Kit progress bar ─────────────────────────────────────────────────────────

function KitProgressRow({ kit }: { kit: KitStat }) {
  const pct = kit.total > 0 ? Math.min((kit.distributed / kit.total) * 100, 100) : 0;
  const color = pct >= 90 ? "#ef4444" : pct >= 60 ? "#f59e0b" : "#6366f1";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-[var(--text)] truncate max-w-[60%]">{kit.name}</span>
        <span className="text-[11px] font-black tabular-nums" style={{ color }}>
          {kit.distributed.toLocaleString()}/{kit.total.toLocaleString()}
        </span>
      </div>
      <div className="h-3 rounded-full bg-[var(--border)] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <p className="text-[9px] text-[var(--muted)]">{pct.toFixed(1)}% distributed</p>
    </div>
  );
}

// ─── Multi-Segment Donut Chart ────────────────────────────────────────────────

function MultiSegmentDonut({
  data,
  total,
  size = 86,
  strokeWidth = 12,
}: {
  data: { label: string; count: number; color: string }[];
  total: number;
  size?: number;
  strokeWidth?: number;
}) {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const center = size / 2;

  if (total === 0 || data.length === 0) {
    return (
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
        <circle cx={center} cy={center} r={r} fill="none" stroke="var(--border)" strokeWidth={strokeWidth} />
      </svg>
    );
  }

  let accumulatedPct = 0;

  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
      <circle cx={center} cy={center} r={r} fill="none" stroke="var(--border)" strokeWidth={strokeWidth} />
      {data.map((item, index) => {
        const itemPct = item.count / total;
        const dash = itemPct * circumference;
        const gap = circumference - dash;
        const offset = -accumulatedPct * circumference;
        accumulatedPct += itemPct;

        return (
          <circle
            key={`${item.label}-${index}`}
            cx={center}
            cy={center}
            r={r}
            fill="none"
            stroke={item.color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={offset}
            strokeLinecap="butt"
            style={{ transition: "stroke-dasharray 0.8s ease, stroke-dashoffset 0.8s ease" }}
          />
        );
      })}
    </svg>
  );
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-[var(--card)] rounded-2xl border border-[var(--border)] shadow-sm p-5 flex flex-col gap-4 ${className}`}>
      <p className="text-[11px] font-black uppercase tracking-widest text-[var(--muted)]">{title}</p>
      {children}
    </div>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, main, sub, icon: Icon, color, bg }: {
  label: string; main: string; sub?: string;
  icon: React.ElementType; color: string; bg: string;
}) {
  return (
    <div className="bg-[var(--card)] p-4 rounded-2xl border border-[var(--border)] shadow-sm flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[9px] font-black uppercase tracking-widest text-[var(--muted)] truncate">{label}</p>
        <h3 className="text-2xl font-black mt-0.5 leading-none" style={{ color }}>{main}</h3>
        {sub && <p className="text-[10px] text-[var(--muted)] mt-1">{sub}</p>}
      </div>
      <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: bg }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RegistryDashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await apiClient.get<Summary>("/venue/registration/summary");
      setSummary(res);
      setLastRefresh(new Date());
    } catch (err) {
      console.error("Failed to load registry dashboard:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchData]);

  const s = summary;
  const pending = (s?.total_participants ?? 0) - (s?.checked_in ?? 0);

  return (
    <div className="flex-1 flex flex-col gap-4 min-h-0 overflow-y-auto pb-6">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-black text-[var(--text)]">Registration Command Center</h1>
          <p className="text-[11px] text-[var(--muted)] mt-0.5">
            {lastRefresh
              ? `Last updated ${lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · auto-refresh every 30s`
              : "Loading live data..."}
          </p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border border-[var(--border)] bg-[var(--raised)] hover:bg-[var(--border)] text-[var(--muted)] transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* 6 KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 shrink-0">
        <KpiCard label="Total Participants" main={(s?.total_participants ?? 0).toLocaleString()} sub="registered"
          icon={Users} color="var(--pri)" bg="color-mix(in srgb, var(--pri) 12%, transparent)" />
        <KpiCard label="Checked In" main={(s?.checked_in ?? 0).toLocaleString()} sub={`${s?.checkin_rate_pct ?? 0}% of total`}
          icon={CheckCircle2} color="#22c55e" bg="rgb(34 197 94 / 0.12)" />
        <KpiCard label="Companions" main={`${s?.companions_checked_in ?? 0}/${s?.total_companions ?? 0}`}
          sub="checked-in / total" icon={UserPlus} color="#a855f7" bg="rgb(168 85 247 / 0.12)" />
        <KpiCard
          label="Kits Distributed"
          main={`${(s?.kits_total_distributed ?? 0).toLocaleString()}/${(s?.kits_total_quantity ?? 0).toLocaleString()}`}
          sub={s && s.kits_total_quantity > 0 ? `${((s.kits_total_distributed / s.kits_total_quantity) * 100).toFixed(1)}% out` : "—"}
          icon={Package} color="#6366f1" bg="rgb(99 102 241 / 0.12)"
        />
        <KpiCard label="Badges Printed" main={(s?.badges_printed ?? 0).toLocaleString()}
          sub={s && s.total_participants > 0 ? `${((s.badges_printed / s.total_participants) * 100).toFixed(1)}% coverage` : "—"}
          icon={Printer} color="#f59e0b" bg="rgb(245 158 11 / 0.12)" />
        <KpiCard label="Paid" main={(s?.paid_count ?? 0).toLocaleString()} sub={`${s?.unpaid_count ?? 0} unpaid`}
          icon={CreditCard} color="#14b8a6" bg="rgb(20 184 166 / 0.12)" />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* LEFT */}
        <div className="flex flex-col gap-4">
          <Card title="Check-In Status">
            <div className="flex items-center justify-around">
              <DonutChart value={s?.checked_in ?? 0} max={s?.total_participants ?? 1} color="#22c55e"
                size={120} label="Checked In" sublabel={`${s?.checked_in ?? 0} / ${s?.total_participants ?? 0}`} />
              <div className="space-y-3">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span className="text-[11px] text-[var(--muted)]">Arrived</span>
                  </div>
                  <p className="text-xl font-black text-emerald-500 pl-4">{(s?.checked_in ?? 0).toLocaleString()}</p>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-[var(--border)]" />
                    <span className="text-[11px] text-[var(--muted)]">Pending</span>
                  </div>
                  <p className="text-xl font-black text-[var(--text)] pl-4">{pending.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </Card>

          <Card title="Companion Check-In">
            {(s?.total_companions ?? 0) === 0 ? (
              <p className="text-[11px] text-[var(--muted)] text-center py-2">No companions registered</p>
            ) : (
              <div className="flex items-center justify-around">
                <DonutChart value={s?.companions_checked_in ?? 0} max={s?.total_companions ?? 1} color="#a855f7"
                  size={100} label="Companions" sublabel={`${s?.companions_checked_in ?? 0} / ${s?.total_companions ?? 0}`} />
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                      <span className="text-[11px] text-[var(--muted)]">Arrived</span>
                    </div>
                    <p className="text-xl font-black text-purple-500 pl-4">{(s?.companions_checked_in ?? 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-[var(--border)]" />
                      <span className="text-[11px] text-[var(--muted)]">Pending</span>
                    </div>
                    <p className="text-xl font-black text-[var(--text)] pl-4">
                      {((s?.total_companions ?? 0) - (s?.companions_checked_in ?? 0)).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </Card>

          <Card title="Payment Breakdown">
            {(() => {
              const breakdown = (s?.payment_breakdown || [])
                .filter((item) => item && item.status && item.count > 0);

              const chartItems = breakdown.map((item) => ({
                label: item.status,
                count: item.count,
                color: getPaymentColor(item.status),
              }));

              const totalCount = breakdown.reduce((acc, b) => acc + b.count, 0);
              const paidCount = breakdown.find((b) => b.status.toLowerCase() === "paid")?.count ?? (s?.paid_count ?? 0);
              const paidPct = s && s.total_participants > 0 ? ((paidCount / s.total_participants) * 100).toFixed(1) : "0.0";

              if (chartItems.length === 0) {
                return (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <CreditCard className="mb-2 h-8 w-8 text-[var(--border)]" />
                    <p className="text-[11px] font-bold text-[var(--muted)]">No payment status data available yet</p>
                    <p className="mt-1 text-[10px] text-[var(--muted)]">Live statuses will appear here as soon as participants have payment values.</p>
                  </div>
                );
              }

              return (
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <MultiSegmentDonut data={chartItems} total={totalCount} size={84} strokeWidth={12} />
                    <div className="flex-1 space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar pr-1">
                      {chartItems.map((item) => (
                        <div key={item.label} className="flex items-center justify-between text-[11px]">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                            <span className="font-bold text-[var(--muted)] truncate">{item.label}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            <span className="font-black text-[var(--text)] tabular-nums">{item.count}</span>
                            <span className="text-[10px] text-[var(--muted)] font-mono">
                              ({totalCount > 0 ? Math.round((item.count / totalCount) * 100) : 0}%)
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Multi-status progress bar */}
                  <div>
                    <div className="flex justify-between text-[10px] mb-1.5">
                      <span className="text-[var(--muted)] font-bold">Settlement Rate (Paid)</span>
                      <span className="font-black text-emerald-500">{paidPct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-[var(--border)] overflow-hidden flex">
                      {chartItems.map((item) => {
                        const pct = totalCount > 0 ? (item.count / totalCount) * 100 : 0;
                        if (pct <= 0) return null;
                        return (
                          <div
                            key={`bar-${item.label}`}
                            className="h-full transition-all duration-700 first:rounded-l-full last:rounded-r-full"
                            style={{ width: `${pct}%`, backgroundColor: item.color }}
                            title={`${item.label}: ${item.count} (${pct.toFixed(1)}%)`}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}
          </Card>
        </div>

        {/* MIDDLE */}
        <div className="flex flex-col gap-4">
          <Card title="Role Distribution" className="flex-1">
            {(s?.role_breakdown?.length ?? 0) === 0 ? (
              <p className="text-[11px] text-[var(--muted)] text-center py-2">No role data</p>
            ) : (
              <RoleBarChart data={s!.role_breakdown} total={s!.total_participants} />
            )}
          </Card>

          <Card title="Check-In Timeline (last 24 h)">
            <div className="w-full overflow-hidden">
              <SparklineChart data={s?.checkin_by_hour ?? []} color="#6366f1" />
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-3 h-3 text-[var(--muted)]" />
              <p className="text-[10px] text-[var(--muted)]">
                {(s?.checkin_by_hour ?? []).reduce((acc, h) => acc + h.count, 0)} check-ins in the last 24 h
              </p>
            </div>
          </Card>
        </div>

        {/* RIGHT */}
        <div className="flex flex-col gap-4">
          <Card title="Kit Distribution" className="flex-1">
            {(s?.kits?.length ?? 0) === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <Package className="w-8 h-8 text-[var(--border)]" />
                <p className="text-[11px] text-[var(--muted)]">No kits configured yet</p>
              </div>
            ) : (
              <div className="space-y-5">
                {s!.kits.map((kit) => <KitProgressRow key={kit.id} kit={kit} />)}
                <div className="pt-3 border-t border-[var(--border)]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">All Kits</span>
                    <span className="text-[12px] font-black text-indigo-400 tabular-nums">
                      {(s?.kits_total_distributed ?? 0).toLocaleString()}/{(s?.kits_total_quantity ?? 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--border)] overflow-hidden">
                    <div className="h-full rounded-full bg-indigo-500 transition-all duration-700"
                      style={{ width: `${s && s.kits_total_quantity > 0 ? (s.kits_total_distributed / s.kits_total_quantity) * 100 : 0}%` }} />
                  </div>
                </div>
              </div>
            )}
          </Card>

          <Card title="Quick Snapshot">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Pending Check-In", value: pending.toLocaleString(), color: "text-amber-400" },
                {
                  label: "Badge Coverage",
                  value: s && s.total_participants > 0 ? `${((s.badges_printed / s.total_participants) * 100).toFixed(0)}%` : "—",
                  color: "text-amber-400",
                },
                {
                  label: "Companion Rate",
                  value: s && s.total_companions > 0 ? `${((s.companions_checked_in / s.total_companions) * 100).toFixed(0)}%` : "—",
                  color: "text-purple-400",
                },
                {
                  label: "Kit Out Rate",
                  value: s && s.kits_total_quantity > 0 ? `${((s.kits_total_distributed / s.kits_total_quantity) * 100).toFixed(0)}%` : "—",
                  color: "text-indigo-400",
                },
              ].map((item) => (
                <div key={item.label} className="bg-[var(--raised)] rounded-xl p-3 border border-[var(--border)]">
                  <p className="text-[9px] uppercase tracking-widest text-[var(--muted)] font-bold">{item.label}</p>
                  <p className={`text-xl font-black mt-1 ${item.color}`}>{item.value}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
