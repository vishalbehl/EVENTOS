"use client";

import { useParams } from "next/navigation";
import { useState, useMemo } from "react";
import {
  BadgeCheck, Cloud, FileClock, Sparkles, Globe, Download,
  Archive, Shield, AlertTriangle, Search, Check
} from "lucide-react";
import {
  useOrganizationDomain,
  useUpdateRegionalSettings,
} from "@/features/organizations/api/organization-console-api";
import { toast } from "sonner";
import {
  OrgPageHeader, OrgCard, OrgTabBar, OrgDataTable, OrgStatusBadge,
  OrgSectionTitle, OrgMetricCard, LoadingPage,
} from "@/features/organizations/components/OrgPageShared";
import { GovernanceControlsPanel } from "@/features/organizations/components/GovernanceControlsPanel";
import { ComplianceControlsPanel } from "@/features/organizations/components/ComplianceControlsPanel";

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "Not measured";
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export default function GovernancePageScreen() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;

  const [activeTab, setActiveTab] = useState("storage");
  const [auditSearch, setAuditSearch] = useState("");

  const { data: storageRes, isLoading } = useOrganizationDomain(orgId, "storage");
  const { data: compRes } = useOrganizationDomain(orgId, "compliance");
  const { data: auditRes } = useOrganizationDomain(orgId, "audit");
  const { data: insightsRes } = useOrganizationDomain(orgId, "insights");

  const updateRegional = useUpdateRegionalSettings(orgId);

  const [regionForm, setRegionForm] = useState({
    data_region: "US-East (N. Virginia)",
    currency: "USD",
    timezone: "UTC",
    country: "US",
    reason: "Compliance residency update",
  });

  if (isLoading) return <LoadingPage />;

  // Data extraction
  const storageData = storageRes?.data as any;
  const storageBytes: number | null = storageData?.storage_bytes ?? null;
  const backups = storageData?.backups;

  const compData = compRes?.data as any;
  const controls: any[] = compData?.controls ?? [];
  const legalHolds: any[] = compData?.legal_holds ?? [];

  const auditData = auditRes?.data as any;
  const auditEvents: any[] = auditData?.items ?? auditData?.events ?? [];

  const insightsData = insightsRes?.data as any;
  const currentInsight = insightsData?.current ?? {};
  const healthFactors: any[] = currentInsight?.health_factors ?? [];

  const filteredAuditEvents = auditEvents.filter((e) => {
    const q = auditSearch.toLowerCase();
    const act = e.action_type || e.action || "";
    return !auditSearch || act.toLowerCase().includes(q) || e.resource_type?.toLowerCase().includes(q) || e.actor_user_id?.toLowerCase().includes(q);
  });

  const tabs = [
    { key: "storage", label: "Storage & Backups" },
    { key: "compliance", label: "Compliance & Holds" },
    { key: "audit", label: "Audit Log Trail" },
    { key: "insights", label: "AI & Telemetry Insights" },
    { key: "residency", label: "Data Residency & GDPR" },
  ];

  const handleExportCSV = () => window.location.assign(`/organizations/${orgId}/audit`);

  const handleSaveResidency = async () => {
    try {
      await updateRegional.mutateAsync(regionForm);
      toast.success("Data residency settings updated");
    } catch (e: any) {
      toast.error("Failed to update residency settings");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <OrgPageHeader
        icon={BadgeCheck}
        title="Governance Workspace"
        description="Data storage retention, regulatory compliance, data residency, GDPR & audit trails."
      />

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <OrgMetricCard label="Storage Consumption" value={formatBytes(storageBytes)} />
        <OrgMetricCard label="Compliance Controls" value={controls.length} />
        <OrgMetricCard label="Active Legal Holds" value={legalHolds.filter((h) => h.status === "ACTIVE").length} />
        <OrgMetricCard label="Audit Events" value={auditEvents.length} />
      </div>

      <OrgTabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {/* ── Storage Tab ─────────────────────────────────────── */}
      {activeTab === "storage" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <OrgCard>
            <OrgSectionTitle>Storage Consumption Gauge</OrgSectionTitle>
            <div className="text-4xl font-black text-[var(--text-primary)] mb-2">{formatBytes(storageBytes)}</div>
            <p className="text-[10px] text-[var(--text-tertiary)]">{storageData?.calculated_at ? `Metered at ${new Date(storageData.calculated_at).toLocaleString()}` : "No authoritative usage snapshot is available."}</p>
          </OrgCard>

          <OrgCard>
            <OrgSectionTitle>Backup Health</OrgSectionTitle>
            <div className="flex items-start gap-3">
              <Archive className="w-5 h-5 text-[var(--brand-primary)] mt-0.5" />
              <div>
                <p className="text-xs font-bold text-[var(--text-primary)]">{backups?.available ? "Backup evidence available" : "Backup evidence unavailable"}</p>
                <p className="text-[11px] text-[var(--text-tertiary)] mt-1">
                  {backups?.reason || "No authoritative backup provider status is available."}
                </p>
              </div>
            </div>
          </OrgCard>
        </div>
      )}

      {/* ── Compliance Tab ──────────────────────────────────── */}
      {activeTab === "compliance" && (
        <div className="space-y-6">
          <ComplianceControlsPanel orgId={orgId} controls={controls} />
          <GovernanceControlsPanel orgId={orgId} data={compData ?? {}} />
        </div>
      )}

      {/* ── Audit Log Trail Tab ─────────────────────────────── */}
      {activeTab === "audit" && (
        <div className="space-y-4">
          <div className="flex justify-between gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-tertiary)]" />
              <input
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                placeholder="Search audit trail…"
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none"
              />
            </div>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] text-xs font-bold text-[var(--text-primary)]"
            >
              <Download className="w-3.5 h-3.5" />
              Manage durable exports
            </button>
          </div>

          <OrgDataTable
            columns={[
              { key: "time", header: "Time", render: (e: any) => <span className="text-[10px] font-mono text-[var(--text-secondary)]">{e.occurred_at ? new Date(e.occurred_at).toLocaleString() : "—"}</span> },
              { key: "actor", header: "Actor", render: (e: any) => <span className="text-xs font-bold font-mono text-[var(--text-primary)]">{e.actor_user_id?.slice(0, 16) || "System"}</span> },
              { key: "action", header: "Action", render: (e: any) => <span className="text-xs font-mono text-[var(--brand-primary)]">{e.action_type || e.action || "EVENT"}</span> },
              { key: "resource", header: "Resource", render: (e: any) => <span className="text-xs text-[var(--text-tertiary)]">{e.resource_type}</span> },
            ]}
            rows={filteredAuditEvents}
            keyFn={(e: any) => e.id}
            emptyMessage="No audit trail events"
          />
        </div>
      )}

      {/* ── Insights Tab ────────────────────────────────────── */}
      {activeTab === "insights" && (
        <OrgCard>
          <OrgSectionTitle>AI & Telemetry Insights</OrgSectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
            {healthFactors.map((f: any, idx: number) => (
              <div key={idx} className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)]">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-[var(--text-primary)]">{f.label}</span>
                  <OrgStatusBadge status={f.status} />
                </div>
                <p className="text-xs text-[var(--text-tertiary)]">{f.evidence}</p>
              </div>
            ))}
          </div>
        </OrgCard>
      )}

      {/* ── Data Residency Tab ──────────────────────────────── */}
      {activeTab === "residency" && (
        <OrgCard>
          <OrgSectionTitle>Configurable Data Residency & GDPR Boundary</OrgSectionTitle>
          <div className="space-y-4 max-w-lg mt-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                Data Storage Region
              </label>
              <input
                value={regionForm.data_region}
                onChange={(e) => setRegionForm((f) => ({ ...f, data_region: e.target.value }))}
                className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs text-[var(--text-primary)]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                Jurisdiction & Boundary
              </label>
              <input
                value={regionForm.country}
                onChange={(e) => setRegionForm((f) => ({ ...f, country: e.target.value.toUpperCase() }))}
                className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs text-[var(--text-primary)]"
              />
            </div>
            <button
              onClick={handleSaveResidency}
              className="flex items-center gap-1.5 px-4 py-2 bg-[var(--brand-primary)] text-[var(--primary-contrast)] text-xs font-bold rounded-xl"
            >
              <Check className="w-3.5 h-3.5" />
              Save Residency Config
            </button>
          </div>
        </OrgCard>
      )}
    </div>
  );
}
