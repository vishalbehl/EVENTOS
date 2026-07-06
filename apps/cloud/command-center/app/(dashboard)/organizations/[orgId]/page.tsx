"use client";

import { useState, useMemo, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useAdminOrgDetail,
  useAdminOrgUsage,
  useAdminOrgTimeline,
  useOrgFeatureOverrides,
  useUpdateOrgStatus,
  useSaveFeatureOverrides,
  useOrgLimits,
  useOrgDomains,
  useOrgEvents,
  useUpdateOrgLimits,
  useAddOrgDomain,
  useDeleteOrgDomain,
  useVerifyOrgDomain,
  useUpdateOrgDetail,
  adminApi,
  useSubscriptionPlans,
  adminKeys,
} from "@/services/super-admin-service";
import { useAuthStore } from "@/store/use-auth-store";
import {
  Building2, ArrowLeft, Activity, ShieldCheck, CreditCard, Users2, Calendar,
  Settings, RefreshCw, AlertTriangle, CheckCircle2, HardDrive, ShieldOff,
  User, Send, MoreHorizontal, Plus, ShieldCheck as VerifiedIcon, Trash2,
  Lock, Globe, Key, Bell, Shield, Layers, HelpCircle, Download
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ── Helper functions ──────────────────────────────────────────

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const gb = bytes / (1024 ** 3);
  const mb = bytes / (1024 ** 2);
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${bytes.toLocaleString()} B`;
}

function formatINR(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

// ── Top Navigation Tabs Configuration ──────────────────────────

const MAIN_TABS = [
  { id: "overview", label: "Overview", icon: Building2 },
  { id: "billing", label: "Billing & Invoices", icon: CreditCard },
  { id: "users", label: "Team Members", icon: Users2 },
  { id: "events", label: "Hosted Events", icon: Calendar },
  { id: "audit", label: "Audit Ledger", icon: Activity },
  { id: "settings", label: "Settings Console", icon: Settings },
];

// ── Settings Sub-Sidebar Navigation Configuration ─────────────

const SETTINGS_SUB_TABS = [
  { id: "general", label: "General Settings", icon: Building2, desc: "Manage name, slug, logo and basic details" },
  { id: "features", label: "Feature Overrides", icon: ShieldCheck, desc: "Configure custom feature entitlements" },
  { id: "limits", label: "Tenant Limits", icon: Layers, desc: "Adjust numerical quotas and limits" },
  { id: "domains", label: "Custom Domains", icon: Globe, desc: "Configure white-labeled custom domains" },
  { id: "integrations", label: "Integrations", icon: Key, desc: "Payment gateways and credentials" },
  { id: "notifications", label: "Notifications", icon: Bell, desc: "System notifications and webhooks" },
];

// ── Overview Tab Component ─────────────────────────────────────

function OverviewTab({ orgId }: { orgId: string }) {
  const { data: detail, isLoading: detailLoading } = useAdminOrgDetail(orgId);
  const { data: usage } = useAdminOrgUsage(orgId);
  const { data: timeline = [] } = useAdminOrgTimeline(orgId);

  if (detailLoading) {
    return (
      <div className="p-8 text-[var(--text-tertiary)] text-xs flex items-center gap-2 animate-pulse">
        <RefreshCw className="w-4 h-4 animate-spin" /> Loading tenant analytics...
      </div>
    );
  }

  if (!detail) return <div className="p-8 text-white/30 text-xs">No detail data found</div>;

  const score = detail.health?.score ?? 100;
  const healthColor = score >= 80 ? "text-emerald-400" : score >= 50 ? "text-amber-400" : "text-red-400";
  const strokeColor = score >= 80 ? "#10B981" : score >= 50 ? "#F59E0B" : "#EF4444";

  // Calculate percentage progress indicators safely
  const activeEventsCount = usage?.active_events_count || 0;
  const maxEvents = detail.max_events || 1;
  const activeUsersCount = usage?.active_users_count || 0;
  const maxUsers = detail.max_users || 1;
  const storageUsedBytes = usage?.storage_used_bytes || 0;
  const maxStorageBytes = (detail.max_storage_gb || 10) * 1024 * 1024 * 1024;
  const totalRegistrationsCount = usage?.total_registrations_count || 0;
  const maxRegistrations = 50000; // Mock limit default

  return (
    <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
      {/* Left Column (60%): Context Cards */}
      <div className="lg:col-span-6 space-y-6">
        {/* Info Card */}
        <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-border/40 pb-2">
            <Building2 className="w-4 h-4 text-indigo-400" />
            <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">Organization Context</h4>
          </div>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <p className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] tracking-wider">Tenant Name</p>
              <p className="font-bold text-[var(--text-primary)] mt-1">{detail.name}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] tracking-wider">Domain Slug</p>
              <p className="font-mono font-bold text-indigo-400 mt-1">{detail.slug}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] tracking-wider">Custom Domain</p>
              <p className="font-bold text-[var(--text-primary)] mt-1">{detail.domain || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] tracking-wider">Created Date</p>
              <p className="font-bold text-[var(--text-secondary)] mt-1">
                {new Date(detail.created_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}
              </p>
            </div>
          </div>
        </div>

        {/* Subscription Summary */}
        <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-border/40 pb-2">
            <CreditCard className="w-4 h-4 text-indigo-400" />
            <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">Subscription Details</h4>
          </div>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <p className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] tracking-wider">Billing Tier</p>
              <Badge className="bg-indigo-600/10 border-indigo-500/20 text-indigo-400 hover:bg-indigo-600/10 font-bold mt-1.5 uppercase">
                {detail.subscription?.plan || "NONE"}
              </Badge>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] tracking-wider">Lifecycle Status</p>
              <div className="mt-1">
                <Badge variant="outline" className={cn(
                  "font-bold uppercase",
                  detail.subscription?.status === "ACTIVE" 
                    ? "border-emerald-500/20 text-emerald-400 bg-emerald-500/5" 
                    : "border-amber-500/20 text-amber-400 bg-amber-500/5"
                )}>
                  {detail.subscription?.status || "TRIAL"}
                </Badge>
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] tracking-wider">Stripe Customer ID</p>
              <p className="font-mono font-bold text-[var(--text-secondary)] mt-1 truncate" title={detail.subscription?.stripe_customer_id || ""}>
                {detail.subscription?.stripe_customer_id || "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] tracking-wider">Next Invoice Renewal</p>
              <p className="font-bold text-[var(--text-secondary)] mt-1">
                {detail.subscription?.current_period_end 
                  ? new Date(detail.subscription.current_period_end).toLocaleDateString("en-IN", { dateStyle: "medium" })
                  : "—"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column (40%): Analytics & Health */}
      <div className="lg:col-span-4 space-y-6">
        {/* Health Radial Score Card */}
        <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">Platform Health</h4>
            <p className={cn("text-lg font-black tracking-tight", healthColor)}>
              {score >= 80 ? "Excellent" : score >= 50 ? "Stable Warnings" : "Needs Review"}
            </p>
            <p className="text-[10px] text-[var(--text-tertiary)]">+8 points versus last 30 days</p>
          </div>

          {/* Circle Gauge SVG */}
          <div className="relative w-20 h-20">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              <path
                className="text-surface-2"
                stroke="currentColor"
                strokeWidth="3.5"
                fill="none"
                d="M18 2.0845
                  a 15.9155 15.9155 0 0 1 0 31.831
                  a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                stroke={strokeColor}
                strokeDasharray={`${score}, 100`}
                strokeWidth="3.5"
                strokeLinecap="round"
                fill="none"
                d="M18 2.0845
                  a 15.9155 15.9155 0 0 1 0 31.831
                  a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-xs font-black font-mono text-[var(--text-primary)]">
              {score}%
            </div>
          </div>
        </div>

        {/* Resource Allocation Meters */}
        <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-border/40 pb-2">
            <HardDrive className="w-4 h-4 text-indigo-400" />
            <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">Allocations & Usage</h4>
          </div>

          <div className="space-y-3">
            {/* Events Usage */}
            <div className="space-y-1 text-xs">
              <div className="flex justify-between items-center font-mono">
                <span className="font-semibold text-[var(--text-secondary)]">Active Events</span>
                <span className="font-bold text-[var(--text-primary)]">{activeEventsCount} / {maxEvents}</span>
              </div>
              <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (activeEventsCount / maxEvents) * 100)}%` }}
                />
              </div>
            </div>

            {/* Users Usage */}
            <div className="space-y-1 text-xs">
              <div className="flex justify-between items-center font-mono">
                <span className="font-semibold text-[var(--text-secondary)]">Active Users</span>
                <span className="font-bold text-[var(--text-primary)]">{activeUsersCount} / {maxUsers}</span>
              </div>
              <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (activeUsersCount / maxUsers) * 100)}%` }}
                />
              </div>
            </div>

            {/* Registrations Usage */}
            <div className="space-y-1 text-xs">
              <div className="flex justify-between items-center font-mono">
                <span className="font-semibold text-[var(--text-secondary)]">Registrations</span>
                <span className="font-bold text-[var(--text-primary)]">{totalRegistrationsCount} / {maxRegistrations.toLocaleString()}</span>
              </div>
              <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                <div
                  className="h-full bg-teal-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (totalRegistrationsCount / maxRegistrations) * 100)}%` }}
                />
              </div>
            </div>

            {/* Storage Usage */}
            <div className="space-y-1 text-xs">
              <div className="flex justify-between items-center font-mono">
                <span className="font-semibold text-[var(--text-secondary)]">Storage Capacity</span>
                <span className="font-bold text-[var(--text-primary)]">{formatBytes(storageUsedBytes)} / {formatBytes(maxStorageBytes)}</span>
              </div>
              <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (storageUsedBytes / maxStorageBytes) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Billing Tab Component ──────────────────────────────────────

