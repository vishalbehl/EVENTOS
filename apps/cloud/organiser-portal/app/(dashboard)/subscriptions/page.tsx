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
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAddons, useCheckout, useCurrentPlan, usePlans } from "@/hooks/useBilling";
import { useEvents } from "@/hooks/useEvents";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { orgApi } from "@/components/organizer/org/org-api";
import { CommercialDetailsDialog } from "@/components/organizer/platform/CommercialDetailsDialog";
import { PlanActivationTargetModal } from "@/components/organizer/billing/PlanActivationTargetModal";
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
import { useAuthStore } from "@/store/use-auth-store";

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
  const plan = currentPlan?.plan ?? null;
  const usage = currentPlan?.usage ?? null;
  const limits = currentPlan?.limits ?? {};

  const status = String(currentPlan?.status ?? "").toUpperCase();
  const isTrial = status === "TRIAL" || currentPlan?.status_reason === "PUBLIC_DEMO_SIGNUP" || status !== "ACTIVE";
  const planName = plan?.name ?? (isTrial ? "Free Trial" : "Unknown Plan");
  const expiresAt = currentPlan?.current_period_end ?? currentPlan?.trial_ends_at ?? null;
  const price = plan?.price_per_event ?? null;
  const tagline = isTrial
    ? "Active evaluation environment. Select a commercial plan below to unlock custom themes, certificate generation, and expanded event capacity."
    : (plan?.tagline ?? plan?.description ?? null);

  const eventsUsed = usage?.events?.used ?? 0;
  const eventsMax = limits.max_events ?? usage?.events?.max ?? 0;
  const usagePercent = eventsMax > 0 ? Math.min((eventsUsed / eventsMax) * 100, 100) : 0;
  const isActive = status === "ACTIVE";

  const highlights: string[] = [
    limits.max_users != null ? `${limits.max_users} Team Member` : null,
    limits.max_registrations != null ? `${limits.max_registrations} Registrations` : null,
    limits.max_speakers != null ? `${limits.max_speakers} Speakers` : null,
    limits.max_sessions != null ? `${limits.max_sessions} Sessions` : null,
    limits.max_rooms != null ? `${limits.max_rooms} Room` : null,
    limits.storage_quota_mb != null ? `${limits.storage_quota_mb >= 1024 ? Math.round(limits.storage_quota_mb / 1024) + " GB" : limits.storage_quota_mb + " MB"} Storage` : null,
  ].filter(Boolean) as string[];

  if (!currentPlan) return null;

  return (
    <EnterprisePanel className="overflow-hidden p-0 border border-white/10 bg-[#0d0d12]/90 shadow-2xl">
      {/* Top subtle accent bar */}
      <div className="h-0.5 w-full bg-gradient-to-r from-amber-500/0 via-amber-400/80 to-amber-500/0" />

      <div className="p-6 md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          {/* Left — Identity */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-amber-400">
                <Sparkles className="h-3 w-3 text-amber-400" />
                {isTrial ? "Evaluation Workspace" : "Active Subscription"}
              </span>
              {expiresAt && (
                <span className="text-[11px] font-mono text-[var(--color-text-muted)]">
                  Expires {formatDate(expiresAt)}
                </span>
              )}
            </div>

            <h2 className="text-[24px] font-extrabold tracking-[-0.03em] text-[var(--color-text-primary)]">
              {planName}
            </h2>

            {tagline && (
              <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
                {tagline}
              </p>
            )}

            {/* Capacity Pills */}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {highlights.map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-[var(--color-text-primary)] backdrop-blur-sm"
                >
                  <Check className="h-3 w-3 text-amber-400 shrink-0" />
                  {item}
                </span>
              ))}
            </div>
          </div>

          {/* Right — Usage Box */}
          <div className="shrink-0 w-full lg:w-[280px]">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 backdrop-blur-md">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
                  Event Quota
                </p>
                <span className="text-[12px] font-mono font-bold text-[var(--color-text-primary)]">
                  {eventsUsed} / {isTrial ? 1 : eventsMax > 0 ? eventsMax : "∞"}
                </span>
              </div>

              <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden mb-3">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-700"
                  style={{ width: `${isTrial ? Math.min((eventsUsed / 1) * 100, 100) : usagePercent}%` }}
                />
              </div>

              <p className="text-[11px] text-[var(--color-text-muted)] leading-normal">
                {isTrial
                  ? "1 evaluation event available. Upgrade below to remove limits."
                  : `${Math.max(eventsMax - eventsUsed, 0)} slots remaining`}
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
  const queryClient = useQueryClient();
  const currentPlanQuery = useCurrentPlan();
  const plansQuery = usePlans();
  const addonsQuery = useAddons();
  const eventsQuery = useEvents();
  const currentPlan = currentPlanQuery.data;
  const plansData = plansQuery.data;
  const addonsData = addonsQuery.data;
  const userEvents = eventsQuery.data;
  const checkout = useCheckout();
  const user = useAuthStore((state) => state.user);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailType, setDetailType] = useState<"plan" | "addon" | null>(null);
  const [detailData, setDetailData] = useState<any | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  const [targetModalOpen, setTargetModalOpen] = useState(false);

  const handleOpenPlanDetails = async (planId: string) => {
    try {
      const res = await orgApi.plan(planId);
      setDetailType("plan");
      setDetailData(res);
      setDetailOpen(true);
    } catch (err) {
      console.error("Failed to fetch plan details", err);
      toast.error("Plan details are unavailable. Please retry.");
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
      toast.error("Add-on details are unavailable. Please retry.");
    }
  };

  const currentPlanRecord = currentPlan as Record<string, any> | null | undefined;
  const currentStatus = String(currentPlanRecord?.status ?? "").toUpperCase();
  const isTrialMode = currentStatus === "TRIAL" || currentPlanRecord?.status_reason === "PUBLIC_DEMO_SIGNUP" || currentStatus !== "ACTIVE";
  const activePlanName: string = isTrialMode ? "" : (currentPlanRecord?.plan?.name ?? currentPlanRecord?.plan_name ?? currentPlanRecord?.name ?? "").toLowerCase();

  const plans = useMemo(
    () =>
      asArray<Record<string, any>>(plansData)
        .filter((plan) => String(plan.name || "").toLowerCase() !== "free trial")
        .map((plan) => ({
        id: String(plan.id ?? plan.key ?? plan.name),
        name: String(plan.name ?? "Plan"),
        tagline: plan.tagline || plan.description || undefined,
        description: plan.description || undefined,
        price: toNumber(plan.price ?? plan.amount ?? plan.price_inr ?? plan.price_per_event),
        priceLabel: (() => {
          const price = toNumber(plan.price ?? plan.amount ?? plan.price_inr ?? plan.price_per_event);
          if (price !== null) return `${formatCurrency(price, String(plan.currency || "INR"))} / event`;
          return "Custom Pricing";
        })(),
        colorHex: String(plan.color_hex ?? plan.color ?? "#6366F1"),
        isPopular: Boolean(plan.is_popular || plan.popular),
        isActive: plan.is_active !== false,
        subscribersLabel: plan.subscribers_count ? `${plan.subscribers_count} subscribers` : "Workspace ready",
        highlights: [
          `${plan.limits?.max_users ?? "Not configured"} team members`,
          `${plan.limits?.max_registrations ?? "Not configured"} registrations`,
          `${plan.limits?.max_speakers ?? "Not configured"} speakers`,
          `${plan.limits?.max_sessions ?? "Not configured"} sessions`,
          `${plan.limits?.max_rooms ?? "Not configured"} rooms`,
          plan.limits?.storage_quota_mb != null
            ? `${Math.round(Number(plan.limits.storage_quota_mb) / 1024)} GB storage`
            : "Storage not configured",
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
          key: String(addon.key ?? addon.id ?? addon.name),
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

  const commercialRequestPayload = (eventId?: string) => {
    if (!selectedPlan) throw new Error("Select a plan before requesting access.");
    if (!user?.email || !user.phone) {
      throw new Error("Add an email and phone number to your profile before requesting commercial access.");
    }
    return {
      event_id: eventId,
      plan_name: selectedPlan.name,
      addon_keys: selectedAddonItems.map((addon) => addon.key),
      billing_name: user.full_name || `${user.first_name} ${user.last_name}`.trim(),
      billing_email: user.email,
      billing_phone: user.phone,
      gst_number: null,
      reason: eventId
        ? `Request selected commercial access for event ${eventId}`
        : "Request selected commercial access for a new event",
    };
  };

  const handleCreateNewEvent = () => {
    const params = new URLSearchParams();
    if (selectedPlanId) params.set("plan", selectedPlanId);
    if (selectedAddonIds.length > 0) params.set("addons", selectedAddonIds.join(","));
    router.push(`/events/new${params.toString() ? `?${params.toString()}` : ""}`);
  };

  const handleProceed = () => {
    if (userEvents && userEvents.length > 0) {
      setTargetModalOpen(true);
    } else {
      handleCreateNewEvent();
    }
  };

  const handleApplyToCurrentEvent = async (eventId: string) => {
    try {
      await checkout.mutateAsync(commercialRequestPayload(eventId));
      toast.success("Access request submitted for Command Center approval.");
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["event", eventId] });
      queryClient.invalidateQueries({ queryKey: ["billing"] });
      queryClient.invalidateQueries({ queryKey: ["organization-capabilities"] });
      queryClient.invalidateQueries({ queryKey: ["event-capabilities"] });
      queryClient.invalidateQueries({ queryKey: ["me-permissions"] });
      router.push(`/events/${eventId}/dashboard`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to apply plan to event");
    }
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

  const commercialQueries = [
    currentPlanQuery,
    plansQuery,
    addonsQuery,
    eventsQuery,
  ];
  if (commercialQueries.some((query) => query.isPending)) {
    return (
      <EnterprisePanel className="mt-4 p-8">
        <div className="flex items-center gap-3 text-sm text-[var(--color-text-secondary)]">
          <Activity className="h-5 w-5 animate-pulse text-[#C2F542]" />
          Loading authoritative subscription, catalogue, and event data…
        </div>
      </EnterprisePanel>
    );
  }
  if (commercialQueries.some((query) => query.isError)) {
    return (
      <EnterprisePanel className="mt-4 p-8">
        <p className="text-sm font-semibold text-[var(--color-text-primary)]">
          Commercial data is unavailable
        </p>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          The portal could not verify your current plan, available plans, add-ons, or event targets. Nothing has been inferred as trial or empty.
        </p>
        <Button
          className="mt-5"
          onClick={() => {
            void Promise.all(commercialQueries.map((query) => query.refetch()));
          }}
        >
          Retry all commercial data
        </Button>
      </EnterprisePanel>
    );
  }

  return (
    <div className="space-y-8 pb-32 pt-4">
      <ActivePlanPanel currentPlan={currentPlanRecord ?? null} />

      {/* How it works */}
      <EnterpriseStepRail
        title="How per-event subscription works"
        steps={[
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
            title: "Create event",
            description: "Set up the event workspace and operational scope with active entitlements.",
            icon: Sparkles,
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

      <PlanActivationTargetModal
        open={targetModalOpen}
        onOpenChange={setTargetModalOpen}
        selectedPlan={selectedPlan}
        selectedAddonNames={selectedAddonItems.map((a) => a.name)}
        events={userEvents || []}
        onApplyToCurrentEvent={handleApplyToCurrentEvent}
        onCreateNewEvent={handleCreateNewEvent}
      />
    </div>
  );
}
