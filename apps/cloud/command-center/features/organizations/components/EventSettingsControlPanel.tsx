"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useEventDomainWorkspace, useUpdateEventSettings } from "@/features/organizations/api/organization-console-api";
import { OrgCard, OrgSectionTitle } from "./OrgPageShared";
import { ApiError } from "@/lib/api-client";

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

const emptyEvent: Record<string, unknown> = {};

export function EventSettingsControlPanel({
  orgId,
  eventId,
  data,
}: {
  orgId: string;
  eventId: string;
  data: Record<string, unknown>;
}) {
  const scope = `${orgId}:${eventId}`;
  const [reloadedEvent, setReloadedEvent] = useState<{
    scope: string; event: Record<string, unknown>;
  } | null>(null);
  const event = reloadedEvent?.scope === scope
    ? reloadedEvent.event : (data.event ?? emptyEvent) as Record<string, unknown>;
  const mutation = useUpdateEventSettings(orgId, eventId);
  const settingsQuery = useEventDomainWorkspace(orgId, eventId, "settings");
  const [reloading, setReloading] = useState(false);
  const [form, setForm] = useState<EventSettings>(empty);
  const [reason, setReason] = useState("");
  const [caseReference, setCaseReference] = useState("");
  const [version, setVersion] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const receipt = useRef<{ fingerprint: string; key: string } | null>(null);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const loadedScope = useRef<string | null>(null);

  useEffect(() => {
    const changedScope = loadedScope.current !== scope;
    if (!changedScope && dirty) return;
    loadedScope.current = scope;
    if (changedScope) {
      setReloadedEvent(null);
      setDirty(false);
      setReason("");
      setCaseReference("");
      setFailure(null);
      setReloading(false);
      receipt.current = null;
    }
    if (String(event.id ?? "") !== eventId) {
      setVersion(null);
      setForm(empty);
      return;
    }
    setVersion(typeof event.version === "number" && Number.isInteger(event.version)
      && event.version > 0 ? event.version : null);
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
  }, [scope, event, dirty]);

  const update = (key: keyof EventSettings, value: string) => {
    setDirty(true);
    setForm((current) => ({ ...current, [key]: value }));
  };
  const valid =
    form.name.trim().length >= 2 &&
    form.short_code.trim().length >= 2 &&
    Boolean(form.start_date && form.end_date) &&
    form.end_date >= form.start_date &&
    Number.isInteger(Number(form.max_file_size_mb)) &&
    Number(form.max_file_size_mb) >= 1 && Number(form.max_file_size_mb) <= 2048 &&
    reason.trim().length >= 12 &&
    caseReference.trim().length >= 2;

  const reloadCurrent = async () => {
    const requestedScope = scope;
    setReloading(true);
    try {
      const refreshed = await settingsQuery.refetch({ throwOnError: true });
      if (currentScope.current !== requestedScope) return;
      if (!refreshed.data?.availability.available) {
        throw new Error("Current settings are unavailable. Your edits are preserved.");
      }
      const latest = refreshed.data.data.event as Record<string, unknown> | undefined;
      if (!latest || String(latest.id) !== eventId || typeof latest.version !== "number") {
        throw new Error("Current settings have no valid version. Your edits are preserved.");
      }
      setReloadedEvent({ scope: requestedScope, event: latest });
      receipt.current = null;
      setFailure(null);
      setDirty(false);
    } catch (error) {
      if (currentScope.current === requestedScope) {
        setFailure(error instanceof Error ? error.message : "Reload failed. Your edits are preserved.");
      }
    } finally {
      if (currentScope.current === requestedScope) setReloading(false);
    }
  };

  const save = async () => {
    if (!valid || version === null || mutation.isPending || loadedScope.current !== scope) return;
    const submittedScope = scope;
    setFailure(null);
    try {
      const payload = {
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
        reason: reason.trim(),
        case_reference: caseReference.trim(),
        version,
      };
      const fingerprint = JSON.stringify(payload);
      if (receipt.current?.fingerprint !== fingerprint) {
        receipt.current = { fingerprint, key: crypto.randomUUID() };
      }
      await mutation.mutateAsync({ ...payload, idempotencyKey: receipt.current.key });
      if (currentScope.current !== submittedScope) return;
      toast.success("Event settings updated through the shared event service");
      receipt.current = null;
      setDirty(false);
      setReloadedEvent(null);
      setReason("");
      setCaseReference("");
    } catch (error) {
      if (currentScope.current !== submittedScope) return;
      const message = error instanceof ApiError && error.status === 412
        ? "These settings changed. Your edits are preserved; reload current settings before editing again."
        : error instanceof ApiError && error.status === 429
          ? `Too many requests. Your edits are preserved. Try again${error.retryAfter ? ` after ${error.retryAfter} seconds` : " later"}.`
          : error instanceof ApiError && error.status === 503
            ? "Saving is temporarily unavailable. Your edits are preserved."
            : error instanceof Error ? error.message : "Event settings update failed";
      setFailure(message);
      toast.error(message);
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

  if (loadedScope.current !== scope || String(event.id ?? "") !== eventId) {
    return <OrgCard><p role="status">Loading current event settings…</p></OrgCard>;
  }

  return (
    <OrgCard className="border-[var(--brand-primary)]/20">
      <OrgSectionTitle>Governed event configuration</OrgSectionTitle>
      <p className="mb-4 text-[10px] text-[var(--text-tertiary)]">
        Uses the same validation and capability gates as Organizer Portal, with privileged attribution added by Command Center.
      </p>
      <fieldset disabled={mutation.isPending || reloading} className="grid gap-3 md:grid-cols-2">
        {fields.map((field) => (
          <label key={field.key} className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            {field.label}
            <input
              type={field.type ?? "text"}
              value={form[field.key]}
              disabled={mutation.isPending}
              onChange={(event) => update(field.key, event.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs font-normal normal-case tracking-normal text-[var(--text-primary)]"
            />
          </label>
        ))}
        <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          Case reference
          <input value={caseReference} onChange={(event) => { setDirty(true); setCaseReference(event.target.value); }} className="mt-1 w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs font-normal normal-case tracking-normal" />
        </label>
        <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          Administrative reason
          <input value={reason} onChange={(event) => { setDirty(true); setReason(event.target.value); }} className="mt-1 w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs font-normal normal-case tracking-normal" />
        </label>
      </fieldset>
      {failure && <p role="alert" className="mt-3 text-xs">{failure}</p>}
      <button
        disabled={!valid || version === null || mutation.isPending || reloading}
        onClick={save}
        className="mt-4 rounded-xl bg-[var(--brand-primary)] px-4 py-2 text-xs font-bold text-[var(--primary-contrast)] disabled:opacity-40"
      >
        Save governed settings
      </button>
      <button type="button" disabled={mutation.isPending || reloading} onClick={reloadCurrent}
        className="ml-3 mt-4 text-xs underline disabled:opacity-40">
        {reloading ? "Reloading…" : "Discard edits and reload current settings"}
      </button>
    </OrgCard>
  );
}
