"use client";

import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "../OrganiserPrimitives";
import { Unavailable } from "../OrganiserSection";
import { OrganisationPage, useOrganisationEditor } from "./shared";

export function OrganisationDetailsTab() {
  const { query, form, setForm, save, discard, dirty, saving, navigationGuard } =
    useOrganisationEditor();
  const field = (key: string) => ({
    value: form[key] || "",
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      setForm({ ...form, [key]: event.target.value }),
  });
  const address = form.billing_address || {};
  return (
    <OrganisationPage
      actions={
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={discard}
            disabled={!dirty || saving}
          >
            Discard
          </Button>
          <Button onClick={save} disabled={!dirty || saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </div>
      }
    >
      {navigationGuard}
      {query.isError ? (
        <Unavailable>Organisation details are unavailable.</Unavailable>
      ) : null}
      <Panel title="Identity and legal details">
        <div className="op-form-grid">
          <label>
            Organisation name
            <Input {...field("name")} />
          </label>
          <label>
            Legal name
            <Input {...field("legal_name")} />
          </label>
          <label>
            Registration number
            <Input {...field("registration_number")} />
          </label>
          <label>
            Organisation type
            <Input {...field("organization_type")} />
          </label>
          <label>
            Industry
            <Input {...field("industry")} />
          </label>
          <label>
            Website
            <Input type="url" {...field("website_url")} />
          </label>
        </div>
      </Panel>
      <Panel title="Contact and billing">
        <div className="op-form-grid">
          <label>
            Primary contact email
            <Input type="email" {...field("contact_email")} />
          </label>
          <label>
            Primary contact phone
            <Input type="tel" {...field("contact_phone")} />
          </label>
          <label>
            Billing email
            <Input type="email" {...field("billing_email")} />
          </label>
          <label>
            Address line
            <Input
              value={address.line1 || ""}
              onChange={(event) =>
                setForm({
                  ...form,
                  billing_address: { ...address, line1: event.target.value },
                })
              }
            />
          </label>
          <label>
            City
            <Input
              value={address.city || ""}
              onChange={(event) =>
                setForm({
                  ...form,
                  billing_address: { ...address, city: event.target.value },
                })
              }
            />
          </label>
          <label>
            Postal code
            <Input
              value={address.postal_code || ""}
              onChange={(event) =>
                setForm({
                  ...form,
                  billing_address: {
                    ...address,
                    postal_code: event.target.value,
                  },
                })
              }
            />
          </label>
        </div>
      </Panel>
    </OrganisationPage>
  );
}
