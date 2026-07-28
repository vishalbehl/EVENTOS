"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Globe,
  Hash,
  Loader2,
  MapPin,
  Phone,
  Plus,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { useCreateEvent, useUpdateEvent } from "@/hooks/useEvents";
import { CountryStateEntry, fetchCountryStates, getStatesForCountry } from "@/lib/country-states";
import { EventSummary } from "@/types/backend";
import { orgApi } from "@/components/organizer/org/org-api";

interface CreateEventDialogProps {
  isOpen: boolean;
  onClose: () => void;
  eventToEdit?: EventSummary | null;
}

type BillingPlan = {
  id?: string;
  key?: string;
  name: string;
  description: string;
  tagline: string;
  price: number | null;
  currency: string;
  maxEvents: number;
  maxUsers: number;
  maxRegistrations: number;
  maxSpeakers: number;
  features: string[];
  popular: boolean;
  raw: Record<string, any>;
};

type BillingAddon = {
  id?: string;
  key?: string;
  name: string;
  description: string;
  price: number | null;
  currency: string;
  rawKey: string;
  features: string[];
};

type OrgContext = Awaited<ReturnType<typeof orgApi.me>>;

const initialFormData = {
  name: "",
  short_code: "",
  location: "",
  venue_name: "",
  country: "",
  state: "",
  organizer_details: {
    name: "",
    email: "",
    phone: "",
    website: "",
  },
  start_date: "",
  end_date: "",
  timezone: "Asia/Kolkata",
  status: "draft" as const,
  speaker_settings: { enabled: true, window_required: true },
  registration_settings: {
    enabled: true,
    registration_allowed: true,
    participants_list_allowed: true,
  },
};

function asArray<T = any>(value: any): T[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function toNumber(value: any) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePlan(plan: Record<string, any>): BillingPlan {
  return {
    id: plan.id ? String(plan.id) : undefined,
    key: plan.key ?? plan.plan_key ?? plan.slug ?? undefined,
    name: String(plan.name ?? plan.plan_name ?? "Plan"),
    description: String(plan.description ?? ""),
    tagline: String(plan.tagline ?? plan.subtitle ?? plan.description ?? ""),
    price: toNumber(plan.price ?? plan.amount ?? plan.base_price),
    currency: String(plan.currency ?? "INR"),
    maxEvents: Number(plan.max_events ?? plan.limits?.max_events ?? plan.limits?.events ?? 1),
    maxUsers: Number(plan.max_users ?? plan.limits?.max_users ?? plan.limits?.users ?? 0),
    maxRegistrations: Number(plan.max_registrations ?? plan.limits?.max_registrations ?? plan.limits?.registrations ?? 0),
    maxSpeakers: Number(plan.max_speakers ?? plan.limits?.max_speakers ?? plan.limits?.speakers ?? 0),
    features: [
      ...asArray<string>(plan.feature_highlights),
      ...asArray<string>(plan.features_preview),
      ...asArray<string>(plan.enabled_features),
    ].filter(Boolean),
    popular: Boolean(plan.is_popular ?? plan.popular ?? false),
    raw: plan,
  };
}

function normalizeAddon(addon: Record<string, any>): BillingAddon {
  return {
    id: addon.id ? String(addon.id) : undefined,
    key: addon.key ?? addon.addon_key ?? addon.slug ?? undefined,
    rawKey: String(addon.key ?? addon.addon_key ?? addon.id ?? addon.name),
    name: String(addon.name ?? "Add-on"),
    description: String(addon.description ?? addon.tagline ?? ""),
    price: toNumber(addon.price ?? addon.amount),
    currency: String(addon.currency ?? "INR"),
    features: [
      ...asArray<string>(addon.feature_highlights),
      ...asArray<string>(addon.features_preview),
      ...asArray<string>(addon.enabled_features),
    ].filter(Boolean),
  };
}

function formatCurrency(value: number | null | undefined, currency = "INR") {
  if (value === null || value === undefined) return "Custom";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `Rs ${value.toLocaleString("en-IN")}`;
  }
}

function normalizeComparisonValue(value: string) {
  return value.toLowerCase().replace(/[\s_-]+/g, "");
}

