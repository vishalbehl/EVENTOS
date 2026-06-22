"use client";

import dynamic from "next/dynamic";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  Headset,
  Loader2,
  PackagePlus,
  Receipt,
  RefreshCw,
  Search,
  ShoppingCart,
  Star,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BillingApiRecord,
  useAddons,
  useBillingCart,
  useBillingHistory,
  useCheckout,
  useCurrentPlan,
  useFeatureMatrix,
  usePlans,
  useRemoveAddon,
  useSelectAddon,
  useSelectPlan,
} from "@/hooks/useBilling";
import { cn, downloadCSV, formatApiError, formatDateInTZ } from "@/lib/utils";

const LazyAddonFeatureDetails = dynamic(
  () =>
    import("@/components/organizer/billing/AddonFeatureDetails").then((mod) => ({
      default: mod.AddonFeatureDetails,
    })),
  {
    loading: () => <Skeleton className="h-40 rounded-2xl" />,
  }
);

type UsageMetric = {
  key: string;
  label: string;
  used: number | null;
  limit: number | null;
  unit?: string;
};

type NormalizedPlan = {
  id?: string;
  key?: string;
  name: string;
  tagline?: string;
  description?: string;
  price?: number | null;
  priceMax?: number | null;
  currency?: string;
  billingModel?: string;
  color?: string;
  isPopular?: boolean;
  isCurrent?: boolean;
  limits: Record<string, number | null | undefined>;
  featureHighlights: string[];
  raw: BillingApiRecord;
};

type MatrixColumn = {
  key: string;
  label: string;
};

type MatrixRow = {
  id: string;
  label: string;
  values: Record<string, string>;
};

type MatrixCategory = {
  id: string;
  label: string;
  rows: MatrixRow[];
};

type NormalizedAddon = {
  id?: string;
  key?: string;
  name: string;
  description?: string;
  icon?: string;
  price?: number | null;
  currency?: string;
  billingUnit?: string;
  planEligibility?: string;
  category?: string;
  status?: string;
  featureCount: number;
  selected: boolean;
  specs: Array<{ category: string; feature: string; value: string }>;
  raw: BillingApiRecord;
};

type HistoryAction = {
  label: string;
  href?: string;
  action?: string;
};

type NormalizedHistory = {
  id: string;
  plan: string;
  eventName: string;
  eventDates: string;
  purchaseDate: string;
  amountPaid: number | null;
  status: string;
  addons: string[];
  actions: HistoryAction[];
};

type CartSummary = {
  selectedPlanName?: string;
  basePrice: number;
  addons: Array<{ id: string; name: string; price: number }>;
  subtotal: number;
  gst: number;
  total: number;
  currency: string;
};

const LIMIT_FIELDS = [
  { key: "users", label: "Users" },
  { key: "registrations", label: "Registrations" },
  { key: "speakers", label: "Speakers" },
  { key: "sessions", label: "Sessions" },
  { key: "rooms", label: "Rooms" },
  { key: "storage", label: "Storage" },
] as const;

const USAGE_LABELS: Record<string, string> = {
  organizer_users: "Organizer Users",
  users: "Organizer Users",
  registrations: "Registrations",
  speakers: "Speakers",
  sessions: "Sessions",
  rooms: "Rooms",
  storage: "Storage",
};

function asArray<T = BillingApiRecord>(value: any): T[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.results)) return value.results;
  return [];
}

