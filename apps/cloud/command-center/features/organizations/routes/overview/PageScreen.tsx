"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Gauge, ShieldAlert, Sparkles, UserCheck, AlertTriangle, ArrowRight,
  RefreshCw, DollarSign, Calendar, Users, HardDrive, Shield, Check, Globe
} from "lucide-react";
import {
  useOrganizationConsoleSummary,
  useUpdateRegionalSettings,
} from "@/features/organizations/api/organization-console-api";
import { toast } from "sonner";
import {
  OrgPageHeader, OrgMetricCard, OrgCard, OrgSectionTitle,
  OrgStatusBadge, LoadingPage,
} from "@/features/organizations/components/OrgPageShared";

function HealthRing({ score }: { score: number | null | undefined }) {
  const safeScore = score ?? 0;
  const strokeColor =
    safeScore >= 80 ? "var(--status-success)" : safeScore >= 50 ? "var(--status-warning)" : "var(--status-danger)";

  return (
    <div className="relative w-28 h-28 flex items-center justify-center">
      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
        <path
          className="text-[var(--bg-surface-3)]"
          strokeWidth="3.5"
          stroke="currentColor"
          fill="none"
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
        />
        <path
          strokeWidth="3.5"
          strokeDasharray={`${safeScore}, 100`}
          strokeLinecap="round"
          stroke={strokeColor}
          fill="none"
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-2xl font-black text-[var(--text-primary)]">{score != null ? `${score}%` : "—"}</span>
        <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Health Score</span>
      </div>
    </div>
  );
}

