"use client";

import type { LucideIcon } from "lucide-react";
import { Calendar, CheckCircle2, Clock, Coins, CreditCard, DoorOpen, FileText, Layers3, MapPin, Server, ShieldCheck, Ticket, User, UserCheck, Users, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type DetailType = "plan" | "addon" | "template";

type CommercialDetailsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: DetailType | null;
  data: any | null;
};

function formatINR(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Unavailable";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

function formatStorage(mb: unknown) {
  const amount = Number(mb);
  if (!Number.isFinite(amount) || amount <= 0) return "Not configured";
  return amount >= 1024 ? `${Number((amount / 1024).toFixed(1))} GB` : `${amount} MB`;
}

function totalQuantity(value: unknown) {
  return Array.isArray(value) ? value.reduce((total, item) => total + Number(item?.quantity || 0), 0) : 0;
}

function Fact({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-[var(--op-border)] bg-[var(--op-panel-soft)] p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--op-border)] text-[var(--op-primary)]"><Icon className="h-4 w-4" /></span>
      <span className="min-w-0"><small className="block text-[10px] font-semibold uppercase text-[var(--op-muted)]">{label}</small><strong className="mt-1 block truncate text-xs text-[var(--op-text)]">{value}</strong></span>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-[var(--op-border)] bg-[var(--op-panel-bg)] p-5">
      <h3 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase text-[var(--op-text)]"><Icon className="h-4 w-4 text-[var(--op-primary)]" />{title}</h3>
      {children}
    </section>
  );
}

