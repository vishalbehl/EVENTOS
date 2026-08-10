"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Archive, BadgeCheck, BarChart3, CalendarDays, CheckCircle2, ChevronDown,
  Clock3, Download, FileText, Filter, RefreshCw, ShieldCheck, Users, XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client";

type LocalEvent = { id: string; name: string; short_code: string; status: string; start_date: string; end_date: string; venue_name?: string };
type Snapshot = { id: string; version: number; content_hash: string; created_at: string; revision_reason?: string; supersedes_id?: string };
type Report = {
  metadata: Record<string, any>;
  summary: Record<string, number>;
  breakdowns: Record<string, Array<Record<string, any>>>;
  delegates: Array<Record<string, any>>;
  attendance: Array<Record<string, any>>;
  venue_scans: Array<Record<string, any>>;
  companions: Array<Record<string, any>>;
  badges: Array<Record<string, any>>;
  kits: Array<Record<string, any>>;
  actions: Array<Record<string, any>>;
  sync: Record<string, any>;
  warnings: string[];
  certificates?: Array<Record<string, any>>;
  hourly_checkins?: Array<Record<string, any>>;
  capacity?: Array<Record<string, any>>;
  overrides?: Array<Record<string, any>>;
  desk_performance?: Array<Record<string, any>>;
  offline_operation?: Record<string, any>;
  devices?: Array<Record<string, any>>;
  insights?: Array<Record<string, any>>;
  section_catalog?: Array<{ id: string; title: string; data_key: string }>;
};

const emptyFilters = { role: "all", station: "all", attendance: "all", status: "all", from: "", to: "" };
const COLUMN_PRESETS: Record<string, string[]> = {
  delegates: ["registration_code", "name", "email", "phone", "role", "company", "designation", "country", "registration_status", "payment_status", "source", "registered_at", "custom_fields"],
  attendance: ["registration_code", "delegate", "role", "session", "checkin_time", "checkout_time", "duration_seconds", "state", "method", "device_id"],
  badges: ["registration_code", "delegate", "badge_code", "status", "issued_at", "print_count", "reprint_count"],
  companions: ["primary_delegate", "name", "relationship", "email", "phone", "badge_status", "special_assistance"],
  kits: ["registration_code", "delegate", "kit", "category", "status", "issued_by", "issued_at"],
  venue_scans: ["registration_code", "delegate", "station", "scan_type", "status", "checkin_time", "rejection_reason", "admin_overridden_by"],
};

