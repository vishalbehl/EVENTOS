"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  useAdminOrgDetail, useAdminOrgUsage, useAdminOrgTimeline,
  useAdminOrgFeatures, useUpdateOrgStatus, useOverrideFeature,
} from "@/services/super-admin-service";
import {
  Building2, ChevronLeft, Users2, Calendar, CreditCard,
  BarChart3, Activity, HeadphonesIcon, ShieldCheck, Server,
  AlertTriangle, CheckCircle2, HardDrive, RefreshCw,
  ShieldOff, ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

// ── Helpers ───────────────────────────────────────────────────

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const gb = bytes / (1024 ** 3);
  const mb = bytes / (1024 ** 2);
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${bytes.toLocaleString()} B`;
}

// ── Overview Tab ──────────────────────────────────────────────

function OverviewTab({ orgId }: { orgId: string }) {
  const { data: detail, isLoading } = useAdminOrgDetail(orgId);
  const { data: usage } = useAdminOrgUsage(orgId);
  const { mutateAsync: updateStatus } = useUpdateOrgStatus();

  if (isLoading) return <div className="p-8 text-white/30 text-sm flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Loading…</div>;
  if (!detail) return <div className="p-8 text-white/30 text-sm">No data available</div>;

  const handleStatusToggle = async () => {
    const isCurrentlyActive = detail.subscription?.status !== "SUSPENDED";
    try {
      await updateStatus({ id: orgId, isActive: !isCurrentlyActive });
      toast.success(isCurrentlyActive ? "Organization suspended" : "Organization activated");
    } catch {
      toast.error("Failed to update status");
    }
  };

  return (
    <div className="space-y-5">
      {/* Org Info Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-white/5 bg-white/3 p-5 space-y-4">
          <h4 className="text-xs font-black uppercase tracking-widest text-white/30">Organization Info</h4>
          {[
            { label: "Name", value: detail.name },
            { label: "Domain", value: detail.domain || "—" },
            { label: "Created", value: new Date(detail.created_at).toLocaleDateString() },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between items-center">
              <span className="text-[11px] text-white/35">{label}</span>
              <span className="text-[12px] font-bold text-white/70">{value}</span>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-white/5 bg-white/3 p-5 space-y-4">
          <h4 className="text-xs font-black uppercase tracking-widest text-white/30">Subscription</h4>
          {[
            { label: "Plan", value: detail.subscription?.plan || "NONE" },
            { label: "Status", value: detail.subscription?.status || "—" },
            { label: "Stripe Customer", value: detail.subscription?.stripe_customer_id || "—" },
            { label: "Renews", value: detail.subscription?.current_period_end ? new Date(detail.subscription.current_period_end).toLocaleDateString() : "—" },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between items-center">
              <span className="text-[11px] text-white/35">{label}</span>
              <span className="text-[12px] font-bold text-white/70 max-w-[160px] truncate text-right">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Health */}
      <div className="rounded-2xl border border-white/5 bg-white/3 p-5">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-xs font-black uppercase tracking-widest text-white/30">Platform Health</h4>
          <span className={`text-2xl font-black tabular-nums ${(detail.health?.score || 0) >= 80 ? "text-emerald-400" : "text-amber-400"}`}>
            {detail.health?.score ?? 100}%
          </span>
        </div>
        <div className="h-2 rounded-full bg-white/5 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-700"
            style={{ width: `${detail.health?.score ?? 100}%` }}
          />
        </div>
        {detail.health?.warnings?.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {detail.health.warnings.map((w: string, i: number) => (
              <div key={i} className="flex items-center gap-2 text-[11px] text-amber-400">
                <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                {w}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Usage */}
      {usage && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Active Events", value: usage.active_events_count, icon: Calendar },
            { label: "Active Users", value: usage.active_users_count, icon: Users2 },
            { label: "Registrations", value: usage.total_registrations_count, icon: BarChart3 },
            { label: "Storage Used", value: formatBytes(usage.storage_used_bytes), icon: HardDrive },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-xl border border-white/5 bg-white/3 p-4">
              <Icon className="w-4 h-4 text-violet-400 mb-2" />
              <p className="text-[10px] text-white/30 font-medium">{label}</p>
              <p className="text-xl font-black text-white/80 tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleStatusToggle}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/20 bg-red-500/5 text-sm font-bold text-red-400 hover:bg-red-500/10 transition-all"
        >
          <ShieldOff className="w-4 h-4" />
          {detail.subscription?.status === "SUSPENDED" ? "Activate Organization" : "Suspend Organization"}
        </button>
      </div>
    </div>
  );
}

// ── Timeline Tab ──────────────────────────────────────────────

function TimelineTab({ orgId }: { orgId: string }) {
  const { data: events = [], isLoading } = useAdminOrgTimeline(orgId);

  if (isLoading) return <div className="p-8 text-white/30 text-sm flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Loading timeline…</div>;

  if (!events.length) return <div className="p-8 text-center text-white/20 text-sm">No timeline events yet</div>;

  return (
    <div className="space-y-3">
      {events.map((event) => (
        <div key={event.id} className="flex items-start gap-4 group">
          <div className="w-2 h-2 rounded-full bg-violet-400 mt-2 flex-shrink-0" />
          <div className="flex-1 rounded-xl border border-white/5 bg-white/3 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-bold text-white/70">{event.action_type.replace(/_/g, " ")}</span>
              <span className="text-[10px] text-white/25 font-mono">
                {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
              </span>
            </div>
            {event.metadata && Object.keys(event.metadata).length > 0 && (
              <pre className="text-[10px] text-white/25 font-mono mt-1 overflow-x-auto">
                {JSON.stringify(event.metadata, null, 2)}
              </pre>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Features Tab ──────────────────────────────────────────────

function FeaturesTab({ orgId }: { orgId: string }) {
  const { data: features = [], isLoading } = useAdminOrgFeatures(orgId);
  const { mutate: overrideFeature } = useOverrideFeature(orgId);

  if (isLoading) return <div className="p-8 text-white/30 text-sm flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Loading features…</div>;

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-white/30 font-medium">
        Toggle individual feature entitlements for this organization. Overrides take precedence over plan.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {features.map((f) => (
          <div key={f.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/3 px-4 py-3">
            <div>
              <p className="text-[12px] font-bold text-white/70">{f.name}</p>
              <p className="text-[10px] text-white/30 font-mono">{f.key}</p>
              {f.is_addon && (
                <span className="text-[9px] text-amber-400 font-bold uppercase">ADDON</span>
              )}
            </div>
            <button
              onClick={() => overrideFeature({ featureId: f.id, isEnabled: !f.is_enabled })}
              className={`relative w-10 h-5 rounded-full transition-all duration-200 ${f.is_enabled ? "bg-violet-500" : "bg-white/10"}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200 ${f.is_enabled ? "left-5" : "left-0.5"}`} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tabs Configuration ────────────────────────────────────────

const TABS = [
  { id: "overview", label: "Overview", icon: Building2 },
  { id: "audit", label: "Audit Trail", icon: Activity },
  { id: "features", label: "Features", icon: ShieldCheck },
];

// ── Main Component ────────────────────────────────────────────

export default function OrgDetailPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("overview");
  const { data: detail } = useAdminOrgDetail(orgId);

  return (
    <div className="space-y-5 animate-in fade-in duration-500">

      {/* Back + Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/super-admin/organizations")}
          className="p-2 rounded-xl hover:bg-white/5 text-white/30 hover:text-white transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500/30 to-purple-500/20 border border-violet-500/20 flex items-center justify-center text-[14px] font-black text-violet-300">
            {detail?.name?.[0] || "?"}
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight">{detail?.name || "Loading…"}</h1>
            <p className="text-[11px] text-white/30 font-mono">{orgId}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/5 pb-0">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-[12px] font-bold transition-all border-b-2 -mb-px ${
                isActive
                  ? "text-violet-400 border-violet-400"
                  : "text-white/30 border-transparent hover:text-white/60"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === "overview" && <OverviewTab orgId={orgId} />}
        {activeTab === "audit" && <TimelineTab orgId={orgId} />}
        {activeTab === "features" && <FeaturesTab orgId={orgId} />}
      </div>
    </div>
  );
}
