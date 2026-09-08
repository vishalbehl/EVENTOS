"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  Lock,
  MapPin,
  Phone,
  Sparkles,

  Upload,
  X,
  Zap,
  Building2,

  Tag,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useCreateEvent } from "@/hooks/useEvents";
import { CountryStateEntry, fetchCountryStates, getStatesForCountry } from "@/lib/country-states";
import { orgApi } from "@/components/organizer/org/org-api";
import { EnterprisePageIntro, EnterprisePanel } from "@/components/organizer/platform/EnterprisePortal";
import { apiClient } from "@/lib/api-client";
import {
  CommercialPlanCard,
  CommercialAddonCard,
  type PlanActionVariant,
} from "@/components/organizer/platform/CommercialCards";
import { useOrganizationLimitAccess } from "@/lib/capabilities";
import { useAuthStore } from "@/store/use-auth-store";

// ─── Types ───────────────────────────────────────────────────────────────────

type StepId = 0 | 1 | 2 | 3 | 4;

type BillingPlan = {
  id?: string;
  key?: string;
  name: string;
  description: string;
  tagline: string;
  price: number | null;
  price_display?: string;
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

const initialFormData = {
  name: "",
  short_code: "",
  tagline: "",
  description: "",
  location: "",
  venue_name: "",
  country: "",
  state: "",
  map_link: "",
  venue_images: [] as string[],
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
  upload_deadline: "",
  max_file_size_mb: 500,
  allowed_formats: ["pptx", "pdf", "mp4"],
  speaker_settings: { enabled: true, window_required: true },
  registration_settings: {
    enabled: true,
    registration_allowed: true,
    participants_list_allowed: true,
  },
};

const availableFormats = ["pptx", "pdf", "mp4", "key", "zip", "png", "jpg"];

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
    price: toNumber(
      plan.price_per_event ??
      plan.price ??
      plan.price_inr ??
      plan.base_price ??
      plan.final_price ??
      plan.amount
    ),
    price_display: plan.price_display ? String(plan.price_display) : undefined,
    currency: String(plan.currency ?? "INR"),
    maxEvents: Number(plan.limits?.max_events ?? 0),
    maxUsers: Number(plan.limits?.max_users ?? 0),
    maxRegistrations: Number(plan.limits?.max_registrations ?? plan.max_registrations ?? 0),
    maxSpeakers: Number(plan.limits?.max_speakers ?? plan.max_speakers ?? 0),
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
    description: String(addon.description ?? addon.tagline ?? addon.short_description ?? ""),
    price: toNumber(
      addon.price_inr ??
      addon.final_price ??
      addon.price ??
      addon.amount
    ),
    currency: String(addon.currency ?? "INR"),
    features: [
      ...asArray<string>(addon.feature_highlights),
      ...asArray<string>(addon.features_preview),
      ...asArray<string>(addon.enabled_features),
    ].filter(Boolean),
  };
}

function formatCurrency(value: number | null | undefined, currency = "INR") {
  if (value === null || value === undefined) return "Free";
  if (value === 0) return "Free";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `₹${value.toLocaleString("en-IN")}`;
  }
}

// ─── Review & Deploy Panel ────────────────────────────────────────────────────

function ReviewInfoBlock({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <p className="text-[14px] font-semibold text-[var(--color-text-primary)] leading-snug">{value || "—"}</p>
    </div>
  );
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4 rounded-lg border border-[var(--op-border)] bg-[var(--op-panel-bg)] p-5">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">{title}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {children}
      </div>
    </div>
  );
}

// ─── Inner component that uses useSearchParams ────────────────────────────────

