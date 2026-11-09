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
  FileText,
  Globe,
  HardDrive,
  Hash,
  Layers3,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Mic,
  PackagePlus,
  Phone,
  Plus,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  Users,
  X,
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useCreateEvent } from "@/hooks/useEvents";
import {
  CountryStateEntry,
  fetchCountryStates,
  getStatesForCountry,
} from "@/lib/country-states";
import { orgApi } from "@/components/organizer/org/org-api";
import { apiClient } from "@/lib/api-client";
import {
  useCloudCartCheckout,
  useCloudMockPayment,
} from "@/hooks/useCloudCommercial";

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
  maxAbstracts: number;
  maxSpeakers: number;
  maxStorageGb: number;
  maxEmailCredits: number;
  features: string[];
  popular: boolean;
  quoteOnly: boolean;
};

const FREE_DRAFT_PLAN: BillingPlan = {
  id: "free-draft-tier",
  key: "EVENT_FREE",
  name: "Free Tier (Draft)",
  description: "Test event setup and pilot registration with basic free capacities.",
  tagline: "Free draft tier with basic limits.",
  price: 0,
  price_display: "Free",
  currency: "INR",
  maxEvents: 1,
  maxUsers: 1,
  maxRegistrations: 25,
  maxAbstracts: 5,
  maxSpeakers: 5,
  maxStorageGb: 1,
  maxEmailCredits: 100,
  features: [
    "25 Attendee Registrations",
    "5 Speaker Profiles & Portal",
    "5 Abstract Submissions",
    "1 GB Cloud Presentation Storage",
    "100 Email Delivery Credits",
  ],
  popular: false,
  quoteOnly: false,
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

const addonCategories = [
  { id: "all", label: "All add-ons", icon: Layers3 },
  { id: "registrations", label: "Registrations", icon: Users },
  { id: "abstracts", label: "Abstracts", icon: FileText },
  { id: "speakers", label: "Speakers", icon: Mic },
  { id: "storage", label: "Storage", icon: HardDrive },
  { id: "email", label: "Email", icon: Mail },
] as const;

function getAddonCategory(addon: BillingAddon): string {
  const key = addon.rawKey.toUpperCase();
  const name = addon.name.toUpperCase();
  if (key.includes("REGISTRATION") || name.includes("REGISTRATION")) return "registrations";
  if (key.includes("ABSTRACT") || name.includes("ABSTRACT")) return "abstracts";
  if (key.includes("SPEAKER") || name.includes("SPEAKER")) return "speakers";
  if (key.includes("STORAGE") || name.includes("STORAGE")) return "storage";
  if (key.includes("EMAIL") || name.includes("EMAIL")) return "email";
  return "other";
}

function getAddonCapacityBadge(addon: BillingAddon): string | null {
  const match = addon.name.match(
    /(\+\d+[\w,.]*|\d+[\w\s–-]+screens?|\d+[\w\s–-]+devices?)/i,
  );
  return match ? match[1] : null;
}

function getAddonIcon(categoryId: string) {
  switch (categoryId) {
    case "registrations":
      return Users;
    case "abstracts":
      return FileText;
    case "speakers":
      return Mic;
    case "storage":
      return HardDrive;
    case "email":
      return Mail;
    default:
      return Sparkles;
  }
}

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
  const price = asArray<Record<string, any>>(plan.prices).find(
    (candidate) => candidate.billing_interval === "PER_EVENT",
  );
  const entitlements = Object.fromEntries(
    asArray<Record<string, any>>(plan.entitlements).map((item) => [
      item.key ?? item.entitlement_key,
      item.quantity,
    ]),
  );
  return {
    id: plan.id ? String(plan.id) : undefined,
    key: plan.code ?? plan.key ?? plan.plan_key ?? plan.slug ?? undefined,
    name: String(plan.name ?? plan.display_name ?? "Event plan"),
    description: String(plan.description ?? ""),
    tagline: String(plan.tagline ?? plan.subtitle ?? plan.description ?? ""),
    price: toNumber(
      plan.price ??
        plan.price_inr ??
        plan.base_price ??
        plan.final_price ??
        plan.amount ??
        price?.amount,
    ),
    price_display: plan.price_display ? String(plan.price_display) : undefined,
    currency: String(plan.currency ?? "INR"),
    maxEvents: Number(plan.limits?.max_events ?? entitlements.max_events ?? 1),
    maxUsers: Number(plan.limits?.max_users ?? entitlements.max_users ?? 0),
    maxRegistrations: Number(
      plan.limits?.max_registrations ??
        plan.max_registrations ??
        entitlements.registrations ??
        entitlements.max_registrations ??
        0,
    ),
    maxAbstracts: Number(
      plan.limits?.max_abstracts ??
        plan.max_abstracts ??
        entitlements.abstracts ??
        entitlements.max_abstracts ??
        0,
    ),
    maxSpeakers: Number(
      plan.limits?.max_speakers ??
        plan.max_speakers ??
        entitlements.speakers ??
        entitlements.max_speakers ??
        0,
    ),
    maxStorageGb: Number(
      plan.limits?.storage_gb ??
        plan.limits?.max_storage_gb ??
        entitlements.storage_gb ??
        entitlements.max_storage_gb ??
        0,
    ),
    maxEmailCredits: Number(
      plan.limits?.event_email_credits ??
        plan.limits?.max_emails_per_event ??
        entitlements.event_email_credits ??
        entitlements.max_emails_per_event ??
        0,
    ),
    features: [
      ...asArray<string>(plan.feature_highlights),
      ...asArray<string>(plan.features_preview),
      ...asArray<string>(plan.enabled_features),
    ].filter(Boolean),
    popular: Boolean(plan.is_popular ?? plan.popular ?? false),
    quoteOnly: Boolean(
      plan.is_quote_only || String(plan.code ?? "").includes("ENTERPRISE"),
    ),
  };
}

