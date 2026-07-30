"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useUpdateEventSettings } from "@/features/organizations/api/organization-console-api";
import { OrgCard, OrgSectionTitle } from "./OrgPageShared";

type EventSettings = {
  name: string;
  short_code: string;
  start_date: string;
  end_date: string;
  timezone: string;
  venue_name: string;
  location: string;
  country: string;
  max_file_size_mb: string;
  allowed_formats: string;
};

const empty: EventSettings = {
  name: "",
  short_code: "",
  start_date: "",
  end_date: "",
  timezone: "UTC",
  venue_name: "",
  location: "",
  country: "",
  max_file_size_mb: "500",
  allowed_formats: "pptx, pdf, mp4",
};

export function EventSettingsControlPanel({
  orgId,
  eventId,
  data,
}: {
  orgId: string;
  eventId: string;
  data: Record<string, unknown>;
}) {
  const event = (data.event ?? {}) as Record<string, unknown>;
  const mutation = useUpdateEventSettings(orgId, eventId);
  const [form, setForm] = useState<EventSettings>(empty);
  const [reason, setReason] = useState("");
  const [caseReference, setCaseReference] = useState("");

  useEffect(() => {
    setForm({
      name: String(event.name ?? ""),
      short_code: String(event.short_code ?? ""),
      start_date: String(event.start_date ?? "").slice(0, 10),
      end_date: String(event.end_date ?? "").slice(0, 10),
      timezone: String(event.timezone ?? "UTC"),
      venue_name: String(event.venue_name ?? ""),
      location: String(event.location ?? ""),
      country: String(event.country ?? ""),
      max_file_size_mb: String(event.max_file_size_mb ?? 500),
      allowed_formats: Array.isArray(event.allowed_formats)
        ? event.allowed_formats.join(", ")
        : String(event.allowed_formats ?? ""),
    });
  }, [eventId, event.name, event.updated_at]);

  const update = (key: keyof EventSettings, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const valid =
    form.name.trim().length >= 2 &&
    form.short_code.trim().length >= 2 &&
    Boolean(form.start_date && form.end_date) &&
    reason.trim().length >= 12 &&
    caseReference.trim().length >= 2;

  const save = async () => {
    if (!valid) return;
    try {
      await mutation.mutateAsync({
        data: {
          name: form.name.trim(),
          short_code: form.short_code.trim().toUpperCase(),
          start_date: form.start_date,
          end_date: form.end_date,
          timezone: form.timezone.trim(),
          venue_name: form.venue_name.trim() || null,
          location: form.location.trim() || null,
          country: form.country.trim() || null,
          max_file_size_mb: Number(form.max_file_size_mb),
          allowed_formats: form.allowed_formats
            .split(",")
            .map((item) => item.trim().toLowerCase())
            .filter(Boolean),
        },
        reason,
        case_reference: caseReference,
      });
      toast.success("Event settings updated through the shared event service");
      setReason("");
      setCaseReference("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Event settings update failed");
    }
  };

  const fields: Array<{
    key: keyof EventSettings;
    label: string;
    type?: string;
  }> = [
    { key: "name", label: "Event title" },
    { key: "short_code", label: "Short code" },
    { key: "start_date", label: "Start date", type: "date" },
    { key: "end_date", label: "End date", type: "date" },
    { key: "timezone", label: "Timezone" },
    { key: "venue_name", label: "Venue" },
    { key: "location", label: "Location" },
    { key: "country", label: "Country" },
    { key: "max_file_size_mb", label: "Maximum file size (MB)", type: "number" },
    { key: "allowed_formats", label: "Allowed formats (comma separated)" },
  ];

  return (
    <OrgCard className="border-[var(--brand-primary)]/20">
      <OrgSectionTitle>Governed event configuration</OrgSectionTitle>
      <p className="mb-4 text-[10px] text-[var(--text-tertiary)]">
        Uses the same validation and capability gates as Organizer Portal, with privileged attribution added by Command Center.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {fields.map((field) => (
          <label key={field.key} className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            {field.label}
            <input
              type={field.type ?? "text"}
              value={form[field.key]}
              onChange={(event) => update(field.key, event.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs font-normal normal-case tracking-normal text-[var(--text-primary)]"
            />
          </label>
        ))}
        <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          Case reference
          <input value={caseReference} onChange={(event) => setCaseReference(event.target.value)} className="mt-1 w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs font-normal normal-case tracking-normal" />
        </label>
        <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          Administrative reason
          <input value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs font-normal normal-case tracking-normal" />
        </label>
      </div>
      <button
        disabled={!valid || mutation.isPending}
        onClick={save}
        className="mt-4 rounded-xl bg-[var(--brand-primary)] px-4 py-2 text-xs font-bold text-[var(--primary-contrast)] disabled:opacity-40"
      >
        Save governed settings
      </button>
    </OrgCard>
  );
}
