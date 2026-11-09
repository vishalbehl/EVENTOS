"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  CreditCard,
  FileText,
  HardDrive,
  Layers3,
  Loader2,
  Mail,
  MapPin,
  Mic,
  MonitorPlay,
  Plus,
  Search,
  ShoppingBag,
  Sliders,
  Sparkles,
  Tv,
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
  MetricCard,
  Panel,
  StatusBadge,
} from "../workspace/OrganiserPrimitives";
import { OrganiserSection, Unavailable } from "../workspace/OrganiserSection";
import {
  useAcceptCloudCommercialQuote,
  useCloudCancelContract,
  useCloudCapacityPurchase,
  useCloudCapacityPurchases,
  useCloudCatalog,
  useCloudCartCheckout,
  useCloudCheckout,
  useCloudCommercialAccount,
  useCloudCommercialOverview,
  useCloudCommercialRequest,
  useCloudCommercialRequests,
  useCloudContracts,
  useCloudMockPayment,
  useCloudPricingPreview,
  useCloudUsage,
  useCreateEmcAllocation,
  useEmcAllocations,
  useEmcWorkspaces,
  useInternalEnterpriseSummary,
  useTransferEmcAllocation,
  type CloudOffer,
  type CommercialOverview,
  type InternalEnterpriseSummary,
} from "@/hooks/useCloudCommercial";
import { useEvents } from "@/hooks/useEvents";
import { useOrganiserDashboard } from "@/hooks/useOrganiserDashboard";
import { CommercialClientAttachment } from "./CommercialClientAttachment";
import {
  EnterpriseCapacityEditor,
  type CapacityField,
} from "./EnterpriseCapacityEditor";
import { CommercialPlanCatalogue } from "./CommercialPlanCatalogue";
import { CommercialBillingOverviewContent } from "./billing/BillingOverviewTab";
import { commercialTabs } from "./billing/shared";
import { useAccessBootstrap } from "@/hooks/useAccessBootstrap";
import { isPlatformSelfSession, useAuthStore } from "@/store/use-auth-store";

const inr = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);

const workspaceCapacityFields: CapacityField[] = [
  { key: "active_events", label: "Active events", unit: "events" },
  { key: "team_members", label: "Team members", unit: "users" },
  {
    key: "organization_email_credits",
    label: "Workspace email capacity",
    unit: "recipients",
  },
];

const emcCapacityFields: CapacityField[] = [
  {
    key: "annual_events",
    label: "Annual events",
    unit: "events per contract year",
  },
  {
    key: "annual_registrations",
    label: "Annual registrations",
    unit: "registrations per contract year",
  },
  {
    key: "annual_storage_gb",
    label: "Annual storage",
    unit: "GB per contract year",
  },
  {
    key: "annual_email_credits",
    label: "Annual email capacity",
    unit: "recipients per contract year",
  },
  { key: "client_workspaces", label: "Client workspaces", unit: "workspaces" },
];

