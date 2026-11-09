"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Settings2, ShieldAlert, Globe } from "lucide-react";
import { 
  useOrganizationDomain,
  destructiveLifecycleUnavailableReason,
} from "@/features/organizations/api/organization-console-api";
import {
  OrgPageHeader, OrgCard, OrgTabBar, OrgSectionTitle, 
  UnavailableDomain, LoadingPage, OrgDataTable, OrgStatusBadge
} from "@/features/organizations/components/OrgPageShared";

export default function AdvancedPageScreen() {
  const params = useParams<{ orgId: string }>();
  const [activeTab, setActiveTab] = useState("general");
  const { data, isLoading } = useOrganizationDomain(params.orgId, "advanced");

  if (isLoading) return <LoadingPage />;
  if (!data?.availability?.available) return <UnavailableDomain reason={data?.availability?.reason} />;

  const domainData = data?.data as any;
  const settings = domainData?.settings ?? {};
  const lifecycleJobs: any[] = domainData?.jobs ?? domainData?.lifecycle_jobs ?? [];
  const featureFlags = domainData?.feature_flags ?? {};

  const tabs = [
    { key: "general", label: "General" },
    { key: "data", label: "Data & Privacy" },
    { key: "features", label: "Feature Flags" },
    { key: "danger", label: "Danger Zone" },
  ];


  return (
    <div className="p-6 space-y-6">
      <OrgPageHeader
        icon={Settings2}
        title="Advanced Settings"
        description="Core platform settings, feature flags, and lifecycle management."
        generatedAt={data?.generated_at}
      />

      <OrgTabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {activeTab === "general" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <OrgCard>
            <OrgSectionTitle>System Identifiers</OrgSectionTitle>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                  Organization ID (UUID)
                </label>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={params.orgId}
                    className="flex-1 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs font-mono text-[var(--text-secondary)] focus:outline-none"
                  />
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(params.orgId);
                      toast.success("ID copied to clipboard");
                    }}
                    className="px-3 py-2 rounded-xl bg-[var(--bg-surface-3)] border border-[var(--border-default)] text-xs font-bold hover:bg-[var(--bg-surface)] transition-colors text-[var(--text-primary)]"
                  >
                    Copy
                  </button>
                </div>
              </div>
              
               <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                  API Version
                </label>
                <input
                  readOnly
                  value={settings.api_version || "2024-01-01"}
                  className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs font-mono text-[var(--text-secondary)] focus:outline-none"
                />
              </div>
            </div>
          </OrgCard>

          <OrgCard>
             <OrgSectionTitle>Regional Settings</OrgSectionTitle>
              <div className="space-y-4">
               <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                  Default Timezone
                </label>
                <input
                  readOnly
                  value={settings.timezone || "UTC"}
                  className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs text-[var(--text-secondary)] focus:outline-none"
                />
              </div>
               <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                  Default Currency
                </label>
                <input
                  readOnly
                  value={settings.currency || "USD"}
                  className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs text-[var(--text-secondary)] focus:outline-none"
                />
              </div>
            </div>
          </OrgCard>
        </div>
      )}

      {activeTab === "data" && (
        <OrgCard>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-[var(--brand-primary)]/10 flex items-center justify-center">
              <Globe className="w-5 h-5 text-[var(--brand-primary)]" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">Data Residency</h3>
              <p className="text-xs text-[var(--text-tertiary)]">Geographic location where your organization's core data is stored and processed.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">Primary Region</p>
              <p className="text-sm font-bold text-[var(--text-primary)]">{settings.data_region || "US-East (N. Virginia)"}</p>
            </div>
            <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">Failover Region</p>
              <p className="text-sm font-bold text-[var(--text-primary)]">{settings.failover_region || "US-West (Oregon)"}</p>
            </div>
             <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">Compliance Boundary</p>
              <p className="text-sm font-bold text-[var(--text-primary)]">{settings.compliance_boundary || "Global"}</p>
            </div>
          </div>
          
          <p className="mt-4 text-[10px] text-[var(--text-tertiary)]">
            Data residency can only be changed by contacting enterprise support.
          </p>
        </OrgCard>
      )}

      {activeTab === "features" && (
        <OrgCard>
          <OrgSectionTitle>Organization Feature Flags</OrgSectionTitle>
          {Object.keys(featureFlags).length > 0 ? (
            <div className="space-y-3 mt-4">
              {Object.entries(featureFlags).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-3)]">
                  <div>
                    <p className="text-xs font-bold text-[var(--text-primary)] font-mono">{key}</p>
                  </div>
                  <OrgStatusBadge status={value ? "ENABLED" : "DISABLED"} />
                </div>
              ))}
            </div>
          ) : (
             <p className="text-xs text-[var(--text-tertiary)] mt-4">No custom feature flags are currently applied to this organization.</p>
          )}
        </OrgCard>
      )}

      {activeTab === "danger" && (
        <div className="space-y-6">
          {lifecycleJobs.length > 0 && (
            <OrgCard>
              <OrgSectionTitle>Recent Lifecycle Operations</OrgSectionTitle>
              <OrgDataTable
                columns={[
                  { key: "type", header: "Operation Type", render: (j: any) => (
                    <span className="text-xs font-bold text-[var(--text-primary)]">{j.job_type}</span>
                  )},
                  { key: "status", header: "Status", render: (j: any) => (
                    <OrgStatusBadge status={j.status} />
                  )},
                  { key: "requested", header: "Requested By", render: (j: any) => (
                     <span className="text-[10px] font-mono text-[var(--text-tertiary)]">{j.requested_by?.slice(0, 16)}</span>
                  )},
                  { key: "date", header: "Date", render: (j: any) => (
                    <span className="text-[10px] text-[var(--text-secondary)] font-mono">
                      {new Date(j.created_at).toLocaleString()}
                    </span>
                  )}
                ]}
                rows={lifecycleJobs}
                keyFn={(j: any) => j.id}
              />
            </OrgCard>
          )}
        
          <div className="rounded-2xl border-2 border-[var(--status-danger)]/30 bg-[var(--status-danger)]/5 overflow-hidden">
            <div className="p-5 border-b border-[var(--status-danger)]/20 flex items-center gap-3">
              <ShieldAlert className="w-5 h-5 text-[var(--status-danger)]" />
              <h3 className="text-sm font-black text-[var(--status-danger)] uppercase tracking-wider">Danger Zone</h3>
            </div>
            
            <div className="p-5 flex items-start justify-between gap-6">
              <div>
                <p className="text-sm font-bold text-[var(--text-primary)] mb-1">Request Organization Purge</p>
                <p className="text-xs text-[var(--text-tertiary)] leading-relaxed max-w-2xl">
                  {destructiveLifecycleUnavailableReason}
                </p>
              </div>
              <button 
                disabled
                className="shrink-0 px-4 py-2.5 rounded-xl bg-[var(--status-danger)] text-white text-xs font-bold opacity-40"
              >
                Purge unavailable
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
