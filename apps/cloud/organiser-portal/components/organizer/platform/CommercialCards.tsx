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
  colorHex: string;
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
    "flex-1 h-11 rounded-xl text-[12px] font-semibold gap-2",
    actionVariant === "current" &&
      "border-[rgba(194,245,66,0.3)] bg-[rgba(194,245,66,0.08)] text-[#C2F542] hover:bg-[rgba(194,245,66,0.12)] cursor-default",
    actionVariant === "upgrade" &&
      "bg-[#C2F542] text-black hover:bg-[#d4f75a]",
    actionVariant === "downgrade" &&
      "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
  );

  return (
    <article
      className={cn(
        "relative flex min-h-[560px] flex-col overflow-hidden rounded-[30px] border bg-[var(--bg-surface)] transition-all duration-200 hover:-translate-y-1",
        plan.isPopular && "ring-1 ring-[var(--pri)]/30 dark:ring-[var(--pri)]/20",
        isCurrentPlan && "ring-2 ring-[rgba(194,245,66,0.35)]"
      )}
      style={{
        borderColor: isCurrentPlan ? "rgba(194,245,66,0.3)" : `${plan.colorHex}55`,
        boxShadow: isCurrentPlan
          ? "0 18px 55px -32px rgba(194,245,66,0.25)"
          : `0 18px 55px -32px ${plan.colorHex}`,
      }}
    >
      {/* Gradient shimmer top */}
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[var(--pri)]/5 to-transparent" />

      {isCurrentPlan && (
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#C2F542] to-transparent" />
      )}

      <div className="relative flex flex-1 flex-col p-6">
        {/* Popular badge */}
        {plan.isPopular && !isCurrentPlan ? (
          <span className="absolute right-5 top-5 rounded-full border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-[var(--text-primary)]">
            Recommended
          </span>
        ) : null}

        {/* Active badge */}
        {isCurrentPlan ? (
          <span className="absolute right-5 top-5 rounded-full border border-[rgba(194,245,66,0.3)] bg-[rgba(194,245,66,0.1)] px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-[#C2F542]">
            Current Plan
          </span>
        ) : null}

        {/* Icon */}
        <div className="mb-7 flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-[var(--text-primary)]">
          <Icon className="h-5 w-5" />
        </div>

        <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[var(--text-tertiary)]">
          Tier {String(index + 1).padStart(2, "0")}
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{plan.name}</h2>
        <p className="mt-2 min-h-10 text-sm leading-5 text-[var(--text-secondary)]">
          {plan.tagline || plan.description || "A configurable enterprise service tier."}
        </p>

        <div className="my-6 border-y border-[var(--border-default)] py-5">
          <span className="font-mono text-2xl font-semibold text-[var(--text-primary)]">{plan.priceLabel}</span>
        </div>

        <ul className="space-y-3">
          {plan.highlights.map((item) => (
            <li key={item} className="flex items-center gap-2.5 text-sm text-[var(--text-secondary)]">
              <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-[var(--text-primary)]">
                <Check className="h-3 w-3" />
              </span>
              {item}
            </li>
          ))}
        </ul>

        <div className="mt-auto flex gap-2 pt-7">
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
              className="flex-1 h-11 rounded-xl border-[var(--border-default)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--bg-surface-2)] text-[12px] font-semibold"
            >
              {secondaryLabel}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-[var(--border-default)] bg-[var(--bg-surface-2)]/50 px-6 py-3 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
        <span>{plan.subscribersLabel || "Workspace ready"}</span>
        <span className={plan.isActive === false ? "text-[var(--text-tertiary)]" : "text-[var(--text-primary)]"}>
          {plan.isActive === false ? "Inactive" : "Active"}
        </span>
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
        "group flex h-full flex-col overflow-hidden rounded-[28px] border transition-all duration-200 hover:-translate-y-1",
        selected
          ? "border-[rgba(194,245,66,0.4)] bg-[var(--bg-surface)] ring-1 ring-[rgba(194,245,66,0.2)]"
          : "border-[var(--border-default)] bg-[var(--bg-surface)]"
      )}
    >
      <div className="relative h-52 overflow-hidden bg-black">
        {addon.imageUrl ? (
          <img src={addon.imageUrl} alt={addon.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-800 to-neutral-950 border-b border-[var(--pri)]/10">
            {isVenue ? <MapPin className="h-8 w-8 text-white/70" /> : <Layers3 className="h-8 w-8 text-white/70" />}
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 px-4 pb-4 pt-12 text-white">
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.2em]">
              {isVenue ? "Venue package" : "Plan extension"}
            </span>
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.2em]",
                addon.isActive === false ? "bg-white/10 text-white/55" : "bg-white text-black"
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
          {selected && <Check className="h-4 w-4 text-[#C2F542]" />}
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
              "flex-1 h-10 rounded-xl text-xs font-semibold gap-1.5",
              selected
                ? "bg-[rgba(194,245,66,0.15)] border-[rgba(194,245,66,0.3)] text-[#C2F542] hover:bg-[rgba(194,245,66,0.22)]"
                : "border-[var(--border-default)]"
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
              className="flex-1 h-10 rounded-xl border-[var(--border-default)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--bg-surface-2)] text-xs font-semibold"
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
    <article className="overflow-hidden rounded-[28px] border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <div className="relative h-48 overflow-hidden bg-gradient-to-br from-zinc-800 to-neutral-950 border-b border-[var(--pri)]/10">
        {template.imageUrl ? (
          <img src={template.imageUrl} alt={template.name} className="h-full w-full object-cover" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <div className="absolute bottom-4 left-4 right-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70">
            {template.categoryLabel}
          </p>
          <h3 className="mt-2 text-[20px] font-semibold tracking-[-0.03em] text-white">{template.name}</h3>
        </div>
      </div>
      <div className="p-5">
        <p className="text-[13px] leading-6 text-[var(--text-secondary)]">
          {template.description || "Operational template sized from your current venue answers."}
        </p>
        <div className="mt-4 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
            Coverage
          </p>
          <p className="mt-2 text-[13px] font-semibold text-[var(--text-primary)]">{template.coverageLabel}</p>
        </div>
        <div className="mt-5 flex gap-2">
          <Button onClick={onAction} variant="outline" className="flex-1 h-10 rounded-xl text-xs font-semibold">
            {ctaLabel}
          </Button>
          {onDetails ? (
            <Button
              onClick={onDetails}
              variant="outline"
              className="flex-1 h-10 rounded-xl border-[var(--border-default)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--bg-surface-2)] text-xs font-semibold"
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
