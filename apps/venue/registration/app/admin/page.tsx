"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity, AlertCircle, BarChart2, CheckCircle2, ChevronRight, Clock,
  Database, FileText, HardDrive, MonitorSmartphone, Package, Printer, QrCode,
  RefreshCw, Search, Server, Users, Wifi, Zap,
} from "lucide-react";
import { apiClient, type ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/hooks/useWebSocket";

type LocalEvent = {
  id: string;
  name: string;
  short_code: string;
  status: string;
  start_date: string;
  end_date: string;
  venue_name?: string | null;
};

type Device = {
  id: string;
  device_name: string;
  device_type: string;
  hostname?: string | null;
  mac_address?: string | null;
  room_name?: string | null;
  status: string;
  reported_status: string;
  last_seen?: string | null;
};

type DashboardMetrics = {
  state: "ready" | "no_event";
  message?: string;
  generated_at: string;
  freshness_at?: string | null;
  event?: LocalEvent | null;
  summary?: {
    participants: number;
    checked_in: number;
    pending_checkin: number;
    cancelled: number;
    badges_printed: number;
    kits_distributed?: number;
    total_kits?: number;
    print_jobs: number;
    devices_online: number;
    devices_total: number;
  };
  kits_distributed?: number;
  total_kits?: number;
  trend?: Array<{ date: string; registrations: number; checkins: number }>;
  comparisons?: { today: number; yesterday: number; current_7_days: number; previous_7_days: number };
  devices?: Device[];
  recent_activity?: Array<{
    id: string;
    timestamp: string;
    action: string;
    details: string;
    status: string;
    operator?: string | null;
  }>;
  sync?: { status: string; last_sync?: string | null; pending_records: number; failed_records: number };
  system?: {
    api: { status: string };
    database: { status: string; used_bytes?: number | null; error?: string | null };
    disk: { status: string; used_bytes?: number | null; total_bytes?: number | null; free_bytes?: number | null };
  };
};

const DEVICE_LABEL: Record<string, string> = {
  registration_desk: "Registration Desk",
  srr_station: "SRR Station",
  kiosk: "Kiosk",
  printer: "Badge Printer",
  scanner: "QR Scanner",
  helpdesk: "Help Desk",
};

const ACTION_ICON: Record<string, typeof Zap> = {
  check_in: CheckCircle2,
  badge_print: Printer,
  badge_reprint: Printer,
  register: Users,
  sync: RefreshCw,
};

function percent(value: number, total: number) {
  return total > 0 ? `${((value / total) * 100).toFixed(1)}%` : "0.0%";
}

function bytes(value?: number | null) {
  if (value == null) return "Unavailable";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit > 2 ? 1 : 0)} ${units[unit]}`;
}

function relativeTime(iso?: string | null) {
  if (!iso) return "Never";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return new Date(iso).toLocaleString();
}

function StatusDot({ status }: { status: string }) {
  const online = ["online", "available", "completed", "synced"].includes(status);
  const warning = ["warning", "pending", "in_progress", "never"].includes(status);
  return <span className={cn("h-2 w-2 rounded-full", online ? "bg-emerald-500" : warning ? "bg-amber-400" : "bg-red-500")} />;
}

function TrendChart({ rows = [] }: { rows?: DashboardMetrics["trend"] }) {
  const maximum = Math.max(1, ...rows.flatMap((row) => [row.registrations, row.checkins]));
  return (
    <div className="flex h-36 items-end gap-2 border-b border-[var(--border)] px-1 pb-6 pt-3">
      {rows.map((row) => (
        <div key={row.date} className="relative flex h-full flex-1 items-end justify-center gap-1">
          <div title={`${row.registrations} registrations`} className="w-2.5 rounded-t bg-emerald-500" style={{ height: `${Math.max(3, (row.registrations / maximum) * 100)}%` }} />
          <div title={`${row.checkins} check-ins`} className="w-2.5 rounded-t bg-blue-400" style={{ height: `${Math.max(3, (row.checkins / maximum) * 100)}%` }} />
          <span className="absolute -bottom-5 text-[8px] font-bold text-[var(--muted)]">
            {new Date(`${row.date}T00:00:00`).toLocaleDateString([], { weekday: "short" })}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [events, setEvents] = useState<LocalEvent[]>([]);
  const [eventId, setEventId] = useState("");
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const { socket, isConnected } = useWebSocket(eventId || undefined);

  useEffect(() => {
    let active = true;
    apiClient.get<LocalEvent[]>("/venue/admin/events")
      .then((rows) => {
        if (!active) return;
        setEvents(rows);
        setEventId((current) => current || rows.find((row) => row.status === "active")?.id || rows[0]?.id || "");
        if (rows.length === 0) setLoading(false);
      })
      .catch((reason: ApiError) => {
        if (!active) return;
        setError(reason.message || "Unable to load local events");
        setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const refresh = useCallback(async (background = false) => {
    if (!eventId) return;
    if (background) setRefreshing(true); else setLoading(true);
    try {
      const result = await apiClient.get<DashboardMetrics>("/venue/admin/dashboard/metrics", { params: { event_id: eventId } });
      setMetrics(result);
      setError("");
    } catch (reason) {
      const apiError = reason as ApiError;
      setError(apiError.message || "The live dashboard data is unavailable");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [eventId]);

  useEffect(() => {
    if (!eventId) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(true), 5000);
    return () => window.clearInterval(timer);
  }, [eventId, refresh]);

  useEffect(() => {
    if (!socket) return;
    const update = () => void refresh(true);
    socket.on("queue_updated", update);
    socket.on("dashboard_updated", update);
    return () => {
      socket.off("queue_updated", update);
      socket.off("dashboard_updated", update);
    };
  }, [socket, refresh]);

  const summary = metrics?.summary;
  const devices = metrics?.devices ?? [];
  const desks = useMemo(() => devices.filter((row) => ["registration_desk", "srr_station", "kiosk", "helpdesk"].includes(row.device_type)), [devices]);
  const hardware = useMemo(() => devices.filter((row) => ["printer", "scanner"].includes(row.device_type)), [devices]);
  const event = metrics?.event ?? events.find((row) => row.id === eventId);

  if (!loading && events.length === 0 && !error) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-10 text-center">
        <AlertCircle className="mx-auto mb-3 h-8 w-8 text-amber-400" />
        <h2 className="font-black text-[var(--text)]">No local event available</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">Sync an event to this Venue Server before the dashboard can show operational data.</p>
        <button onClick={() => router.push("/admin/sync")} className="mt-5 rounded-xl bg-[var(--pri)] px-4 py-2 text-xs font-black text-white">Open Sync</button>
      </div>
    );
  }

  const kitsDistributed = summary?.kits_distributed ?? (metrics as any)?.kits_distributed ?? 0;
  const totalKits = summary?.total_kits ?? (metrics as any)?.total_kits ?? 0;

  const statCards = [
    { label: "Total Participants", value: summary?.participants ?? 0, detail: `${metrics?.comparisons?.today ?? 0} registered today`, icon: Users, tone: "text-[var(--pri)] bg-[var(--pri)]/10" },
    { label: "Checked In", value: summary?.checked_in ?? 0, detail: percent(summary?.checked_in ?? 0, summary?.participants ?? 0), icon: CheckCircle2, tone: "text-emerald-400 bg-emerald-500/10" },
    { label: "Pending Check-in", value: summary?.pending_checkin ?? 0, detail: percent(summary?.pending_checkin ?? 0, summary?.participants ?? 0), icon: Clock, tone: "text-amber-400 bg-amber-500/10" },
    { label: "Badges Printed", value: summary?.badges_printed ?? 0, detail: `${summary?.print_jobs ?? 0} recorded print jobs`, icon: Printer, tone: "text-violet-400 bg-violet-500/10" },
    { label: "Kits Distributed", value: `${kitsDistributed} / ${totalKits || summary?.participants || 0}`, detail: totalKits > 0 ? percent(kitsDistributed, totalKits) : `${kitsDistributed} issued`, icon: Package, tone: "text-purple-400 bg-purple-500/10" },
    { label: "Devices Online", value: `${summary?.devices_online ?? 0} / ${summary?.devices_total ?? 0}`, detail: "Heartbeat within 90 seconds", icon: MonitorSmartphone, tone: "text-blue-400 bg-blue-500/10" },
  ];

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-black text-[var(--text)]">Live event operations</h1>
            <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-black uppercase", isConnected ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400")}>{isConnected ? "Live channel" : "5s refresh"}</span>
          </div>
          <p className="text-[10px] text-[var(--muted)]">Freshness: {relativeTime(metrics?.freshness_at)} · Generated: {relativeTime(metrics?.generated_at)}</p>
        </div>
        <div className="flex gap-2">
          <select value={eventId} onChange={(e) => setEventId(e.target.value)} className="min-w-52 rounded-xl border border-[var(--border)] bg-[var(--surf)] px-3 py-2 text-xs font-bold text-[var(--text)]">
            {events.map((row) => <option key={row.id} value={row.id}>{row.name} · {row.status}</option>)}
          </select>
          <button onClick={() => void refresh(true)} disabled={refreshing} aria-label="Refresh dashboard" className="rounded-xl border border-[var(--border)] p-2 text-[var(--muted)] hover:text-[var(--pri)] disabled:opacity-50">
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </button>
        </div>
      </div>

      {error && <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-bold text-red-400"><AlertCircle className="h-4 w-4" />{error}</div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {statCards.map((card) => (
          <div key={card.label} className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
            <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl", card.tone)}><card.icon className="h-5 w-5" /></div>
            <div className="min-w-0">
              <p className="truncate text-[10px] font-black uppercase text-[var(--muted)]">{card.label}</p>
              <p className="text-2xl font-black text-[var(--text)]">{loading ? "—" : card.value}</p>
              <p className="truncate text-[9px] font-bold text-[var(--muted)]">{card.detail}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 lg:col-span-7">
          <div className="flex items-start justify-between">
            <div><h2 className="text-sm font-black text-[var(--text)]">Seven-day activity</h2><p className="text-[10px] text-[var(--muted)]">Daily persisted registrations and successful check-ins · UTC</p></div>
            <div className="flex gap-3 text-[9px] font-bold text-[var(--muted)]"><span>● <b className="text-emerald-400">Registrations</b></span><span>● <b className="text-blue-400">Check-ins</b></span></div>
          </div>
          <TrendChart rows={metrics?.trend} />
          <div className="mt-3 grid grid-cols-4 gap-2 text-center">
            {[
              ["Today", metrics?.comparisons?.today], ["Yesterday", metrics?.comparisons?.yesterday],
              ["Current 7 days", metrics?.comparisons?.current_7_days], ["Previous 7 days", metrics?.comparisons?.previous_7_days],
            ].map(([label, value]) => <div key={String(label)}><p className="text-sm font-black text-[var(--text)]">{loading ? "—" : value ?? 0}</p><p className="text-[9px] font-bold text-[var(--muted)]">{label}</p></div>)}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] lg:col-span-5">
          <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surf)]/60 px-4 py-3">
            <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-[var(--pri)]" /><h2 className="text-xs font-black uppercase text-[var(--text)]">Live activity</h2></div>
            <button onClick={() => router.push("/admin/logs")} className="text-[10px] font-bold text-[var(--pri)]">View all</button>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {(metrics?.recent_activity ?? []).length === 0 ? <p className="p-8 text-center text-xs text-[var(--muted)]">No event activity recorded</p> : metrics?.recent_activity?.slice(0, 6).map((row) => {
              const Icon = ACTION_ICON[row.action] ?? Zap;
              return <div key={`${row.action}-${row.id}`} className="flex items-center gap-3 px-4 py-2.5"><div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--surf)]"><Icon className="h-3.5 w-3.5 text-[var(--pri)]" /></div><div className="min-w-0 flex-1"><p className="text-[11px] font-black capitalize text-[var(--text)]">{row.action.replaceAll("_", " ")}</p><p className="truncate text-[9px] text-[var(--muted)]">{row.details}</p></div><div className="text-right"><p className="text-[9px] text-[var(--muted)]">{relativeTime(row.timestamp)}</p><p className="text-[8px] font-bold capitalize text-[var(--muted)]">{row.status.replaceAll("_", " ")}</p></div></div>;
            })}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 lg:col-span-4">
          <h2 className="mb-2 border-b border-[var(--border)] pb-3 text-xs font-black uppercase text-[var(--text)]">System & sync</h2>
          {[
            { label: "Venue API", icon: Server, status: metrics?.system?.api.status ?? "unavailable", detail: "Current request succeeded" },
            { label: "Cloud sync", icon: Wifi, status: metrics?.sync?.status ?? "never", detail: metrics?.sync?.last_sync ? relativeTime(metrics.sync.last_sync) : "No completed sync" },
            { label: "Event outbox", icon: RefreshCw, status: (metrics?.sync?.failed_records ?? 0) > 0 ? "failed" : (metrics?.sync?.pending_records ?? 0) > 0 ? "pending" : "available", detail: `${metrics?.sync?.pending_records ?? 0} pending · ${metrics?.sync?.failed_records ?? 0} failed` },
            { label: "PostgreSQL", icon: Database, status: metrics?.system?.database.status ?? "unavailable", detail: bytes(metrics?.system?.database.used_bytes) },
            { label: "Local disk", icon: HardDrive, status: metrics?.system?.disk.status ?? "unavailable", detail: metrics?.system?.disk.status === "available" ? `${bytes(metrics.system.disk.used_bytes)} / ${bytes(metrics.system.disk.total_bytes)}` : "Unavailable" },
          ].map((row) => <div key={row.label} className="flex items-center justify-between border-b border-[var(--border)]/50 py-2.5 last:border-0"><div className="flex items-center gap-2"><row.icon className="h-3.5 w-3.5 text-[var(--muted)]" /><span className="text-[11px] font-bold text-[var(--text)]">{row.label}</span></div><div className="flex items-center gap-2"><span className="max-w-36 truncate text-[9px] text-[var(--muted)]">{row.detail}</span><StatusDot status={row.status} /></div></div>)}
          <button onClick={() => router.push("/admin/sync")} className="mt-3 w-full rounded-xl border border-[var(--border)] py-2 text-xs font-bold text-[var(--text)] hover:border-[var(--pri)]">Open Sync & Local Data</button>
        </section>

        {[{ title: "Registration desks", rows: desks }, { title: "Device health", rows: hardware.length ? hardware : devices }].map((group) => (
          <section key={group.title} className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] lg:col-span-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surf)]/60 px-4 py-3"><h2 className="text-xs font-black uppercase text-[var(--text)]">{group.title}</h2><button onClick={() => router.push("/admin/devices")} className="text-[10px] font-bold text-[var(--pri)]">Manage</button></div>
            <div className="divide-y divide-[var(--border)]">{group.rows.length === 0 ? <p className="p-8 text-center text-xs text-[var(--muted)]">No devices bound to {event?.name ?? "this event"}</p> : group.rows.slice(0, 5).map((row) => <div key={row.id} className="flex items-center justify-between px-4 py-3"><div className="flex min-w-0 items-center gap-2"><MonitorSmartphone className="h-4 w-4 text-blue-400" /><div className="min-w-0"><p className="truncate text-[11px] font-black text-[var(--text)]">{row.hostname || row.device_name}</p><p className="truncate text-[9px] text-[var(--muted)]">{row.room_name || DEVICE_LABEL[row.device_type] || row.device_type}</p></div></div><div className="flex items-center gap-1.5"><StatusDot status={row.status} /><span className="text-[9px] font-black capitalize text-[var(--muted)]">{row.status}</span><ChevronRight className="h-3 w-3 text-[var(--muted)]" /></div></div>)}</div>
          </section>
        ))}
      </div>

      <div>
        <h2 className="mb-3 text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">Quick actions</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["New Registration", "Add a participant", Users, "/registry/new"],
            ["Search Participant", "Find event records", Search, "/registry/search"],
            ["Scan QR Code", "Open scanning mode", QrCode, "/scanning"],
            ["Print Badge", "Open print queue", Printer, "/registry/print"],
            ["Review Queue", "Review submissions", FileText, "/registry/review"],
            ["View Reports", "Event reporting", BarChart2, "/admin/reports"],
          ].map(([label, description, Icon, path]) => {
            const ActionIcon = Icon as typeof Users;
            return <button key={String(label)} onClick={() => router.push(String(path))} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 text-left hover:border-[var(--pri)]"><ActionIcon className="mb-3 h-5 w-5 text-[var(--pri)]" /><p className="text-xs font-black text-[var(--text)]">{label as string}</p><p className="mt-0.5 text-[10px] text-[var(--muted)]">{description as string}</p></button>;
          })}
        </div>
      </div>
    </div>
  );
}
