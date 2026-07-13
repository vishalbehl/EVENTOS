import { AlertTriangle, CheckCircle2, CircleDashed, Info, XCircle, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type OperationalTone = "success" | "info" | "warning" | "danger" | "neutral";

interface OperationalStatusRailProps {
  tone: OperationalTone;
  label: string;
  title: string;
  description?: string;
  meta?: string;
  action?: React.ReactNode;
  className?: string;
}

const styles: Record<OperationalTone, { rail: string; surface: string; icon: LucideIcon }> = {
  success: {
    rail: "bg-[var(--status-success)]",
    surface: "bg-[var(--status-success-muted)]",
    icon: CheckCircle2,
  },
  info: {
    rail: "bg-[var(--status-info)]",
    surface: "bg-[var(--status-info-muted)]",
    icon: Info,
  },
  warning: {
    rail: "bg-[var(--status-warning)]",
    surface: "bg-[var(--status-warning-muted)]",
    icon: AlertTriangle,
  },
  danger: {
    rail: "bg-[var(--status-danger)]",
    surface: "bg-[var(--status-danger-muted)]",
    icon: XCircle,
  },
  neutral: {
    rail: "bg-[var(--text-tertiary)]",
    surface: "bg-[var(--bg-surface-2)]",
    icon: CircleDashed,
  },
};

export function OperationalStatusRail({
  tone,
  label,
  title,
  description,
  meta,
  action,
  className,
}: OperationalStatusRailProps) {
  const config = styles[tone];
  const Icon = config.icon;

  return (
    <section
      aria-label={`${label}: ${title}`}
      className={cn(
        "relative overflow-hidden rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--bg-surface)]",
        className,
      )}
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", config.rail)} />
      <div className="flex flex-col gap-4 p-4 pl-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", config.surface)}>
            <Icon aria-hidden className="size-4 text-[var(--text-primary)]" />
          </span>
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
              {label}
            </p>
            <h3 className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
            {description && <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{description}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3 pl-12 sm:pl-0">
          {meta && <span className="font-mono text-[11px] text-[var(--text-tertiary)]">{meta}</span>}
          {action}
        </div>
      </div>
    </section>
  );
}