function BillingTab({ orgId }: { orgId: string }) {
  const { data: detail } = useAdminOrgDetail(orgId);

  // Fetch invoices using apiClient directly
  const { data: invoicesData, isLoading: invoicesLoading } = useQuery({
    queryKey: ["admin", "invoices", orgId],
    queryFn: () => adminApi.getInvoices({ org_id: orgId }),
    enabled: !!orgId,
  });

  const invoices = invoicesData?.items || [];

  return (
    <div className="space-y-6">
      {/* Subscription Card */}
      <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-border/40 pb-2">
          <CreditCard className="w-4 h-4 text-indigo-400" />
          <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">Billing Subscription Details</h4>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
          <div className="space-y-1.5">
            <span className="text-[10px] uppercase font-bold text-[var(--text-tertiary)]">Current Tier</span>
            <p className="text-sm font-black text-[var(--text-primary)] uppercase">{detail?.subscription?.plan || "TRIAL"}</p>
          </div>
          <div className="space-y-1.5">
            <span className="text-[10px] uppercase font-bold text-[var(--text-tertiary)]">Stripe Customer ID</span>
            <p className="text-sm font-mono font-bold text-indigo-400">{detail?.subscription?.stripe_customer_id || "—"}</p>
          </div>
          <div className="space-y-1.5">
            <span className="text-[10px] uppercase font-bold text-[var(--text-tertiary)]">Expiry or Renewal Date</span>
            <p className="text-sm font-bold text-[var(--text-secondary)]">
              {detail?.subscription?.current_period_end
                ? new Date(detail.subscription.current_period_end).toLocaleDateString("en-IN", { dateStyle: "long" })
                : "—"}
            </p>
          </div>
        </div>
      </div>

      {/* Invoices List */}
      <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-border/40 pb-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">Invoices History</h4>
          </div>
          <span className="text-[10px] font-extrabold text-[var(--text-tertiary)] font-mono uppercase">
            {invoices.length} invoices found
          </span>
        </div>

        {invoicesLoading ? (
          <div className="py-8 text-center text-xs text-[var(--text-tertiary)] flex items-center justify-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Fetching ledger...
          </div>
        ) : invoices.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl p-8 text-center text-xs text-[var(--text-tertiary)] bg-surface-2/10">
            No invoicing history recorded for this organization.
          </div>
        ) : (
          <div className="border border-border/60 rounded-xl overflow-hidden bg-surface-2/10">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="bg-surface border-b border-border font-extrabold text-[var(--text-tertiary)] uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Invoice ID</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-medium text-[var(--text-secondary)]">
                {invoices.map((inv: any) => (
                  <tr key={inv.id} className="hover:bg-surface-hover/20 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-indigo-400">{inv.id.slice(0, 12)}...</td>
                    <td className="px-4 py-3">
                      {new Date(inv.created_at || inv.timestamp).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-[var(--text-primary)]">
                      {formatINR(inv.amount_inr || inv.amount || 0)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={cn(
                        "font-extrabold text-[9px] uppercase tracking-wide",
                        inv.status === "PAID"
                          ? "border-emerald-500/20 text-emerald-400 bg-emerald-500/5"
                          : "border-red-500/20 text-red-400 bg-red-500/5"
                      )}>
                        {inv.status || "PAID"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="outline" size="sm" className="h-7 text-[10px] rounded-lg border-border hover:bg-surface-hover">
                        <Download className="w-3 h-3 mr-1" /> PDF
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Users Tab Component ────────────────────────────────────────

function UsersTab({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();

  // Query global users from platform catalog
  const { data: usersData, isLoading: usersLoading, refetch } = useQuery({
    queryKey: ["admin", "global-users", orgId],
    queryFn: () => adminApi.getGlobalUsers({ org_id: orgId }),
    enabled: !!orgId,
  });

  const users = usersData?.items || [];

  // Reset 2FA mutation
  const reset2FAMutation = useMutation({
    mutationFn: (userId: string) => adminApi.reset2FA(userId),
    onSuccess: () => {
      toast.success("2FA credentials successfully reset");
      refetch();
    },
    onError: () => {
      toast.error("Failed to reset 2FA settings");
    }
  });

  const handleImpersonateUser = async (user: any) => {
    try {
      const impRes = await adminApi.impersonateUser(user.id, {
        reason: `Super admin impersonation support session. Target User: ${user.first_name} ${user.last_name}`,
      });

      useAuthStore.getState().startImpersonation(
        {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          role: user.role as any,
          organization_id: user.organization_id,
          is_platform_admin: user.is_platform_admin,
          platform_role: user.platform_role,
        },
        impRes.access_token,
        user.organization_name || "Enterprise User",
        `${user.first_name} ${user.last_name}`
      );

      toast.success(`Active support impersonation started for ${user.first_name}`);
      window.open("/", "_blank");
    } catch {
      toast.error("Failed to establish impersonation session");
    }
  };

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-border/40 pb-2">
        <div className="flex items-center gap-2">
          <Users2 className="w-4 h-4 text-indigo-400" />
          <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">Team Members</h4>
        </div>
        <span className="text-[10px] font-extrabold text-[var(--text-tertiary)] font-mono uppercase">
          {users.length} members
        </span>
      </div>

      {usersLoading ? (
        <div className="py-8 text-center text-xs text-[var(--text-tertiary)] flex items-center justify-center gap-2 animate-pulse">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Fetching membership list...
        </div>
      ) : users.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl p-8 text-center text-xs text-[var(--text-tertiary)] bg-surface-2/10">
          No team members registered for this organization.
        </div>
      ) : (
        <div className="border border-border/60 rounded-xl overflow-hidden bg-surface-2/10">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-surface border-b border-border font-extrabold text-[var(--text-tertiary)] uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Member Info</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Last Login</th>
                <th className="px-4 py-3">2FA Status</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 font-medium text-[var(--text-secondary)]">
              {users.map((user: any) => (
                <tr key={user.id} className="hover:bg-surface-hover/20 transition-colors">
                  <td className="px-4 py-3 flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-indigo-500/30 to-purple-500/20 border border-indigo-500/20 flex items-center justify-center text-[10px] font-black text-indigo-300 uppercase shrink-0">
                      {user.first_name?.[0] || "?"}
                    </div>
                    <div>
                      <p className="font-bold text-[var(--text-primary)]">{user.first_name} {user.last_name}</p>
                      <p className="text-[10px] text-[var(--text-tertiary)] font-mono">{user.email}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 uppercase tracking-wider font-extrabold text-[9px] text-[var(--text-secondary)]">
                    {user.role}
                  </td>
                  <td className="px-4 py-3 font-mono text-[10px] text-[var(--text-tertiary)]">
                    {user.last_login_at
                      ? new Date(user.last_login_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })
                      : "Never"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={cn(
                      "font-extrabold text-[9px] uppercase",
                      user.is_2fa_enabled
                        ? "border-emerald-500/20 text-emerald-400 bg-emerald-500/5"
                        : "border-border text-[var(--text-tertiary)]"
                    )}>
                      {user.is_2fa_enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={cn(
                      "font-extrabold text-[9px] uppercase",
                      user.is_active
                        ? "border-emerald-500/20 text-emerald-400 bg-emerald-500/5"
                        : "border-red-500/20 text-red-400 bg-red-500/5"
                    )}>
                      {user.is_active ? "Active" : "Suspended"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right space-x-1.5">
                    {user.is_2fa_enabled && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={reset2FAMutation.isPending}
                        onClick={() => reset2FAMutation.mutate(user.id)}
                        className="h-7 text-[10px] rounded-lg border-border hover:bg-red-500/10 hover:text-red-400 transition-colors"
                        title="Reset Two-Factor Authentication"
                      >
                        <Lock className="w-3 h-3 mr-1" /> Reset 2FA
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleImpersonateUser(user)}
                      className="h-7 text-[10px] rounded-lg border-border hover:bg-orange-500/10 hover:text-orange-400 transition-colors"
                    >
                      <User className="w-3 h-3 mr-1" /> Impersonate
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Events Tab Component ───────────────────────────────────────

function EventsTab({ orgId }: { orgId: string }) {
  const { data: events = [], isLoading } = useOrgEvents(orgId);

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-border/40 pb-2">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-indigo-400" />
          <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">Hosted Events</h4>
        </div>
        <span className="text-[10px] font-extrabold text-[var(--text-tertiary)] font-mono uppercase">
          {events.length} events
        </span>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-xs text-[var(--text-tertiary)] flex items-center justify-center gap-2 animate-pulse">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Fetching event directory...
        </div>
      ) : events.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl p-8 text-center text-xs text-[var(--text-tertiary)] bg-surface-2/10">
          No events created yet.
        </div>
      ) : (
        <div className="border border-border/60 rounded-xl overflow-hidden bg-surface-2/10">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-surface border-b border-border font-extrabold text-[var(--text-tertiary)] uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Event Name</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Schedule Duration</th>
                <th className="px-4 py-3">Registrations</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 font-medium text-[var(--text-secondary)]">
              {events.map((e: any) => (
                <tr key={e.id} className="hover:bg-surface-hover/20 transition-colors">
                  <td className="px-4 py-3 font-bold text-[var(--text-primary)]">{e.name}</td>
                  <td className="px-4 py-3 font-mono text-indigo-400 font-bold">{e.short_code}</td>
                  <td className="px-4 py-3 font-mono text-[10px] text-[var(--text-tertiary)]">
                    {e.start_date ? new Date(e.start_date).toLocaleDateString("en-IN", { dateStyle: "short" }) : "—"}
                    {" → "}
                    {e.end_date ? new Date(e.end_date).toLocaleDateString("en-IN", { dateStyle: "short" }) : "—"}
                  </td>
                  <td className="px-4 py-3 font-bold font-mono text-[var(--text-primary)]">
                    {e.registration_count?.toLocaleString() || 0}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={cn(
                      "font-extrabold text-[9px] uppercase",
                      e.status === "active"
                        ? "border-emerald-500/20 text-emerald-400 bg-emerald-500/5"
                        : e.status === "completed"
                        ? "border-blue-500/20 text-blue-400 bg-blue-500/5"
                        : "border-border text-[var(--text-tertiary)]"
                    )}>
                      {e.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Settings Console Tab Component (Sidebar + Content Panels) ──

function SettingsTab({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const [activeSubTab, setActiveSubTab] = useState("general");

  // General Settings States & API Mutations
  const { data: detail } = useAdminOrgDetail(orgId);
  const updateOrgDetailMutation = useUpdateOrgDetail(orgId);

  const [name, setName] = useState(detail?.name || "");
  const [slug, setSlug] = useState(detail?.slug || "");
  const [timezone, setTimezone] = useState(detail?.timezone || "Asia/Kolkata");
  const [country, setCountry] = useState(detail?.country || "IN");

  useEffect(() => {
    if (detail) {
      setName(detail.name || "");
      setSlug(detail.slug || "");
      setTimezone(detail.timezone || "Asia/Kolkata");
      setCountry(detail.country || "IN");
    }
  }, [detail]);

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !slug) {
      toast.error("Name and slug are required fields");
      return;
    }
    try {
      await updateOrgDetailMutation.mutateAsync({ name, slug, timezone, country });
      toast.success("Organization details updated successfully");
    } catch {
      toast.error("Failed to update organization details");
    }
  };

  // Limits overrides & API mutations
  const { data: limitOverrides = {} } = useOrgLimits(orgId);
  const updateLimitsMutation = useUpdateOrgLimits(orgId);
  const [localLimits, setLocalLimits] = useState<Record<string, number>>({});

  useEffect(() => {
    if (limitOverrides) {
      setLocalLimits(limitOverrides);
    }
  }, [limitOverrides]);

  const handleUpdateLimit = (key: string, value: number) => {
    setLocalLimits(prev => ({ ...prev, [key]: value }));
  };

  const handleSaveLimits = async () => {
    try {
      await updateLimitsMutation.mutateAsync(localLimits);
      toast.success("Numerical quotas and limits updated successfully");
    } catch {
      toast.error("Failed to update limits");
    }
  };

  // Custom Domains & API mutations
  const { data: domains = [], refetch: refetchDomains } = useOrgDomains(orgId);
  const addDomainMutation = useAddOrgDomain(orgId);
  const deleteDomainMutation = useDeleteOrgDomain(orgId);
  const verifyDomainMutation = useVerifyOrgDomain(orgId);

  const [newDomain, setNewDomain] = useState("");

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomain.trim()) return;
    try {
      await addDomainMutation.mutateAsync(newDomain);
      toast.success("Domain mapping added");
      setNewDomain("");
      refetchDomains();
    } catch {
      toast.error("Failed to add domain mapping");
    }
  };

  const handleDeleteDomain = async (id: string) => {
    try {
      await deleteDomainMutation.mutateAsync(id);
      toast.success("Domain mapping removed");
      refetchDomains();
    } catch {
      toast.error("Failed to remove domain mapping");
    }
  };

  const handleVerifyDomain = async (id: string) => {
    try {
      await verifyDomainMutation.mutateAsync(id);
      toast.success("Domain successfully verified and activated!");
      refetchDomains();
      queryClient.invalidateQueries({ queryKey: adminKeys.orgDetail(orgId) });
    } catch {
      toast.error("Failed to verify domain mapping");
    }
  };

  // Feature overrides Matrix states
  const { data: features = [], refetch: refetchFeatures } = useOrgFeatureOverrides(orgId);
  const saveOverrides = useSaveFeatureOverrides();
  const [dirty, setDirty] = useState<Record<string, boolean | null>>({});

  const handleFeatureSelectChange = (featureId: string, val: string) => {
    const overrideVal = val === "plan" ? null : val === "enabled" ? true : false;
    setDirty(prev => {
      const updated = { ...prev, [featureId]: overrideVal };
      const original = features.find((f: any) => f.feature_id === featureId);
      if (original && original.override === overrideVal) {
        delete updated[featureId];
      }
      return updated;
    });
  };

  const handleSaveOverrides = async () => {
    const payload = Object.entries(dirty).map(([featureId, val]) => ({
      feature_id: featureId,
      override: val,
    }));

    try {
      await saveOverrides.mutateAsync({ orgId, overrides: payload });
      toast.success("Feature override configuration saved");
      setDirty({});
      refetchFeatures();
    } catch {
      toast.error("Failed to save feature override changes");
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
      {/* Left Column (30% / 3 spans): Left Vertical Sidebar Navigation */}
      <div className="lg:col-span-3 space-y-1 bg-surface border border-border rounded-2xl p-3 shadow-sm h-fit">
        {SETTINGS_SUB_TABS.map((subTab) => {
          const Icon = subTab.icon;
          const isActive = activeSubTab === subTab.id;

          return (
            <button
              key={subTab.id}
              onClick={() => setActiveSubTab(subTab.id)}
              className={cn(
                "w-full flex items-start gap-3 px-3.5 py-3 rounded-xl transition-all duration-150 text-left group",
                isActive 
                  ? "bg-indigo-600 text-white shadow-sm" 
                  : "text-[var(--text-secondary)] hover:bg-surface-hover/30 hover:text-[var(--text-primary)]"
              )}
            >
              <Icon className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-bold">{subTab.label}</p>
                <p className={cn(
                  "text-[9px] line-clamp-1 mt-0.5",
                  isActive ? "text-indigo-200" : "text-[var(--text-tertiary)]"
                )}>
                  {subTab.desc}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Right Column (70% / 7 spans): Content Panel */}
      <div className="lg:col-span-7 bg-surface border border-border rounded-2xl p-5 shadow-sm min-h-[450px]">
        {/* SUB TAB: GENERAL */}
        {activeSubTab === "general" && (
          <form onSubmit={handleSaveGeneral} className="space-y-4">
            <div className="border-b border-border/40 pb-2 flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">General Settings</h4>
              <Button
                type="submit"
                disabled={updateOrgDetailMutation.isPending}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl h-8 px-4"
              >
                {updateOrgDetailMutation.isPending ? "Saving..." : "Save Details"}
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="col-span-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">Organization Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full rounded-xl bg-surface-2 border border-border px-3.5 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">Domain Slug *</label>
                <input
                  type="text"
                  value={slug}
                  onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-"))}
                  className="w-full rounded-xl bg-surface-2 border border-border px-3.5 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">System Timezone</label>
                <input
                  type="text"
                  value={timezone}
                  onChange={e => setTimezone(e.target.value)}
                  className="w-full rounded-xl bg-surface-2 border border-border px-3.5 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">Region Country (ISO)</label>
                <input
                  type="text"
                  value={country}
                  onChange={e => setCountry(e.target.value.toUpperCase())}
                  maxLength={2}
                  className="w-full rounded-xl bg-surface-2 border border-border px-3.5 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500 text-center font-bold"
                />
              </div>
            </div>
          </form>
        )}

        {/* SUB TAB: FEATURES */}
        {activeSubTab === "features" && (
          <div className="space-y-4">
            <div className="border-b border-border/40 pb-2 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">Feature Entitlements</h4>
                <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">Overrides will directly affect organizer and portal permissions.</p>
              </div>
              {Object.keys(dirty).length > 0 && (
                <Button
                  onClick={handleSaveOverrides}
                  disabled={saveOverrides.isPending}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl h-8 px-4"
                >
                  {saveOverrides.isPending ? "Saving..." : "Save Overrides"}
                </Button>
              )}
            </div>

            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
              {features.map((f: any) => {
                const currentValue = f.feature_id in dirty ? dirty[f.feature_id] : f.override;
                const isEffectiveEnabled = currentValue !== null ? currentValue : f.plan_default;

                return (
                  <div key={f.feature_id} className="flex flex-col justify-between rounded-xl border border-border bg-surface-2/20 p-4 gap-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold text-[var(--text-primary)]">{f.feature_name}</p>
                        </div>
                        <p className="text-[9px] text-[var(--text-tertiary)] font-mono mt-0.5">{f.feature_key}</p>
                        {f.description && <p className="text-[10px] text-[var(--text-secondary)] mt-1">{f.description}</p>}
                      </div>
                      <Badge variant="outline" className={cn(
                        "font-extrabold text-[9px] uppercase tracking-wide",
                        isEffectiveEnabled 
                          ? "border-emerald-500/20 text-emerald-400 bg-emerald-500/5" 
                          : "border-border text-[var(--text-tertiary)]"
                      )}>
                        {isEffectiveEnabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between border-t border-border/40 pt-2.5 mt-1 text-xs">
                      <span className="text-[9px] font-extrabold text-[var(--text-tertiary)] uppercase tracking-wider">Override Entitlement</span>
                      <select
                        value={currentValue === null ? "plan" : currentValue ? "enabled" : "disabled"}
                        onChange={e => handleFeatureSelectChange(f.feature_id, e.target.value)}
                        className="bg-surface border border-border rounded-lg px-2.5 py-1 text-[11px] font-medium text-[var(--text-primary)] focus:outline-none focus:border-indigo-500 cursor-pointer"
                      >
                        <option value="plan">Inherit Plan Default ({f.plan_default ? "Enabled" : "Disabled"})</option>
                        <option value="enabled">Force Enabled</option>
                        <option value="disabled">Force Disabled</option>
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SUB TAB: LIMITS */}
        {activeSubTab === "limits" && (
          <div className="space-y-4">
            <div className="border-b border-border/40 pb-2 flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">Tenant Resource Quotas</h4>
              <Button
                onClick={handleSaveLimits}
                disabled={updateLimitsMutation.isPending}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl h-8 px-4"
              >
                {updateLimitsMutation.isPending ? "Saving..." : "Save Quotas"}
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">Max Active Events</label>
                <input
                  type="number"
                  value={localLimits.max_events ?? 3}
                  onChange={e => handleUpdateLimit("max_events", parseInt(e.target.value) || 1)}
                  className="w-full rounded-xl bg-surface-2 border border-border px-3.5 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">Max User Registry</label>
                <input
                  type="number"
                  value={localLimits.max_users ?? 10}
                  onChange={e => handleUpdateLimit("max_users", parseInt(e.target.value) || 1)}
                  className="w-full rounded-xl bg-surface-2 border border-border px-3.5 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">Object Storage Quota (GB)</label>
                <input
                  type="number"
                  value={localLimits.max_storage_gb ?? 10}
                  onChange={e => handleUpdateLimit("max_storage_gb", parseInt(e.target.value) || 1)}
                  className="w-full rounded-xl bg-surface-2 border border-border px-3.5 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">Max Ticket Registrations</label>
                <input
                  type="number"
                  value={localLimits.max_registrations ?? 10000}
                  onChange={e => handleUpdateLimit("max_registrations", parseInt(e.target.value) || 1)}
                  className="w-full rounded-xl bg-surface-2 border border-border px-3.5 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">Max Meeting Rooms</label>
                <input
                  type="number"
                  value={localLimits.max_rooms ?? 5}
                  onChange={e => handleUpdateLimit("max_rooms", parseInt(e.target.value) || 1)}
                  className="w-full rounded-xl bg-surface-2 border border-border px-3.5 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">Max Event Speakers</label>
                <input
                  type="number"
                  value={localLimits.max_speakers ?? 30}
                  onChange={e => handleUpdateLimit("max_speakers", parseInt(e.target.value) || 1)}
                  className="w-full rounded-xl bg-surface-2 border border-border px-3.5 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* SUB TAB: DOMAINS */}
        {activeSubTab === "domains" && (
          <div className="space-y-4 text-xs">
            <div className="border-b border-border/40 pb-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">Custom Whitelabel Domains</h4>
              <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">Route custom domain mappings directly to the tenant portal.</p>
            </div>

            {/* Add Domain Form */}
            <form onSubmit={handleAddDomain} className="flex gap-3">
              <input
                type="text"
                value={newDomain}
                onChange={e => setNewDomain(e.target.value)}
                placeholder="e.g. conference.mydomain.com"
                className="flex-1 rounded-xl bg-surface-2 border border-border px-3.5 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500"
              />
              <Button
                type="submit"
                disabled={addDomainMutation.isPending}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs px-4"
              >
                Add Mapping
              </Button>
            </form>

            {/* Domains Table */}
            {domains.length === 0 ? (
              <div className="border border-dashed border-border rounded-xl p-6 text-center text-xs text-[var(--text-tertiary)]">
                No custom domains mapped yet.
              </div>
            ) : (
              <div className="border border-border/60 rounded-xl overflow-hidden bg-surface-2/10">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="bg-surface border-b border-border font-extrabold text-[var(--text-tertiary)] uppercase">
                    <tr>
                      <th className="px-4 py-2.5">Domain</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40 font-medium">
                    {domains.map((dom: any) => (
                      <tr key={dom.id} className="hover:bg-surface-hover/20 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-indigo-400">{dom.domain}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={cn(
                            "font-extrabold text-[8px] uppercase",
                            dom.is_verified
                              ? "border-emerald-500/20 text-emerald-400 bg-emerald-500/5"
                              : "border-amber-500/20 text-amber-400 bg-amber-500/5"
                          )}>
                            {dom.is_verified ? "Verified" : "Pending DNS Check"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right space-x-1.5">
                          {!dom.is_verified && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={verifyDomainMutation.isPending}
                              onClick={() => handleVerifyDomain(dom.id)}
                              className="h-7 text-[10px] rounded-lg border-border hover:bg-emerald-500/10 hover:text-emerald-400"
                            >
                              <ShieldCheck className="w-3 h-3 mr-1" /> Verify
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={deleteDomainMutation.isPending}
                            onClick={() => handleDeleteDomain(dom.id)}
                            className="h-7 text-[10px] rounded-lg border-border hover:bg-red-500/10 hover:text-red-400"
                          >
                            <Trash2 className="w-3 h-3 mr-1" /> Delete
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* SUB TAB: INTEGRATIONS */}
        {activeSubTab === "integrations" && (
          <div className="space-y-5 text-xs">
            <div className="border-b border-border/40 pb-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">Platform Gateways & Integrations</h4>
              <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">Toggle and configure system connection states.</p>
            </div>

            <div className="space-y-4">
              {/* Stripe Payment Gateway */}
              <div className="flex justify-between items-center bg-surface-2/20 border border-border/60 rounded-xl p-4">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-[var(--text-primary)]">Stripe Connect Checkout</p>
                  <p className="text-[10px] text-[var(--text-tertiary)]">Process user tickets payments and payouts via Stripe Connect.</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-extrabold uppercase bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">Connected</span>
                  <Switch checked={true} disabled />
                </div>
              </div>

              {/* Razorpay Integration */}
              <div className="flex justify-between items-center bg-surface-2/20 border border-border/60 rounded-xl p-4">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-[var(--text-primary)]">Razorpay Payment API</p>
                  <p className="text-[10px] text-[var(--text-tertiary)]">Indian payment gateway integrations for domestic tickets transaction.</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-extrabold uppercase bg-border border border-border text-[var(--text-tertiary)] px-2 py-0.5 rounded">Disabled</span>
                  <Switch checked={false} />
                </div>
              </div>

              {/* WhatsApp Broadcasts */}
              <div className="flex justify-between items-center bg-surface-2/20 border border-border/60 rounded-xl p-4">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-[var(--text-primary)]">WhatsApp Notification Channel</p>
                  <p className="text-[10px] text-[var(--text-tertiary)]">Send automated tickets, updates, and templates via WhatsApp API.</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-extrabold uppercase bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">Connected</span>
                  <Switch checked={true} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SUB TAB: NOTIFICATIONS */}
        {activeSubTab === "notifications" && (
          <div className="space-y-5 text-xs">
            <div className="border-b border-border/40 pb-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">Notification Preferences</h4>
              <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">Control platform webhooks and alerts preferences.</p>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center bg-surface-2/20 border border-border/60 rounded-xl p-4">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-[var(--text-primary)]">Email Webhook Webhooks</p>
                  <p className="text-[10px] text-[var(--text-tertiary)]">Alert super-admins of critical billing and lifecycle status events.</p>
                </div>
                <Switch defaultChecked />
              </div>

              <div className="flex justify-between items-center bg-surface-2/20 border border-border/60 rounded-xl p-4">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-[var(--text-primary)]">Audit Timelines Logging</p>
                  <p className="text-[10px] text-[var(--text-tertiary)]">Track security modifications and log audit items on changes.</p>
                </div>
                <Switch defaultChecked />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────

export default function OrgDetailPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("overview");

  const { data: detail } = useAdminOrgDetail(orgId);
  const { mutateAsync: updateStatus } = useUpdateOrgStatus();

  const handleImpersonateOwner = async () => {
    if (!orgId || !detail) return;
    try {
      const res = await adminApi.getGlobalUsers({ org_id: orgId, limit: 10 });
      const owner = res.items.find((u) => u.role === "owner" || u.role === "admin") || res.items[0];
      if (!owner) {
        toast.error("No active user found in this organization to impersonate");
        return;
      }

      const impRes = await adminApi.impersonateUser(owner.id, {
        reason: `Super admin impersonation support session. Target Owner: ${owner.first_name} ${owner.last_name}`,
      });

      useAuthStore.getState().startImpersonation(
        {
          id: owner.id,
          email: owner.email,
          first_name: owner.first_name,
          last_name: owner.last_name,
          role: owner.role as any,
          organization_id: owner.organization_id,
          is_platform_admin: owner.is_platform_admin,
          platform_role: owner.platform_role,
        },
        impRes.access_token,
        detail.name,
        `${owner.first_name} ${owner.last_name}`
      );

      toast.success(`Active impersonation started for ${owner.first_name}`);
      window.open("/", "_blank");
    } catch {
      toast.error("Failed to establish impersonation session");
    }
  };

  const handleStatusToggle = async () => {
    if (!detail) return;
    const isCurrentlyActive = detail.subscription?.status !== "SUSPENDED";
    try {
      await updateStatus({ id: orgId, isActive: !isCurrentlyActive });
      toast.success(isCurrentlyActive ? "Organization suspended" : "Organization activated");
    } catch {
      toast.error("Failed to update status");
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-surface border border-border rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/organizations")}
            className="p-2.5 rounded-xl hover:bg-surface-hover/30 border border-border text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500/30 to-purple-500/20 border border-indigo-500/20 flex items-center justify-center text-[14px] font-black text-indigo-300">
              {detail?.name?.[0] || "?"}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black text-[var(--text-primary)] tracking-tight">{detail?.name || "Loading..."}</h1>
                <Badge variant="outline" className={cn(
                  "font-bold text-[9px] uppercase",
                  detail?.subscription?.status === "ACTIVE" 
                    ? "border-emerald-500/20 text-emerald-400 bg-emerald-500/5" 
                    : "border-border text-[var(--text-tertiary)]"
                )}>
                  {detail?.subscription?.status || "TRIAL"}
                </Badge>
                <Badge variant="outline" className="border-indigo-500/20 text-indigo-400 bg-indigo-500/5 font-bold text-[9px] uppercase">
                  {detail?.subscription?.plan || "NONE"}
                </Badge>
              </div>
              <p className="text-[10px] text-[var(--text-tertiary)] font-mono mt-0.5">{orgId}</p>
            </div>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2 self-end sm:self-center">
          <Button
            variant="outline"
            onClick={handleImpersonateOwner}
            className="text-xs rounded-xl h-9 border-border font-bold flex items-center gap-1.5"
          >
            <User className="w-3.5 h-3.5" />
            Impersonate Owner
          </Button>
          <Button
            variant="outline"
            className="text-xs rounded-xl h-9 border-border font-bold flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            Send Message
          </Button>
          <Button
            variant="outline"
            onClick={handleStatusToggle}
            className="text-xs rounded-xl h-9 border-border font-bold flex items-center gap-1.5 hover:bg-red-500/10 hover:text-red-400"
          >
            <ShieldOff className="w-3.5 h-3.5" />
            {detail?.subscription?.status === "SUSPENDED" ? "Activate" : "Suspend"}
          </Button>
        </div>
      </div>

      {/* Top Navigation Tab Bar */}
      <div className="flex gap-1 border-b border-border/40 pb-0">
        {MAIN_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-xs font-extrabold uppercase tracking-wider transition-all border-b-2 -mb-px",
                isActive
                  ? "text-indigo-500 border-indigo-500"
                  : "text-[var(--text-tertiary)] border-transparent hover:text-[var(--text-secondary)]"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Active Tab Panel Content */}
      <div className="py-2">
        {activeTab === "overview" && <OverviewTab orgId={orgId} />}
        {activeTab === "billing" && <BillingTab orgId={orgId} />}
        {activeTab === "users" && <UsersTab orgId={orgId} />}
        {activeTab === "events" && <EventsTab orgId={orgId} />}
        {activeTab === "audit" && <TimelineTab orgId={orgId} />}
        {activeTab === "settings" && <SettingsTab orgId={orgId} />}
      </div>
    </div>
  );
}

// ── Reused Timeline Tab Component ──────────────────────────────

function TimelineTab({ orgId }: { orgId: string }) {
  const { data: events = [], isLoading } = useAdminOrgTimeline(orgId);

  if (isLoading) {
    return (
      <div className="p-8 text-[var(--text-tertiary)] text-xs flex items-center gap-2 animate-pulse">
        <RefreshCw className="w-4 h-4 animate-spin" /> Loading timeline history...
      </div>
    );
  }

  if (!events.length) {
    return (
      <div className="border border-dashed border-border rounded-xl p-8 text-center text-xs text-[var(--text-tertiary)] bg-surface-2/10">
        No timeline events recorded yet.
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm space-y-4">
      <div className="border-b border-border/40 pb-2 flex items-center gap-2">
        <Activity className="w-4 h-4 text-indigo-400" />
        <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">Audit Trail Timeline</h4>
      </div>

      <div className="space-y-4 pr-1">
        {events.map((event) => (
          <div key={event.id} className="flex items-start gap-4 group">
            <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 mt-2 flex-shrink-0" />
            <div className="flex-1 rounded-xl border border-border/60 bg-surface-2/20 px-4 py-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-[var(--text-primary)] uppercase tracking-wide">
                  {event.action_type.replace(/_/g, " ")}
                </span>
                <span className="text-[10px] text-[var(--text-tertiary)] font-mono">
                  {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
                </span>
              </div>
              {event.metadata && Object.keys(event.metadata).length > 0 && (
                <pre className="text-[10px] text-[var(--text-tertiary)] font-mono mt-2 overflow-x-auto bg-surface-2 p-2 rounded-lg border border-border/40">
                  {JSON.stringify(event.metadata, null, 2)}
                </pre>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
