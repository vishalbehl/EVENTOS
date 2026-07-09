"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  CreditCard,
  Package,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useAddons, useCurrentPlan, usePlans } from "@/hooks/useBilling";
import { Button } from "@/components/ui/button";
import { orgApi } from "@/components/organizer/org/org-api";
import { CommercialDetailsDialog } from "@/components/organizer/platform/CommercialDetailsDialog";
import {
  EnterpriseEmptyState,
  EnterprisePageIntro,
  EnterprisePanel,
  EnterpriseStepRail,
} from "@/components/organizer/platform/EnterprisePortal";
import {
  CommercialAddonCard,
  CommercialPlanCard,
  type PlanActionVariant,
} from "@/components/organizer/platform/CommercialCards";

function asArray<T = Record<string, any>>(value: any): T[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function toNumber(value: any) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatCurrency(amount: number | null | undefined, currency = "INR") {
  if (amount === null || amount === undefined) return "Custom Pricing";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `₹${amount.toLocaleString("en-IN")}`;
  }
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

// ─── Active Plan Status Panel ───────────────────────────────────────────────

function ActivePlanPanel({ currentPlan }: { currentPlan: Record<string, any> | null }) {
  // /billing/plan shape:
  // { subscription_id, status, trial_ends_at, current_period_end, cancel_at_period_end,
  //   plan: { id, name, tagline, description, price_per_event_min, max_events, max_users, ... },
  //   usage: { events: { used, max }, users: { used, max }, ... } }
  const plan = currentPlan?.plan ?? null;
  const usage = currentPlan?.usage ?? null;

  const planName = plan?.name ?? "Unknown Plan";
  const status = String(currentPlan?.status ?? "").toUpperCase();
  const expiresAt = currentPlan?.current_period_end ?? currentPlan?.trial_ends_at ?? null;
  const price = plan?.price_per_event_min ?? plan?.price_per_event_max ?? null;
  const tagline = plan?.tagline ?? plan?.description ?? null;

  const eventsUsed = usage?.events?.used ?? 0;
  const eventsMax = usage?.events?.max ?? plan?.max_events ?? 0;
  const usagePercent = eventsMax > 0 ? Math.min((eventsUsed / eventsMax) * 100, 100) : 0;

  const isActive = status === "ACTIVE" || status === "TRIAL";

  // Features from plan highlights — backend returns plan.name-level data, build from limits
  const highlights: string[] = [
    plan?.max_users ? `${plan.max_users} team members` : null,
    plan?.max_registrations ? `${plan.max_registrations} registrations` : null,
    plan?.max_speakers ? `${plan.max_speakers} speakers` : null,
    plan?.max_sessions ? `${plan.max_sessions} sessions` : null,
    plan?.storage_quota_mb ? `${Math.round(plan.storage_quota_mb / 1024)} GB storage` : null,
  ].filter(Boolean) as string[];

  if (!currentPlan) {
    return (
      <EnterprisePanel className="p-8">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/[0.06]">
            <CreditCard className="h-9 w-9 text-[var(--color-text-muted)]" />
          </div>
          <div>
            <p className="text-[22px] font-bold tracking-[-0.03em] text-[var(--color-text-primary)]">
              No active subscription
            </p>
            <p className="mt-2 max-w-xl text-[14px] leading-6 text-[var(--color-text-secondary)]">
              Choose a workspace plan below to get started. You'll be able to create events, manage speakers, and activate modules.
            </p>
          </div>
        </div>
      </EnterprisePanel>
    );
  }

  return (
    <EnterprisePanel className="overflow-hidden p-0">
      {/* Top accent line */}
      <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-[#C2F542]/60 to-transparent" />

      <div className="p-6 md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-10">
          {/* Left — Plan identity */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[rgba(194,245,66,0.25)] bg-[rgba(194,245,66,0.08)]">
                <Zap className="h-5 w-5 text-[#C2F542]" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
                  Current Plan
                </p>
                <h2 className="text-[22px] font-bold tracking-[-0.03em] text-[var(--color-text-primary)] leading-tight">
                  {planName}
                </h2>
              </div>
              <span
                className={[
                  "ml-auto rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em]",
                  isActive
                    ? "border border-[rgba(194,245,66,0.3)] bg-[rgba(194,245,66,0.1)] text-[#C2F542]"
                    : "border border-white/10 bg-white/5 text-white/50",
                ].join(" ")}
              >
                {isActive ? "Active" : "Inactive"}
              </span>
            </div>

            {/* Tagline + Date + price row */}
            {tagline && (
              <p className="text-[13px] text-[var(--color-text-secondary)] mb-4 leading-relaxed">{tagline}</p>
            )}
            <div className="flex flex-wrap gap-5 mb-6">
              {expiresAt && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-[var(--color-text-muted)]" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">Renews / Expires</p>
                    <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">{formatDate(expiresAt)}</p>
                  </div>
                </div>
              )}
              {price !== null && (
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-[var(--color-text-muted)]" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">From</p>
                    <p className="text-[13px] font-bold font-mono text-[var(--color-text-primary)]">{formatCurrency(price)} / event</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-[var(--color-text-muted)]" />
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">Status</p>
                  <p className="text-[13px] font-semibold text-[var(--color-text-primary)] capitalize">{status}</p>
                </div>
              </div>
            </div>

            {/* Features pills */}
            {highlights.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {highlights.map((f) => (
                  <span
                    key={f}
                    className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-[var(--color-text-secondary)]"
                  >
                    <Check className="h-3 w-3 text-[#C2F542]" />
                    {f}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Right — Usage stats */}
          <div className="shrink-0 w-full lg:w-[260px] space-y-4">
            <div className="rounded-2xl border border-[var(--color-border)] bg-white/[0.02] p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Event Usage</p>
                <span className="text-[11px] font-mono font-semibold text-[var(--color-text-primary)]">
                  {eventsUsed} / {eventsMax > 0 ? eventsMax : "∞"}
                </span>
              </div>
              {eventsMax > 0 && (
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#C2F542] to-[#8ecf2f] transition-all duration-700"
                    style={{ width: `${usagePercent}%` }}
                  />
                </div>
              )}
              <p className="mt-2 text-[10px] text-[var(--color-text-muted)]">
                {eventsMax > 0 ? `${Math.max(eventsMax - eventsUsed, 0)} slots remaining` : "Unlimited events"}
              </p>
            </div>

            <div className="rounded-2xl border border-[var(--color-border)] bg-white/[0.02] p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[#C2F542]" />
                <p className="text-[12px] font-semibold text-[var(--color-text-primary)]">Plan is active</p>
              </div>
              <p className="mt-1 text-[11px] text-[var(--color-text-muted)] leading-relaxed">
                All modules provisioned and available for event creation.
              </p>
            </div>
          </div>
        </div>
      </div>
    </EnterprisePanel>
  );
}

// ─── Sticky Pricing Summary ───────────────────────────────────────────────

function StickySummaryBar({
  selectedPlanName,
  selectedPlanPrice,
  selectedAddonNames,
  selectedAddonPrices,
  onProceed,
}: {
  selectedPlanName: string | null;
  selectedPlanPrice: number | null;
  selectedAddonNames: string[];
  selectedAddonPrices: (number | null)[];
  onProceed: () => void;
}) {
  const total =
    (selectedPlanPrice ?? 0) +
    selectedAddonPrices.reduce<number>((sum, p) => sum + (p ?? 0), 0);
  const hasSelection = Boolean(selectedPlanName);

  if (!hasSelection) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-3xl px-4">
      <div className="rounded-[20px] border border-[rgba(194,245,66,0.2)] bg-[#111118]/95 backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.6)] p-4 flex flex-col md:flex-row items-start md:items-center gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-muted)] mb-1.5">
            Selected
          </p>
          <div className="flex flex-wrap gap-2">
            {selectedPlanName && (
              <span className="rounded-full border border-[rgba(194,245,66,0.3)] bg-[rgba(194,245,66,0.1)] px-2.5 py-0.5 text-[11px] font-semibold text-[#C2F542]">
                {selectedPlanName}
              </span>
            )}
            {selectedAddonNames.map((name) => (
              <span
                key={name}
                className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] font-medium text-[var(--color-text-secondary)]"
              >
                + {name}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">Total</p>
            <p className="text-[18px] font-bold font-mono text-[var(--color-text-primary)]">
              {formatCurrency(total)}
            </p>
          </div>
          <Button
            onClick={onProceed}
            className="h-11 rounded-xl px-5 bg-[#C2F542] text-black hover:bg-[#d4f75a] font-semibold text-[13px] gap-2"
          >
            Create Event
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function SubscriptionsPage() {
  const router = useRouter();
  const { data: currentPlan } = useCurrentPlan();
  const { data: plansData } = usePlans();
  const { data: addonsData } = useAddons();

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailType, setDetailType] = useState<"plan" | "addon" | null>(null);
  const [detailData, setDetailData] = useState<any | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);

  const handleOpenPlanDetails = async (planId: string) => {
    try {
      const res = await orgApi.plan(planId);
      setDetailType("plan");
      setDetailData(res);
      setDetailOpen(true);
    } catch (err) {
      console.error("Failed to fetch plan details", err);
    }
  };

  const handleOpenAddonDetails = async (addonId: string) => {
    try {
      const res = await orgApi.addon(addonId);
      setDetailType("addon");
      setDetailData(res);
      setDetailOpen(true);
    } catch (err) {
      console.error("Failed to fetch addon details", err);
    }
  };

  const currentPlanRecord = currentPlan as Record<string, any> | null | undefined;
  const activePlanName: string = (currentPlanRecord?.plan_name ?? currentPlanRecord?.name ?? "").toLowerCase();

  const plans = useMemo(
    () =>
      asArray<Record<string, any>>(plansData).map((plan) => ({
        id: String(plan.id ?? plan.key ?? plan.name),
        name: String(plan.name ?? "Plan"),
        tagline: plan.tagline || plan.description || undefined,
        description: plan.description || undefined,
        price: toNumber(plan.price ?? plan.amount ?? plan.price_inr ?? plan.price_per_event ?? plan.price_per_event_min),
        priceLabel: (() => {
          const price = toNumber(plan.price ?? plan.amount ?? plan.price_inr ?? plan.price_per_event ?? plan.price_per_event_min);
          if (price !== null) return `${formatCurrency(price, String(plan.currency || "INR"))} / event`;
          return "Custom Pricing";
        })(),
        colorHex: String(plan.color_hex ?? plan.color ?? "#6366F1"),
        isPopular: Boolean(plan.is_popular || plan.popular),
        isActive: plan.is_active !== false,
        subscribersLabel: plan.subscribers_count ? `${plan.subscribers_count} subscribers` : "Workspace ready",
        highlights: [
          `${plan.max_users ?? "Unlimited"} team members`,
          `${plan.max_registrations ?? "Unlimited"} registrations`,
          `${plan.max_speakers ?? "Unlimited"} speakers`,
          `${plan.max_sessions ?? "Unlimited"} sessions`,
          `${plan.max_rooms ?? "Unlimited"} rooms`,
          `${Math.round((Number(plan.storage_quota_mb ?? 0) || 0) / 1024) || 5} GB storage`,
        ],
        tierIndex: 0, // will be set by map index
      })).map((p, i) => ({ ...p, tierIndex: i })),
    [plansData]
  );

  const planAddons = useMemo(
    () =>
      asArray<Record<string, any>>(addonsData)
        .filter((addon) => String(addon.addon_type || "PLAN").toUpperCase() === "PLAN")
        .map((addon) => ({
          id: String(addon.id ?? addon.key ?? addon.name),
          name: String(addon.name ?? "Add-on"),
          description: addon.short_description || addon.description || undefined,
          imageUrl: addon.image_url || undefined,
          type: "PLAN" as const,
          billingUnit: String(addon.billing_unit || "PER_EVENT"),
          hardwareCount: asArray(addon.hardware_spec).reduce(
            (sum: number, item: any) => sum + Number(item.quantity || 0),
            0
          ),
          staffCount: asArray(addon.staff_spec).reduce(
            (sum: number, item: any) => sum + Number(item.quantity || 0),
            0
          ),
          accessLabel:
            Array.isArray(addon.available_for_plans) && addon.available_for_plans.length > 0
              ? "Scoped"
              : "Open",
          price: toNumber(addon.final_price) ?? toNumber(addon.min_price_inr ?? addon.price_inr),
          priceLabel: (() => {
            const finalPrice = toNumber(addon.final_price);
            if (finalPrice !== null && finalPrice > 0) {
              return formatCurrency(finalPrice);
            }
            const minPrice = toNumber(addon.min_price_inr ?? addon.price_inr);
            const maxPrice = toNumber(addon.max_price_inr);
            if (minPrice !== null && maxPrice !== null && maxPrice > minPrice) {
              return `${formatCurrency(minPrice)} - ${formatCurrency(maxPrice)}`;
            }
            return formatCurrency(minPrice);
          })(),
          priceUnit: addon.price_unit || undefined,
          isActive: addon.is_active !== false,
        })),
    [addonsData]
  );

  // Determine action variant for each plan
  function getPlanActionVariant(planName: string, tierIndex: number): PlanActionVariant {
    if (!activePlanName) return "choose";
    const normalized = planName.toLowerCase();
    if (normalized === activePlanName) return "current";
    // Simple heuristic: plans are ordered by tier; higher index = higher tier
    const currentTierIndex = plans.findIndex((p) => p.name.toLowerCase() === activePlanName);
    if (currentTierIndex === -1) return "choose";
    return tierIndex > currentTierIndex ? "upgrade" : "downgrade";
  }

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) ?? null;
  const selectedAddonItems = planAddons.filter((a) => selectedAddonIds.includes(a.id));

  const handleProceed = () => {
    const params = new URLSearchParams();
    if (selectedPlanId) params.set("plan", selectedPlanId);
    if (selectedAddonIds.length > 0) params.set("addons", selectedAddonIds.join(","));
    router.push(`/events/new${params.toString() ? `?${params.toString()}` : ""}`);
  };

  const handlePlanAction = (plan: (typeof plans)[0]) => {
    const variant = getPlanActionVariant(plan.name, plan.tierIndex);
    if (variant === "current") return;
    setSelectedPlanId(plan.id);
  };

  const handleAddonToggle = (addonId: string) => {
    setSelectedAddonIds((prev) =>
      prev.includes(addonId) ? prev.filter((id) => id !== addonId) : [...prev, addonId]
    );
  };

  return (
    <div className="space-y-8 pb-32">
      <EnterprisePageIntro
        title="Subscriptions"
        subtitle="EventX OS uses per-event subscriptions. Choose a core plan, then activate commercial add-ons only where you need more capability."
      />

      {/* Active Plan Status */}
      <ActivePlanPanel currentPlan={currentPlanRecord ?? null} />

      {/* How it works */}
      <EnterpriseStepRail
        title="How per-event subscription works"
        steps={[
          {
            title: "Create event",
            description: "Set up the event workspace and operational scope first.",
            icon: Sparkles,
          },
          {
            title: "Choose plan",
            description: "Select the core plan that matches your team and attendee scale.",
            icon: ShieldCheck,
          },
          {
            title: "Add plan extensions",
            description: "Activate optional add-ons for extra capabilities and coverage.",
            icon: Package,
          },
          {
            title: "Activate",
            description: "Provision features instantly and continue running the event.",
            icon: Zap,
          },
        ]}
      />

      {/* Available Plans */}
      <section className="space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-[var(--color-text-primary)]">
              Available Plans
            </h2>
            <p className="mt-1 text-[13px] text-[var(--color-text-secondary)]">
              {activePlanName
                ? "Select a plan to upgrade or downgrade your workspace."
                : "Choose the plan that fits your event portfolio size."}
            </p>
          </div>
        </div>

        {plans.length === 0 ? (
          <EnterprisePanel className="border-dashed border-[var(--color-border)]">
            <EnterpriseEmptyState
              icon={CreditCard}
              title="Plan catalog unavailable"
              description="The plan catalog could not be loaded right now."
              actionLabel="Refresh"
            />
          </EnterprisePanel>
        ) : (
          <div className="grid gap-6 xl:grid-cols-3">
            {plans.map((plan) => {
              const variant = getPlanActionVariant(plan.name, plan.tierIndex);
              return (
                <CommercialPlanCard
                  key={plan.id}
                  plan={plan}
                  index={plan.tierIndex}
                  actionVariant={variant}
                  isCurrentPlan={variant === "current"}
                  onAction={() => handlePlanAction(plan)}
                  secondaryLabel="Details"
                  onSecondaryAction={() => handleOpenPlanDetails(plan.id)}
                />
              );
            })}
          </div>
        )}
      </section>

      {/* Plan Add-ons */}
      <section className="space-y-5">
        <div>
          <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-[var(--color-text-primary)]">
            Plan Add-ons
          </h2>
          <p className="mt-1 text-[13px] text-[var(--color-text-secondary)]">
            Extend your plan with optional capabilities. Selected add-ons will be included when you create an event.
          </p>
        </div>

        {planAddons.length === 0 ? (
          <EnterprisePanel className="border-dashed border-[var(--color-border)]">
            <EnterpriseEmptyState
              icon={ShieldCheck}
              title="No plan add-ons available"
              description="There are no commercial plan extensions in the catalog yet."
              actionLabel="Browse Plans"
            />
          </EnterprisePanel>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {planAddons.map((addon) => (
              <CommercialAddonCard
                key={addon.id}
                addon={addon}
                selected={selectedAddonIds.includes(addon.id)}
                onAction={() => handleAddonToggle(addon.id)}
                onDetails={() => handleOpenAddonDetails(addon.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Sticky Pricing Summary */}
      <StickySummaryBar
        selectedPlanName={selectedPlan?.name ?? null}
        selectedPlanPrice={selectedPlan?.price ?? null}
        selectedAddonNames={selectedAddonItems.map((a) => a.name)}
        selectedAddonPrices={selectedAddonItems.map((a) => a.price ?? null)}
        onProceed={handleProceed}
      />

      <CommercialDetailsDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        type={detailType}
        data={detailData}
      />
    </div>
  );
}