function asArray<T = any>(value: any): T[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function titleCaseLabel(value: unknown) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getUsageCategory(item: {
  entitlement_key?: string;
  event_id?: string | null;
}): "organisation" | "event" | "venue" {
  const key = (item.entitlement_key || "").toLowerCase();
  if (
    key.includes("venue") ||
    key.includes("screen") ||
    key.includes("eposter") ||
    key.includes("signage") ||
    key.includes("moderator") ||
    key.includes("technician") ||
    key.includes("onsite") ||
    key.includes("live_qa") ||
    key.includes("terminal") ||
    key.includes("room")
  ) {
    return "venue";
  }

  if (
    key.startsWith("workspace") ||
    key.startsWith("org") ||
    key.startsWith("annual") ||
    key.includes("client_workspace") ||
    key === "max_events" ||
    key === "active_events" ||
    key === "team_members" ||
    key === "organization_seats" ||
    key === "organization_email_credits" ||
    (!item.event_id &&
      (key.includes("storage") || key.includes("seat") || key.includes("user")))
  ) {
    return "organisation";
  }

  return "event";
}

function LoadState({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  if (loading)
    return (
      <div className="op-unavailable" role="status">
        Loading commercial catalogue…
      </div>
    );
  if (error) {
    const status = (error as { status?: number } | undefined)?.status;
    if (status === 401 || status === 403)
      return (
        <Unavailable>
          You do not have permission to view this commercial account. Ask an
          organization administrator to review your access.
        </Unavailable>
      );
    return (
      <Unavailable>
        Commercial data is unavailable.{" "}
        <button className="underline" onClick={onRetry}>
          Retry
        </button>
      </Unavailable>
    );
  }
  return null;
}

function OfferCard({
  offer,
  selected,
  onSelect,
}: {
  offer: CloudOffer;
  selected: boolean;
  onSelect: () => void;
}) {
  const annual = offer.prices.find(
    (price) => price.billing_interval === "ANNUAL",
  );
  const monthly = offer.prices.find(
    (price) => price.billing_interval === "MONTHLY",
  );
  const perEvent = offer.prices.find(
    (price) => price.billing_interval === "PER_EVENT",
  );
  const price = annual || monthly || perEvent;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group rounded-2xl border p-5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc)] ${selected ? "border-[var(--acc)] bg-[var(--bg-surface-2)] shadow-[0_0_0_1px_var(--acc)]" : "border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--text-secondary)]"}`}
    >
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
            {offer.product_family}
          </p>
          <h3 className="mt-2 text-lg font-semibold text-[var(--text-primary)]">
            {offer.display_name}
          </h3>
        </div>
        {selected ? (
          <span className="rounded-full bg-[var(--acc)] p-1 text-white">
            <Check className="size-3" />
          </span>
        ) : null}
      </div>
      <p className="text-2xl font-semibold text-[var(--text-primary)]">
        {price && Number(price.amount) > 0
          ? inr(price.amount)
          : offer.is_quote_only
            ? "Custom"
            : "Unavailable"}
      </p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">
        {offer.is_quote_only
          ? "Quotation required"
          : price
            ? `${price.billing_interval.toLowerCase().replace("_", " ")} · before GST`
            : "Price unavailable"}
      </p>
      <div className="mt-5 space-y-2 text-xs text-[var(--text-secondary)]">
        {offer.entitlements.slice(0, 4).map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between gap-3"
          >
            <span>{item.key.replaceAll("_", " ")}</span>
            <span className="font-medium text-[var(--text-primary)]">
              {item.quantity ?? "Included"}
            </span>
          </div>
        ))}
      </div>
    </button>
  );
}

function VenueOfferCard({
  offer,
  pending,
  disabled,
  onRequest,
}: {
  offer: CloudOffer;
  pending: boolean;
  disabled?: boolean;
  onRequest: () => void;
}) {
  const price = offer.prices[0];
  return (
    <article className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-11 place-items-center rounded-2xl bg-[var(--org-purple-soft)] text-[var(--org-purple)]">
          <Building2 className="size-5" />
        </span>
        <span className="rounded-full bg-[var(--warning-muted)] px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--warning)]">
          Quotation
        </span>
      </div>
      <h3 className="mt-4 font-semibold text-[var(--text-primary)]">
        {offer.display_name}
      </h3>
      <p className="mt-1 min-h-10 text-xs leading-5 text-[var(--text-secondary)]">
        {offer.description}
      </p>
      <p className="mt-4 text-xl font-semibold">
        {price && Number(price.amount) > 0 ? inr(price.amount) : "Custom"}
      </p>
      <p className="text-xs capitalize text-[var(--text-secondary)]">
        {price?.billing_interval.toLowerCase().replaceAll("_", " ") ||
          "Custom term"}{" "}
        · before GST
      </p>
      <Button
        variant="outline"
        className="mt-5 w-full rounded-full"
        disabled={pending || disabled}
        onClick={onRequest}
      >
        {pending
          ? "Submitting…"
          : disabled
            ? "Select an event"
            : "Request quotation"}
      </Button>
    </article>
  );
}

function EmcAdministration() {
  const workspaces = useEmcWorkspaces(true);
  const allocations = useEmcAllocations(true);
  const createAllocation = useCreateEmcAllocation();
  const transferAllocation = useTransferEmcAllocation();
  const [allocation, setAllocation] = useState({
    workspaceId: "",
    entitlementKey: "annual_registrations",
    quantity: "",
    reason: "",
  });
  const [transfer, setTransfer] = useState({
    sourceId: "",
    targetId: "",
    entitlementKey: "annual_registrations",
    quantity: "",
    reason: "",
  });
  return (
    <Panel
      title="EMC administration"
      description="Link approved clients to the commercial account, allocate pooled capacity, and transfer unused capacity with an audit reason."
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <CommercialClientAttachment />
        <div className="rounded-xl border border-[var(--border-subtle)] p-4">
          <h3 className="font-medium">Allocate pooled capacity</h3>
          <select
            value={allocation.workspaceId}
            onChange={(event) =>
              setAllocation({ ...allocation, workspaceId: event.target.value })
            }
            className="input mt-3 h-9 w-full rounded-md px-3 text-sm"
          >
            <option value="">Select client workspace</option>
            {(workspaces.data || []).map((workspace: any) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.organization_id}
              </option>
            ))}
          </select>
          <input
            value={allocation.quantity}
            onChange={(event) =>
              setAllocation({ ...allocation, quantity: event.target.value })
            }
            placeholder="Quantity"
            type="number"
            min="1"
            className="input mt-2 h-9 w-full rounded-md px-3 text-sm"
          />
          <input
            value={allocation.reason}
            onChange={(event) =>
              setAllocation({ ...allocation, reason: event.target.value })
            }
            placeholder="Reason"
            className="input mt-2 h-9 w-full rounded-md px-3 text-sm"
          />
          <Button
            className="mt-3 w-full"
            variant="outline"
            disabled={
              !allocation.workspaceId ||
              !allocation.quantity ||
              allocation.reason.length < 5 ||
              createAllocation.isPending
            }
            onClick={() =>
              createAllocation.mutate({
                client_workspace_id: allocation.workspaceId,
                entitlement_key: allocation.entitlementKey,
                quantity: Number(allocation.quantity),
                reason: allocation.reason,
              })
            }
          >
            {createAllocation.isPending ? "Allocating…" : "Allocate"}
          </Button>
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] p-4">
          <h3 className="font-medium">Transfer allocation</h3>
          <select
            value={transfer.sourceId}
            onChange={(event) =>
              setTransfer({ ...transfer, sourceId: event.target.value })
            }
            className="input mt-3 h-9 w-full rounded-md px-3 text-sm"
          >
            <option value="">Source allocation</option>
            {(allocations.data || []).map((item: any) => (
              <option key={item.id} value={item.id}>
                {titleCaseLabel(item.entitlement_key)} · {item.remaining} remaining
              </option>
            ))}
          </select>
          <select
            value={transfer.targetId}
            onChange={(event) =>
              setTransfer({ ...transfer, targetId: event.target.value })
            }
            className="input mt-2 h-9 w-full rounded-md px-3 text-sm"
          >
            <option value="">Target allocation</option>
            {(allocations.data || []).map((item: any) => (
              <option key={item.id} value={item.id}>
                {titleCaseLabel(item.entitlement_key)} · {item.client_workspace_id || "pool"}
              </option>
            ))}
          </select>
          <input
            value={transfer.quantity}
            onChange={(event) =>
              setTransfer({ ...transfer, quantity: event.target.value })
            }
            placeholder="Quantity"
            type="number"
            min="1"
            className="input mt-2 h-9 w-full rounded-md px-3 text-sm"
          />
          <input
            value={transfer.reason}
            onChange={(event) =>
              setTransfer({ ...transfer, reason: event.target.value })
            }
            placeholder="Reason"
            className="input mt-2 h-9 w-full rounded-md px-3 text-sm"
          />
          <Button
            className="mt-3 w-full"
            variant="outline"
            disabled={
              !transfer.sourceId ||
              !transfer.targetId ||
              !transfer.quantity ||
              transfer.reason.length < 5 ||
              transferAllocation.isPending
            }
            onClick={() =>
              transferAllocation.mutate({
                source_allocation_id: transfer.sourceId,
                target_allocation_id: transfer.targetId,
                entitlement_key: transfer.entitlementKey,
                quantity: Number(transfer.quantity),
                reason: transfer.reason,
              })
            }
          >
            {transferAllocation.isPending ? "Transferring…" : "Transfer"}
          </Button>
        </div>
      </div>
    </Panel>
  );
}

type EventAddonUpgradeTarget = {
  event: any;
  planItem: any;
};

function EventAddonUpgradeDialog({
  target,
  offers,
  open,
  onOpenChange,
}: {
  target: EventAddonUpgradeTarget | null;
  offers: CloudOffer[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const checkout = useCloudCartCheckout();
  const payment = useCloudMockPayment();
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [checkoutResult, setCheckoutResult] = useState<any>(null);

  const planOffer = offers.find(
    (offer) => offer.code === target?.planItem?.offer_code,
  );
  const eligibleCodes = new Set(planOffer?.eligible_addon_codes || []);
  const addonOffers = offers.filter(
    (offer) =>
      offer.product_family === "CAPACITY_ADDON" &&
      offer.scope_type === "EVENT" &&
      (eligibleCodes.size === 0 || eligibleCodes.has(offer.code)),
  );

  useEffect(() => {
    if (!open) return;
    setSelectedCodes([]);
    setCheckoutResult(null);
    checkout.reset();
    payment.reset();
  }, [open, target?.event?.id]);

  const toggle = (code: string) =>
    setSelectedCodes((current) =>
      current.includes(code)
        ? current.filter((candidate) => candidate !== code)
        : [...current, code],
    );

  const confirmPayment = (result: any) =>
    payment.mutate({
      invoice_ids: result.items.map((item: any) => item.invoice_id),
    });

  const purchase = () => {
    if (!target || selectedCodes.length === 0) return;
    checkout.mutate(
      {
        items: [
          {
            account_type: "ORGANIZER",
            events: [
              {
                event_id: target.event.id,
                capacity_addon_codes: selectedCodes,
              },
            ],
            auto_renew: false,
          },
        ],
      },
      {
        onSuccess: (result) => {
          setCheckoutResult(result);
          confirmPayment(result);
        },
      },
    );
  };

  const busy = checkout.isPending || payment.isPending;
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!busy) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-w-2xl">
        {payment.data ? (
          <div className="space-y-5 py-2">
            <span className="grid size-12 place-items-center rounded-full bg-emerald-500/15 text-emerald-600">
              <CheckCircle2 className="size-6" />
            </span>
            <DialogHeader>
              <DialogTitle>Event add-ons activated</DialogTitle>
              <DialogDescription>
                The selected capacity was added to {target?.event?.name || target?.event?.title || "the event"}. The base Event plan was not changed.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Upgrade with Event add-ons</DialogTitle>
              <DialogDescription>
                {target?.event?.name || target?.event?.title || "Selected event"} keeps {target?.planItem?.display_name || target?.planItem?.offer_code || "its current Event plan"}. Only compatible add-ons can be purchased here.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
              {addonOffers.length ? (
                addonOffers.map((offer) => {
                  const price = offer.prices.find(
                    (item) => item.billing_interval === "ONE_TIME",
                  ) || offer.prices[0];
                  const selected = selectedCodes.includes(offer.code);
                  return (
                    <button
                      key={offer.code}
                      type="button"
                      aria-pressed={selected}
                      className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                        selected
                          ? "border-[var(--acc)] bg-[var(--acc)]/8"
                          : "border-[var(--border-subtle)] bg-[var(--surface)] hover:border-[var(--acc)]/45"
                      }`}
                      onClick={() => toggle(offer.code)}
                    >
                      <span className={`grid size-6 shrink-0 place-items-center rounded-full border ${selected ? "border-[var(--acc)] bg-[var(--acc)] text-white" : "border-[var(--border-subtle)]"}`}>
                        {selected ? <Check className="size-3.5" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <strong className="block text-sm">{offer.display_name}</strong>
                        <small className="line-clamp-2 text-[var(--text-secondary)]">{offer.description || "Additional event capacity"}</small>
                      </span>
                      <strong className="text-sm">{price ? inr(Number(price.amount)) : "Unavailable"}</strong>
                    </button>
                  );
                })
              ) : (
                <div className="op-unavailable">No compatible Event add-ons are currently published for this plan.</div>
              )}
            </div>
            {checkout.isError || payment.isError ? (
              <div className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/5 px-3 py-2 text-sm text-[var(--danger)]">
                {payment.isError
                  ? "Payment confirmation failed. The checkout remains recoverable from Billing."
                  : "The add-on checkout could not be created."}
              </div>
            ) : null}
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
              {payment.isError && checkoutResult ? (
                <Button onClick={() => confirmPayment(checkoutResult)} disabled={busy}>
                  {payment.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Retry payment
                </Button>
              ) : (
                <Button onClick={purchase} disabled={selectedCodes.length === 0 || busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
                  {busy ? "Processing…" : "Purchase add-ons"}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CommercialOverviewView({
  data,
  loading,
  error,
  events = [],
  offers = [],
  activeEventsOverride,
}: {
  data?: CommercialOverview;
  loading: boolean;
  error: unknown;
  events?: any[];
  offers?: CloudOffer[];
  activeEventsOverride?: number;
}) {
  const [upgradeTarget, setUpgradeTarget] =
    useState<EventAddonUpgradeTarget | null>(null);
  if (loading)
    return (
      <div className="op-unavailable" role="status">
        Loading commercial overview…
      </div>
    );
  if (error || !data)
    return (
      <Unavailable>
        Commercial overview is unavailable from the authoritative service.
      </Unavailable>
    );
  const workspacePlan = data.contracts
    .flatMap((contract) => contract.items || [])
    .find((item: any) => item.product_family === "WORKSPACE");
  const plan =
    data.plan?.name ||
    workspacePlan?.display_name ||
    workspacePlan?.offer_code ||
    "Not configured";
  const usageItems = data.usage?.items || [];
  const workspaceUsageItems = usageItems.filter(
    (item: any) => !item.event_id,
  );
  const activeContracts = data.contracts.filter(
    (contract) => String(contract.status || "").toUpperCase() === "ACTIVE",
  );
  const workspaceContract = activeContracts.find((contract) =>
    (contract.items || []).some(
      (item: any) => item.product_family === "WORKSPACE",
    ),
  );
  const eventPlanRows = events.map((event) => {
    const contract = activeContracts.find((candidate) =>
      (candidate.items || []).some(
        (item: any) =>
          item.event_id === event.id && item.product_family === "EVENT",
      ),
    );
    const planItem = contract?.items?.find(
      (item: any) =>
        item.event_id === event.id && item.product_family === "EVENT",
    );
    const addOns = activeContracts.flatMap((candidate) =>
      (candidate.items || []).filter(
          (item: any) =>
            item.event_id === event.id &&
            item.product_family === "CAPACITY_ADDON",
        ),
    );
    return { event, contract, planItem, addOns };
  });
  const venuePlanRows = events.flatMap((event) => {
    const venuePlans = activeContracts.flatMap((contract) =>
      (contract.items || [])
        .filter(
          (item: any) =>
            item.event_id === event.id && item.product_family === "VENUE",
        )
        .map((planItem: any) => ({ contract, planItem })),
    );
    const addOns = activeContracts.flatMap((contract) =>
      (contract.items || []).filter(
        (item: any) =>
          item.event_id === event.id && item.product_family === "VENUE_ADDON",
      ),
    );
    return venuePlans.map(({ contract, planItem }) => ({
      event,
      contract,
      planItem,
      addOns,
    }));
  });
  const activeEvents =
    activeEventsOverride ??
    events.filter((event) => {
      if (event.is_archived) return false;
      const state = String(
        event.lifecycle_state || event.status || "ACTIVE",
      ).toUpperCase();
      return !["ARCHIVED", "CANCELLED", "COMPLETED", "DELETED"].includes(
        state,
      );
    }).length;
  const workspaceValidUntil = workspaceContract?.ends_at
    ? new Date(workspaceContract.ends_at).toLocaleDateString("en-IN")
    : data.plan?.unrestricted
      ? "No expiry"
      : "Not scheduled";
  const nextPayment = data.plan?.unrestricted
    ? "Not required"
    : data.next_payment
      ? inr(data.next_payment.amount)
      : "Not scheduled";
  const trendMax = Math.max(
    1,
    ...data.commitment_trend.map((item) => item.amount),
  );
  return (
    <>
      <div className="op-metric-grid">
        <MetricCard
          label="Active events"
          value={activeEvents}
          tone="purple"
          icon={<CalendarDays className="size-5" />}
        />
        <MetricCard
          label="Active contracts"
          value={data.active_contracts}
          tone="blue"
          icon={<Layers3 className="size-5" />}
        />
        <MetricCard
          label="Workspace plan"
          value={plan}
          hint={`Next payment ${nextPayment} · Valid until ${workspaceValidUntil}`}
          tone="green"
          icon={<CreditCard className="size-5" />}
        />
        <MetricCard
          label="Open orders"
          value={data.open_orders}
          tone="amber"
          icon={<ShoppingBag className="size-5" />}
        />
      </div>
      <Panel
        title="Purchased Workspace plan"
        description="The Workspace plan retains organisation history, teams, settings and archived events."
        action={data.plan?.unrestricted ? (
          <span className="rounded-full bg-[var(--org-purple-soft)] px-3 py-1 text-xs font-bold text-[var(--org-purple)]">
            Unlimited
          </span>
        ) : (
          <Link
            href="/commercial/workspace"
            className="text-xs font-bold text-[var(--org-purple)]"
          >
            Upgrade plan
          </Link>
        )}
      >
        <div className="grid gap-5 xl:grid-cols-[0.72fr_1.28fr] xl:items-stretch">
          <div className="flex min-h-36 flex-col justify-between rounded-2xl border border-[var(--org-border)] bg-[var(--org-surface-soft)] p-5">
            <div className="flex items-start justify-between gap-4">
              <span className="grid size-12 place-items-center rounded-2xl bg-[var(--org-purple-soft)] text-[var(--org-purple)]">
                <Layers3 className="size-5" />
              </span>
              <span className="rounded-full bg-[var(--org-purple-soft)] px-3 py-1.5 text-xs font-bold text-[var(--org-purple)]">
                Current plan
              </span>
            </div>
            <div className="mt-6">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-xl">{plan}</strong>
                <StatusBadge status={workspaceContract?.status || data.plan?.status || "Unavailable"} />
              </div>
              <p className="mt-1 text-xs capitalize text-[var(--op-muted)]">
                {workspaceContract?.billing_interval
                  ? `${String(workspaceContract.billing_interval).toLowerCase()} billing`
                  : "Billing period unavailable"}
                {workspaceContract?.ends_at
                  ? ` · valid until ${new Date(workspaceContract.ends_at).toLocaleDateString("en-IN")}`
                  : ""}
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-[var(--org-border)] bg-white/45 p-5 dark:bg-white/[0.03]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold">Workspace limits</p>
                <p className="text-xs text-[var(--op-muted)]">Used capacity against this Workspace plan.</p>
              </div>
              <Link href="/commercial/usage" className="text-xs font-bold text-[var(--org-purple)]">View details</Link>
            </div>
            {workspaceUsageItems.length ? (
              <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                {workspaceUsageItems.slice(0, 6).map((item: any) => {
                  const used = Number(item.consumed || 0) + Number(item.reserved || 0);
                  const total = Number(item.total || 0);
                  const unlimited = total <= 0;
                  const pct = unlimited ? 0 : Math.min(100, (used / total) * 100);
                  return (
                    <div key={item.id || item.entitlement_key}>
                      <div className="flex items-end justify-between gap-3 text-xs">
                        <span className="font-bold">{titleCaseLabel(item.entitlement_key || "Capacity")}</span>
                        <span className="text-[var(--op-muted)]">{used.toLocaleString()} / {unlimited ? "Unlimited" : total.toLocaleString()}</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--org-track)]">
                        <div className="h-full rounded-full bg-gradient-to-r from-[var(--org-purple)] to-[var(--org-blue)]" style={{ width: unlimited ? "100%" : `${pct}%`, opacity: unlimited ? 0.35 : 1 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="py-7 text-center text-sm text-[var(--op-muted)]">Workspace usage is not available for this plan.</p>
            )}
          </div>
        </div>
      </Panel>
      <Panel
        title="Event plans"
        description="Each event keeps its purchased base plan. Upgrades add compatible capacity without replacing that plan."
      >
        {eventPlanRows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--org-border)] text-xs text-[var(--op-muted)]">
                  <th className="pb-3">Event</th>
                  <th className="pb-3">Purchased plan</th>
                  <th className="pb-3">Add-ons</th>
                  <th className="pb-3">Valid until</th>
                  <th className="pb-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {eventPlanRows.map(({ event, contract, planItem, addOns }) => (
                  <tr key={event.id} className="border-b border-[var(--org-border)]/70">
                    <td className="py-3 font-bold">{event.name || event.title || event.id}</td>
                    <td className="py-3">
                      {planItem ? (
                        <span className="inline-flex items-center gap-2">
                          <CheckCircle2 className="size-4 text-emerald-600" />
                          {planItem.display_name || planItem.offer_code}
                        </span>
                      ) : (
                        <span className="text-[var(--op-muted)]">Not assigned</span>
                      )}
                    </td>
                    <td className="py-3">
                      {planItem && addOns.length ? (
                        <div className="flex max-w-sm flex-wrap gap-1.5">
                          {addOns.map((item: any) => (
                            <span
                              key={item.id}
                              className="rounded-full bg-[var(--org-purple-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--org-purple)]"
                            >
                              {item.display_name || item.offer_code}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[var(--op-muted)]">None</span>
                      )}
                    </td>
                    <td className="py-3 text-[var(--op-muted)]">
                      {contract?.ends_at
                        ? new Date(contract.ends_at).toLocaleDateString("en-IN")
                        : "—"}
                    </td>
                    <td className="py-3 text-right">
                      {planItem ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setUpgradeTarget({ event, planItem })}
                        >
                          <Plus className="size-3.5" /> Upgrade
                        </Button>
                      ) : (
                        <Button size="sm" asChild>
                          <Link href={`/commercial/workspace?event=${event.id}`}>
                            Choose plan
                          </Link>
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-[var(--op-muted)]">No events are available.</p>
        )}
      </Panel>
      {venuePlanRows.length ? (
        <Panel
          title="Venue plans"
          description="Active venue plans and venue applications are grouped under their event."
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--org-border)] text-xs text-[var(--op-muted)]">
                  <th className="pb-3">Event</th>
                  <th className="pb-3">Venue plan</th>
                  <th className="pb-3">Billing</th>
                  <th className="pb-3">Venue add-ons</th>
                  <th className="pb-3">Valid until</th>
                  <th className="pb-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {venuePlanRows.map(({ event, contract, planItem, addOns }) => (
                  <tr
                    key={`${event.id}-${planItem.id}`}
                    className="border-b border-[var(--org-border)]/70"
                  >
                    <td className="py-3 font-bold">
                      {event.name || event.title || event.id}
                    </td>
                    <td className="py-3">
                      <span className="inline-flex items-center gap-2">
                        <CheckCircle2 className="size-4 text-emerald-600" />
                        {planItem.display_name || planItem.offer_code}
                      </span>
                    </td>
                    <td className="py-3 capitalize text-[var(--op-muted)]">
                      {String(contract.billing_interval || "Not configured")
                        .replaceAll("_", " ")
                        .toLowerCase()}
                    </td>
                    <td className="py-3">
                      {addOns.length ? (
                        <div className="flex max-w-sm flex-wrap gap-1.5">
                          {addOns.map((item: any) => (
                            <span
                              key={item.id}
                              className="rounded-full bg-[var(--org-blue-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--org-blue)]"
                            >
                              {item.display_name || item.offer_code}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[var(--op-muted)]">None</span>
                      )}
                    </td>
                    <td className="py-3 text-[var(--op-muted)]">
                      {contract.ends_at
                        ? new Date(contract.ends_at).toLocaleDateString("en-IN")
                        : "—"}
                    </td>
                    <td className="py-3 text-right">
                      <StatusBadge status={contract.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}
      <div>
        <Panel
          title="Commercial commitment"
          description="Invoice-backed commitment for the last six months."
        >
          <div className="flex h-52 items-end gap-3 border-b border-[var(--org-border)] px-2 pb-3">
            {data.commitment_trend.length ? (
              data.commitment_trend.map((item) => (
                <div
                  key={item.month}
                  className="flex h-full min-w-0 flex-1 flex-col justify-end gap-2"
                >
                  <div
                    className="rounded-t-xl bg-gradient-to-t from-[var(--org-purple)] to-[var(--org-blue)]"
                    style={{
                      height: `${Math.max(8, (item.amount / trendMax) * 100)}%`,
                    }}
                    title={inr(item.amount)}
                  />
                  <span className="truncate text-center text-[10px] text-[var(--op-muted)]">
                    {new Date(item.month).toLocaleDateString("en-IN", {
                      month: "short",
                    })}
                  </span>
                </div>
              ))
            ) : (
              <p className="m-auto text-sm text-[var(--op-muted)]">
                No invoice-backed trend is available.
              </p>
            )}
          </div>
        </Panel>
      </div>
      <EventAddonUpgradeDialog
        target={upgradeTarget}
        offers={offers}
        open={Boolean(upgradeTarget)}
        onOpenChange={(open) => {
          if (!open) setUpgradeTarget(null);
        }}
      />
    </>
  );
}

function InternalEnterpriseCommercialView({
  view,
  query,
}: {
  view:
    | "overview"
    | "workspace"
    | "events"
    | "capacity"
    | "usage"
    | "requests"
    | "history";
  query: ReturnType<typeof useInternalEnterpriseSummary>;
}) {
  if (query.isLoading)
    return (
      <div className="op-unavailable" role="status">
        Loading internal Enterprise plan…
      </div>
    );
  if (query.isError || !query.data)
    return (
      <Unavailable>
        Internal Enterprise commercial data is unavailable.{" "}
        <button className="underline" onClick={() => void query.refetch()}>
          Retry
        </button>
      </Unavailable>
    );
  const data: InternalEnterpriseSummary = query.data;
  if (view === "overview")
    return (
      <CommercialOverviewView
        data={data.commercial}
        loading={false}
        error={null}
        activeEventsOverride={data.usage.active_events?.used ?? 0}
      />
    );
  if (view === "usage")
    return (
      <Panel
        title="Enterprise usage"
        description="Usage is measured for operations, while every platform allowance remains unlimited."
      >
        <div className="space-y-3">
          {Object.entries(data.usage).map(([key, item]) => (
            <div
              key={key}
              className="rounded-2xl border border-[var(--org-border)] bg-[var(--org-surface-soft)] p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-semibold">{titleCaseLabel(key)}</span>
                <span className="rounded-full bg-[var(--org-purple-soft)] px-3 py-1 text-xs font-semibold text-[var(--org-purple)]">
                  {item.used.toLocaleString()} used · Unlimited
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--org-track)]">
                <div className="h-full w-full rounded-full bg-gradient-to-r from-[var(--org-purple)] to-[var(--org-blue)] opacity-70" />
              </div>
            </div>
          ))}
        </div>
      </Panel>
    );
  if (view === "history")
    return (
      <Panel
        title="Internal commercial history"
        description="The canonical platform organisation has no customer subscription contract or renewal charge."
      >
        {data.recent_invoices.length ? (
          <div className="space-y-2">
            {data.recent_invoices.map((invoice) => (
              <div
                key={invoice.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--org-border)] p-4 text-sm"
              >
                <span className="font-semibold">
                  {invoice.reference || invoice.id}
                </span>
                <span>
                  {inr(invoice.amount)} · {invoice.status}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--org-muted)]">
            No internal billing history is recorded.
          </p>
        )}
      </Panel>
    );
  const copy =
    view === "workspace"
      ? [
          "Enterprise platform plan",
          "All organisation, event, registration, storage, team and platform capability limits are unlimited for the canonical Eventos organisation.",
        ]
      : view === "events"
        ? [
            "Enterprise event entitlement",
            "Events created by the canonical platform organisation do not require per-event commercial contracts or capacity purchases.",
          ]
        : view === "capacity"
          ? [
              "Unlimited platform capacity",
              "Capacity add-ons are not applicable to the canonical Eventos organisation. Usage remains visible for operational monitoring.",
            ]
          : [
              "No customer orders required",
              "The canonical platform organisation does not submit customer quotations, checkouts or subscription change requests.",
            ];
  return (
    <Panel title={copy[0]} description={copy[1]}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {["Active events", "Team members", "Registrations", "Storage"].map(
          (label) => (
            <div
              key={label}
              className="rounded-2xl border border-[var(--org-border)] bg-[var(--org-surface-soft)] p-4"
            >
              <span className="text-xs text-[var(--org-muted)]">{label}</span>
              <strong className="mt-2 block text-lg">Unlimited</strong>
            </div>
          ),
        )}
      </div>
      <p className="mt-5 text-xs text-[var(--org-muted)]">
        Customer catalogue, pricing, quotations and contract controls remain in
        Command Center and are not exposed through this internal self
        projection.
      </p>
    </Panel>
  );
}

export function CloudCommercialWorkspace({
  view,
}: {
  view:
    | "overview"
    | "workspace"
    | "events"
    | "capacity"
    | "usage"
    | "requests"
    | "history";
}) {
  const internalEnterprise = useAuthStore(isPlatformSelfSession);
  const customerCommercialEnabled = !internalEnterprise;
  const planningView = ["overview", "workspace", "events", "capacity"].includes(view);
  const contractsView = [
    "overview",
    "workspace",
    "events",
    "capacity",
    "history",
  ].includes(view);
  const usageView = ["overview", "usage", "capacity"].includes(view);
  const requestsView = ["overview", "requests", "history"].includes(view);
  const purchasesView = ["overview", "capacity", "history"].includes(view);
  const internalEnterpriseSummary =
    useInternalEnterpriseSummary(internalEnterprise);
  const access = useAccessBootstrap(customerCommercialEnabled);
  const overview = useCloudCommercialOverview(
    customerCommercialEnabled && view === "overview",
  );
  const account = useCloudCommercialAccount(customerCommercialEnabled);
  const catalog = useCloudCatalog(
    undefined,
    customerCommercialEnabled && planningView,
  );
  const contracts = useCloudContracts(
    customerCommercialEnabled && contractsView,
  );
  const events = useEvents(
    undefined,
    customerCommercialEnabled && (planningView || usageView),
  );
  const eventList = useMemo(() => asArray<any>(events.data), [events.data]);
  const dashboard = useOrganiserDashboard();
  const usage = useCloudUsage(
    undefined,
    customerCommercialEnabled && usageView,
  );
  const requests = useCloudCommercialRequests(
    customerCommercialEnabled && requestsView,
  );
  const acceptQuote = useAcceptCloudCommercialQuote();
  const purchases = useCloudCapacityPurchases(
    customerCommercialEnabled && purchasesView,
  );
  const isEmc =
    access.data?.access_mode === "DIRECT" &&
    access.data.organization_kind === "EMC" &&
    account.data?.account_type === "EMC";
  const emcWorkspaces = useEmcWorkspaces(isEmc);
  const emcAllocations = useEmcAllocations(isEmc);
  const preview = useCloudPricingPreview();
  const checkout = useCloudCheckout();
  const commercialRequest = useCloudCommercialRequest();
  const capacityPurchase = useCloudCapacityPurchase();
  const cancelContract = useCloudCancelContract();
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>("");
  const [requestedCapacity, setRequestedCapacity] = useState<
    Record<string, string>
  >({});
  const [requestNotes, setRequestNotes] = useState("");
  const [selectedCapacityEvent, setSelectedCapacityEvent] =
    useState<string>("");
  const [capacityCategory, setCapacityCategory] = useState<string>("all");
  const workspaceOffers = useMemo(
    () =>
      (catalog.data || []).filter(
        (offer) => offer.product_family === "WORKSPACE",
      ),
    [catalog.data],
  );
  const emcOffers = useMemo(
    () =>
      (catalog.data || []).filter((offer) => offer.product_family === "EMC"),
    [catalog.data],
  );
  const eventOffers = useMemo(
    () =>
      (catalog.data || []).filter((offer) => offer.product_family === "EVENT"),
    [catalog.data],
  );
  const capacityOffers = useMemo(
    () =>
      (catalog.data || []).filter(
        (offer) => offer.product_family === "CAPACITY_ADDON",
      ),
    [catalog.data],
  );
  const visibleCapacityOffers = useMemo(() => {
    if (capacityCategory === "all") return capacityOffers;
    return capacityOffers.filter((offer) =>
      offer.code.includes(capacityCategory.toUpperCase()),
    );
  }, [capacityOffers, capacityCategory]);
  const venueOffers = useMemo(
    () =>
      (catalog.data || []).filter((offer) => offer.product_family === "VENUE"),
    [catalog.data],
  );
  const venueAddons = useMemo(
    () =>
      (catalog.data || []).filter(
        (offer) => offer.product_family === "VENUE_ADDON",
      ),
    [catalog.data],
  );
  const items = usage.data?.items || [];
  const [usageCategory, setUsageCategory] = useState<
    "all" | "organisation" | "event" | "venue" | "event-wise"
  >("all");
  const [eventSearch, setEventSearch] = useState("");

  const allEvents = useMemo(() => {
    const map = new Map<string, any>();
    for (const ev of eventList) {
      if (ev?.id) map.set(ev.id, { ...ev });
    }
    for (const dev of dashboard.data?.events || []) {
      if (dev?.id) {
        const existing = map.get(dev.id) || {};
        map.set(dev.id, { ...existing, ...dev });
      }
    }
    return Array.from(map.values());
  }, [eventList, dashboard.data?.events]);

  const filteredEvents = useMemo(() => {
    if (!eventSearch.trim()) return allEvents;
    const q = eventSearch.toLowerCase();
    return allEvents.filter(
      (ev) =>
        (ev.name && String(ev.name).toLowerCase().includes(q)) ||
        (ev.short_code && String(ev.short_code).toLowerCase().includes(q)) ||
        (ev.venue && String(ev.venue).toLowerCase().includes(q)) ||
        (ev.venue_name && String(ev.venue_name).toLowerCase().includes(q)) ||
        (ev.city && String(ev.city).toLowerCase().includes(q)) ||
        (ev.location && String(ev.location).toLowerCase().includes(q)),
    );
  }, [allEvents, eventSearch]);

  const itemsByEvent = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const item of items) {
      if (item.event_id) {
        const arr = map.get(item.event_id) || [];
        arr.push(item);
        map.set(item.event_id, arr);
      }
    }
    return map;
  }, [items]);

  const organisationItems = useMemo(
    () => items.filter((item: any) => getUsageCategory(item) === "organisation"),
    [items],
  );
  const eventItems = useMemo(
    () => items.filter((item: any) => getUsageCategory(item) === "event"),
    [items],
  );
  const venueItems = useMemo(
    () => items.filter((item: any) => getUsageCategory(item) === "venue"),
    [items],
  );

  const orgMetrics = useMemo(() => {
    const activeEvents = dashboard.data?.metrics?.active_events ?? allEvents.length;
    const totalEvents = dashboard.data?.metrics?.total_events ?? allEvents.length;
    const teamMembers = dashboard.data?.metrics?.team_members ?? "—";
    const storageUsedGb = dashboard.data?.commercial?.storage_used_gb ?? 0;
    const storageMaxGb = dashboard.data?.commercial?.storage_max_gb ?? null;

    return {
      activeEvents,
      totalEvents,
      teamMembers,
      storageUsedGb,
      storageMaxGb,
    };
  }, [dashboard.data, allEvents.length]);

  const eventMetrics = useMemo(() => {
    let registrationsConsumed = 0;
    let registrationsTotal = 0;
    let speakersConsumed = 0;
    let speakersTotal = 0;
    let abstractsConsumed = 0;
    let abstractsTotal = 0;
    let storageConsumedGb = 0;
    let storageTotalGb = 0;

    for (const item of eventItems) {
      const key = (item.entitlement_key || "").toLowerCase();
      if (key.includes("reg")) {
        registrationsConsumed += Number(item.consumed || 0);
        registrationsTotal += Number(item.total || 0);
      } else if (key.includes("spk") || key.includes("speaker")) {
        speakersConsumed += Number(item.consumed || 0);
        speakersTotal += Number(item.total || 0);
      } else if (key.includes("abs") || key.includes("abstract")) {
        abstractsConsumed += Number(item.consumed || 0);
        abstractsTotal += Number(item.total || 0);
      } else if (key.includes("sto") || key.includes("storage")) {
        storageConsumedGb += Number(item.consumed || 0);
        storageTotalGb += Number(item.total || 0);
      }
    }

    if (registrationsConsumed === 0 && dashboard.data?.metrics?.total_registrations) {
      registrationsConsumed = dashboard.data.metrics.total_registrations;
    }
    if (speakersConsumed === 0 && dashboard.data?.metrics?.total_speakers) {
      speakersConsumed = dashboard.data.metrics.total_speakers;
    }
    if (storageConsumedGb === 0 && dashboard.data?.commercial?.storage_used_gb) {
      storageConsumedGb = dashboard.data.commercial.storage_used_gb;
    }

    return {
      registrationsConsumed,
      registrationsTotal,
      speakersConsumed,
      speakersTotal,
      abstractsConsumed,
      abstractsTotal,
      storageConsumedGb,
      storageTotalGb,
    };
  }, [eventItems, dashboard.data]);
  const requestItems: any[] = Array.isArray(requests.data)
    ? requests.data
    : (requests.data as any)?.items || [];
  const contractItems = (contracts.data || []).flatMap((contract) =>
    (contract.items || []).map((item: any) => ({
      ...item,
      contract_type: contract.contract_type,
      contract_status: contract.status,
    })),
  );
  const primaryError = access.error || catalog.error || account.error;
  const hasRefreshingSnapshot = [
    access,
    overview,
    catalog,
    account,
    contracts,
    usage,
    requests,
    purchases,
    emcWorkspaces,
    emcAllocations,
  ].some((query) => query.isFetching && query.data !== undefined);

  const previewWorkspace = (offer: CloudOffer) => {
    setSelectedWorkspace(offer.code);
    setRequestedCapacity(
      Object.fromEntries(
        offer.entitlements
          .filter((item) => Number(item.quantity) > 0)
          .map((item) => [item.key, String(item.quantity)]),
      ),
    );
    setRequestNotes("");
    const interval = offer.prices.some(
      (item) => item.billing_interval === "ANNUAL",
    )
      ? "ANNUAL"
      : "MONTHLY";
    preview.mutate(
      isEmc
        ? { account_type: "EMC", emc_offer_code: offer.code, events: [] }
        : {
            account_type: "ORGANIZER",
            workspace_offer_code: offer.code,
            workspace_billing_interval: interval,
            events: [],
          },
    );
  };

  const continueWithSelection = () => {
    const offer = (isEmc ? emcOffers : workspaceOffers).find(
      (item) => item.code === selectedWorkspace,
    );
    if (!offer) return;
    const payload = isEmc
      ? { account_type: "EMC", emc_offer_code: offer.code, events: [] }
      : {
          account_type: "ORGANIZER",
          workspace_offer_code: offer.code,
          workspace_billing_interval: offer.prices.some(
            (item) => item.billing_interval === "ANNUAL",
          )
            ? "ANNUAL"
            : "MONTHLY",
          events: [],
        };
    if (offer.is_quote_only || preview.data?.quote_required) {
      const capacity = Object.fromEntries(
        Object.entries(requestedCapacity)
          .filter(([, value]) => Number(value) > 0)
          .map(([key, value]) => [key, Number(value)]),
      );
      commercialRequest.mutate({
        ...payload,
        requested_capacity: capacity,
        requirements: requestNotes.trim() ? { notes: requestNotes.trim() } : {},
        request_type: isEmc ? "EMC" : "ENTERPRISE",
        reason: `Request for ${offer.display_name}`,
      });
      return;
    }
    checkout.mutate(payload);
  };

  const selectedCommercialOffer = (isEmc ? emcOffers : workspaceOffers).find(
    (item) => item.code === selectedWorkspace,
  );
  const requestedCapacityCount = Object.values(requestedCapacity).filter(
    (value) => Number(value) > 0,
  ).length;
  const requestVenueOffer = (offer: CloudOffer) =>
    commercialRequest.mutate({
      account_type: "ORGANIZER",
      venue_offer_codes: [offer.code],
      venue_event_id:
        offer.prices[0]?.billing_interval === "PER_EVENT" ||
        offer.prices[0]?.billing_interval === "ONE_TIME"
          ? selectedCapacityEvent
          : undefined,
      events: [],
      request_type: "VENUE",
      reason: `Venue quotation request for ${offer.display_name}`,
    });
  const classificationMismatch = Boolean(
    access.data &&
    account.data &&
    (access.data.organization_kind === "EMC") !==
      (account.data.account_type === "EMC"),
  );

  if (internalEnterprise) {
    return (
      <OrganiserSection
        title="Commercial"
        description="Review the canonical platform plan, unlimited capacity, and internal commercial activity."
        tabs={commercialTabs}
      >
        <div className="space-y-5">
          <InternalEnterpriseCommercialView
            view={view}
            query={internalEnterpriseSummary}
          />
          {view === "overview" ? (
            <CommercialBillingOverviewContent />
          ) : null}
        </div>
      </OrganiserSection>
    );
  }

  if (classificationMismatch) {
    return (
      <OrganiserSection
        title="Commercial"
        description="Manage your plans, add-ons, orders, and commercial usage."
        tabs={commercialTabs}
      >
        <Unavailable>
          Commercial management is unavailable because the operational
          organisation classification and commercial account classification do
          not match. A platform administrator must reconcile the account before
          changes can continue.
        </Unavailable>
      </OrganiserSection>
    );
  }

  return (
    <OrganiserSection
      title="Commercial"
      description="Manage your plans, add-ons, orders, and commercial usage."
      tabs={commercialTabs}
    >
      <LoadState
        loading={access.isLoading || catalog.isLoading || account.isLoading}
        error={primaryError}
        onRetry={() => {
          void access.refetch();
          void catalog.refetch();
          void account.refetch();
        }}
      />
      {hasRefreshingSnapshot ? (
        <div
          className="rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/5 px-3 py-2 text-xs text-[var(--text-secondary)]"
          role="status"
        >
          Refreshing commercial data. Values shown may be briefly stale until
          the latest response arrives.
        </div>
      ) : null}
      {isEmc && view === "workspace" ? <EmcAdministration /> : null}
      {view === "overview" ? (
        <div className="space-y-5">
          <CommercialOverviewView
            data={overview.data}
            loading={overview.isLoading}
            error={overview.error}
            events={eventList}
            offers={catalog.data || []}
          />
          <CommercialBillingOverviewContent />
        </div>
      ) : null}
      {view === "workspace" && isEmc ? (
        <div className="space-y-4">
          <Panel
            title={isEmc ? "EMC plans" : "Workspace plans"}
            description={
              isEmc
                ? "EMC is annual, pooled and quotation-based."
                : "Select a standard Workspace plan. Enterprise pricing is quotation-based."
            }
          >
            <div className="grid gap-4 xl:grid-cols-4">
              {(isEmc ? emcOffers : workspaceOffers).map((offer) => (
                <OfferCard
                  key={offer.code}
                  offer={offer}
                  selected={selectedWorkspace === offer.code}
                  onSelect={() => previewWorkspace(offer)}
                />
              ))}
            </div>
            {isEmc ? (
              <div className="mt-4 rounded-xl border border-[var(--border-subtle)] p-4 text-sm text-[var(--text-secondary)]">
                Pooled allocations: {emcAllocations.data?.length ?? 0}{" "}
                allocation records. Capacity expires with the EMC contract year
                and does not roll over.
              </div>
            ) : null}
            {preview.isPending ? (
              <div className="op-unavailable mt-4" role="status">
                Calculating price…
              </div>
            ) : null}
            {preview.data ? (
              <div className="mt-4 rounded-2xl border border-[var(--acc)] bg-[var(--bg-surface-2)] p-5">
                {preview.data.quote_required && selectedCommercialOffer ? (
                  <EnterpriseCapacityEditor
                    fields={isEmc ? emcCapacityFields : workspaceCapacityFields}
                    values={requestedCapacity}
                    notes={requestNotes}
                    onValueChange={(key, value) =>
                      setRequestedCapacity((current) => ({
                        ...current,
                        [key]: value,
                      }))
                    }
                    onNotesChange={setRequestNotes}
                  />
                ) : null}
                <div
                  className={`${preview.data.quote_required ? "mt-5 " : ""}flex flex-wrap items-end justify-between gap-4`}
                >
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                      Price preview · {preview.data.price_book_version}
                    </p>
                    <p className="mt-2 text-3xl font-semibold">
                      {inr(preview.data.total)}
                    </p>
                    <p className="text-sm text-[var(--text-secondary)]">
                      {inr(preview.data.subtotal)} before GST +{" "}
                      {inr(preview.data.gst)} GST
                    </p>
                  </div>
                  <Button
                    onClick={continueWithSelection}
                    disabled={
                      checkout.isPending ||
                      commercialRequest.isPending ||
                      (preview.data.quote_required &&
                        requestedCapacityCount === 0)
                    }
                  >
                    {preview.data.quote_required
                      ? "Request quotation"
                      : checkout.isPending
                        ? "Creating invoice…"
                        : "Create checkout invoice"}
                  </Button>
                </div>
                {checkout.data ? (
                  <p className="mt-3 text-xs text-[var(--text-secondary)]">
                    Invoice created ({checkout.data.invoice_id}). Complete
                    payment from Billing to activate the contract.
                  </p>
                ) : null}
                {commercialRequest.data ? (
                  <p className="mt-3 text-xs text-[var(--text-secondary)]">
                    Request submitted ({commercialRequest.data.id}) and awaiting
                    Command Center review.
                  </p>
                ) : null}
              </div>
            ) : null}
          </Panel>
          {!isEmc && venueOffers.length ? (
            <Panel
              title="Venue plans"
              description="Approved EventOS venue packages are quotation-routed so device scope, concurrency and deployment dates are reviewed before activation."
            >
              <label className="mb-4 flex max-w-md flex-col gap-2 text-xs font-medium text-[var(--text-secondary)]">
                Event for per-event venue offers
                <select
                  value={selectedCapacityEvent}
                  onChange={(event) =>
                    setSelectedCapacityEvent(event.target.value)
                  }
                  className="h-10 rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 text-sm text-[var(--text-primary)]"
                >
                  <option value="">Select an event</option>
                  {eventList.map((event: any) => (
                    <option key={event.id} value={event.id}>
                      {event.name || event.title || event.id}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {venueOffers.map((offer) => {
                  const eventScoped = ["PER_EVENT", "ONE_TIME"].includes(
                    offer.prices[0]?.billing_interval,
                  );
                  return (
                    <VenueOfferCard
                      key={offer.code}
                      offer={offer}
                      pending={commercialRequest.isPending}
                      disabled={eventScoped && !selectedCapacityEvent}
                      onRequest={() => requestVenueOffer(offer)}
                    />
                  );
                })}
              </div>
            </Panel>
          ) : null}
          {!isEmc && venueAddons.length ? (
            <Panel
              title="Venue applications & services"
              description="Optional moderator, ePoster, signage, Live Q&A and setup-day services from the approved catalogue."
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {venueAddons.map((offer) => (
                  <VenueOfferCard
                    key={offer.code}
                    offer={offer}
                    pending={commercialRequest.isPending}
                    disabled={!selectedCapacityEvent}
                    onRequest={() => requestVenueOffer(offer)}
                  />
                ))}
              </div>
            </Panel>
          ) : null}
        </div>
      ) : null}
      {view === "events" ? (
        <Panel
          title="Event plans"
          description="Every event has an independent Event plan and capacity allocation."
        >
          {contracts.isLoading || events.isLoading ? (
            <div className="op-unavailable">Loading event plans…</div>
          ) : contracts.isError || events.isError ? (
            <Unavailable>Event commercial data is unavailable.</Unavailable>
          ) : eventList.length === 0 ? (
            <div className="op-unavailable">
              No events are available for commercial planning.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-xs uppercase tracking-wide text-[var(--text-secondary)]">
                    <th className="pb-3">Event</th>
                    <th className="pb-3">Event plan</th>
                    <th className="pb-3">Registrations</th>
                    <th className="pb-3">Abstracts</th>
                    <th className="pb-3">Speakers</th>
                    <th className="pb-3">Email</th>
                    <th className="pb-3">Expiry</th>
                    <th className="pb-3" />
                  </tr>
                </thead>
                <tbody>
                  {eventList.map((event: any) => {
                    const eventItems = contractItems.filter(
                      (item: any) => item.event_id === event.id,
                    );
                    const eventUsage = items.filter(
                      (item: any) => item.event_id === event.id,
                    );
                    const byKey = (key: string) =>
                      eventUsage.find(
                        (item: any) => item.entitlement_key === key,
                      );
                    const plan = eventItems.find(
                      (item: any) => item.product_family === "EVENT",
                    );
                    const contract = contracts.data?.find((candidate: any) =>
                      candidate.items?.some((candidateItem: any) =>
                        eventItems.some(
                          (eventItem: any) => candidateItem.id === eventItem.id,
                        ),
                      ),
                    );
                    return (
                      <tr
                        key={event.id}
                        className="border-b border-[var(--border-subtle)]"
                      >
                        <td className="py-3 font-medium">
                          {event.name || event.title || event.id}
                        </td>
                        <td className="py-3">
                          {plan?.display_name || plan?.offer_code || "Not assigned"}
                        </td>
                        <td className="py-3">
                          {byKey("registrations")?.consumed ?? "—"}
                        </td>
                        <td className="py-3">
                          {byKey("abstracts")?.consumed ?? "—"}
                        </td>
                        <td className="py-3">
                          {byKey("speakers")?.consumed ?? "—"}
                        </td>
                        <td className="py-3">
                          {byKey("event_email_credits")?.consumed ?? "—"}
                        </td>
                        <td className="py-3 text-[var(--text-secondary)]">
                          {contract?.ends_at
                            ? new Date(contract.ends_at).toLocaleDateString()
                            : "—"}
                        </td>
                        <td className="py-3">
                          <Link
                            className="text-[var(--acc)] hover:underline"
                            href={`/events/${event.id}/commercial`}
                          >
                            Manage
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}
      {view === "capacity" ? (
        <div className="space-y-4">
          <Panel
            title="Capacity add-ons"
            description="Event bundles are purchased for a specific event. EMC bundles are quote-based and are added to the annual pooled contract after approval."
          >
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <label className="text-sm text-[var(--text-secondary)]">
                Event capacity target
                <select
                  value={selectedCapacityEvent}
                  onChange={(event) =>
                    setSelectedCapacityEvent(event.target.value)
                  }
                  className="input ml-2 h-9 rounded-md px-3 text-sm"
                >
                  <option value="">Select an event</option>
                  {eventList.map((event: any) => (
                    <option key={event.id} value={event.id}>
                      {event.name || event.title || event.id}
                    </option>
                  ))}
                </select>
              </label>
              {events.isError ? (
                <span className="text-xs text-[var(--danger)]">
                  Events unavailable; event add-ons cannot be assigned.
                </span>
              ) : null}
            </div>
            <div
              className="commercial-category-tabs mb-4"
              role="tablist"
              aria-label="Capacity add-on categories"
            >
              {[
                { id: "all", label: "All add-ons", icon: Layers3 },
                { id: "registrations", label: "Registrations", icon: Users },
                { id: "abstracts", label: "Abstracts", icon: FileText },
                { id: "speakers", label: "Speakers", icon: Mic },
                { id: "storage", label: "Storage", icon: HardDrive },
                { id: "email", label: "Email", icon: Mail },
              ].map((category) => {
                const Icon = category.icon;
                const count =
                  category.id === "all"
                    ? capacityOffers.length
                    : capacityOffers.filter((o) =>
                        o.code.includes(category.id.toUpperCase()),
                      ).length;
                return (
                  <button
                    key={category.id}
                    type="button"
                    role="tab"
                    aria-selected={capacityCategory === category.id}
                    className={
                      capacityCategory === category.id ? "is-active" : ""
                    }
                    onClick={() => setCapacityCategory(category.id)}
                  >
                    <Icon className="size-3.5" />
                    {category.label}
                    <span className="ml-1 opacity-70">({count})</span>
                  </button>
                );
              })}
            </div>
            <div className="space-y-2">
              {visibleCapacityOffers.map((offer) => {
                const eventScoped = offer.scope_type === "EVENT";
                const price = offer.prices.find(
                  (item) => item.billing_interval === "ONE_TIME",
                );
                const requestQuote = () =>
                  commercialRequest.mutate({
                    account_type: "EMC",
                    capacity_addon_codes: [offer.code],
                    events: [],
                    request_type: "CUSTOM_CAPACITY",
                    reason: `Request for ${offer.display_name}`,
                  });
                const buy = () =>
                  capacityPurchase.mutate({
                    account_type: "ORGANIZER",
                    capacity_addon_codes: [],
                    events: [
                      {
                        event_id: selectedCapacityEvent,
                        capacity_addon_codes: [offer.code],
                      },
                    ],
                    billing_profile: {},
                    auto_renew: false,
                  });

                const badgeMatch = offer.display_name.match(
                  /(\+\d+[\w,.]*|\d+[\w\s–-]+screens?|\d+[\w\s–-]+devices?)/i,
                );
                const badge = badgeMatch ? badgeMatch[1] : null;

                let Icon = Sparkles;
                if (offer.code.includes("REGISTRATIONS")) Icon = Users;
                else if (offer.code.includes("ABSTRACTS")) Icon = FileText;
                else if (offer.code.includes("SPEAKERS")) Icon = Mic;
                else if (offer.code.includes("STORAGE")) Icon = HardDrive;
                else if (offer.code.includes("EMAIL")) Icon = Mail;

                const isPending =
                  eventScoped
                    ? capacityPurchase.isPending
                    : commercialRequest.isPending;

                return (
                  <div
                    key={offer.code}
                    className="group flex items-center justify-between gap-3 p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-primary)] hover:border-[var(--border-default)] hover:bg-[var(--surface-secondary)]/50 transition-all duration-150"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <strong className="text-sm font-semibold text-[var(--text-primary)] truncate">
                            {offer.display_name}
                          </strong>
                          {badge ? (
                            <span className="rounded-full bg-[var(--surface-secondary)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                              {badge}
                            </span>
                          ) : null}
                          <span className="rounded-full bg-[var(--surface-secondary)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)] border border-[var(--border-subtle)]">
                            {eventScoped ? "Event capacity" : "EMC pooled"}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
                          {offer.description || "Capacity bundle"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3.5 shrink-0">
                      <div className="text-right">
                        <span className="text-sm font-bold font-mono text-[var(--text-primary)]">
                          {offer.is_quote_only || !price
                            ? "Custom quote"
                            : inr(price.amount)}
                        </span>
                        <span className="block text-[10px] text-[var(--text-muted)]">
                          {eventScoped ? "Per event" : "Annual pool"}
                        </span>
                      </div>

                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full h-8 px-3 text-xs font-semibold"
                        disabled={
                          eventScoped
                            ? !selectedCapacityEvent ||
                              isEmc ||
                              capacityPurchase.isPending
                            : !isEmc || commercialRequest.isPending
                        }
                        onClick={eventScoped ? buy : requestQuote}
                      >
                        {isPending ? (
                          "Processing…"
                        ) : eventScoped ? (
                          <>
                            <Plus className="h-3.5 w-3.5 mr-1" /> Buy
                          </>
                        ) : (
                          "Quote"
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
          <Panel
            title="Purchased capacity"
            description="Historical purchases retain their offer version and expiry."
          >
            {purchases.isLoading ? (
              <div className="op-unavailable">Loading capacity purchases…</div>
            ) : purchases.isError ? (
              <Unavailable>
                Capacity purchase history is unavailable.
              </Unavailable>
            ) : (purchases.data || []).length === 0 ? (
              <div className="op-unavailable">
                No capacity purchases are available.
              </div>
            ) : (
              <div className="space-y-2">
                {(purchases.data || []).map((purchase: any) => (
                  <div
                    key={`${purchase.contract_id}-${purchase.item_id}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] p-3 text-sm"
                  >
                    <span>
                      {purchase.offer_code} · quantity {purchase.quantity}
                    </span>
                    <span className="text-[var(--text-secondary)]">
                      {purchase.contract_status} · expires{" "}
                      {purchase.ends_at
                        ? new Date(purchase.ends_at).toLocaleDateString()
                        : "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      ) : null}
      {view === "usage" ? (
        <Panel
          title="Usage & Capacity Allocations"
          description="Authoritative commercial usage across Organisation, Events, and Venue operations, with dedicated per-event tracking."
        >
          {usage.isLoading ? (
            <div className="op-unavailable">Loading commercial allocations…</div>
          ) : usage.isError ? (
            <Unavailable>Usage data is unavailable.</Unavailable>
          ) : (
            <div className="space-y-6">
              {/* Category Filter Tabs & Event Search Bar */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
                <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[var(--bg-surface-2)] rounded-xl border border-[var(--border-subtle)]">
                  {[
                    { id: "all", label: "All Usage", icon: Layers3 },
                    { id: "organisation", label: "Organisation", icon: Building2 },
                    { id: "event", label: "Event", icon: CalendarDays },
                    { id: "venue", label: "Venue", icon: MapPin },
                    { id: "event-wise", label: "Event-Wise Breakdown", icon: Sliders },
                  ].map((tab) => {
                    const Icon = tab.icon;
                    const isActive = usageCategory === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setUsageCategory(tab.id as any)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          isActive
                            ? "bg-[var(--op-primary)] text-white shadow-xs"
                            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-3)]"
                        }`}
                      >
                        <Icon className="size-3.5" />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {(usageCategory === "all" || usageCategory === "event-wise") && allEvents.length > 0 && (
                  <div className="relative min-w-[240px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[var(--text-tertiary)]" />
                    <input
                      type="text"
                      value={eventSearch}
                      onChange={(e) => setEventSearch(e.target.value)}
                      placeholder="Search event by name or code…"
                      className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] pl-8 pr-3 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--op-primary)] focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {/* 1. ORGANISATION USAGE CATEGORY */}
              {(usageCategory === "all" || usageCategory === "organisation") && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
                        <Building2 className="size-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-[var(--text-primary)]">
                          Organisation Usage
                        </h3>
                        <p className="text-xs text-[var(--text-secondary)]">
                          Workspace-wide limits, concurrent event limits, team seats, and shared storage.
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-medium text-[var(--text-tertiary)]">
                      {organisationItems.length} allocation{organisationItems.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <MetricCard
                      label="Active Events"
                      value={String(orgMetrics.activeEvents)}
                      icon={<CalendarDays className="size-4" />}
                      tone="blue"
                      hint={`${orgMetrics.totalEvents} total created`}
                    />
                    <MetricCard
                      label="Team Members"
                      value={String(orgMetrics.teamMembers)}
                      icon={<Users className="size-4" />}
                      tone="purple"
                      hint="Active workspace seats"
                    />
                    <MetricCard
                      label="Workspace Storage"
                      value={`${orgMetrics.storageUsedGb} GB`}
                      icon={<HardDrive className="size-4" />}
                      tone="green"
                      hint={
                        orgMetrics.storageMaxGb
                          ? `of ${orgMetrics.storageMaxGb} GB pooled capacity`
                          : "Pooled workspace capacity"
                      }
                    />
                  </div>

                  {organisationItems.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      {organisationItems.map((item: any) => {
                        const consumed = Number(item.consumed || 0) + Number(item.reserved || 0);
                        const total = Number(item.total || 0);
                        const percent = total > 0 ? Math.min(100, Math.round((consumed / total) * 100)) : 0;
                        const isHigh = percent >= 80 && percent < 100;
                        const isFull = percent >= 100;

                        return (
                          <div
                            key={item.id}
                            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-4 flex flex-col justify-between"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-sm text-[var(--text-primary)]">
                                  {titleCaseLabel(item.entitlement_key)}
                                </p>
                                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                                  {consumed} used or reserved of {total} {item.unit_type || ""}
                                </p>
                              </div>
                              <span
                                className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                                  isFull
                                    ? "bg-rose-500/10 text-rose-500"
                                    : isHigh
                                    ? "bg-amber-500/10 text-amber-500"
                                    : "bg-emerald-500/10 text-emerald-500"
                                }`}
                              >
                                {item.remaining} {item.unit_type || ""} left
                              </span>
                            </div>
                            <div className="mt-3">
                              <div className="flex items-center justify-between text-[11px] text-[var(--text-tertiary)] mb-1">
                                <span>Usage</span>
                                <span className="font-medium">{percent}%</span>
                              </div>
                              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-surface-3)]">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    isFull
                                      ? "bg-rose-500"
                                      : isHigh
                                      ? "bg-amber-500"
                                      : "bg-[var(--op-primary)]"
                                  }`}
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* 2. EVENT USAGE CATEGORY */}
              {(usageCategory === "all" || usageCategory === "event") && (
                <div className="space-y-4 pt-4 border-t border-[var(--border-subtle)]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                        <CalendarDays className="size-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-[var(--text-primary)]">
                          Event Usage (Aggregate)
                        </h3>
                        <p className="text-xs text-[var(--text-secondary)]">
                          Overall participant quotas, speaker limits, abstract submissions, and event media.
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-medium text-[var(--text-tertiary)]">
                      {eventItems.length} allocation{eventItems.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <MetricCard
                      label="Total Registrations"
                      value={String(eventMetrics.registrationsConsumed)}
                      icon={<Users className="size-4" />}
                      tone="green"
                      hint={
                        eventMetrics.registrationsTotal > 0
                          ? `of ${eventMetrics.registrationsTotal} allocated`
                          : "Across all events"
                      }
                    />
                    <MetricCard
                      label="Total Speakers"
                      value={String(eventMetrics.speakersConsumed)}
                      icon={<Mic className="size-4" />}
                      tone="amber"
                      hint={
                        eventMetrics.speakersTotal > 0
                          ? `of ${eventMetrics.speakersTotal} allocated`
                          : "Across all events"
                      }
                    />
                    <MetricCard
                      label="Total Abstracts"
                      value={String(eventMetrics.abstractsConsumed)}
                      icon={<FileText className="size-4" />}
                      tone="purple"
                      hint={
                        eventMetrics.abstractsTotal > 0
                          ? `of ${eventMetrics.abstractsTotal} allocated`
                          : "Submissions received"
                      }
                    />
                    <MetricCard
                      label="Event Storage"
                      value={`${eventMetrics.storageConsumedGb} GB`}
                      icon={<HardDrive className="size-4" />}
                      tone="blue"
                      hint={
                        eventMetrics.storageTotalGb > 0
                          ? `of ${eventMetrics.storageTotalGb} GB allocated`
                          : "Event assets & uploads"
                      }
                    />
                  </div>

                  {eventItems.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      {eventItems.map((item: any) => {
                        const consumed = Number(item.consumed || 0) + Number(item.reserved || 0);
                        const total = Number(item.total || 0);
                        const percent = total > 0 ? Math.min(100, Math.round((consumed / total) * 100)) : 0;
                        const isHigh = percent >= 80 && percent < 100;
                        const isFull = percent >= 100;

                        return (
                          <div
                            key={item.id}
                            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-4 flex flex-col justify-between"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-sm text-[var(--text-primary)]">
                                  {titleCaseLabel(item.entitlement_key)}
                                </p>
                                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                                  {consumed} used or reserved of {total} {item.unit_type || ""}
                                </p>
                              </div>
                              <span
                                className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                                  isFull
                                    ? "bg-rose-500/10 text-rose-500"
                                    : isHigh
                                    ? "bg-amber-500/10 text-amber-500"
                                    : "bg-emerald-500/10 text-emerald-500"
                                }`}
                              >
                                {item.remaining} {item.unit_type || ""} left
                              </span>
                            </div>
                            <div className="mt-3">
                              <div className="flex items-center justify-between text-[11px] text-[var(--text-tertiary)] mb-1">
                                <span>Usage</span>
                                <span className="font-medium">{percent}%</span>
                              </div>
                              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-surface-3)]">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    isFull
                                      ? "bg-rose-500"
                                      : isHigh
                                      ? "bg-amber-500"
                                      : "bg-[var(--op-primary)]"
                                  }`}
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* 3. VENUE USAGE CATEGORY */}
              {(usageCategory === "all" || usageCategory === "venue") && (
                <div className="space-y-4 pt-4 border-t border-[var(--border-subtle)]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500 border border-purple-500/20">
                        <MapPin className="size-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-[var(--text-primary)]">
                          Venue & Onsite Allocations
                        </h3>
                        <p className="text-xs text-[var(--text-secondary)]">
                          Digital signage screens, interactive ePoster terminals, stage moderator controls, and technician days.
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-medium text-[var(--text-tertiary)]">
                      {venueItems.length} allocation{venueItems.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  {venueItems.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {venueItems.map((item: any) => {
                        const consumed = Number(item.consumed || 0) + Number(item.reserved || 0);
                        const total = Number(item.total || 0);
                        const percent = total > 0 ? Math.min(100, Math.round((consumed / total) * 100)) : 0;
                        const isHigh = percent >= 80 && percent < 100;
                        const isFull = percent >= 100;

                        return (
                          <div
                            key={item.id}
                            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-4 flex flex-col justify-between"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-sm text-[var(--text-primary)]">
                                  {titleCaseLabel(item.entitlement_key)}
                                </p>
                                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                                  {consumed} used or reserved of {total} {item.unit_type || "units"}
                                </p>
                              </div>
                              <span
                                className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                                  isFull
                                    ? "bg-rose-500/10 text-rose-500"
                                    : isHigh
                                    ? "bg-amber-500/10 text-amber-500"
                                    : "bg-emerald-500/10 text-emerald-500"
                                }`}
                              >
                                {item.remaining} left
                              </span>
                            </div>
                            <div className="mt-3">
                              <div className="flex items-center justify-between text-[11px] text-[var(--text-tertiary)] mb-1">
                                <span>Usage</span>
                                <span className="font-medium">{percent}%</span>
                              </div>
                              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-surface-3)]">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    isFull
                                      ? "bg-rose-500"
                                      : isHigh
                                      ? "bg-amber-500"
                                      : "bg-[var(--op-primary)]"
                                  }`}
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-5 text-center">
                      <Tv className="size-6 text-[var(--text-tertiary)] mx-auto mb-2" />
                      <p className="text-xs font-semibold text-[var(--text-primary)]">
                        No Active Venue Add-ons
                      </p>
                      <p className="text-[11px] text-[var(--text-secondary)] max-w-md mx-auto mt-1">
                        Venue add-ons deliver rich physical conference infrastructure including interactive ePoster kiosks, digital signage wall loops, stage moderator controls, and dedicated AV engineers.
                      </p>
                      <div className="mt-3">
                        <Button asChild size="sm" variant="outline">
                          <Link href="/commercial/capacity">
                            Explore Venue Add-ons <ArrowUpRight className="size-3.5 ml-1" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 4. EVENT-WISE BREAKDOWN (EVENT NAME FIRST) */}
              {(usageCategory === "all" || usageCategory === "event-wise") && (
                <div className="space-y-4 pt-4 border-t border-[var(--border-subtle)]">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
                        <Sliders className="size-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-[var(--text-primary)]">
                          Event-Wise Breakdown
                        </h3>
                        <p className="text-xs text-[var(--text-secondary)]">
                          Capacity meters and allocations displayed per event, with the event name first.
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-medium text-[var(--text-tertiary)]">
                      {filteredEvents.length} of {allEvents.length} event{allEvents.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  {filteredEvents.length === 0 ? (
                    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-8 text-center">
                      {eventSearch ? (
                        <p className="text-xs text-[var(--text-secondary)]">
                          No events found matching "{eventSearch}".
                        </p>
                      ) : (
                        <div>
                          <CalendarDays className="size-8 text-[var(--text-tertiary)] mx-auto mb-2" />
                          <p className="text-sm font-medium text-[var(--text-primary)]">No events found</p>
                          <p className="text-xs text-[var(--text-secondary)] mt-1">
                            Create your first event to track commercial allocations and capacity meters.
                          </p>
                          <Button asChild size="sm" className="mt-4">
                            <Link href="/events/new">Create Event</Link>
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {filteredEvents.map((ev: any) => {
                        const eventAllocations = itemsByEvent.get(ev.id) || [];
                        const eventCoreItems = eventAllocations.filter(
                          (item) => getUsageCategory(item) === "event",
                        );
                        const eventVenueItems = eventAllocations.filter(
                          (item) => getUsageCategory(item) === "venue",
                        );

                        // Format event dates
                        const eventDateStr = ev.dates
                          ? ev.dates
                          : ev.start_date
                          ? `${new Date(ev.start_date).toLocaleDateString("en-IN", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}${
                              ev.end_date
                                ? ` – ${new Date(ev.end_date).toLocaleDateString("en-IN", {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  })}`
                                : ""
                            }`
                          : null;

                        const venueLocStr =
                          ev.venue || ev.venue_name || ev.location || ev.city || null;

                        return (
                          <div
                            key={ev.id}
                            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-5 shadow-xs transition-colors hover:border-[var(--border-strong)] space-y-4"
                          >
                            {/* EVENT NAME FIRST IN PROMINENT HEADER */}
                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-[var(--border-subtle)] pb-3.5">
                              <div className="space-y-1.5">
                                <div className="flex flex-wrap items-center gap-2.5">
                                  <h3 className="text-base sm:text-lg font-bold text-[var(--text-primary)] tracking-tight">
                                    {ev.name}
                                  </h3>
                                  <StatusBadge status={ev.status || "DRAFT"} />
                                </div>
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
                                  {eventDateStr && (
                                    <span className="inline-flex items-center gap-1">
                                      <CalendarDays className="size-3.5 text-[var(--text-tertiary)]" />
                                      {eventDateStr}
                                    </span>
                                  )}
                                  {venueLocStr && (
                                    <span className="inline-flex items-center gap-1">
                                      <MapPin className="size-3.5 text-[var(--text-tertiary)]" />
                                      {venueLocStr}
                                    </span>
                                  )}
                                  {ev.short_code && (
                                    <span className="inline-flex items-center font-mono font-semibold px-2 py-0.5 rounded bg-[var(--bg-surface-3)] text-[11px] text-[var(--text-secondary)]">
                                      {ev.short_code}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 pt-1 sm:pt-0 shrink-0">
                                <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                                  <Link href={`/commercial/workspace?event=${ev.id}`}>
                                    Plan & Add-ons <ArrowUpRight className="size-3.5 ml-1" />
                                  </Link>
                                </Button>
                              </div>
                            </div>

                            {/* EVENT METERS GRID */}
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2.5">
                                Capacity & Limits
                              </p>
                              {eventCoreItems.length > 0 ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                  {eventCoreItems.map((item: any) => {
                                    const consumed =
                                      Number(item.consumed || 0) + Number(item.reserved || 0);
                                    const total = Number(item.total || 0);
                                    const percent =
                                      total > 0
                                        ? Math.min(100, Math.round((consumed / total) * 100))
                                        : 0;
                                    const isHigh = percent >= 80 && percent < 100;
                                    const isFull = percent >= 100;

                                    return (
                                      <div
                                        key={item.id}
                                        className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-3 flex flex-col justify-between"
                                      >
                                        <div>
                                          <div className="flex items-center justify-between gap-1.5">
                                            <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                                              {titleCaseLabel(item.entitlement_key)}
                                            </span>
                                            <span
                                              className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                                                isFull
                                                  ? "bg-rose-500/10 text-rose-500"
                                                  : isHigh
                                                  ? "bg-amber-500/10 text-amber-500"
                                                  : "bg-emerald-500/10 text-emerald-500"
                                              }`}
                                            >
                                              {item.remaining} {item.unit_type || ""} left
                                            </span>
                                          </div>
                                          <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                                            {consumed} of {total} {item.unit_type || ""} used
                                          </p>
                                        </div>

                                        <div className="mt-2.5">
                                          <div className="flex items-center justify-between text-[10px] text-[var(--text-tertiary)] mb-1">
                                            <span>Capacity</span>
                                            <span>{percent}%</span>
                                          </div>
                                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-surface-3)]">
                                            <div
                                              className={`h-full rounded-full transition-all ${
                                                isFull
                                                  ? "bg-rose-500"
                                                  : isHigh
                                                  ? "bg-amber-500"
                                                  : "bg-[var(--op-primary)]"
                                              }`}
                                              style={{ width: `${percent}%` }}
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                /* Default baseline meters when no custom allocations exist */
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                  {/* Registrations */}
                                  {(() => {
                                    const consumed = Number(ev.registrations || 0);
                                    const total = 25;
                                    const percent = Math.min(100, Math.round((consumed / total) * 100));
                                    const remaining = Math.max(0, total - consumed);
                                    return (
                                      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-3 flex flex-col justify-between">
                                        <div>
                                          <div className="flex items-center justify-between gap-1.5">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                              <Users className="size-3.5 text-blue-500 shrink-0" />
                                              <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                                                Registrations
                                              </span>
                                            </div>
                                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 bg-emerald-500/10 text-emerald-500">
                                              {remaining} left
                                            </span>
                                          </div>
                                          <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                                            {consumed} of {total} participants used
                                          </p>
                                        </div>
                                        <div className="mt-2.5">
                                          <div className="flex items-center justify-between text-[10px] text-[var(--text-tertiary)] mb-1">
                                            <span>Free Tier Baseline</span>
                                            <span>{percent}%</span>
                                          </div>
                                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-surface-3)]">
                                            <div
                                              className="h-full rounded-full bg-[var(--op-primary)]"
                                              style={{ width: `${percent}%` }}
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })()}

                                  {/* Speakers */}
                                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-3 flex flex-col justify-between">
                                    <div>
                                      <div className="flex items-center justify-between gap-1.5">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                          <Mic className="size-3.5 text-amber-500 shrink-0" />
                                          <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                                            Speakers
                                          </span>
                                        </div>
                                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 bg-emerald-500/10 text-emerald-500">
                                          5 left
                                        </span>
                                      </div>
                                      <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                                        0 of 5 profiles used
                                      </p>
                                    </div>
                                    <div className="mt-2.5">
                                      <div className="flex items-center justify-between text-[10px] text-[var(--text-tertiary)] mb-1">
                                        <span>Free Tier Baseline</span>
                                        <span>0%</span>
                                      </div>
                                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-surface-3)]">
                                        <div className="h-full rounded-full bg-[var(--op-primary)]" style={{ width: "0%" }} />
                                      </div>
                                    </div>
                                  </div>

                                  {/* Abstracts */}
                                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-3 flex flex-col justify-between">
                                    <div>
                                      <div className="flex items-center justify-between gap-1.5">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                          <FileText className="size-3.5 text-purple-500 shrink-0" />
                                          <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                                            Abstracts
                                          </span>
                                        </div>
                                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 bg-emerald-500/10 text-emerald-500">
                                          5 left
                                        </span>
                                      </div>
                                      <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                                        0 of 5 records used
                                      </p>
                                    </div>
                                    <div className="mt-2.5">
                                      <div className="flex items-center justify-between text-[10px] text-[var(--text-tertiary)] mb-1">
                                        <span>Free Tier Baseline</span>
                                        <span>0%</span>
                                      </div>
                                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-surface-3)]">
                                        <div className="h-full rounded-full bg-[var(--op-primary)]" style={{ width: "0%" }} />
                                      </div>
                                    </div>
                                  </div>

                                  {/* Storage */}
                                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-3 flex flex-col justify-between">
                                    <div>
                                      <div className="flex items-center justify-between gap-1.5">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                          <HardDrive className="size-3.5 text-cyan-500 shrink-0" />
                                          <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                                            Storage
                                          </span>
                                        </div>
                                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 bg-emerald-500/10 text-emerald-500">
                                          1 GB left
                                        </span>
                                      </div>
                                      <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                                        0 of 1 GB used
                                      </p>
                                    </div>
                                    <div className="mt-2.5">
                                      <div className="flex items-center justify-between text-[10px] text-[var(--text-tertiary)] mb-1">
                                        <span>Free Tier Baseline</span>
                                        <span>0%</span>
                                      </div>
                                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-surface-3)]">
                                        <div className="h-full rounded-full bg-[var(--op-primary)]" style={{ width: "0%" }} />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* VENUE ADD-ONS SUB-SECTION FOR THIS EVENT */}
                            <div className="pt-2 border-t border-[var(--border-subtle)]">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                                  Venue Add-ons
                                </span>
                                {eventVenueItems.length > 0 && (
                                  <span className="text-[11px] text-[var(--text-tertiary)]">
                                    {eventVenueItems.length} active
                                  </span>
                                )}
                              </div>
                              {eventVenueItems.length > 0 ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                  {eventVenueItems.map((item: any) => {
                                    const consumed =
                                      Number(item.consumed || 0) + Number(item.reserved || 0);
                                    const total = Number(item.total || 0);
                                    const percent =
                                      total > 0
                                        ? Math.min(100, Math.round((consumed / total) * 100))
                                        : 0;

                                    return (
                                      <div
                                        key={item.id}
                                        className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-3"
                                      >
                                        <div className="flex items-center justify-between gap-1.5">
                                          <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                                            {titleCaseLabel(item.entitlement_key)}
                                          </span>
                                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-500">
                                            {item.remaining} left
                                          </span>
                                        </div>
                                        <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                                          {consumed} of {total} {item.unit_type || "units"} used
                                        </p>
                                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-surface-3)]">
                                          <div
                                            className="h-full rounded-full bg-purple-500"
                                            style={{ width: `${percent}%` }}
                                          />
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="flex items-center justify-between py-1 text-xs text-[var(--text-tertiary)]">
                                  <span>No venue add-ons assigned to this event.</span>
                                  <Link
                                    href={`/commercial/workspace?event=${ev.id}`}
                                    className="font-medium text-[var(--op-primary)] hover:underline inline-flex items-center gap-1"
                                  >
                                    Add Venue Capacity <ArrowUpRight className="size-3" />
                                  </Link>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </Panel>
      ) : null}
      {view === "requests" ? (
        <Panel
          title="Requests and quotations"
          description="Custom offers, EMC contracts and custom capacity are handled through Command Center approval."
        >
          {requests.isLoading ? (
            <div className="op-unavailable">Loading requests…</div>
          ) : requests.isError ? (
            <Unavailable>
              Commercial request history is unavailable.
            </Unavailable>
          ) : requestItems.length === 0 ? (
            <div className="op-unavailable">
              No commercial requests have been submitted.
            </div>
          ) : (
            <div className="space-y-3">
              {requestItems.map((request: any) => (
                <div
                  key={request.id}
                  className="rounded-xl border border-[var(--border-subtle)] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="font-medium">
                        {request.quote_reference ||
                          request.requested_offer_codes?.join(", ") ||
                          "Commercial request"}
                      </p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {request.product_family} ·{" "}
                        {request.request_type || "Offer or capacity request"} ·{" "}
                        {request.created_at
                          ? new Date(request.created_at).toLocaleDateString()
                          : "Date unavailable"}
                      </p>
                    </div>
                    <StatusBadge status={request.status || "PENDING"} />
                  </div>
                  <div className="mt-3 grid gap-2 border-t border-[var(--border-subtle)] pt-3 text-xs text-[var(--text-secondary)] sm:grid-cols-3">
                    <span>
                      Quote:{" "}
                      <strong className="text-[var(--text-primary)]">
                        {request.quote_status || "Not issued"}
                      </strong>
                    </span>
                    <span>
                      Payment:{" "}
                      <strong className="text-[var(--text-primary)]">
                        {request.payment_state || "Not created"}
                      </strong>
                    </span>
                    <span>
                      Next:{" "}
                      <strong className="text-[var(--text-primary)]">
                        {String(request.next_action || "AWAIT_REVIEW")
                          .replaceAll("_", " ")
                          .toLowerCase()}
                      </strong>
                    </span>
                  </div>
                  {request.quote_valid_until ? (
                    <p className="mt-2 text-xs text-[var(--text-secondary)]">
                      Quote valid until{" "}
                      {new Date(request.quote_valid_until).toLocaleDateString()}
                    </p>
                  ) : null}
                  {request.quote_status === "DRAFT" &&
                  request.status === "QUOTE_ISSUED" ? (
                    <div className="mt-3">
                      <Button
                        size="sm"
                        disabled={acceptQuote.isPending}
                        onClick={() =>
                          acceptQuote.mutate({
                            requestId: request.id,
                            expectedVersion: request.version,
                          })
                        }
                      >
                        {acceptQuote.isPending
                          ? "Accepting quote…"
                          : "Accept quote"}
                      </Button>
                    </div>
                  ) : null}
                  {request.last_response ? (
                    <p className="mt-2 rounded-lg bg-[var(--bg-surface-2)] p-3 text-xs text-[var(--text-primary)]">
                      {request.last_response}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}
      {view === "history" ? (
        <Panel
          title="Commercial history"
          description="Historical contract and offer versions remain immutable for audit and billing."
        >
          {contracts.isLoading ? (
            <div className="op-unavailable">Loading history…</div>
          ) : contracts.isError ? (
            <Unavailable>Commercial history is unavailable.</Unavailable>
          ) : (contracts.data || []).length === 0 ? (
            <div className="op-unavailable">
              No contract history is available.
            </div>
          ) : (
            <div className="space-y-3">
              {(contracts.data || []).map((contract: any) => (
                <div
                  key={contract.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--border-subtle)] p-4"
                >
                  <div>
                    <p className="font-medium">
                      {contract.contract_type} contract
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Started{" "}
                      {new Date(contract.starts_at).toLocaleDateString()} ·
                      version {contract.version ?? "—"}
                    </p>
                    {contract.cancel_at_period_end ? (
                      <p className="mt-1 text-xs text-[var(--warning)]">
                        Scheduled to end{" "}
                        {contract.ends_at
                          ? new Date(contract.ends_at).toLocaleDateString()
                          : "at renewal"}
                        .
                      </p>
                    ) : null}
                    {cancelContract.isError ? (
                      <p className="mt-1 text-xs text-[var(--danger)]">
                        Cancellation could not be scheduled. Refresh and try
                        again.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={contract.status} />
                    {contract.status === "ACTIVE" &&
                    !contract.cancel_at_period_end ? (
                      <Button
                        variant="outline"
                        disabled={cancelContract.isPending}
                        onClick={() => {
                          const reason = window.prompt(
                            "Why should this contract end at renewal? (minimum 5 characters)",
                          );
                          if (reason && reason.trim().length >= 5)
                            cancelContract.mutate({
                              contractId: contract.id,
                              expectedVersion: Number(contract.version),
                              reason: reason.trim(),
                            });
                        }}
                      >
                        {cancelContract.isPending
                          ? "Scheduling…"
                          : "Cancel at renewal"}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}
      {view === "workspace" && !isEmc ? (
        <CommercialPlanCatalogue
          offers={catalog.data || []}
          events={eventList}
          contracts={contracts.data || []}
          hasActiveWorkspacePlan={(contracts.data || []).some(
            (contract: any) =>
              contract.contract_type === "WORKSPACE" &&
              contract.status === "ACTIVE",
          )}
        />
      ) : null}
      {view === "workspace" &&
      !isEmc &&
      eventOffers.length === 0 &&
      !catalog.isLoading ? (
        <div className="mt-4 text-xs text-[var(--text-secondary)]">
          Event catalogue is currently unavailable.
        </div>
      ) : null}
    </OrganiserSection>
  );
}
