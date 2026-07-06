"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useCreateEvent } from "@/hooks/useEvents";
import { CountryStateEntry, fetchCountryStates, getStatesForCountry } from "@/lib/country-states";
import { orgApi } from "@/components/organizer/org/org-api";
import { EnterprisePageIntro, EnterprisePanel } from "@/components/organizer/platform/EnterprisePortal";

type StepId = 0 | 1 | 2 | 3 | 4;

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
};

type BillingAddon = {
  id?: string;
  key?: string;
  rawKey: string;
  name: string;
  description: string;
  price: number | null;
  currency: string;
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

function normalizeComparisonValue(value: string) {
  return value.toLowerCase().replace(/[\s_-]+/g, "");
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

export default function NewEventPage() {
  const router = useRouter();
  const createEvent = useCreateEvent();

  const [step, setStep] = useState<StepId>(0);
  const [globalTimezone, setGlobalTimezone] = useState("Asia/Kolkata");
  const [countryStates, setCountryStates] = useState<CountryStateEntry[]>([]);
  const [formData, setFormData] = useState(initialFormData);
  const [orgContext, setOrgContext] = useState<OrgContext | null>(null);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [addons, setAddons] = useState<BillingAddon[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<BillingPlan | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [priceDetails, setPriceDetails] = useState<any | null>(null);
  const [billingName, setBillingName] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [billingPhone, setBillingPhone] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [cardholder, setCardholder] = useState("");
  const [cardNo, setCardNo] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [subscriptionActivated, setSubscriptionActivated] = useState(false);
  const [successEvent, setSuccessEvent] = useState<any | null>(null);

  useEffect(() => {
    fetchCountryStates().then(setCountryStates).catch(console.error);
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
    fetch(`${apiBase}/api/v1/global-settings`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.timezone) {
          setGlobalTimezone(data.timezone);
          setFormData((current) => ({ ...current, timezone: data.timezone }));
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setLoadingConfig(true);
    Promise.all([orgApi.me(), orgApi.plans(), orgApi.addons()])
      .then(([meRes, plansRes, addonsRes]) => {
        const normalizedPlans = asArray(plansRes).map(normalizePlan);
        const normalizedAddons = asArray(addonsRes).map(normalizeAddon);
        const matchedPlan =
          normalizedPlans.find(
            (plan) =>
              normalizeComparisonValue(plan.name) === normalizeComparisonValue(meRes.organization.plan)
          ) ||
          normalizedPlans[0] ||
          null;

        setOrgContext(meRes);
        setPlans(normalizedPlans);
        setAddons(normalizedAddons);
        setSelectedPlan(matchedPlan);
        setBillingName(meRes.organization.name || "");
        setBillingEmail(meRes.organization.billing_email || "");
        setFormData((current) => ({
          ...current,
          timezone: globalTimezone,
          organizer_details: {
            ...current.organizer_details,
            name: current.organizer_details.name || meRes.organization.name || "",
            email: current.organizer_details.email || meRes.organization.billing_email || "",
          },
        }));
      })
      .catch((error) => {
        console.error("Failed to load create-event configuration:", error);
        toast.error("Could not load plans and add-ons.");
      })
      .finally(() => setLoadingConfig(false));
  }, [globalTimezone]);

  useEffect(() => {
    if (!selectedPlan) return;
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
  }, [selectedPlan, selectedAddons]);

  const activePlanName = orgContext?.organization?.plan ?? "";
  const currentEventCount = orgContext?.event_count ?? 0;
  const currentEventLimit = orgContext?.plan_limits?.events ?? 0;
  const hasActivePlan = Boolean(orgContext?.organization?.is_active && currentEventLimit > 0);
  const normalizedActivePlan = normalizeComparisonValue(activePlanName);
  const remainingEvents = Math.max(currentEventLimit - currentEventCount, 0);
  const selectedPlanEventLimit = selectedPlan?.maxEvents ?? currentEventLimit;
  const selectedPlanMatchesCurrent = selectedPlan
    ? normalizeComparisonValue(selectedPlan.name) === normalizedActivePlan
    : false;
  const selectedPlanUnlocksEvent = selectedPlanEventLimit > currentEventCount;
  const requiresPurchase =
    !hasActivePlan || !selectedPlanMatchesCurrent || selectedAddons.length > 0 || remainingEvents <= 0;

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

  const reviewItems = [
    { label: "Plan", value: selectedPlan?.name || "Not selected" },
    { label: "Add-ons", value: selectedAddonRecords.length ? selectedAddonRecords.map((item) => item.name).join(", ") : "None" },
    { label: "Event name", value: formData.name || "Pending" },
    { label: "Dates", value: formData.start_date && formData.end_date ? `${formData.start_date} to ${formData.end_date}` : "Pending" },
    { label: "Venue", value: formData.venue_name || formData.location || "Pending" },
    { label: "Timezone", value: formData.timezone || "Pending" },
  ];

  const canContinueBasics = Boolean(
    formData.name.trim() &&
      formData.short_code.trim() &&
      formData.organizer_details.name.trim() &&
      formData.organizer_details.email.trim()
  );

  const canContinueVenue = Boolean(formData.start_date && formData.end_date && formData.timezone);
  const canContinueActivation = Boolean(selectedPlan && selectedPlanUnlocksEvent && (!requiresPurchase || subscriptionActivated));

  const stepMeta = [
    { label: "Basics", description: "Name, code, organizer" },
    { label: "Date & Venue", description: "Schedule and location" },
    { label: "Plans & Add-ons", description: "Activation and entitlements" },
    { label: "Publish", description: "Review and create" },
  ];

  const handleToggleAddon = (value: string) => {
    setSelectedAddons((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    );
  };

  const handleActivatePlan = async () => {
    if (!selectedPlan) {
      toast.error("Choose a plan first.");
      return;
    }
    if (!billingName || !billingEmail || !billingPhone) {
      toast.error("Add billing contact details.");
      return;
    }
    if (!cardholder || !cardNo || !expiry || !cvv) {
      toast.error("Add card details.");
      return;
    }

    setLoading(true);
    try {
      await orgApi.subscribe({
        plan_name: selectedPlan.name,
        addon_keys: selectedAddons,
        is_custom: false,
        custom_limits: null,
        promo_code: null,
        billing_name: billingName,
        billing_email: billingEmail,
        billing_phone: billingPhone,
        gst_number: gstNumber || null,
        cardholder_name: cardholder,
        card_number: cardNo,
        expiry,
        cvv,
      });
      setSubscriptionActivated(true);
      toast.success("Plan activated successfully.");
    } catch (error: any) {
      toast.error(error?.message || "Failed to activate plan.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEvent = async () => {
    if (!selectedPlan) {
      toast.error("Select a plan before creating the event.");
      return;
    }
    if (requiresPurchase && !subscriptionActivated) {
      toast.error("Activate the workspace plan before creating the event.");
      return;
    }

    setLoading(true);
    try {
      const created = await createEvent.mutateAsync(formData);
      setSuccessEvent(created);
      setStep(4);
      toast.success("Event created successfully.");
    } catch (error: any) {
      toast.error(error?.message || "Failed to create event.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <EnterprisePageIntro
        title="Create Event"
        subtitle="Build the event on a full page, keep the existing organizer setup logic, and activate the plan only when the workspace needs a new event slot."
        action={
          <Button variant="ghost" onClick={() => router.push("/events")}>
            <ArrowLeft className="h-4 w-4" />
            Exit Creation
          </Button>
        }
      />

      {loadingConfig ? (
        <EnterprisePanel className="p-12">
          <div className="flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-7 w-7 animate-spin text-[var(--color-primary-mid)]" />
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
              Syncing event builder
            </p>
          </div>
        </EnterprisePanel>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[240px_minmax(0,1fr)_340px]">
          <EnterprisePanel className="h-fit p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
              Steps
            </p>
            <div className="mt-5 space-y-4">
              {stepMeta.map((item, index) => {
                const active = step === index;
                const complete = step > index || step === 4;
                return (
                  <div key={item.label} className="flex items-start gap-3">
                    <div
                      className={[
                        "mt-0.5 flex h-8 w-8 items-center justify-center rounded-full border text-[11px] font-bold",
                        active || complete
                          ? "border-[rgba(224,255,0,0.24)] bg-[rgba(224,255,0,0.14)] text-[var(--color-primary-mid)]"
                          : "border-[var(--color-border)] text-[var(--color-text-muted)]",
                      ].join(" ")}
                    >
                      {complete ? <Check className="h-4 w-4" /> : index + 1}
                    </div>
                    <div>
                      <p className={active ? "text-[13px] font-semibold text-[var(--color-text-primary)]" : "text-[13px] font-semibold text-[var(--color-text-secondary)]"}>
                        {item.label}
                      </p>
                      <p className="text-[11px] text-[var(--color-text-muted)]">{item.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </EnterprisePanel>

          <EnterprisePanel className="min-h-[720px] p-6 md:p-8">
            {step === 0 ? (
              <div className="space-y-6">
                <SectionHeader title="Basics" description="Start with the event identity and organizer contact details." />
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    label="Event Name"
                    value={formData.name}
                    onChange={(value) => setFormData((current) => ({ ...current, name: value }))}
                    icon={Sparkles}
                  />
                  <FormField
                    label="Short Code"
                    value={formData.short_code}
                    onChange={(value) =>
                      setFormData((current) => ({ ...current, short_code: value.toUpperCase().slice(0, 10) }))
                    }
                    icon={Hash}
                  />
                  <FormField
                    label="Organizer Name"
                    value={formData.organizer_details.name}
                    onChange={(value) =>
                      setFormData((current) => ({
                        ...current,
                        organizer_details: { ...current.organizer_details, name: value },
                      }))
                    }
                  />
                  <FormField
                    label="Organizer Email"
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
                    label="Organizer Phone"
                    value={formData.organizer_details.phone}
                    onChange={(value) =>
                      setFormData((current) => ({
                        ...current,
                        organizer_details: { ...current.organizer_details, phone: value },
                      }))
                    }
                    icon={Phone}
                  />
                  <FormField
                    label="Website"
                    value={formData.organizer_details.website}
                    onChange={(value) =>
                      setFormData((current) => ({
                        ...current,
                        organizer_details: { ...current.organizer_details, website: value },
                      }))
                    }
                    icon={Globe}
                  />
                </div>
              </div>
            ) : null}

            {step === 1 ? (
              <div className="space-y-6">
                <SectionHeader title="Date & Venue" description="Add schedule, timezone, and location details for the event." />
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <FormField
                    label="Start Date"
                    value={formData.start_date}
                    onChange={(value) => setFormData((current) => ({ ...current, start_date: value }))}
                    type="date"
                    icon={Calendar}
                  />
                  <FormField
                    label="End Date"
                    value={formData.end_date}
                    onChange={(value) => setFormData((current) => ({ ...current, end_date: value }))}
                    type="date"
                    icon={Calendar}
                  />
                  <FormField
                    label="Timezone"
                    value={formData.timezone}
                    onChange={(value) => setFormData((current) => ({ ...current, timezone: value }))}
                    icon={Globe}
                  />
                  <FormField
                    label="Venue Name"
                    value={formData.venue_name}
                    onChange={(value) => setFormData((current) => ({ ...current, venue_name: value }))}
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    label="Location"
                    value={formData.location}
                    onChange={(value) => setFormData((current) => ({ ...current, location: value }))}
                    icon={MapPin}
                  />
                  <SelectField
                    label="Country"
                    value={formData.country}
                    onChange={(value) => setFormData((current) => ({ ...current, country: value, state: "" }))}
                    options={countryStates.map((entry) => ({ label: entry.country, value: entry.country }))}
                  />
                  <SelectField
                    label="State / Province"
                    value={formData.state}
                    onChange={(value) => setFormData((current) => ({ ...current, state: value }))}
                    options={getStatesForCountry(countryStates, formData.country).map((state) => ({ label: state, value: state }))}
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <ToggleCard
                    label="Speaker Workspace"
                    checked={formData.speaker_settings.enabled}
                    onCheckedChange={(checked) =>
                      setFormData((current) => ({
                        ...current,
                        speaker_settings: { ...current.speaker_settings, enabled: checked },
                      }))
                    }
                  />
                  <ToggleCard
                    label="Registration Workspace"
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

            {step === 2 ? (
              <div className="space-y-6">
                <SectionHeader title="Plans & Add-ons" description="Use the current workspace entitlements and activate a new event slot only when needed." />
                <WorkspaceStateCard
                  activePlanName={activePlanName || "No active plan"}
                  stateLabel={remainingEvents > 0 ? `${remainingEvents} event slot left` : "No event slots left"}
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
                        onClick={() => {
                          setSelectedPlan(plan);
                          setSubscriptionActivated(false);
                        }}
                        className={[
                          "rounded-[26px] border p-5 text-left transition-all duration-200 hover:-translate-y-1",
                          isSelected
                            ? "border-[rgba(224,255,0,0.28)] bg-[rgba(224,255,0,0.06)]"
                            : "border-[var(--color-border)] bg-white/[0.02]",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
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
                      </button>
                    );
                  })}
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  {addons.map((addon) => {
                    const selected = selectedAddons.includes(addon.rawKey);
                    return (
                      <button
                        key={addon.id ?? addon.key ?? addon.name}
                        type="button"
                        onClick={() => {
                          handleToggleAddon(addon.rawKey);
                          setSubscriptionActivated(false);
                        }}
                        className={[
                          "rounded-[24px] border p-5 text-left transition-all duration-200 hover:-translate-y-1",
                          selected
                            ? "border-[rgba(224,255,0,0.28)] bg-[rgba(224,255,0,0.06)]"
                            : "border-[var(--color-border)] bg-white/[0.02]",
                        ].join(" ")}
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

                {requiresPurchase ? (
                  <div className="rounded-[24px] border border-[var(--color-border)] bg-white/[0.03] p-5">
                    <h4 className="text-[18px] font-semibold text-[var(--color-text-primary)]">Activation details</h4>
                    <p className="mt-2 text-[13px] text-[var(--color-text-secondary)]">
                      This workspace needs a backend-backed plan activation before a new event can be created.
                    </p>
                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      <FormField label="Billing Name" value={billingName} onChange={setBillingName} />
                      <FormField label="Billing Email" value={billingEmail} onChange={setBillingEmail} type="email" />
                      <FormField label="Billing Phone" value={billingPhone} onChange={setBillingPhone} icon={Phone} />
                      <FormField label="GST Number" value={gstNumber} onChange={setGstNumber} />
                      <FormField label="Card Holder" value={cardholder} onChange={setCardholder} />
                      <FormField label="Card Number" value={cardNo} onChange={setCardNo} icon={CreditCard} />
                      <FormField label="Expiry" value={expiry} onChange={setExpiry} />
                      <FormField label="CVV" value={cvv} onChange={setCvv} type="password" />
                    </div>
                    <div className="mt-5 flex items-center justify-between gap-4">
                      <p className="text-[12px] text-[var(--color-text-muted)]">
                        Total {calculating ? "is recalculating" : `will be ${formatCurrency(totalPrice)}`}.
                      </p>
                      <Button disabled={loading} onClick={handleActivatePlan}>
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {subscriptionActivated ? "Activated" : "Activate Plan"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[24px] border border-[rgba(224,255,0,0.16)] bg-[rgba(224,255,0,0.06)] p-5">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary-mid)]">
                      Existing entitlement is enough
                    </p>
                    <p className="mt-2 text-[13px] text-[var(--color-text-primary)]">
                      The active plan already allows another event. You can continue without another purchase.
                    </p>
                  </div>
                )}
              </div>
            ) : null}

            {step === 3 ? (
              <div className="space-y-6">
                <SectionHeader title="Review & Publish" description="Confirm the event details, plan, and activation state before creation." />
                <div className="grid gap-4 md:grid-cols-2">
                  {reviewItems.map((item) => (
                    <div key={item.label} className="rounded-[22px] border border-[var(--color-border)] bg-white/[0.03] p-4">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-muted)]">{item.label}</p>
                      <p className="mt-2 text-[14px] font-semibold text-[var(--color-text-primary)]">{item.value}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-[24px] border border-[var(--color-border)] bg-white/[0.03] p-5">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                    What happens next
                  </p>
                  <div className="mt-4 space-y-3 text-[13px] text-[var(--color-text-secondary)]">
                    <p>1. The event record is created with the selected module settings.</p>
                    <p>2. The plan and add-ons remain associated with the workspace through the backend subscription flow.</p>
                    <p>3. Your team can continue into speaker and registration surfaces immediately after creation.</p>
                  </div>
                </div>
              </div>
            ) : null}

            {step === 4 ? (
              <div className="flex min-h-[620px] flex-col items-center justify-center space-y-6 text-center">
                <div className="hex-icon-shell flex h-20 w-20 items-center justify-center">
                  <CheckCircle2 className="h-9 w-9 text-[var(--color-text-primary)]" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-[28px] font-bold tracking-[-0.05em] text-[var(--color-text-primary)]">
                    Event ready
                  </h3>
                  <p className="text-[13px] text-[var(--color-text-secondary)]">
                    {successEvent?.name || formData.name} was created successfully.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Button
                    onClick={() =>
                      router.push(successEvent?.id ? `/events/${successEvent.id}/speaker/dashboard` : "/events")
                    }
                  >
                    Go to Event Dashboard
                  </Button>
                  <Button variant="outline" onClick={() => router.push("/events")}>
                    Back to Events
                  </Button>
                </div>
              </div>
            ) : null}
          </EnterprisePanel>

          <EnterprisePanel className="h-fit p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
              Workspace summary
            </p>
            <div className="mt-4 space-y-4">
              <SummaryRow label="Active plan" value={activePlanName || "Not active"} />
              <SummaryRow label="Slots used" value={`${currentEventCount} / ${currentEventLimit || 0}`} />
              <SummaryRow label="Selected plan" value={selectedPlan?.name || "None"} />
              <SummaryRow
                label="Add-ons"
                value={selectedAddonRecords.length ? `${selectedAddonRecords.length} selected` : "None"}
              />
              <SummaryRow
                label="Total"
                value={calculating ? "Calculating..." : formatCurrency(totalPrice)}
                strong
              />
            </div>
            {remainingEvents <= 0 ? (
              <p className="mt-4 text-[12px] text-[var(--color-warning)]">
                A new event slot must be activated before publishing this event.
              </p>
            ) : null}
          </EnterprisePanel>
        </div>
      )}

      {step < 4 && !loadingConfig ? (
        <div className="sticky bottom-0 z-20">
          <EnterprisePanel className="flex flex-wrap items-center justify-between gap-3 border border-[var(--color-border)] px-5 py-4">
            <div className="text-[12px] text-[var(--color-text-muted)]">
              Step {Math.min(step + 1, 4)} of 4
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {step > 0 ? (
                <Button variant="ghost" onClick={() => setStep((current) => Math.max(0, current - 1) as StepId)}>
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => router.push("/events")}>
                  Cancel
                </Button>
              )}

              {step === 0 ? (
                <Button disabled={!canContinueBasics} onClick={() => setStep(1)}>
                  Continue to Date & Venue
                  <ChevronRight className="h-4 w-4" />
                </Button>
              ) : null}

              {step === 1 ? (
                <Button disabled={!canContinueVenue} onClick={() => setStep(2)}>
                  Continue to Plans & Add-ons
                  <ChevronRight className="h-4 w-4" />
                </Button>
              ) : null}

              {step === 2 ? (
                <Button disabled={!canContinueActivation} onClick={() => setStep(3)}>
                  Continue to Publish
                  <ChevronRight className="h-4 w-4" />
                </Button>
              ) : null}

              {step === 3 ? (
                <Button disabled={loading} onClick={handleCreateEvent}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Publish Event
                </Button>
              ) : null}
            </div>
          </EnterprisePanel>
        </div>
      ) : null}
    </div>
  );
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-2">
      <h2 className="text-[28px] font-bold tracking-[-0.05em] text-[var(--color-text-primary)]">{title}</h2>
      <p className="text-[13px] leading-6 text-[var(--color-text-secondary)]">{description}</p>
    </div>
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
          className={["h-12 rounded-2xl border-[var(--color-border)] bg-white/[0.03] text-[var(--color-text-primary)]", Icon ? "pl-11" : ""].join(" ")}
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