export function CommercialDetailsDialog({ open, onOpenChange, type, data }: CommercialDetailsDialogProps) {
  if (!data || !type) return null;
  const isVenue = type === "addon" && (data.addon_type || data.type) === "VENUE";
  const imageUrl = typeof data.image_url === "string" && data.image_url.trim() ? data.image_url.trim() : data.imageUrl;
  const price = type === "plan"
    ? data.priceLabel || (data.price_per_event != null ? formatINR(data.price_per_event) : "Custom pricing")
    : data.priceLabel || (data.final_price != null ? formatINR(data.final_price) : data.price_inr != null ? formatINR(data.price_inr) : "Included");
  const billingModel = String(type === "plan" ? data.billing_model || "PER_EVENT" : data.billing_unit || data.billingUnit || "PER_EVENT").replaceAll("_", " ");
  const entitlements = [
    { icon: Users, label: "Team members", value: data.max_users },
    { icon: UserCheck, label: "Registrations", value: data.max_registrations },
    { icon: User, label: "Speakers", value: data.max_speakers },
    { icon: Calendar, label: "Sessions", value: data.max_sessions },
    { icon: DoorOpen, label: "Rooms", value: data.max_rooms },
    { icon: Ticket, label: "Ticket categories", value: data.max_ticket_categories },
  ];
  const templateTotal = Number(data.total_estimated_cost ?? data.estimated_cost ?? data.totalCost ?? 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-h-[90vh] overflow-y-auto rounded-lg border border-[var(--op-border)] bg-[var(--op-panel-bg)] p-0 text-[var(--op-text)]", type === "plan" ? "max-w-4xl" : "max-w-2xl")}>
        <DialogHeader className="border-b border-[var(--op-border)] p-6 text-left">
          <div className="flex items-start gap-4 pr-8">
            <div className="flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--op-border)] bg-[var(--op-panel-soft)]">
              {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-contain" /> : type === "plan" ? <CreditCard className="h-7 w-7 text-[var(--op-primary)]" /> : isVenue ? <MapPin className="h-7 w-7 text-[var(--op-primary)]" /> : <Layers3 className="h-7 w-7 text-[var(--op-primary)]" />}
            </div>
            <div className="min-w-0 flex-1">
              <span className="op-status op-status-info">{type === "plan" ? "Subscription tier" : isVenue ? "Venue service" : type === "addon" ? "Plan extension" : "Operations template"}</span>
              <DialogTitle className="mt-2 text-xl font-bold text-[var(--op-text)]">{data.name}</DialogTitle>
              <DialogDescription className="mt-1 text-sm text-[var(--op-muted)]">{data.description || `Commercial details for ${data.name}.`}</DialogDescription>
            </div>
            <div className="shrink-0 text-right"><small className="block text-[10px] font-semibold uppercase text-[var(--op-muted)]">Commercial rate</small><strong className="mt-1 block text-lg text-[var(--op-primary)]">{price}</strong>{type !== "plan" && (data.price_unit || data.priceUnit) ? <span className="text-xs text-[var(--op-muted)]">per {data.price_unit || data.priceUnit}</span> : null}</div>
          </div>
        </DialogHeader>

        <div className="space-y-5 p-6">
          <div className={cn("grid gap-3", isVenue ? "sm:grid-cols-4" : "sm:grid-cols-2")}>
            <Fact icon={CreditCard} label="Pricing model" value={billingModel} />
            <Fact icon={Calendar} label="Availability" value={type === "plan" ? "Standard catalogue" : isVenue ? "Venue specific" : "Plan dependent"} />
            {isVenue ? <Fact icon={Server} label="Hardware" value={`${totalQuantity(data.hardware_spec)} items`} /> : null}
            {isVenue ? <Fact icon={Users} label="Crew" value={`${totalQuantity(data.staff_spec)} staff`} /> : null}
          </div>

          {type === "plan" ? <Section title="Entitlements and capacity" icon={ShieldCheck}><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{entitlements.map(({ icon, label, value }) => <Fact key={label} icon={icon} label={label} value={value == null ? "Not configured" : Number(value).toLocaleString()} />)}<Fact icon={FileText} label="Storage" value={formatStorage(data.storage_quota_mb)} /></div><p className="mt-4 text-xs leading-5 text-[var(--op-muted)]">Limits are contract-scoped. Additional capacity requires an approved plan, add-on, or allocation request.</p></Section> : null}

          {type === "addon" ? <div className="grid gap-4 md:grid-cols-2"><Section title="What's included" icon={CheckCircle2}>{Array.isArray(data.inclusions) && data.inclusions.length ? <ul className="space-y-3">{data.inclusions.map((item: string) => <li key={item} className="flex gap-2 text-xs text-[var(--op-text)]"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--op-success)]" />{item}</li>)}</ul> : <p className="text-xs text-[var(--op-muted)]">Standard package scope.</p>}</Section><Section title="Out of scope" icon={XCircle}>{Array.isArray(data.exclusions) && data.exclusions.length ? <ul className="space-y-3">{data.exclusions.map((item: string) => <li key={item} className="flex gap-2 text-xs text-[var(--op-text)]"><XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--op-danger)]" />{item}</li>)}</ul> : <p className="text-xs text-[var(--op-muted)]">No exclusions specified.</p>}</Section>{Number(data.consumables_cost || data.consumablesCost) > 0 ? <div className="md:col-span-2"><Fact icon={Coins} label="Consumables surcharge" value={formatINR(data.consumables_cost || data.consumablesCost)} /></div> : null}</div> : null}

          {type === "template" ? <Section title="Operational estimate" icon={Clock}><div className="grid gap-3 sm:grid-cols-2"><Fact icon={Clock} label="Setup duration" value={`${data.setup_time ?? data.setupTime ?? 0} hours`} /><Fact icon={Clock} label="Teardown duration" value={`${data.teardown_time ?? data.teardownTime ?? 0} hours`} /><Fact icon={Users} label="Capacity" value={String(data.default_capacity ?? data.defaultCapacity ?? data.min_speakers ?? data.min_attendees ?? "Unavailable")} /><Fact icon={Coins} label="Estimated total" value={formatINR(templateTotal)} /></div></Section> : null}
        </div>

        <DialogFooter className="border-t border-[var(--op-border)] p-4"><Button variant="outline" className="rounded-lg" onClick={() => onOpenChange(false)}>Close details</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
