"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Building2, Globe2, Mail, MapPin, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fallbackCountryStates, fetchCountryStates, getStatesForCountry, type CountryStateEntry } from "@/lib/country-states";
import { countryByCodeOrName, countryOptions, INDIA_DEFAULTS } from "@/lib/organisation-locale-options";
import { Panel } from "../OrganiserPrimitives";
import { OrganisationField, OrganisationPage, OrganisationSaveActions, OrganisationSelect, useOrganisationEditor } from "./shared";

export function OrganisationContactTab() {
  const { form, setForm, save, discard, dirty, saving, navigationGuard } = useOrganisationEditor();
  const [countryStates, setCountryStates] = useState<CountryStateEntry[]>(fallbackCountryStates);
  useEffect(() => { void fetchCountryStates().then(setCountryStates); }, []);

  const address = form.billing_address || {};
  const addressCountry = countryByCodeOrName(address.country)?.code || form.country || INDIA_DEFAULTS.country;
  const addressCountryName = countryByCodeOrName(addressCountry)?.name || "India";
  const stateOptions = useMemo(
    () => getStatesForCountry(countryStates, addressCountryName),
    [addressCountryName, countryStates],
  );
  const phone = splitPhone(form.contact_phone);

  const updateAddress = (key: string, value: string) => setForm({
    ...form,
    billing_address: { ...address, [key]: value },
  });
  const updatePhone = (dialCode: string, number: string) => setForm({
    ...form,
    contact_phone: number.trim() ? `${dialCode} ${number.trimStart()}` : dialCode,
  });

  return (
    <OrganisationPage actions={<OrganisationSaveActions dirty={dirty} saving={saving} onDiscard={discard} onSave={save} />}>
      {navigationGuard}
      <Panel title="Contact information" description="Add verified contact details for organisation-level communication.">
        <div className="op-form-grid lg:grid-cols-3">
          <OrganisationField label="Primary email" required type="email" inputMode="email" autoComplete="email" icon={<Mail className="size-4" />} placeholder="contact@example.org" value={form.contact_email || ""} onChange={(event) => setForm({ ...form, contact_email: event.target.value })} />
          <label className="organisation-field">
            <span className="organisation-field-label">Phone</span>
            <span className="organisation-phone-control">
              <select aria-label="Phone country code" value={phone.dialCode} onChange={(event) => updatePhone(event.target.value, phone.number)}>
                {countryOptions.map((country) => <option key={`${country.code}-${country.dialCode}`} value={country.dialCode}>{country.flag} {country.dialCode} · {country.name}</option>)}
              </select>
              <span className="organisation-field-control"><span className="organisation-field-icon" aria-hidden><Phone className="size-4" /></span><input aria-label="Phone number" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="98765 43210" value={phone.number} onChange={(event) => updatePhone(phone.dialCode, event.target.value.replace(/[^0-9()\-\s]/g, ""))} /></span>
            </span>
          </label>
          <OrganisationField label="Website" type="url" inputMode="url" autoComplete="url" icon={<Globe2 className="size-4" />} placeholder="https://www.example.org" value={form.website_url || ""} onChange={(event) => setForm({ ...form, website_url: event.target.value })} />
          <OrganisationField label="Billing email" type="email" inputMode="email" autoComplete="email" icon={<Mail className="size-4" />} placeholder="billing@example.org" value={form.billing_email || ""} onChange={(event) => setForm({ ...form, billing_email: event.target.value })} />
        </div>
      </Panel>

      <Panel title="Primary address" description="Used for legal, billing, tax, and commercial correspondence." action={<Button asChild variant="outline" size="sm"><Link href="/organisation/branches"><Building2 className="mr-2 size-4" />Manage other locations</Link></Button>}>
        <div className="op-form-grid lg:grid-cols-3">
          <OrganisationField className="lg:col-span-2" label="Address line 1" required autoComplete="address-line1" icon={<MapPin className="size-4" />} value={address.line1 || ""} onChange={(event) => updateAddress("line1", event.target.value)} />
          <OrganisationField label="Address line 2" autoComplete="address-line2" value={address.line2 || ""} onChange={(event) => updateAddress("line2", event.target.value)} />
          <OrganisationSelect label="Country" required autoComplete="country" value={addressCountry} onChange={(event) => {
            const nextCountry = countryByCodeOrName(event.target.value);
            setForm({ ...form, billing_address: { ...address, country: nextCountry?.code || event.target.value, state: "" } });
          }}>
            {countryOptions.map((country) => <option key={country.code} value={country.code}>{country.flag} {country.name}</option>)}
          </OrganisationSelect>
          {stateOptions.length ? (
            <OrganisationSelect label="State / province" required autoComplete="address-level1" value={address.state || ""} onChange={(event) => updateAddress("state", event.target.value)}>
              <option value="">Select a state or province</option>
              {stateOptions.map((state) => <option key={state} value={state}>{state}</option>)}
            </OrganisationSelect>
          ) : (
            <OrganisationField label="State / province" required autoComplete="address-level1" value={address.state || ""} onChange={(event) => updateAddress("state", event.target.value)} />
          )}
          <OrganisationField label="City" required autoComplete="address-level2" value={address.city || ""} onChange={(event) => updateAddress("city", event.target.value)} />
          <OrganisationField label="Postal code" required inputMode="numeric" autoComplete="postal-code" value={address.postal_code || ""} onChange={(event) => updateAddress("postal_code", event.target.value)} />
        </div>
      </Panel>
    </OrganisationPage>
  );
}

function splitPhone(value?: string) {
  const normalized = String(value || "").trim();
  const matched = [...countryOptions]
    .sort((left, right) => right.dialCode.length - left.dialCode.length)
    .find((country) => normalized.startsWith(country.dialCode));
  const dialCode = matched?.dialCode || INDIA_DEFAULTS.dialCode;
  return { dialCode, number: normalized.startsWith(dialCode) ? normalized.slice(dialCode.length).trimStart() : normalized };
}
