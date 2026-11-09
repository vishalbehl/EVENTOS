"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleHelp,
  CreditCard,
  FileText,
  HardDrive,
  Layers3,
  LayoutGrid,
  Loader2,
  Mail,
  Mic,
  MonitorPlay,
  PackagePlus,
  Plus,
  Presentation,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Trash2,
  Tv,
  UserCheck,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useCloudCartCheckout,
  useCloudCommercialRequest,
  useCloudMockPayment,
  useCloudPendingCheckout,
  type CloudCartCheckoutResponse,
  type CloudOffer,
} from "@/hooks/useCloudCommercial";
import { accessContextCacheKey, useAuthStore } from "@/store/use-auth-store";

type BillingInterval = "MONTHLY" | "ANNUAL" | "PER_EVENT" | "ONE_TIME";
type CartKind = "WORKSPACE" | "EVENT" | "EVENT_ADDON" | "VENUE" | "VENUE_ADDON";
type StepKey =
  "workspace" | "event" | "event-addons" | "venue" | "venue-addons" | "review";
type EventOption = { id: string; name?: string | null; title?: string | null };
type CartItem = {
  key: string;
  kind: CartKind;
  offer: CloudOffer;
  interval: BillingInterval;
  quantity: number;
  eventId?: string;
  eventName?: string;
  setupDays?: number;
  technicianCount?: number;
};

const steps: Array<{
  key: StepKey;
  label: string;
  short: string;
  description: string;
  icon: typeof LayoutGrid;
}> = [
  {
    key: "workspace",
    label: "Workspace plan",
    short: "Workspace",
    description: "Organisation history, teams and shared settings",
    icon: Building2,
  },
  {
    key: "event",
    label: "Event plan",
    short: "Event",
    description: "Choose the event and its operating capacity",
    icon: CalendarDays,
  },
  {
    key: "event-addons",
    label: "Event add-ons",
    short: "Event add-ons",
    description: "Add eligible event-scoped capacity",
    icon: PackagePlus,
  },
  {
    key: "venue",
    label: "Venue plan",
    short: "Venue",
    description: "Single-event, monthly or annual venue access",
    icon: MonitorPlay,
  },
  {
    key: "venue-addons",
    label: "Venue add-ons",
    short: "Venue add-ons",
    description: "Onsite apps and technician coverage",
    icon: Presentation,
  },
  {
    key: "review",
    label: "Review & checkout",
    short: "Review",
    description: "Confirm every selection before payment",
    icon: CreditCard,
  },
];

const venueApplicationCategories = [
  {
    id: "moderator",
    label: "Moderator",
    prefix: "VENUE_MODERATOR",
    icon: Users,
  },
  {
    id: "eposter",
    label: "ePoster Live",
    prefix: "VENUE_EPOSTER",
    icon: Presentation,
  },
  {
    id: "signage",
    label: "Signage",
    prefix: "VENUE_SIGNAGE",
    icon: MonitorPlay,
  },
  {
    id: "live-qa",
    label: "Live Q&A",
    prefix: "VENUE_LIVE_QA",
    icon: CircleHelp,
  },
  {
    id: "onsite",
    label: "Onsite support",
    prefix: "VENUE_TECHNICIAN",
    icon: Building2,
  },
] as const;

const eventAddonCategories = [
  {
    id: "all",
    label: "All add-ons",
    prefix: "",
    icon: Layers3,
  },
  {
    id: "registrations",
    label: "Registrations",
    prefix: "EVENT_REGISTRATIONS",
    icon: Users,
  },
  {
    id: "abstracts",
    label: "Abstracts",
    prefix: "EVENT_ABSTRACTS",
    icon: FileText,
  },
  {
    id: "speakers",
    label: "Speakers",
    prefix: "EVENT_SPEAKERS",
    icon: Mic,
  },
  {
    id: "storage",
    label: "Storage",
    prefix: "EVENT_STORAGE",
    icon: HardDrive,
  },
  {
    id: "email",
    label: "Email",
    prefix: "EVENT_EMAIL",
    icon: Mail,
  },
] as const;

