"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Activity, ArrowLeft, Boxes, Building2, CalendarDays, Check, ChevronRight,
  CircleDollarSign, Clock3, CreditCard, Database, FileClock, Globe2, KeyRound,
  Layers3, MoreHorizontal, PackageCheck, RefreshCw, ShieldCheck, Sparkles,
  Users2, X, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useOrganizationDossier, useUpdateOrgStatus } from "@/services/super-admin-service";

const TABS = [
  ["overview", "Overview", Building2], ["commercial", "Commercial", CreditCard],
  ["capabilities", "Capabilities", Zap], ["addons", "Add-ons", Boxes],
  ["events", "Events", CalendarDays], ["people", "People & access", Users2],
  ["billing", "Billing", CircleDollarSign], ["audit", "Audit", FileClock],
  ["configuration", "Configuration", Layers3],
] as const;

const formatDate = (value?: string | null) => value
  ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value))
  : "Not set";
const formatMoney = (value: number, currency = "INR") => new Intl.NumberFormat("en-IN", { style: "currency", currency: currency.slice(0, 3), maximumFractionDigits: 0 }).format(value || 0);
const formatBytes = (value: number) => value >= 1073741824 ? `${(value / 1073741824).toFixed(1)} GB` : `${(value / 1048576).toFixed(1)} MB`;

function Surface({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-panel)]", className)}>{children}</section>;
}

