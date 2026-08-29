"use client";

import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "../OrganiserPrimitives";
import { Unavailable } from "../OrganiserSection";
import { OrganisationPage, useOrganisationEditor } from "./shared";

export function OrganisationPreferencesTab() {
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
        <Unavailable>Regional preferences are unavailable.</Unavailable>
      ) : null}
      <Panel title="Regional preferences">
        <div className="op-form-grid">
          <label>
            Country code
            <Input
              maxLength={2}
              value={form.country || ""}
              onChange={(e) =>
                setForm({ ...form, country: e.target.value.toUpperCase() })
              }
            />
          </label>
          <label>
            Timezone
            <Input
              value={form.timezone || ""}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            />
          </label>
          <label>
            Language
            <Input
              value={form.language || ""}
              onChange={(e) => setForm({ ...form, language: e.target.value })}
            />
          </label>
          <label>
            Date format
            <select
              className="op-select mt-2 w-full"
              value={form.date_format || "DD/MM/YYYY"}
              onChange={(e) =>
                setForm({ ...form, date_format: e.target.value })
              }
            >
              <option>DD/MM/YYYY</option>
              <option>MM/DD/YYYY</option>
              <option>YYYY-MM-DD</option>
            </select>
          </label>
          <label>
            Time format
            <select
              className="op-select mt-2 w-full"
              value={form.time_format || "24 Hour"}
              onChange={(e) =>
                setForm({ ...form, time_format: e.target.value })
              }
            >
              <option>24 Hour</option>
              <option>12 Hour</option>
            </select>
          </label>
          <label>
            Currency
            <Input
              value={form.currency || ""}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            />
          </label>
        </div>
      </Panel>
    </OrganisationPage>
  );
}
