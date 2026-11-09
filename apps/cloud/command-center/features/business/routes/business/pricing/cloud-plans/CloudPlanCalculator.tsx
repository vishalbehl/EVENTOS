"use client";

import { useMemo, useState } from "react";
import { Calculator, Check, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useCloudPricingConfigurations,
  useCloudPricingPreview,
  useCreateCloudCommercialRequest,
  useSaveCloudPricingConfiguration,
  type CloudCommercialOffer,
  type CloudPricingPreviewRequest,
} from "@/services/super-admin-service";

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

interface EventSelection {
  key: string;
  eventId: string;
  offerCode: string;
  capacityAddonCodes: string[];
}

const emptyEventSelection = (): EventSelection => ({
  key: `event-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  eventId: "",
  offerCode: "",
  capacityAddonCodes: [],
});

export function CloudPlanCalculator({ offers }: { offers: CloudCommercialOffer[] }) {
  const preview = useCloudPricingPreview();
  const configurations = useCloudPricingConfigurations();
  const saveConfiguration = useSaveCloudPricingConfiguration();
  const createRequest = useCreateCloudCommercialRequest();
  const [accountType, setAccountType] = useState<"ORGANIZER" | "EMC">("ORGANIZER");
  const [workspaceCode, setWorkspaceCode] = useState("");
  const [emcCode, setEmcCode] = useState("");
  const [billingInterval, setBillingInterval] = useState("ANNUAL");
  const [eventSelections, setEventSelections] = useState<EventSelection[]>([emptyEventSelection()]);
  const [capacityCodes, setCapacityCodes] = useState<string[]>([]);
  const [configurationName, setConfigurationName] = useState("Cloud pricing configuration");
  const [targetOrganizationId, setTargetOrganizationId] = useState("");
  const [requestReason, setRequestReason] = useState("");

  const workspaceOffers = useMemo(() => offers.filter((offer) => offer.product_family === "WORKSPACE"), [offers]);
  const emcOffers = useMemo(() => offers.filter((offer) => offer.product_family === "EMC"), [offers]);
  const eventOffers = useMemo(() => offers.filter((offer) => offer.product_family === "EVENT"), [offers]);
  const capacityOffers = useMemo(() => offers.filter((offer) => offer.product_family === "CAPACITY_ADDON"), [offers]);
  const emcCapacityOffers = capacityOffers.filter((offer) => offer.scope_type === "EMC");
  const eventCapacityOffers = capacityOffers.filter((offer) => offer.scope_type === "EVENT");

  const updateEventSelection = (key: string, update: Partial<EventSelection>) => {
    setEventSelections((current) => current.map((selection) => selection.key === key ? { ...selection, ...update } : selection));
  };

  const removeEventSelection = (key: string) => {
    setEventSelections((current) => current.length === 1 ? [emptyEventSelection()] : current.filter((selection) => selection.key !== key));
  };

  const payload = (): CloudPricingPreviewRequest => ({
    account_type: accountType,
    workspace_offer_code: accountType === "ORGANIZER" ? workspaceCode || undefined : undefined,
    workspace_billing_interval: accountType === "ORGANIZER" ? billingInterval : undefined,
    emc_offer_code: accountType === "EMC" ? emcCode || undefined : undefined,
    capacity_addon_codes: accountType === "EMC" ? capacityCodes : [],
    events: accountType === "ORGANIZER"
      ? eventSelections
        .filter((selection) => selection.eventId && (selection.offerCode || selection.capacityAddonCodes.length > 0))
        .map((selection) => ({
          event_id: selection.eventId,
          offer_code: selection.offerCode || undefined,
          capacity_addon_codes: selection.capacityAddonCodes,
        }))
      : [],
  });

  const calculate = () => {
    const nextPayload = payload();
    const incompleteEvent = eventSelections.find((selection) =>
      (selection.offerCode || selection.capacityAddonCodes.length > 0) && !selection.eventId,
    );
    if (accountType === "ORGANIZER" && incompleteEvent) {
      toast.error("Every Event plan or capacity bundle must have an event UUID.");
      return;
    }
    if (accountType === "ORGANIZER" && !workspaceCode && !eventSelections.some((selection) => selection.eventId && (selection.offerCode || selection.capacityAddonCodes.length > 0))) {
      toast.error("Select a Workspace plan or an Event selection first.");
      return;
    }
    if (accountType === "EMC" && !emcCode) {
      toast.error("Select an EMC plan first.");
      return;
    }
    preview.mutate(nextPayload);
  };

  const save = () => {
    if (!preview.data) {
      toast.error("Calculate a preview before saving.");
      return;
    }
    saveConfiguration.mutate({ payload: { name: configurationName, payload: payload(), preview_snapshot: preview.data } }, {
      onSuccess: () => toast.success("Configuration saved."),
    });
  };

  const createQuoteRequest = () => {
    if (!preview.data) return;
    if (!targetOrganizationId || requestReason.trim().length < 5) {
      toast.error("Enter the target organization and a reason before creating a quote request.");
      return;
    }
    createRequest.mutate({
      payload: {
        ...payload(),
        organization_id: targetOrganizationId,
        request_type: accountType === "EMC" ? "EMC" : "ENTERPRISE",
        requirements: {},
        billing_profile: {},
        reason: requestReason,
      },
    }, { onSuccess: () => toast.success("Commercial request created for review.") });
  };

  return (
    <section className="mt-8 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5" aria-labelledby="cloud-plan-calculator-title">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--pri)]"><Calculator className="size-4" />Commercial composition</div>
          <h2 id="cloud-plan-calculator-title" className="mt-2 text-lg font-semibold text-[var(--text-primary)]">Cloud Plan Calculator</h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">Compose a Workspace or EMC contract, attach event capacity, and calculate the GST-inclusive total from the current published price book.</p>
        </div>
        <span className="hidden rounded-full border border-[var(--border-subtle)] px-3 py-1 text-xs text-[var(--text-secondary)] md:inline-flex">INR · GST 18%</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <label className="text-xs font-medium text-[var(--text-secondary)]">Account type<select value={accountType} onChange={(event) => { setAccountType(event.target.value as "ORGANIZER" | "EMC"); preview.reset(); }} className="input mt-1 h-10 w-full rounded-md px-3 text-sm"><option value="ORGANIZER">Organizer</option><option value="EMC">EMC</option></select></label>
        {accountType === "ORGANIZER" ? <label className="text-xs font-medium text-[var(--text-secondary)]">Workspace plan<select value={workspaceCode} onChange={(event) => setWorkspaceCode(event.target.value)} className="input mt-1 h-10 w-full rounded-md px-3 text-sm"><option value="">No Workspace plan</option>{workspaceOffers.map((offer) => <option key={offer.code} value={offer.code}>{offer.display_name}</option>)}</select></label> : <label className="text-xs font-medium text-[var(--text-secondary)]">EMC plan<select value={emcCode} onChange={(event) => setEmcCode(event.target.value)} className="input mt-1 h-10 w-full rounded-md px-3 text-sm"><option value="">Select EMC plan</option>{emcOffers.map((offer) => <option key={offer.code} value={offer.code}>{offer.display_name}</option>)}</select></label>}
        {accountType === "ORGANIZER" ? <label className="text-xs font-medium text-[var(--text-secondary)]">Billing term<select value={billingInterval} onChange={(event) => setBillingInterval(event.target.value)} className="input mt-1 h-10 w-full rounded-md px-3 text-sm"><option value="MONTHLY">Monthly</option><option value="ANNUAL">Annual</option></select></label> : <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-3 text-xs text-[var(--text-secondary)]"><span className="font-semibold text-[var(--text-primary)]">Annual contract</span><br />EMC capacity is pooled for the contract year.</div>}
      </div>

      {accountType === "ORGANIZER" ? <div className="mt-5 rounded-lg border border-[var(--border-subtle)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Event composition</p><p className="mt-1 text-xs text-[var(--text-secondary)]">Price several events together. Every Event plan and bundle remains tied to its own event UUID.</p></div>
          <Button type="button" variant="secondary" onClick={() => setEventSelections((current) => [...current, emptyEventSelection()])}><Plus className="mr-2 size-4" />Add event</Button>
        </div>
        <div className="mt-4 space-y-3">{eventSelections.map((selection, index) => {
          const selectedOffer = eventOffers.find((offer) => offer.code === selection.offerCode);
          const eligibleCodes = selectedOffer?.eligible_addon_codes ?? [];
          const eligibleCapacityOffers = selectedOffer && eligibleCodes.length > 0
            ? eventCapacityOffers.filter((offer) => eligibleCodes.includes(offer.code))
            : eventCapacityOffers;
          return <div key={selection.key} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-4">
            <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-[var(--text-primary)]">Event {index + 1}</p><Button type="button" variant="ghost" size="sm" onClick={() => removeEventSelection(selection.key)} aria-label={`Remove event ${index + 1}`}><Trash2 className="size-4" /></Button></div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2"><Input value={selection.eventId} onChange={(event) => updateEventSelection(selection.key, { eventId: event.target.value })} placeholder="Event UUID" aria-label={`Event ${index + 1} UUID`} /><select value={selection.offerCode} onChange={(event) => { const offerCode = event.target.value; const offer = eventOffers.find((candidate) => candidate.code === offerCode); const allowed = new Set(offer?.eligible_addon_codes ?? []); updateEventSelection(selection.key, { offerCode, capacityAddonCodes: offer && allowed.size > 0 ? selection.capacityAddonCodes.filter((code) => allowed.has(code)) : selection.capacityAddonCodes }); }} className="input h-10 rounded-md px-3 text-sm" aria-label={`Event ${index + 1} plan`}><option value="">Capacity bundles only</option>{eventOffers.map((offer) => <option key={offer.code} value={offer.code}>{offer.display_name}</option>)}</select></div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{eligibleCapacityOffers.map((offer) => <label key={offer.code} className="flex items-center gap-2 text-sm text-[var(--text-primary)]"><input type="checkbox" checked={selection.capacityAddonCodes.includes(offer.code)} onChange={(event) => updateEventSelection(selection.key, { capacityAddonCodes: event.target.checked ? [...selection.capacityAddonCodes, offer.code] : selection.capacityAddonCodes.filter((code) => code !== offer.code) })} />{offer.display_name}</label>)}</div>
          </div>;
        })}</div>
      </div> : <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-lg border border-[var(--border-subtle)] p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Client allocations</p><p className="mt-3 text-sm text-[var(--text-primary)]">This calculator prices the annual EMC pool. Allocate that pool to client workspaces and their events after contract activation from EMC administration.</p><p className="mt-2 text-xs text-[var(--text-secondary)]">Keeping allocation separate prevents a quote from assigning capacity to a client workspace before the commercial account exists.</p></div>
        <div className="rounded-lg border border-[var(--border-subtle)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Pooled capacity bundles</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">{emcCapacityOffers.map((offer) => <label key={offer.code} className="flex items-center gap-2 text-sm text-[var(--text-primary)]"><input type="checkbox" checked={capacityCodes.includes(offer.code)} onChange={(event) => setCapacityCodes((current) => event.target.checked ? [...current, offer.code] : current.filter((code) => code !== offer.code))} />{offer.display_name}</label>)}</div>
        </div>
      </div>}

      <div className="mt-5 flex flex-wrap items-center gap-3"><Button onClick={calculate} disabled={preview.isPending}>{preview.isPending ? "Calculating…" : "Calculate price"}</Button>{preview.data ? <><Input className="h-10 w-64" value={configurationName} onChange={(event) => setConfigurationName(event.target.value)} aria-label="Configuration name" /><Button variant="secondary" onClick={save} disabled={saveConfiguration.isPending}><Save className="mr-2 size-4" />{saveConfiguration.isPending ? "Saving…" : "Save configuration"}</Button></> : null}</div>

      {preview.isError ? <p className="mt-4 rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/5 p-3 text-sm text-[var(--danger)]">The current composition could not be priced. Check the event scope, plan term, and published catalogue.</p> : null}
      {preview.data ? <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_280px]"><div className="rounded-lg border border-[var(--border-subtle)] p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Price composition · {preview.data.price_book_version}</p><div className="mt-3 space-y-2">{preview.data.line_items.map((item) => <div key={`${item.code}-${item.billing_interval}`} className="flex items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-2 text-sm"><span>{item.display_name} <span className="text-xs text-[var(--text-secondary)]">× {item.quantity}</span></span><span className="font-medium">{money.format(item.line_total)}</span></div>)}</div></div><div className="rounded-lg bg-[var(--bg-surface-2)] p-4"><div className="flex justify-between text-sm"><span className="text-[var(--text-secondary)]">Subtotal</span><span>{money.format(preview.data.subtotal)}</span></div><div className="mt-2 flex justify-between text-sm"><span className="text-[var(--text-secondary)]">GST ({preview.data.gst_rate}%)</span><span>{money.format(preview.data.gst)}</span></div><div className="mt-4 flex justify-between border-t border-[var(--border-subtle)] pt-3 text-lg font-semibold"><span>Total</span><span>{money.format(preview.data.total)}</span></div>{preview.data.quote_required ? <div className="mt-4 space-y-2"><p className="text-xs text-[var(--text-secondary)]">Quote approval is required before activation.</p><Input value={targetOrganizationId} onChange={(event) => setTargetOrganizationId(event.target.value)} placeholder="Target organization UUID" aria-label="Target organization UUID" /><Input value={requestReason} onChange={(event) => setRequestReason(event.target.value)} placeholder="Request reason" aria-label="Request reason" /><Button className="w-full" variant="secondary" onClick={createQuoteRequest} disabled={createRequest.isPending}>{createRequest.isPending ? "Creating request…" : "Create quote request"}</Button></div> : <p className="mt-3 text-xs text-[var(--text-secondary)]"><Check className="mr-1 inline size-3 text-[var(--success)]" />Eligible for standard checkout.</p>}</div></div> : null}

      {configurations.data && configurations.data.length > 0 ? <div className="mt-5 border-t border-[var(--border-subtle)] pt-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Saved configurations</p><div className="mt-2 grid gap-2 md:grid-cols-3">{configurations.data.slice(0, 6).map((configuration) => <div key={configuration.id} className="rounded-lg border border-[var(--border-subtle)] p-3 text-xs"><p className="font-medium text-[var(--text-primary)]">{configuration.name}</p><p className="mt-1 text-[var(--text-secondary)]">{configuration.account_type} · {money.format(configuration.preview.total)}</p></div>)}</div></div> : null}
    </section>
  );
}
