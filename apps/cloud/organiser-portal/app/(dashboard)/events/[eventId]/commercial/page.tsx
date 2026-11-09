"use client";

import Link from "next/link";
import { use, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  FileText,
  Gauge,
  HardDrive,
  Layers3,
  Loader2,
  Mail,
  Mic,
  Plus,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, StatusBadge } from "@/components/organizer/workspace/OrganiserPrimitives";
import { useEvent } from "@/hooks/useEvents";
import { useCloudCapacityPurchase, useCloudCatalog, useCloudCheckout, useCloudCommercialRequest, useCloudContracts, useCloudPricingPreview, useCloudUsage } from "@/hooks/useCloudCommercial";
import { EnterpriseCapacityEditor, type CapacityField } from "@/components/organizer/commercial/EnterpriseCapacityEditor";

const eventCapacityFields: CapacityField[] = [
  { key: "registrations", label: "Registrations", unit: "submitted registrations" },
  { key: "abstracts", label: "Abstracts", unit: "submitted abstracts" },
  { key: "speakers", label: "Speakers", unit: "speaker profiles" },
  { key: "storage_gb", label: "Storage", unit: "GB" },
  { key: "event_email_credits", label: "Event email capacity", unit: "recipients" },
];

export default function EventCommercialPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  const event = useEvent(eventId);
  const contracts = useCloudContracts();
  const usage = useCloudUsage(eventId);
  const catalog = useCloudCatalog("CAPACITY_ADDON");
  const eventCatalog = useCloudCatalog("EVENT");
  const purchase = useCloudCapacityPurchase();
  const checkout = useCloudCheckout();
  const request = useCloudCommercialRequest();
  const planPreview = useCloudPricingPreview();
  const [selectedPlan, setSelectedPlan] = useState<string>("");
  const [requestedCapacity, setRequestedCapacity] = useState<Record<string, string>>({});
  const [requestNotes, setRequestNotes] = useState("");
  const [addonCategory, setAddonCategory] = useState("all");
  const eventItem = useMemo(() => (contracts.data || []).flatMap((contract: any) => (contract.items || []).map((item: any) => ({ ...item, contract }))).find((item: any) => item.event_id === eventId && item.offer_code), [contracts.data, eventId]);
  const eventAddons = (catalog.data || []).filter((offer: any) => offer.scope_type === "EVENT");
  const visibleEventAddons = useMemo(() => {
    if (addonCategory === "all") return eventAddons;
    return eventAddons.filter((offer: any) =>
      offer.code.includes(addonCategory.toUpperCase()),
    );
  }, [eventAddons, addonCategory]);
  const eventPlans = eventCatalog.data || [];
  const buyAddon = (code: string) => purchase.mutate({ account_type: "ORGANIZER", events: [{ event_id: eventId, capacity_addon_codes: [code] }] });
  const choosePlan = (code: string) => {
    setSelectedPlan(code);
    const offer = eventPlans.find((item: any) => item.code === code);
    setRequestedCapacity(Object.fromEntries((offer?.entitlements || []).filter((item: any) => Number(item.quantity) > 0).map((item: any) => [item.key, String(item.quantity)])));
    setRequestNotes("");
    planPreview.mutate({ account_type: "ORGANIZER", events: [{ event_id: eventId, offer_code: code }] });
  };
  const continueWithPlan = () => {
    const offer = eventPlans.find((item: any) => item.code === selectedPlan);
    if (!offer) return;
    const payload = { account_type: "ORGANIZER", events: [{ event_id: eventId, offer_code: offer.code }], auto_renew: false };
    if (offer.is_quote_only || planPreview.data?.quote_required) {
      const capacity = Object.fromEntries(Object.entries(requestedCapacity).filter(([, value]) => Number(value) > 0).map(([key, value]) => [key, Number(value)]));
      request.mutate({ ...payload, requested_capacity: capacity, requirements: requestNotes.trim() ? { notes: requestNotes.trim() } : {}, request_type: "ENTERPRISE", reason: `Request for ${offer.display_name} for event ${eventId}` });
    } else {
      checkout.mutate(payload);
    }
  };
  const requestedCapacityCount = Object.values(requestedCapacity).filter((value) => Number(value) > 0).length;
  const primaryError = event.error || contracts.error || usage.error;
  const errorStatus = (primaryError as { status?: number } | undefined)?.status;
  const hasRefreshingSnapshot = [event, contracts, usage, catalog, eventCatalog].some((query) => query.isFetching && query.data !== undefined);

  return <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
    <Link href="/commercial/events" className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><ArrowLeft className="size-4" />Back to Event plans</Link>
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">Event commercial</p><h1 className="mt-2 text-3xl font-semibold text-[var(--text-primary)]">{event.data?.name || "Event"}</h1><p className="mt-2 text-sm text-[var(--text-secondary)]">Plan version, capacity usage, add-ons and expiry for this event.</p></div>{eventItem ? <StatusBadge status={eventItem.contract.status} /> : null}</div>
    {event.isLoading || contracts.isLoading || usage.isLoading ? <div className="op-unavailable" role="status">Loading event commercial details…</div> : null}
    {event.isError || contracts.isError || usage.isError ? <div className="op-unavailable">{errorStatus === 401 || errorStatus === 403 ? "You do not have permission to view this event’s commercial details." : "Event commercial details are unavailable."}</div> : null}
    {hasRefreshingSnapshot ? <div className="rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/5 px-3 py-2 text-xs text-[var(--text-secondary)]" role="status">Refreshing commercial data. Values shown may be briefly stale until the latest response arrives.</div> : null}
    <Panel title="Choose an Event plan" description="Event plans are scoped to this event and expire with its commercial term.">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{eventPlans.map((offer: any) => { const price = offer.prices.find((row: any) => row.billing_interval === "PER_EVENT"); return <button key={offer.code} type="button" onClick={() => choosePlan(offer.code)} className={`rounded-xl border p-4 text-left ${selectedPlan === offer.code ? "border-[var(--acc)] bg-[var(--bg-surface-2)]" : "border-[var(--border-subtle)]"}`}><p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">{offer.is_quote_only ? "Quote required" : "Per event"}</p><p className="mt-2 font-semibold">{offer.display_name}</p><p className="mt-2 text-sm text-[var(--text-secondary)]">{offer.is_quote_only ? "Custom capacity and terms" : price ? `₹${Number(price.amount).toLocaleString("en-IN")} before GST` : "Price unavailable"}</p></button>; })}</div>
      {planPreview.isPending ? <div className="op-unavailable mt-4" role="status">Calculating Event plan…</div> : null}
      {planPreview.data ? <div className="mt-4 rounded-xl border border-[var(--acc)] bg-[var(--bg-surface-2)] p-4">{planPreview.data.quote_required ? <EnterpriseCapacityEditor fields={eventCapacityFields} values={requestedCapacity} notes={requestNotes} onValueChange={(key, value) => setRequestedCapacity((current) => ({ ...current, [key]: value }))} onNotesChange={setRequestNotes} /> : null}<div className={`${planPreview.data.quote_required ? "mt-5 " : ""}flex flex-wrap items-center justify-between gap-4`}><div><p className="text-sm font-semibold">{planPreview.data.quote_required ? "Quotation required" : `Total ${new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(planPreview.data.total))}`}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">{new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(planPreview.data.subtotal))} before GST + {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(planPreview.data.gst))} GST</p></div><Button onClick={continueWithPlan} disabled={checkout.isPending || request.isPending || (planPreview.data.quote_required && requestedCapacityCount === 0)}>{planPreview.data.quote_required ? "Request quotation" : checkout.isPending ? "Creating invoice…" : "Create checkout invoice"}</Button></div></div> : null}
      {checkout.data ? <p className="mt-3 text-xs text-[var(--text-secondary)]">Invoice {checkout.data.invoice_id} created. Complete payment from Billing to activate the Event plan.</p> : null}
      {request.data ? <p className="mt-3 text-xs text-[var(--text-secondary)]">Commercial request {request.data.id} submitted for Command Center review.</p> : null}
    </Panel>
    <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
      <Panel title="Current plan"><div className="space-y-3 text-sm"><div className="flex items-center justify-between"><span className="text-[var(--text-secondary)]">Plan</span><span className="font-medium">{eventItem?.offer_code || "Not assigned"}</span></div><div className="flex items-center justify-between"><span className="text-[var(--text-secondary)]">Version</span><span>{eventItem?.offer_version_id || "—"}</span></div><div className="flex items-center justify-between"><span className="text-[var(--text-secondary)]">Expires</span><span>{eventItem?.contract?.ends_at ? new Date(eventItem.contract.ends_at).toLocaleDateString() : "—"}</span></div></div></Panel>
      <Panel title="Current usage"><div className="space-y-3">{(usage.data?.items || []).length === 0 ? <div className="op-unavailable">No active commercial allocations are available.</div> : (usage.data?.items || []).map((item: any) => { const used = item.consumed + item.reserved; const percent = item.total ? Math.min(100, Math.round((used / item.total) * 100)) : 0; return <div key={item.id}><div className="flex items-center justify-between text-sm"><span>{item.entitlement_key.replaceAll("_", " ")}</span><span className="font-medium">{item.remaining} remaining</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--bg-surface-3)]"><div className="h-full rounded-full bg-[var(--acc)]" style={{ width: `${percent}%` }} /></div><p className="mt-1 text-xs text-[var(--text-secondary)]">{used} used or reserved of {item.total}</p></div>; })}</div></Panel>
    </div>
    <Panel title="Add event capacity" description="Paid bundles are added as separate immutable contract items and expire with this event entitlement.">
      <div className="commercial-category-tabs mb-4" role="tablist" aria-label="Event add-on categories">
        {[
          { id: "all", label: "All add-ons", icon: Layers3 },
          { id: "registrations", label: "Registrations", icon: Users },
          { id: "abstracts", label: "Abstracts", icon: FileText },
          { id: "speakers", label: "Speakers", icon: Mic },
          { id: "storage", label: "Storage", icon: HardDrive },
          { id: "email", label: "Email", icon: Mail },
        ].map((category) => {
          const Icon = category.icon;
          const count = category.id === "all" ? eventAddons.length : eventAddons.filter((o: any) => o.code.includes(category.id.toUpperCase())).length;
          return (
            <button
              key={category.id}
              type="button"
              role="tab"
              aria-selected={addonCategory === category.id}
              className={addonCategory === category.id ? "is-active" : ""}
              onClick={() => setAddonCategory(category.id)}
            >
              <Icon className="size-3.5" />
              {category.label}
              <span className="ml-1 opacity-70">({count})</span>
            </button>
          );
        })}
      </div>
      <div className="space-y-2">
        {visibleEventAddons.map((offer: any) => {
          const price = offer.prices.find((row: any) => row.billing_interval === "ONE_TIME");
          const badgeMatch = offer.display_name.match(/(\+\d+[\w,.]*|\d+[\w\s–-]+screens?|\d+[\w\s–-]+devices?)/i);
          const badge = badgeMatch ? badgeMatch[1] : null;

          let Icon = Sparkles;
          if (offer.code.includes("REGISTRATIONS")) Icon = Users;
          else if (offer.code.includes("ABSTRACTS")) Icon = FileText;
          else if (offer.code.includes("SPEAKERS")) Icon = Mic;
          else if (offer.code.includes("STORAGE")) Icon = HardDrive;
          else if (offer.code.includes("EMAIL")) Icon = Mail;

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
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
                    {offer.description || "Capacity bundle"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3.5 shrink-0">
                <div className="text-right">
                  <span className="text-sm font-bold font-mono text-[var(--text-primary)]">
                    {price ? `₹${Number(price.amount).toLocaleString("en-IN")}` : "Custom quote"}
                  </span>
                  <span className="block text-[10px] text-[var(--text-muted)]">
                    Per event
                  </span>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full h-8 px-3 text-xs font-semibold"
                  disabled={purchase.isPending || !price}
                  onClick={() => buyAddon(offer.code)}
                >
                  {purchase.isPending ? "Creating invoice…" : <><Plus className="h-3.5 w-3.5 mr-1" />Add capacity</>}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      {purchase.data ? <p className="mt-4 text-xs text-[var(--text-secondary)]">Invoice {purchase.data.invoice_id} created. Complete payment from Billing to activate the add-on.</p> : null}
    </Panel>
  </main>;
}
