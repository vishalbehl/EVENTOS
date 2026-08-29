"use client";

import { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, Clock3, RefreshCw, ServerOff } from "lucide-react";
import { cn } from "@/lib/utils";

export type OperationalState = "healthy" | "degraded" | "offline" | "stale" | "unknown" | "not_configured" | "maintenance" | string;

const STATE_LABELS: Record<string, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  offline: "Offline",
  stale: "Stale",
  unknown: "Unknown",
  not_configured: "Not configured",
  maintenance: "Maintenance",
  active: "Active",
  acknowledged: "Acknowledged",
  resolved: "Resolved",
  failed: "Failed",
  pending: "Pending",
  completed: "Completed",
  synced: "Delivered",
};

export function StatusBadge({ state, evidence }: { state: OperationalState; evidence?: string | null }) {
  const normalized = String(state || "unknown").toLowerCase();
  const tone = normalized === "healthy" || normalized === "completed" || normalized === "synced" || normalized === "resolved"
    ? "ok"
    : normalized === "degraded" || normalized === "stale" || normalized === "pending" || normalized === "acknowledged" || normalized === "maintenance"
      ? "warn"
      : normalized === "offline" || normalized === "failed" || normalized === "critical"
        ? "bad"
        : "neutral";
  const Icon = tone === "ok" ? CheckCircle2 : tone === "warn" ? AlertTriangle : tone === "bad" ? ServerOff : CircleDashed;
  return (
    <span title={evidence || undefined} className={cn("venue-state", `venue-state--${tone}`)}>
      <Icon className="size-3.5" />
      {STATE_LABELS[normalized] || normalized.replaceAll("_", " ")}
    </span>
  );
}

export function PageFrame({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="venue-page">
      <header className="venue-page-header">
        <div className="min-w-0">
          <p className="venue-eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="venue-page-description">{description}</p>
        </div>
        {actions && <div className="venue-page-actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

export function Section({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="venue-section">
      <header className="venue-section-header">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="venue-empty">
      <CircleDashed className="size-5" />
      <div><strong>{title}</strong><p>{detail}</p></div>
    </div>
  );
}

export function LoadingState({ label = "Loading operational evidence" }: { label?: string }) {
  return <div className="venue-loading"><RefreshCw className="size-4 animate-spin" /><span>{label}</span></div>;
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="venue-error">
      <AlertTriangle className="size-5" />
      <div className="min-w-0 flex-1"><strong>Evidence unavailable</strong><p>{message}</p></div>
      {retry && <button className="venue-button venue-button--secondary" onClick={retry}><RefreshCw className="size-4" />Retry</button>}
    </div>
  );
}

export function Metric({ label, value, detail, state }: { label: string; value: ReactNode; detail?: string; state?: OperationalState }) {
  return (
    <div className="venue-metric">
      <div className="venue-metric-label">{label}{state && <StatusBadge state={state} />}</div>
      <div className="venue-metric-value">{value}</div>
      {detail && <p>{detail}</p>}
    </div>
  );
}

export function formatTime(value?: string | null) {
  if (!value) return "Never observed";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

export function formatBytes(value?: number | null) {
  if (value == null) return "Unavailable";
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) { size /= 1024; index += 1; }
  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[index]}`;
}

export function EvidenceTime({ value }: { value?: string | null }) {
  return <span className="venue-evidence-time"><Clock3 className="size-3" />{formatTime(value)}</span>;
}