function toTitle(value?: string | null) {
  if (!value) return "";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function toNumber(value: any) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatCurrency(amount: number | null | undefined, currency = "INR") {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "TBD";
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

function formatMetricValue(metric: UsageMetric) {
  const used = metric.used ?? 0;
  if (metric.limit === null || metric.limit === undefined) {
    return metric.unit ? `${used.toLocaleString()} ${metric.unit} / Unlimited` : "Unlimited";
  }

  if (metric.unit) {
    return `${used.toLocaleString()} ${metric.unit} / ${metric.limit.toLocaleString()} ${metric.unit}`;
  }

  return `${used.toLocaleString()} / ${metric.limit.toLocaleString()}`;
}

function usageTone(used: number | null, limit: number | null) {
  if (limit === null || limit === undefined || limit <= 0) {
    return {
      bar: "from-emerald-400 to-teal-400",
      text: "text-emerald-300",
      pct: 0,
    };
  }

  const pct = Math.max(0, Math.min(100, ((used ?? 0) / limit) * 100));
  if (pct >= 90) return { bar: "from-rose-500 to-red-400", text: "text-rose-300", pct };
  if (pct >= 70) return { bar: "from-amber-400 to-orange-400", text: "text-amber-300", pct };
  return { bar: "from-emerald-400 to-teal-400", text: "text-emerald-300", pct };
}

function getLimitValue(record: BillingApiRecord, baseKey: string) {
  const candidates = [
    record?.limits?.[baseKey],
    record?.limits?.[`max_${baseKey}`],
    record?.[`max_${baseKey}`],
    record?.[baseKey],
    baseKey === "storage" ? record?.storage_quota_gb : undefined,
    baseKey === "storage" ? (toNumber(record?.storage_quota_mb) ?? 0) / 1024 : undefined,
  ];
  const found = candidates.find((value) => value !== undefined);
  return toNumber(found);
}

function collectFeatureHighlights(record: BillingApiRecord) {
  const highlights = [
    ...asArray<string>(record?.feature_highlights),
    ...asArray<string>(record?.features_preview),
    ...asArray<string>(record?.enabled_features),
  ]
    .map((value) => toTitle(String(value)))
    .filter(Boolean);

  if (highlights.length > 0) return [...new Set(highlights)].slice(0, 5);

  const featureObject = record?.features || record?.feature_flags;
  if (featureObject && typeof featureObject === "object") {
    return Object.entries(featureObject)
      .filter(([, value]) => value === true)
      .map(([key]) => toTitle(key))
      .slice(0, 5);
  }

  return [];
}

function normalizePlan(raw: BillingApiRecord, currentPlanName?: string) {
  return {
    id: raw.id ?? raw.plan_id,
    key: raw.key ?? raw.plan_key,
    name: raw.name ?? raw.plan_name ?? "Unnamed Plan",
    tagline: raw.tagline ?? raw.subtitle,
    description: raw.description,
    price: toNumber(raw.price ?? raw.price_per_event ?? raw.price_per_event_min ?? raw.base_price),
    priceMax: toNumber(raw.price_max ?? raw.price_per_event_max),
    currency: raw.currency ?? "INR",
    billingModel: raw.billing_model ?? raw.billingModel ?? "PER_EVENT",
    color: raw.color_hex ?? raw.plan_color ?? raw.color ?? "var(--pri)",
    isPopular: Boolean(raw.is_popular ?? raw.popular),
    isCurrent:
      String(raw.name ?? raw.plan_name ?? "").toLowerCase() === String(currentPlanName ?? "").toLowerCase(),
    limits: LIMIT_FIELDS.reduce<Record<string, number | null | undefined>>((acc, item) => {
      acc[item.key] = getLimitValue(raw, item.key);
      return acc;
    }, {}),
    featureHighlights: collectFeatureHighlights(raw),
    raw,
  } satisfies NormalizedPlan;
}

function normalizeUsageMetrics(source: BillingApiRecord) {
  const usageSource = source?.usage ?? source?.metrics ?? source?.consumption ?? {};
  return Object.entries(usageSource)
    .map(([key, value]) => {
      const record: BillingApiRecord = value && typeof value === "object" ? (value as BillingApiRecord) : { used: value };
      const unit = key.includes("storage") ? "GB" : undefined;
      const rawUsed = toNumber(record.used ?? record.current ?? record.value);
      const rawLimit = toNumber(record.limit ?? record.max ?? record.allowed);
      const used = key.includes("storage") && unit === "GB" && rawUsed !== null && rawUsed > 1000 ? rawUsed / 1024 : rawUsed;
      const limit = key.includes("storage") && unit === "GB" && rawLimit !== null && rawLimit > 1000 ? rawLimit / 1024 : rawLimit;

      return {
        key,
        label: USAGE_LABELS[key] ?? toTitle(key),
        used,
        limit,
        unit,
      } satisfies UsageMetric;
    })
    .filter((item) => item.label);
}

function normalizeCurrentPlan(data: BillingApiRecord) {
  const planSource = data?.plan ?? data?.current_plan ?? data?.subscription ?? data;
  const planName = planSource?.name ?? planSource?.plan_name ?? "Current Plan";
  const eventSource = data?.event ?? data?.current_event ?? {};
  return {
    planName,
    status: planSource?.status ?? data?.status ?? "Unknown",
    purchaseDate: planSource?.purchase_date ?? data?.purchase_date ?? planSource?.created_at,
    expiryDate: planSource?.expiry_date ?? planSource?.current_period_end ?? data?.expiry_date,
    eventName: eventSource?.name ?? data?.event_name ?? "No event linked",
    eventStatus: eventSource?.status ?? data?.event_status ?? "N/A",
    price: toNumber(planSource?.price ?? planSource?.amount_paid ?? data?.price),
    currency: planSource?.currency ?? data?.currency ?? "INR",
    usage: normalizeUsageMetrics(data),
  };
}

function extractMatrixColumns(matrix: any, plans: NormalizedPlan[]) {
  const fromMatrix = asArray<any>(matrix?.plans).map((plan) => ({
    key: String(plan.key ?? plan.id ?? plan.name),
    label: plan.name ?? plan.label ?? plan.key ?? "Plan",
  }));

  if (fromMatrix.length > 0) return fromMatrix;

  return plans.map((plan) => ({
    key: String(plan.id ?? plan.key ?? plan.name),
    label: plan.name,
  }));
}

function normalizeMatrix(
  matrix: BillingApiRecord[] | BillingApiRecord | undefined,
  plans: NormalizedPlan[]
) {
  const raw = Array.isArray(matrix) ? matrix : asArray(matrix?.categories);
  const columns = extractMatrixColumns(matrix, plans);

  const categories = raw.map((category, categoryIndex) => {
    const rows = asArray<any>(category.features ?? category.rows ?? category.items).map((feature, rowIndex) => {
      const values: Record<string, string> = {};

      columns.forEach((column) => {
        const rawValue =
          feature?.values?.[column.key] ??
          feature?.plans?.[column.key] ??
          feature?.plans?.[column.label] ??
          feature?.[column.key] ??
          feature?.[column.label];

        values[column.key] =
          rawValue === true
            ? "Yes"
            : rawValue === false
              ? "No"
              : rawValue === null || rawValue === undefined || rawValue === ""
                ? "-"
                : String(rawValue);
      });

      return {
        id: String(feature.id ?? feature.key ?? `${categoryIndex}-${rowIndex}`),
        label: feature.name ?? feature.label ?? feature.feature ?? "Feature",
        values,
      } satisfies MatrixRow;
    });

    return {
      id: String(category.id ?? category.key ?? category.category ?? categoryIndex),
      label: category.category_name ?? category.name ?? category.label ?? category.category ?? "Category",
      rows,
    } satisfies MatrixCategory;
  });

  return { columns, categories };
}

function normalizeAddonSpecs(raw: BillingApiRecord) {
  const direct = asArray<any>(raw.features_spec ?? raw.specs ?? raw.features_matrix).map((item) => ({
    category: item.category ?? item.group ?? "Features",
    feature: item.feature ?? item.name ?? "Feature",
    value:
      item.value === true
        ? "Included"
        : item.value === false
          ? "Not included"
          : String(item.value ?? item.status ?? item.option ?? "Included"),
  }));

  if (direct.length > 0) return direct;

  const featureObject = raw.features;
  if (featureObject && typeof featureObject === "object" && !Array.isArray(featureObject)) {
    return Object.entries(featureObject).map(([key, value]) => ({
      category: raw.category ?? "Features",
      feature: toTitle(key),
      value: value === true ? "Included" : value === false ? "Not included" : String(value),
    }));
  }

  return [];
}

function normalizeAddon(raw: BillingApiRecord, cart: CartSummary) {
  const specs = normalizeAddonSpecs(raw);
  const price = toNumber(raw.price ?? raw.price_inr ?? raw.amount);
  const selected =
    cart.addons.some((item) => item.id === String(raw.id ?? raw.key ?? raw.name)) ||
    cart.addons.some((item) => item.name.toLowerCase() === String(raw.name ?? "").toLowerCase());

  return {
    id: raw.id,
    key: raw.key ?? raw.addon_key,
    name: raw.name ?? raw.title ?? "Add-on",
    description: raw.description ?? raw.summary,
    icon: raw.icon ?? raw.icon_name,
    price,
    currency: raw.currency ?? "INR",
    billingUnit: raw.billing_unit ?? raw.unit,
    planEligibility:
      raw.plan_eligibility ??
      raw.available_for_plans?.join(", ") ??
      raw.eligibility ??
      "All eligible plans",
    category: raw.category ?? raw.group,
    status: raw.status ?? (raw.is_active === false ? "Unavailable" : "Available"),
    featureCount: specs.length || toNumber(raw.feature_count) || 0,
    selected,
    specs,
    raw,
  } satisfies NormalizedAddon;
}

function normalizeCart(data: BillingApiRecord | undefined) {
  const items = asArray<any>(data?.selected_addons ?? data?.addons ?? data?.line_items).filter(
    (item) => item?.type !== "plan"
  );
  return {
    selectedPlanName:
      data?.selected_plan?.name ??
      data?.selected_plan_name ??
      data?.plan?.name ??
      data?.plan_name,
    basePrice: toNumber(data?.base_price ?? data?.plan_price ?? data?.subtotal_before_addons) ?? 0,
    addons: items.map((item, index) => ({
      id: String(item.id ?? item.key ?? item.name ?? index),
      name: item.name ?? item.label ?? item.key ?? "Add-on",
      price: toNumber(item.price ?? item.amount ?? item.price_inr) ?? 0,
    })),
    subtotal: toNumber(data?.subtotal ?? data?.sub_total ?? data?.amount_before_tax) ?? 0,
    gst: toNumber(data?.gst ?? data?.tax ?? data?.gst_amount) ?? 0,
    total: toNumber(data?.total ?? data?.grand_total ?? data?.amount_payable) ?? 0,
    currency: data?.currency ?? "INR",
  } satisfies CartSummary;
}

function normalizeHistory(data: BillingApiRecord[] | { items?: BillingApiRecord[] } | undefined) {
  return asArray<BillingApiRecord>(data).map((item, index) => {
    const actionList = asArray<any>(item.actions).map((action) => ({
      label: action.label ?? toTitle(action.name ?? action.action ?? "Action"),
      href: action.href ?? action.url,
      action: action.action ?? action.name,
    }));

    return {
      id: String(item.id ?? item.purchase_id ?? index),
      plan: item.plan_name ?? item.plan ?? "Plan",
      eventName: item.event_name ?? item.event?.name ?? "Event",
      eventDates:
        item.event_dates ??
        [item.event_start_date, item.event_end_date].filter(Boolean).join(" - ") ??
        "-",
      purchaseDate: item.purchase_date ?? item.created_at ?? "",
      amountPaid: toNumber(item.amount_paid ?? item.amount ?? item.total),
      status: item.status ?? "Unknown",
      addons: asArray<string>(item.addons_purchased ?? item.addons).map((value) => String(value)),
      actions: actionList,
    } satisfies NormalizedHistory;
  });
}

function MatrixValue({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  if (["yes", "true", "included", "enabled"].includes(normalized)) {
    return <Check className="mx-auto h-4 w-4 text-emerald-400" aria-label="Included" />;
  }
  if (["no", "false", "disabled", "not included"].includes(normalized)) {
    return <span className="mx-auto block text-center text-rose-400">-</span>;
  }
  return <span className="text-xs font-semibold text-[var(--text)]">{value}</span>;
}

function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[var(--sec)]">{eyebrow}</p>
        <div>
          <h2 className="text-2xl font-black tracking-[-0.03em] text-[var(--text)]">{title}</h2>
          <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">{description}</p>
        </div>
      </div>
      {actions}
    </div>
  );
}

function SectionError({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry?: () => void;
}) {
  return (
    <Card className="rounded-[1.75rem] border border-[color-mix(in_srgb,var(--dan)_25%,transparent)] bg-[color-mix(in_srgb,var(--dan)_10%,transparent)]">
      <CardContent className="flex flex-col items-start gap-4 p-6">
        <AlertTriangle className="h-5 w-5 text-[var(--dan)]" />
        <div>
          <p className="text-sm font-black text-[var(--text)]">{title}</p>
          <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
        </div>
        {onRetry && (
          <Button variant="outline" onClick={onRetry} className="rounded-xl border-default">
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function PlansAddonsManagement() {
  const currentPlanQuery = useCurrentPlan();
  const plansQuery = usePlans();
  const featureMatrixQuery = useFeatureMatrix();
  const addonsQuery = useAddons();
  const historyQuery = useBillingHistory();
  const cartQuery = useBillingCart();

  const selectPlan = useSelectPlan();
  const selectAddon = useSelectAddon();
  const removeAddon = useRemoveAddon();
  const checkout = useCheckout();

  const currentPlan = useMemo(
    () => normalizeCurrentPlan(currentPlanQuery.data ?? {}),
    [currentPlanQuery.data]
  );
  const cart = useMemo(() => normalizeCart(cartQuery.data), [cartQuery.data]);
  const plans = useMemo(
    () => asArray<BillingApiRecord>(plansQuery.data).map((plan) => normalizePlan(plan, currentPlan.planName)),
    [plansQuery.data, currentPlan.planName]
  );
  const matrix = useMemo(
    () => normalizeMatrix(featureMatrixQuery.data, plans),
    [featureMatrixQuery.data, plans]
  );
  const addons = useMemo(
    () => asArray<BillingApiRecord>(addonsQuery.data).map((addon) => normalizeAddon(addon, cart)),
    [addonsQuery.data, cart]
  );
  const history = useMemo(() => normalizeHistory(historyQuery.data), [historyQuery.data]);

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [expandedAddonId, setExpandedAddonId] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const matrixRef = useRef<HTMLDivElement | null>(null);
  const itemSize = 52;
  const viewportHeight = 520;

  useEffect(() => {
    if (matrix.categories.length > 0) {
      setExpandedCategories((prev) => {
        if (Object.keys(prev).length > 0) return prev;
        return Object.fromEntries(matrix.categories.map((category) => [category.id, true]));
      });
    }
  }, [matrix.categories]);

  const filteredMatrixCategories = useMemo(() => {
    const needle = deferredSearch.trim().toLowerCase();
    if (!needle) return matrix.categories;

    return matrix.categories
      .map((category) => ({
        ...category,
        rows: category.rows.filter((row) => row.label.toLowerCase().includes(needle)),
      }))
      .filter((category) => category.rows.length > 0);
  }, [matrix.categories, deferredSearch]);

  const flatMatrixItems = useMemo(() => {
    return filteredMatrixCategories.flatMap((category) => {
      const items: Array<
        | { type: "category"; id: string; label: string }
        | { type: "row"; id: string; label: string; values: Record<string, string> }
      > = [{ type: "category", id: category.id, label: category.label }];

      if (expandedCategories[category.id] !== false) {
        items.push(...category.rows.map((row) => ({ type: "row" as const, ...row })));
      }

      return items;
    });
  }, [filteredMatrixCategories, expandedCategories]);

  const startIndex = Math.max(0, Math.floor(scrollTop / itemSize) - 6);
  const endIndex = Math.min(
    flatMatrixItems.length,
    Math.ceil((scrollTop + viewportHeight) / itemSize) + 8
  );
  const virtualItems = flatMatrixItems.slice(startIndex, endIndex);

  const handlePlanSelect = async (plan: NormalizedPlan) => {
    const payload: BillingApiRecord = plan.id
      ? { plan_id: plan.id }
      : plan.key
        ? { plan_key: plan.key }
        : { plan_name: plan.name };

    try {
      await selectPlan.mutateAsync(payload);
      toast.success(`${plan.name} added to your order summary.`);
    } catch (error) {
      toast.error(formatApiError(error, "Failed to select plan."));
    }
  };

  const handleAddonToggle = async (addon: NormalizedAddon, remove = false) => {
    const payload: BillingApiRecord = addon.id
      ? { addon_id: addon.id }
      : addon.key
        ? { addon_key: addon.key }
        : { addon_name: addon.name };

    try {
      if (remove) {
        await removeAddon.mutateAsync(payload);
        toast.success(`${addon.name} removed from your order.`);
      } else {
        await selectAddon.mutateAsync(payload);
        toast.success(`${addon.name} added to your order.`);
      }
    } catch (error) {
      toast.error(formatApiError(error, `Failed to ${remove ? "remove" : "add"} add-on.`));
    }
  };

  const exportMatrix = () => {
    const header = ["Category", "Feature", ...matrix.columns.map((column) => column.label)];
    const rows = filteredMatrixCategories.flatMap((category) =>
      category.rows.map((row) => [
        `"${category.label.replace(/"/g, '""')}"`,
        `"${row.label.replace(/"/g, '""')}"`,
        ...matrix.columns.map((column) => `"${String(row.values[column.key] ?? "-").replace(/"/g, '""')}"`),
      ])
    );

    downloadCSV([header.join(","), ...rows.map((row) => row.join(","))].join("\n"), "billing-feature-matrix.csv");
  };

  const actionBusy =
    selectPlan.isPending || selectAddon.isPending || removeAddon.isPending || checkout.isPending;

  return (
    <div className="space-y-8 pb-12">
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-8">
          <SectionHeader
            eyebrow="Billing Workspace"
            title="Plans & Add-ons"
            description="Choose the best plan for your next conference and enhance it with optional services."
          />

          <section className="space-y-4">
            <SectionHeader
              eyebrow="Section 1"
              title="Current Subscription Summary"
              description="Review your active entitlements, event alignment, and current usage before changing plans."
            />

            {currentPlanQuery.isError ? (
              <SectionError
                title="Could not load current subscription"
                description={formatApiError(currentPlanQuery.error, "The current plan summary is unavailable right now.")}
                onRetry={() => currentPlanQuery.refetch()}
              />
            ) : currentPlanQuery.isLoading ? (
              <Card className="rounded-[2rem] border-default">
                <CardContent className="space-y-6 p-6">
                  <Skeleton className="h-8 w-60" />
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {[...Array(4)].map((_, index) => (
                      <Skeleton key={index} className="h-20 rounded-2xl" />
                    ))}
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    {[...Array(6)].map((_, index) => (
                      <Skeleton key={index} className="h-20 rounded-2xl" />
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="overflow-hidden rounded-[2rem] border-default bg-[linear-gradient(135deg,color-mix(in_srgb,var(--pri)_14%,transparent),color-mix(in_srgb,var(--text)_2%,transparent)_45%,transparent)]">
                <CardContent className="space-y-6 p-6 md:p-8">
                  <div className="flex flex-col gap-4 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] pb-6 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-3xl font-black tracking-[-0.04em] text-[var(--text)]">
                          {currentPlan.planName}
                        </h3>
                        <Badge className="border-0 bg-[color-mix(in_srgb,var(--pri)_20%,transparent)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--sec)]">
                          Current Active Plan
                        </Badge>
                      </div>
                      <p className="text-sm text-[var(--muted)]">Status: {toTitle(currentPlan.status)}</p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <SummaryStat label="Purchase Date" value={currentPlan.purchaseDate ? formatDateInTZ(currentPlan.purchaseDate) : "N/A"} />
                      <SummaryStat label="Expiry Date" value={currentPlan.expiryDate ? formatDateInTZ(currentPlan.expiryDate) : "N/A"} />
                      <SummaryStat label="Current Event" value={currentPlan.eventName} />
                      <SummaryStat label="Event Status" value={toTitle(currentPlan.eventStatus)} />
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 rounded-[1.5rem] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--text)_3%,transparent)] p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[var(--muted)]">Plan Price</p>
                      <p className="mt-2 text-2xl font-black tracking-[-0.03em] text-[var(--text)]">
                        {formatCurrency(currentPlan.price, currentPlan.currency)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--sec)_24%,transparent)] px-4 py-2 text-xs font-bold text-[var(--sec)]">
                      <Zap className="h-4 w-4" />
                      Usage updates automatically from billing APIs
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    {currentPlan.usage.map((metric) => {
                      const tone = usageTone(metric.used, metric.limit);
                      return (
                        <div
                          key={metric.key}
                          className="rounded-[1.5rem] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] p-5"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-black text-[var(--text)]">{metric.label}</p>
                              <p className={cn("mt-1 text-sm font-semibold", tone.text)}>{formatMetricValue(metric)}</p>
                            </div>
                            {metric.limit === null || metric.limit === undefined ? (
                              <Badge variant="success" className="uppercase tracking-[0.16em]">
                                Unlimited
                              </Badge>
                            ) : (
                              <span className="text-[11px] font-black text-[var(--muted)]">
                                {Math.round(tone.pct)}%
                              </span>
                            )}
                          </div>
                          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                            <div
                              className={cn("h-full rounded-full bg-gradient-to-r", tone.bar)}
                              style={{ width: metric.limit === null || metric.limit === undefined ? "100%" : `${tone.pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </section>

          <section className="space-y-4">
            <SectionHeader
              eyebrow="Section 2"
              title="Available Plans"
              description="Browse every available plan dynamically and compare scope, limits, and fit for your next event."
            />

            {plansQuery.isError ? (
              <SectionError
                title="Could not load available plans"
                description={formatApiError(plansQuery.error, "Available plans could not be retrieved.")}
                onRetry={() => plansQuery.refetch()}
              />
            ) : plansQuery.isLoading ? (
              <div className="grid gap-4 xl:grid-cols-3">
                {[...Array(3)].map((_, index) => (
                  <Card key={index} className="rounded-[2rem] border-default">
                    <CardContent className="space-y-4 p-6">
                      <Skeleton className="h-7 w-40" />
                      <Skeleton className="h-5 w-28" />
                      <Skeleton className="h-24 rounded-2xl" />
                      <Skeleton className="h-20 rounded-2xl" />
                      <Skeleton className="h-11 rounded-xl" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="grid gap-4 2xl:grid-cols-3">
                {plans.map((plan) => {
                  const priceLabel =
                    plan.priceMax && plan.priceMax !== plan.price
                      ? `${formatCurrency(plan.price, plan.currency)} - ${formatCurrency(plan.priceMax, plan.currency)}`
                      : formatCurrency(plan.price, plan.currency);

                  const relation =
                    currentPlan.price !== null && plan.price !== null
                      ? plan.price > currentPlan.price
                        ? "Upgrade"
                        : plan.price < currentPlan.price
                          ? "Downgrade"
                          : "Select Plan"
                      : "Select Plan";

                  return (
                    <Card
                      key={plan.id ?? plan.key ?? plan.name}
                      className="overflow-hidden rounded-[2rem] border-default bg-[color-mix(in_srgb,var(--text)_2%,transparent)]"
                    >
                      <CardContent className="space-y-5 p-6">
                        <div
                          className="rounded-[1.5rem] border border-transparent p-5"
                          style={{
                            background: `linear-gradient(135deg, ${plan.color}22, transparent 72%)`,
                            borderColor: `${plan.color}33`,
                          }}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-2xl font-black tracking-[-0.04em] text-[var(--text)]">
                                  {plan.name}
                                </h3>
                                {plan.isPopular && (
                                  <Badge className="border-0 bg-[color-mix(in_srgb,var(--pri)_16%,transparent)] uppercase tracking-[0.16em] text-[var(--sec)]">
                                    Most Popular
                                  </Badge>
                                )}
                                {plan.isCurrent && (
                                  <Badge variant="success" className="uppercase tracking-[0.16em]">
                                    Current Plan
                                  </Badge>
                                )}
                              </div>
                              <p className="mt-2 text-sm text-[var(--muted)]">
                                {plan.tagline || plan.description || "Enterprise-grade event operations coverage."}
                              </p>
                            </div>
                            <Star className="h-5 w-5" style={{ color: plan.color }} />
                          </div>

                          <div className="mt-5 flex items-end gap-2">
                            <p className="text-3xl font-black tracking-[-0.04em] text-[var(--text)]">{priceLabel}</p>
                            <span className="pb-1 text-[11px] font-black uppercase tracking-[0.18em] text-[var(--muted)]">
                              {toTitle(plan.billingModel)}
                            </span>
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          {LIMIT_FIELDS.map((item) => (
                            <div
                              key={item.key}
                              className="rounded-xl border border-[color-mix(in_srgb,var(--text)_6%,transparent)] px-3 py-3"
                            >
                              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--muted)]">
                                {item.label}
                              </p>
                              <p className="mt-2 text-sm font-black text-[var(--text)]">
                                {plan.limits[item.key] === null || plan.limits[item.key] === undefined
                                  ? "Unlimited"
                                  : `${plan.limits[item.key]?.toLocaleString()}${item.key === "storage" ? " GB" : ""}`}
                              </p>
                            </div>
                          ))}
                        </div>

                        <div className="rounded-[1.5rem] border border-[color-mix(in_srgb,var(--text)_6%,transparent)] p-4">
                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--muted)]">
                            Feature Highlights
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {plan.featureHighlights.length > 0 ? (
                              plan.featureHighlights.map((feature) => (
                                <span
                                  key={feature}
                                  className="rounded-full border border-[color-mix(in_srgb,var(--text)_8%,transparent)] px-3 py-1 text-xs font-semibold text-[var(--text)]"
                                >
                                  {feature}
                                </span>
                              ))
                            ) : (
                              <span className="text-sm text-[var(--muted)]">No published highlights returned by API.</span>
                            )}
                          </div>
                        </div>

                        <Button
                          disabled={plan.isCurrent || actionBusy}
                          onClick={() => handlePlanSelect(plan)}
                          className="h-11 w-full rounded-xl bg-[var(--pri)] font-black uppercase tracking-[0.18em] text-white"
                        >
                          {actionBusy && !plan.isCurrent ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          {plan.isCurrent ? "Already Active" : relation}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <SectionHeader
              eyebrow="Section 3"
              title="Plan Feature Comparison"
              description="Search, collapse, and export the full matrix across every plan without relying on any frontend-defined feature catalog."
              actions={
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search features"
                      className="h-11 w-full rounded-xl border-default bg-white/5 pl-10 sm:w-64"
                    />
                  </div>
                  <Button variant="outline" onClick={exportMatrix} className="h-11 rounded-xl border-default">
                    <Download className="mr-2 h-4 w-4" />
                    Export
                  </Button>
                </div>
              }
            />

            {featureMatrixQuery.isError ? (
              <SectionError
                title="Could not load feature matrix"
                description={formatApiError(featureMatrixQuery.error, "The plan comparison matrix is unavailable.")}
                onRetry={() => featureMatrixQuery.refetch()}
              />
            ) : featureMatrixQuery.isLoading ? (
              <Card className="rounded-[2rem] border-default">
                <CardContent className="space-y-3 p-6">
                  <Skeleton className="h-12 rounded-xl" />
                  {[...Array(8)].map((_, index) => (
                    <Skeleton key={index} className="h-12 rounded-xl" />
                  ))}
                </CardContent>
              </Card>
            ) : (
              <Card className="overflow-hidden rounded-[2rem] border-default">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <div className="min-w-[920px]">
                      <div className="sticky top-0 z-20 grid border-b border-default bg-[var(--surf)]/95 backdrop-blur-md" style={{ gridTemplateColumns: `320px repeat(${matrix.columns.length}, minmax(160px, 1fr))` }}>
                        <div className="sticky left-0 z-30 border-r border-default bg-[var(--surf)] px-4 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--muted)]">
                          Feature
                        </div>
                        {matrix.columns.map((column) => (
                          <div
                            key={column.key}
                            className="border-r border-default px-4 py-4 text-center text-[10px] font-black uppercase tracking-[0.2em] text-[var(--muted)] last:border-r-0"
                          >
                            {column.label}
                          </div>
                        ))}
                      </div>

                      <div
                        ref={matrixRef}
                        className="relative overflow-auto"
                        style={{ height: viewportHeight }}
                        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
                      >
                        <div style={{ height: flatMatrixItems.length * itemSize, position: "relative" }}>
                          {virtualItems.map((item, localIndex) => {
                            const actualIndex = startIndex + localIndex;
                            const top = actualIndex * itemSize;

                            if (item.type === "category") {
                              const open = expandedCategories[item.id] !== false;
                              return (
                                <button
                                  key={`${item.type}-${item.id}`}
                                  type="button"
                                  onClick={() =>
                                    setExpandedCategories((prev) => ({
                                      ...prev,
                                      [item.id]: !open,
                                    }))
                                  }
                                  className="absolute left-0 right-0 grid border-b border-default bg-[color-mix(in_srgb,var(--text)_3%,transparent)]"
                                  style={{
                                    top,
                                    height: itemSize,
                                    gridTemplateColumns: `320px repeat(${matrix.columns.length}, minmax(160px, 1fr))`,
                                  }}
                                >
                                  <div className="sticky left-0 z-10 flex items-center gap-3 border-r border-default bg-[var(--surf)] px-4 text-left">
                                    <ChevronDown className={cn("h-4 w-4 text-[var(--sec)] transition-transform", !open && "-rotate-90")} />
                                    <span className="text-sm font-black text-[var(--text)]">{item.label}</span>
                                  </div>
                                  <div className="col-span-full" />
                                </button>
                              );
                            }

                            return (
                              <div
                                key={`${item.type}-${item.id}`}
                                className="absolute left-0 right-0 grid border-b border-default"
                                style={{
                                  top,
                                  height: itemSize,
                                  gridTemplateColumns: `320px repeat(${matrix.columns.length}, minmax(160px, 1fr))`,
                                }}
                              >
                                <div className="sticky left-0 z-10 flex items-center border-r border-default bg-[var(--surf)] px-4 text-sm font-semibold text-[var(--text)]">
                                  {item.label}
                                </div>
                                {matrix.columns.map((column) => (
                                  <div
                                    key={`${item.id}-${column.key}`}
                                    className="flex items-center justify-center border-r border-default px-3 text-center last:border-r-0"
                                  >
                                    <MatrixValue value={item.values[column.key] ?? "-"} />
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </section>

          <section className="space-y-4">
            <SectionHeader
              eyebrow="Section 4"
              title="Add-on Marketplace"
              description="Expand any add-on to inspect its detailed capabilities, eligibility, and pricing before adding it to the order."
            />

            {addonsQuery.isError ? (
              <SectionError
                title="Could not load add-ons"
                description={formatApiError(addonsQuery.error, "The add-on marketplace is currently unavailable.")}
                onRetry={() => addonsQuery.refetch()}
              />
            ) : addonsQuery.isLoading ? (
              <div className="grid gap-4 xl:grid-cols-2">
                {[...Array(4)].map((_, index) => (
                  <Card key={index} className="rounded-[2rem] border-default">
                    <CardContent className="space-y-4 p-6">
                      <Skeleton className="h-8 w-40" />
                      <Skeleton className="h-16 rounded-2xl" />
                      <Skeleton className="h-10 rounded-xl" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                {addons.map((addon) => {
                  const expanded = expandedAddonId === String(addon.id ?? addon.key ?? addon.name);
                  return (
                    <Card
                      key={addon.id ?? addon.key ?? addon.name}
                      className="overflow-hidden rounded-[2rem] border-default bg-[color-mix(in_srgb,var(--text)_2%,transparent)]"
                    >
                      <CardContent className="p-0">
                        <div className="p-6">
                          <div className="flex items-start justify-between gap-4">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-2xl font-black tracking-[-0.04em] text-[var(--text)]">{addon.name}</h3>
                                {addon.selected ? (
                                  <Badge variant="success" className="uppercase tracking-[0.16em]">
                                    Selected
                                  </Badge>
                                ) : null}
                              </div>
                              <p className="text-sm text-[var(--muted)]">{addon.description}</p>
                            </div>
                            <PackagePlus className="h-5 w-5 text-[var(--sec)]" />
                          </div>

                          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            <MetaPill label="Price" value={formatCurrency(addon.price, addon.currency)} />
                            <MetaPill label="Billing Unit" value={toTitle(addon.billingUnit) || "N/A"} />
                            <MetaPill label="Plan Eligibility" value={addon.planEligibility || "N/A"} />
                            <MetaPill label="Category" value={addon.category || "N/A"} />
                            <MetaPill label="Status" value={addon.status || "Available"} />
                            <MetaPill label="Feature Count" value={String(addon.featureCount)} />
                          </div>

                          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                            {addon.selected ? (
                              <>
                                <Button
                                  variant="outline"
                                  disabled={actionBusy}
                                  className="h-11 flex-1 rounded-xl border-default"
                                >
                                  Selected
                                </Button>
                                <Button
                                  variant="destructive"
                                  disabled={actionBusy}
                                  onClick={() => handleAddonToggle(addon, true)}
                                  className="h-11 flex-1 rounded-xl"
                                >
                                  {actionBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                  Remove
                                </Button>
                              </>
                            ) : (
                              <Button
                                disabled={actionBusy}
                                onClick={() => handleAddonToggle(addon)}
                                className="h-11 flex-1 rounded-xl bg-[var(--pri)] font-black uppercase tracking-[0.16em] text-white"
                              >
                                {actionBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Add Add-on
                              </Button>
                            )}

                            <Button
                              variant="outline"
                              onClick={() =>
                                setExpandedAddonId(expanded ? null : String(addon.id ?? addon.key ?? addon.name))
                              }
                              className="h-11 rounded-xl border-default"
                            >
                              {expanded ? "Hide Details" : "View Details"}
                              <ChevronRight className={cn("ml-2 h-4 w-4 transition-transform", expanded && "rotate-90")} />
                            </Button>
                          </div>
                        </div>

                        {expanded ? (
                          <div className="border-t border-default px-6 pb-6 pt-4">
                            {addon.specs.length > 0 ? (
                              <LazyAddonFeatureDetails specs={addon.specs} />
                            ) : (
                              <div className="rounded-2xl border border-dashed border-default p-6 text-sm text-[var(--muted)]">
                                No add-on feature matrix was returned by the API for this item.
                              </div>
                            )}
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <SectionHeader
              eyebrow="Section 6"
              title="Purchase History"
              description="Review historical plan purchases, event associations, and post-purchase actions."
            />

            {historyQuery.isError ? (
              <SectionError
                title="Could not load purchase history"
                description={formatApiError(historyQuery.error, "Purchase history is unavailable at the moment.")}
                onRetry={() => historyQuery.refetch()}
              />
            ) : historyQuery.isLoading ? (
              <Card className="rounded-[2rem] border-default">
                <CardContent className="space-y-3 p-6">
                  {[...Array(5)].map((_, index) => (
                    <Skeleton key={index} className="h-14 rounded-xl" />
                  ))}
                </CardContent>
              </Card>
            ) : (
              <Card className="overflow-hidden rounded-[2rem] border-default">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left">
                      <thead className="bg-[color-mix(in_srgb,var(--text)_3%,transparent)]">
                        <tr>
                          {["Plan", "Event Name", "Event Dates", "Purchase Date", "Amount Paid", "Status", "Add-ons Purchased", "Action"].map((column) => (
                            <th
                              key={column}
                              className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--muted)]"
                            >
                              {column}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {history.length > 0 ? (
                          history.map((item) => (
                            <tr key={item.id} className="border-t border-default">
                              <td className="px-4 py-4 text-sm font-black text-[var(--text)]">{item.plan}</td>
                              <td className="px-4 py-4 text-sm text-[var(--text)]">{item.eventName}</td>
                              <td className="px-4 py-4 text-sm text-[var(--muted)]">{item.eventDates || "-"}</td>
                              <td className="px-4 py-4 text-sm text-[var(--muted)]">
                                {item.purchaseDate ? formatDateInTZ(item.purchaseDate) : "-"}
                              </td>
                              <td className="px-4 py-4 text-sm font-bold text-[var(--text)]">
                                {formatCurrency(item.amountPaid)}
                              </td>
                              <td className="px-4 py-4">
                                <Badge variant={String(item.status).toLowerCase().includes("active") ? "success" : "secondary"}>
                                  {toTitle(item.status)}
                                </Badge>
                              </td>
                              <td className="px-4 py-4 text-sm text-[var(--muted)]">
                                {item.addons.length > 0 ? item.addons.join(", ") : "None"}
                              </td>
                              <td className="px-4 py-4">
                                <div className="flex flex-wrap gap-2">
                                  {item.actions.length > 0 ? (
                                    item.actions.map((action) =>
                                      action.href ? (
                                        <a
                                          key={`${item.id}-${action.label}`}
                                          href={action.href}
                                          className="inline-flex items-center gap-1 rounded-full border border-default px-3 py-1.5 text-xs font-bold text-[var(--text)] transition hover:bg-white/5"
                                        >
                                          {action.label}
                                          <ExternalLink className="h-3.5 w-3.5" />
                                        </a>
                                      ) : (
                                        <span
                                          key={`${item.id}-${action.label}`}
                                          className="inline-flex items-center rounded-full border border-default px-3 py-1.5 text-xs font-bold text-[var(--muted)]"
                                        >
                                          {action.label}
                                        </span>
                                      )
                                    )
                                  ) : (
                                    <span className="text-xs text-[var(--muted)]">No actions returned</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={8} className="px-4 py-12 text-center text-sm text-[var(--muted)]">
                              No purchase history has been returned yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </section>
        </div>

        <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <section className="space-y-4">
            <SectionHeader
              eyebrow="Section 5"
              title="Order Summary"
              description="This sidebar stays aligned with your current billing cart."
            />

            {cartQuery.isError ? (
              <SectionError
                title="Could not load order summary"
                description={formatApiError(cartQuery.error, "The current billing cart could not be loaded.")}
                onRetry={() => cartQuery.refetch()}
              />
            ) : cartQuery.isLoading ? (
              <Card className="rounded-[2rem] border-default">
                <CardContent className="space-y-4 p-6">
                  <Skeleton className="h-8 w-40" />
                  <Skeleton className="h-24 rounded-2xl" />
                  <Skeleton className="h-20 rounded-2xl" />
                  <Skeleton className="h-11 rounded-xl" />
                </CardContent>
              </Card>
            ) : (
              <Card className="overflow-hidden rounded-[2rem] border-default bg-[linear-gradient(180deg,color-mix(in_srgb,var(--pri)_12%,transparent),transparent_40%)]">
                <CardContent className="space-y-5 p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--muted)]">Selected Plan</p>
                      <h3 className="mt-2 text-2xl font-black tracking-[-0.03em] text-[var(--text)]">
                        {cart.selectedPlanName || "No plan selected"}
                      </h3>
                    </div>
                    <ShoppingCart className="h-5 w-5 text-[var(--sec)]" />
                  </div>

                  <div className="rounded-[1.5rem] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] p-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[var(--muted)]">Base Price</span>
                      <span className="font-black text-[var(--text)]">
                        {formatCurrency(cart.basePrice, cart.currency)}
                      </span>
                    </div>

                    <div className="mt-4 space-y-3">
                      {cart.addons.length > 0 ? (
                        cart.addons.map((item) => (
                          <div key={item.id} className="flex items-center justify-between text-sm">
                            <span className="text-[var(--text)]">+ {item.name}</span>
                            <span className="font-bold text-[var(--text)]">
                              {formatCurrency(item.price, cart.currency)}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-[var(--muted)]">No add-ons selected.</p>
                      )}
                    </div>

                    <div className="mt-5 space-y-3 border-t border-default pt-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-[var(--muted)]">Subtotal</span>
                        <span className="font-black text-[var(--text)]">
                          {formatCurrency(cart.subtotal, cart.currency)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-[var(--muted)]">GST</span>
                        <span className="font-black text-[var(--text)]">
                          {formatCurrency(cart.gst, cart.currency)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-base">
                        <span className="font-black text-[var(--text)]">Grand Total</span>
                        <span className="font-black text-[var(--sec)]">
                          {formatCurrency(cart.total, cart.currency)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <Button
                    disabled={checkout.isPending || !cart.selectedPlanName}
                    onClick={async () => {
                      try {
                        await checkout.mutateAsync({});
                        toast.success("Checkout request submitted successfully.");
                      } catch (error) {
                        toast.error(formatApiError(error, "Checkout failed."));
                      }
                    }}
                    className="h-12 w-full rounded-xl bg-[var(--pri)] font-black uppercase tracking-[0.2em] text-white"
                  >
                    {checkout.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Receipt className="mr-2 h-4 w-4" />}
                    Checkout
                  </Button>
                </CardContent>
              </Card>
            )}
          </section>

          <section className="space-y-4">
            <SectionHeader
              eyebrow="Section 7"
              title="Help & Sales Contact"
              description="Need help choosing? Connect with the billing and solutions team."
            />

            <Card className="rounded-[2rem] border-default bg-[color-mix(in_srgb,var(--text)_2%,transparent)]">
              <CardContent className="space-y-5 p-6">
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl bg-[color-mix(in_srgb,var(--pri)_16%,transparent)] p-3 text-[var(--sec)]">
                    <Headset className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-[var(--text)]">Need Help Choosing?</h3>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      Plan recommendation, feature comparison, enterprise consultation, and custom pricing.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {[
                    "Plan Recommendation",
                    "Feature Comparison",
                    "Enterprise Consultation",
                    "Custom Pricing",
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-3 rounded-xl border border-default px-3 py-3 text-sm text-[var(--text)]">
                      <Check className="h-4 w-4 text-emerald-400" />
                      {item}
                    </div>
                  ))}
                </div>

                <div className="grid gap-3">
                  <Button className="h-11 rounded-xl bg-[var(--pri)] font-black uppercase tracking-[0.16em] text-white">
                    Contact Sales
                  </Button>
                  <Button variant="outline" className="h-11 rounded-xl border-default">
                    Schedule Demo
                  </Button>
                  <Button variant="outline" className="h-11 rounded-xl border-default">
                    Request Quote
                    <ArrowUpRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>
        </aside>
      </section>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.25rem] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--text)_3%,transparent)] px-4 py-3">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-sm font-black text-[var(--text)]">{value}</p>
    </div>
  );
}

function MetaPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[color-mix(in_srgb,var(--text)_6%,transparent)] px-3 py-3">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-sm font-bold text-[var(--text)]">{value}</p>
    </div>
  );
}
