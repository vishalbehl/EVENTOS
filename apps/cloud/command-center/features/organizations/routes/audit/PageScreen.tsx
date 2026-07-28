"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { FileClock, Search, Download, AlertTriangle } from "lucide-react";
import { downloadConsoleExport, useConsoleExports, useCreateConsoleExport, useOrganizationAudit } from "@/features/organizations/api/organization-console-api";
import { toast } from "sonner";
import {
  OrgPageHeader, OrgDataTable, OrgStatusBadge,
  OrgCard, OrgSectionTitle, OrgMetricCard, UnavailableDomain, LoadingPage,
} from "@/features/organizations/components/OrgPageShared";
import { BarChart, Bar, Tooltip, ResponsiveContainer } from "recharts";

export default function AuditPageScreen() {
  const params = useParams<{ orgId: string }>();
  const audit = useOrganizationAudit(params.orgId);

  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportReason, setExportReason] = useState("");
  const [caseReference, setCaseReference] = useState("");
  const exports = useConsoleExports(params.orgId);
  const createExport = useCreateConsoleExport(params.orgId);

  if (audit.isLoading) return <LoadingPage />;
  if (audit.isError) return <UnavailableDomain reason={audit.error instanceof Error ? audit.error.message : "Audit storage is unavailable."} />;

  const events: any[] = audit.data?.pages.flatMap(page => page.items) ?? [];
  const integrityFailures = audit.data?.pages.reduce((total, page) => total + page.integrity.failed, 0) ?? 0;

  const filteredEvents = events.filter((e) => {
    const actionName = e.action_type || e.action || "";
    const ip = e.actor_ip || e.ip_address || "";
    const statusStr = e.status || (e.is_sensitive ? "SENSITIVE" : "SUCCESS");

    const q = search.toLowerCase();
    const matchSearch =
      !search ||
      actionName.toLowerCase().includes(q) ||
      e.resource_type?.toLowerCase().includes(q) ||
      e.actor_user_id?.toLowerCase().includes(q) ||
      ip.includes(q);
    const matchAction = !actionFilter || actionName === actionFilter;
    const matchStatus = !statusFilter || statusStr === statusFilter;
    return matchSearch && matchAction && matchStatus;
  });

  const actions = Array.from(new Set(events.map((e) => e.action_type || e.action))).filter(Boolean);
  const failedCount = events.filter((e) => e.status === "FAILURE").length;
  const uniqueActors = new Set(events.map((e) => e.actor_user_id)).size;

  const chartData = (() => {
    const counts = events.reduce((acc, e) => {
      const type = e.resource_type || "system";
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(counts)
      .map(([name, value]) => ({ name, value: value as number }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  })();

  const requestExport = async () => {
    try { await createExport.mutateAsync({ idempotencyKey: crypto.randomUUID(), payload: { domains: ["audit"], include_sensitive: false, reason: exportReason, case_reference: caseReference } }); setExportOpen(false); setExportReason(""); setCaseReference(""); toast.success("Audit export queued"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Export request failed"); }
  };

  return (
    <div className="p-6 space-y-6">
      <OrgPageHeader
        icon={FileClock}
        title="Audit Logs"
        description="Comprehensive record of all administrative and security events."
        generatedAt={events[0]?.occurred_at}
        actions={
          <button
            onClick={() => setExportOpen(value => !value)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)] text-xs font-bold hover:bg-[var(--bg-surface-hover)] transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        }
      />

      {exportOpen && <OrgCard className="border-[var(--brand-primary)]/20"><OrgSectionTitle>Request durable audit export</OrgSectionTitle><p className="mt-1 text-[10px] text-[var(--text-tertiary)]">Generated asynchronously from authoritative audit storage. The artifact expires after 24 hours; the export record remains.</p><div className="mt-3 grid gap-3 md:grid-cols-2"><input value={caseReference} onChange={event => setCaseReference(event.target.value)} placeholder="Case reference" className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-xs" /><input value={exportReason} onChange={event => setExportReason(event.target.value)} placeholder="Export reason (minimum 12 characters)" className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-xs" /></div><button disabled={caseReference.trim().length < 2 || exportReason.trim().length < 12 || createExport.isPending} onClick={requestExport} className="mt-3 rounded-xl bg-[var(--brand-primary)] px-4 py-2 text-xs font-bold text-[var(--primary-contrast)] disabled:opacity-40">Queue export</button></OrgCard>}

      <OrgCard><OrgSectionTitle>Export history</OrgSectionTitle>{exports.isError ? <p className="mt-3 text-xs text-[var(--status-danger)]">Export status is unavailable.</p> : <div className="mt-3 space-y-2">{(exports.data ?? []).map(job => <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] p-3"><div><p className="text-xs font-bold">{job.domains.join(", ")} export</p><p className="text-[10px] text-[var(--text-tertiary)]">{new Date(job.created_at).toLocaleString()} · {job.id}</p>{job.failure_reason ? <p className="text-[10px] text-[var(--status-danger)]">{job.failure_reason}</p> : null}</div><div className="flex items-center gap-2"><OrgStatusBadge status={job.status} />{job.status === "COMPLETED" && <button onClick={async () => { try { const artifact = await downloadConsoleExport(params.orgId, job.id); window.location.assign(artifact.download_url); } catch (error) { toast.error(error instanceof Error ? error.message : "Download failed"); } }} className="rounded-lg border border-[var(--border-default)] px-2.5 py-1.5 text-[10px] font-bold"><Download className="mr-1 inline size-3" />Download</button>}</div></div>)}{!exports.isLoading && exports.data?.length === 0 ? <p className="text-xs text-[var(--text-tertiary)]">No exports requested.</p> : null}</div>}</OrgCard>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <OrgMetricCard label="Total Events" value={events.length} />
        <OrgMetricCard label="Unique Actors" value={uniqueActors} />
        <OrgMetricCard label="Integrity Failures" value={integrityFailures} trend={integrityFailures ? "Immediate investigation required" : "Verified on read"} trendPositive={!integrityFailures} />
        <OrgMetricCard
          label="Failed Actions"
          value={failedCount}
          trend={failedCount > 0 ? "Requires review" : undefined}
          trendPositive={failedCount === 0}
        />
        <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 flex flex-col justify-end">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">Events by Resource</h3>
          <ResponsiveContainer width="100%" height={50}>
            <BarChart data={chartData}>
              <Bar dataKey="value" fill="var(--brand-primary)" radius={[2, 2, 0, 0]} />
              <Tooltip
                cursor={{ fill: "var(--bg-surface-3)" }}
                contentStyle={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 8, fontSize: 10 }}
                labelStyle={{ display: "none" }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {failedCount > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-[var(--status-danger)]/20 bg-[var(--status-danger-muted)] px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-[var(--status-danger)] mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-bold text-[var(--text-primary)]">High failure rate detected</p>
            <p className="text-[11px] text-[var(--text-tertiary)]">
              {failedCount} failed actions recorded in the current timeframe. Review the logs below for unauthorized access attempts or system errors.
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-tertiary)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search events, actors, or IPs…"
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--brand-primary)]/40"
          />
        </div>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] text-xs text-[var(--text-secondary)] px-3 py-2 focus:outline-none max-w-[200px]"
        >
          <option value="">All Actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] text-xs text-[var(--text-secondary)] px-3 py-2 focus:outline-none"
        >
          <option value="">All Statuses</option>
          <option value="SUCCESS">Success</option>
          <option value="FAILURE">Failure</option>
          <option value="SENSITIVE">Sensitive</option>
        </select>
      </div>

      <OrgDataTable
        columns={[
          { key: "time", header: "Time", width: "140px", render: (e: any) => (
            <span className="text-[10px] text-[var(--text-secondary)]">
              {e.occurred_at ? new Date(e.occurred_at).toLocaleString() : "—"}
            </span>
          )},
          { key: "actor", header: "Actor", render: (e: any) => (
            <span className="text-xs font-bold text-[var(--text-primary)] font-mono truncate max-w-[160px] block">
              {e.actor_email || e.actor_name || (e.actor_user_id ? e.actor_user_id.slice(0, 16) : "System")}
            </span>
          )},
          { key: "action", header: "Action", render: (e: any) => (
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--brand-primary)] bg-[var(--brand-primary)]/10 px-1.5 py-0.5 rounded">
                {e.action_type || e.action || "EVENT"}
              </span>
              <p className="text-[10px] text-[var(--text-tertiary)] mt-1 truncate max-w-[200px]">
                {e.resource_type} {e.resource_id ? `/ ${String(e.resource_id).slice(0, 10)}` : ""}
              </p>
            </div>
          )},
          { key: "ip", header: "IP Address", render: (e: any) => (
            <span className="text-[10px] font-mono text-[var(--text-tertiary)]">{e.actor_ip || e.ip_address || "—"}</span>
          )},
          { key: "status", header: "Status", width: "100px", render: (e: any) => (
            <OrgStatusBadge status={e.status || (e.is_sensitive ? "SENSITIVE" : "SUCCESS")} />
          )},
        ]}
        rows={filteredEvents}
        keyFn={(e: any) => e.id}
        emptyMessage="No audit log events found matching the criteria"
      />
      {audit.hasNextPage && <button disabled={audit.isFetchingNextPage} onClick={() => audit.fetchNextPage()} className="rounded-xl border border-[var(--border-default)] px-4 py-2 text-xs font-bold disabled:opacity-40">{audit.isFetchingNextPage ? "Loading…" : "Load older audit records"}</button>}
    </div>
  );
}
