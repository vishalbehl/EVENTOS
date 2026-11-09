"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Cloud, History, Layers3, Plus, RefreshCw, Save, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { useActivateCloudCommercialRequest, useCloudCatalogue, useCloudCommercialRequests, useCloudOfferImpactPreview, useCloudOfferVersions, useCreateCloudOffer, useCreateCloudOfferVersion, useDecideCloudCommercialRequest, usePublishCloudOfferVersion, type CloudCommercialOffer, type CloudOfferCreateInput, type CloudOfferVersionInput } from "@/services/super-admin-service";
import { CloudPlanCalculator } from "./CloudPlanCalculator";

const families = ["ALL", "WORKSPACE", "EVENT", "EMC", "CAPACITY_ADDON"] as const;
const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

function formatPrice(amount: number, interval: string) {
  if (amount === 0) return "Quote / free";
  return `${money.format(amount)} / ${interval.toLowerCase().replace("_", " ")}`;
}

export default function CloudPlansPage() {
  const [family, setFamily] = useState<(typeof families)[number]>("ALL");
  const [selectedCode, setSelectedCode] = useState<string>();
  const [draft, setDraft] = useState<CloudOfferVersionInput | null>(null);
  const [pendingVersionId, setPendingVersionId] = useState<string>();
  const [showNewOffer, setShowNewOffer] = useState(false);
  const [newOffer, setNewOffer] = useState<CloudOfferCreateInput>({ code: "", product_family: "WORKSPACE", name: "", display_name: "", description: "", scope_type: "ORGANIZATION", is_quote_only: false, display_order: 0, change_reason: "" });
  const queryFamily = family === "ALL" ? undefined : family;
  const catalogue = useCloudCatalogue(queryFamily);
  const allCatalogue = useCloudCatalogue();
  const createVersion = useCreateCloudOfferVersion();
  const createOffer = useCreateCloudOffer();
  const publishVersion = usePublishCloudOfferVersion();
  const requests = useCloudCommercialRequests();
  const decideRequest = useDecideCloudCommercialRequest();
  const activateRequest = useActivateCloudCommercialRequest();
  const offers = catalogue.data ?? [];
  const selected = offers.find((offer) => offer.code === selectedCode) ?? offers[0];
  const versionHistory = useCloudOfferVersions(selected?.id);
  const impactPreview = useCloudOfferImpactPreview(selected?.id, pendingVersionId);
  const quoteIssuedRequests = (requests.data || []).filter((request) => request.status === "QUOTE_ISSUED" && request.quote_id && request.quote_status === "APPROVED");
  const hasRefreshingSnapshot = [catalogue, allCatalogue, versionHistory, impactPreview, requests].some((query) => query.isFetching && query.data !== undefined);
  const accessDenied = [catalogue.error, allCatalogue.error, requests.error].some((error) => (error as { status?: number } | undefined)?.status === 401 || (error as { status?: number } | undefined)?.status === 403);

  const selectOffer = (offer: CloudCommercialOffer) => {
    setSelectedCode(offer.code);
    const defaultInterval = offer.product_family === "CAPACITY_ADDON" ? "ONE_TIME" : offer.product_family === "EVENT" ? "PER_EVENT" : offer.product_family === "EMC" ? "ANNUAL" : "ANNUAL";
    const defaultUnit = offer.product_family === "CAPACITY_ADDON" ? "BUNDLE" : offer.product_family === "EVENT" ? "EVENT" : offer.product_family === "EMC" ? "YEAR" : "ACCOUNT";
    setDraft({
      effective_from: new Date(Date.now() + 86400000).toISOString(),
      change_reason: "",
      prices: offer.prices.length ? offer.prices.map((price) => ({ ...price })) : [{ billing_interval: defaultInterval, pricing_unit: defaultUnit, amount: 0, currency: "INR", tax_mode: "EXCLUSIVE" }],
      entitlements: offer.entitlements.map((entitlement) => ({
        entitlement_key: entitlement.key,
        scope_type: entitlement.scope_type,
        value_type: entitlement.value_type,
        quantity: entitlement.quantity,
        unit_type: entitlement.unit_type ?? undefined,
        consumption_model: entitlement.consumption_model,
        hard_ceiling: entitlement.hard_ceiling,
      })),
      eligible_addon_codes: offer.eligible_addon_codes ?? [],
    });
    setPendingVersionId(undefined);
  };

  const selectedPrices = useMemo(() => draft?.prices ?? [], [draft]);
  const updatePrice = (index: number, patch: Partial<CloudOfferVersionInput["prices"][number]>) => {
    if (!draft) return;
    const prices = draft.prices.map((price, priceIndex) => priceIndex === index ? { ...price, ...patch } : price);
    setDraft({ ...draft, prices });
  };
  const updateEntitlement = (index: number, patch: Partial<CloudOfferVersionInput["entitlements"][number]>) => {
    if (!draft) return;
    const entitlements = draft.entitlements.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item);
    setDraft({ ...draft, entitlements });
  };
  const addPrice = () => {
    if (!draft) return;
    setDraft({ ...draft, prices: [...draft.prices, { billing_interval: "ANNUAL", pricing_unit: "ACCOUNT", amount: 0, currency: "INR", tax_mode: "EXCLUSIVE" }] });
  };
  const addEntitlement = () => {
    if (!draft || !selected) return;
    setDraft({ ...draft, entitlements: [...draft.entitlements, { entitlement_key: "", scope_type: selected.scope_type, value_type: "QUANTITY", quantity: 0, unit_type: "units", consumption_model: "LIMIT", hard_ceiling: true }] });
  };
  const eligibleAddonOptions = (allCatalogue.data ?? []).filter((offer) => offer.product_family === "CAPACITY_ADDON" && selected && offer.scope_type === (selected.product_family === "EVENT" ? "EVENT" : selected.product_family === "EMC" ? "EMC" : selected.scope_type));

  const saveDraft = async () => {
    if (!selected || !draft) return;
    if (draft.change_reason.trim().length < 5) {
      toast.error("Add a change reason before creating a version.");
      return;
    }
    const entitlementKeys = draft.entitlements.map((item) => item.entitlement_key.trim());
    if (entitlementKeys.some((key) => !key) || new Set(entitlementKeys).size !== entitlementKeys.length) {
      toast.error("Every entitlement needs a unique key.");
      return;
    }
    try {
      const response = await createVersion.mutateAsync({ offerId: selected.id, data: draft, version: selected.version_number });
      setPendingVersionId(response.id);
      toast.success(`Draft v${response.version_number} created. Existing contracts remain unchanged.`);
    } catch {
      toast.error("The version could not be created. Refresh and check whether another administrator published a change.");
    }
  };

  const publishDraft = async () => {
    if (!pendingVersionId) return;
    try {
      await publishVersion.mutateAsync({ versionId: pendingVersionId, version: selected?.version_number ?? 0 });
      setPendingVersionId(undefined);
      toast.success("Version published for its effective date.");
    } catch {
      toast.error("The version could not be published.");
    }
  };

  const submitNewOffer = async () => {
    if (!newOffer.code || !newOffer.name || !newOffer.display_name || !newOffer.scope_type || newOffer.change_reason.trim().length < 5) {
      toast.error("Complete the offer identity before saving it.");
      return;
    }
    try {
      const created = await createOffer.mutateAsync({ payload: { ...newOffer, code: newOffer.code.toUpperCase() } });
      setShowNewOffer(false);
      setFamily(created.product_family);
      setSelectedCode(created.code);
      toast.success("Offer identity created as a draft. Add and publish its first version before selling it.");
    } catch {
      toast.error("The offer identity could not be created. Check whether its code is already in use.");
    }
  };

  return (
    <PageContainer>
      <SectionHeader
        title="Cloud commercial catalogue"
        description="Manage Workspace, Event, EMC, and capacity offers through immutable price and allocation versions. Published versions are never edited in place."
        actions={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setShowNewOffer((value) => !value)}><Plus className="mr-2 size-4" />New offer identity</Button><Button variant="secondary" onClick={() => { void catalogue.refetch(); void allCatalogue.refetch(); }} disabled={catalogue.isFetching}><RefreshCw className="mr-2 size-4" />Refresh</Button></div>}
      />
      {accessDenied ? <div className="mb-4 rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/5 px-3 py-2 text-xs text-[var(--text-secondary)]" role="alert">You do not have permission to manage cloud commercial data. Ask a platform administrator to review your access.</div> : null}
      {hasRefreshingSnapshot ? <div className="mb-4 rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/5 px-3 py-2 text-xs text-[var(--text-secondary)]" role="status">Refreshing commercial data. Values shown may be briefly stale until the latest response arrives.</div> : null}

      {showNewOffer ? <section className="mb-5 rounded-xl border border-[var(--pri)]/40 bg-[var(--bg-surface)] p-5" aria-labelledby="new-offer-title"><div className="mb-4"><h2 id="new-offer-title" className="text-base font-semibold text-[var(--text-primary)]">New offer identity</h2><p className="mt-1 text-xs text-[var(--text-secondary)]">This creates only the stable identity. Prices and allocations must be added as the first immutable version.</p></div><div className="grid gap-3 md:grid-cols-3"><label className="text-xs text-[var(--text-secondary)]">Offer code<Input className="mt-1" value={newOffer.code} onChange={(event) => setNewOffer({ ...newOffer, code: event.target.value.toUpperCase() })} placeholder="WORKSPACE_CUSTOM" /></label><label className="text-xs text-[var(--text-secondary)]">Product family<select className="input mt-1 h-10 w-full rounded-md px-3 text-sm" value={newOffer.product_family} onChange={(event) => setNewOffer({ ...newOffer, product_family: event.target.value as CloudOfferCreateInput["product_family"] })}><option value="WORKSPACE">Workspace</option><option value="EVENT">Event</option><option value="EMC">EMC</option><option value="CAPACITY_ADDON">Capacity add-on</option><option value="VENUE">Venue plan</option><option value="VENUE_ADDON">Venue application / service</option></select></label><label className="text-xs text-[var(--text-secondary)]">Scope type<Input className="mt-1" value={newOffer.scope_type} onChange={(event) => setNewOffer({ ...newOffer, scope_type: event.target.value })} placeholder="ORGANIZATION / EVENT / EMC" /></label><label className="text-xs text-[var(--text-secondary)]">Internal name<Input className="mt-1" value={newOffer.name} onChange={(event) => setNewOffer({ ...newOffer, name: event.target.value })} /></label><label className="text-xs text-[var(--text-secondary)]">Customer display name<Input className="mt-1" value={newOffer.display_name} onChange={(event) => setNewOffer({ ...newOffer, display_name: event.target.value })} /></label><label className="text-xs text-[var(--text-secondary)]">Display order<Input className="mt-1" type="number" min="0" value={newOffer.display_order} onChange={(event) => setNewOffer({ ...newOffer, display_order: Number(event.target.value) || 0 })} /></label></div><label className="mt-3 block text-xs text-[var(--text-secondary)]">Description<textarea className="input mt-1 min-h-16 w-full rounded-md px-3 py-2 text-sm" value={newOffer.description} onChange={(event) => setNewOffer({ ...newOffer, description: event.target.value })} /></label><label className="mt-3 block text-xs text-[var(--text-secondary)]">Change reason<textarea className="input mt-1 min-h-16 w-full rounded-md px-3 py-2 text-sm" value={newOffer.change_reason} onChange={(event) => setNewOffer({ ...newOffer, change_reason: event.target.value })} placeholder="Why is this offer being introduced?" /></label><div className="mt-4 flex items-center gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={newOffer.is_quote_only} onChange={(event) => setNewOffer({ ...newOffer, is_quote_only: event.target.checked })} />Quote only</label><Button onClick={submitNewOffer} disabled={createOffer.isPending}>{createOffer.isPending ? "Creating…" : "Create draft identity"}</Button></div></section> : null}

      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 text-sm text-[var(--text-secondary)]">
        <div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 size-4 text-[var(--warning)]" /><p>Changing a price or allocation creates a new version. Existing contracts continue using their saved commercial snapshot until renewal or an approved amendment.</p></div>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Cloud product families">
        {families.map((item) => <button key={item} type="button" role="tab" aria-selected={family === item} onClick={() => setFamily(item)} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${family === item ? "border-[var(--pri)] bg-[var(--pri)] text-white" : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-2)]"}`}>{item.replace("_", " ")}</button>)}
      </div>

      {catalogue.isLoading ? <div className="rounded-xl border border-[var(--border-subtle)] p-8 text-sm text-[var(--text-secondary)]">Loading cloud catalogue…</div> : null}
      {catalogue.isError ? <div className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/5 p-8 text-sm text-[var(--text-secondary)]">{accessDenied ? "Cloud catalogue access is denied." : "The cloud catalogue is unavailable. Confirm the authenticated platform API and try again."}</div> : null}
      {!catalogue.isLoading && !catalogue.isError && offers.length === 0 ? <div className="rounded-xl border border-[var(--border-subtle)] p-8 text-sm text-[var(--text-secondary)]">No published offers exist for this family.</div> : null}

      {offers.length > 0 ? <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
        <div className="grid gap-3 sm:grid-cols-2">
          {offers.map((offer) => {
            const primaryPrice = offer.prices[0];
            const active = selected?.code === offer.code;
            return <button key={offer.code} type="button" onClick={() => selectOffer(offer)} className={`rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pri)] ${active ? "border-[var(--pri)] bg-[var(--bg-surface-2)]" : "border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-2)]"}`}>
              <div className="mb-4 flex items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]"><Cloud className="size-4 text-[var(--pri)]" />{offer.display_name}</div><p className="mt-1 text-xs text-[var(--text-secondary)]">{offer.product_family.replace("_", " ")} · v{offer.version_number}</p></div>{offer.is_quote_only ? <span className="rounded-full bg-[var(--bg-surface-3)] px-2 py-1 text-[10px] text-[var(--text-secondary)]">Quote</span> : null}</div>
              <p className="text-base font-semibold text-[var(--text-primary)]">{primaryPrice ? formatPrice(primaryPrice.amount, primaryPrice.billing_interval) : "No price configured"}</p>
              <p className="mt-2 line-clamp-2 text-xs text-[var(--text-secondary)]">{offer.description}</p>
              <p className="mt-4 text-xs text-[var(--text-secondary)]"><History className="mr-1 inline size-3" />Effective {new Date(offer.effective_from).toLocaleDateString("en-IN")}</p>
            </button>;
          })}
        </div>

        {selected && draft ? <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5" aria-labelledby="version-editor-title">
          <div className="mb-5 flex items-start justify-between gap-3"><div><h2 id="version-editor-title" className="text-base font-semibold text-[var(--text-primary)]">Create next version</h2><p className="mt-1 text-xs text-[var(--text-secondary)]">{selected.display_name} · current v{selected.version_number}</p></div><Layers3 className="size-5 text-[var(--pri)]" /></div>
          {impactPreview.data ? <div className="mb-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-3 text-xs text-[var(--text-secondary)]"><p className="font-semibold text-[var(--text-primary)]">Impact preview</p><p className="mt-1">{impactPreview.data.active_contracts_unchanged} active contracts and {impactPreview.data.active_allocations_unchanged} active allocations remain unchanged. Renewals use v{impactPreview.data.target_version_number} from {new Date(impactPreview.data.effective_from).toLocaleDateString("en-IN")}.</p></div> : null}
          <div className="space-y-4">
            <label className="block text-xs font-medium text-[var(--text-secondary)]">Effective date<input type="datetime-local" value={draft.effective_from.slice(0, 16)} onChange={(event) => setDraft({ ...draft, effective_from: new Date(event.target.value).toISOString() })} className="input mt-1 flex h-10 w-full rounded-md px-3 py-2 text-sm" /></label>
            <label className="block text-xs font-medium text-[var(--text-secondary)]">Change reason<textarea value={draft.change_reason} onChange={(event) => setDraft({ ...draft, change_reason: event.target.value })} placeholder="Explain the commercial change" className="input mt-1 min-h-20 w-full rounded-md px-3 py-2 text-sm" /></label>
            <div>
              <div className="mb-2 flex items-center justify-between gap-3"><h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Prices</h3><Button size="sm" variant="outline" onClick={addPrice}><Plus className="mr-1 size-3" />Add term</Button></div>
              <div className="space-y-2">{selectedPrices.map((price, index) => <div key={`${price.billing_interval}-${index}`} className="grid gap-2 rounded-lg border border-[var(--border-subtle)] p-3 sm:grid-cols-[1fr_1fr_130px_auto]">
                <select value={price.billing_interval} onChange={(event) => updatePrice(index, { billing_interval: event.target.value })} className="input h-9 rounded-md px-2 text-xs" aria-label={`Price ${index + 1} billing interval`}><option value="MONTHLY">Monthly</option><option value="ANNUAL">Annual</option><option value="PER_EVENT">Per event</option><option value="ONE_TIME">One time</option></select>
                <select value={price.pricing_unit} onChange={(event) => updatePrice(index, { pricing_unit: event.target.value })} className="input h-9 rounded-md px-2 text-xs" aria-label={`Price ${index + 1} unit`}><option value="ACCOUNT">Account</option><option value="EVENT">Event</option><option value="YEAR">Year</option><option value="BUNDLE">Bundle</option></select>
                <Input type="number" min="0" value={price.amount} onChange={(event) => updatePrice(index, { amount: Number(event.target.value) || 0 })} aria-label={`${price.billing_interval} price`} />
                <Button size="sm" variant="ghost" aria-label={`Remove price ${index + 1}`} disabled={draft.prices.length === 1} onClick={() => setDraft({ ...draft, prices: draft.prices.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 className="size-4" /></Button>
              </div>)}</div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between gap-3"><h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Feature entitlements and allocations</h3><Button size="sm" variant="outline" onClick={addEntitlement}><Plus className="mr-1 size-3" />Add entitlement</Button></div>
              <div className="space-y-2">{draft.entitlements.length === 0 ? <p className="rounded-lg border border-dashed border-[var(--border-subtle)] p-4 text-xs text-[var(--text-secondary)]">No entitlements configured. Add an allocation or feature before publishing.</p> : draft.entitlements.map((item, index) => <div key={`${item.entitlement_key}-${index}`} className="rounded-lg border border-[var(--border-subtle)] p-3">
                <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr_1fr_auto]"><Input value={item.entitlement_key} onChange={(event) => updateEntitlement(index, { entitlement_key: event.target.value.trimStart() })} placeholder="entitlement_key" aria-label={`Entitlement ${index + 1} key`} /><select value={item.scope_type} onChange={(event) => updateEntitlement(index, { scope_type: event.target.value })} className="input h-10 rounded-md px-2 text-xs" aria-label={`Entitlement ${index + 1} scope`}><option value="ORGANIZATION">Organization</option><option value="EVENT">Event</option><option value="EMC">EMC</option></select><select value={item.value_type ?? "QUANTITY"} onChange={(event) => updateEntitlement(index, { value_type: event.target.value, quantity: event.target.value === "BOOLEAN" ? null : item.quantity ?? 0 })} className="input h-10 rounded-md px-2 text-xs" aria-label={`Entitlement ${index + 1} value type`}><option value="QUANTITY">Quantity</option><option value="BOOLEAN">Feature toggle</option></select><Button size="sm" variant="ghost" aria-label={`Remove entitlement ${index + 1}`} onClick={() => setDraft({ ...draft, entitlements: draft.entitlements.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 className="size-4" /></Button></div>
                <div className="mt-2 grid gap-2 sm:grid-cols-3"><Input type="number" min="0" disabled={(item.value_type ?? "QUANTITY") === "BOOLEAN"} value={item.quantity ?? ""} onChange={(event) => updateEntitlement(index, { quantity: event.target.value === "" ? null : Number(event.target.value) })} placeholder="Quantity" aria-label={`${item.entitlement_key || `Entitlement ${index + 1}`} quantity`} /><Input value={item.unit_type ?? ""} onChange={(event) => updateEntitlement(index, { unit_type: event.target.value })} placeholder="Unit, e.g. users" aria-label={`${item.entitlement_key || `Entitlement ${index + 1}`} unit`} /><select value={item.consumption_model ?? "LIMIT"} onChange={(event) => updateEntitlement(index, { consumption_model: event.target.value })} className="input h-10 rounded-md px-2 text-xs" aria-label={`${item.entitlement_key || `Entitlement ${index + 1}`} consumption model`}><option value="LIMIT">Limit</option><option value="METERED">Metered</option><option value="FEATURE">Feature</option></select></div>
                <label className="mt-2 flex items-center gap-2 text-xs text-[var(--text-secondary)]"><input type="checkbox" checked={item.hard_ceiling ?? true} onChange={(event) => updateEntitlement(index, { hard_ceiling: event.target.checked })} />Block new activity at the configured limit</label>
              </div>)}</div>
            </div>
            {eligibleAddonOptions.length > 0 ? <div><h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Eligible capacity add-ons</h3><div className="grid gap-2 sm:grid-cols-2">{eligibleAddonOptions.map((addon) => <label key={addon.code} className="flex items-start gap-2 rounded-lg border border-[var(--border-subtle)] p-3 text-xs"><input type="checkbox" className="mt-0.5" checked={draft.eligible_addon_codes.includes(addon.code)} onChange={(event) => setDraft({ ...draft, eligible_addon_codes: event.target.checked ? [...draft.eligible_addon_codes, addon.code] : draft.eligible_addon_codes.filter((code) => code !== addon.code) })} /><span><span className="block font-medium text-[var(--text-primary)]">{addon.display_name}</span><span className="text-[var(--text-secondary)]">{addon.code}</span></span></label>)}</div></div> : null}
            <div className="flex flex-wrap gap-2 pt-2"><Button onClick={saveDraft} disabled={createVersion.isPending || Boolean(pendingVersionId)}><Save className="mr-2 size-4" />{createVersion.isPending ? "Saving…" : "Create draft version"}</Button>{pendingVersionId ? <Button variant="secondary" onClick={publishDraft} disabled={publishVersion.isPending}><CheckCircle2 className="mr-2 size-4" />Publish draft</Button> : null}</div>
          </div>
          <div className="mt-5 border-t border-[var(--border-subtle)] pt-4"><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]"><History className="size-3" />Version history</div>{versionHistory.isLoading ? <p className="text-xs text-[var(--text-secondary)]">Loading version history…</p> : versionHistory.isError ? <p className="text-xs text-[var(--text-secondary)]">Version history unavailable.</p> : <div className="space-y-2">{(versionHistory.data || []).map((version) => <div key={version.id} className="flex items-center justify-between gap-3 rounded-md border border-[var(--border-subtle)] px-3 py-2 text-xs"><span>v{version.version_number} · {version.version_status}</span><span className="text-[var(--text-secondary)]">{new Date(version.effective_from).toLocaleDateString("en-IN")}</span></div>)}</div>}</div>
        </section> : null}
      </div> : null}

      <CloudPlanCalculator offers={allCatalogue.data ?? []} />

      <section className="mt-6 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5" aria-labelledby="commercial-requests-title">
        <div className="mb-4 flex items-start justify-between gap-3"><div><h2 id="commercial-requests-title" className="text-base font-semibold text-[var(--text-primary)]">Cloud commercial requests</h2><p className="mt-1 text-xs text-[var(--text-secondary)]">Review quote-only plans and custom capacity requests submitted by organisers.</p></div><Button variant="secondary" onClick={() => requests.refetch()} disabled={requests.isFetching}><RefreshCw className="mr-2 size-4" />Refresh</Button></div>
        {requests.isLoading ? <p className="text-sm text-[var(--text-secondary)]">Loading requests…</p> : requests.isError ? <p className="text-sm text-[var(--text-secondary)]">Requests are unavailable.</p> : (requests.data || []).length === 0 ? <p className="text-sm text-[var(--text-secondary)]">No cloud commercial requests are waiting.</p> : <div className="space-y-3">{(requests.data || []).map((request) => <div key={request.id} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[var(--border-subtle)] p-4"><div><p className="text-sm font-medium text-[var(--text-primary)]">{request.requested_offer_codes.join(", ") || request.product_family}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">{request.request_type} · {new Date(request.created_at).toLocaleDateString("en-IN")} · {request.quote_reference || "No quote reference"}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">Quote: {request.quote_status || "not issued"} · Payment: {request.payment_state || "not created"} · Next: {request.next_action.replaceAll("_", " ").toLowerCase()}</p>{request.last_response ? <p className="mt-2 text-xs text-[var(--text-primary)]">{request.last_response}</p> : null}</div><div className="flex items-center gap-2"><span className="rounded-full bg-[var(--bg-surface-2)] px-2 py-1 text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">{request.status}</span>{request.status === "PENDING" || request.status === "IN_REVIEW" ? <><Button size="sm" variant="secondary" disabled={decideRequest.isPending} onClick={() => decideRequest.mutate({ requestId: request.id, decision: "QUOTE_ISSUED", reason: "Quote review completed by Command Center", version: request.version })}>Issue quote</Button><Button size="sm" variant="outline" disabled={decideRequest.isPending} onClick={() => decideRequest.mutate({ requestId: request.id, decision: "REJECTED", reason: "Request declined after commercial review", version: request.version })}>Reject</Button></> : null}</div></div>)}</div>}
      </section>
      {quoteIssuedRequests.length > 0 ? <section className="mt-6 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5" aria-labelledby="quote-activation-title"><div className="mb-4"><h2 id="quote-activation-title" className="text-base font-semibold text-[var(--text-primary)]">Approved quote activation</h2><p className="mt-1 text-xs text-[var(--text-secondary)]">After the linked quote is approved, create the immutable contract and GST invoice from its saved commercial snapshot.</p></div><div className="space-y-3">{quoteIssuedRequests.map((request) => <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] p-3"><div><p className="text-sm font-medium">{request.quote_reference || request.product_family}</p><p className="text-xs text-[var(--text-secondary)]">{request.requested_offer_codes.join(", ")}</p></div><Button size="sm" disabled={activateRequest.isPending} onClick={() => activateRequest.mutate({ requestId: request.id, version: request.version })}>{activateRequest.isPending ? "Creating invoice…" : "Activate approved quote"}</Button></div>)}</div></section> : null}
    </PageContainer>
  );
}