export default function AdminReportsPage() {
  const [events, setEvents] = useState<LocalEvent[]>([]);
  const [eventId, setEventId] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [exportSource, setExportSource] = useState("live");
  const [filters, setFilters] = useState(emptyFilters);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<Record<string, string[]>>({});

  useEffect(() => {
    apiClient.get<LocalEvent[]>("/venue/admin/events")
      .then(setEvents)
      .catch((error: any) => toast.error(error?.message || "Local events could not be loaded."));
  }, []);

  const loadReport = async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      const [nextReport, nextSnapshots] = await Promise.all([
        apiClient.get<Report>(`/venue/admin/events/${eventId}/report`),
        apiClient.get<Snapshot[]>(`/venue/admin/events/${eventId}/report/snapshots`),
      ]);
      setReport(nextReport);
      setSnapshots(nextSnapshots);
      setExportSource(nextSnapshots[0]?.id || "live");
      setFilters(emptyFilters);
      setSelectedSections(nextReport.metadata.layout?.sections || nextReport.section_catalog?.map((row) => row.id) || []);
      setSelectedColumns(nextReport.metadata.layout?.columns || {});
    } catch (error: any) {
      toast.error(error?.message || "The event report could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setReport(null); setSnapshots([]); setExportSource("live"); setSelectedSections([]); setSelectedColumns({}); }, [eventId]);

  const roleOptions = useMemo(() => [...new Set(report?.delegates.map((row) => row.role).filter(Boolean) || [])].sort(), [report]);
  const stationOptions = useMemo(() => [...new Set(report?.venue_scans.map((row) => row.station).filter(Boolean) || [])].sort(), [report]);
  const statusOptions = useMemo(() => [...new Set(report?.delegates.map((row) => row.registration_status || row.payment_status).filter(Boolean) || [])].sort(), [report]);

  const inDateRange = (value?: string) => {
    if (!value) return !filters.from && !filters.to;
    const time = new Date(value).getTime();
    return (!filters.from || time >= new Date(`${filters.from}T00:00:00`).getTime()) && (!filters.to || time <= new Date(`${filters.to}T23:59:59`).getTime());
  };
  const delegates = useMemo(() => report?.delegates.filter((row) =>
    (filters.role === "all" || row.role === filters.role) &&
    (filters.status === "all" || (row.registration_status || row.payment_status) === filters.status) &&
    (filters.attendance === "all" || (filters.attendance === "checked_in" && !row.no_show) || (filters.attendance === "no_show" && row.no_show) || (filters.attendance === "open" && row.currently_checked_in)) &&
    inDateRange(row.registered_at)
  ) || [], [report, filters]);
  const attendance = useMemo(() => report?.attendance.filter((row) =>
    (filters.role === "all" || row.role === filters.role) &&
    (filters.attendance === "all" || filters.attendance === "checked_in" || (filters.attendance === "open" && row.state === "open")) && inDateRange(row.checkin_time)
  ) || [], [report, filters]);
  const scans = useMemo(() => report?.venue_scans.filter((row) =>
    (filters.role === "all" || row.role === filters.role) &&
    (filters.station === "all" || row.station === filters.station) && inDateRange(row.checkin_time)
  ) || [], [report, filters]);
  const catalog = report?.section_catalog || [];

  const finalize = async () => {
    if (!eventId) return;
    const latest = snapshots[0];
    let revisionReason: string | null = null;
    if (latest) {
      revisionReason = window.prompt(`Final v${latest.version} is immutable. Enter the reason for creating a revised final report:`);
      if (!revisionReason?.trim()) return;
    } else if (!window.confirm("Finalize the current event data as immutable final report v1?")) return;
    try {
      const created = await apiClient.post<Snapshot>(`/venue/admin/events/${eventId}/report/snapshots`, { revision_reason: revisionReason?.trim() || null, sections: selectedSections, columns: selectedColumns });
      const nextSnapshots = [created, ...snapshots];
      setSnapshots(nextSnapshots);
      setExportSource(created.id);
      toast.success(`Final report v${created.version} created.`);
    } catch (error: any) {
      toast.error(error?.message || "The final report could not be created.");
    }
  };

  const exportReport = async (format: "pdf" | "docx") => {
    if (!eventId) return;
    setExporting(format);
    try {
      const snapshot = exportSource === "live" ? "" : `&snapshot_id=${encodeURIComponent(exportSource)}`;
      const layout = `&sections=${encodeURIComponent(selectedSections.join(","))}&columns=${encodeURIComponent(JSON.stringify(selectedColumns))}`;
      const response = await apiClient.download(`/venue/admin/events/${eventId}/report/export?format=${format}${snapshot}${exportSource === "live" ? layout : ""}`);
      const disposition = response.headers["content-disposition"] || "";
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || `event-report.${format}`;
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove();
      URL.revokeObjectURL(url);
      toast.success(`${format.toUpperCase()} report downloaded.`);
    } catch (error: any) {
      toast.error(error?.message || `${format.toUpperCase()} export failed.`);
    } finally {
      setExporting(null);
    }
  };

  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-5 pb-12">
      <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
        <div className="grid lg:grid-cols-[1.25fr_0.75fr]">
          <div className="p-6 sm:p-7">
            <div className="mb-5 flex items-start gap-4">
              <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-[var(--pri)] text-[var(--primary-contrast)]"><FileText className="size-6" /></div>
              <div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--pri)]">Event completion ledger</p><h1 className="text-2xl font-black tracking-tight text-[var(--text)]">Venue operations report</h1><p className="mt-1 max-w-2xl text-xs font-medium leading-5 text-[var(--muted)]">Select one synchronized event to inspect its complete delegate, attendance, station, badge, kit, companion, and audit record.</p></div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="flex-1"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">Local event</span><select value={eventId} onChange={(e) => setEventId(e.target.value)} className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surf)] px-3 text-xs font-bold text-[var(--text)]"><option value="">Select an event…</option>{events.map((event) => <option key={event.id} value={event.id}>{event.short_code} · {event.name} · {event.status}</option>)}</select></label>
              <Button type="button" disabled={!eventId || loading} onClick={loadReport} className="mt-auto h-11 gap-2 bg-[var(--pri)] px-5 text-xs font-black text-[var(--primary-contrast)]"><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />{report ? "Refresh report" : "Load report"}</Button>
            </div>
          </div>
          <div className="border-t border-[var(--border)] bg-[var(--surf)] p-6 lg:border-l lg:border-t-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--muted)]">Report state</p>
            {report ? <div className="mt-4 space-y-3 text-xs"><StatusLine icon={CheckCircle2} label="Source" value="Local PostgreSQL" tone="text-emerald-500" /><StatusLine icon={Clock3} label="Freshness" value={formatDate(report.metadata.data_freshness_at)} /><StatusLine icon={Archive} label="Final version" value={snapshots[0] ? `v${snapshots[0].version}` : "Not finalized"} /><StatusLine icon={ShieldCheck} label="Data scope" value="Full PII · audited" tone="text-amber-500" /></div> : <div className="mt-5 rounded-xl border border-dashed border-[var(--border)] p-4 text-xs font-medium leading-5 text-[var(--muted)]">No event is loaded. Report data is never combined across events.</div>}
          </div>
        </div>
      </section>

      {report && <>
        {report.warnings.length > 0 && <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" /><div><h2 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">Resolve before finalizing</h2><ul className="mt-2 space-y-1 text-xs font-semibold text-[var(--muted)]">{report.warnings.map((warning) => <li key={warning}>• {warning}</li>)}</ul></div></div></section>}

        <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--border)] sm:grid-cols-4 lg:grid-cols-8">
          <Metric label="Delegates" value={report.summary.total_delegates} icon={Users} />
          <Metric label="Checked in" value={report.summary.checked_in_delegates} icon={BadgeCheck} />
          <Metric label="No-shows" value={report.summary.no_shows} icon={XCircle} />
          <Metric label="Open check-outs" value={report.summary.open_attendance} icon={Clock3} />
          <Metric label="Rejected scans" value={report.summary.rejected_scans} icon={AlertTriangle} />
          <Metric label="Companions" value={report.summary.companions} icon={Users} />
          <Metric label="Badge prints" value={report.summary.badges_printed} icon={FileText} />
          <Metric label="Kits issued" value={report.summary.kits_issued} icon={CheckCircle2} />
        </section>

        {selectedSections.includes("checkin_hourly") && <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm"><div className="flex items-start justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--pri)]">Chart</p><h2 className="text-lg font-black text-[var(--text)]">Check-in hourly analysis</h2><p className="text-[10px] text-[var(--muted)]">Successful and overridden venue check-ins from persisted timestamps.</p></div><BarChart3 className="h-5 w-5 text-[var(--pri)]" /></div><div className="mt-5 flex h-36 items-end gap-1 border-b border-[var(--border)] pb-5">{(report.hourly_checkins || []).map((row) => { const max = Math.max(1, ...(report.hourly_checkins || []).map((item) => Number(item.checkins) || 0)); return <div key={row.hour} className="group relative flex h-full flex-1 items-end"><div title={`${row.hour}: ${row.checkins} check-ins`} className="w-full rounded-t bg-[var(--pri)]/75 transition-colors group-hover:bg-[var(--pri)]" style={{ height: `${Math.max(2, ((Number(row.checkins) || 0) / max) * 100)}%` }} /></div>; })}</div><div className="mt-2 flex justify-between text-[8px] font-bold text-[var(--muted)]"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span></div></section>}

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--pri)]">Live analysis</p><h2 className="text-lg font-black text-[var(--text)]">Filter the operational record</h2></div><div className="grid flex-1 gap-2 sm:grid-cols-3 xl:max-w-5xl xl:grid-cols-6"><FilterSelect label="Role" value={filters.role} onChange={(role) => setFilters({ ...filters, role })} options={roleOptions} /><FilterSelect label="Station" value={filters.station} onChange={(station) => setFilters({ ...filters, station })} options={stationOptions} /><FilterSelect label="Attendance" value={filters.attendance} onChange={(attendance) => setFilters({ ...filters, attendance })} options={["checked_in", "open", "no_show"]} /><FilterSelect label="Registration" value={filters.status} onChange={(status) => setFilters({ ...filters, status })} options={statusOptions} /><DateFilter label="From" value={filters.from} onChange={(from) => setFilters({ ...filters, from })} /><DateFilter label="To" value={filters.to} onChange={(to) => setFilters({ ...filters, to })} /></div></div>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--pri)]">Premium report designer</p><h2 className="text-lg font-black text-[var(--text)]">Choose sections and table columns</h2><p className="text-xs text-[var(--muted)]">These choices are retained in a final snapshot and applied to both PDF and DOCX exports.</p></div>
            <button type="button" onClick={() => setSelectedSections(catalog.map((row) => row.id))} className="text-[10px] font-black text-[var(--pri)]">Select all</button>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {catalog.map((section) => <label key={section.id} className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surf)] px-3 py-2 text-xs font-bold text-[var(--text)]"><input type="checkbox" checked={selectedSections.includes(section.id)} onChange={(event) => setSelectedSections((current) => event.target.checked ? [...current, section.id] : current.filter((id) => id !== section.id))} />{section.title}</label>)}
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {Object.entries(COLUMN_PRESETS).map(([key, columns]) => <div key={key} className="rounded-xl border border-[var(--border)] p-3"><p className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">{key.replaceAll("_", " ")} columns</p><div className="mt-2 flex flex-wrap gap-2">{columns.map((column) => { const active = (selectedColumns[key] || columns).includes(column); return <label key={column} className="flex items-center gap-1 text-[10px] font-semibold text-[var(--text)]"><input type="checkbox" checked={active} onChange={(event) => setSelectedColumns((current) => { const next = new Set(current[key] || columns); if (event.target.checked) next.add(column); else next.delete(column); return { ...current, [key]: [...next] }; })} />{column.replaceAll("_", " ")}</label>; })}</div></div>)}
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <div className="space-y-5">
            <ReportSection title="Delegate appendix" count={delegates.length}><DataTable columns={["registration_code", "name", "email", "phone", "role", "company", "registration_status", "payment_status", "source", "registered_at"]} rows={delegates} /></ReportSection>
            <ReportSection title="Session attendance" count={attendance.length}><DataTable columns={["registration_code", "delegate", "role", "session", "checkin_time", "checkout_time", "duration_seconds", "state", "method", "device_id"]} rows={attendance} /></ReportSection>
            <ReportSection title="Venue scans and exceptions" count={scans.length}><DataTable columns={["registration_code", "delegate", "station", "scan_type", "status", "checkin_time", "rejection_reason", "admin_overridden_by"]} rows={scans} /></ReportSection>
            <ReportSection title="Companions" count={report.companions.length}><DataTable columns={["primary_delegate", "name", "relationship", "email", "phone", "badge_status", "special_assistance"]} rows={report.companions} /></ReportSection>
            <ReportSection title="Badges and kits" count={report.badges.length + report.kits.length}><h3 className="mb-2 text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">Badges</h3><DataTable columns={["registration_code", "delegate", "badge_code", "status", "issued_at", "print_count", "reprint_count"]} rows={report.badges} /><h3 className="mb-2 mt-5 text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">Kits</h3><DataTable columns={["registration_code", "delegate", "kit", "category", "status", "issued_by", "issued_at"]} rows={report.kits} /></ReportSection>
            <ReportSection title="Operator action audit" count={report.actions.length}><DataTable columns={["registration_code", "delegate", "action", "performed_by", "details", "created_at"]} rows={report.actions} /></ReportSection>
            <ReportSection title="Hourly check-in analysis" count={report.hourly_checkins?.length || 0}><DataTable columns={["hour", "checkins"]} rows={report.hourly_checkins || []} /></ReportSection>
            <ReportSection title="Capacity utilization" count={report.capacity?.length || 0}><DataTable columns={["station", "capacity", "checkins", "utilization_pct", "updated_by", "updated_reason"]} rows={report.capacity || []} /></ReportSection>
            <ReportSection title="Registration desk performance" count={report.desk_performance?.length || 0}><DataTable columns={["station", "total_scans", "successful_scans", "rejected_scans", "overridden_scans"]} rows={report.desk_performance || []} /></ReportSection>
            <ReportSection title="Device and printer health" count={report.devices?.length || 0}><DataTable columns={["device_name", "device_type", "status", "last_heartbeat_at", "hostname", "app_version"]} rows={report.devices || []} /></ReportSection>
            <ReportSection title="Automated Event Insights" count={report.insights?.length || 0}><DataTable columns={["severity", "title", "detail"]} rows={report.insights || []} /></ReportSection>
          </div>
          <aside className="space-y-5">
            <section className="sticky top-0 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--pri)]">Signed export</p><h2 className="mt-1 text-lg font-black text-[var(--text)]">Generate Final Event Report</h2><p className="mt-2 text-xs font-medium leading-5 text-[var(--muted)]">Both formats contain the selected sections and complete delegate-level appendix. Downloads contain personal information and are audit logged.</p><label className="mt-4 block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">Export version</span><select value={exportSource} onChange={(e) => setExportSource(e.target.value)} className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surf)] px-3 text-xs font-bold text-[var(--text)]"><option value="live">Live data · {formatDate(report.metadata.generated_at)}</option>{snapshots.map((snapshot) => <option key={snapshot.id} value={snapshot.id}>Final v{snapshot.version} · {formatDate(snapshot.created_at)}</option>)}</select></label><div className="mt-3 grid grid-cols-2 gap-2"><Button variant="outline" disabled={Boolean(exporting)} onClick={() => exportReport("pdf")} className="h-10 gap-2 text-xs font-black"><Download className="size-4" />{exporting === "pdf" ? "Working…" : "PDF package"}</Button><Button variant="outline" disabled={Boolean(exporting)} onClick={() => exportReport("docx")} className="h-10 gap-2 text-xs font-black"><Download className="size-4" />{exporting === "docx" ? "Working…" : "DOCX"}</Button></div><Button onClick={finalize} className="mt-2 h-10 w-full gap-2 bg-[var(--pri)] text-xs font-black text-[var(--primary-contrast)]"><Archive className="size-4" />{snapshots.length ? "Create revised final" : "Finalize report"}</Button>{snapshots.length > 0 && <div className="mt-5 border-t border-[var(--border)] pt-4"><h3 className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">Immutable history</h3><div className="mt-2 space-y-2">{snapshots.map((snapshot) => <div key={snapshot.id} className="rounded-xl border border-[var(--border)] bg-[var(--surf)] p-3"><div className="flex items-center justify-between"><span className="text-xs font-black text-[var(--text)]">Final v{snapshot.version}</span><span className="text-[10px] font-semibold text-[var(--muted)]">{formatDate(snapshot.created_at)}</span></div><p className="mt-1 truncate font-mono text-[9px] text-[var(--muted)]">SHA-256 {snapshot.content_hash}</p>{snapshot.revision_reason && <p className="mt-1 text-[10px] font-medium text-[var(--muted)]">{snapshot.revision_reason}</p>}</div>)}</div></div>}</section>
          </aside>
        </div>
      </>}
    </main>
  );
}

