import type { ReactNode } from "react";
import { AlertTriangle, Inbox, LockKeyhole, RefreshCw, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type StateTone = "neutral" | "danger" | "restricted";

interface AsyncStateProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  tone?: StateTone;
  action?: { label: string; onClick: () => void };
  children?: ReactNode;
  className?: string;
}

const toneStyles: Record<StateTone, string> = {
  neutral: "border-[var(--border-subtle)] bg-[var(--bg-surface)]",
  danger: "border-[var(--status-danger)]/30 bg-[var(--status-danger-muted)]",
  restricted: "border-[var(--status-warning)]/30 bg-[var(--status-warning-muted)]",
};

export function AsyncState({
  title,
  description,
  icon: Icon = Inbox,
  tone = "neutral",
  action,
  children,
  className,
}: AsyncStateProps) {
  return (
    <section
      aria-live={tone === "danger" ? "assertive" : "polite"}
      className={cn(
        "flex min-h-72 flex-col items-center justify-center rounded-[var(--radius-panel)] border px-6 py-12 text-center",
        toneStyles[tone],
        className,
      )}
    >
      <span className="mb-5 grid size-12 place-items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)]">
        <Icon aria-hidden className="size-5 text-[var(--text-secondary)]" />
      </span>
      <h2 className="text-lg font-semibold tracking-[-0.02em] text-[var(--text-primary)]">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-[var(--text-secondary)]">{description}</p>
      {action && (
        <Button className="mt-6" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
      {children}
    </section>
  );
}

export function RecoverableError(props: Omit<AsyncStateProps, "icon" | "tone">) {
  return <AsyncState {...props} icon={AlertTriangle} tone="danger" />;
}

export function PermissionDenied(props: Omit<AsyncStateProps, "icon" | "tone">) {
  return <AsyncState {...props} icon={LockKeyhole} tone="restricted" />;
}

export function RetryState(props: Omit<AsyncStateProps, "icon">) {
  return <AsyncState {...props} icon={RefreshCw} />;
}
