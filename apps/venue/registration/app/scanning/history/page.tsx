"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock, History, RefreshCw, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client";
import { fetchVenueNodeBootstrap } from "@/lib/node-workstation";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type ScanRow = {
  id: string;
  participant_name: string;
  regno: string;
  role?: string;
  company?: string;
  station_name?: string;
  station_id?: string | null;
  status: string;
  scan_type?: string;
  rejection_reason?: string | null;
  admin_overridden_by?: string | null;
  created_at?: string | null;
};

export default function ScanningHistoryPage() {
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [stationId, setStationId] = useState<string | null>(null);
  const [stationName, setStationName] = useState("Assigned gate");

  const loadHistory = async () => {
    setLoading(true);
    try {
      let assignedGate = stationId;
      if (!assignedGate) {
        const bootstrap = await fetchVenueNodeBootstrap().catch(() => null);
        if (bootstrap?.assignment?.mode === "scanning" && bootstrap.assignment.capacity_rule_id) {
          assignedGate = bootstrap.assignment.capacity_rule_id;
          setStationId(assignedGate);
        }
      }

      const params = new URLSearchParams({ limit: "1000" });
      if (assignedGate) params.set("station_id", assignedGate);
      const result = await apiClient.get<ScanRow[]>(`/venue/scanning/recent?${params.toString()}`);
      setRows(Array.isArray(result) ? result : []);
      const firstStation = result?.find((row) => row.station_name)?.station_name;
      if (firstStation) setStationName(firstStation);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load scan history.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadHistory();
    const timer = window.setInterval(() => void loadHistory(), 15000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const kpis = useMemo(() => {
    const successful = rows.filter((row) => ["success", "admin_overridden"].includes(row.status)).length;
    const rejected = rows.filter((row) => row.status === "rejected").length;
    const overridden = rows.filter((row) => row.status === "admin_overridden").length;
    const lastScan = rows[0]?.created_at ? new Date(rows[0].created_at).toLocaleString() : "No scans";
    return [
      { label: "Total scans", value: rows.length.toLocaleString(), icon: Activity, tone: "text-[var(--pri)] bg-[var(--pri)]/10" },
      { label: "Successful", value: successful.toLocaleString(), icon: CheckCircle2, tone: "text-emerald-500 bg-emerald-500/10" },
      { label: "Rejected", value: rejected.toLocaleString(), icon: AlertTriangle, tone: "text-red-500 bg-red-500/10" },
      { label: "Overrides", value: overridden.toLocaleString(), icon: ShieldCheck, tone: "text-amber-500 bg-amber-500/10" },
      { label: "Last scan", value: lastScan, icon: Clock, tone: "text-blue-500 bg-blue-500/10", wide: true },
    ];
  }, [rows]);

  return (
    <main className="min-h-full space-y-5 p-5">
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="grid size-12 place-items-center rounded-xl bg-emerald-500/10 text-emerald-500">
              <History className="size-6" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-500">Scanning mode</p>
              <h1 className="text-2xl font-black tracking-tight text-[var(--text)]">Gate scan history</h1>
              <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                Previous scans for {stationId ? stationName : "all visible gates"} with registration code, delegate name, time, and status.
              </p>
            </div>
          </div>
          <Button onClick={loadHistory} disabled={loading} className="h-10 gap-2 bg-[var(--pri)] text-xs font-black text-[var(--primary-contrast)]">
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {kpis.map(({ label, value, icon: Icon, tone, wide }) => (
          <div key={label} className={cn("rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm", wide && "xl:col-span-1")}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">{label}</p>
              <span className={cn("grid size-9 place-items-center rounded-xl", tone)}><Icon className="size-4" /></span>
            </div>
            <p className="mt-3 truncate text-xl font-black text-[var(--text)]">{value}</p>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h2 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">All gate scans</h2>
          <p className="mt-1 text-[11px] font-semibold text-[var(--muted)]">Auto-refreshes every 15 seconds.</p>
        </div>
        <div className="max-h-[calc(100vh-360px)] overflow-auto">
          <table className="w-full min-w-[860px] text-left text-xs">
            <thead className="sticky top-0 z-10 bg-[var(--surf)] text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3">Reg code</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Gate</th>
                <th className="px-4 py-3">Check-in time</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Reason / override</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-[var(--muted)]">Loading scan history...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-[var(--muted)]">No scans recorded for this gate yet.</td></tr>
              ) : rows.map((row) => (
                <tr key={row.id} className="hover:bg-[var(--raised)]/50">
                  <td className="px-4 py-3 font-mono font-black text-[var(--text)]">{row.regno || "—"}</td>
                  <td className="px-4 py-3 font-bold text-[var(--text)]">{row.participant_name || "Unknown"}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">{row.role || "—"}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">{row.station_name || "—"}</td>
                  <td className="px-4 py-3 font-mono text-[var(--muted)]">{row.created_at ? new Date(row.created_at).toLocaleString() : "—"}</td>
                  <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                  <td className="px-4 py-3 text-[var(--muted)]">{row.rejection_reason || row.admin_overridden_by || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone = status === "success"
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
    : status === "admin_overridden"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
      : "border-red-500/30 bg-red-500/10 text-red-500";
  return <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider", tone)}>{status || "unknown"}</span>;
}