function formatDate(value?: string) { return value ? new Date(value).toLocaleString() : "Unavailable"; }
function StatusLine({ icon: Icon, label, value, tone = "text-[var(--pri)]" }: { icon: typeof Clock3; label: string; value: string; tone?: string }) { return <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] pb-2"><span className="flex items-center gap-2 font-semibold text-[var(--muted)]"><Icon className={`size-4 ${tone}`} />{label}</span><span className="text-right font-black text-[var(--text)]">{value}</span></div>; }
function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Users }) { return <div className="bg-[var(--card)] p-4"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-[var(--muted)]"><Icon className="size-3.5 text-[var(--pri)]" />{label}</div><p className="mt-2 text-2xl font-black tabular-nums text-[var(--text)]">{value ?? 0}</p></div>; }
function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) { return <label><span className="mb-1 block text-[9px] font-black uppercase tracking-wider text-[var(--muted)]">{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surf)] px-2 text-[10px] font-bold text-[var(--text)]"><option value="all">All</option>{options.map((option) => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}</select></label>; }
function DateFilter({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label><span className="mb-1 block text-[9px] font-black uppercase tracking-wider text-[var(--muted)]">{label}</span><input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surf)] px-2 text-[10px] font-bold text-[var(--text)]" /></label>; }
function ReportSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) { return <details open className="group overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm"><summary className="flex cursor-pointer list-none items-center justify-between p-5"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--pri)]">Detailed ledger · {count} records</p><h2 className="text-base font-black text-[var(--text)]">{title}</h2></div><ChevronDown className="size-4 text-[var(--muted)] transition-transform group-open:rotate-180" /></summary><div className="border-t border-[var(--border)] p-4">{children}</div></details>; }
function DataTable({ columns, rows }: { columns: string[]; rows: Array<Record<string, any>> }) { if (!rows.length) return <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-xs font-semibold text-[var(--muted)]">No records match this section.</div>; return <div className="max-h-[460px] overflow-auto rounded-xl border border-[var(--border)]"><table className="min-w-full border-collapse text-left"><thead className="sticky top-0 z-10 bg-[var(--surf)]"><tr>{columns.map((column) => <th key={column} className="whitespace-nowrap border-b border-[var(--border)] px-3 py-2 text-[9px] font-black uppercase tracking-wider text-[var(--muted)]">{column.replaceAll("_", " ")}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.id || `${row.registration_code}-${index}`} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--raised)]">{columns.map((column) => <td key={column} className="max-w-[260px] whitespace-nowrap px-3 py-2 text-[10px] font-semibold text-[var(--text)]">{renderCell(row[column], column)}</td>)}</tr>)}</tbody></table></div>; }
function renderCell(value: any, column: string) { if (value == null || value === "") return <span className="text-[var(--muted)]">—</span>; if (typeof value === "boolean") return value ? "Yes" : "No"; if (typeof value === "object") return <span className="block max-w-[240px] truncate font-mono" title={JSON.stringify(value)}>{JSON.stringify(value)}</span>; if (column.includes("time") || column.endsWith("_at")) return formatDate(String(value)); if (column === "duration_seconds") return `${Math.round(Number(value) / 60)} min`; return String(value); }
