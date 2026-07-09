"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function EnterprisePageIntro({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--color-text-muted)]">
          Organizer command surface
        </p>
        <h1 className="text-[34px] font-bold tracking-[-0.05em] text-[var(--color-text-primary)]">
          {title}
        </h1>
        <p className="max-w-2xl text-[14px] leading-6 text-[var(--color-text-secondary)]">
          {subtitle}
        </p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function EnterprisePanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={cn("hex-panel rounded-[28px] overflow-hidden", className)}>{children}</section>;
}

export function EnterpriseStatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <EnterprisePanel className="p-5">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-3 text-[38px] font-bold tracking-[-0.06em] text-[var(--color-text-primary)]">{value}</p>
      <p className="mt-2 text-[12px] text-[var(--color-text-muted)]">{hint}</p>
    </EnterprisePanel>
  );
}

export function EnterpriseEmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
  actionOnClick,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel: string;
  actionHref?: string;
  actionOnClick?: () => void;
}) {
  const action = <Button onClick={actionOnClick}>{actionLabel}</Button>;

  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-6 flex h-24 w-24 items-center justify-center">
        <div className="hex-icon-shell flex h-16 w-16 items-center justify-center">
          <Icon className="h-8 w-8 text-[var(--color-text-primary)]" />
        </div>
      </div>
      <h2 className="text-[28px] font-bold tracking-[-0.04em] text-[var(--color-text-primary)]">{title}</h2>
      <p className="mt-3 max-w-md text-[14px] leading-6 text-[var(--color-text-secondary)]">{description}</p>
      <div className="mt-6">
        {actionHref ? <Link href={actionHref}>{action}</Link> : action}
      </div>
    </div>
  );
}

export function EnterpriseChecklist({
  title,
  items,
}: {
  title: string;
  items: Array<{ title: string; description: string; icon: LucideIcon }>;
}) {
  return (
    <EnterprisePanel className="p-6">
      <h3 className="text-[16px] font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">{title}</h3>
      <div className="mt-5 space-y-3">
        {items.map((item) => (
          <div key={item.title} className="rounded-[18px] border border-[var(--color-border)] bg-white/[0.02] px-4 py-4">
            <div className="flex items-start gap-4">
              <div className="hex-icon-shell mt-0.5 flex h-10 w-10 items-center justify-center">
                <item.icon className="h-5 w-5 text-[var(--color-text-primary)]" />
              </div>
              <div>
                <p className="text-[14px] font-semibold text-[var(--color-text-primary)]">{item.title}</p>
                <p className="mt-1 text-[13px] leading-5 text-[var(--color-text-secondary)]">{item.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </EnterprisePanel>
  );
}

export function EnterpriseStepRail({
  title,
  steps,
}: {
  title: string;
  steps: Array<{ title: string; description: string; icon: LucideIcon }>;
}) {
  return (
    <EnterprisePanel className="p-6">
      <h3 className="text-[16px] font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">{title}</h3>
      <div className="mt-6 grid gap-6 md:grid-cols-4">
        {steps.map((step, index) => (
          <div key={step.title} className="relative text-center md:text-left">
            {index < steps.length - 1 ? (
              <div className="absolute left-1/2 top-7 hidden h-px w-[calc(100%-2rem)] bg-[var(--color-border)] md:block" />
            ) : null}
            <div className="relative flex justify-center md:justify-start">
              <div className="hex-icon-shell flex h-14 w-14 items-center justify-center">
                <step.icon className="h-6 w-6 text-[var(--color-text-primary)]" />
              </div>
            </div>
            <p className="mt-4 text-[13px] font-semibold text-[var(--color-text-primary)]">
              {index + 1}. {step.title}
            </p>
            <p className="mt-2 text-[12px] leading-5 text-[var(--color-text-secondary)]">{step.description}</p>
          </div>
        ))}
      </div>
    </EnterprisePanel>
  );
}

export function EnterprisePlanCard({
  title,
  audience,
  price,
  cta,
  featured = false,
}: {
  title: string;
  audience: string;
  price: string;
  cta: string;
  featured?: boolean;
}) {
  return (
    <EnterprisePanel
      className={cn(
        "p-6",
        featured ? "border-[rgba(224,255,0,0.28)] shadow-[0_14px_34px_rgba(224,255,0,0.10)]" : ""
      )}
    >
      <p className="text-[18px] font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">{title}</p>
      <p className="mt-2 text-[13px] text-[var(--color-text-secondary)]">{audience}</p>
      <p className="mt-8 text-[32px] font-bold tracking-[-0.05em] text-[var(--color-text-primary)]">{price}</p>
      <Button variant={featured ? "default" : "outline"} className="mt-8 h-11 w-full rounded-xl text-[12px] font-semibold">
        {cta}
      </Button>
    </EnterprisePanel>
  );
}
