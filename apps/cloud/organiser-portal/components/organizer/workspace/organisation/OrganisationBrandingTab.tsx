"use client";

import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "../OrganiserPrimitives";
import { Unavailable } from "../OrganiserSection";
import { OrganisationPage, useOrganisationEditor } from "./shared";

export function OrganisationBrandingTab() {
  const { query, form, setForm, save, discard, dirty, saving, navigationGuard } =
    useOrganisationEditor();
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
        <Unavailable>Organisation branding is unavailable.</Unavailable>
      ) : null}
      <Panel title="Brand identity">
        <div className="op-form-grid">
          <label>
            Logo URL
            <Input
              value={form.logo_url || ""}
              onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
            />
          </label>
          <label>
            Portal name
            <Input
              value={form.portal_name || ""}
              onChange={(e) =>
                setForm({ ...form, portal_name: e.target.value })
              }
            />
          </label>
          {(["primary_color", "secondary_color"] as const).map((key) => (
            <label key={key}>
              {key === "primary_color" ? "Primary colour" : "Secondary colour"}
              <div className="flex gap-2">
                <input
                  aria-label={key}
                  type="color"
                  className="h-10 w-12 rounded-md border border-[var(--op-border)]"
                  value={
                    form[key] ||
                    (key === "primary_color" ? "#7c3aed" : "#ff426d")
                  }
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
                <Input
                  value={form[key] || ""}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </div>
            </label>
          ))}
        </div>
        <div
          className="mt-5 rounded-md border border-[var(--op-border)] bg-[var(--op-page-bg)] p-5"
          style={{ borderTopColor: form.primary_color }}
        >
          <p className="font-extrabold" style={{ color: form.primary_color }}>
            {form.portal_name || form.name || "Organisation"}
          </p>
          <p className="mt-1 text-sm text-[var(--op-muted)]">
            Brand preview in the current theme
          </p>
        </div>
      </Panel>
    </OrganisationPage>
  );
}