function normalizeAddon(addon: Record<string, any>): BillingAddon {
  const price = asArray<Record<string, any>>(addon.prices).find(
    (candidate) => candidate.billing_interval === "ONE_TIME",
  );
  return {
    id: addon.id ? String(addon.id) : undefined,
    key: addon.code ?? addon.key ?? addon.addon_key ?? addon.slug ?? undefined,
    rawKey: String(
      addon.code ?? addon.key ?? addon.addon_key ?? addon.id ?? addon.name,
    ),
    name: String(addon.name ?? "Add-on"),
    description: String(
      addon.description ?? addon.tagline ?? addon.short_description ?? "",
    ),
    price: toNumber(
      addon.price_inr ??
        addon.final_price ??
        addon.price ??
        addon.amount ??
        price?.amount,
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

// ─── Review, draft creation and activation panel ─────────────────────────────

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
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted,#94a3b8)]">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <p className="text-sm font-semibold text-[var(--text-primary,#0f172a)] leading-snug">
        {value || "—"}
      </p>
    </div>
  );
}

function ReviewSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3.5 rounded-xl border border-[var(--border-subtle,rgba(15,23,42,0.08))] bg-[var(--surface-primary,#ffffff)] p-5 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted,#94a3b8)]">
        {title}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

// ─── Inner component that uses useSearchParams ────────────────────────────────

function NewEventPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const createEvent = useCreateEvent();
  const checkout = useCloudCartCheckout();
  const mockPayment = useCloudMockPayment();

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
  const [addonCategory, setAddonCategory] = useState<string>("all");
  const [priceDetails, setPriceDetails] = useState<any | null>(null);
  const [billingName, setBillingName] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [billingPhone, setBillingPhone] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successEvent, setSuccessEvent] = useState<any | null>(null);
  const [creationOutcome, setCreationOutcome] = useState<
    "DRAFT" | "ACTIVE" | "PAYMENT_PENDING" | "QUOTE_REQUESTED"
  >("DRAFT");

  // URL param pre-selection
  const preselectedPlanId = searchParams.get("plan");
  const preselectedAddonIds = (searchParams.get("addons") ?? "")
    .split(",")
    .filter(Boolean);

  useEffect(() => {
    fetchCountryStates().then(setCountryStates).catch(console.error);
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
    fetch(`${apiBase}/api/v1/global-settings/public`)
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
    Promise.allSettled([
      orgApi.me(),
      orgApi.eventOffers(),
      orgApi.capacityOffers(),
    ])
      .then((results) => {
        const [meResult, plansResult, addonsResult] = results;
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

        let matchedPlan: BillingPlan | null = null;
        if (preselectedPlanId) {
          matchedPlan =
            normalizedPlans.find(
              (p) =>
                p.id === preselectedPlanId ||
                p.key === preselectedPlanId ||
                normalizeComparisonValue(p.name) ===
                  normalizeComparisonValue(preselectedPlanId),
            ) ?? null;
        }

        const preAddonKeys = preselectedAddonIds.flatMap((id) => {
          const match = normalizedAddons.find(
            (a) =>
              a.id === id ||
              a.key === id ||
              a.rawKey === id ||
              normalizeComparisonValue(a.name) === normalizeComparisonValue(id),
          );
          return match ? [match.rawKey] : [];
        });

        const allPlans = [
          FREE_DRAFT_PLAN,
          ...normalizedPlans.filter((p) => p.key !== "EVENT_FREE"),
        ];
        setOrgContext(meRes);
        setPlans(allPlans);
        setAddons(normalizedAddons);
        setSelectedPlan(matchedPlan);
        if (preAddonKeys.length > 0) setSelectedAddons(preAddonKeys);
        const org = meRes.organization;
        const u = (meRes as any).user;
        const initialBillingName =
          (org as any)?.billing_name || org?.name || u?.full_name || "";
        const initialBillingEmail = org?.billing_email || u?.email || "";
        const initialBillingPhone =
          (org as any)?.billing_phone || (org as any)?.phone || u?.phone || "";

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
  }, [globalTimezone, preselectedPlanId]);

  useEffect(() => {
    if (!selectedPlan) {
      setPriceDetails(null);
      return;
    }
    const isFree =
      selectedPlan.id === "free-draft-tier" ||
      selectedPlan.key === "EVENT_FREE" ||
      selectedPlan.price === 0;
    if (isFree && selectedAddons.length === 0) {
      setPriceDetails({
        price_book_version: "free",
        quote_required: false,
        currency: "INR",
        line_items: [],
        subtotal: 0,
        gst_rate: 0,
        gst: 0,
        total: 0,
        warnings: [],
      });
      return;
    }
    setCalculating(true);
    orgApi
      .calculatePrice({
        account_type: "ORGANIZER",
        events: [
          {
            offer_code: selectedPlan.key || selectedPlan.id,
            capacity_addon_codes: selectedAddons,
          },
        ],
      })
      .then(setPriceDetails)
      .catch(() => setPriceDetails(null))
      .finally(() => setCalculating(false));
  }, [selectedPlan, selectedAddons]);

  const isFreeSelected =
    selectedPlan?.id === "free-draft-tier" ||
    selectedPlan?.key === "EVENT_FREE" ||
    selectedPlan?.price === 0;
  const requiresPurchase = Boolean(
    selectedPlan && (!isFreeSelected || selectedAddons.length > 0),
  );

  const selectedAddonRecords = useMemo(
    () => addons.filter((addon) => selectedAddons.includes(addon.rawKey)),
    [addons, selectedAddons],
  );

  const visibleAddons = useMemo(() => {
    if (addonCategory === "all") return addons;
    return addons.filter((addon) => getAddonCategory(addon) === addonCategory);
  }, [addons, addonCategory]);

  const totalPrice = useMemo(() => {
    if (priceDetails?.total !== undefined) return Number(priceDetails.total);
    const base = selectedPlan?.price ?? 0;
    const addOnTotal = selectedAddonRecords.reduce(
      (sum, addon) => sum + (addon.price ?? 0),
      0,
    );
    return base + addOnTotal;
  }, [priceDetails, selectedPlan, selectedAddonRecords]);

  const stepMeta = [
    { label: "Basics", description: "Identity & contacts" },
    { label: "Venue & Schedule", description: "Location & dates" },
    { label: "Event Plan", description: "Optional activation plan" },
    { label: "Add-ons", description: "Optional event capacity" },
    { label: "Review & Pay", description: "Create draft and activate" },
  ];

  const canContinueBasics = Boolean(
    formData.name.trim() &&
    formData.short_code.trim() &&
    formData.organizer_details.name.trim() &&
    formData.organizer_details.email.trim(),
  );

  const canContinueVenue = Boolean(
    formData.start_date && formData.end_date && formData.timezone,
  );

  const handleToggleAddon = (value: string) => {
    setSelectedAddons((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  };

  const handleSelectPlan = (plan: BillingPlan) => {
    if (selectedPlan?.key !== plan.key) setSelectedAddons([]);
    setSelectedPlan(plan);
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

  const handleUploadTempImage = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
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

  const billingProfile = () => ({
    billing_name:
      billingName.trim() ||
      formData.organizer_details.name.trim() ||
      orgContext?.organization?.name ||
      "Organiser",
    billing_email:
      billingEmail.trim() ||
      formData.organizer_details.email.trim() ||
      orgContext?.organization?.billing_email ||
      "billing@eventos.internal",
    billing_phone:
      billingPhone.trim() ||
      formData.organizer_details.phone.trim() ||
      (orgContext?.organization as any)?.billing_phone ||
      (orgContext?.organization as any)?.phone ||
      "+91 9876543210",
    gst_number: gstNumber.trim() || null,
  });

  const handleCommercialQuoteRequest = async (eventId: string) => {
    if (!selectedPlan) {
      throw new Error("Select a plan before requesting access.");
    }
    return orgApi.requestCommercialQuote({
      event_id: eventId,
      offer_code: selectedPlan.key || selectedPlan.id,
      capacity_addon_codes: selectedAddons,
      ...billingProfile(),
      reason: `Request a commercial quote for ${selectedPlan.name} for ${formData.name}`,
    });
  };

  const handleCreateEvent = async () => {
    setLoading(true);
    let created: any | null = null;
    let outcome: "DRAFT" | "ACTIVE" | "PAYMENT_PENDING" | "QUOTE_REQUESTED" =
      "DRAFT";
    try {
      const payload = {
        ...formData,
        status: "draft" as const,
        organizer_name: formData.organizer_details.name || null,
        upload_deadline: formData.upload_deadline
          ? new Date(formData.upload_deadline).toISOString()
          : null,
      };

      created = await createEvent.mutateAsync(payload);
      if (
        selectedPlan &&
        selectedPlan.key !== "EVENT_FREE" &&
        (selectedPlan.quoteOnly || (selectedPlan.price ?? 0) > 0)
      ) {
        const offerCode = selectedPlan.key || selectedPlan.id;
        if (!offerCode) throw new Error("The selected plan is unavailable.");
        if (selectedPlan.quoteOnly || selectedPlan.price === null) {
          await handleCommercialQuoteRequest(created.id);
          outcome = "QUOTE_REQUESTED";
        } else {
          const checkoutResult = await checkout.mutateAsync({
            items: [
              {
                account_type: "ORGANIZER",
                events: [
                  {
                    event_id: created.id,
                    offer_code: offerCode,
                    capacity_addon_codes: selectedAddons,
                  },
                ],
                billing_profile: billingProfile(),
                auto_renew: false,
              },
            ],
          });
          try {
            await mockPayment.mutateAsync({
              invoice_ids: checkoutResult.items.map((item) => item.invoice_id),
            });
            outcome = "ACTIVE";
          } catch {
            outcome = "PAYMENT_PENDING";
          }
        }
      }

      const failedVenueUploads: string[] = [];
      for (const image of outcome === "ACTIVE" ? pendingVenueImages : []) {
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
            },
          );
          URL.revokeObjectURL(image.previewUrl);
        } catch {
          failedVenueUploads.push(image.file.name);
          URL.revokeObjectURL(image.previewUrl);
        }
      }
      if (outcome !== "ACTIVE") {
        pendingVenueImages.forEach((image) =>
          URL.revokeObjectURL(image.previewUrl),
        );
      }
      setSuccessEvent(created);
      setCreationOutcome(outcome);
      if (failedVenueUploads.length > 0) {
        toast.warning(
          `Event created, but ${failedVenueUploads.length} venue image upload(s) failed. Add them from Event Planning.`,
        );
      } else if (outcome === "ACTIVE") {
        toast.success("Event created, paid and activated.");
      } else if (outcome === "QUOTE_REQUESTED") {
        toast.success("Draft event created and quotation requested.");
      } else if (outcome === "PAYMENT_PENDING") {
        toast.success("Draft event created. Complete payment to activate it.");
      } else {
        toast.success(
          "Draft event created under Free Tier limits (25 registrations, 5 speakers).",
        );
      }
    } catch (error: any) {
      if (created) {
        setSuccessEvent(created);
        setCreationOutcome("DRAFT");
        toast.error(
          "The event draft was created, but checkout could not be completed.",
        );
      } else {
        toast.error(error?.message || "Failed to create event.");
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 pb-12 max-w-5xl mx-auto w-full pt-2">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary,#0f172a)]">
            Create Event
          </h1>
          <p className="text-sm text-[var(--text-secondary,#64748b)] mt-1">
            Configure event identity, schedule, venue parameters, and optional activation plan.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/events")}
          className="rounded-full self-start sm:self-auto gap-1.5 text-xs font-semibold border-[var(--border-default,rgba(15,23,42,0.14))]"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Exit Creator
        </Button>
      </div>

      {/* Success Screen */}
      {successEvent ? (
        <div className="rounded-2xl border border-[var(--border-subtle,rgba(15,23,42,0.08))] bg-[var(--surface-primary,#ffffff)] p-8 md:p-12 shadow-sm text-center">
          <div className="flex flex-col items-center justify-center gap-6 py-6">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
              <CheckCircle2 className="h-10 w-10" aria-hidden="true" />
            </div>
            <div className="space-y-2 max-w-lg">
              <h3 className="text-2xl font-bold tracking-tight text-[var(--text-primary,#0f172a)]">
                {creationOutcome === "ACTIVE"
                  ? "Event activated"
                  : creationOutcome === "QUOTE_REQUESTED"
                    ? "Draft created · quote requested"
                    : creationOutcome === "PAYMENT_PENDING"
                      ? "Draft created · payment pending"
                      : "Draft Event Created · Free Tier"}
              </h3>
              <p className="text-sm text-[var(--text-secondary,#64748b)] leading-relaxed">
                <strong className="text-[var(--text-primary,#0f172a)]">
                  {successEvent?.name || formData.name}
                </strong>{" "}
                {creationOutcome === "ACTIVE"
                  ? "is active under the purchased Event plan."
                  : creationOutcome === "QUOTE_REQUESTED"
                    ? "will activate after the enterprise quote is approved and paid."
                    : creationOutcome === "PAYMENT_PENDING"
                      ? "will activate automatically after its invoice is paid."
                      : "is saved as a draft with Free Tier limits (25 registrations, 5 speakers, 5 abstracts). You can register attendees, add speakers, or upgrade to a commercial Event Plan at any time."}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Button
                onClick={() =>
                  router.push(
                    successEvent?.id
                      ? `/events/${successEvent.id}/dashboard`
                      : "/events",
                  )
                }
                className="rounded-full bg-[var(--org-purple,#7c3aed)] hover:bg-[var(--org-purple,#7c3aed)]/90 px-6 h-10 font-semibold text-white shadow-sm"
              >
                Open Event Workspace
              </Button>
              {creationOutcome !== "ACTIVE" ? (
                <Button
                  variant="outline"
                  onClick={() =>
                    router.push(
                      `/commercial/workspace?event=${encodeURIComponent(successEvent.id)}`,
                    )
                  }
                  className="rounded-full px-6 h-10 border-[var(--border-default,rgba(15,23,42,0.14))]"
                >
                  Choose activation plan
                </Button>
              ) : null}
              <Button
                variant="outline"
                onClick={() => router.push("/events")}
                className="rounded-full px-6 h-10 border-[var(--border-default,rgba(15,23,42,0.14))]"
              >
                Back to Events
              </Button>
            </div>
          </div>
        </div>
      ) : loadingConfig ? (
        <div className="rounded-2xl border border-[var(--border-subtle,rgba(15,23,42,0.08))] bg-[var(--surface-primary,#ffffff)] p-12 shadow-sm">
          <div className="flex flex-col items-center justify-center gap-3 py-10">
            <Loader2
              className="h-8 w-8 animate-spin text-[var(--org-purple,#7c3aed)]"
              aria-hidden="true"
            />
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted,#94a3b8)]">
              Syncing event builder…
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── Stepper Navigation ──────────────────────────────────────────── */}
          <div className="rounded-2xl border border-[var(--border-subtle,rgba(15,23,42,0.08))] bg-[var(--surface-primary,#ffffff)] p-4 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              {stepMeta.map((item, index) => {
                const active = step === index;
                const complete = step > index;
                const canClick =
                  index === 0 ||
                  (index === 1 && canContinueBasics) ||
                  (index === 2 && canContinueBasics && canContinueVenue) ||
                  (index === 3 && canContinueBasics && canContinueVenue) ||
                  (index === 4 && canContinueBasics && canContinueVenue);

                return (
                  <button
                    key={item.label}
                    type="button"
                    disabled={!canClick}
                    onClick={() => setStep(index as StepId)}
                    className={`flex items-center gap-3 rounded-xl p-2 text-left transition-all ${
                      canClick
                        ? "cursor-pointer hover:bg-[var(--surface-secondary,#f8fafc)]"
                        : "cursor-default opacity-50"
                    } ${active ? "bg-[var(--surface-secondary,#f8fafc)] shadow-xs" : ""}`}
                  >
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all ${
                        active
                          ? "bg-[var(--org-purple,#7c3aed)] text-white shadow-sm ring-4 ring-[var(--org-purple,#7c3aed)]/15"
                          : complete
                            ? "bg-emerald-500 text-white"
                            : "border border-[var(--border-default,rgba(15,23,42,0.14))] bg-[var(--surface-secondary,#f8fafc)] text-[var(--text-muted,#94a3b8)]"
                      }`}
                    >
                      {complete ? (
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        index + 1
                      )}
                    </div>
                    <div className="min-w-0">
                      <p
                        className={`text-xs font-bold leading-tight ${
                          active
                            ? "text-[var(--org-purple,#7c3aed)]"
                            : "text-[var(--text-primary,#0f172a)]"
                        }`}
                      >
                        {item.label}
                      </p>
                      <p className="text-[11px] text-[var(--text-secondary,#64748b)] hidden lg:block mt-0.5">
                        {item.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Main Step Card ────────────────────────────────────────────────── */}
          <div className="min-h-[560px] rounded-2xl border border-[var(--border-subtle,rgba(15,23,42,0.08))] bg-[var(--surface-primary,#ffffff)] p-6 md:p-8 shadow-sm">
            {/* STEP 0 — BASICS */}
            {step === 0 && (
              <div className="space-y-6">
                <SectionHeader
                  title="Event Basics"
                  description="Specify the core title, identifier, and logistical organizer information."
                />
                <div className="space-y-5">
                  <FormField
                    id="event-name"
                    label="Event Name"
                    description="Provide the official title of your conference or summit."
                    placeholder="e.g. Annual Surgical Summit 2026…"
                    value={formData.name}
                    onChange={(value) =>
                      setFormData((current) => ({ ...current, name: value }))
                    }
                    icon={Sparkles}
                  />
                  <FormField
                    id="short-code"
                    label="Short Code"
                    description="Uppercase alphanumeric slug used for conference portals and mobile sessions."
                    placeholder="e.g. SURG26…"
                    value={formData.short_code}
                    spellCheck={false}
                    onChange={(value) =>
                      setFormData((current) => ({
                        ...current,
                        short_code: value
                          .toUpperCase()
                          .replace(/[^A-Z0-9-]/g, "")
                          .slice(0, 10),
                      }))
                    }
                    icon={Hash}
                  />
                  <FormField
                    id="tagline"
                    label="Event Tagline"
                    description="A concise subtitle shown on public registrations and schedules."
                    placeholder="e.g. Frontiers in Clinical Precision…"
                    value={formData.tagline}
                    onChange={(value) =>
                      setFormData((current) => ({ ...current, tagline: value }))
                    }
                    icon={Tag}
                  />
                  <FormTextArea
                    id="description"
                    label="Event Description"
                    description="A rich summary detailing the objectives, themes, and scope of the conference."
                    placeholder="Provide a comprehensive summary of this conference…"
                    value={formData.description}
                    onChange={(value) =>
                      setFormData((current) => ({
                        ...current,
                        description: value,
                      }))
                    }
                  />
                  <FormField
                    id="organizer-name"
                    label="Organizer Entity Name"
                    description="Company, association, or medical society hosting the event."
                    placeholder="e.g. Indian Medical Association…"
                    value={formData.organizer_details.name}
                    onChange={(value) =>
                      setFormData((current) => ({
                        ...current,
                        organizer_details: {
                          ...current.organizer_details,
                          name: value,
                        },
                      }))
                    }
                    icon={Building2}
                  />
                  <FormField
                    id="organizer-email"
                    label="Organizer Contact Email"
                    description="Official email for delegate and speaker communications."
                    placeholder="e.g. secretariat@summit.org…"
                    value={formData.organizer_details.email}
                    type="email"
                    spellCheck={false}
                    onChange={(value) =>
                      setFormData((current) => ({
                        ...current,
                        organizer_details: {
                          ...current.organizer_details,
                          email: value,
                        },
                      }))
                    }
                    icon={Mail}
                  />
                  <FormField
                    id="organizer-phone"
                    label="Organizer Contact Phone"
                    description="Helpdesk or coordination phone number."
                    placeholder="e.g. +91 98765 43210…"
                    value={formData.organizer_details.phone}
                    type="tel"
                    onChange={(value) =>
                      setFormData((current) => ({
                        ...current,
                        organizer_details: {
                          ...current.organizer_details,
                          phone: value,
                        },
                      }))
                    }
                    icon={Phone}
                  />
                  <FormField
                    id="organizer-website"
                    label="Organizer Official Website"
                    description="Link to the organizer's primary portal."
                    placeholder="e.g. https://summit.org…"
                    value={formData.organizer_details.website}
                    type="url"
                    spellCheck={false}
                    onChange={(value) =>
                      setFormData((current) => ({
                        ...current,
                        organizer_details: {
                          ...current.organizer_details,
                          website: value,
                        },
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
                <div className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      id="start-date"
                      label="Start Date"
                      description="Conference launch date."
                      value={formData.start_date}
                      onChange={(value) =>
                        setFormData((current) => ({
                          ...current,
                          start_date: value,
                        }))
                      }
                      type="date"
                      icon={Calendar}
                    />
                    <FormField
                      id="end-date"
                      label="End Date"
                      description="Conference closing date."
                      value={formData.end_date}
                      onChange={(value) =>
                        setFormData((current) => ({
                          ...current,
                          end_date: value,
                        }))
                      }
                      type="date"
                      icon={Calendar}
                    />
                  </div>

                  <FormField
                    id="timezone"
                    label="IANA Timezone"
                    description="System timezone for scheduler windows."
                    value={formData.timezone}
                    onChange={(value) =>
                      setFormData((current) => ({
                        ...current,
                        timezone: value,
                      }))
                    }
                    icon={Globe}
                  />

                  <div className="grid gap-4 md:grid-cols-2">
                    <SelectField
                      id="country"
                      label="Country"
                      value={formData.country}
                      onChange={(value) =>
                        setFormData((current) => ({
                          ...current,
                          country: value,
                          state: "",
                        }))
                      }
                      options={countryStates.map((entry) => ({
                        label: entry.country,
                        value: entry.country,
                      }))}
                    />
                    <SelectField
                      id="state"
                      label="State / Province"
                      value={formData.state}
                      onChange={(value) =>
                        setFormData((current) => ({
                          ...current,
                          state: value,
                        }))
                      }
                      options={getStatesForCountry(
                        countryStates,
                        formData.country,
                      ).map((state) => ({
                        label: state,
                        value: state,
                      }))}
                    />
                  </div>

                  <FormField
                    id="venue-name"
                    label="Venue Name"
                    description="Convention centre, hotel, or auditorium."
                    placeholder="e.g. Jio World Convention Centre…"
                    value={formData.venue_name}
                    onChange={(value) =>
                      setFormData((current) => ({
                        ...current,
                        venue_name: value,
                      }))
                    }
                    icon={Building2}
                  />

                  <FormField
                    id="location"
                    label="Full Address / City"
                    description="Geographical address for attendee navigation."
                    placeholder="e.g. BKC, Bandra East, Mumbai…"
                    value={formData.location}
                    onChange={(value) =>
                      setFormData((current) => ({
                        ...current,
                        location: value,
                      }))
                    }
                    icon={MapPin}
                  />

                  <FormField
                    id="map-link"
                    label="Google Maps URL"
                    description="Public navigation link for the venue."
                    placeholder="https://maps.google.com/…"
                    value={formData.map_link}
                    type="url"
                    onChange={(value) =>
                      setFormData((current) => ({
                        ...current,
                        map_link: value,
                      }))
                    }
                    icon={Globe}
                  />

                  {/* Venue Images Upload */}
                  <div className="space-y-3 pt-2">
                    <label className="text-xs font-semibold text-[var(--text-primary,#0f172a)]">
                      Venue Photos & Stills
                    </label>
                    {pendingVenueImages.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {pendingVenueImages.map((image, idx) => (
                          <div
                            key={idx}
                            className="relative rounded-xl overflow-hidden border border-[var(--border-subtle,rgba(15,23,42,0.08))] aspect-video bg-black/10"
                          >
                            <img
                              src={image.previewUrl}
                              alt={`Venue ${idx + 1}`}
                              className="h-full w-full object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveImage(idx)}
                              className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 border border-white/20 text-white hover:bg-black/90 transition-colors"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <input
                      id="temp-venue-image-upload-input"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleUploadTempImage}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        document
                          .getElementById("temp-venue-image-upload-input")
                          ?.click()
                      }
                      className="rounded-full gap-2 border-[var(--border-default,rgba(15,23,42,0.14))]"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Upload Venue Image
                    </Button>
                  </div>

                  {/* Upload settings & Modules */}
                  <div className="space-y-4 rounded-xl border border-[var(--border-subtle,rgba(15,23,42,0.08))] bg-[var(--surface-secondary,#f8fafc)] p-5 mt-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary,#0f172a)]">
                      Speaker Upload Window & Extensions
                    </h4>
                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField
                        id="upload-deadline"
                        label="Presentation Upload Deadline"
                        description="Cut-off date/time for presenter slides."
                        value={formData.upload_deadline}
                        onChange={(value) =>
                          setFormData((current) => ({
                            ...current,
                            upload_deadline: value,
                          }))
                        }
                        type="datetime-local"
                      />
                      <FormField
                        id="max-file-size"
                        label="Max File Size (MB)"
                        description="Maximum allowed presentation size."
                        placeholder="e.g. 500…"
                        value={formData.max_file_size_mb.toString()}
                        onChange={(value) =>
                          setFormData((current) => ({
                            ...current,
                            max_file_size_mb: Number(value) || 500,
                          }))
                        }
                        type="number"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-[var(--text-primary,#0f172a)]">
                        Allowed File Formats
                      </label>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {availableFormats.map((format) => {
                          const isSelected =
                            formData.allowed_formats.includes(format);
                          return (
                            <button
                              key={format}
                              type="button"
                              onClick={() => handleToggleFormat(format)}
                              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer ${
                                isSelected
                                  ? "bg-[var(--org-purple,#7c3aed)] text-white shadow-xs"
                                  : "border border-[var(--border-default,rgba(15,23,42,0.14))] bg-[var(--surface-primary,#ffffff)] text-[var(--text-secondary,#64748b)] hover:border-[var(--org-purple,#7c3aed)] hover:text-[var(--org-purple,#7c3aed)]"
                              }`}
                            >
                              {format}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-1 pt-2">
                      <ToggleRow
                        label="Speaker Desk"
                        description="Presenter portal for file uploads, previewing slides, and session schedules."
                        checked={formData.speaker_settings.enabled}
                        onCheckedChange={(checked) =>
                          setFormData((c) => ({
                            ...c,
                            speaker_settings: {
                              ...c.speaker_settings,
                              enabled: checked,
                            },
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2 — OPTIONAL EVENT ACTIVATION PLAN */}
            {step === 2 && (
              <div className="space-y-6">
                <SectionHeader
                  title="Choose Event Plan"
                  description="Select an event tier to activate this conference, or skip to save it as a draft."
                />

                {plans.length > 0 ? (
                  <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                    {plans.map((plan, idx) => {
                      const isSelected = selectedPlan?.name === plan.name;
                      return (
                        <div
                          key={plan.id ?? plan.key ?? plan.name}
                          className={`group relative flex flex-col justify-between rounded-2xl border p-5 transition-all duration-200 ${
                            isSelected
                              ? "border-[var(--org-purple,#7c3aed)] bg-[color-mix(in_srgb,var(--org-purple,#7c3aed)_4%,var(--surface-primary,#ffffff))] shadow-md ring-2 ring-[var(--org-purple,#7c3aed)]/20"
                              : "border-[var(--border-subtle,rgba(15,23,42,0.08))] bg-[var(--surface-primary,#ffffff)] hover:border-[var(--border-default,rgba(15,23,42,0.14))] hover:shadow-sm"
                          }`}
                        >
                          {plan.popular ? (
                            <span className="absolute -top-2.5 right-4 rounded-full bg-[var(--org-purple,#7c3aed)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
                              Popular
                            </span>
                          ) : null}

                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted,#94a3b8)]">
                                Tier {String(idx + 1).padStart(2, "0")}
                              </span>
                              {isSelected ? (
                                <span className="flex items-center gap-1 text-[11px] font-semibold text-[var(--org-purple,#7c3aed)]">
                                  <Check className="h-3.5 w-3.5" /> Selected
                                </span>
                              ) : null}
                            </div>

                            <h3 className="mt-2 text-lg font-bold text-[var(--text-primary,#0f172a)]">
                              {plan.name}
                            </h3>
                            <p className="mt-1 text-xs text-[var(--text-secondary,#64748b)] line-clamp-2">
                              {plan.tagline ||
                                plan.description ||
                                "Configurable event plan tier."}
                            </p>

                            <div className="my-4 border-y border-[var(--border-subtle,rgba(15,23,42,0.08))] py-3">
                              <span className="font-mono text-2xl font-bold text-[var(--text-primary,#0f172a)]">
                                {plan.price === 0
                                  ? "Free"
                                  : plan.price_display ||
                                    (plan.price !== null &&
                                    plan.price !== undefined
                                      ? formatCurrency(plan.price, plan.currency)
                                      : "Custom quote")}
                              </span>
                              {plan.price !== null &&
                              plan.price !== undefined &&
                              plan.price > 0 ? (
                                <span className="text-xs text-[var(--text-muted,#94a3b8)]">
                                  {" "}
                                  / event
                                </span>
                              ) : null}
                            </div>

                            <div className="space-y-1.5 mb-4">
                              <div className="flex items-center justify-between text-xs py-1 border-b border-[var(--border-subtle,rgba(15,23,42,0.08))]">
                                <span className="text-[var(--text-secondary,#64748b)]">
                                  Registrations
                                </span>
                                <span className="font-semibold text-[var(--text-primary,#0f172a)] font-mono">
                                  {plan.maxRegistrations
                                    ? plan.maxRegistrations.toLocaleString()
                                    : plan.quoteOnly
                                      ? "Custom quote"
                                      : "Custom"}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-xs py-1 border-b border-[var(--border-subtle,rgba(15,23,42,0.08))]">
                                <span className="text-[var(--text-secondary,#64748b)]">
                                  Abstracts
                                </span>
                                <span className="font-semibold text-[var(--text-primary,#0f172a)] font-mono">
                                  {plan.maxAbstracts
                                    ? plan.maxAbstracts.toLocaleString()
                                    : plan.quoteOnly
                                      ? "Custom quote"
                                      : "Custom"}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-xs py-1 border-b border-[var(--border-subtle,rgba(15,23,42,0.08))]">
                                <span className="text-[var(--text-secondary,#64748b)]">
                                  Speakers
                                </span>
                                <span className="font-semibold text-[var(--text-primary,#0f172a)] font-mono">
                                  {plan.maxSpeakers
                                    ? plan.maxSpeakers.toLocaleString()
                                    : plan.quoteOnly
                                      ? "Custom quote"
                                      : "Custom"}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-xs py-1 border-b border-[var(--border-subtle,rgba(15,23,42,0.08))]">
                                <span className="text-[var(--text-secondary,#64748b)]">
                                  Cloud Storage
                                </span>
                                <span className="font-semibold text-[var(--text-primary,#0f172a)] font-mono">
                                  {plan.maxStorageGb
                                    ? `${plan.maxStorageGb} GB`
                                    : plan.quoteOnly
                                      ? "Custom quote"
                                      : "Custom"}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-xs py-1 border-b border-[var(--border-subtle,rgba(15,23,42,0.08))]">
                                <span className="text-[var(--text-secondary,#64748b)]">
                                  Email Credits
                                </span>
                                <span className="font-semibold text-[var(--text-primary,#0f172a)] font-mono">
                                  {plan.maxEmailCredits
                                    ? plan.maxEmailCredits.toLocaleString()
                                    : plan.quoteOnly
                                      ? "Custom quote"
                                      : "Custom"}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-xs py-1">
                                <span className="text-[var(--text-secondary,#64748b)]">
                                  Team Members
                                </span>
                                <span className="font-semibold text-[var(--text-primary,#0f172a)] font-mono">
                                  {plan.maxUsers ? `${plan.maxUsers} seat${plan.maxUsers > 1 ? "s" : ""}` : "Unlimited"}
                                </span>
                              </div>
                            </div>

                            {plan.features.length > 0 ? (
                              <ul className="space-y-1.5 pt-1 mb-4">
                                {plan.features.slice(0, 3).map((feature) => (
                                  <li
                                    key={feature}
                                    className="flex items-center gap-2 text-xs text-[var(--text-secondary,#64748b)]"
                                  >
                                    <Check className="h-3.5 w-3.5 shrink-0 text-[var(--org-purple,#7c3aed)]" />
                                    <span className="truncate">{feature}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleSelectPlan(plan)}
                            className={`w-full h-10 rounded-full text-xs font-semibold transition-all mt-2 cursor-pointer flex items-center justify-center gap-1.5 ${
                              isSelected
                                ? "bg-[var(--org-purple,#7c3aed)] text-white hover:bg-[var(--org-purple,#7c3aed)]/90 shadow-sm"
                                : "border border-[var(--border-default,rgba(15,23,42,0.14))] bg-[var(--surface-primary,#ffffff)] text-[var(--text-primary,#0f172a)] hover:border-[var(--org-purple,#7c3aed)] hover:text-[var(--org-purple,#7c3aed)]"
                            }`}
                          >
                            {isSelected ? (
                              <>
                                <Check className="h-3.5 w-3.5" /> Selected
                              </>
                            ) : (
                              "Select Plan"
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--text-muted,#94a3b8)] py-8 text-center">
                    No plans available.
                  </p>
                )}
              </div>
            )}

            {/* STEP 3 — OPTIONAL EVENT ADD-ONS (CATEGORY-WISE MINIMAL VIEW) */}
            {step === 3 && (
              <div className="space-y-6">
                <SectionHeader
                  title="Add-ons"
                  description="Extend your event with optional attendee, abstract, speaker, or storage capacity."
                />

                {/* Running total banner */}
                {selectedPlan && (
                  <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--border-subtle,rgba(15,23,42,0.08))] bg-[var(--surface-secondary,#f8fafc)] p-4 shadow-sm">
                    <div>
                      <p className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-muted,#94a3b8)]">
                        Base Plan Selected
                      </p>
                      <p className="text-sm font-bold text-[var(--text-primary,#0f172a)]">
                        {selectedPlan.name}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-muted,#94a3b8)]">
                        {calculating ? "Calculating…" : "Running Total"}
                      </p>
                      <p className="text-lg font-bold font-mono text-[var(--org-purple,#7c3aed)]">
                        {formatCurrency(totalPrice)}
                      </p>
                    </div>
                  </div>
                )}

                {!selectedPlan ? (
                  <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--border-default,rgba(15,23,42,0.14))] bg-[var(--surface-secondary,#f8fafc)]/50 p-8 text-center">
                    <Lock className="h-6 w-6 text-[var(--text-muted,#94a3b8)]" />
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary,#0f172a)]">
                        Event plan not selected
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-secondary,#64748b)] max-w-md">
                        Add-ons require a base Event plan. Skip this step or go
                        back and choose a plan.
                      </p>
                    </div>
                  </div>
                ) : addons.length > 0 ? (
                  <>
                    {/* Category Tabs */}
                    <div
                      className="commercial-category-tabs"
                      role="tablist"
                      aria-label="Add-on categories"
                    >
                      {addonCategories.map((category) => {
                        const Icon = category.icon;
                        const count =
                          category.id === "all"
                            ? addons.length
                            : addons.filter(
                                (addon) =>
                                  getAddonCategory(addon) === category.id,
                              ).length;
                        return (
                          <button
                            key={category.id}
                            type="button"
                            role="tab"
                            aria-selected={addonCategory === category.id}
                            className={
                              addonCategory === category.id ? "is-active" : ""
                            }
                            onClick={() => setAddonCategory(category.id)}
                          >
                            <Icon className="size-3.5" />
                            {category.label}
                            <span className="ml-1 opacity-70">({count})</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Minimal Add-on rows */}
                    <div className="space-y-2 mt-4">
                      {visibleAddons.length ? (
                        visibleAddons.map((addon) => {
                          const isSelected = selectedAddons.includes(
                            addon.rawKey,
                          );
                          const catId = getAddonCategory(addon);
                          const Icon = getAddonIcon(catId);
                          const badge = getAddonCapacityBadge(addon);

                          return (
                            <div
                              key={addon.id ?? addon.key ?? addon.rawKey}
                              className={`group flex items-center justify-between gap-3 p-3.5 rounded-xl border transition-all duration-150 ${
                                isSelected
                                  ? "border-[var(--org-purple,#7c3aed)] bg-[color-mix(in_srgb,var(--org-purple,#7c3aed)_6%,var(--surface-primary,#ffffff))] shadow-sm"
                                  : "border-[var(--border-subtle,rgba(15,23,42,0.08))] bg-[var(--surface-primary,#ffffff)] hover:border-[var(--border-default,rgba(15,23,42,0.14))] hover:bg-[var(--surface-secondary,#f8fafc)]/50"
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div
                                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-sm transition-colors ${
                                    isSelected
                                      ? "border-[var(--org-purple,#7c3aed)] bg-[var(--org-purple,#7c3aed)]/10 text-[var(--org-purple,#7c3aed)]"
                                      : "border-[var(--border-subtle,rgba(15,23,42,0.08))] bg-[var(--surface-secondary,#f8fafc)] text-[var(--text-secondary,#64748b)] group-hover:text-[var(--text-primary,#0f172a)]"
                                  }`}
                                >
                                  <Icon className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <strong className="text-sm font-semibold text-[var(--text-primary,#0f172a)] truncate">
                                      {addon.name}
                                    </strong>
                                    {badge ? (
                                      <span className="rounded-full bg-[var(--surface-secondary,#f8fafc)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary,#64748b)] border border-[var(--border-subtle,rgba(15,23,42,0.08))]">
                                        {badge}
                                      </span>
                                    ) : null}
                                  </div>
                                  <p className="text-xs text-[var(--text-secondary,#64748b)] truncate mt-0.5">
                                    {addon.description ||
                                      "Optional event capacity extension."}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-3.5 shrink-0">
                                <div className="text-right">
                                  <span className="text-sm font-bold font-mono text-[var(--text-primary,#0f172a)]">
                                    {addon.price !== null &&
                                    addon.price !== undefined
                                      ? formatCurrency(
                                          addon.price,
                                          addon.currency,
                                        )
                                      : "Included"}
                                  </span>
                                  <span className="block text-[10px] text-[var(--text-muted,#94a3b8)]">
                                    One-time
                                  </span>
                                </div>

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleToggleAddon(addon.rawKey)
                                  }
                                  className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-all cursor-pointer ${
                                    isSelected
                                      ? "bg-[var(--org-purple,#7c3aed)] text-white hover:bg-[var(--org-purple,#7c3aed)]/90 shadow-sm"
                                      : "border border-[var(--border-default,rgba(15,23,42,0.14))] bg-[var(--surface-primary,#ffffff)] text-[var(--text-primary,#0f172a)] hover:border-[var(--org-purple,#7c3aed)] hover:text-[var(--org-purple,#7c3aed)]"
                                  }`}
                                >
                                  {isSelected ? (
                                    <>
                                      <Check className="h-3.5 w-3.5" /> Added
                                    </>
                                  ) : (
                                    <>
                                      <Plus className="h-3.5 w-3.5" /> Add
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border-subtle,rgba(15,23,42,0.08))] p-6 text-center">
                          <PackagePlus className="h-5 w-5 text-[var(--text-muted,#94a3b8)]" />
                          <p className="text-xs text-[var(--text-muted,#94a3b8)]">
                            No add-ons found in this category.
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-[var(--text-muted,#94a3b8)] py-8 text-center">
                    No add-ons available.
                  </p>
                )}
              </div>
            )}

            {/* STEP 4 — REVIEW, CREATE DRAFT & OPTIONAL PAYMENT */}
            {step === 4 && (
              <div className="space-y-6">
                <SectionHeader
                  title="Review & Confirm"
                  description="Verify the conference identity and activation plan before creating the event."
                />

                <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
                  {/* Left — all event data */}
                  <div className="space-y-4 min-w-0">
                    <ReviewSection title="Event Identity">
                      <ReviewInfoBlock
                        icon={Sparkles}
                        label="Event Name"
                        value={formData.name || "Pending"}
                      />
                      <ReviewInfoBlock
                        icon={Hash}
                        label="Short Code"
                        value={formData.short_code || "Pending"}
                      />
                      <ReviewInfoBlock
                        icon={Tag}
                        label="Tagline"
                        value={formData.tagline || "—"}
                      />
                      <div className="sm:col-span-2">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted,#94a3b8)] mb-1">
                          Description
                        </div>
                        <p className="text-xs text-[var(--text-secondary,#64748b)] leading-relaxed line-clamp-3">
                          {formData.description || "—"}
                        </p>
                      </div>
                    </ReviewSection>

                    <ReviewSection title="Organizer Entity">
                      <ReviewInfoBlock
                        icon={Building2}
                        label="Name"
                        value={formData.organizer_details.name || "—"}
                      />
                      <ReviewInfoBlock
                        icon={Mail}
                        label="Email"
                        value={formData.organizer_details.email || "—"}
                      />
                      <ReviewInfoBlock
                        icon={Phone}
                        label="Phone"
                        value={formData.organizer_details.phone || "—"}
                      />
                      <ReviewInfoBlock
                        icon={Globe}
                        label="Website"
                        value={formData.organizer_details.website || "—"}
                      />
                    </ReviewSection>

                    <div className="space-y-3.5 rounded-xl border border-[var(--border-subtle,rgba(15,23,42,0.08))] bg-[var(--surface-primary,#ffffff)] p-5 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted,#94a3b8)]">
                              Event activation plan
                            </p>
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                selectedPlan && selectedPlan.key !== "EVENT_FREE"
                                  ? "bg-[var(--org-purple,#7c3aed)]/10 text-[var(--org-purple,#7c3aed)]"
                                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                              }`}
                            >
                              {selectedPlan && selectedPlan.key !== "EVENT_FREE"
                                ? selectedPlan.name
                                : "Draft · Free Tier"}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-[var(--text-secondary,#64748b)]">
                            {selectedPlan && selectedPlan.key !== "EVENT_FREE"
                              ? `${selectedPlan.name} will activate this event after payment.`
                              : "Operating under Free Tier limits (25 registrations, 5 speakers, 5 abstracts, 1 GB storage, 100 emails). The event will remain a draft until a commercial plan is purchased."}
                          </p>
                        </div>
                        {selectedPlan && selectedPlan.key !== "EVENT_FREE" ? (
                          <button
                            type="button"
                            onClick={() => setSelectedPlan(FREE_DRAFT_PLAN)}
                            className="rounded-full border border-[var(--border-default,rgba(15,23,42,0.14))] px-3 py-1 text-xs font-semibold text-[var(--text-secondary,#64748b)] hover:border-[var(--org-purple,#7c3aed)] hover:text-[var(--org-purple,#7c3aed)] cursor-pointer"
                          >
                            Switch to Free Draft
                          </button>
                        ) : null}
                      </div>

                      {/* Included capacities preview in review */}
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1 pb-1">
                        <div className="rounded-lg bg-[var(--surface-secondary,#f8fafc)] p-2 text-center">
                          <span className="block text-[10px] text-[var(--text-muted,#94a3b8)] uppercase tracking-wider font-semibold">Registrations</span>
                          <span className="text-xs font-bold font-mono text-[var(--text-primary,#0f172a)]">
                            {selectedPlan?.maxRegistrations ? selectedPlan.maxRegistrations.toLocaleString() : selectedPlan?.quoteOnly ? "Quote" : "25"}
                          </span>
                        </div>
                        <div className="rounded-lg bg-[var(--surface-secondary,#f8fafc)] p-2 text-center">
                          <span className="block text-[10px] text-[var(--text-muted,#94a3b8)] uppercase tracking-wider font-semibold">Abstracts</span>
                          <span className="text-xs font-bold font-mono text-[var(--text-primary,#0f172a)]">
                            {selectedPlan?.maxAbstracts ? selectedPlan.maxAbstracts.toLocaleString() : selectedPlan?.quoteOnly ? "Quote" : "5"}
                          </span>
                        </div>
                        <div className="rounded-lg bg-[var(--surface-secondary,#f8fafc)] p-2 text-center">
                          <span className="block text-[10px] text-[var(--text-muted,#94a3b8)] uppercase tracking-wider font-semibold">Speakers</span>
                          <span className="text-xs font-bold font-mono text-[var(--text-primary,#0f172a)]">
                            {selectedPlan?.maxSpeakers ? selectedPlan.maxSpeakers.toLocaleString() : selectedPlan?.quoteOnly ? "Quote" : "5"}
                          </span>
                        </div>
                        <div className="rounded-lg bg-[var(--surface-secondary,#f8fafc)] p-2 text-center">
                          <span className="block text-[10px] text-[var(--text-muted,#94a3b8)] uppercase tracking-wider font-semibold">Storage</span>
                          <span className="text-xs font-bold font-mono text-[var(--text-primary,#0f172a)]">
                            {selectedPlan?.maxStorageGb ? `${selectedPlan.maxStorageGb} GB` : selectedPlan?.quoteOnly ? "Quote" : "1 GB"}
                          </span>
                        </div>
                        <div className="rounded-lg bg-[var(--surface-secondary,#f8fafc)] p-2 text-center col-span-2 sm:col-span-1">
                          <span className="block text-[10px] text-[var(--text-muted,#94a3b8)] uppercase tracking-wider font-semibold">Email</span>
                          <span className="text-xs font-bold font-mono text-[var(--text-primary,#0f172a)]">
                            {selectedPlan?.maxEmailCredits ? selectedPlan.maxEmailCredits.toLocaleString() : selectedPlan?.quoteOnly ? "Quote" : "100"}
                          </span>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 pt-1">
                        {plans.map((plan) => {
                          const selected = selectedPlan?.key === plan.key;
                          return (
                            <button
                              key={plan.id ?? plan.key ?? plan.name}
                              type="button"
                              onClick={() => handleSelectPlan(plan)}
                              className={`min-w-0 rounded-xl border p-3.5 text-left transition-all cursor-pointer ${
                                selected
                                  ? "border-[var(--org-purple,#7c3aed)] bg-[color-mix(in_srgb,var(--org-purple,#7c3aed)_6%,var(--surface-primary,#ffffff))] shadow-xs"
                                  : "border-[var(--border-subtle,rgba(15,23,42,0.08))] bg-[var(--surface-secondary,#f8fafc)]/50 hover:border-[var(--border-default,rgba(15,23,42,0.14))]"
                              }`}
                            >
                              <span className="flex min-w-0 items-start justify-between gap-2">
                                <span className="min-w-0">
                                  <strong className="block truncate text-xs text-[var(--text-primary,#0f172a)]">
                                    {plan.name}
                                  </strong>
                                  <small className="mt-0.5 block text-[11px] text-[var(--text-secondary,#64748b)] truncate">
                                    {plan.description || plan.tagline}
                                  </small>
                                </span>
                                <span className="shrink-0 text-xs font-bold text-[var(--org-purple,#7c3aed)] font-mono">
                                  {plan.price === 0
                                    ? "Free"
                                    : plan.quoteOnly || plan.price === null
                                      ? "Quote"
                                      : formatCurrency(plan.price, plan.currency)}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Selected Add-ons summary in review */}
                    {selectedAddonRecords.length > 0 && (
                      <div className="space-y-3 rounded-xl border border-[var(--border-subtle,rgba(15,23,42,0.08))] bg-[var(--surface-primary,#ffffff)] p-5 shadow-sm">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted,#94a3b8)]">
                          Selected Add-ons ({selectedAddonRecords.length})
                        </p>
                        <div className="divide-y divide-[var(--border-subtle,rgba(15,23,42,0.08))]">
                          {selectedAddonRecords.map((addon) => (
                            <div
                              key={addon.rawKey}
                              className="flex items-center justify-between py-2 text-xs"
                            >
                              <span className="font-medium text-[var(--text-primary,#0f172a)]">
                                {addon.name}
                              </span>
                              <span className="font-bold font-mono text-[var(--text-primary,#0f172a)]">
                                {formatCurrency(addon.price, addon.currency)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {requiresPurchase && (
                      <div className="space-y-3.5 rounded-xl border border-[var(--border-subtle,rgba(15,23,42,0.08))] bg-[var(--surface-primary,#ffffff)] p-5 shadow-sm">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted,#94a3b8)]">
                              Billing Contact Details
                            </p>
                            <p className="text-xs text-[var(--text-secondary,#64748b)] mt-0.5">
                              Contact details submitted with the activation checkout.
                            </p>
                          </div>
                          <span className="rounded-full bg-[var(--surface-secondary,#f8fafc)] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--text-muted,#94a3b8)] border border-[var(--border-subtle,rgba(15,23,42,0.08))]">
                            Required
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
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
                      <ReviewInfoBlock
                        icon={Calendar}
                        label="Start Date"
                        value={formData.start_date || "Pending"}
                      />
                      <ReviewInfoBlock
                        icon={Calendar}
                        label="End Date"
                        value={formData.end_date || "Pending"}
                      />
                      <ReviewInfoBlock
                        icon={Building2}
                        label="Venue Name"
                        value={formData.venue_name || "—"}
                      />
                      <ReviewInfoBlock
                        icon={MapPin}
                        label="Address / City"
                        value={formData.location || "—"}
                      />
                      <ReviewInfoBlock
                        icon={Globe}
                        label="Timezone"
                        value={formData.timezone}
                      />
                    </ReviewSection>

                    {/* Activation outcome banner */}
                    <div className="flex items-start gap-3 rounded-xl border border-[var(--border-subtle,rgba(15,23,42,0.08))] bg-[var(--surface-secondary,#f8fafc)] p-4">
                      <Sparkles className="h-5 w-5 shrink-0 text-[var(--org-purple,#7c3aed)] mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-[var(--text-primary,#0f172a)]">
                          {selectedPlan && selectedPlan.key !== "EVENT_FREE"
                            ? `${selectedPlan.name} · ${formatCurrency(totalPrice)} total`
                            : "Draft event mode · Free Tier"}
                        </p>
                        <p className="text-xs text-[var(--text-secondary,#64748b)]">
                          {selectedPlan && selectedPlan.key !== "EVENT_FREE"
                            ? selectedPlan.quoteOnly ||
                              selectedPlan.price === null
                              ? "The event will be created as a draft and activate after the quotation is approved and paid."
                              : `The draft will activate after checkout payment of ${formatCurrency(totalPrice)}.`
                            : "The event will be created as a draft under Free Tier limits (25 registrations, 5 speakers). You can register attendees, add speakers, and purchase an Event plan later from Commercial."}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Right — venue image & modules */}
                  <div className="space-y-4">
                    <div className="sticky top-6 space-y-4">
                      <div className="aspect-[4/3] overflow-hidden rounded-xl border border-[var(--border-subtle,rgba(15,23,42,0.08))] bg-[var(--surface-secondary,#f8fafc)]">
                        {pendingVenueImages.length > 0 ? (
                          <img
                            src={pendingVenueImages[0].previewUrl}
                            alt="Venue"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full flex-col items-center justify-center gap-3">
                            <Building2 className="h-10 w-10 text-[var(--text-muted,#94a3b8)]" />
                            <p className="px-4 text-center text-xs text-[var(--text-muted,#94a3b8)]">
                              No venue image uploaded
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Modules summary */}
                      <div className="space-y-2 rounded-xl border border-[var(--border-subtle,rgba(15,23,42,0.08))] bg-[var(--surface-primary,#ffffff)] p-4 shadow-sm">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted,#94a3b8)]">
                          Modules Configured
                        </p>
                        {[
                          {
                            label: "Speaker Desk",
                            on: formData.speaker_settings.enabled,
                          },
                          {
                            label: "Registration Desk",
                            on: formData.registration_settings.enabled,
                          },
                        ].map(({ label, on }) => (
                          <div
                            key={label}
                            className="flex items-center justify-between text-xs py-1"
                          >
                            <span className="text-[var(--text-secondary,#64748b)]">
                              {label}
                            </span>
                            <span
                              className={
                                on
                                  ? "font-semibold text-emerald-600 dark:text-emerald-400"
                                  : "text-[var(--text-muted,#94a3b8)]"
                              }
                            >
                              {on ? "Enabled" : "Disabled"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Bottom Action Navigation Bar ───────────────────────────────── */}
          <div className="sticky bottom-4 z-20">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle,rgba(15,23,42,0.08))] bg-[var(--surface-primary,#ffffff)]/90 backdrop-blur-md px-6 py-4 shadow-lg">
              <div className="text-xs font-medium text-[var(--text-secondary,#64748b)]">
                Step {step + 1} of {stepMeta.length} · {stepMeta[step].label}
              </div>
              <div className="flex items-center gap-3">
                {step > 0 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setStep((current) => Math.max(0, current - 1) as StepId)
                    }
                    className="rounded-full h-9 px-4 text-xs font-semibold"
                  >
                    <ArrowLeft className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                    Back
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push("/events")}
                    className="rounded-full h-9 px-4 text-xs font-semibold"
                  >
                    Cancel
                  </Button>
                )}

                {step === 0 && (
                  <Button
                    disabled={!canContinueBasics}
                    onClick={() => setStep(1)}
                    className="rounded-full bg-[var(--org-purple,#7c3aed)] hover:bg-[var(--org-purple,#7c3aed)]/90 text-white h-9 px-5 text-xs font-semibold shadow-sm"
                  >
                    Continue to Venue
                    <ChevronRight className="h-3.5 w-3.5 ml-1.5" aria-hidden="true" />
                  </Button>
                )}
                {step === 1 && (
                  <Button
                    disabled={!canContinueVenue}
                    onClick={() => setStep(2)}
                    className="rounded-full bg-[var(--org-purple,#7c3aed)] hover:bg-[var(--org-purple,#7c3aed)]/90 text-white h-9 px-5 text-xs font-semibold shadow-sm"
                  >
                    Continue to Plan
                    <ChevronRight className="h-3.5 w-3.5 ml-1.5" aria-hidden="true" />
                  </Button>
                )}
                {step === 2 && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedPlan(FREE_DRAFT_PLAN);
                        setSelectedAddons([]);
                        setStep(3);
                      }}
                      className="rounded-full h-9 px-4 text-xs font-semibold text-[var(--text-secondary,#64748b)]"
                    >
                      Start with Free Draft
                    </Button>
                    <Button
                      onClick={() => setStep(3)}
                      className="rounded-full bg-[var(--org-purple,#7c3aed)] hover:bg-[var(--org-purple,#7c3aed)]/90 text-white h-9 px-5 text-xs font-semibold shadow-sm"
                    >
                      Continue to Add-ons
                      <ChevronRight
                        className="h-3.5 w-3.5 ml-1.5"
                        aria-hidden="true"
                      />
                    </Button>
                  </>
                )}
                {step === 3 && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedAddons([]);
                        setStep(4);
                      }}
                      className="rounded-full h-9 px-4 text-xs font-semibold text-[var(--text-secondary,#64748b)]"
                    >
                      Skip add-ons
                    </Button>
                    <Button
                      onClick={() => setStep(4)}
                      className="rounded-full bg-[var(--org-purple,#7c3aed)] hover:bg-[var(--org-purple,#7c3aed)]/90 text-white h-9 px-5 text-xs font-semibold shadow-sm"
                    >
                      Review & Confirm
                      <ChevronRight
                        className="h-3.5 w-3.5 ml-1.5"
                        aria-hidden="true"
                      />
                    </Button>
                  </>
                )}
                {step === 4 && (
                  <Button
                    disabled={
                      loading || checkout.isPending || mockPayment.isPending
                    }
                    onClick={handleCreateEvent}
                    className="rounded-full bg-[var(--org-purple,#7c3aed)] hover:bg-[var(--org-purple,#7c3aed)]/90 text-white h-10 px-6 text-xs font-semibold shadow-sm"
                  >
                    {loading ? (
                      <Loader2
                        className="h-4 w-4 animate-spin mr-2"
                        aria-hidden="true"
                      />
                    ) : (
                      <>
                        {selectedPlan && selectedPlan.key !== "EVENT_FREE" ? (
                          <CreditCard className="h-3.5 w-3.5 mr-2" />
                        ) : (
                          <Lock className="h-3.5 w-3.5 mr-2" />
                        )}
                        {selectedPlan && selectedPlan.key !== "EVENT_FREE"
                          ? selectedPlan.quoteOnly ||
                            selectedPlan.price === null
                            ? "Create Draft & Request Quote"
                            : "Create Draft & Pay"
                          : "Create Draft Event (Free Tier)"}
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
          <Loader2 className="h-8 w-8 animate-spin text-[var(--org-purple,#7c3aed)]" />
        </div>
      }
    >
      <NewEventPageInner />
    </Suspense>
  );
}

// ─── Local sub-components ────────────────────────────────────────────────────

function SectionHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-1 border-b border-[var(--border-subtle,rgba(15,23,42,0.08))] pb-4">
      <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary,#0f172a)]">
        {title}
      </h2>
      <p className="text-xs text-[var(--text-secondary,#64748b)]">
        {description}
      </p>
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
        <label
          htmlFor={id}
          className="text-xs font-semibold text-[var(--text-primary,#0f172a)]"
        >
          {label}
        </label>
        {description ? (
          <p className="text-[11px] text-[var(--text-secondary,#64748b)] leading-relaxed">
            {description}
          </p>
        ) : null}
      </div>
      <div className="relative">
        {Icon ? (
          <Icon
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted,#94a3b8)]"
            aria-hidden="true"
          />
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
          className={`h-11 rounded-xl border-[var(--border-default,rgba(15,23,42,0.14))] bg-[var(--surface-primary,#ffffff)] text-sm text-[var(--text-primary,#0f172a)] placeholder:text-[var(--text-muted,#94a3b8)] focus-visible:border-[var(--org-purple,#7c3aed)] focus-visible:ring-2 focus-visible:ring-[var(--org-purple,#7c3aed)]/20 focus-visible:ring-offset-0 transition-all ${
            Icon ? "pl-10" : ""
          }`}
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
        <label
          htmlFor={id}
          className="text-xs font-semibold text-[var(--text-primary,#0f172a)]"
        >
          {label}
        </label>
        {description ? (
          <p className="text-[11px] text-[var(--text-secondary,#64748b)] leading-relaxed">
            {description}
          </p>
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
        className="w-full resize-none rounded-xl border border-[var(--border-default,rgba(15,23,42,0.14))] bg-[var(--surface-primary,#ffffff)] p-3.5 text-sm text-[var(--text-primary,#0f172a)] placeholder:text-[var(--text-muted,#94a3b8)] focus:border-[var(--org-purple,#7c3aed)] focus:outline-none focus:ring-2 focus:ring-[var(--org-purple,#7c3aed)]/20 transition-all"
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
        <label
          htmlFor={id}
          className="text-xs font-semibold text-[var(--text-primary,#0f172a)]"
        >
          {label}
        </label>
        {description ? (
          <p className="text-[11px] text-[var(--text-secondary,#64748b)] leading-relaxed">
            {description}
          </p>
        ) : null}
      </div>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-xl border border-[var(--border-default,rgba(15,23,42,0.14))] bg-[var(--surface-primary,#ffffff)] px-3 text-sm text-[var(--text-primary,#0f172a)] focus:outline-none focus:border-[var(--org-purple,#7c3aed)] focus:ring-2 focus:ring-[var(--org-purple,#7c3aed)]/20 transition-all"
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
    <div className="flex items-center justify-between border-b border-[var(--border-subtle,rgba(15,23,42,0.08))] py-3 last:border-b-0">
      <div className="max-w-[80%] pr-4 text-left">
        <p className="text-sm font-semibold text-[var(--text-primary,#0f172a)]">
          {label}
        </p>
        <p className="text-xs text-[var(--text-secondary,#64748b)] leading-relaxed mt-0.5">
          {description}
        </p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