function asArray<T = any>(value: any): T[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

const inr = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
const eventLabel = (event: EventOption) =>
  event.name || event.title || event.id;
const offerPrice = (offer: CloudOffer, interval: BillingInterval) =>
  offer.prices.find((price) => price.billing_interval === interval);
const isEnterprise = (offer: CloudOffer) =>
  offer.code.includes("ENTERPRISE") || offer.product_family === "EMC";
const readableEntitlement = (key: string) =>
  key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const intervalLabel = (interval: BillingInterval) =>
  interval === "PER_EVENT"
    ? "Single event"
    : interval === "ONE_TIME"
      ? "One time"
      : interval === "ANNUAL"
        ? "Annual"
        : "Monthly";
function priceSuffix(offer: CloudOffer, interval: BillingInterval) {
  const price = offerPrice(offer, interval) || offer.prices[0];
  if (
    offer.code === "VENUE_TECHNICIAN_SETUP_DAY" ||
    price?.pricing_unit === "TECHNICIAN_DAY"
  )
    return "setup day / technician";
  if (interval === "ANNUAL") return "year";
  if (interval === "MONTHLY") return "month";
  if (interval === "ONE_TIME") return "one time";
  return "event";
}

function BillingTabs({
  value,
  onChange,
  includePerEvent = false,
}: {
  value: BillingInterval;
  onChange: (value: BillingInterval) => void;
  includePerEvent?: boolean;
}) {
  const values: BillingInterval[] = includePerEvent
    ? ["PER_EVENT", "MONTHLY", "ANNUAL"]
    : ["MONTHLY", "ANNUAL"];
  return (
    <div
      className="commercial-billing-tabs"
      role="tablist"
      aria-label="Billing period"
    >
      {values.map((interval) => (
        <button
          key={interval}
          type="button"
          role="tab"
          aria-selected={value === interval}
          className={value === interval ? "is-active" : ""}
          onClick={() => onChange(interval)}
        >
          {intervalLabel(interval)}
        </button>
      ))}
    </div>
  );
}

function StepRail({
  active,
  unlocked,
  onSelect,
}: {
  active: number;
  unlocked: boolean;
  onSelect: (index: number) => void;
}) {
  return (
    <nav className="commercial-step-rail" aria-label="Plan purchase steps">
      {steps.map((step, index) => {
        const Icon = step.icon;
        const complete = index < active;
        return (
          <button
            key={step.key}
            type="button"
            className={`${index === active ? "is-active" : ""} ${complete ? "is-complete" : ""}`}
            aria-current={index === active ? "step" : undefined}
            disabled={!unlocked && index > 0}
            onClick={() => onSelect(index)}
          >
            <span className="commercial-step-number">
              {complete ? (
                <Check className="size-3.5" />
              ) : (
                <Icon className="size-3.5" />
              )}
            </span>
            <span>
              <strong>
                {index + 1}. {step.short}
              </strong>
              <small>{step.description}</small>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function PlanOption({
  offer,
  interval,
  selected,
  current = false,
  disabled = false,
  actionLabel = "Select plan",
  onSelect,
  onQuote,
  quotePending,
}: {
  offer: CloudOffer;
  interval: BillingInterval;
  selected: boolean;
  current?: boolean;
  disabled?: boolean;
  actionLabel?: string;
  onSelect: () => void;
  onQuote: () => void;
  quotePending: boolean;
}) {
  const price = offerPrice(offer, interval) || offer.prices[0];
  const quoteOnly = isEnterprise(offer);
  const freeTrial = offer.code === "WORKSPACE_FREE";
  return (
    <article
      className={`commercial-plan-row ${selected || current ? "is-selected" : ""}`}
    >
      <button
        type="button"
        className="commercial-plan-row-main"
        disabled={current || disabled || (!quoteOnly && !freeTrial && !price)}
        onClick={quoteOnly ? onQuote : onSelect}
      >
        <span className="commercial-plan-radio" aria-hidden>
          {selected || current ? <Check className="size-3.5" /> : null}
        </span>
        <span className="commercial-plan-copy">
          <span className="commercial-plan-name-line">
            <strong>{offer.display_name.replace(/^Workspace\s+/i, "")}</strong>
            <em>{freeTrial ? "30-day trial" : intervalLabel(interval)}</em>
          </span>
          <span className="commercial-plan-description">
            {freeTrial
              ? "A one-month organisation workspace trial for team and event setup."
              : offer.description ||
                "Plan details are maintained by the commercial catalogue."}
          </span>
          <span className="commercial-plan-entitlements">
            {offer.entitlements.slice(0, 4).map((entitlement) => (
              <span key={entitlement.key}>
                {readableEntitlement(entitlement.key)}
                {entitlement.quantity != null
                  ? ` · ${entitlement.quantity}`
                  : ""}
              </span>
            ))}
          </span>
        </span>
        <span className="commercial-plan-row-price">
          <strong>
            {quoteOnly
              ? "Custom"
              : freeTrial
                ? "Free"
                : price
                  ? inr(Number(price.amount))
                  : "Unavailable"}
          </strong>
          <small>
            {quoteOnly
              ? "Quotation"
              : freeTrial
                ? "one month"
                : `per ${priceSuffix(offer, interval)}`}
          </small>
          <span>
            {quoteOnly
              ? quotePending
                ? "Submitting…"
                : "Request quotation"
              : current
                ? "Current plan"
                : selected
                  ? "Selected for checkout"
                : actionLabel}
          </span>
        </span>
      </button>
    </article>
  );
}

function MinimalAddonRow({
  offer,
  interval,
  selected,
  disabled = false,
  quantity = 1,
  onSelect,
  onQuote,
  quotePending,
}: {
  offer: CloudOffer;
  interval: BillingInterval;
  selected: boolean;
  disabled?: boolean;
  quantity?: number;
  onSelect: () => void;
  onQuote: () => void;
  quotePending: boolean;
}) {
  const price = offerPrice(offer, interval) || offer.prices[0];
  const quoteOnly = isEnterprise(offer) || offer.is_quote_only;

  const badgeMatch = offer.display_name.match(
    /(\+\d+[\w,.]*|\d+[\w\s–-]+screens?|\d+[\w\s–-]+devices?|\d+[\w\s–-]+rooms?)/i,
  );
  const badge = badgeMatch ? badgeMatch[1] : null;

  let Icon = Sparkles;
  if (offer.code.includes("REGISTRATIONS")) Icon = Users;
  else if (offer.code.includes("ABSTRACTS")) Icon = FileText;
  else if (offer.code.includes("SPEAKERS")) Icon = Mic;
  else if (offer.code.includes("STORAGE")) Icon = HardDrive;
  else if (offer.code.includes("EMAIL")) Icon = Mail;
  else if (offer.code.includes("MODERATOR")) Icon = Users;
  else if (offer.code.includes("EPOSTER")) Icon = Presentation;
  else if (offer.code.includes("SIGNAGE")) Icon = MonitorPlay;
  else if (offer.code.includes("LIVE_QA")) Icon = CircleHelp;
  else if (offer.code.includes("TECHNICIAN")) Icon = UserCheck;

  const totalAmount = price ? Number(price.amount) * quantity : null;

  return (
    <div
      className={`group flex items-center justify-between gap-3 p-3.5 rounded-xl border transition-all duration-150 ${
        selected
          ? "border-[var(--org-purple,#7c3aed)] bg-[color-mix(in_srgb,var(--org-purple,#7c3aed)_6%,var(--surface-primary,#ffffff))] shadow-sm"
          : "border-[var(--border-subtle,rgba(15,23,42,0.08))] bg-[var(--surface-primary,#ffffff)] hover:border-[var(--border-default,rgba(15,23,42,0.14))] hover:bg-[var(--surface-secondary,#f8fafc)]/50"
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-sm transition-colors ${
            selected
              ? "border-[var(--org-purple,#7c3aed)] bg-[var(--org-purple,#7c3aed)]/10 text-[var(--org-purple,#7c3aed)]"
              : "border-[var(--border-subtle,rgba(15,23,42,0.08))] bg-[var(--surface-secondary,#f8fafc)] text-[var(--text-secondary,#64748b)] group-hover:text-[var(--text-primary,#0f172a)]"
          }`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <strong className="text-sm font-semibold text-[var(--text-primary,#0f172a)] truncate">
              {offer.display_name}
            </strong>
            {badge ? (
              <span className="rounded-full bg-[var(--surface-secondary,#f8fafc)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary,#64748b)] border border-[var(--border-subtle,rgba(15,23,42,0.08))]">
                {badge}
              </span>
            ) : null}
          </div>
          <p className="text-xs text-[var(--text-secondary,#64748b)] truncate mt-0.5">
            {offer.description || "Additional commercial capability."}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3.5 shrink-0">
        <div className="text-right">
          <span className="text-sm font-bold font-mono text-[var(--text-primary,#0f172a)]">
            {quoteOnly || totalAmount === null
              ? "Custom quote"
              : inr(totalAmount)}
          </span>
          <span className="block text-[10px] text-[var(--text-muted,#94a3b8)]">
            {intervalLabel(interval)}
          </span>
        </div>

        <button
          type="button"
          disabled={disabled || (!quoteOnly && !price)}
          onClick={quoteOnly ? onQuote : onSelect}
          className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
            selected
              ? "bg-[var(--org-purple,#7c3aed)] text-white hover:bg-[var(--org-purple,#7c3aed)]/90 shadow-sm"
              : "border border-[var(--border-default,rgba(15,23,42,0.14))] bg-[var(--surface-primary,#ffffff)] text-[var(--text-primary,#0f172a)] hover:border-[var(--org-purple,#7c3aed)] hover:text-[var(--org-purple,#7c3aed)]"
          }`}
        >
          {selected ? (
            <>
              <Check className="h-3.5 w-3.5" /> In cart
            </>
          ) : quoteOnly ? (
            quotePending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              "Quote"
            )
          ) : (
            <>
              <Plus className="h-3.5 w-3.5" /> Add
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function EventTarget({
  value,
  events,
  planCode,
  onChange,
}: {
  value: string;
  events: EventOption[];
  planCode: string;
  onChange: (value: string) => void;
}) {
  const router = useRouter();
  const eventList = asArray<EventOption>(events);
  return (
    <label className="commercial-event-picker">
      <span>
        <CalendarDays className="size-4" /> Event receiving this plan
      </span>
      <select
        value={value}
        onChange={(event) => {
          if (event.target.value === "__create_new__") {
            const query = new URLSearchParams({
              plan: planCode,
              returnTo: "/commercial/workspace",
            });
            router.push(`/events/new?${query.toString()}`);
            return;
          }
          onChange(event.target.value);
        }}
      >
        <option value="">Select event</option>
        {eventList.map((event) => (
          <option key={event.id} value={event.id}>
            {eventLabel(event)}
          </option>
        ))}
        <option value="__create_new__">＋ Add new event</option>
      </select>
      <small>
        “Add new event” opens the existing event-creation screen with this plan
        preselected.
      </small>
    </label>
  );
}

function SelectionLedger({
  cart,
  onRemove,
}: {
  cart: CartItem[];
  onRemove: (key: string) => void;
}) {
  const subtotal = cart.reduce(
    (total, item) =>
      total +
      Number(
        (offerPrice(item.offer, item.interval) || item.offer.prices[0])
          ?.amount || 0,
      ) *
        item.quantity,
    0,
  );
  return (
    <aside className="commercial-selection-ledger" aria-label="Selected plans">
      <div className="commercial-ledger-heading">
        <span>
          <ShoppingCart className="size-4" />
        </span>
        <div>
          <h2>Purchase summary</h2>
          <p>
            {cart.length} {cart.length === 1 ? "selection" : "selections"}
          </p>
        </div>
      </div>
      {cart.length ? (
        <div className="commercial-ledger-lines">
          {cart.map((item) => {
            const price =
              offerPrice(item.offer, item.interval) || item.offer.prices[0];
            return (
              <div key={item.key}>
                <span>
                  <strong>{item.offer.display_name}</strong>
                  <small>
                    {intervalLabel(item.interval)}
                    {item.eventName ? ` · ${item.eventName}` : ""}
                    {item.quantity > 1 ? ` · ${item.quantity} units` : ""}
                  </small>
                </span>
                <span className="commercial-ledger-amount">
                  <b>
                    {price ? inr(Number(price.amount) * item.quantity) : "—"}
                  </b>
                  <button
                    type="button"
                    aria-label={`Remove ${item.offer.display_name}`}
                    onClick={() => onRemove(item.key)}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="commercial-ledger-empty">
          <PackagePlus className="size-5" />
          <span>Your selections will appear here.</span>
        </div>
      )}
      <div className="commercial-ledger-totals">
        <span>
          Subtotal <strong>{inr(subtotal)}</strong>
        </span>
        <span>
          GST (18%) <strong>{inr(Math.round(subtotal * 0.18))}</strong>
        </span>
        <span className="is-total">
          Total <strong>{inr(Math.round(subtotal * 1.18))}</strong>
        </span>
      </div>
    </aside>
  );
}

function PaymentConfirmation({
  open,
  onOpenChange,
  checkoutResult,
  payment,
  onRetry,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checkoutResult: CloudCartCheckoutResponse | null;
  payment: ReturnType<typeof useCloudMockPayment>;
  onRetry: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="commercial-payment-dialog max-w-md">
        {payment.isPending ? (
          <div className="commercial-payment-state" role="status">
            <span className="commercial-payment-mark is-processing">
              <Loader2 className="size-7 animate-spin" />
            </span>
            <DialogHeader>
              <DialogTitle>Confirming mock payment</DialogTitle>
              <DialogDescription>
                Settling {checkoutResult?.invoice_count || 0} checkout{" "}
                {checkoutResult?.invoice_count === 1 ? "invoice" : "invoices"}{" "}
                and activating the selected plans.
              </DialogDescription>
            </DialogHeader>
          </div>
        ) : payment.data ? (
          <div className="commercial-payment-state">
            <span className="commercial-payment-mark is-success">
              <CheckCircle2 className="size-8" />
            </span>
            <DialogHeader>
              <DialogTitle>Payment successful</DialogTitle>
              <DialogDescription>
                {inr(payment.data.total)} was confirmed in the local
                mock-payment flow. Your purchased contracts are active.
              </DialogDescription>
            </DialogHeader>
            <div className="commercial-payment-receipt">
              <span>Payment reference</span>
              <strong>{payment.data.payment_reference}</strong>
              <span>Paid on</span>
              <strong>{new Date(payment.data.paid_at).toLocaleString()}</strong>
            </div>
            <DialogFooter>
              <Button variant="outline" asChild>
                <Link href="/commercial/invoices">View invoices</Link>
              </Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : payment.isError ? (
          <div className="commercial-payment-state">
            <span className="commercial-payment-mark is-error">
              <ShieldCheck className="size-7" />
            </span>
            <DialogHeader>
              <DialogTitle>Checkout created</DialogTitle>
              <DialogDescription>
                The mock payment could not be confirmed. The invoices remain
                unpaid and no success state has been fabricated.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" asChild>
                <Link href="/commercial/invoices">Open invoices</Link>
              </Button>
              <Button onClick={onRetry} disabled={!checkoutResult}>
                Retry payment
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="commercial-payment-state" role="status">
            <span className="commercial-payment-mark is-processing">
              <Loader2 className="size-7 animate-spin" />
            </span>
            <DialogHeader>
              <DialogTitle>Preparing payment confirmation</DialogTitle>
              <DialogDescription>
                Checking the authoritative checkout state. A failed-checkout
                message is shown only when payment confirmation actually fails.
              </DialogDescription>
            </DialogHeader>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function CommercialPlanCatalogue({
  offers,
  events,
  contracts,
  hasActiveWorkspacePlan,
}: {
  offers: CloudOffer[];
  events: EventOption[];
  contracts: any[];
  hasActiveWorkspacePlan: boolean;
}) {
  const searchParams = useSearchParams();
  const checkout = useCloudCartCheckout();
  const payment = useCloudMockPayment();
  const quotation = useCloudCommercialRequest();
  const user = useAuthStore((state) => state.user);
  const activeContext = useAuthStore((state) => state.activeContext);
  const pendingCheckout = useCloudPendingCheckout(Boolean(user?.id));
  const pendingCheckoutKey = useMemo(
    () =>
      user?.id
        ? `eventos:pending-commercial-checkout:${user.id}:${accessContextCacheKey(activeContext, user.organization_id)}`
        : null,
    [activeContext, user?.id, user?.organization_id],
  );
  const preselectedEventId = searchParams.get("event") || "";
  const preselectedPlanCode = searchParams.get("plan") || "";
  const [activeStep, setActiveStep] = useState(preselectedEventId ? 1 : 0);
  const [workspaceInterval, setWorkspaceInterval] =
    useState<BillingInterval>("MONTHLY");
  const [venueInterval, setVenueInterval] =
    useState<BillingInterval>("MONTHLY");
  const [selectedEventId, setSelectedEventId] = useState(preselectedEventId);
  const [selectedEventPlanCode, setSelectedEventPlanCode] =
    useState(preselectedPlanCode);
  const [venueCategory, setVenueCategory] = useState("moderator");
  const [eventAddonCategory, setEventAddonCategory] = useState("all");
  const [technicianDays, setTechnicianDays] = useState(1);
  const [technicianCount, setTechnicianCount] = useState(1);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [checkoutResult, setCheckoutResult] =
    useState<CloudCartCheckoutResponse | null>(null);

  useEffect(() => {
    setCheckoutResult(null);
    setPaymentOpen(false);
    payment.reset();
    // Reset only when the authenticated commercial context changes. Including
    // the mutation result object here can reset a successful payment during a
    // normal render and make the dialog fall back to its pre-confirmation UI.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCheckoutKey]);

  useEffect(() => {
    if (pendingCheckout.isFetching) return;
    if (pendingCheckout.isSuccess && !pendingCheckout.data) {
      if (pendingCheckoutKey) sessionStorage.removeItem(pendingCheckoutKey);
      setCheckoutResult(null);
      if (!payment.data) setPaymentOpen(false);
      return;
    }
    if (!pendingCheckout.data || checkoutResult || payment.data) return;
    setCheckoutResult(pendingCheckout.data);
    setPaymentOpen(true);
    if (pendingCheckoutKey) {
      sessionStorage.setItem(
        pendingCheckoutKey,
        JSON.stringify({ createdAt: Date.now(), result: pendingCheckout.data }),
      );
    }
  }, [
    checkoutResult,
    payment.data,
    pendingCheckout.data,
    pendingCheckout.isFetching,
    pendingCheckout.isSuccess,
    pendingCheckoutKey,
  ]);

  const workspaceOffers = useMemo(
    () => offers.filter((offer) => offer.product_family === "WORKSPACE"),
    [offers],
  );
  const eventOffers = useMemo(
    () => offers.filter((offer) => offer.product_family === "EVENT"),
    [offers],
  );
  const eventOfferCodes = useMemo(
    () => new Set(eventOffers.map((offer) => offer.code)),
    [eventOffers],
  );
  const eventAddons = useMemo(
    () =>
      offers.filter(
        (offer) =>
          offer.product_family === "CAPACITY_ADDON" &&
          offer.scope_type === "EVENT",
      ),
    [offers],
  );
  const venueOffers = useMemo(
    () => offers.filter((offer) => offer.product_family === "VENUE"),
    [offers],
  );
  const venueAddons = useMemo(
    () => offers.filter((offer) => offer.product_family === "VENUE_ADDON"),
    [offers],
  );
  const eventList = useMemo(() => asArray<EventOption>(events), [events]);
  const activeContracts = useMemo(
    () =>
      contracts.filter(
        (contract) => String(contract.status || "").toUpperCase() === "ACTIVE",
      ),
    [contracts],
  );
  const activeWorkspaceContract = useMemo(
    () =>
      activeContracts.find((contract) =>
        (contract.items || []).some(
          (item: any) =>
            item.product_family === "WORKSPACE" ||
            String(item.offer_code || "").startsWith("WORKSPACE_"),
        ),
      ),
    [activeContracts],
  );
  const activeWorkspaceItem = activeWorkspaceContract?.items?.find(
    (item: any) =>
      item.product_family === "WORKSPACE" ||
      String(item.offer_code || "").startsWith("WORKSPACE_"),
  );
  const activeWorkspaceCode = String(activeWorkspaceItem?.offer_code || "");
  useEffect(() => {
    const interval = activeWorkspaceContract?.billing_interval;
    if (interval === "MONTHLY" || interval === "ANNUAL") {
      setWorkspaceInterval(interval);
    }
  }, [activeWorkspaceContract?.billing_interval]);

  useEffect(() => {
    if (!selectedEventPlanCode && eventOffers[0]?.code)
      setSelectedEventPlanCode(eventOffers[0].code);
  }, [eventOffers, selectedEventPlanCode]);

  const activeEventContract = useMemo(
    () =>
      activeContracts.find((contract) =>
        (contract.items || []).some(
          (item: any) =>
            item.event_id === selectedEventId &&
            (item.product_family === "EVENT" ||
              eventOfferCodes.has(String(item.offer_code || ""))),
        ),
      ),
    [activeContracts, eventOfferCodes, selectedEventId],
  );
  const activeEventPlanItem = activeEventContract?.items?.find(
    (item: any) =>
      item.event_id === selectedEventId &&
      (item.product_family === "EVENT" ||
        eventOfferCodes.has(String(item.offer_code || ""))),
  );
  const activeEventPlanCode = String(activeEventPlanItem?.offer_code || "");
  useEffect(() => {
    if (!selectedEventId) return;
    setSelectedEventPlanCode(
      activeEventPlanCode || preselectedPlanCode || eventOffers[0]?.code || "",
    );
  }, [
    activeEventPlanCode,
    eventOffers,
    preselectedPlanCode,
    selectedEventId,
  ]);

  const selectedEventPlan = eventOffers.find(
    (offer) => offer.code === selectedEventPlanCode,
  );
  const selectedEvent = eventList.find((event) => event.id === selectedEventId);
  const workspaceReady =
    hasActiveWorkspacePlan || cart.some((item) => item.kind === "WORKSPACE");
  const eventPlanReady =
    Boolean(activeEventPlanItem) ||
    cart.some(
      (item) => item.kind === "EVENT" && item.eventId === selectedEventId,
    );
  const eligibleEventAddons = eventAddons.filter(
    (offer) =>
      !selectedEventPlan?.eligible_addon_codes.length ||
      selectedEventPlan.eligible_addon_codes.includes(offer.code),
  );
  const visibleEventAddons = useMemo(() => {
    if (eventAddonCategory === "all") return eligibleEventAddons;
    const cat = eventAddonCategories.find((c) => c.id === eventAddonCategory);
    if (!cat || !cat.prefix) return eligibleEventAddons;
    return eligibleEventAddons.filter((offer) =>
      offer.code.startsWith(cat.prefix),
    );
  }, [eligibleEventAddons, eventAddonCategory]);
  const selectedVenueCategory =
    venueApplicationCategories.find(
      (category) => category.id === venueCategory,
    ) || venueApplicationCategories[0];
  const visibleVenueAddons = venueAddons.filter((offer) =>
    offer.code.startsWith(selectedVenueCategory.prefix),
  );
  const technicianQuantity = technicianDays * technicianCount;

  const addToCart = (
    offer: CloudOffer,
    kind: CartKind,
    interval: BillingInterval,
    eventId?: string,
    quantity = 1,
    setupDays?: number,
    selectedTechnicians?: number,
  ) => {
    const target = eventList.find((event) => event.id === eventId);
    const item: CartItem = {
      key: `${kind}:${offer.code}:${eventId || interval}`,
      kind,
      offer,
      interval,
      quantity,
      eventId,
      eventName: target ? eventLabel(target) : undefined,
      setupDays,
      technicianCount: selectedTechnicians,
    };
    setCart((current) => [
      ...current.filter((candidate) => {
        if (kind === "WORKSPACE") return candidate.kind !== "WORKSPACE";
        if (kind === "EVENT")
          return !(candidate.kind === "EVENT" && candidate.eventId === eventId);
        if (kind === "VENUE") return candidate.kind !== "VENUE";
        return candidate.key !== item.key;
      }),
      item,
    ]);
  };

  const chooseEventTarget = (eventId: string) => {
    setSelectedEventId(eventId);
    setCart((current) =>
      current.filter(
        (item) => !["EVENT", "EVENT_ADDON", "VENUE_ADDON"].includes(item.kind),
      ),
    );
  };

  const requestQuotation = (
    offer: CloudOffer,
    interval: BillingInterval,
    eventId?: string,
  ) =>
    quotation.mutate(
      offer.product_family === "WORKSPACE"
        ? {
            account_type: "ORGANIZER",
            workspace_offer_code: offer.code,
            workspace_billing_interval: interval,
            events: [],
            request_type: "ENTERPRISE",
            reason: `Enterprise quotation for ${offer.display_name}`,
          }
        : offer.product_family === "EVENT"
          ? {
              account_type: "ORGANIZER",
              events: eventId
                ? [{ event_id: eventId, offer_code: offer.code }]
                : [],
              request_type: "ENTERPRISE",
              reason: `Enterprise quotation for ${offer.display_name}`,
            }
          : offer.product_family === "CAPACITY_ADDON"
            ? {
                account_type: "ORGANIZER",
                events: eventId
                  ? [
                      {
                        event_id: eventId,
                        capacity_addon_codes: [offer.code],
                      },
                    ]
                  : [],
                request_type: "CUSTOM_CAPACITY",
                reason: `Event add-on quotation for ${offer.display_name}`,
              }
            : {
                account_type: "ORGANIZER",
                venue_items: [
                  {
                    offer_code: offer.code,
                    quantity: 1,
                    event_id: eventId || undefined,
                  },
                ],
                events: [],
                request_type: "VENUE",
                reason: `Enterprise quotation for ${offer.display_name}`,
              },
    );

  const checkoutPayload = useMemo(() => {
    const items: any[] = [];
    const workspace = cart.find((item) => item.kind === "WORKSPACE");
    if (workspace)
      items.push({
        account_type: "ORGANIZER",
        workspace_offer_code: workspace.offer.code,
        workspace_billing_interval: workspace.interval,
        events: [],
        auto_renew: workspace.offer.code !== "WORKSPACE_FREE",
      });
    const eventIds = new Set(
      cart
        .filter((item) => item.kind === "EVENT" || item.kind === "EVENT_ADDON")
        .map((item) => item.eventId)
        .filter((eventId): eventId is string => Boolean(eventId)),
    );
    eventIds.forEach((eventId) => {
        const eventPlan = cart.find(
          (item) => item.kind === "EVENT" && item.eventId === eventId,
        );
        const addons = cart.filter(
          (item) => item.kind === "EVENT_ADDON" && item.eventId === eventId,
        );
        items.push({
          account_type: "ORGANIZER",
          events: [
            {
              event_id: eventId,
              ...(eventPlan ? { offer_code: eventPlan.offer.code } : {}),
              capacity_addon_codes: addons.map((addon) => addon.offer.code),
            },
          ],
          auto_renew: false,
        });
      });
    cart
      .filter((item) => item.kind === "VENUE" || item.kind === "VENUE_ADDON")
      .forEach((item) =>
        items.push({
          account_type: "ORGANIZER",
          venue_items: [
            {
              offer_code: item.offer.code,
              quantity: item.quantity,
              event_id:
                item.interval === "PER_EVENT" || item.kind === "VENUE_ADDON"
                  ? item.eventId
                  : undefined,
            },
          ],
          events: [],
          auto_renew: item.interval === "MONTHLY" || item.interval === "ANNUAL",
        }),
      );
    return { items };
  }, [cart]);

  const canContinue =
    activeStep === 0
      ? workspaceReady
      : activeStep === 1
        ? Boolean(selectedEventId && eventPlanReady)
        : activeStep === 5
          ? checkoutPayload.items.length > 0
          : true;
  const canSkip = activeStep > 0 && activeStep < steps.length - 1;
  const skipCurrentStep = () => {
    const skippedKinds: Partial<Record<StepKey, CartKind[]>> = {
      event: ["EVENT", "EVENT_ADDON"],
      "event-addons": ["EVENT_ADDON"],
      venue: ["VENUE"],
      "venue-addons": ["VENUE_ADDON"],
    };
    const kinds = skippedKinds[active.key] || [];
    if (kinds.length) {
      setCart((current) =>
        current.filter((item) => !kinds.includes(item.kind)),
      );
    }
    setActiveStep((step) => Math.min(steps.length - 1, step + 1));
  };
  const confirmPayment = (result: CloudCartCheckoutResponse) =>
    payment.mutate(
      { invoice_ids: result.items.map((item) => item.invoice_id) },
      {
        onSuccess: () => {
          if (pendingCheckoutKey) sessionStorage.removeItem(pendingCheckoutKey);
          setCheckoutResult(null);
          setCart([]);
          setActiveStep(0);
        },
      },
    );

  const beginCheckout = () =>
    checkout.mutate(checkoutPayload, {
      onSuccess: (result) => {
        setCheckoutResult(result);
        setPaymentOpen(true);
        if (pendingCheckoutKey) {
          sessionStorage.setItem(
            pendingCheckoutKey,
            JSON.stringify({ createdAt: Date.now(), result }),
          );
        }
        confirmPayment(result);
      },
    });
  const active = steps[activeStep];
  const currentEventPlanInCart = cart.find(
    (item) => item.kind === "EVENT" && item.eventId === selectedEventId,
  );

  return (
    <div className="commercial-planner">
      <StepRail
        active={activeStep}
        unlocked={workspaceReady}
        onSelect={setActiveStep}
      />
      <div className="commercial-planner-grid">
        <main className="commercial-step-stage">
          <header className="commercial-step-header">
            <span>
              Step {activeStep + 1} of {steps.length}
            </span>
            <h2>{active.label}</h2>
            <p>{active.description}.</p>
          </header>
          <AnimatePresence mode="wait" initial={false}>
            <motion.section
              key={active.key}
              className="commercial-step-content"
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              {active.key === "workspace" ? (
                <>
                  <div className="commercial-step-toolbar">
                    <div>
                      <strong>
                        {hasActiveWorkspacePlan
                          ? "Workspace access is active"
                          : "Choose one organisation workspace"}
                      </strong>
                      <span>
                        {hasActiveWorkspacePlan
                          ? "Your purchased plan remains selected. Choose another plan only when you want to upgrade."
                          : "A Workspace plan is required before Event plans can be purchased."}
                      </span>
                    </div>
                    <BillingTabs
                      value={workspaceInterval}
                      onChange={setWorkspaceInterval}
                    />
                  </div>
                  <div className="commercial-plan-list">
                    {workspaceOffers
                      .filter(
                        (offer) =>
                          offer.code === "WORKSPACE_FREE" ||
                          isEnterprise(offer) ||
                          Boolean(offerPrice(offer, workspaceInterval)),
                      )
                      .map((offer) => {
                        const interval =
                          offer.code === "WORKSPACE_FREE"
                            ? "MONTHLY"
                            : workspaceInterval;
                        const isCurrent =
                          activeWorkspaceCode === offer.code &&
                          activeWorkspaceContract?.billing_interval === interval;
                        return (
                          <PlanOption
                            key={`${offer.code}:${interval}`}
                            offer={offer}
                            interval={interval}
                            selected={cart.some(
                              (item) =>
                                item.kind === "WORKSPACE" &&
                                item.offer.code === offer.code &&
                                item.interval === interval,
                            )}
                            current={isCurrent}
                            actionLabel={
                              hasActiveWorkspacePlan ? "Upgrade plan" : "Select plan"
                            }
                            onSelect={() =>
                              addToCart(offer, "WORKSPACE", interval)
                            }
                            onQuote={() => requestQuotation(offer, interval)}
                            quotePending={quotation.isPending}
                          />
                        );
                      })}
                  </div>
                </>
              ) : null}

              {active.key === "event" ? (
                !workspaceReady ? (
                  <div className="commercial-dependency-message">
                    <ShieldCheck className="size-5" />
                    <div>
                      <strong>Workspace plan required</strong>
                      <span>
                        Return to Step 1 and choose a Workspace plan before
                        selecting an Event plan.
                      </span>
                    </div>
                  </div>
                ) : (
                  <>
                    <EventTarget
                      value={selectedEventId}
                      events={eventList}
                      planCode={
                        selectedEventPlanCode || eventOffers[0]?.code || ""
                      }
                      onChange={chooseEventTarget}
                    />
                    {activeEventPlanItem ? (
                      <div className="commercial-linked-event">
                        <CheckCircle2 className="size-4" />
                        <span>
                          This event already uses <strong>{activeEventPlanItem.display_name || activeEventPlanCode}</strong>.
                          Its base plan stays unchanged; use Event add-ons for additional capacity.
                        </span>
                      </div>
                    ) : null}
                    <div className="commercial-plan-list">
                      {eventOffers
                        .filter(
                          (offer) =>
                            !activeEventPlanCode || offer.code === activeEventPlanCode,
                        )
                        .map((offer) => (
                        <PlanOption
                          key={offer.code}
                          offer={offer}
                          interval="PER_EVENT"
                          current={activeEventPlanCode === offer.code}
                          selected={
                            currentEventPlanInCart?.offer.code === offer.code
                          }
                          disabled={!selectedEventId}
                          actionLabel={
                            activeEventPlanCode
                              ? "Current plan"
                              : selectedEventId
                              ? "Select plan"
                              : "Select an event first"
                          }
                          onSelect={() => {
                            setSelectedEventPlanCode(offer.code);
                            if (selectedEventId)
                              addToCart(
                                offer,
                                "EVENT",
                                "PER_EVENT",
                                selectedEventId,
                              );
                          }}
                          onQuote={() =>
                            requestQuotation(
                              offer,
                              "PER_EVENT",
                              selectedEventId,
                            )
                          }
                          quotePending={quotation.isPending}
                        />
                      ))}
                    </div>
                  </>
                )
              ) : null}

              {active.key === "event-addons" ? (
                <>
                  <div className="commercial-step-toolbar">
                    <div>
                      <strong>
                        Eligible add-ons for{" "}
                        {selectedEvent
                          ? eventLabel(selectedEvent)
                          : "the selected event"}
                      </strong>
                      <span>
                        Add-ons inherit the selected Event plan scope and are
                        invoiced with that plan.
                      </span>
                    </div>
                  </div>
                  <div
                    className="commercial-category-tabs"
                    role="tablist"
                    aria-label="Event add-on categories"
                  >
                    {eventAddonCategories.map((category) => {
                      const Icon = category.icon;
                      const count =
                        category.id === "all"
                          ? eligibleEventAddons.length
                          : eligibleEventAddons.filter((offer) =>
                              offer.code.startsWith(category.prefix),
                            ).length;
                      return (
                        <button
                          key={category.id}
                          type="button"
                          role="tab"
                          aria-selected={eventAddonCategory === category.id}
                          className={
                            eventAddonCategory === category.id
                              ? "is-active"
                              : ""
                          }
                          onClick={() => setEventAddonCategory(category.id)}
                        >
                          <Icon className="size-3.5" />
                          {category.label}
                          <span className="ml-1 opacity-70">({count})</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="space-y-2 mt-4">
                    {visibleEventAddons.length ? (
                      visibleEventAddons.map((offer) => (
                        <MinimalAddonRow
                          key={offer.code}
                          offer={offer}
                          interval="ONE_TIME"
                          selected={cart.some(
                            (item) =>
                              item.kind === "EVENT_ADDON" &&
                              item.offer.code === offer.code &&
                              item.eventId === selectedEventId,
                          )}
                          disabled={!eventPlanReady}
                          onSelect={() =>
                            addToCart(
                              offer,
                              "EVENT_ADDON",
                              "ONE_TIME",
                              selectedEventId,
                            )
                          }
                          onQuote={() =>
                            requestQuotation(offer, "ONE_TIME", selectedEventId)
                          }
                          quotePending={quotation.isPending}
                        />
                      ))
                    ) : (
                      <div className="commercial-empty-step">
                        <PackagePlus className="size-5" />
                        <strong>No eligible Event add-ons</strong>
                        <span>
                          {eligibleEventAddons.length === 0
                            ? "The selected Event plan has no published add-ons."
                            : "No add-ons found in this category for this event plan."}
                        </span>
                      </div>
                    )}
                  </div>
                </>
              ) : null}

              {active.key === "venue" ? (
                <>
                  <div className="commercial-step-toolbar">
                    <div>
                      <strong>Choose Venue access</strong>
                      <span>
                        Venue plans are optional and remain separate from the
                        Event plan.
                      </span>
                    </div>
                    <BillingTabs
                      value={venueInterval}
                      onChange={setVenueInterval}
                      includePerEvent
                    />
                  </div>
                  {venueInterval === "PER_EVENT" ? (
                    <div className="commercial-linked-event">
                      <CalendarDays className="size-4" />
                      <span>
                        Attached to{" "}
                        <strong>
                          {selectedEvent
                            ? eventLabel(selectedEvent)
                            : "the selected event"}
                        </strong>
                      </span>
                    </div>
                  ) : null}
                  <div className="commercial-plan-list">
                    {venueOffers
                      .filter((offer) =>
                        Boolean(offerPrice(offer, venueInterval)),
                      )
                      .map((offer) => (
                        <PlanOption
                          key={`${offer.code}:${venueInterval}`}
                          offer={offer}
                          interval={venueInterval}
                          selected={cart.some(
                            (item) =>
                              item.kind === "VENUE" &&
                              item.offer.code === offer.code &&
                              item.interval === venueInterval,
                          )}
                          disabled={
                            venueInterval === "PER_EVENT" && !selectedEventId
                          }
                          actionLabel="Add Venue plan"
                          onSelect={() =>
                            addToCart(
                              offer,
                              "VENUE",
                              venueInterval,
                              venueInterval === "PER_EVENT"
                                ? selectedEventId
                                : undefined,
                            )
                          }
                          onQuote={() =>
                            requestQuotation(
                              offer,
                              venueInterval,
                              selectedEventId,
                            )
                          }
                          quotePending={quotation.isPending}
                        />
                      ))}
                  </div>
                </>
              ) : null}

              {active.key === "venue-addons" ? (
                <>
                  <div
                    className="commercial-category-tabs"
                    role="tablist"
                    aria-label="Venue add-on categories"
                  >
                    {venueApplicationCategories.map((category) => {
                      const Icon = category.icon;
                      return (
                        <button
                          key={category.id}
                          type="button"
                          role="tab"
                          aria-selected={venueCategory === category.id}
                          className={
                            venueCategory === category.id ? "is-active" : ""
                          }
                          onClick={() => setVenueCategory(category.id)}
                        >
                          <Icon className="size-4" />
                          {category.label}
                        </button>
                      );
                    })}
                  </div>
                  {venueCategory === "onsite" ? (
                    <div className="commercial-technician-config">
                      <div>
                        <strong>Onsite technician coverage</strong>
                        <span>
                          Charged per setup day per technician, not per event.
                        </span>
                      </div>
                      <label>
                        <span>Setup days</span>
                        <input
                          type="number"
                          min={1}
                          max={30}
                          value={technicianDays}
                          onChange={(event) =>
                            setTechnicianDays(
                              Math.max(
                                1,
                                Math.min(30, Number(event.target.value) || 1),
                              ),
                            )
                          }
                        />
                      </label>
                      <label>
                        <span>Technicians</span>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={technicianCount}
                          onChange={(event) =>
                            setTechnicianCount(
                              Math.max(
                                1,
                                Math.min(10, Number(event.target.value) || 1),
                              ),
                            )
                          }
                        />
                      </label>
                      <div className="commercial-technician-total">
                        <span>Total units</span>
                        <strong>{technicianQuantity} technician-days</strong>
                      </div>
                    </div>
                  ) : null}
                  <div className="space-y-2 mt-4">
                    {visibleVenueAddons.length ? (
                      visibleVenueAddons.map((offer) => {
                        const isTechnician =
                          offer.code === "VENUE_TECHNICIAN_SETUP_DAY";
                        return (
                          <MinimalAddonRow
                            key={offer.code}
                            offer={offer}
                            interval="ONE_TIME"
                            quantity={isTechnician ? technicianQuantity : 1}
                            selected={cart.some(
                              (item) =>
                                item.kind === "VENUE_ADDON" &&
                                item.offer.code === offer.code &&
                                item.eventId === selectedEventId,
                            )}
                            disabled={!selectedEventId}
                            onSelect={() =>
                              addToCart(
                                offer,
                                "VENUE_ADDON",
                                "ONE_TIME",
                                selectedEventId,
                                isTechnician ? technicianQuantity : 1,
                                isTechnician ? technicianDays : undefined,
                                isTechnician ? technicianCount : undefined,
                              )
                            }
                            onQuote={() =>
                              requestQuotation(
                                offer,
                                "ONE_TIME",
                                selectedEventId,
                              )
                            }
                            quotePending={quotation.isPending}
                          />
                        );
                      })
                    ) : (
                      <div className="commercial-empty-step">
                        <PackagePlus className="size-5" />
                        <strong>No add-ons in this category</strong>
                        <span>
                          Published Venue applications will appear here.
                        </span>
                      </div>
                    )}
                  </div>
                </>
              ) : null}

              {active.key === "review" ? (
                <div className="commercial-review">
                  <div className="commercial-review-heading">
                    <Sparkles className="size-5" />
                    <div>
                      <strong>Review the complete purchase</strong>
                      <span>
                        Each contract keeps its own renewal and expiry rules.
                      </span>
                    </div>
                  </div>
                  {steps.slice(0, 5).map((step, index) => {
                    const kinds: Record<string, CartKind[]> = {
                      workspace: ["WORKSPACE"],
                      event: ["EVENT"],
                      "event-addons": ["EVENT_ADDON"],
                      venue: ["VENUE"],
                      "venue-addons": ["VENUE_ADDON"],
                    };
                    const rows = cart.filter((item) =>
                      kinds[step.key]?.includes(item.kind),
                    );
                    return (
                      <section key={step.key}>
                        <header>
                          <span>{index + 1}</span>
                          <strong>{step.label}</strong>
                          <button
                            type="button"
                            onClick={() => setActiveStep(index)}
                          >
                            Edit
                          </button>
                        </header>
                        {rows.length ? (
                          rows.map((item) => (
                            <div key={item.key}>
                              <span>
                                <strong>{item.offer.display_name}</strong>
                                <small>
                                  {intervalLabel(item.interval)}
                                  {item.eventName ? ` · ${item.eventName}` : ""}
                                </small>
                              </span>
                              <b>
                                {inr(
                                  Number(
                                    (
                                      offerPrice(item.offer, item.interval) ||
                                      item.offer.prices[0]
                                    )?.amount || 0,
                                  ) * item.quantity,
                                )}
                              </b>
                            </div>
                          ))
                        ) : (
                          <p>
                            {step.key === "workspace" && hasActiveWorkspacePlan
                              ? "Using your active Workspace plan."
                              : step.key === "event" && activeEventPlanItem
                                ? `Using ${activeEventPlanItem.display_name || activeEventPlanCode} for ${selectedEvent ? eventLabel(selectedEvent) : "the selected event"}.`
                              : "No optional selection."}
                          </p>
                        )}
                      </section>
                    );
                  })}
                  {checkout.isError ? (
                    <p className="commercial-checkout-error">
                      Checkout could not be created. Review the selections and
                      try again.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </motion.section>
          </AnimatePresence>
          <footer className="commercial-step-actions">
            <Button
              type="button"
              variant="outline"
              disabled={activeStep === 0}
              onClick={() => setActiveStep((step) => Math.max(0, step - 1))}
            >
              <ArrowLeft className="size-4" /> Back
            </Button>
            <div className="commercial-step-primary-actions">
              {canSkip ? (
                <Button type="button" variant="ghost" onClick={skipCurrentStep}>
                  Skip for now
                </Button>
              ) : null}
              {activeStep < steps.length - 1 ? (
                <Button
                  type="button"
                  disabled={!canContinue}
                  onClick={() =>
                    setActiveStep((step) =>
                      Math.min(steps.length - 1, step + 1),
                    )
                  }
                >
                  Continue <ArrowRight className="size-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={
                    !canContinue || checkout.isPending || payment.isPending
                  }
                  onClick={beginCheckout}
                >
                  {checkout.isPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Creating
                      checkout…
                    </>
                  ) : (
                    <>
                      <CreditCard className="size-4" /> Checkout
                    </>
                  )}
                </Button>
              )}
            </div>
          </footer>
        </main>
        <SelectionLedger
          cart={cart}
          onRemove={(key) =>
            setCart((current) => current.filter((item) => item.key !== key))
          }
        />
      </div>
      {quotation.data ? (
        <div className="commercial-quotation-notice">
          <CheckCircle2 className="size-4" />
          <span>
            Enterprise quotation request submitted.{" "}
            <Link href="/commercial/requests">Track request</Link>
          </span>
        </div>
      ) : null}
      <PaymentConfirmation
        open={paymentOpen}
        onOpenChange={(open) => {
          if (!payment.isPending) setPaymentOpen(open);
        }}
        checkoutResult={checkoutResult}
        payment={payment}
        onRetry={() => {
          if (checkoutResult) confirmPayment(checkoutResult);
        }}
      />
    </div>
  );
}
