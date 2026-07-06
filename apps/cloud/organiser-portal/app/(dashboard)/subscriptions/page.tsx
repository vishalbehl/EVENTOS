"use client";

import { useMemo } from "react";
import { CreditCard, ShieldCheck } from "lucide-react";
import { useAddons, useCurrentPlan, usePlans } from "@/hooks/useBilling";
import { Button } from "@/components/ui/button";
import {
  EnterpriseEmptyState,
  EnterprisePageIntro,
  EnterprisePanel,
  EnterpriseStepRail,
} from "@/components/organizer/platform/EnterprisePortal";
import {
  CommercialAddonCard,
  CommercialPlanCard,
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

export default function SubscriptionsPage() {
  const { data: currentPlan } = useCurrentPlan();
  const { data: plansData } = usePlans();
  const { data: addonsData } = useAddons();

  const plans = useMemo(
    () =>
      asArray<Record<string, any>>(plansData).map((plan) => ({
        id: String(plan.id ?? plan.key ?? plan.name),
        name: String(plan.name ?? "Plan"),
        tagline: plan.tagline || plan.description || undefined,
        description: plan.description || undefined,
        priceLabel: `${formatCurrency(
          toNumber(plan.price ?? plan.amount ?? plan.price_inr ?? plan.price_per_event),
          String(plan.currency || "INR")
        )}${toNumber(plan.price ?? plan.amount ?? plan.price_inr ?? plan.price_per_event) !== null ? " / event" : ""}`,
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
      })),
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
          accessLabel:
            Array.isArray(addon.available_for_plans) && addon.available_for_plans.length > 0
              ? "Scoped"
              : "Open",
          priceLabel: (() => {
            const minPrice = toNumber(addon.min_price_inr ?? addon.price_inr);
            const maxPrice = toNumber(addon.max_price_inr);
            if (minPrice !== null && maxPrice !== null && maxPrice > minPrice) {
              return `${formatCurrency(minPrice)} - ${formatCurrency(maxPrice)}`;
            }
            return formatCurrency(minPrice);
          })(),
          isActive: addon.is_active !== false,
        })),
    [addonsData]
  );

  return (
    <div className="space-y-6 pb-8">
      <EnterprisePageIntro
        title="Subscriptions"
        subtitle="EventX OS uses per-event subscriptions. Choose a core plan, then activate commercial add-ons only where you need more capability."
      />

      <EnterprisePanel className="overflow-hidden border-violet-200 bg-[linear-gradient(135deg,#f8f7ff_0%,#ffffff_56%,#f5f9ff_100%)] p-6">
        {!currentPlan ? (
          <div className="grid gap-6 lg:grid-cols-[220px_1fr] lg:items-center">
            <div className="flex justify-center lg:justify-start">
              <div className="flex h-28 w-28 items-center justify-center rounded-full bg-violet-100">
                <CreditCard className="h-14 w-14 text-violet-500" />
              </div>
            </div>
            <div>
              <p className="text-[24px] font-bold tracking-[-0.04em] text-slate-950">
                No active subscriptions
              </p>
              <p className="mt-3 max-w-xl text-[14px] leading-6 text-slate-500">
                Choose the workspace plan that fits your event portfolio, then extend it with plan-based add-ons only where your team needs more coverage.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[24px] font-bold tracking-[-0.04em] text-slate-950">
                Current plan active
              </p>
              <p className="mt-3 max-w-xl text-[14px] leading-6 text-slate-500">
                Your workspace is provisioned. Review available plans and plan add-ons below for future upgrades.
              </p>
            </div>
            <Button variant="outline" className="h-11 rounded-xl px-5 text-[12px] font-semibold">
              Current Plan
            </Button>
          </div>
        )}
      </EnterprisePanel>

      <EnterpriseStepRail
        title="How per-event subscription works?"
        steps={[
          {
            title: "Create event",
            description: "Set up the event workspace and operational scope first.",
            icon: CreditCard,
          },
          {
            title: "Choose plan",
            description: "Select the core plan that matches your team and attendee scale.",
            icon: ShieldCheck,
          },
          {
            title: "Add plan extensions",
            description: "Activate optional add-ons for extra capabilities and coverage.",
            icon: CreditCard,
          },
          {
            title: "Activate",
            description: "Provision features instantly and continue running the event.",
            icon: ShieldCheck,
          },
        ]}
      />

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-slate-950">Available Plans</h2>
            <p className="mt-1 text-[13px] text-slate-500">
              The card language matches command center, mapped into the organizer theme.
            </p>
          </div>
        </div>

        {plans.length === 0 ? (
          <EnterprisePanel className="border-dashed border-slate-200">
            <EnterpriseEmptyState
              icon={CreditCard}
              title="Plan catalog unavailable"
              description="The plan catalog could not be loaded right now."
              actionLabel="Refresh"
            />
          </EnterprisePanel>
        ) : (
          <div className="grid gap-6 xl:grid-cols-3">
            {plans.map((plan, index) => (
              <CommercialPlanCard
                key={plan.id}
                plan={plan}
                index={index}
                actionLabel="Choose Plan"
                secondaryLabel="Details"
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-slate-950">Plan Add-ons</h2>
          <p className="mt-1 text-[13px] text-slate-500">
            This page now shows plan add-ons only. Venue packages live in the new Venue Operations page.
          </p>
        </div>

        {planAddons.length === 0 ? (
          <EnterprisePanel className="border-dashed border-slate-200">
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
                actionLabel="View Details"
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
