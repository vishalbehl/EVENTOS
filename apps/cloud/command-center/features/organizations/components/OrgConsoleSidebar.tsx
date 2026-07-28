"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  Gauge,
  CircleDollarSign,
  Calendar,
  Activity,
  ShieldCheck,
  BadgeCheck,
  ShieldAlert,
  Crown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useOrgConsole } from "@/features/organizations/context/OrgConsoleContext";

interface WorkspaceNavItem {
  key: string;
  label: string;
  icon: any;
  href: (id: string) => string;
  badge?: string;
}

const WORKSPACES: WorkspaceNavItem[] = [
  { key: "overview", label: "Overview", icon: Gauge, href: (id: string) => `/organizations/${id}/overview` },
  { key: "commercial", label: "Commercial", icon: CircleDollarSign, href: (id: string) => `/organizations/${id}/commercial` },
  { key: "events", label: "Events", icon: Calendar, href: (id: string) => `/organizations/${id}/events` },
  { key: "operations", label: "Operations", icon: Activity, href: (id: string) => `/organizations/${id}/operations` },
  { key: "security", label: "Security", icon: ShieldCheck, href: (id: string) => `/organizations/${id}/security` },
  { key: "governance", label: "Governance", icon: BadgeCheck, href: (id: string) => `/organizations/${id}/governance` },
  { key: "internal-admin", label: "Internal Admin", icon: ShieldAlert, href: (id: string) => `/organizations/${id}/internal-admin`, badge: "SUPER ADMIN" },
];

function HealthDot({ status }: { status?: string }) {
  const color =
    status === "HEALTHY"
      ? "bg-[var(--status-success)]"
      : status === "ATTENTION"
      ? "bg-[var(--status-warning)]"
      : status === "CRITICAL"
      ? "bg-[var(--status-danger)]"
      : "bg-[var(--text-tertiary)]";
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}

export function OrgConsoleSidebar() {
  const pathname = usePathname();
  const { orgId, summary, summaryLoading } = useOrgConsole();

  const org = summary?.organization;

  return (
    <aside className="h-full flex flex-col w-[220px] shrink-0 border-r border-[var(--border-default)] bg-[var(--sidebar-bg)]">
      {/* Back to List */}
      <div className="px-3 pt-4 pb-2">
        <Link
          href="/organizations"
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--sidebar-item-hover-bg)] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          All Organizations
        </Link>
      </div>

      {/* Org Header Card */}
      <div className="mx-3 mb-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-3">
        {summaryLoading ? (
          <div className="space-y-2 animate-pulse">
            <div className="w-8 h-8 rounded-lg bg-[var(--bg-surface-3)]" />
            <div className="h-3 w-20 rounded bg-[var(--bg-surface-3)]" />
            <div className="h-2 w-14 rounded bg-[var(--bg-surface-3)]" />
          </div>
        ) : (
          <>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--brand-primary)]/30 to-[var(--brand-secondary)]/20 border border-[var(--brand-primary)]/20 flex items-center justify-center text-[13px] font-black text-[var(--brand-primary)] uppercase mb-2">
              {org?.name?.[0] || "?"}
            </div>
            <p className="text-[12px] font-bold text-[var(--text-primary)] truncate leading-tight">
              {org?.name || "—"}
            </p>
            <p className="text-[10px] text-[var(--text-tertiary)] font-mono truncate mt-0.5">
              {org?.slug || "—"}
            </p>
            <div className="mt-2 flex items-center justify-between">
              {summary?.subscription && (
                <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
                  {summary.subscription.plan_name}
                </span>
              )}
              <div className="flex items-center gap-1">
                <HealthDot status={summary?.health_status} />
                {summary?.health_score != null && (
                  <span className="text-[10px] font-bold text-[var(--text-secondary)]">
                    {summary.health_score}%
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Workspaces List */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-4 space-y-1">
        <p className="text-[9px] font-black uppercase tracking-[0.15em] text-[var(--text-tertiary)] px-2 mb-1.5">
          Workspaces
        </p>
        <div className="space-y-0.5">
          {WORKSPACES.map((item) => {
            const href = item.href(orgId);
            const isActive = pathname === href || pathname.startsWith(href + "/");
            const Icon = item.icon;

            return (
              <Link
                key={item.key}
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[11px] font-bold transition-all",
                  isActive
                    ? "bg-[var(--sidebar-item-active-bg)] text-[var(--text-primary)] shadow-[inset_0_0_0_1px_var(--border-subtle)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--sidebar-item-hover-bg)] hover:text-[var(--text-primary)]"
                )}
              >
                <Icon className={cn("w-4 h-4 shrink-0", isActive ? "text-[var(--brand-primary)]" : "text-[var(--text-tertiary)]")} />
                <span className="truncate flex-1">{item.label}</span>
                {item.badge && (
                  <span className="text-[8px] font-black tracking-wider px-1 py-0.2 rounded bg-[var(--status-danger)]/15 text-[var(--status-danger)]">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}
