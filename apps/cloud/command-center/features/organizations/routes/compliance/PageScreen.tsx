"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { BadgeCheck, Plus, FileText, Shield } from "lucide-react";
import {
  useOrganizationDomain,
  useCreateComplianceControl,
} from "@/features/organizations/api/organization-console-api";
import { toast } from "sonner";
import {
  OrgPageHeader, OrgCard, OrgTabBar, OrgDataTable, OrgStatusBadge,
  OrgSectionTitle, OrgMetricCard, UnavailableDomain, LoadingPage,
} from "@/features/organizations/components/OrgPageShared";

export default function CompliancePageScreen() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;
  const [activeTab, setActiveTab] = useState("controls");
  const { data, isLoading } = useOrganizationDomain(orgId, "compliance");
  const createControl = useCreateComplianceControl(orgId);

  if (isLoading) return <LoadingPage />;
  if (!data?.availability?.available) return <UnavailableDomain reason={data?.availability?.reason} />;

  const domainData = data?.data as any;
  const controls: any[] = domainData?.controls ?? [];
  const privacyRequests: any[] = domainData?.privacy_requests ?? [];
  const retentionPolicies: any[] = domainData?.retention_policies ?? [];
  const legalHolds: any[] = domainData?.legal_holds ?? [];

  const readyCount = controls.filter((c) => c.state === "READY").length;
  const score = controls.length > 0 ? Math.round((readyCount / controls.length) * 100) : null;
  const activeHolds = legalHolds.filter((h) => h.status === "ACTIVE").length;

  const tabs = [
    { key: "controls", label: "Controls" },
    { key: "privacy", label: "Privacy Requests" },
    { key: "retention", label: "Retention" },
    { key: "holds", label: "Legal Holds" },
  ];

  const frameworks = Array.from(new Set(controls.map((c) => c.framework)));

  return (
    <div className="p-6 space-y-6">
      <OrgPageHeader
        icon={BadgeCheck}
        title="Compliance"
        description="Manage compliance standards and policies."
        generatedAt={data?.generated_at}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <OrgMetricCard
          label="Compliance Score"
          value={score != null ? `${score}%` : "—"}
        />
        <OrgMetricCard label="Controls" value={controls.length} sub={`${readyCount} ready`} />
        <OrgMetricCard label="Frameworks" value={frameworks.length} />
        <OrgMetricCard label="Active Legal Holds" value={activeHolds} />
      </div>

      {activeHolds > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-[var(--status-warning)]/20 bg-[var(--status-warning-muted)] px-4 py-3">
          <Shield className="w-4 h-4 text-[var(--status-warning)] mt-0.5" />
          <div>
            <p className="text-xs font-bold text-[var(--text-primary)]">{activeHolds} active legal hold{activeHolds !== 1 ? "s" : ""}</p>
            <p className="text-[11px] text-[var(--text-tertiary)]">Data deletion is blocked while legal holds are active.</p>
          </div>
        </div>
      )}

      <OrgTabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {activeTab === "controls" && (
        <>
          {frameworks.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {frameworks.map((fw) => {
                const fwControls = controls.filter((c) => c.framework === fw);
                const fwReady = fwControls.filter((c) => c.state === "READY").length;
                const fwScore = fwControls.length > 0 ? Math.round((fwReady / fwControls.length) * 100) : 0;
                return (
                  <OrgCard key={fw} className="flex flex-col gap-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-tertiary)]">{fw}</span>
                    <span className="text-2xl font-black text-[var(--text-primary)]">{fwScore}%</span>
                    <span className="text-[10px] text-[var(--text-tertiary)]">{fwReady}/{fwControls.length} ready</span>
                    <div className="w-full bg-[var(--bg-surface-3)] rounded-full h-1.5 mt-1">
                      <div
                        className="h-1.5 rounded-full bg-[var(--brand-primary)]"
                        style={{ width: `${fwScore}%` }}
                      />
                    </div>
                  </OrgCard>
                );
              })}
            </div>
          )}
          <OrgDataTable
            columns={[
              { key: "control", header: "Control", render: (c: any) => (
                <div>
                  <p className="text-xs font-bold text-[var(--text-primary)]">{c.title}</p>
                  <p className="text-[10px] font-mono text-[var(--text-tertiary)]">{c.control_key}</p>
                </div>
              )},
              { key: "framework", header: "Framework", render: (c: any) => (
                <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--bg-surface-3)] text-[var(--text-secondary)]">{c.framework}</span>
              )},
              { key: "state", header: "State", render: (c: any) => <OrgStatusBadge status={c.state} /> },
              { key: "score", header: "Readiness", render: (c: any) => (
                <span className="text-xs font-bold tabular-nums text-[var(--text-secondary)]">
                  {c.readiness_score != null ? `${c.readiness_score}%` : "—"}
                </span>
              )},
              { key: "owner", header: "Owner", render: (c: any) => (
                <span className="text-[10px] font-mono text-[var(--text-tertiary)]">{c.owner_user_id?.slice(0, 16) || "—"}</span>
              )},
              { key: "due", header: "Review Due", render: (c: any) => (
                <span className="text-[10px] font-mono text-[var(--text-tertiary)]">
                  {c.review_due_at ? new Date(c.review_due_at).toLocaleDateString() : "—"}
                </span>
              )},
            ]}
            rows={controls}
            keyFn={(c: any) => c.id}
            emptyMessage="No compliance controls assessed"
          />
        </>
      )}

      {activeTab === "privacy" && (
        <OrgDataTable
          columns={[
            { key: "type", header: "Request Type", render: (r: any) => (
              <span className="text-xs font-bold text-[var(--text-primary)]">{r.request_type}</span>
            )},
            { key: "status", header: "Status", render: (r: any) => <OrgStatusBadge status={r.status} /> },
            { key: "submitted", header: "Submitted", render: (r: any) => (
              <span className="text-[10px] font-mono text-[var(--text-tertiary)]">
                {r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}
              </span>
            )},
            { key: "due", header: "Due By", render: (r: any) => (
              <span className="text-[10px] font-mono text-[var(--text-tertiary)]">
                {r.due_at ? new Date(r.due_at).toLocaleDateString() : "—"}
              </span>
            )},
            { key: "completed", header: "Completed", render: (r: any) => (
              <span className="text-[10px] font-mono text-[var(--text-tertiary)]">
                {r.completed_at ? new Date(r.completed_at).toLocaleDateString() : "Pending"}
              </span>
            )},
          ]}
          rows={privacyRequests}
          keyFn={(r: any) => r.id}
          emptyMessage="No privacy requests submitted"
        />
      )}

      {activeTab === "retention" && (
        <OrgDataTable
          columns={[
            { key: "category", header: "Data Category", render: (p: any) => (
              <span className="text-xs font-bold text-[var(--text-primary)]">{p.data_category}</span>
            )},
            { key: "retention", header: "Retention Period", render: (p: any) => (
              <span className="text-xs text-[var(--text-secondary)]">{p.retention_days} days</span>
            )},
            { key: "action", header: "Expiry Action", render: (p: any) => (
              <span className="text-xs text-[var(--text-secondary)]">{p.action_on_expiry || "—"}</span>
            )},
            { key: "legal_basis", header: "Legal Basis", render: (p: any) => (
              <span className="text-[10px] text-[var(--text-tertiary)]">{p.legal_basis || "—"}</span>
            )},
          ]}
          rows={retentionPolicies}
          keyFn={(p: any) => p.id}
          emptyMessage="No retention policies configured"
        />
      )}

      {activeTab === "holds" && (
        <OrgDataTable
          columns={[
            { key: "name", header: "Hold Name", render: (h: any) => (
              <span className="text-xs font-bold text-[var(--text-primary)]">{h.name}</span>
            )},
            { key: "reason", header: "Reason", render: (h: any) => (
              <span className="text-xs text-[var(--text-secondary)]">{h.reason}</span>
            )},
            { key: "status", header: "Status", render: (h: any) => <OrgStatusBadge status={h.status} /> },
            { key: "created", header: "Created", render: (h: any) => (
              <span className="text-[10px] font-mono text-[var(--text-tertiary)]">
                {h.created_at ? new Date(h.created_at).toLocaleDateString() : "—"}
              </span>
            )},
            { key: "released", header: "Released", render: (h: any) => (
              <span className="text-[10px] font-mono text-[var(--text-tertiary)]">
                {h.released_at ? new Date(h.released_at).toLocaleDateString() : h.status === "ACTIVE" ? "Active" : "—"}
              </span>
            )},
          ]}
          rows={legalHolds}
          keyFn={(h: any) => h.id}
          emptyMessage="No legal holds in place"
        />
      )}
    </div>
  );
}