export function CreateEventDialog({ isOpen, onClose, eventToEdit }: CreateEventDialogProps) {
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent(eventToEdit?.id || "");
  const isEditing = Boolean(eventToEdit);

  const [step, setStep] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [loading, setLoading] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [globalTimezone, setGlobalTimezone] = useState("Asia/Kolkata");
  const [countryStates, setCountryStates] = useState<CountryStateEntry[]>([]);

  const [orgContext, setOrgContext] = useState<OrgContext | null>(null);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [addons, setAddons] = useState<BillingAddon[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<BillingPlan | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [priceDetails, setPriceDetails] = useState<any | null>(null);
  const [calculating, setCalculating] = useState(false);

  const [billingName, setBillingName] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [billingPhone, setBillingPhone] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [successDetails, setSuccessDetails] = useState<any | null>(null);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
  const [currentBillingPlan, setCurrentBillingPlan] = useState<Record<string, any> | null>(null);

  const [formData, setFormData] = useState(initialFormData);

  const activePlanName = String(currentBillingPlan?.plan?.name ?? "");
  const currentEventCount = orgContext?.event_count ?? 0;
  const currentEventLimit = Number(currentBillingPlan?.usage?.events?.max ?? orgContext?.plan_limits?.events ?? 0);
  const billingStatus = String(currentBillingPlan?.status ?? "").toUpperCase();
  const hasActivePlan = Boolean(
    orgContext?.organization?.is_active &&
    ["ACTIVE", "TRIAL"].includes(billingStatus) &&
    currentEventLimit > 0,
  );
  const normalizedActivePlan = normalizeComparisonValue(activePlanName);

  const remainingEvents = Math.max(currentEventLimit - currentEventCount, 0);
  const selectedPlanEventLimit = selectedPlan?.maxEvents ?? currentEventLimit;
  const selectedPlanMatchesCurrent =
    selectedPlan ? normalizeComparisonValue(selectedPlan.name) === normalizedActivePlan : false;
  const selectedPlanUnlocksEvent = selectedPlanEventLimit > currentEventCount;
  const requiresPurchase =
    !hasActivePlan || !selectedPlanMatchesCurrent || selectedAddons.length > 0 || remainingEvents <= 0;

  useEffect(() => {
    fetchCountryStates().then(setCountryStates).catch(console.error);
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
    fetch(`${apiBase}/api/v1/global-settings`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.timezone) {
          setGlobalTimezone(data.timezone);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      document.body.style.overflow = "unset";
      return;
    }
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    if (eventToEdit) {
      const details = (eventToEdit as any).organizer_details || {};
      setFormData({
        name: eventToEdit.name,
        short_code: eventToEdit.short_code,
        location: eventToEdit.location || "",
        venue_name: eventToEdit.venue_name || "",
        country: (eventToEdit as any).country || "",
        state: (eventToEdit as any).state || "",
        organizer_details: {
          name: details.name || eventToEdit.organizer_name || "",
          email: details.email || "",
          phone: details.phone || "",
          website: details.website || "",
        },
        start_date: eventToEdit.start_date ? new Date(eventToEdit.start_date).toISOString().split("T")[0] : "",
        end_date: eventToEdit.end_date ? new Date(eventToEdit.end_date).toISOString().split("T")[0] : "",
        timezone: (eventToEdit as any).timezone || globalTimezone,
        status: (eventToEdit.status as any) || "draft",
        speaker_settings: (eventToEdit as any).speaker_settings || { enabled: true, window_required: true },
        registration_settings:
          (eventToEdit as any).registration_settings ||
          {
            enabled: true,
            registration_allowed: true,
            participants_list_allowed: true,
          },
      });
      setStep(3);
      return;
    }

    setFormData((prev) => ({ ...initialFormData, timezone: globalTimezone, organizer_details: prev.organizer_details }));
    setStep(0);
    setSelectedAddons([]);
    setSuccessDetails(null);
    setPriceDetails(null);
    setLoadingConfig(true);

    Promise.allSettled([orgApi.me(), orgApi.plans(), orgApi.addons(), orgApi.currentBillingPlan()])
      .then((results) => {
        const [meResult, plansResult, addonsResult, billingResult] = results;
        if (
          meResult.status !== "fulfilled" ||
          plansResult.status !== "fulfilled" ||
          addonsResult.status !== "fulfilled"
        ) {
          throw new Error("Failed to load billing configuration.");
        }

        const meRes = meResult.value;
        const plansRes = plansResult.value;
        const addonsRes = addonsResult.value;
        const normalizedPlans = asArray(plansRes).map(normalizePlan);
        const normalizedAddons = asArray(addonsRes).map(normalizeAddon);
        const billingPlan = billingResult.status === "fulfilled" ? billingResult.value : null;
        const matchedPlan =
          normalizedPlans.find((plan) => normalizeComparisonValue(plan.name) === normalizeComparisonValue(String(billingPlan?.plan?.name ?? ""))) ||
          normalizedPlans[0] ||
          null;

        setOrgContext(meRes);
        setPlans(normalizedPlans);
        setAddons(normalizedAddons);
        setSelectedPlan(matchedPlan);
        setCurrentBillingPlan(billingPlan);
        if (billingResult.status === "fulfilled") {
          setSubscriptionId(billingResult.value?.subscription_id ? String(billingResult.value.subscription_id) : null);
        } else {
          setSubscriptionId(null);
        }

        const currentEventLimit = Number(billingPlan?.usage?.events?.max ?? meRes.plan_limits?.events ?? 0);
        const currentEventCount = meRes.event_count ?? 0;
        const currentStatus = String(billingPlan?.status ?? "").toUpperCase();
        const hasActivePlan = Boolean(meRes.organization?.is_active && ["ACTIVE", "TRIAL"].includes(currentStatus) && currentEventLimit > 0);
        const remainingEvents = Math.max(currentEventLimit - currentEventCount, 0);

        if (hasActivePlan && remainingEvents > 0) {
          setStep(3);
        }
        setBillingName(meRes.organization.name || "");
        setBillingEmail(meRes.organization.billing_email || "");
        setFormData((prev) => ({
          ...prev,
          timezone: globalTimezone,
          organizer_details: {
            ...prev.organizer_details,
            name: prev.organizer_details.name || meRes.organization.name || "",
            email: prev.organizer_details.email || meRes.organization.billing_email || "",
          },
        }));
      })
      .catch((error) => {
        console.error("Failed to load billing configuration:", error);
        toast.error("Could not load plans and add-ons.");
      })
      .finally(() => setLoadingConfig(false));
  }, [isOpen, eventToEdit, globalTimezone]);

  useEffect(() => {
    if (!isOpen || isEditing || !selectedPlan) return;
    setCalculating(true);
    orgApi
      .calculatePrice({
        plan_name: selectedPlan.name,
        addon_keys: selectedAddons,
        is_custom: false,
        custom_limits: null,
        promo_code: null,
      })
      .then(setPriceDetails)
      .catch(() => setPriceDetails(null))
      .finally(() => setCalculating(false));
  }, [isOpen, isEditing, selectedPlan, selectedAddons]);

  const selectedAddonRecords = useMemo(
    () => addons.filter((addon) => selectedAddons.includes(addon.rawKey)),
    [addons, selectedAddons]
  );

  const totalPrice = useMemo(() => {
    if (priceDetails?.total !== undefined) return Number(priceDetails.total);
    const base = selectedPlan?.price ?? 0;
    const addOnTotal = selectedAddonRecords.reduce((sum, addon) => sum + (addon.price ?? 0), 0);
    return base + addOnTotal;
  }, [priceDetails, selectedPlan, selectedAddonRecords]);

  const canAdvanceFromPlans = Boolean(selectedPlan && (remainingEvents > 0 || selectedPlanUnlocksEvent));

  const handleToggleAddon = (value: string) => {
    setSelectedAddons((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    );
  };

  const handleContinueFromAddons = () => {
    if (!selectedPlan) {
      toast.error("Select a plan first.");
      return;
    }
    if (!selectedPlanUnlocksEvent) {
      toast.error("The selected plan still does not unlock a new event.");
      return;
    }
    setStep(requiresPurchase ? 2 : 3);
  };

  const handleCheckout = async () => {
    if (!selectedPlan) {
      toast.error("Choose a plan before continuing.");
      return;
    }
    if (!billingName || !billingEmail || !billingPhone) {
      toast.error("Add billing contact details.");
      return;
    }
    setLoading(true);
    try {
      const result = await orgApi.requestCommercialAccess({
        plan_name: selectedPlan.name,
        addon_keys: selectedAddons,
        billing_name: billingName,
        billing_email: billingEmail,
        billing_phone: billingPhone,
        gst_number: gstNumber || null,
        reason: `Request access to ${selectedPlan.name} for a new event workspace`,
      });

      setSuccessDetails({
        requestId: result.id,
        status: result.status,
        quotedAmount: result.quoted_amount ?? totalPrice,
      });
      toast.success("Access request submitted for Command Center approval.");
    } catch (error: any) {
      toast.error(error?.message || "Failed to request the selected plan.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEvent = async () => {
    setLoading(true);
    try {
      if (isEditing) {
        await updateEvent.mutateAsync(formData);
        toast.success("Event updated.");
        onClose();
        return;
      }

      if (!selectedPlan) {
        toast.error("Select a plan before creating the event.");
        return;
      }

      if (requiresPurchase) {
        toast.error("This event requires an approved plan request before it can be created.");
        return;
      }

      const created = await createEvent.mutateAsync(formData);

      let resolvedSubscriptionId = subscriptionId;
      if (!resolvedSubscriptionId) {
        const currentPlan = await orgApi.currentBillingPlan();
        setCurrentBillingPlan(currentPlan);
        resolvedSubscriptionId = currentPlan?.subscription_id ? String(currentPlan.subscription_id) : null;
        if (resolvedSubscriptionId) {
          setSubscriptionId(resolvedSubscriptionId);
        }
      }

      if (!resolvedSubscriptionId) {
        throw new Error("Subscription activation could not be completed because no active subscription was found.");
      }

      await orgApi.activateEvent(String(created.id), resolvedSubscriptionId);
      toast.success("Event created successfully.");
      setStep(4);
    } catch (error: any) {
      toast.error(error?.message || "Failed to create event.");
    } finally {
      setLoading(false);
    }
  };

  const title =
    step === 0
      ? "Choose plan"
      : step === 1
        ? "Choose add-ons"
        : step === 2
          ? "Activate workspace"
          : step === 3
            ? isEditing
              ? "Edit event"
              : "Create event"
            : "Event ready";

  const subtitle =
    step === 0
      ? "Every event starts from an active plan entitlement."
      : step === 1
        ? "Add-ons are optional. You can skip this step and continue."
        : step === 2
          ? "Complete the backend-backed activation before using the event slot."
          : step === 3
            ? "Finish the event details after entitlement is confirmed."
            : "The workspace and event are now ready to use.";

  const stateLabel = remainingEvents > 0 ? `${remainingEvents} event slot left` : "No event slots left";

  return (
    <AnimatePresence>
      {isOpen ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-md"
            onClick={onClose}
          />

          <div className="pointer-events-none fixed inset-0 z-[210] flex items-center justify-center p-4 md:p-8">
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.96 }}
              className="hex-panel pointer-events-auto flex h-full max-h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-[32px]"
            >
              <div className="flex items-start justify-between border-b border-[var(--color-border)] p-6 md:p-8">
                <div className="flex items-start gap-4">
                  <div className="hex-icon-shell flex h-12 w-12 items-center justify-center">
                    <Plus className="h-5 w-5 text-[var(--color-text-primary)]" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
                      Organizer flow
                    </p>
                    <h3 className="mt-2 text-[24px] font-bold tracking-[-0.04em] text-[var(--color-text-primary)]">
                      {title}
                    </h3>
                    <p className="mt-1 text-[13px] text-[var(--color-text-secondary)]">{subtitle}</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border)] bg-white/[0.03] text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {loadingConfig ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3">
                  <Loader2 className="h-7 w-7 animate-spin text-[var(--color-primary-mid)]" />
                  <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                    Syncing commercial catalog
                  </p>
                </div>
              ) : (
                <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[1.55fr_0.9fr]">
                  <div className="min-h-0 overflow-y-auto p-6 md:p-8">
                    {step === 0 ? (
                      <div className="space-y-6">
                        <WorkspaceStateCard
                          activePlanName={activePlanName || "No active plan"}
                          stateLabel={stateLabel}
                          currentEventCount={currentEventCount}
                          currentEventLimit={currentEventLimit}
                        />

                        <div className="grid gap-4 xl:grid-cols-2">
                          {plans.map((plan) => {
                            const isSelected = selectedPlan?.name === plan.name;
                            const isCurrent = normalizeComparisonValue(plan.name) === normalizedActivePlan;
                            return (
                              <button
                                key={plan.id ?? plan.key ?? plan.name}
                                type="button"
                                onClick={() => setSelectedPlan(plan)}
                                className={cn(
                                  "rounded-[26px] border p-5 text-left transition-all duration-200 hover:-translate-y-1",
                                  isSelected ? "border-[rgba(224,255,0,0.28)] bg-[rgba(224,255,0,0.06)]" : "border-[var(--color-border)] bg-white/[0.02]"
                                )}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <h4 className="text-[22px] font-bold tracking-[-0.04em] text-[var(--color-text-primary)]">
                                        {plan.name}
                                      </h4>
                                      {plan.popular ? (
                                        <span className="rounded-full border border-[rgba(224,255,0,0.25)] bg-[rgba(224,255,0,0.12)] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--color-primary-mid)]">
                                          Popular
                                        </span>
                                      ) : null}
                                      {isCurrent ? (
                                        <span className="rounded-full border border-[var(--color-border)] bg-white/[0.04] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-secondary)]">
                                          Active
                                        </span>
                                      ) : null}
                                    </div>
                                    <p className="mt-2 text-[13px] leading-6 text-[var(--color-text-secondary)]">
                                      {plan.tagline || plan.description}
                                    </p>
                                  </div>
                                  <div className="hex-icon-shell flex h-11 w-11 items-center justify-center">
                                    {isSelected ? (
                                      <Check className="h-4 w-4 text-[var(--color-text-primary)]" />
                                    ) : (
                                      <Star className="h-4 w-4 text-[var(--color-text-primary)]" />
                                    )}
                                  </div>
                                </div>

                                <div className="mt-5 border-y border-[var(--color-border)] py-4">
                                  <p className="text-[24px] font-bold tracking-[-0.05em] text-[var(--color-text-primary)]">
                                    {formatCurrency(plan.price, plan.currency)}
                                  </p>
                                  <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                                    {plan.maxEvents} event{plan.maxEvents === 1 ? "" : "s"} · {plan.maxUsers} users
                                  </p>
                                </div>

                                <div className="mt-4 grid grid-cols-2 gap-3 text-[12px] text-[var(--color-text-secondary)]">
                                  <div className="rounded-2xl border border-[var(--color-border)] bg-white/[0.03] p-3">
                                    <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-muted)]">Registrations</p>
                                    <p className="mt-2 font-semibold text-[var(--color-text-primary)]">
                                      {plan.maxRegistrations.toLocaleString("en-IN")}
                                    </p>
                                  </div>
                                  <div className="rounded-2xl border border-[var(--color-border)] bg-white/[0.03] p-3">
                                    <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-muted)]">Speakers</p>
                                    <p className="mt-2 font-semibold text-[var(--color-text-primary)]">
                                      {plan.maxSpeakers.toLocaleString("en-IN")}
                                    </p>
                                  </div>
                                </div>

                                {plan.features.length > 0 ? (
                                  <div className="mt-4 flex flex-wrap gap-2">
                                    {plan.features.slice(0, 4).map((feature) => (
                                      <span
                                        key={feature}
                                        className="rounded-full border border-[var(--color-border)] bg-white/[0.03] px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--color-text-secondary)]"
                                      >
                                        {feature}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {step === 1 ? (
                      <div className="space-y-6">
                        <div className="flex items-center justify-between gap-4 rounded-[24px] border border-[var(--color-border)] bg-white/[0.03] px-4 py-4">
                          <div>
                            <p className="text-[12px] font-semibold text-[var(--color-text-primary)]">Selected plan</p>
                            <p className="mt-1 text-[13px] text-[var(--color-text-secondary)]">{selectedPlan?.name}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setStep(0)}
                            className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary-mid)]"
                          >
                            Change plan
                          </button>
                        </div>

                        <div className="grid gap-4 xl:grid-cols-2">
                          {addons.map((addon) => {
                            const selected = selectedAddons.includes(addon.rawKey);
                            return (
                              <button
                                key={addon.id ?? addon.key ?? addon.name}
                                type="button"
                                onClick={() => handleToggleAddon(addon.rawKey)}
                                className={cn(
                                  "rounded-[24px] border p-5 text-left transition-all duration-200 hover:-translate-y-1",
                                  selected ? "border-[rgba(224,255,0,0.28)] bg-[rgba(224,255,0,0.06)]" : "border-[var(--color-border)] bg-white/[0.02]"
                                )}
                              >
                                <div className="flex items-start justify-between gap-4">
                                  <div>
                                    <h4 className="text-[18px] font-semibold text-[var(--color-text-primary)]">{addon.name}</h4>
                                    <p className="mt-2 text-[13px] leading-6 text-[var(--color-text-secondary)]">
                                      {addon.description || "Optional service layer for this workspace."}
                                    </p>
                                  </div>
                                  <div className="hex-icon-shell flex h-10 w-10 items-center justify-center">
                                    {selected ? (
                                      <Check className="h-4 w-4 text-[var(--color-text-primary)]" />
                                    ) : (
                                      <Sparkles className="h-4 w-4 text-[var(--color-text-primary)]" />
                                    )}
                                  </div>
                                </div>
                                <div className="mt-4 flex items-center justify-between border-t border-[var(--color-border)] pt-4">
                                  <p className="text-[16px] font-semibold text-[var(--color-text-primary)]">
                                    {formatCurrency(addon.price, addon.currency)}
                                  </p>
                                  <span className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                                    {selected ? "Selected" : "Optional"}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {step === 2 ? (
                      <div className="space-y-6">
                        <div className="rounded-[24px] border border-[var(--color-border)] bg-white/[0.03] p-5">
                          <h4 className="text-[18px] font-semibold text-[var(--color-text-primary)]">Billing contact</h4>
                          <div className="mt-4 grid gap-4 md:grid-cols-2">
                            <FormField label="Billing name" value={billingName} onChange={setBillingName} />
                            <FormField label="Billing email" value={billingEmail} onChange={setBillingEmail} type="email" />
                            <FormField label="Billing phone" value={billingPhone} onChange={setBillingPhone} icon={Phone} />
                            <FormField label="GST number" value={gstNumber} onChange={setGstNumber} />
                          </div>
                        </div>

                        <div className="rounded-[24px] border border-[var(--color-border)] bg-white/[0.03] p-5">
                          <div className="flex items-center gap-3">
                            <div className="hex-icon-shell flex h-11 w-11 items-center justify-center">
                              <CreditCard className="h-4 w-4 text-[var(--color-text-primary)]" />
                            </div>
                            <div>
                              <h4 className="text-[18px] font-semibold text-[var(--color-text-primary)]">Command Center approval</h4>
                              <p className="text-[12px] text-[var(--color-text-muted)]">Submitting this request does not grant access or charge a payment method. An authorized reviewer must approve the plan and add-ons.</p>
                            </div>
                          </div>
                          {successDetails ? <div className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm text-amber-100">Request {successDetails.requestId} is {String(successDetails.status).toLowerCase()}. Return after approval to create the event.</div> : null}
                        </div>
                      </div>
                    ) : null}

                    {step === 3 ? (
                      <div className="space-y-6">
                        {!isEditing && successDetails ? (
                          <div className="rounded-[24px] border border-[rgba(224,255,0,0.16)] bg-[rgba(224,255,0,0.06)] p-4">
                            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary-mid)]">
                              Approval required
                            </p>
                            <p className="mt-2 text-[13px] text-[var(--color-text-primary)]">
                              Request {successDetails.requestId} is pending. The event remains locked until Command Center applies the approved plan.
                            </p>
                          </div>
                        ) : null}

                        <div className="grid gap-4 md:grid-cols-2">
                          <FormField
                            label="Event name"
                            value={formData.name}
                            onChange={(value) => setFormData((current) => ({ ...current, name: value }))}
                            icon={Sparkles}
                          />
                          <FormField
                            label="Short code"
                            value={formData.short_code}
                            onChange={(value) =>
                              setFormData((current) => ({ ...current, short_code: value.toUpperCase().slice(0, 10) }))
                            }
                            icon={Hash}
                          />
                          <FormField
                            label="Venue name"
                            value={formData.venue_name}
                            onChange={(value) => setFormData((current) => ({ ...current, venue_name: value }))}
                          />
                          <FormField
                            label="Location"
                            value={formData.location}
                            onChange={(value) => setFormData((current) => ({ ...current, location: value }))}
                            icon={MapPin}
                          />
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                          <SelectField
                            label="Country"
                            value={formData.country}
                            onChange={(value) => setFormData((current) => ({ ...current, country: value, state: "" }))}
                            options={countryStates.map((entry) => ({ label: entry.country, value: entry.country }))}
                          />
                          <SelectField
                            label="State"
                            value={formData.state}
                            onChange={(value) => setFormData((current) => ({ ...current, state: value }))}
                            options={getStatesForCountry(countryStates, formData.country).map((item) => ({ label: item, value: item }))}
                          />
                          <FormField
                            label="Start date"
                            value={formData.start_date}
                            onChange={(value) => setFormData((current) => ({ ...current, start_date: value }))}
                            type="date"
                            icon={Calendar}
                          />
                          <FormField
                            label="End date"
                            value={formData.end_date}
                            onChange={(value) => setFormData((current) => ({ ...current, end_date: value }))}
                            type="date"
                            icon={Calendar}
                          />
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <FormField
                            label="Organizer name"
                            value={formData.organizer_details.name}
                            onChange={(value) =>
                              setFormData((current) => ({
                                ...current,
                                organizer_details: { ...current.organizer_details, name: value },
                              }))
                            }
                          />
                          <FormField
                            label="Organizer email"
                            value={formData.organizer_details.email}
                            onChange={(value) =>
                              setFormData((current) => ({
                                ...current,
                                organizer_details: { ...current.organizer_details, email: value },
                              }))
                            }
                            type="email"
                          />
                          <FormField
                            label="Organizer phone"
                            value={formData.organizer_details.phone}
                            onChange={(value) =>
                              setFormData((current) => ({
                                ...current,
                                organizer_details: { ...current.organizer_details, phone: value },
                              }))
                            }
                          />
                          <FormField
                            label="Timezone"
                            value={formData.timezone}
                            onChange={(value) => setFormData((current) => ({ ...current, timezone: value }))}
                            icon={Globe}
                          />
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <ToggleCard
                            label="Speaker workspace"
                            checked={formData.speaker_settings.enabled}
                            onCheckedChange={(checked) =>
                              setFormData((current) => ({
                                ...current,
                                speaker_settings: { ...current.speaker_settings, enabled: checked },
                              }))
                            }
                          />
                          <ToggleCard
                            label="Registration workspace"
                            checked={formData.registration_settings.enabled}
                            onCheckedChange={(checked) =>
                              setFormData((current) => ({
                                ...current,
                                registration_settings: { ...current.registration_settings, enabled: checked },
                              }))
                            }
                          />
                        </div>
                      </div>
                    ) : null}

                    {step === 4 ? (
                      <div className="flex min-h-[420px] flex-col items-center justify-center space-y-6 text-center">
                        <div className="hex-icon-shell flex h-20 w-20 items-center justify-center">
                          <CheckCircle2 className="h-9 w-9 text-[var(--color-text-primary)]" />
                        </div>
                        <div className="space-y-2">
                          <h3 className="text-[28px] font-bold tracking-[-0.05em] text-[var(--color-text-primary)]">
                            Event created
                          </h3>
                          <p className="text-[13px] text-[var(--color-text-secondary)]">
                            The organizer workspace now has an active event slot attached to the selected plan.
                          </p>
                        </div>
                        <Button onClick={onClose}>Close</Button>
                      </div>
                    ) : null}
                  </div>

                  <aside className="border-t border-[var(--color-border)] p-6 lg:border-l lg:border-t-0">
                    <div className="space-y-4">
                      <div className="rounded-[24px] border border-[var(--color-border)] bg-white/[0.03] p-5">
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                          Flow steps
                        </p>
                        <ol className="mt-4 space-y-3 text-[13px]">
                          {[
                            "Plan selection",
                            "Add-on selection",
                            "Plan activation",
                            "Event details",
                          ].map((label, index) => {
                            const active = step === index;
                            const complete = step > index;
                            return (
                              <li key={label} className="flex items-center gap-3">
                                <span
                                  className={cn(
                                    "flex h-8 w-8 items-center justify-center rounded-full border text-[11px] font-bold",
                                    active || complete
                                      ? "border-[rgba(224,255,0,0.24)] bg-[rgba(224,255,0,0.14)] text-[var(--color-primary-mid)]"
                                      : "border-[var(--color-border)] text-[var(--color-text-muted)]"
                                  )}
                                >
                                  {complete ? <Check className="h-4 w-4" /> : index + 1}
                                </span>
                                <span className={active ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-secondary)]"}>
                                  {label}
                                </span>
                              </li>
                            );
                          })}
                        </ol>
                      </div>

                      <div className="rounded-[24px] border border-[var(--color-border)] bg-white/[0.03] p-5">
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                          Order summary
                        </p>
                        <div className="mt-4 space-y-4">
                          <SummaryRow label="Plan" value={selectedPlan?.name || "None selected"} />
                          <SummaryRow
                            label="Plan price"
                            value={selectedPlan ? formatCurrency(selectedPlan.price, selectedPlan.currency) : "N/A"}
                          />
                          <SummaryRow
                            label="Add-ons"
                            value={selectedAddonRecords.length > 0 ? `${selectedAddonRecords.length} selected` : "None"}
                          />
                          <SummaryRow label="Total" value={calculating ? "Calculating..." : formatCurrency(totalPrice)} strong />
                        </div>
                      </div>

                      <div className="rounded-[24px] border border-[var(--color-border)] bg-white/[0.03] p-5">
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                          Slot control
                        </p>
                        <p className="mt-3 text-[13px] text-[var(--color-text-secondary)]">
                          Active plan: <span className="text-[var(--color-text-primary)]">{activePlanName || "Not activated"}</span>
                        </p>
                        <p className="mt-2 text-[13px] text-[var(--color-text-secondary)]">
                          Current usage: <span className="text-[var(--color-text-primary)]">{currentEventCount}</span> /{" "}
                          <span className="text-[var(--color-text-primary)]">{currentEventLimit || 0}</span> events
                        </p>
                        {remainingEvents <= 0 ? (
                          <p className="mt-3 text-[12px] text-[var(--color-warning)]">
                            This workspace needs a plan that unlocks another event before creation can continue.
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </aside>
                </div>
              )}

              {step !== 4 && !loadingConfig ? (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] p-6">
                  <div className="flex items-center gap-3">
                    {step > 0 ? (
                      <Button
                        variant="ghost"
                        onClick={() => setStep((current) => Math.max(0, current - 1) as 0 | 1 | 2 | 3 | 4)}
                      >
                        <ArrowLeft className="h-4 w-4" />
                        Back
                      </Button>
                    ) : (
                      <Button variant="ghost" onClick={onClose}>
                        Cancel
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    {step === 0 ? (
                      <Button disabled={!canAdvanceFromPlans} onClick={() => setStep(1)}>
                        Next: Add-ons
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    ) : null}

                    {step === 1 ? (
                      <>
                        <Button variant="outline" onClick={() => setStep(requiresPurchase ? 2 : 3)}>
                          Skip add-ons
                        </Button>
                        <Button onClick={handleContinueFromAddons}>
                          {requiresPurchase ? "Request plan access" : "Continue to event"}
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </>
                    ) : null}

                    {step === 2 ? (
                      <Button disabled={loading || Boolean(successDetails)} onClick={handleCheckout}>
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {successDetails ? "Approval requested" : "Request approval"}
                      </Button>
                    ) : null}

                    {step === 3 ? (
                      <Button disabled={loading} onClick={handleSaveEvent}>
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {isEditing ? "Save changes" : "Create event"}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );
}

function WorkspaceStateCard({
  activePlanName,
  stateLabel,
  currentEventCount,
  currentEventLimit,
}: {
  activePlanName: string;
  stateLabel: string;
  currentEventCount: number;
  currentEventLimit: number;
}) {
  return (
    <div className="rounded-[24px] border border-[var(--color-border)] bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
            Current workspace
          </p>
          <h4 className="mt-2 text-[20px] font-bold tracking-[-0.04em] text-[var(--color-text-primary)]">
            {activePlanName}
          </h4>
        </div>
        <span className="rounded-full border border-[var(--color-border)] bg-white/[0.04] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
          {stateLabel}
        </span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-[var(--color-border)] bg-white/[0.03] p-4">
          <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-muted)]">Events used</p>
          <p className="mt-2 text-[24px] font-bold tracking-[-0.05em] text-[var(--color-text-primary)]">
            {currentEventCount}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-white/[0.03] p-4">
          <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-muted)]">Plan limit</p>
          <p className="mt-2 text-[24px] font-bold tracking-[-0.05em] text-[var(--color-text-primary)]">
            {currentEventLimit}
          </p>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-[13px]">
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <span className={strong ? "font-semibold text-[var(--color-text-primary)]" : "text-[var(--color-text-secondary)]"}>
        {value}
      </span>
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  type = "text",
  icon: Icon,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  icon?: any;
}) {
  return (
    <div className="space-y-2">
      <label>{label}</label>
      <div className="relative">
        {Icon ? <Icon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" /> : null}
        <Input
          value={value}
          type={type}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            "h-12 rounded-2xl border-[var(--color-border)] bg-white/[0.03] text-[var(--color-text-primary)]",
            Icon ? "pl-11" : ""
          )}
        />
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="space-y-2">
      <label>{label}</label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-2xl border border-[var(--color-border)] bg-white/[0.03] px-4 text-[13px] text-[var(--color-text-primary)]"
      >
        <option value="">Select</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ToggleCard({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-[22px] border border-[var(--color-border)] bg-white/[0.03] px-4 py-4">
      <div>
        <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">{label}</p>
        <p className="text-[12px] text-[var(--color-text-muted)]">Controls module access after the event is created.</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}
