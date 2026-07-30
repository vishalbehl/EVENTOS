"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useProvisionOrganizationEvent } from "@/features/organizations/api/organization-console-api";

const initialForm = {
  name: "",
  shortCode: "",
  status: "draft" as "draft" | "active",
  startDate: "",
  endDate: "",
  timezone: "Asia/Kolkata",
  location: "",
  venueName: "",
  country: "",
  currency: "INR",
  reason: "",
  caseReference: "",
};

export function EventProvisionControl({ orgId }: { orgId: string }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const provision = useProvisionOrganizationEvent(orgId);
  const valid =
    form.name.trim().length >= 2 &&
    /^[A-Z0-9-]{2,20}$/.test(form.shortCode) &&
    Boolean(form.startDate) &&
    Boolean(form.endDate) &&
    form.endDate >= form.startDate &&
    form.reason.trim().length >= 12 &&
    form.caseReference.trim().length >= 2;

  const update = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const close = () => {
    if (provision.isPending) return;
    setOpen(false);
    setForm(initialForm);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : close())}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-xl bg-[var(--brand-primary)] px-3 py-2 text-xs font-bold text-[var(--primary-contrast)] transition-colors hover:bg-[var(--brand-primary-hover)]"
        >
          <Plus className="h-3.5 w-3.5" />
          Provision Event
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm font-black">
            Provision organization event
          </DialogTitle>
          <DialogDescription className="text-xs">
            Creates the event inside the selected organization, seeds its
            default portal configuration, and records the real platform actor.
            Commercial activation remains a separate governed contract action.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Event name">
            <input
              autoFocus
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
              className="input"
            />
          </Field>
          <Field label="Short code">
            <input
              value={form.shortCode}
              onChange={(event) =>
                update(
                  "shortCode",
                  event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""),
                )
              }
              maxLength={20}
              placeholder="EVT26"
              className="input font-mono"
            />
          </Field>
          <Field label="Start date">
            <input
              type="date"
              value={form.startDate}
              onChange={(event) => update("startDate", event.target.value)}
              className="input"
            />
          </Field>
          <Field label="End date">
            <input
              type="date"
              min={form.startDate || undefined}
              value={form.endDate}
              onChange={(event) => update("endDate", event.target.value)}
              className="input"
            />
          </Field>
          <Field label="Timezone">
            <input
              value={form.timezone}
              onChange={(event) => update("timezone", event.target.value)}
              className="input"
            />
          </Field>
          <Field label="Initial state">
            <select
              value={form.status}
              onChange={(event) => update("status", event.target.value)}
              className="input"
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
            </select>
          </Field>
          <Field label="Location">
            <input
              value={form.location}
              onChange={(event) => update("location", event.target.value)}
              className="input"
            />
          </Field>
          <Field label="Venue">
            <input
              value={form.venueName}
              onChange={(event) => update("venueName", event.target.value)}
              className="input"
            />
          </Field>
          <Field label="Country">
            <input
              value={form.country}
              onChange={(event) => update("country", event.target.value)}
              className="input"
            />
          </Field>
          <Field label="Currency">
            <input
              value={form.currency}
              onChange={(event) =>
                update(
                  "currency",
                  event.target.value.toUpperCase().replace(/[^A-Z]/g, ""),
                )
              }
              maxLength={3}
              className="input font-mono"
            />
          </Field>
          <Field label="Case reference">
            <input
              value={form.caseReference}
              onChange={(event) => update("caseReference", event.target.value)}
              className="input"
            />
          </Field>
          <Field label="Administrative reason">
            <textarea
              value={form.reason}
              onChange={(event) => update("reason", event.target.value)}
              minLength={12}
              className="input min-h-20"
            />
          </Field>
        </div>

        {form.startDate && form.endDate && form.endDate < form.startDate && (
          <p className="text-xs font-bold text-[var(--status-danger)]">
            End date must be on or after the start date.
          </p>
        )}

        <DialogFooter>
          <button
            type="button"
            onClick={close}
            disabled={provision.isPending}
            className="rounded-xl px-4 py-2 text-xs font-bold text-[var(--text-secondary)]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!valid || provision.isPending}
            onClick={async () => {
              try {
                await provision.mutateAsync({
                  data: {
                    name: form.name.trim(),
                    short_code: form.shortCode,
                    status: form.status,
                    start_date: form.startDate,
                    end_date: form.endDate,
                    timezone: form.timezone.trim(),
                    location: form.location.trim() || undefined,
                    venue_name: form.venueName.trim() || undefined,
                    country: form.country.trim() || undefined,
                    currency: form.currency || "INR",
                  },
                  reason: form.reason.trim(),
                  case_reference: form.caseReference.trim(),
                });
                toast.success("Event provisioned");
                setOpen(false);
                setForm(initialForm);
              } catch (error) {
                toast.error("Event provisioning failed");
              }
            }}
            className="rounded-xl bg-[var(--brand-primary)] px-4 py-2 text-xs font-bold text-[var(--primary-contrast)] disabled:opacity-40"
          >
            {provision.isPending ? "Provisioning…" : "Provision event"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-xs text-[var(--text-secondary)]">
      {label}
      <div className="[&_.input]:mt-1 [&_.input]:w-full [&_.input]:rounded-xl [&_.input]:border [&_.input]:border-[var(--border-default)] [&_.input]:bg-[var(--bg-surface-3)] [&_.input]:px-3 [&_.input]:py-2 [&_.input]:text-[var(--text-primary)] [&_.input]:outline-none">
        {children}
      </div>
    </label>
  );
}
