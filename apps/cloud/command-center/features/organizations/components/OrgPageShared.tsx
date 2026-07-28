"use client";

import { cn } from "@/lib/utils";
import { LucideIcon, RefreshCw } from "lucide-react";
import { ReactNode } from "react";

// ── OrgPageHeader ─────────────────────────────────────────────

interface OrgPageHeaderProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actions?: ReactNode;
  generatedAt?: string | null;
}

export function OrgPageHeader({ icon: Icon, title, description, actions, generatedAt }: OrgPageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/20 flex items-center justify-center flex-shrink-0">
          <Icon className="w-4.5 h-4.5 text-[var(--brand-primary)]" />
        </div>
        <div>
          <h1 className="text-lg font-black text-[var(--text-primary)]">{title}</h1>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{description}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {generatedAt && (
          <span className="text-[10px] font-mono text-[var(--text-tertiary)] hidden md:block">
            Updated {new Date(generatedAt).toLocaleTimeString()}
          </span>
        )}
        {actions}
      </div>
    </div>
  );
}

// ── OrgMetricCard ─────────────────────────────────────────────

interface OrgMetricCardProps {
  label: string;
  value: string | number | null | undefined;
  sub?: string;
  trend?: string;
  trendPositive?: boolean;
  unit?: string | null;
}

export function OrgMetricCard({ label, value, sub, trend, trendPositive, unit }: OrgMetricCardProps) {
  return (
    <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{label}</p>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-2xl font-black tabular-nums text-[var(--text-primary)]">
          {value == null ? "—" : value}
        </span>
        {unit && <span className="text-xs text-[var(--text-tertiary)]">{unit}</span>}
      </div>
      {(sub || trend) && (
        <div className="mt-1.5 flex items-center gap-2">
          {sub && <span className="text-[10px] text-[var(--text-tertiary)]">{sub}</span>}
          {trend && (
            <span
              className={cn(
                "text-[10px] font-bold",
                trendPositive === true
                  ? "text-[var(--status-success)]"
                  : trendPositive === false
                  ? "text-[var(--status-danger)]"
                  : "text-[var(--text-tertiary)]"
              )}
            >
              {trend}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── OrgSectionTitle ───────────────────────────────────────────

export function OrgSectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[10px] font-black uppercase tracking-[0.15em] text-[var(--text-tertiary)] mb-3">
      {children}
    </h2>
  );
}

// ── OrgCard ───────────────────────────────────────────────────

export function OrgCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5", className)}>
      {children}
    </div>
  );
}

// ── OrgTabBar ─────────────────────────────────────────────────

interface OrgTabBarProps {
  tabs: { key: string; label: string }[];
  active: string;
  onChange: (key: string) => void;
}

export function OrgTabBar({ tabs, active, onChange }: OrgTabBarProps) {
  return (
    <div className="flex gap-1 bg-[var(--bg-surface-3)] rounded-xl p-1 mb-5 w-fit">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
            active === tab.key
              ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ── OrgDataTable ──────────────────────────────────────────────

interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  width?: string;
}

interface OrgDataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  keyFn: (row: T) => string;
  emptyMessage?: string;
  isLoading?: boolean;
}

export function OrgDataTable<T>({ columns, rows, keyFn, emptyMessage = "No data available", isLoading }: OrgDataTableProps<T>) {
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] overflow-hidden">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 border-b border-[var(--border-subtle)] px-4 animate-pulse bg-[var(--bg-surface-3)]/30" />
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[var(--border-default)] bg-[var(--bg-surface-3)]/50">
            {columns.map((col) => (
              <th
                key={col.key}
                style={col.width ? { width: col.width } : undefined}
                className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-wider text-[var(--text-tertiary)]"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-[var(--text-tertiary)] text-xs">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={keyFn(row)}
                className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-surface-3)]/40 transition-colors"
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3">
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Status Badge ──────────────────────────────────────────────

export function OrgStatusBadge({ status }: { status: string }) {
  const statusUpper = status?.toUpperCase() || "";
  const config: Record<string, { label: string; className: string }> = {
    ACTIVE: { label: "Active", className: "bg-[var(--status-success-muted)] text-[var(--status-success)]" },
    INACTIVE: { label: "Inactive", className: "bg-[var(--bg-surface-3)] text-[var(--text-tertiary)]" },
    SUSPENDED: { label: "Suspended", className: "bg-[var(--status-danger-muted)] text-[var(--status-danger)]" },
    PENDING: { label: "Pending", className: "bg-[var(--status-warning-muted)] text-[var(--status-warning)]" },
    CONNECTED: { label: "Connected", className: "bg-[var(--status-success-muted)] text-[var(--status-success)]" },
    DISCONNECTED: { label: "Disconnected", className: "bg-[var(--bg-surface-3)] text-[var(--text-tertiary)]" },
    ENABLED: { label: "Enabled", className: "bg-[var(--status-success-muted)] text-[var(--status-success)]" },
    DISABLED: { label: "Disabled", className: "bg-[var(--bg-surface-3)] text-[var(--text-tertiary)]" },
    READY: { label: "Ready", className: "bg-[var(--status-success-muted)] text-[var(--status-success)]" },
    IN_PROGRESS: { label: "In Progress", className: "bg-[var(--status-info-muted)] text-[var(--status-info)]" },
    FAILED: { label: "Failed", className: "bg-[var(--status-danger-muted)] text-[var(--status-danger)]" },
    COMPLETED: { label: "Completed", className: "bg-[var(--status-success-muted)] text-[var(--status-success)]" },
  };
  const c = config[statusUpper] ?? {
    label: status || "Unknown",
    className: "bg-[var(--bg-surface-3)] text-[var(--text-secondary)]",
  };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold", c.className)}>
      {c.label}
    </span>
  );
}

// ── UnavailableDomain ─────────────────────────────────────────

export function UnavailableDomain({ reason }: { reason?: string | null }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <div className="w-12 h-12 rounded-2xl bg-[var(--status-warning-muted)] border border-[var(--status-warning)]/20 flex items-center justify-center">
        <RefreshCw className="w-5 h-5 text-[var(--status-warning)]" />
      </div>
      <p className="text-sm font-bold text-[var(--text-primary)]">Data not available</p>
      <p className="text-xs text-[var(--text-tertiary)] max-w-xs text-center">
        {reason || "This workspace does not have any data to display yet."}
      </p>
    </div>
  );
}

// ── LoadingPage ───────────────────────────────────────────────

export function LoadingPage() {
  return (
    <div className="p-6 space-y-4 animate-pulse">
      <div className="h-8 w-48 rounded-xl bg-[var(--bg-surface-3)]" />
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-[var(--bg-surface-3)]" />
        ))}
      </div>
      <div className="h-64 rounded-2xl bg-[var(--bg-surface-3)]" />
    </div>
  );
}
