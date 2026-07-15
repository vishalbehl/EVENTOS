import { CheckCircle2, Circle, Clock3, FileKey2, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function ActionToolbar({ children, label = "Page actions", className }: { children: ReactNode; label?: string; className?: string }) {
  return <div role="toolbar" aria-label={label} className={cn("flex w-full flex-wrap items-center gap-2 sm:w-auto", className)}>{children}</div>;
}

export function KpiGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <section aria-label="Key performance indicators" className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4", className)}>{children}</section>;
}

export function AuditPanel({ actor, reason, timestamp, assurance, children, className }: { actor: string; reason: string; timestamp: string; assurance?: string; children?: ReactNode; className?: string }) {
  return (
    <section aria-label="Audit evidence" className={cn("rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-4", className)}>
      <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-secondary)]"><FileKey2 aria-hidden className="size-3.5 text-[var(--status-info)]" />Audit evidence</div>
      <dl className="grid gap-3 text-xs sm:grid-cols-2">
        <div><dt className="text-[var(--text-tertiary)]">Actor</dt><dd className="mt-1 font-medium text-[var(--text-primary)]">{actor}</dd></div>
        <div><dt className="text-[var(--text-tertiary)]">Recorded</dt><dd className="mt-1 font-mono text-[var(--text-primary)]">{timestamp}</dd></div>
        <div className="sm:col-span-2"><dt className="text-[var(--text-tertiary)]">Reason</dt><dd className="mt-1 leading-5 text-[var(--text-primary)]">{reason}</dd></div>
        {assurance ? <div className="sm:col-span-2"><dt className="text-[var(--text-tertiary)]">Session assurance</dt><dd className="mt-1 text-[var(--text-primary)]">{assurance}</dd></div> : null}
      </dl>
      {children}
    </section>
  );
}

export interface TimelineItem {
  id: string;
  title: string;
  description?: string;
  timestamp: string;
  status?: "complete" | "current" | "pending";
  icon?: LucideIcon;
}

export function OperationalTimeline({ items, label = "Activity timeline" }: { items: TimelineItem[]; label?: string }) {
  return (
    <ol aria-label={label} className="space-y-0">
      {items.map((item, index) => {
        const Icon = item.icon || (item.status === "complete" ? CheckCircle2 : item.status === "current" ? Clock3 : Circle);
        return (
          <li key={item.id} className="relative flex gap-3 pb-5 last:pb-0">
            {index < items.length - 1 ? <span aria-hidden className="absolute left-[0.4375rem] top-5 h-[calc(100%-0.5rem)] w-px bg-[var(--border-default)]" /> : null}
            <Icon aria-hidden className={cn("relative z-10 mt-0.5 size-3.5 shrink-0 bg-[var(--bg-surface)]", item.status === "complete" && "text-[var(--status-success)]", item.status === "current" && "text-[var(--status-info)]", (!item.status || item.status === "pending") && "text-[var(--text-tertiary)]")} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-start"><h3 className="text-xs font-semibold text-[var(--text-primary)]">{item.title}</h3><time className="font-mono text-[10px] text-[var(--text-tertiary)]">{item.timestamp}</time></div>
              {item.description ? <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{item.description}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
