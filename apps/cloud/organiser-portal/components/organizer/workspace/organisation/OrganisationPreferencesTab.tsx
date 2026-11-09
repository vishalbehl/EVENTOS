"use client";

import Link from "next/link";
import { Bell, CalendarDays, ChevronRight, Languages, Mail, Settings2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { countryOptions, getCurrencyOptions, getTimezoneOptions, INDIA_DEFAULTS, languageOptions } from "@/lib/organisation-locale-options";
import { Panel } from "../OrganiserPrimitives";
import { Unavailable } from "../OrganiserSection";
import { OrganisationPage, OrganisationSaveActions, OrganisationSelect, useOrganisationEditor } from "./shared";

const timezoneOptions = getTimezoneOptions();
const currencyOptions = getCurrencyOptions();

export function OrganisationPreferencesTab() {
  const { query, form, setForm, save, discard, dirty, saving, navigationGuard } = useOrganisationEditor();
  const useIndiaDefaults = () => setForm({
    ...form,
    country: INDIA_DEFAULTS.country,
    timezone: INDIA_DEFAULTS.timezone,
    language: INDIA_DEFAULTS.language,
    date_format: INDIA_DEFAULTS.dateFormat,
    time_format: INDIA_DEFAULTS.timeFormat,
    currency: INDIA_DEFAULTS.currency,
  });

  return (
    <OrganisationPage actions={<OrganisationSaveActions dirty={dirty} saving={saving} onDiscard={discard} onSave={save} />}>
      {navigationGuard}
      {query.isError ? <Unavailable>Organisation preferences are unavailable.</Unavailable> : null}
      <Panel title="Language, locale & regional defaults" description="New events and communications inherit these values unless an event overrides them." action={<Button type="button" variant="outline" size="sm" onClick={useIndiaDefaults}>Use India defaults</Button>}>
        <div className="op-form-grid lg:grid-cols-3">
          <OrganisationSelect label="Country" value={form.country || INDIA_DEFAULTS.country} onChange={(event) => setForm({ ...form, country: event.target.value })}>
            {countryOptions.map((country) => <option key={country.code} value={country.code}>{country.flag} {country.name}</option>)}
          </OrganisationSelect>
          <OrganisationSelect label="Time zone" value={form.timezone || INDIA_DEFAULTS.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })}>
            {timezoneOptions.map((timezone) => <option key={timezone} value={timezone}>{timezone.replaceAll("_", " ")}</option>)}
          </OrganisationSelect>
          <OrganisationSelect label="Language" value={normalizeLanguage(form.language)} onChange={(event) => setForm({ ...form, language: event.target.value })}>
            {languageOptions.map((language) => <option key={language.value} value={language.value}>{language.label}</option>)}
          </OrganisationSelect>
          <OrganisationSelect label="Date format" value={form.date_format || INDIA_DEFAULTS.dateFormat} onChange={(event) => setForm({ ...form, date_format: event.target.value })}>
            <option value="DD/MM/YYYY">DD/MM/YYYY — 06/01/2026</option>
            <option value="MM/DD/YYYY">MM/DD/YYYY — 01/06/2026</option>
            <option value="YYYY-MM-DD">YYYY-MM-DD — 2026-01-06</option>
            <option value="DD MMM YYYY">DD MMM YYYY — 06 Jan 2026</option>
          </OrganisationSelect>
          <OrganisationSelect label="Time format" value={form.time_format || INDIA_DEFAULTS.timeFormat} onChange={(event) => setForm({ ...form, time_format: event.target.value })}>
            <option value="12 Hour">12 hour — 1:30 PM</option>
            <option value="24 Hour">24 hour — 13:30</option>
          </OrganisationSelect>
          <OrganisationSelect label="Currency" value={String(form.currency || INDIA_DEFAULTS.currency).split(/\s|\(/)[0]} onChange={(event) => setForm({ ...form, currency: event.target.value })}>
            {currencyOptions.map((currency) => <option key={currency.code} value={currency.code}>{currency.label}</option>)}
          </OrganisationSelect>
        </div>
      </Panel>

      <div className="organisation-preference-grid">
        <PreferenceLink icon={<CalendarDays />} title="Event defaults" description="Duration, registration, and session defaults." href="/settings/general" />
        <PreferenceLink icon={<Users />} title="Registration defaults" description="Workflow, fields, and approval settings." href="/events" />
        <PreferenceLink icon={<Mail />} title="Communication defaults" description="Email templates, sender identity, and channels." href="/settings/email-templates" />
        <PreferenceLink icon={<Languages />} title="Workspaces & branches" description="Location-specific teams, time zones, and owners." href="/organisation/branches" />
        <PreferenceLink icon={<Bell />} title="Notifications" description="Organisation alerts and notification routing." href="/settings/notifications" />
        <PreferenceLink icon={<Settings2 />} title="Integrations" description="Connected services, API access, and webhooks." href="/organisation/integrations" />
      </div>
    </OrganisationPage>
  );
}

function normalizeLanguage(value?: string) {
  if (!value || value === "English") return INDIA_DEFAULTS.language;
  return languageOptions.some((language) => language.value === value) ? value : INDIA_DEFAULTS.language;
}

function PreferenceLink({ icon, title, description, href }: { icon: React.ReactNode; title: string; description: string; href: string }) {
  return (
    <Link href={href} className="organisation-preference-card">
      <span className="organisation-preference-icon">{icon}</span>
      <span className="min-w-0 flex-1"><strong>{title}</strong><small>{description}</small></span>
      <ChevronRight className="size-4 shrink-0" aria-hidden />
    </Link>
  );
}