export default function OverviewPageScreen() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;
  const router = useRouter();

  const { data: summary, isLoading, refetch } = useOrganizationConsoleSummary(orgId);
  const updateRegional = useUpdateRegionalSettings(orgId);

  const [showRegionalModal, setShowRegionalModal] = useState(false);
  const [regForm, setRegForm] = useState({
    currency: "USD",
    timezone: "UTC",
    country: "US",
    reason: "Administrative region update",
  });

  if (isLoading) return <LoadingPage />;

  const org = summary?.organization;
  const sub = summary?.subscription;
  const metrics = summary?.metrics ?? [];
  const healthFactors = summary?.health_factors ?? [];
  const attentionItems = summary?.attention ?? [];

  const handleUpdateRegional = async () => {
    try {
      await updateRegional.mutateAsync(regForm);
      toast.success("Regional settings updated successfully");
      setShowRegionalModal(false);
      refetch();
    } catch (e: any) {
      toast.error(e?.message || "Failed to update regional settings");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <OrgPageHeader
        icon={Gauge}
        title="Organization Overview"
        description="Executive 360° tenant command snapshot and quick actions."
        generatedAt={summary?.generated_at}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push(`/organizations/${orgId}/internal-admin`)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--brand-primary)] text-[var(--primary-contrast)] text-xs font-bold shadow-md hover:bg-[var(--brand-primary-hover)] transition-all disabled:opacity-40"
            >
              <UserCheck className="w-3.5 h-3.5" />
              Privileged access
            </button>
          </div>
        }
      />

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {metrics.slice(0, 6).map((m) => (
          <OrgMetricCard key={m.key} label={m.label} value={m.value} unit={m.unit} />
        ))}
      </div>

      {/* Executive Health & Profile Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Health Score & Factors */}
        <OrgCard className="flex flex-col items-center justify-center text-center">
          <OrgSectionTitle>Tenant Health Status</OrgSectionTitle>
          <div className="my-2">
            <HealthRing score={summary?.health_score} />
          </div>
          <OrgStatusBadge status={summary?.health_status || "NOT_MEASURED"} />
          <div className="w-full space-y-2 mt-4 pt-3 border-t border-[var(--border-subtle)] text-left">
            {healthFactors.map((f) => (
              <div key={f.key} className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-secondary)]">{f.label}</span>
                <span className="font-bold text-[var(--text-primary)]">{f.score != null ? `${f.score}%` : "—"}</span>
              </div>
            ))}
          </div>
        </OrgCard>

        {/* Profile & Dynamic Regional Settings */}
        <OrgCard className="lg:col-span-2 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <OrgSectionTitle>Organization Profile & Regional Config</OrgSectionTitle>
              <button
                onClick={() => {
                  setRegForm({
                    currency: org?.currency || "USD",
                    timezone: org?.timezone || "UTC",
                    country: org?.country || "US",
                    reason: "Admin update from command center overview",
                  });
                  setShowRegionalModal(true);
                }}
                className="flex items-center gap-1 text-xs font-bold text-[var(--brand-primary)] hover:underline"
              >
                <Globe className="w-3.5 h-3.5" />
                Configure Settings
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <div className="p-3 rounded-xl bg-[var(--bg-surface-3)] border border-[var(--border-subtle)]">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Currency</p>
                <p className="text-sm font-black text-[var(--text-primary)] font-mono">{org?.currency || "USD"}</p>
              </div>
              <div className="p-3 rounded-xl bg-[var(--bg-surface-3)] border border-[var(--border-subtle)]">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Timezone</p>
                <p className="text-xs font-bold text-[var(--text-primary)] font-mono truncate">{org?.timezone || "UTC"}</p>
              </div>
              <div className="p-3 rounded-xl bg-[var(--bg-surface-3)] border border-[var(--border-subtle)]">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Country ISO</p>
                <p className="text-sm font-black text-[var(--text-primary)] uppercase">{org?.country || "US"}</p>
              </div>
              <div className="p-3 rounded-xl bg-[var(--bg-surface-3)] border border-[var(--border-subtle)]">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Current Plan</p>
                <p className="text-xs font-bold text-[var(--brand-primary)]">{sub?.plan_name || "No Plan"}</p>
              </div>
            </div>

            {/* AI Executive Summary */}
            {summary?.executive_summary && (
              <div className="rounded-xl border border-[var(--brand-primary)]/20 bg-[var(--brand-primary)]/5 p-4">
                <div className="flex items-center gap-2 mb-1 text-xs font-bold text-[var(--brand-primary)]">
                  <Sparkles className="w-4 h-4" />
                  Executive Telemetry Summary
                </div>
                <p className="text-xs text-[var(--text-primary)] leading-relaxed">{summary.executive_summary}</p>
              </div>
            )}
          </div>
        </OrgCard>
      </div>

      {/* Quick Actions Panel */}
      <OrgCard>
        <OrgSectionTitle>Command Center Quick Actions</OrgSectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-3">
          {[
            { label: "Privileged Access", icon: UserCheck, onClick: () => router.push(`/organizations/${orgId}/internal-admin`) },
            { label: "Commercial Hub", icon: DollarSign, onClick: () => router.push(`/organizations/${orgId}/commercial`) },
            { label: "Events Directory", icon: Calendar, onClick: () => router.push(`/organizations/${orgId}/events`) },
            { label: "Operations & Members", icon: Users, onClick: () => router.push(`/organizations/${orgId}/operations`) },
            { label: "Security & API", icon: Shield, onClick: () => router.push(`/organizations/${orgId}/security`) },
            { label: "Internal Admin", icon: ShieldAlert, onClick: () => router.push(`/organizations/${orgId}/internal-admin`) },
          ].map((action) => (
            <button
              key={action.label}
              onClick={action.onClick}
              className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] hover:bg-[var(--bg-surface-hover)] transition-all group"
            >
              <action.icon className="w-4 h-4 text-[var(--brand-primary)] group-hover:scale-110 transition-transform" />
              <span className="text-[11px] font-bold text-[var(--text-primary)] text-center">{action.label}</span>
            </button>
          ))}
        </div>
      </OrgCard>

      {/* Attention Queue */}
      {attentionItems.length > 0 && (
        <div className="space-y-3">
          <OrgSectionTitle>Attention Queue ({attentionItems.length})</OrgSectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {attentionItems.map((item) => (
              <OrgCard key={item.key} className="flex flex-col justify-between border-l-4 border-l-[var(--status-warning)]">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-4 h-4 text-[var(--status-warning)]" />
                    <h3 className="text-xs font-bold text-[var(--text-primary)]">{item.title}</h3>
                  </div>
                  <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed mb-3">{item.detail}</p>
                </div>
                <button
                  onClick={() => router.push(`/organizations/${orgId}/commercial`)}
                  className="flex items-center gap-1 text-[11px] font-bold text-[var(--brand-primary)] hover:underline self-start"
                >
                  Resolve Item <ArrowRight className="w-3 h-3" />
                </button>
              </OrgCard>
            ))}
          </div>
        </div>
      )}

      {/* Regional Config Modal */}
      {showRegionalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-sm font-black text-[var(--text-primary)] uppercase tracking-wider mb-4">
              Configure Regional Settings
            </h3>
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                  Default Currency ISO
                </label>
                <input
                  value={regForm.currency}
                  onChange={(e) => setRegForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
                  className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none"
                  placeholder="USD, EUR, GBP, AUD…"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                  Default Timezone (IANA)
                </label>
                <input
                  value={regForm.timezone}
                  onChange={(e) => setRegForm((f) => ({ ...f, timezone: e.target.value }))}
                  className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none"
                  placeholder="UTC, America/New_York, Europe/London…"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                  Country ISO
                </label>
                <input
                  maxLength={2}
                  value={regForm.country}
                  onChange={(e) => setRegForm((f) => ({ ...f, country: e.target.value.toUpperCase() }))}
                  className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none"
                  placeholder="US, GB, DE…"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
              <button
                onClick={() => setShowRegionalModal(false)}
                className="px-3 py-2 rounded-xl text-xs font-bold text-[var(--text-secondary)]"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateRegional}
                disabled={updateRegional.isPending}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--brand-primary)] text-[var(--primary-contrast)] text-xs font-bold"
              >
                <Check className="w-3.5 h-3.5" />
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