function NewEventPageInner() {
  const eventLimitAccess = useOrganizationLimitAccess("max_events");
  const router = useRouter();
  const searchParams = useSearchParams();
  const createEvent = useCreateEvent();

  const [step, setStep] = useState<StepId>(0);
  const [globalTimezone, setGlobalTimezone] = useState("Asia/Kolkata");
  const [countryStates, setCountryStates] = useState<CountryStateEntry[]>([]);
  const [formData, setFormData] = useState(initialFormData);
  const [pendingVenueImages, setPendingVenueImages] = useState<
    Array<{ file: File; previewUrl: string }>
  >([]);
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
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [commercialRequestId, setCommercialRequestId] = useState<string | null>(null);
  const [subscriptionActivated, setSubscriptionActivated] = useState(false);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
  const [currentBillingPlan, setCurrentBillingPlan] = useState<Record<string, any> | null>(null);
  const [successEvent, setSuccessEvent] = useState<any | null>(null);

  // URL param pre-selection
  const preselectedPlanId = searchParams.get("plan");
  const preselectedAddonIds = (searchParams.get("addons") ?? "")
    .split(",")
    .filter(Boolean);

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
    Promise.allSettled([orgApi.me(), orgApi.plans(), orgApi.addons(), orgApi.currentBillingPlan()])
      .then((results) => {
        const [meResult, plansResult, addonsResult, billingResult] = results;
        if (
          meResult.status !== "fulfilled" ||
          plansResult.status !== "fulfilled" ||
          addonsResult.status !== "fulfilled"
        ) {
          throw new Error("Failed to load create-event configuration.");
        }

        const meRes = meResult.value;
        const plansRes = plansResult.value;
        const addonsRes = addonsResult.value;
        const normalizedPlans = asArray(plansRes).map(normalizePlan);
        const normalizedAddons = asArray(addonsRes).map(normalizeAddon);

        // URL param pre-selection takes priority, then active plan matching
        let matchedPlan: BillingPlan | null = null;
        if (preselectedPlanId) {
          matchedPlan =
            normalizedPlans.find(
              (p) =>
                p.id === preselectedPlanId ||
                p.key === preselectedPlanId ||
                normalizeComparisonValue(p.name) === normalizeComparisonValue(preselectedPlanId)
            ) ?? null;
        }
        const billingPlan = billingResult.status === "fulfilled" ? billingResult.value : null;
        if (!matchedPlan) {
          matchedPlan =
            normalizedPlans.find(
              (plan) =>
                normalizeComparisonValue(plan.name) ===
                normalizeComparisonValue(String(billingPlan?.plan?.name ?? ""))
            ) ||
            normalizedPlans[0] ||
            null;
        }

        // Pre-select addons from URL params
        const preAddonKeys = preselectedAddonIds.flatMap((id) => {
          const match = normalizedAddons.find(
            (a) =>
              a.id === id ||
              a.key === id ||
              a.rawKey === id ||
              normalizeComparisonValue(a.name) === normalizeComparisonValue(id)
          );
          return match ? [match.rawKey] : [];
        });

        setOrgContext(meRes);
        setPlans(normalizedPlans);
        setAddons(normalizedAddons);
        setSelectedPlan(matchedPlan);
        setCurrentBillingPlan(billingPlan);
        if (preAddonKeys.length > 0) setSelectedAddons(preAddonKeys);
        if (billingResult.status === "fulfilled") {
          setSubscriptionId(billingResult.value?.subscription_id ? String(billingResult.value.subscription_id) : null);
        } else {
          setSubscriptionId(null);
        }

        const currentEventLimit = Number(billingPlan?.usage?.events?.max ?? meRes.plan_limits?.events ?? 0);
        const org = meRes.organization;
        const u = (meRes as any).user;
        const initialBillingName = (org as any)?.billing_name || org?.name || u?.full_name || "";
        const initialBillingEmail = org?.billing_email || u?.email || "";
        const initialBillingPhone = (org as any)?.billing_phone || (org as any)?.phone || u?.phone || "";

        setBillingName(initialBillingName);
        setBillingEmail(initialBillingEmail);
        setBillingPhone(initialBillingPhone);
        setFormData((current) => ({
          ...current,
          timezone: globalTimezone,
          organizer_details: {
            ...current.organizer_details,
            name: current.organizer_details.name || initialBillingName,
            email: current.organizer_details.email || initialBillingEmail,
            phone: current.organizer_details.phone || initialBillingPhone,
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

  const authUser = useAuthStore((s) => s.user);

  const isDefaultOrg = useMemo(() => {
    const org = orgContext?.organization;
    return Boolean(
      (org as any)?.is_platform_org ||
      (org as any)?.is_internal_unrestricted ||
      org?.slug?.toLowerCase() === "eventos" ||
      org?.slug?.toLowerCase() === "default-org" ||
      (orgContext as any)?.user?.is_platform_admin ||
      authUser?.is_platform_admin ||
      (authUser as any)?.role === "super_admin" ||
      (authUser as any)?.role === "developer" ||
      (authUser as any)?.organization_slug?.toLowerCase() === "eventos" ||
      (authUser as any)?.organization_slug?.toLowerCase() === "default-org"
    );
  }, [orgContext, authUser]);

  const activePlanName = String(
    currentBillingPlan?.plan?.name ?? orgContext?.commercial?.plan_name ?? ""
  );
  const currentEventCount = orgContext?.event_count ?? 0;
  const billingStatus = String(currentBillingPlan?.status ?? "").toUpperCase();
  const currentEventLimit = Number(currentBillingPlan?.usage?.events?.max ?? orgContext?.plan_limits?.events ?? 0);
  const hasActiveSubscription = Boolean(
    orgContext?.organization?.is_active &&
    (["ACTIVE", "TRIAL"].includes(billingStatus) || Boolean(subscriptionId))
  );
  const skipCommercial = isDefaultOrg || hasActiveSubscription;
  const hasActiveSlot = Boolean(hasActiveSubscription && currentEventLimit > currentEventCount);
  const normalizedActivePlan = normalizeComparisonValue(activePlanName);
  const remainingEvents = Math.max(currentEventLimit - currentEventCount, 0);
  const selectedPlanEventLimit = selectedPlan?.maxEvents ?? currentEventLimit;
  const selectedPlanMatchesCurrent = selectedPlan
    ? normalizeComparisonValue(selectedPlan.name) === normalizedActivePlan
    : false;
  const selectedPlanUnlocksEvent = selectedPlanEventLimit > currentEventCount;
  const requiresPurchase = skipCommercial
    ? false
    : (!hasActiveSlot || selectedAddons.length > 0 || Boolean(selectedPlan && !selectedPlanMatchesCurrent && (selectedPlan.price ?? 0) > 0));

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

  // ── Step meta (3 steps if active subscription exists or default org, else 5 steps) ────────
  const stepMeta = skipCommercial
    ? [
        { label: "Basics", description: "Identity & contacts" },
        { label: "Venue & Schedule", description: "Location & dates" },
        { label: "Review & Deploy", description: "Deploy event" },
      ]
    : [
        { label: "Basics", description: "Identity & contacts" },
        { label: "Venue & Schedule", description: "Location & dates" },
        { label: "Choose Plan", description: "Workspace tier" },
        { label: "Add-ons", description: "Optional modules" },
        { label: "Review & Pay", description: "Deploy" },
      ];

  const canContinueBasics = Boolean(
    formData.name.trim() &&
      formData.short_code.trim() &&
      formData.organizer_details.name.trim() &&
      formData.organizer_details.email.trim()
  );

  const canContinueVenue = Boolean(
    formData.start_date && formData.end_date && formData.timezone
  );

  const canContinuePlan = Boolean(selectedPlan);
  // Add-ons step is always continuable
  const canContinueAddons = true;
  const canContinueReview = Boolean(
    (isDefaultOrg || selectedPlan) && (subscriptionActivated || !requiresPurchase)
  );

  const handleToggleAddon = (value: string) => {
    setSelectedAddons((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    );
  };

  const handleToggleFormat = (format: string) => {
    setFormData((current) => {
      const active = current.allowed_formats.includes(format);
      const updated = active
        ? current.allowed_formats.filter((f) => f !== format)
        : [...current.allowed_formats, format];
      return { ...current, allowed_formats: updated };
    });
  };

  const handleUploadTempImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith("image/")) {
      toast.error("Select a valid image file.");
      return;
    }
    setPendingVenueImages((current) => [
      ...current,
      { file, previewUrl: URL.createObjectURL(file) },
    ]);
    e.target.value = "";
  };

  const handleRemoveImage = (index: number) => {
    setPendingVenueImages((current) => {
      const removed = current[index];
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((_, idx) => idx !== index);
    });
    toast.success("Venue image removed.");
  };

  const handleCommercialAccessRequest = async () => {
    if (!selectedPlan) {
      throw new Error("Select a plan before requesting access.");
    }
    const resolvedName =
      billingName.trim() ||
      formData.organizer_details.name.trim() ||
      orgContext?.organization?.name ||
      "Organiser";
    const resolvedEmail =
      billingEmail.trim() ||
      formData.organizer_details.email.trim() ||
      orgContext?.organization?.billing_email ||
      "billing@eventos.internal";
    const resolvedPhone =
      billingPhone.trim() ||
      formData.organizer_details.phone.trim() ||
      (orgContext?.organization as any)?.billing_phone ||
      (orgContext?.organization as any)?.phone ||
      "+91 9876543210";

    const result = await orgApi.requestCommercialAccess({
      plan_name: selectedPlan.name,
      addon_keys: selectedAddons,
      billing_name: resolvedName,
      billing_email: resolvedEmail,
      billing_phone: resolvedPhone,
      gst_number: gstNumber.trim() || null,
      reason: `Request access to ${selectedPlan.name} for a new event workspace`,
    });
    setCommercialRequestId(String(result.id));
    return result;
  };

  const handleCreateEvent = async () => {
    if (!isDefaultOrg && !selectedPlan) {
      toast.error("Select a plan before creating the event.");
      return;
    }

    setLoading(true);
    try {
      if (!isDefaultOrg && requiresPurchase && !commercialRequestId) {
        try {
          await handleCommercialAccessRequest();
        } catch (commErr) {
          console.warn("Commercial request note:", commErr);
        }
      }

      const payload = {
        ...formData,
        organizer_name: formData.organizer_details.name || null,
        upload_deadline: formData.upload_deadline ? new Date(formData.upload_deadline).toISOString() : null,
      };

      const created = await createEvent.mutateAsync(payload);

      let resolvedSubscriptionId = subscriptionId;
      if (!resolvedSubscriptionId) {
        try {
          const currentPlan = await orgApi.currentBillingPlan();
          setCurrentBillingPlan(currentPlan);
          resolvedSubscriptionId = currentPlan?.subscription_id ? String(currentPlan.subscription_id) : null;
          if (resolvedSubscriptionId) {
            setSubscriptionId(resolvedSubscriptionId);
          }
        } catch {
          // ignore
        }
      }

      if (resolvedSubscriptionId) {
        try {
          await orgApi.activateEvent(String(created.id), resolvedSubscriptionId);
        } catch {
          // ignore
        }
      }
      const failedVenueUploads: string[] = [];
      for (const image of pendingVenueImages) {
        const upload = new FormData();
        upload.append("file", image.file);
        try {
          await apiClient.post(
            `/events/${created.id}/venue-images/upload`,
            upload,
            {
              headers: {
                "Content-Type": undefined,
                "Idempotency-Key": crypto.randomUUID(),
              },
            }
          );
          URL.revokeObjectURL(image.previewUrl);
        } catch {
          failedVenueUploads.push(image.file.name);
        }
      }
      setSuccessEvent(created);
      if (failedVenueUploads.length > 0) {
        toast.warning(
          `Event created, but ${failedVenueUploads.length} venue image upload(s) failed. Add them from Event Planning.`
        );
      } else {
        toast.success("Event created successfully.");
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to create event.");
    } finally {
      setLoading(false);
    }
  };

  // ── Plan card helper ────────────────────────────────────────────────────────
  function getPlanActionVariant(planName: string, planIdx: number): PlanActionVariant {
    const isSelected = selectedPlan?.name === planName;
    if (isSelected) return "current";
    return "choose";
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 pb-10 max-w-4xl mx-auto w-full pt-4">
      <div className="flex items-center justify-end">
        <Button variant="ghost" onClick={() => router.push("/events")} className="rounded-lg">
          <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
          Exit Creator
        </Button>
      </div>

      {/* Success Screen */}
      {successEvent ? (
        <EnterprisePanel className="p-10">
          <div className="flex flex-col items-center justify-center text-center gap-6 py-6">
            <div className="relative">
              <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-[color-mix(in_srgb,var(--op-success)_40%,transparent)] bg-[color-mix(in_srgb,var(--op-success)_8%,transparent)]">
                <CheckCircle2 className="h-10 w-10 text-[var(--op-success)]" aria-hidden="true" />
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-[28px] font-bold tracking-tight text-[var(--color-text-primary)]">
                Event Provisioned
              </h3>
              <p className="text-[14px] text-[var(--color-text-secondary)]">
                <span className="font-semibold text-[var(--color-text-primary)]">
                  {successEvent?.name || formData.name}
                </span>{" "}
                was successfully created and activated.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button
                onClick={() =>
                  router.push(
                    successEvent?.id ? `/events/${successEvent.id}/dashboard` : "/events"
                  )
                }
                className="h-12 rounded-lg bg-[var(--op-primary)] px-8 font-semibold text-white hover:opacity-90"
              >
                Go to Event Dashboard
              </Button>
              <Button variant="outline" onClick={() => router.push("/events")} className="h-12 rounded-lg px-8">
                Back to Events
              </Button>
            </div>
          </div>
        </EnterprisePanel>
      ) : loadingConfig ? (
        <EnterprisePanel className="p-12">
          <div className="flex flex-col items-center justify-center gap-3 py-10">
            <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary-mid)]" aria-hidden="true" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
              Syncing event builder…
            </p>
          </div>
        </EnterprisePanel>
      ) : (
        <div className="space-y-6">
          {/* ── Step Progress Bar ──────────────────────────────────────────── */}
          <div className="relative w-full rounded-lg border border-[var(--op-border)] bg-[var(--op-panel-bg)] p-6">
            <div className="absolute left-[8%] right-[8%] top-[40px] h-[1px] bg-[var(--color-border)] z-0 hidden md:block" />
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 md:gap-4 relative z-10">
              {stepMeta.map((item, index) => {
                const active = step === index;
                const complete = step > index;
                const canClick =
                  index === 0 ||
                  (index === 1 && canContinueBasics) ||
                  (index === 2 && canContinueBasics && canContinueVenue) ||
                  (index === 3 && canContinueBasics && canContinueVenue && canContinuePlan) ||
                  (index === 4 && canContinueBasics && canContinueVenue && canContinuePlan);

                return (
                  <button
                    key={item.label}
                    type="button"
                    disabled={!canClick}
                    onClick={() => setStep(index as StepId)}
                    className={[
                      "flex items-center gap-3 rounded-lg p-1 focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--op-primary)] md:flex-col md:gap-2 md:text-center",
                      canClick ? "cursor-pointer hover:opacity-90" : "cursor-default opacity-50",
                    ].join(" ")}
                  >
                    <div
                      className={[
                        "flex h-10 w-10 items-center justify-center rounded-full border text-[12px] font-bold",
                        active
                          ? "border-[var(--op-primary)] bg-[color-mix(in_srgb,var(--op-primary)_12%,var(--op-panel-bg))] text-[var(--op-primary)]"
                          : complete
                          ? "border-[color-mix(in_srgb,var(--op-success)_35%,var(--op-border))] bg-[color-mix(in_srgb,var(--op-success)_8%,var(--op-panel-bg))] text-[var(--op-success)]"
                          : "border-[var(--op-border)] bg-[var(--op-panel-soft)] text-[var(--op-muted)]",
                      ].join(" ")}
                    >
                      {complete ? <Check className="h-4 w-4" aria-hidden="true" /> : index + 1}
                    </div>
                    <div className="text-left md:text-center">
                      <p
                        className={[
                          "text-[12px] font-bold tracking-tight",
                          active ? "text-[var(--op-primary)]" : "text-[var(--op-text)]",
                        ].join(" ")}
                      >
                        {item.label}
                      </p>
                      <p className="text-[10px] text-[var(--color-text-muted)] hidden md:block">
                        {item.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Form Body ────────────────────────────────────────────────────── */}
          <EnterprisePanel className="min-h-[580px] p-6 md:p-8">

            {/* STEP 0 — BASICS */}
            {step === 0 && (
              <div className="space-y-6">
                <SectionHeader
                  title="Basics"
                  description="Specify the core identities, tagline, and details of the organizer."
                />
                <div className="space-y-6">
                  <FormField
                    id="event-name"
                    label="Event Name"
                    description="Provide the official title of your conference."
                    placeholder="e.g. World Tech Congress 2026…"
                    value={formData.name}
                    onChange={(value) => setFormData((current) => ({ ...current, name: value }))}
                    icon={Sparkles}
                  />
                  <FormField
                    id="short-code"
                    label="Short Code"
                    description="An uppercase alphanumeric identifier used in speaker URLs."
                    placeholder="e.g. WTC26…"
                    value={formData.short_code}
                    spellCheck={false}
                    onChange={(value) =>
                      setFormData((current) => ({
                        ...current,
                        short_code: value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 10),
                      }))
                    }
                    icon={Hash}
                  />
                  <FormField
                    id="tagline"
                    label="Event Tagline"
                    description="A catchy sub-slogan to display on public registration and speaker pages."
                    placeholder="e.g. Innovating the Future, Together…"
                    value={formData.tagline}
                    onChange={(value) => setFormData((current) => ({ ...current, tagline: value }))}
                    icon={Tag}
                  />
                  <FormTextArea
                    id="description"
                    label="Event Description"
                    description="A rich summary detailing the objectives and theme of the event."
                    placeholder="Provide a description of the topics and scope of the conference…"
                    value={formData.description}
                    onChange={(value) => setFormData((current) => ({ ...current, description: value }))}
                  />
                  <FormField
                    id="organizer-name"
                    label="Organizer Name"
                    description="Company or agency coordinating the logistics."
                    placeholder="e.g. Apex Global Group…"
                    value={formData.organizer_details.name}
                    onChange={(value) =>
                      setFormData((current) => ({
                        ...current,
                        organizer_details: { ...current.organizer_details, name: value },
                      }))
                    }
                    icon={Building2}
                  />
                  <FormField
                    id="organizer-email"
                    label="Organizer Email"
                    description="Contact email address for attendee inquiries."
                    placeholder="e.g. hello@apex-events.com…"
                    value={formData.organizer_details.email}
                    type="email"
                    spellCheck={false}
                    onChange={(value) =>
                      setFormData((current) => ({
                        ...current,
                        organizer_details: { ...current.organizer_details, email: value },
                      }))
                    }
                  />
                  <FormField
                    id="organizer-phone"
                    label="Organizer Phone"
                    description="Dedicated support hotline."
                    placeholder="e.g. +91 98765 43210…"
                    value={formData.organizer_details.phone}
                    type="tel"
                    onChange={(value) =>
                      setFormData((current) => ({
                        ...current,
                        organizer_details: { ...current.organizer_details, phone: value },
                      }))
                    }
                    icon={Phone}
                  />
                  <FormField
                    id="organizer-website"
                    label="Organizer Website"
                    description="URL to the organizer's primary site."
                    placeholder="e.g. https://apex-events.com…"
                    value={formData.organizer_details.website}
                    type="url"
                    spellCheck={false}
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
            )}

            {/* STEP 1 — VENUE & SCHEDULE */}
            {step === 1 && (
              <div className="space-y-6">
                <SectionHeader
                  title="Venue & Schedule"
                  description="Configure dates, regional settings, physical location, and module toggles."
                />
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      id="start-date"
                      label="Start Date"
                      description="Official start date."
                      value={formData.start_date}
                      onChange={(value) => setFormData((current) => ({ ...current, start_date: value }))}
                      type="date"
                      icon={Calendar}
                    />
                    <FormField
                      id="end-date"
                      label="End Date"
                      description="Official end date."
                      value={formData.end_date}
                      onChange={(value) => setFormData((current) => ({ ...current, end_date: value }))}
                      type="date"
                      icon={Calendar}
                    />
                  </div>
                  <FormField
                    id="timezone"
                    label="IANA Timezone"
                    description="System timezone for scheduler windows."
                    value={formData.timezone}
                    onChange={(value) => setFormData((current) => ({ ...current, timezone: value }))}
                    icon={Globe}
                  />
                  <FormField
                    id="venue-name"
                    label="Venue Name"
                    description="Name of the convention center, hotel, or building."
                    placeholder="e.g. Grand Convention Center Hall A…"
                    value={formData.venue_name}
                    onChange={(value) => setFormData((current) => ({ ...current, venue_name: value }))}
                    icon={Building2}
                  />
                  <FormField
                    id="location-city"
                    label="Venue City"
                    description="City where the venue resides."
                    placeholder="e.g. New Delhi…"
                    value={formData.location}
                    onChange={(value) => setFormData((current) => ({ ...current, location: value }))}
                    icon={MapPin}
                  />
                  <SelectField
                    id="country"
                    label="Country"
                    description="Country of the event venue."
                    value={formData.country}
                    onChange={(value) => setFormData((current) => ({ ...current, country: value, state: "" }))}
                    options={countryStates.map((entry) => ({ label: entry.country, value: entry.country }))}
                  />
                  <SelectField
                    id="state"
                    label="State / Province"
                    description="Region or state of the event venue."
                    value={formData.state}
                    onChange={(value) => setFormData((current) => ({ ...current, state: value }))}
                    options={getStatesForCountry(countryStates, formData.country).map((state) => ({
                      label: state,
                      value: state,
                    }))}
                  />
                  <FormField
                    id="map-link"
                    label="Google Maps Link"
                    description="Direct Google Maps URL to display location maps for attendees."
                    placeholder="e.g. https://maps.google.com/?q=…"
                    value={formData.map_link}
                    type="url"
                    spellCheck={false}
                    onChange={(value) => setFormData((current) => ({ ...current, map_link: value }))}
                    icon={MapPin}
                  />

                  {/* Venue Images */}
                  <div className="space-y-2">
                    <label className="text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--color-text-primary)]">
                      Venue Gallery Images
                    </label>
                    <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
                      Upload images representing the venue. These will render in your portals.
                    </p>
                    {pendingVenueImages.length > 0 ? (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                        {pendingVenueImages.map((image, idx) => (
                          <div key={idx} className="relative rounded-xl overflow-hidden border border-[var(--color-border)] aspect-video bg-black/40">
                            <img src={image.previewUrl} alt={`Venue ${idx + 1}`} className="h-full w-full object-cover" />
                            <button
                              type="button"
                              onClick={() => handleRemoveImage(idx)}
                              className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 border border-white/20 hover:bg-black/90 transition-colors"
                            >
                              <X className="h-3 w-3 text-white" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[13px] text-[var(--color-text-muted)] italic py-2">
                        No venue images added yet.
                      </p>
                    )}
                    <input
                      id="temp-venue-image-upload-input"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleUploadTempImage}
                    />
                    <Button
                      type="button"
                      onClick={() => document.getElementById("temp-venue-image-upload-input")?.click()}
                      className="flex h-12 items-center gap-2 rounded-lg border border-[var(--op-border)] bg-[var(--op-panel-soft)] px-6 font-semibold text-[var(--op-primary)] hover:border-[var(--op-primary)] disabled:opacity-50"
                    >
                      <Upload className="h-4 w-4" />
                      Upload Venue Image
                    </Button>
                  </div>

                  {/* Upload settings (collapsed from old step 2) */}
                  <div className="space-y-4 rounded-lg border border-[var(--op-border)] bg-[var(--op-panel-bg)] p-6">
                    <h4 className="text-[13px] font-bold uppercase tracking-wider text-[var(--color-text-primary)]">
                      Upload Settings & Modules
                    </h4>
                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField
                        id="upload-deadline"
                        label="Upload Deadline"
                        description="Cut-off date/time for speaker files."
                        value={formData.upload_deadline}
                        onChange={(value) => setFormData((current) => ({ ...current, upload_deadline: value }))}
                        type="datetime-local"
                      />
                      <FormField
                        id="max-file-size"
                        label="Max File Size (MB)"
                        description="Maximum size for uploaded files."
                        placeholder="e.g. 500…"
                        value={formData.max_file_size_mb.toString()}
                        onChange={(value) =>
                          setFormData((current) => ({ ...current, max_file_size_mb: Number(value) || 500 }))
                        }
                        type="number"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--color-text-primary)]">
                        Allowed File Extensions
                      </label>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {availableFormats.map((format) => {
                          const isSelected = formData.allowed_formats.includes(format);
                          return (
                            <button
                              key={format}
                              type="button"
                              onClick={() => handleToggleFormat(format)}
                              className={[
                                "rounded-full border px-4 py-2 text-[12px] font-bold uppercase tracking-wider focus:outline-none focus:ring-1 focus:ring-[var(--op-primary)]",
                                isSelected
                                  ? "border-[var(--op-primary)] bg-[color-mix(in_srgb,var(--op-primary)_12%,var(--op-panel-bg))] text-[var(--op-primary)]"
                                  : "border-[var(--op-border)] bg-[var(--op-panel-soft)] text-[var(--op-muted)] hover:border-[var(--op-primary)]",
                              ].join(" ")}
                            >
                              {format}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-1">
                      {[
                        { key: "enabled", label: "Speaker Desk", desc: "Speaker portal for file uploads and schedules.", obj: "speaker_settings" as const },
                      ].map(({ key, label, desc, obj }) => (
                        <ToggleRow
                          key={key}
                          label={label}
                          description={desc}
                          checked={(formData[obj] as any).enabled}
                          onCheckedChange={(checked) =>
                            setFormData((c) => ({
                              ...c,
                              [obj]: { ...(c[obj] as any), enabled: checked },
                            }))
                          }
                        />
                      ))}
                      <div className="rounded-lg border border-[var(--op-border)] bg-[var(--op-panel-soft)] p-4">
                        <p className="text-[12px] font-semibold text-[var(--color-text-primary)]">
                          Commercial capabilities are contract controlled
                        </p>
                        <p className="mt-1 text-[11px] leading-5 text-[var(--color-text-muted)]">
                          Posters, WhatsApp, signage, room sync, and webhooks are applied from the approved event contract after activation. They cannot be enabled from event setup.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2 — CHOOSE PLAN (Only if no active subscription and not default org) */}
            {!skipCommercial && step === 2 && (
              <div className="space-y-6">
                <SectionHeader
                  title="Choose Plan"
                  description="Select a core plan for this event workspace."
                />

                {plans.length > 0 ? (
                  <div className="grid gap-6 xl:grid-cols-3">
                    {plans.map((plan, idx) => {
                      const isSelected = selectedPlan?.name === plan.name;
                      return (
                        <CommercialPlanCard
                          key={plan.id ?? plan.key ?? plan.name}
                          plan={{
                            id: String(plan.id ?? plan.key ?? plan.name),
                            name: plan.name,
                            tagline: plan.tagline,
                            description: plan.description,
                            priceLabel:
                              plan.price_display ||
                              (plan.price !== null && plan.price !== undefined
                                ? `${formatCurrency(plan.price, plan.currency)} / event`
                                : "Contact Sales"),
                            isPopular: plan.popular,
                            isActive: true,
                            highlights: [
                              `${plan.maxUsers || "Not configured"} team members`,
                              `${plan.maxRegistrations || "Not configured"} registrations`,
                              `${plan.maxSpeakers || "Not configured"} speakers`,
                            ],
                          }}
                          index={idx}
                          actionVariant={isSelected ? "current" : "choose"}
                          isCurrentPlan={isSelected}
                          onAction={() => {
                            setSelectedPlan(plan);
                            setSubscriptionActivated(false);
                          }}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[13px] text-[var(--color-text-muted)] py-8 text-center">No plans available.</p>
                )}
              </div>
            )}

            {/* STEP 3 — ADD-ONS (Only if no active subscription and not default org) */}
            {!skipCommercial && step === 3 && (
              <div className="space-y-6">
                <SectionHeader
                  title="Add-ons"
                  description="Extend your plan with optional capabilities. Select any add-ons for this event."
                />

                {/* Running total */}
                {selectedPlan && (
                  <div className="flex items-center justify-between gap-4 rounded-lg border border-[var(--op-border)] bg-[var(--op-panel-bg)] p-4">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">Selected Plan</p>
                      <p className="text-[14px] font-bold text-[var(--color-text-primary)]">{selectedPlan.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                        {calculating ? "Calculating…" : "Running Total"}
                      </p>
                      <p className="text-[18px] font-bold font-mono text-[var(--color-primary-mid)]">
                        {formatCurrency(totalPrice)}
                      </p>
                    </div>
                  </div>
                )}

                {addons.length > 0 ? (
                  <div className="grid gap-5 md:grid-cols-2">
                    {addons.map((addon) => {
                      const selected = selectedAddons.includes(addon.rawKey);
                      return (
                        <CommercialAddonCard
                          key={addon.id ?? addon.key ?? addon.name}
                          addon={{
                            id: String(addon.id ?? addon.key ?? addon.name),
                            name: addon.name,
                            description: addon.description,
                            type: "PLAN",
                            billingUnit: "PER_EVENT",
                            priceLabel:
                              addon.price !== null && addon.price !== undefined
                                ? formatCurrency(addon.price, addon.currency)
                                : "Included",
                            isActive: true,
                          }}
                          selected={selected}
                          onAction={() => {
                            handleToggleAddon(addon.rawKey);
                            setSubscriptionActivated(false);
                          }}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[13px] text-[var(--color-text-muted)] py-8 text-center">No add-ons available.</p>
                )}
              </div>
            )}

            {/* REVIEW & DEPLOY (Step 2 if skipCommercial exists, else Step 4) */}
            {((skipCommercial && step === 2) || (!skipCommercial && step === 4)) && (
              <div className="space-y-6">
                <SectionHeader
                  title="Review & Deploy"
                  description="Verify all event details before publishing. Click 'Publish Event' to complete."
                />

                <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
                  {/* Left — all event data */}
                  <div className="space-y-4 min-w-0">
                    <ReviewSection title="Event Identity">
                      <ReviewInfoBlock icon={Sparkles} label="Event Name" value={formData.name || "Pending"} />
                      <ReviewInfoBlock icon={Hash} label="Short Code" value={formData.short_code || "Pending"} />
                      <ReviewInfoBlock icon={Tag} label="Tagline" value={formData.tagline || "—"} />
                      <div className="sm:col-span-2">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Description</div>
                        <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed line-clamp-3">
                          {formData.description || "—"}
                        </p>
                      </div>
                    </ReviewSection>

                    <ReviewSection title="Organizer">
                      <ReviewInfoBlock icon={Building2} label="Name" value={formData.organizer_details.name || "—"} />
                      <ReviewInfoBlock icon={Globe} label="Email" value={formData.organizer_details.email || "—"} />
                      <ReviewInfoBlock icon={Phone} label="Phone" value={formData.organizer_details.phone || "—"} />
                      <ReviewInfoBlock icon={Globe} label="Website" value={formData.organizer_details.website || "—"} />
                    </ReviewSection>

                    {requiresPurchase && !isDefaultOrg && (
                      <div className="space-y-4 rounded-lg border border-[var(--op-border)] bg-[var(--op-panel-bg)] p-5">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
                              Billing Contact Details
                            </p>
                            <p className="text-[12px] text-[var(--color-text-secondary)]">
                              Contact details submitted with the plan access request.
                            </p>
                          </div>
                          <span className="rounded bg-[var(--op-panel-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-text-muted)]">
                            Required for Plan Request
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <FormField
                            id="billing_name"
                            label="Billing Name *"
                            placeholder="Organisation or Billing Contact Name"
                            value={billingName}
                            onChange={setBillingName}
                          />
                          <FormField
                            id="billing_email"
                            label="Billing Email *"
                            type="email"
                            placeholder="billing@organisation.com"
                            value={billingEmail}
                            onChange={setBillingEmail}
                          />
                          <FormField
                            id="billing_phone"
                            label="Billing Phone *"
                            type="tel"
                            placeholder="+91 98765 43210"
                            icon={Phone}
                            value={billingPhone}
                            onChange={setBillingPhone}
                          />
                          <FormField
                            id="gst_number"
                            label="GST Number (Optional)"
                            placeholder="22AAAAA0000A1Z5"
                            value={gstNumber}
                            onChange={setGstNumber}
                          />
                        </div>
                      </div>
                    )}

                    <ReviewSection title="Venue & Schedule">
                      <ReviewInfoBlock icon={Calendar} label="Start Date" value={formData.start_date || "Pending"} />
                      <ReviewInfoBlock icon={Calendar} label="End Date" value={formData.end_date || "Pending"} />
                      <ReviewInfoBlock icon={Globe} label="Timezone" value={formData.timezone} />
                      <ReviewInfoBlock icon={Building2} label="Venue" value={formData.venue_name || "—"} />
                      <ReviewInfoBlock icon={MapPin} label="Location" value={`${formData.location}${formData.state ? `, ${formData.state}` : ""}${formData.country ? `, ${formData.country}` : ""}` || "—"} />
                      {formData.map_link && (
                        <div className="sm:col-span-2">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Maps Link</div>
                          <a
                            href={formData.map_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[13px] text-[var(--color-primary-mid)] hover:underline truncate block"
                          >
                            {formData.map_link}
                          </a>
                        </div>
                      )}
                    </ReviewSection>

                    {/* Subscription status banner */}
                    <div className="flex items-center gap-3 rounded-lg border border-[color-mix(in_srgb,var(--op-success)_25%,var(--op-border))] bg-[color-mix(in_srgb,var(--op-success)_6%,var(--op-panel-bg))] p-4">
                      <Zap className="h-5 w-5 shrink-0 text-[var(--op-success)]" />
                      <div>
                        <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">
                          {isDefaultOrg
                            ? "Platform Organization — Unrestricted Workspace"
                            : hasActiveSubscription
                            ? (activePlanName
                                ? `Active subscription: ${activePlanName}`
                                : "Active subscription")
                            : "Entitlement available"}
                        </p>
                        <p className="text-[11px] text-[var(--color-text-muted)]">
                          {isDefaultOrg
                            ? "Your event will be created and activated immediately under your platform organization with full enterprise privileges."
                            : hasActiveSubscription
                            ? "Your event will be created and activated automatically under your organization subscription."
                            : "Your plan has unused slots. Click \"Publish Event\" to create the event without extra charges."}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Right — venue image & modules */}
                  <div className="space-y-4">
                    <div className="sticky top-6">
                      <div className="aspect-[4/5] overflow-hidden rounded-lg border border-[var(--op-border)] bg-[var(--op-panel-soft)]">
                        {pendingVenueImages.length > 0 ? (
                          <img
                            src={pendingVenueImages[0].previewUrl}
                            alt="Venue"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-[var(--op-panel-soft)]">
                            <Building2 className="h-12 w-12 text-[var(--op-subtle)]" />
                            <p className="px-6 text-center text-[11px] text-[var(--op-muted)]">
                              No venue image — upload one in the Venue step
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Modules summary */}
                      <div className="mt-4 space-y-2 rounded-lg border border-[var(--op-border)] bg-[var(--op-panel-bg)] p-4">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Modules</p>
                        {[
                          { label: "Speaker Desk", on: formData.speaker_settings.enabled },
                          { label: "Registration", on: formData.registration_settings.enabled },
                        ].map(({ label, on }) => (
                          <div key={label} className="flex items-center justify-between text-[12px]">
                            <span className="text-[var(--color-text-secondary)]">{label}</span>
                            <span className={on ? "font-semibold text-[var(--op-success)]" : "text-[var(--op-subtle)]"}>
                              {on ? "On" : "Off"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </EnterprisePanel>

          {/* ── Bottom Navigation Bar ─────────────────────────────────────── */}
          <div className="sticky bottom-0 z-20">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--op-border)] bg-[var(--op-panel-bg)] px-6 py-4">
              <div className="text-[12px] text-[var(--color-text-muted)]">
                Step {step + 1} of {stepMeta.length}
              </div>
              <div className="flex items-center gap-3">
                {step > 0 ? (
                  <Button
                    variant="ghost"
                    onClick={() => setStep((current) => Math.max(0, current - 1) as StepId)}
                    className="rounded-lg"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
                    Back
                  </Button>
                ) : (
                  <Button variant="ghost" onClick={() => router.push("/events")} className="rounded-lg">
                    Cancel
                  </Button>
                )}

                {step === 0 && (
                  <Button disabled={!canContinueBasics} onClick={() => setStep(1)} className="rounded-lg">
                    Continue to Venue
                    <ChevronRight className="h-4 w-4 ml-2" aria-hidden="true" />
                  </Button>
                )}
                {step === 1 && (
                  <Button disabled={!canContinueVenue} onClick={() => setStep(2)} className="rounded-lg">
                    {skipCommercial ? "Review & Deploy" : "Continue to Plan"}
                    <ChevronRight className="h-4 w-4 ml-2" aria-hidden="true" />
                  </Button>
                )}
                {!skipCommercial && step === 2 && (
                  <Button disabled={!canContinuePlan} onClick={() => setStep(3)} className="rounded-lg">
                    Continue to Add-ons
                    <ChevronRight className="h-4 w-4 ml-2" aria-hidden="true" />
                  </Button>
                )}
                {!skipCommercial && step === 3 && (
                  <Button onClick={() => setStep(4)} className="rounded-lg">
                    Review & Deploy
                    <ChevronRight className="h-4 w-4 ml-2" aria-hidden="true" />
                  </Button>
                )}
                {((skipCommercial && step === 2) || (!skipCommercial && step === 4)) && (
                  <Button
                    disabled={
                      loading
                      || (!isDefaultOrg && (eventLimitAccess.loading || !eventLimitAccess.enabled))
                    }
                    title={
                      isDefaultOrg || eventLimitAccess.enabled
                        ? undefined
                        : `Unavailable: ${(eventLimitAccess.reason || "RESOLUTION_UNAVAILABLE").replaceAll("_", " ").toLowerCase()}`
                    }
                    onClick={handleCreateEvent}
                    className="rounded-lg bg-[var(--op-primary)] px-6 font-semibold text-white hover:opacity-90"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
                    ) : (
                      <>
                        <Zap className="h-4 w-4 mr-2" />
                        Publish Event
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Wrapped with Suspense (required for useSearchParams) ─────────────────────

export default function NewEventPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary-mid)]" />
        </div>
      }
    >
      <NewEventPageInner />
    </Suspense>
  );
}

// ─── Local sub-components ────────────────────────────────────────────────────

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-1 border-b border-[var(--color-border)] pb-4">
      <h2 className="text-[22px] font-bold tracking-tight text-[var(--color-text-primary)]">{title}</h2>
      <p className="text-[13px] text-[var(--color-text-secondary)]">{description}</p>
    </div>
  );
}

function FormField({
  id,
  label,
  description,
  value,
  onChange,
  type = "text",
  icon: Icon,
  spellCheck,
  autoComplete = "off",
  placeholder,
}: {
  id: string;
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  icon?: any;
  spellCheck?: boolean;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-col gap-0.5">
        <label htmlFor={id} className="text-[12px] font-bold uppercase tracking-wider text-[var(--color-text-primary)]">
          {label}
        </label>
        {description ? (
          <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">{description}</p>
        ) : null}
      </div>
      <div className="relative">
        {Icon ? (
          <Icon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" aria-hidden="true" />
        ) : null}
        <Input
          id={id}
          name={id}
          value={value}
          type={type}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={spellCheck}
          autoComplete={autoComplete}
          className={[
            "h-12 rounded-lg border-[var(--op-border)] bg-[var(--op-panel-bg)] text-[14px] text-[var(--op-text)] placeholder:text-[var(--op-subtle)] focus-visible:border-[var(--op-primary)] focus-visible:ring-1 focus-visible:ring-[var(--op-primary)] focus-visible:ring-offset-0",
            Icon ? "pl-11" : "",
          ].join(" ")}
        />
      </div>
    </div>
  );
}

function FormTextArea({
  id,
  label,
  description,
  value,
  onChange,
  placeholder,
  spellCheck = true,
}: {
  id: string;
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  spellCheck?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-col gap-0.5">
        <label htmlFor={id} className="text-[12px] font-bold uppercase tracking-wider text-[var(--color-text-primary)]">
          {label}
        </label>
        {description ? (
          <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">{description}</p>
        ) : null}
      </div>
      <textarea
        id={id}
        name={id}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={spellCheck}
        rows={4}
        className="w-full resize-none rounded-lg border border-[var(--op-border)] bg-[var(--op-panel-bg)] p-4 text-[14px] text-[var(--op-text)] placeholder:text-[var(--op-subtle)] focus:border-[var(--op-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--op-primary)]"
      />
    </div>
  );
}

function SelectField({
  id,
  label,
  description,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-col gap-0.5">
        <label htmlFor={id} className="text-[12px] font-bold uppercase tracking-wider text-[var(--color-text-primary)]">
          {label}
        </label>
        {description ? (
          <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">{description}</p>
        ) : null}
      </div>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-lg border border-[var(--op-border)] bg-[var(--op-panel-bg)] px-4 text-[13px] text-[var(--op-text)] focus:outline-none focus:ring-1 focus:ring-[var(--op-primary)]"
      >
        <option value="">Select…</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--color-border)] py-3.5 last:border-b-0">
      <div className="max-w-[80%] pr-4 text-left">
        <p className="text-[13px] font-bold tracking-tight text-[var(--color-text-primary)]">{label}</p>
        <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed mt-0.5">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
