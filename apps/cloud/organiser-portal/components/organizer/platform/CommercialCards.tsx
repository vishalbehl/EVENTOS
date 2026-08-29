"use client";

import { ArrowDown, ArrowUp, Check, Crown, Layers3, MapPin, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PlanActionVariant = "choose" | "upgrade" | "downgrade" | "current";

type CommercialPlan = {
  id: string;
  name: string;
  tagline?: string;
  description?: string;
  priceLabel: string;
  colorHex?: string;
  isPopular?: boolean;
  subscribersLabel?: string;
  isActive?: boolean;
  highlights: string[];
};

type CommercialAddon = {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  type: "PLAN" | "VENUE";
  billingUnit: string;
  hardwareCount?: number;
  staffCount?: number;
  targetsLabel?: string;
  accessLabel?: string;
  priceLabel: string;
  priceUnit?: string;
  isActive?: boolean;
};

type TemplateTile = {
  id: string;
  name: string;
  description?: string;
  categoryLabel: string;
  coverageLabel: string;
  imageUrl?: string;
};

export function CommercialPlanCard({
  plan,
  index,
  actionLabel,
  actionVariant = "choose",
  secondaryLabel,
  onAction,
  onSecondaryAction,
  isCurrentPlan,
}: {
  plan: CommercialPlan;
  index: number;
  actionLabel?: string;
  actionVariant?: PlanActionVariant;
  secondaryLabel?: string;
  onAction?: () => void;
  onSecondaryAction?: () => void;
  isCurrentPlan?: boolean;
}) {
  const Icon = index === 0 ? Layers3 : index === 1 ? Sparkles : Crown;

  const resolvedLabel = actionLabel ?? {
    choose: "Choose Plan",
    upgrade: "Upgrade",
    downgrade: "Downgrade",
    current: "Active Plan",
  }[actionVariant];

  const ActionIcon =
    actionVariant === "upgrade"
      ? ArrowUp
      : actionVariant === "downgrade"
      ? ArrowDown
      : actionVariant === "current"
      ? Check
      : null;

  const buttonClassName = cn(
    "h-11 flex-1 gap-2 rounded-lg text-[12px] font-semibold",
    actionVariant === "current" &&
      "cursor-default border-[color-mix(in_srgb,var(--op-success)_30%,var(--op-border))] bg-[color-mix(in_srgb,var(--op-success)_8%,var(--op-panel-bg))] text-[var(--op-success)]",
    actionVariant === "upgrade" &&
      "bg-[var(--op-primary)] text-white hover:opacity-90",
    actionVariant === "downgrade" &&
      "border-[var(--op-border)] bg-[var(--op-panel-soft)] text-[var(--op-muted)] hover:border-[var(--op-primary)]"
  );

  return (
    <article
      className={cn(
        "relative flex min-h-[480px] flex-col overflow-hidden rounded-lg border bg-[var(--op-panel-bg)]",
        plan.isPopular && "border-[var(--op-primary)]",
        isCurrentPlan && "border-[var(--op-success)]"
      )}
      style={{ borderColor: isCurrentPlan ? "var(--op-success)" : undefined }}
    >
      <div className="relative flex flex-1 flex-col p-6">
        {/* Popular badge */}
        {plan.isPopular && !isCurrentPlan ? (
          <span className="absolute right-5 top-5 rounded-full border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-[var(--text-primary)]">
            Recommended
          </span>
        ) : null}

        {/* Active badge */}
        {isCurrentPlan ? (
          <span className="absolute right-5 top-5 rounded-full border border-[var(--op-success)] bg-[color-mix(in_srgb,var(--op-success)_10%,var(--op-panel-bg))] px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-[var(--op-success)]">
            Current Plan
          </span>
        ) : null}

        {/* Icon */}
        <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--op-border)] bg-[var(--op-panel-soft)] text-[var(--op-primary)]">
          <Icon className="h-5 w-5" />
        </div>

        <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[var(--text-tertiary)]">
          Tier {String(index + 1).padStart(2, "0")}
        </p>
        <h2 className="mt-1.5 text-2xl font-semibold text-[var(--text-primary)]">{plan.name}</h2>
        <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
          {plan.tagline || plan.description || "A configurable enterprise service tier."}
        </p>

        <div className="my-4 border-y border-[var(--border-default)] py-4">
          <span className="font-mono text-2xl font-bold text-[var(--text-primary)]">{plan.priceLabel}</span>
        </div>

        <ul className="space-y-3">
          {plan.highlights.map((item) => (
            <li key={item} className="flex items-center gap-2.5 text-xs text-[var(--text-secondary)]">
              <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-[var(--text-primary)]">
                <Check className="h-3 w-3" />
              </span>
              {item}
            </li>
          ))}
        </ul>

        <div className="mt-auto flex gap-2 pt-5">
          <Button
            onClick={actionVariant === "current" ? undefined : onAction}
            disabled={actionVariant === "current"}
            variant={actionVariant === "upgrade" ? "default" : "outline"}
            className={buttonClassName}
          >
            {ActionIcon ? <ActionIcon className="h-3.5 w-3.5" /> : null}
            {resolvedLabel}
          </Button>
          {secondaryLabel ? (
            <Button
              onClick={onSecondaryAction}
              variant="outline"
              className="h-11 flex-1 rounded-lg border-[var(--op-border)] bg-transparent text-[12px] font-semibold text-[var(--op-text)] hover:bg-[var(--op-panel-soft)]"
            >
              {secondaryLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function CommercialAddonCard({
  addon,
  onAction,
  actionLabel,
  selected,
  onDetails,
}: {
  addon: CommercialAddon;
  onAction?: () => void;
  actionLabel?: string;
  selected?: boolean;
  onDetails?: () => void;
}) {
  const isVenue = addon.type === "VENUE";

  return (
    <article
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-lg border",
        selected
          ? "border-[var(--op-success)] bg-[var(--op-panel-bg)]"
          : "border-[var(--op-border)] bg-[var(--op-panel-bg)]"
      )}
    >
      <div className="relative h-52 overflow-hidden border-b border-[var(--op-border)] bg-[var(--op-panel-soft)]">
        {addon.imageUrl ? (
          <img src={addon.imageUrl} alt={addon.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[var(--op-panel-soft)]">
            {isVenue ? <MapPin className="h-8 w-8 text-[var(--op-muted)]" /> : <Layers3 className="h-8 w-8 text-[var(--op-muted)]" />}
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 border-t border-[var(--op-border)] bg-[var(--op-panel-bg)] px-4 py-3 text-[var(--op-text)]">
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-full border border-[var(--op-border)] bg-[var(--op-panel-soft)] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.2em]">
              {isVenue ? "Venue package" : "Plan extension"}
            </span>
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.2em]",
                addon.isActive === false ? "bg-[var(--op-panel-soft)] text-[var(--op-muted)]" : "bg-[var(--op-success)] text-black"
              )}
            >
              {addon.isActive === false ? "Draft" : "Active"}
            </span>
          </div>
          <h3 className="mt-3 truncate text-lg font-semibold">{addon.name}</h3>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="line-clamp-2 min-h-10 text-xs leading-5 text-[var(--text-secondary)]">
          {addon.description || "Commercial add-on with optional capacity and service coverage."}
        </p>

        <div className="mt-3 grid grid-cols-3 border-y border-[var(--border-default)] py-3">
          <StatBlock label="Billing" value={addon.billingUnit.replaceAll("_", " ")} />
          <StatBlock label="Hardware" value={String(addon.hardwareCount || 0)} withBorder />
          <StatBlock label="Staff" value={String(addon.staffCount || 0)} withBorder />
        </div>

        <div className="mt-4 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[9px] uppercase text-[var(--text-tertiary)]">{isVenue ? "Price range" : "Commercial range"}</div>
            <div className="mt-1 truncate text-lg font-semibold text-[var(--text-primary)]">
              {addon.priceLabel}
              {addon.priceUnit ? (
                <span className="text-xs font-normal text-[var(--text-tertiary)] lowercase"> / {addon.priceUnit}</span>
              ) : null}
            </div>
          </div>
          {selected && <Check className="h-4 w-4 text-[var(--op-success)]" />}
        </div>

        {addon.targetsLabel ? (
          <div className="mt-3 min-h-6">
            <p className="line-clamp-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
              {addon.targetsLabel}
            </p>
          </div>
        ) : null}

        <div className={cn("mt-auto flex gap-2", "pt-4")}>
          <Button
            onClick={onAction}
            variant={selected ? "default" : "outline"}
            className={cn(
              "h-10 flex-1 gap-1.5 rounded-lg text-xs font-semibold",
              selected
                ? "border-[var(--op-success)] bg-[color-mix(in_srgb,var(--op-success)_10%,var(--op-panel-bg))] text-[var(--op-success)]"
                : "border-[var(--op-border)]"
            )}
          >
            {selected ? (
              <>
                <Check className="h-3.5 w-3.5" /> Selected
              </>
            ) : (
              actionLabel || "Choose Add-on"
            )}
          </Button>
          {onDetails ? (
            <Button
              onClick={onDetails}
              variant="outline"
              className="h-10 flex-1 rounded-lg border-[var(--op-border)] bg-transparent text-xs font-semibold text-[var(--op-text)] hover:bg-[var(--op-panel-soft)]"
            >
              Details
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function TemplateRecommendationCard({
  template,
  ctaLabel,
  onAction,
  onDetails,
}: {
  template: TemplateTile;
  ctaLabel: string;
  onAction?: () => void;
  onDetails?: () => void;
}) {
  return (
    <article className="overflow-hidden rounded-lg border border-[var(--op-border)] bg-[var(--op-panel-bg)]">
      <div className="relative h-48 overflow-hidden border-b border-[var(--op-border)] bg-[var(--op-panel-soft)]">
        {template.imageUrl ? (
          <img src={template.imageUrl} alt={template.name} className="h-full w-full object-cover" />
        ) : null}
        <div className="absolute inset-x-0 bottom-0 border-t border-[var(--op-border)] bg-[var(--op-panel-bg)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--op-muted)]">
            {template.categoryLabel}
          </p>
          <h3 className="mt-2 text-[20px] font-semibold text-[var(--op-text)]">{template.name}</h3>
        </div>
      </div>
      <div className="p-5">
        <p className="text-[13px] leading-6 text-[var(--text-secondary)]">
          {template.description || "Operational template sized from your current venue answers."}
        </p>
        <div className="mt-4 rounded-lg border border-[var(--op-border)] bg-[var(--op-panel-soft)] px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
            Coverage
          </p>
          <p className="mt-2 text-[13px] font-semibold text-[var(--text-primary)]">{template.coverageLabel}</p>
        </div>
        <div className="mt-5 flex gap-2">
          <Button onClick={onAction} variant="outline" className="h-10 flex-1 rounded-lg text-xs font-semibold">
            {ctaLabel}
          </Button>
          {onDetails ? (
            <Button
              onClick={onDetails}
              variant="outline"
              className="h-10 flex-1 rounded-lg border-[var(--op-border)] bg-transparent text-xs font-semibold text-[var(--op-text)] hover:bg-[var(--op-panel-soft)]"
            >
              Details
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function StatBlock({
  label,
  value,
  withBorder = false,
}: {
  label: string;
  value: string;
  withBorder?: boolean;
}) {
  return (
    <div className={cn("min-w-0 px-1 text-center", withBorder ? "border-l border-[var(--border-default)]" : "")}>
      <div className="truncate text-[9px] text-[var(--text-tertiary)]">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-[var(--text-primary)]">{value}</div>
    </div>
  );
}