function SectionTitle({ icon: Icon, title, note }: { icon: typeof Building2; title: string; note?: string }) {
  return <div className="flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] px-5 py-4">
    <div className="flex min-w-0 items-center gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--bg-surface-3)] text-[var(--text-secondary)]"><Icon className="h-4 w-4" /></span><div><h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>{note && <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">{note}</p>}</div></div>
  </div>;
}

function Metric({ label, value, note, tone = "neutral" }: { label: string; value: string | number; note?: string; tone?: "neutral" | "good" | "warn" }) {
  return <div className="min-w-0 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
    <p className="truncate text-[11px] font-medium text-[var(--text-tertiary)]">{label}</p>
    <p className={cn("mt-2 font-mono text-2xl font-semibold tracking-tight", tone === "good" ? "text-emerald-500" : tone === "warn" ? "text-amber-500" : "text-[var(--text-primary)]")}>{value}</p>
    {note && <p className="mt-1 truncate text-[11px] text-[var(--text-tertiary)]">{note}</p>}
  </div>;
}

function Fact({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return <div className="grid min-w-0 grid-cols-[minmax(110px,0.7fr)_minmax(0,1.3fr)] gap-4 border-b border-[var(--border-subtle)] py-3 last:border-0"><dt className="text-xs text-[var(--text-tertiary)]">{label}</dt><dd className={cn("min-w-0 break-words text-right text-xs font-medium text-[var(--text-primary)]", mono && "font-mono")}>{value || "Not set"}</dd></div>;
}

function Empty({ label }: { label: string }) { return <div className="grid min-h-40 place-items-center px-6 text-center text-xs text-[var(--text-tertiary)]">{label}</div>; }

export default function OrganizationDossierPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const active = TABS.some(([key]) => key === search.get("view")) ? search.get("view")! : "overview";
  const { data, isLoading, isError, refetch, isFetching } = useOrganizationDossier(orgId);
  const statusMutation = useUpdateOrgStatus();
  const [statusDialog, setStatusDialog] = useState(false);
  const [reason, setReason] = useState("");

  const setTab = (view: string) => router.replace(`/organizations/${orgId}?view=${view}`, { scroll: false });
  const enabledCapabilities = useMemo(() => data?.capabilities.filter((item) => item.enabled) ?? [], [data]);

  if (isLoading) return <PageWrapper><div className="space-y-4 animate-pulse"><div className="h-36 rounded-xl bg-[var(--bg-surface)]"/><div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{[1,2,3,4,5].map(i=><div key={i} className="h-28 rounded-xl bg-[var(--bg-surface)]"/>)}</div><div className="h-80 rounded-xl bg-[var(--bg-surface)]"/></div></PageWrapper>;
  if (isError || !data) return <PageWrapper><Surface className="grid min-h-80 place-items-center p-8 text-center"><div><Database className="mx-auto h-8 w-8 text-[var(--text-tertiary)]"/><h1 className="mt-4 text-lg font-semibold">Organization dossier unavailable</h1><p className="mt-1 text-sm text-[var(--text-tertiary)]">The organization data could not be assembled.</p><Button className="mt-5" onClick={() => refetch()}>Try again</Button></div></Surface></PageWrapper>;

  const { profile, subscription, event_entitlement: events } = data;
  const submitStatus = () => {
    if (reason.trim().length < 8) return toast.error("Enter a reason of at least 8 characters");
    statusMutation.mutate({ id: orgId, isActive: !profile.is_active, reason }, { onSuccess: () => { toast.success(profile.is_active ? "Organization suspended" : "Organization activated"); setStatusDialog(false); setReason(""); refetch(); }, onError: () => toast.error("Status could not be changed") });
  };

  return <PageWrapper className="space-y-4 pb-12">
    <div className="flex items-center justify-between gap-3">
      <button onClick={() => router.push("/organizations")} className="inline-flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><ArrowLeft className="h-4 w-4"/>Organizations</button>
      <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}><RefreshCw className={cn("mr-2 h-3.5 w-3.5", isFetching && "animate-spin")}/>Refresh</Button>
    </div>

    <Surface className="overflow-hidden">
      <div className="relative p-5 md:p-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500 opacity-70"/>
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-center">
          <div className="flex min-w-0 items-start gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] shadow-inner"><Building2 className="h-6 w-6 text-[var(--text-primary)]"/></div>
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-xl font-semibold tracking-tight text-[var(--text-primary)]">{profile.name}</h1><Badge variant="outline" className={profile.is_active ? "border-emerald-500/30 text-emerald-500" : "border-rose-500/30 text-rose-500"}>{profile.is_active ? "Active" : "Suspended"}</Badge>{profile.onboarding_completed && <Badge variant="outline"><Check className="mr-1 h-3 w-3"/>Onboarded</Badge>}</div><p className="mt-1 font-mono text-xs text-[var(--text-tertiary)]">{profile.slug} · {profile.id}</p><div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[var(--text-secondary)]"><span>{subscription?.plan_name ?? "No active plan"}</span><span>{profile.organization_type ?? "Organization type not set"}</span><span>{profile.industry ?? "Industry not set"}</span><span>Updated {formatDate(profile.updated_at)}</span></div></div>
          </div>
          <div className="flex shrink-0 gap-2"><Button variant="outline" onClick={() => setTab("configuration")}>Manage tenant</Button><Button onClick={() => setStatusDialog(true)}>{profile.is_active ? "Suspend" : "Activate"}</Button></div>
        </div>
      </div>
      <div role="tablist" aria-label="Organization dossier" className="flex overflow-x-auto border-t border-[var(--border-subtle)] bg-[var(--bg-surface-3)] px-2 [scrollbar-width:none]">
        {TABS.map(([key,label,Icon]) => <button key={key} role="tab" aria-selected={active===key} onClick={()=>setTab(key)} className={cn("relative flex h-12 shrink-0 items-center gap-2 px-3 text-xs font-medium text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]", active===key && "text-[var(--text-primary)] after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-[var(--text-primary)]")}><Icon className="h-3.5 w-3.5"/>{label}</button>)}
      </div>
    </Surface>

    {active === "overview" && <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5"><Metric label="Event capacity" value={events.purchased} note={`${events.remaining} remaining`}/><Metric label="Activated" value={events.consumed} note={`${events.reserved} reserved`} tone={events.consumed > 0 ? "good" : "neutral"}/><Metric label="Actual events" value={events.actual_events} note={`${data.usage.active_events} active`}/><Metric label="Members" value={data.people.members} note={`${data.usage.active_users} active users`}/><Metric label="Platform health" value={data.health.score == null ? "—" : `${data.health.score}%`} note={data.health.status.replaceAll("_"," ")} tone={(data.health.score ?? 0) >= 80 ? "good" : "warn"}/></div>
      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]"><Surface><SectionTitle icon={Building2} title="Organization profile" note="Identity, locale and onboarding record"/><dl className="grid px-5 md:grid-cols-2 md:gap-x-8"><Fact label="Legal / portal name" value={profile.portal_name ?? profile.name}/><Fact label="Owner" value={data.owner ? `${data.owner.name} · ${data.owner.email}` : "Not assigned"}/><Fact label="Type" value={profile.organization_type}/><Fact label="Industry" value={profile.industry}/><Fact label="Primary goal" value={profile.primary_goal}/><Fact label="Expected events" value={profile.expected_events_per_year}/><Fact label="Average attendees" value={profile.average_attendees_per_event}/><Fact label="Created" value={formatDate(profile.created_at)}/></dl></Surface><Surface><SectionTitle icon={Globe2} title="Tenant configuration" note="Regional and delivery settings"/><dl className="px-5"><Fact label="Domain" value={profile.custom_domain} mono/><Fact label="Country / timezone" value={`${profile.country} · ${profile.timezone}`}/><Fact label="Language" value={profile.language}/><Fact label="Date / time" value={`${profile.date_format} · ${profile.time_format}`}/><Fact label="Currency" value={profile.currency}/><Fact label="Modules" value={profile.enabled_modules.length ? profile.enabled_modules.join(", ") : "No modules selected"}/></dl></Surface></div>
      <Surface><SectionTitle icon={Activity} title="Control signals" note={`Snapshot generated ${new Date(data.generated_at).toLocaleTimeString()}`}/><div className="grid gap-px bg-[var(--border-subtle)] md:grid-cols-4"><div className="bg-[var(--surface-1)] p-5"><p className="text-xs text-[var(--text-tertiary)]">Registrations</p><p className="mt-2 font-mono text-lg font-semibold">{data.usage.registrations.toLocaleString()}</p></div><div className="bg-[var(--surface-1)] p-5"><p className="text-xs text-[var(--text-tertiary)]">Storage consumed</p><p className="mt-2 font-mono text-lg font-semibold">{formatBytes(data.usage.storage_bytes)}</p></div><div className="bg-[var(--surface-1)] p-5"><p className="text-xs text-[var(--text-tertiary)]">Capabilities enabled</p><p className="mt-2 font-mono text-lg font-semibold">{enabledCapabilities.length}/{data.capabilities.length}</p></div><div className="bg-[var(--surface-1)] p-5"><p className="text-xs text-[var(--text-tertiary)]">Add-on assignments</p><p className="mt-2 font-mono text-lg font-semibold">{data.addons.length}</p></div></div></Surface>
    </div>}

    {active === "commercial" && <div className="space-y-4"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="Current plan" value={subscription?.plan_name ?? "None"} note={subscription?.status}/><Metric label="Price per event" value={subscription?.price_per_event == null ? "Custom" : formatMoney(subscription.price_per_event, subscription.currency)} note={subscription?.billing_model?.replaceAll("_"," ")}/><Metric label="Event units" value={events.purchased} note={`${events.consumed} consumed`}/><Metric label="Renewal" value={formatDate(subscription?.current_period_end)} note={subscription?.cancel_at_period_end ? "Cancels at period end" : "Auto-renew state unchanged"}/></div><Surface><SectionTitle icon={PackageCheck} title="Entitlement grants" note="Purchased capacity remains separate from actual event records"/>{data.grants.length ? <div className="divide-y divide-[var(--border-subtle)]">{data.grants.map(g=><div key={g.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-4 px-5 py-3 text-xs"><div className="min-w-0"><p className="truncate font-medium text-[var(--text-primary)]">{g.type.replaceAll("_"," ")}</p><p className="truncate font-mono text-[10px] text-[var(--text-tertiary)]">{g.id}</p></div><Badge variant="outline">{g.source}</Badge><span className="font-mono">{g.consumed ?? 0}/{g.total ?? "∞"}</span><span className="text-[var(--text-tertiary)]">{formatDate(g.valid_until)}</span></div>)}</div>:<Empty label="No entitlement grants have been issued."/>}</Surface><Surface><SectionTitle icon={Clock3} title="Subscription history"/>{data.subscription_history.length ? <div className="divide-y divide-[var(--border-subtle)]">{data.subscription_history.map((s)=><div key={s?.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-4 px-5 py-3 text-xs"><div><p className="font-medium">{s?.plan_name}</p><p className="text-[var(--text-tertiary)]">Started {formatDate(s?.created_at)}</p></div><Badge variant="outline">{s?.status}</Badge><span>{formatDate(s?.current_period_end)}</span></div>)}</div>:<Empty label="No subscription history."/>}</Surface></div>}

    {active === "capabilities" && <Surface><SectionTitle icon={Sparkles} title="Capability provenance ledger" note="The effective result and its authoritative source"/><div className="grid gap-px bg-[var(--border-subtle)] sm:grid-cols-2 xl:grid-cols-3">{data.capabilities.map(item=><article key={item.id} className="bg-[var(--surface-1)] p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-medium text-[var(--text-primary)]">{item.name}</p><p className="mt-0.5 font-mono text-[10px] text-[var(--text-tertiary)]">{item.key}</p></div><span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full", item.enabled ? "bg-emerald-500/12 text-emerald-500" : "bg-[var(--surface-inset)] text-[var(--text-tertiary)]")}>{item.enabled ? <Check className="h-3.5 w-3.5"/> : <X className="h-3.5 w-3.5"/>}</span></div><p className="mt-3 line-clamp-2 min-h-8 text-xs text-[var(--text-secondary)]">{item.description || "No description available."}</p><div className="mt-4 flex items-center justify-between"><Badge variant="outline">{item.source}</Badge><span className="text-[10px] text-[var(--text-tertiary)]">{item.extended ? `Extended · ${formatDate(item.expires_at)}` : item.category}</span></div></article>)}</div></Surface>}

    {active === "addons" && <Surface><SectionTitle icon={Boxes} title="Assigned add-ons" note="Organization, event and activation-scoped commercial assignments"/>{data.addons.length ? <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">{data.addons.map(item=><article key={item.id} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-4"><div className="flex justify-between gap-3"><div><p className="text-sm font-semibold">{item.name}</p><p className="mt-1 font-mono text-[10px] text-[var(--text-tertiary)]">{item.key}</p></div><PackageCheck className="h-5 w-5 text-[var(--text-secondary)]"/></div><div className="mt-5 grid grid-cols-2 gap-3 text-xs"><div><p className="text-[var(--text-tertiary)]">Scope</p><p className="mt-1 font-medium capitalize">{item.scope}</p></div><div><p className="text-[var(--text-tertiary)]">Quantity</p><p className="mt-1 font-mono font-medium">{item.quantity}</p></div><div><p className="text-[var(--text-tertiary)]">Commercial value</p><p className="mt-1 font-medium">{formatMoney(item.unit_price * item.quantity, item.currency)}</p></div><div><p className="text-[var(--text-tertiary)]">Valid until</p><p className="mt-1 font-medium">{formatDate(item.expires_at)}</p></div></div></article>)}</div>:<Empty label="No add-ons are assigned to this organization."/>}</Surface>}

    {active === "events" && <div className="space-y-4"><div className="grid grid-cols-2 gap-3 lg:grid-cols-5"><Metric label="Purchased" value={events.purchased}/><Metric label="Reserved" value={events.reserved}/><Metric label="Consumed" value={events.consumed}/><Metric label="Remaining" value={events.remaining}/><Metric label="Actual records" value={events.actual_events}/></div><Surface><SectionTitle icon={CalendarDays} title="Activation lifecycle" note="Counts come from the event activation ledger"/><div className="grid gap-px bg-[var(--border-subtle)] sm:grid-cols-2 lg:grid-cols-4">{Object.keys(events.activations).length ? Object.entries(events.activations).map(([status,count])=><div key={status} className="bg-[var(--surface-1)] p-5"><p className="text-xs capitalize text-[var(--text-tertiary)]">{status.toLowerCase().replaceAll("_"," ")}</p><p className="mt-2 font-mono text-2xl font-semibold">{count}</p></div>):<div className="col-span-full"><Empty label="No event activations have been recorded."/></div>}</div></Surface></div>}

    {active === "people" && <div className="grid gap-4 lg:grid-cols-3"><Metric label="Organization members" value={data.people.members} note="Membership records"/><Metric label="Active users" value={data.usage.active_users} note="Latest calculated usage"/><Surface className="p-5"><div className="flex items-center gap-3"><KeyRound className="h-5 w-5 text-[var(--text-secondary)]"/><div><p className="text-sm font-medium">Owner</p><p className="mt-0.5 text-xs text-[var(--text-tertiary)]">{data.owner?.name ?? "Not assigned"}</p></div></div><p className="mt-4 truncate font-mono text-xs">{data.owner?.email ?? "—"}</p></Surface></div>}

    {active === "billing" && <div className="grid gap-4 lg:grid-cols-3"><Metric label="Invoices" value={data.billing.invoice_count}/><Metric label="Total invoiced" value={formatMoney(data.billing.invoiced_total, data.billing.currency)}/><Metric label="Billing currency" value={data.billing.currency}/></div>}

    {active === "audit" && <Surface><SectionTitle icon={ShieldCheck} title="Audit and activity ledger" note="Administrative and billing changes remain immutable"/><div className="flex min-h-48 flex-col items-center justify-center px-6 text-center"><FileClock className="h-7 w-7 text-[var(--text-tertiary)]"/><p className="mt-3 text-sm font-medium">Open the full audit ledger for detailed records</p><Button variant="outline" className="mt-4" onClick={()=>router.push(`/audit-logs?organization_id=${orgId}`)}>View audit ledger<ChevronRight className="ml-2 h-4 w-4"/></Button></div></Surface>}

    {active === "configuration" && <div className="grid gap-4 xl:grid-cols-2"><Surface><SectionTitle icon={Globe2} title="Delivery configuration"/><dl className="px-5"><Fact label="Billing email" value={profile.billing_email}/><Fact label="Custom domain" value={profile.custom_domain} mono/><Fact label="Portal name" value={profile.portal_name}/><Fact label="Locale" value={`${profile.language} · ${profile.country}`}/><Fact label="Timezone" value={profile.timezone}/></dl></Surface><Surface><SectionTitle icon={ShieldCheck} title="Lifecycle controls" note="Sensitive changes require a recorded reason"/><div className="p-5"><div className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-4"><div><p className="text-sm font-medium">Organization access</p><p className="mt-1 text-xs text-[var(--text-tertiary)]">{profile.is_active ? "Tenant users can currently access the platform." : `Suspended: ${profile.suspension_reason || "No reason recorded"}`}</p></div><Button variant="outline" onClick={()=>setStatusDialog(true)}>{profile.is_active ? "Suspend" : "Activate"}</Button></div></div></Surface></div>}

    {statusDialog && <div className="fixed inset-0 z-[100] grid place-items-start overflow-y-auto bg-black/65 p-4 pt-[8vh] backdrop-blur-sm" onMouseDown={(e)=>{if(e.target===e.currentTarget)setStatusDialog(false)}}><div role="dialog" aria-modal="true" aria-labelledby="status-title" className="mx-auto w-full max-w-lg rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-1)] shadow-2xl"><div className="flex items-start justify-between border-b border-[var(--border-subtle)] p-5"><div><h2 id="status-title" className="text-base font-semibold">{profile.is_active ? "Suspend organization" : "Activate organization"}</h2><p className="mt-1 text-xs text-[var(--text-tertiary)]">This action is recorded in the security audit ledger.</p></div><button aria-label="Close" className="rounded-lg p-2 hover:bg-[var(--surface-inset)]" onClick={()=>setStatusDialog(false)}><X className="h-4 w-4"/></button></div><div className="p-5"><label className="text-xs font-medium" htmlFor="status-reason">Reason</label><textarea id="status-reason" autoFocus rows={4} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Explain why this organization status is changing…" className="mt-2 w-full resize-none rounded-lg border border-[var(--border-strong)] bg-[var(--surface-inset)] p-3 text-sm outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"/><p className="mt-1 text-[10px] text-[var(--text-tertiary)]">Minimum 8 characters</p></div><div className="flex justify-end gap-2 border-t border-[var(--border-subtle)] p-4"><Button variant="outline" onClick={()=>setStatusDialog(false)}>Cancel</Button><Button onClick={submitStatus} disabled={statusMutation.isPending}>{statusMutation.isPending ? "Saving…" : profile.is_active ? "Suspend organization" : "Activate organization"}</Button></div></div></div>}
  </PageWrapper>;
}
