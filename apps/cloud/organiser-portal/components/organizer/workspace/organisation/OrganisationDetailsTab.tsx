"use client";

import Link from "next/link";
import { Building2, CalendarDays, ExternalLink, Eye, Globe2, Landmark, Save, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOrganiserDashboard } from "@/hooks/useOrganiserDashboard";
import { countryOptions } from "@/lib/organisation-locale-options";
import { Panel, StatusBadge } from "../OrganiserPrimitives";
import { Unavailable } from "../OrganiserSection";
import { OrganisationField, OrganisationPage, OrganisationSaveActions, OrganisationSelect, useOrganisationEditor } from "./shared";

const apiOrigin = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

export function OrganisationDetailsTab() {
  const editor = useOrganisationEditor();
  const dashboard = useOrganiserDashboard();
  const { query, form, setForm, save, discard, dirty, saving, navigationGuard } = editor;
  const profile = query.data;
  const commercial = dashboard.data?.commercial;
  const metrics = dashboard.data?.metrics;
  const logoSource = form.logo_url?.startsWith("/") ? `${apiOrigin}${form.logo_url}` : form.logo_url;

  return <OrganisationPage actions={<OrganisationSaveActions dirty={dirty} saving={saving} onDiscard={discard} onSave={save} />}>
    {navigationGuard}
    {query.isError ? <Unavailable>Organisation details are unavailable.</Unavailable> : null}
    <div className="grid gap-4 xl:grid-cols-[1.3fr_.9fr]">
      <Panel title="Organisation profile" description="Authoritative identity used across your organiser workspace.">
        <div className="grid gap-5 md:grid-cols-[150px_1fr]">
          <div className="grid h-36 place-items-center rounded-[24px] bg-gradient-to-br from-[#f1ebff] to-[#fff] text-[var(--org-purple)] dark:from-[#33245c] dark:to-[#1a1a28]">
            {logoSource ? <img src={logoSource} alt="Organisation logo" className="max-h-24 max-w-28 object-contain" /> : <Building2 className="size-16" />}
          </div>
          <div className="op-form-grid">
            <OrganisationField label="Organisation name" required value={form.name || ""} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            <OrganisationSelect label="Organisation type" required value={form.organization_type || "conference_organiser"} onChange={(event) => setForm({ ...form, organization_type: event.target.value })}>
              <option value="conference_organiser">Event organiser</option>
              <option value="professional_society">Professional society</option>
              <option value="association">Association</option>
              <option value="corporate">Corporate</option>
              <option value="education">Education</option>
              <option value="government">Government</option>
              <option value="non_profit">Non-profit</option>
              <option value="other">Other</option>
            </OrganisationSelect>
            <OrganisationSelect label="Industry / domain" value={form.industry || ""} onChange={(event) => setForm({ ...form, industry: event.target.value })}>
              <option value="">Select an industry</option>
              {['Healthcare & Medical','Technology','Education','Finance & Banking','Pharmaceuticals','Government & Public Sector','Professional Services','Travel & Hospitality','Media & Entertainment','Manufacturing','Retail & Commerce','Non-profit','Other'].map((industry) => <option key={industry} value={industry}>{industry}</option>)}
            </OrganisationSelect>
            <OrganisationSelect label="Country" value={form.country || "IN"} onChange={(event) => setForm({ ...form, country: event.target.value })}>
              {countryOptions.map((country) => <option key={country.code} value={country.code}>{country.flag} {country.name}</option>)}
            </OrganisationSelect>
            <OrganisationField className="md:col-span-2" label="Website" type="url" inputMode="url" icon={<Globe2 className="size-4" />} placeholder="https://www.example.org" value={form.website_url || ""} onChange={(event) => setForm({ ...form, website_url: event.target.value })} />
            <OrganisationField label="Legal name" icon={<Landmark className="size-4" />} value={form.legal_name || ""} onChange={(event) => setForm({ ...form, legal_name: event.target.value })} />
            <OrganisationField label="Registration number" value={form.registration_number || ""} onChange={(event) => setForm({ ...form, registration_number: event.target.value })} />
          </div>
        </div>
      </Panel>
      <Panel title="Organisation Status">
        <div className="rounded-2xl bg-[color-mix(in_srgb,var(--org-green)_13%,transparent)] p-4"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-full bg-[var(--org-green)] text-white"><ShieldCheck className="size-5" /></span><div><strong className="block">{profile?.verification_status === "VERIFIED" ? "Verified Organisation" : "Organisation verification"}</strong><span className="text-xs text-[var(--org-muted)]">{profile?.lifecycle_state === "ACTIVE" ? "Your organisation is active and in good standing." : `Current state: ${profile?.lifecycle_state || "Unavailable"}`}</span></div></div></div>
        <dl className="mt-3 divide-y divide-[var(--org-border)] text-sm">
          <StatusRow label="Member since" value={profile?.member_since ? new Date(profile.member_since).toLocaleDateString() : "Unavailable"} />
          <StatusRow label="Current plan" value={commercial?.offer_name || "Not configured"} />
          <StatusRow label="Plan valid till" value={commercial?.valid_till ? new Date(commercial.valid_till).toLocaleDateString() : commercial?.unrestricted ? "No expiry" : "Unavailable"} />
          <StatusRow label="Plan status" value={<StatusBadge status={commercial?.status || "Unavailable"} />} />
          <StatusRow label="Team members" value={metrics?.team_members == null ? "Unavailable" : String(metrics.team_members)} />
        </dl>
      </Panel>
    </div>

    <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
      <Panel title="About Organisation" description="This description appears across your events and public portals.">
        <textarea value={form.description || ""} maxLength={500} onChange={(event) => setForm({ ...form, description: event.target.value })} className="organisation-textarea min-h-36 w-full resize-y" placeholder="Describe your organisation, its purpose and the events it runs." />
        <p className="mt-2 text-right text-xs text-[var(--org-muted)]">{String(form.description || "").length} / 500</p>
      </Panel>
      <Panel title="Logo & Identity" description="Manage public-facing brand assets in Branding.">
        <div className="grid gap-3 sm:grid-cols-2"><BrandAsset label="Organisation logo" value={form.logo_url} /><BrandAsset label="Portal identity" value={form.portal_name || form.name} /></div>
        <Button asChild variant="outline" className="mt-4"><Link href="/organisation/branding">Manage brand assets</Link></Button>
      </Panel>
    </div>

    <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
      <Panel title="Quick Info"><div className="grid gap-3 sm:grid-cols-3"><QuickInfo icon={<Users className="size-5" />} value={metrics?.team_members} label="Team members" /><QuickInfo icon={<CalendarDays className="size-5" />} value={metrics?.active_events} label="Active events" /><QuickInfo icon={<ShieldCheck className="size-5" />} value={metrics?.total_registrations} label="Registrations" /></div></Panel>
      <Panel title="Organisation actions" description="Manage the organisation profile and public identity."><div className="grid gap-3 sm:grid-cols-3"><ActionLink href="/organisation/profile" label="Edit details" icon={<Save className="size-5" />} /><ActionLink href="/organisation/branding" label="Preview profile" icon={<Eye className="size-5" />} /><ActionLink href={form.website_url || "/organisation/profile"} label="View public page" icon={<ExternalLink className="size-5" />} external={Boolean(form.website_url)} /></div></Panel>
    </div>
  </OrganisationPage>;
}

function StatusRow({ label, value }: { label: string; value: React.ReactNode }) { return <div className="flex items-center justify-between gap-4 py-3"><dt className="text-[var(--org-muted)]">{label}</dt><dd className="font-semibold">{value}</dd></div>; }
function BrandAsset({ label, value }: { label: string; value?: string }) { return <div className="rounded-2xl border border-[var(--org-border)] p-4"><span className="text-xs text-[var(--org-muted)]">{label}</span><strong className="mt-2 block truncate text-sm">{value || "Not configured"}</strong></div>; }
function QuickInfo({ icon, value, label }: { icon: React.ReactNode; value?: number; label: string }) { return <div className="flex items-center gap-3 rounded-2xl bg-[var(--org-surface-soft)] p-4"><span className="text-[var(--org-purple)]">{icon}</span><span><strong className="block text-xl">{value == null ? "—" : value.toLocaleString()}</strong><span className="text-xs text-[var(--org-muted)]">{label}</span></span></div>; }
function ActionLink({ href, label, icon, external }: { href: string; label: string; icon: React.ReactNode; external?: boolean }) { return <Link href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined} className="organisation-action-card">{icon}<span>{label}</span></Link>; }
