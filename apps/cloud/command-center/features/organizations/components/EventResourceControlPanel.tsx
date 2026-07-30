"use client";

import { useMemo, useState } from "react";
import { Archive, Plus, Save, X } from "lucide-react";
import { toast } from "sonner";
import {
  useArchiveEventWorkspaceResource,
  useCreateEventWorkspaceResource,
  useRestoreEventWorkspaceResource,
  useUpdateEventWorkspaceResource,
} from "@/features/organizations/api/organization-console-api";
import { OrgCard, OrgSectionTitle, OrgStatusBadge } from "./OrgPageShared";
import { GovernedActionButton } from "./GovernedActionButton";

type Field = {
  key: string;
  label: string;
  type?: "text" | "email" | "number" | "datetime-local" | "textarea" | "json" | "select";
  required?: boolean;
  options?: string[];
};
type Config = {
  singular: string;
  collection: string;
  fields: Field[];
  createDefaults?: Record<string, unknown>;
  editable?: boolean;
};

const CONFIG: Record<string, Config> = {
  attendees: {
    singular: "attendee",
    collection: "items",
    fields: [
      { key: "first_name", label: "First name", required: true },
      { key: "last_name", label: "Last name" },
      { key: "email", label: "Email", type: "email" },
      { key: "phone", label: "Phone" },
      { key: "role", label: "Registration role", required: true },
      { key: "company", label: "Company" },
      { key: "designation", label: "Designation" },
      { key: "country", label: "Country" },
      {
        key: "paid_status",
        label: "Payment status",
        type: "select",
        options: ["Paid", "Unpaid", "Refunded", "Pending Refund"],
      },
      { key: "regno", label: "Registration number" },
      { key: "source", label: "Source" },
      { key: "custom_fields", label: "Custom fields (JSON)", type: "json" },
    ],
    createDefaults: {
      role: "Delegate",
      paid_status: "Unpaid",
      source: "command_center",
      custom_fields: {},
    },
  },
  speakers: {
    singular: "speaker",
    collection: "items",
    fields: [
      { key: "first_name", label: "First name", required: true },
      { key: "last_name", label: "Last name", required: true },
      { key: "email", label: "Email", type: "email", required: true },
      { key: "phone", label: "Phone" },
      { key: "designation", label: "Designation" },
      { key: "affiliation", label: "Affiliation" },
      { key: "country", label: "Country" },
    ],
  },
  sessions: {
    singular: "session",
    collection: "items",
    fields: [
      { key: "session_code", label: "Session code", required: true },
      { key: "name", label: "Session name", required: true },
      {
        key: "session_type",
        label: "Type",
        type: "select",
        options: ["regular", "keynote", "symposium", "workshop", "poster"],
      },
      {
        key: "start_time",
        label: "Starts",
        type: "datetime-local",
        required: true,
      },
      {
        key: "end_time",
        label: "Ends",
        type: "datetime-local",
        required: true,
      },
      { key: "room_id", label: "Room ID" },
      { key: "moderator_name", label: "Moderator" },
      { key: "description", label: "Description", type: "textarea" },
    ],
    createDefaults: { session_type: "regular" },
  },
  rooms: {
    singular: "room",
    collection: "items",
    fields: [
      { key: "name", label: "Room name", required: true },
      { key: "capacity", label: "Capacity", type: "number" },
      { key: "screen_count", label: "Screens", type: "number" },
      {
        key: "room_type",
        label: "Type",
        type: "select",
        options: ["presentation", "workshop", "poster", "plenary"],
      },
      { key: "av_technician", label: "AV technician" },
      { key: "location_notes", label: "Location notes", type: "textarea" },
    ],
    createDefaults: { screen_count: 1, room_type: "presentation" },
  },
  communications: {
    singular: "campaign",
    collection: "campaigns",
    fields: [
      { key: "template_id", label: "Template ID", required: true },
      { key: "name", label: "Campaign name", required: true },
      {
        key: "recipient_filter",
        label: "Recipient filter",
        type: "select",
        required: true,
        options: [
          "all",
          "pending_upload",
          "uploaded",
          "approved",
          "rejected",
          "posters",
          "specific_session",
          "specific_room",
          "specific_speakers",
          "custom_list",
        ],
      },
      {
        key: "target_type",
        label: "Target",
        type: "select",
        required: true,
        options: ["speaker", "participant"],
      },
      { key: "session_id_filter", label: "Session ID filter" },
      { key: "room_id_filter", label: "Room ID filter" },
      { key: "scheduled_at", label: "Scheduled time", type: "datetime-local" },
    ],
    createDefaults: { recipient_filter: "all", target_type: "speaker" },
  },
  integrations: {
    singular: "webhook",
    collection: "webhooks",
    fields: [
      { key: "url", label: "Endpoint URL", required: true },
      { key: "description", label: "Description" },
      {
        key: "subscribed_events",
        label: "Subscribed events (comma separated)",
        required: true,
      },
      { key: "secret", label: "Signing secret (creation only)" },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: ["active", "paused"],
      },
    ],
    createDefaults: { status: "active" },
  },
};

function normalizeInput(field: Field, value: unknown) {
  if (field.key === "subscribed_events")
    return Array.isArray(value) ? value.join(", ") : String(value ?? "");
  if (field.type === "datetime-local" && value)
    return String(value).slice(0, 16);
  if (field.type === "json")
    return JSON.stringify(value ?? {}, null, 2);
  return value == null ? "" : String(value);
}

function payloadValue(field: Field, value: string) {
  if (field.key === "subscribed_events")
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  if (field.type === "number") return value === "" ? undefined : Number(value);
  if (field.type === "datetime-local")
    return value ? new Date(value).toISOString() : undefined;
  if (field.type === "json") return value ? JSON.parse(value) : {};
  return value === "" ? undefined : value;
}

export function EventResourceControlPanel({
  orgId,
  eventId,
  workspace,
  data,
}: {
  orgId: string;
  eventId: string;
  workspace: string;
  data: Record<string, unknown>;
}) {
  const config = CONFIG[workspace];
  const createMutation = useCreateEventWorkspaceResource(
    orgId,
    eventId,
    workspace,
  );
  const updateMutation = useUpdateEventWorkspaceResource(
    orgId,
    eventId,
    workspace,
  );
  const archiveMutation = useArchiveEventWorkspaceResource(
    orgId,
    eventId,
    workspace,
  );
  const restoreMutation = useRestoreEventWorkspaceResource(
    orgId,
    eventId,
    workspace,
  );
  const [mode, setMode] = useState<"closed" | "create" | "edit">("closed");
  const [selected, setSelected] = useState<Record<string, unknown> | null>(
    null,
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [caseReference, setCaseReference] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [archiveConfirmation, setArchiveConfirmation] = useState("");

  const items = useMemo(
    () =>
      config
        ? ((data[config.collection] as
            Array<Record<string, unknown>> | undefined) ?? [])
        : [],
    [config, data],
  );
  if (!config) return null;
  const sensitiveEditAllowed =
    workspace !== "attendees" || data.sensitive_edit_allowed === true;

  const open = (
    nextMode: "create" | "edit",
    item?: Record<string, unknown>,
  ) => {
    const source = item ?? config.createDefaults ?? {};
    setSelected(item ?? null);
    setValues(
      Object.fromEntries(
        config.fields.map((field) => [
          field.key,
          normalizeInput(field, source[field.key]),
        ]),
      ),
    );
    setMode(nextMode);
    setReason("");
    setCaseReference("");
  };
  const valid =
    reason.trim().length >= 12 &&
    caseReference.trim().length >= 2 &&
    config.fields
      .filter((field) => field.required)
      .every((field) => values[field.key]?.trim());
  const submit = async () => {
    try {
      const domainData = Object.fromEntries(
        config.fields
          .map((field) => [
            field.key,
            payloadValue(field, values[field.key] ?? ""),
          ])
          .filter(([, value]) => value !== undefined),
      );
      if (mode === "create")
        await createMutation.mutateAsync({
          data: domainData,
          reason,
          case_reference: caseReference,
        });
      else if (selected?.id)
        await updateMutation.mutateAsync({
          resourceId: String(selected.id),
          version:
            typeof selected.version === "number" ? selected.version : undefined,
          data: domainData,
          reason,
          case_reference: caseReference,
        });
      toast.success(
        mode === "create"
          ? `${config.singular} created`
          : `${config.singular} updated`,
      );
      setMode("closed");
      setSelected(null);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Could not save ${config.singular}`,
      );
    }
  };
  const archive = async () => {
    if (!archiveTarget?.id || archiveConfirmation !== String(archiveTarget.id))
      return;
    try {
      await archiveMutation.mutateAsync({
        resourceId: String(archiveTarget.id),
        version:
          typeof archiveTarget.version === "number"
            ? archiveTarget.version
            : undefined,
        reason,
        case_reference: caseReference,
      });
      toast.success(`${config.singular} archived safely`);
      setArchiveTarget(null);
      setArchiveConfirmation("");
      setReason("");
      setCaseReference("");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Could not archive ${config.singular}`,
      );
    }
  };
  const restore = async (
    item: Record<string, unknown>,
    reason: string,
    caseReference: string,
  ) => {
    if (!item.id) return;
    try {
      await restoreMutation.mutateAsync({
        resourceId: String(item.id),
        version: typeof item.version === "number" ? item.version : undefined,
        reason,
        case_reference: caseReference,
      });
      toast.success(`${config.singular} restored`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Could not restore ${config.singular}`,
      );
      throw error;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <OrgSectionTitle>{config.singular} controls</OrgSectionTitle>
          <p className="text-[10px] text-[var(--text-tertiary)]">
            All writes require step-up authentication, a case reference, and an
            audit reason.
          </p>
          {workspace === "attendees" && !sensitiveEditAllowed && (
            <p className="mt-1 text-[10px] text-[var(--status-warning)]">
              Existing attendee PII is masked. Start privileged data access in
              Security before editing a record.
            </p>
          )}
        </div>
        <button
          onClick={() => open("create")}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--brand-primary)] px-3 py-2 text-xs font-bold text-[var(--primary-contrast)]"
        >
          <Plus className="h-3.5 w-3.5" />
          Create {config.singular}
        </button>
      </div>
      <div className="space-y-2">
        {items.map((item) => {
          const archived = item.lifecycle_state === "archived";
          return (
            <div
              key={String(item.id)}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-3)] p-3"
            >
              <div>
                <p className="text-xs font-bold text-[var(--text-primary)]">
                  {String(
                    item.name ??
                      item.first_name ??
                      item.url ??
                      item.session_code ??
                      item.id,
                  )}
                </p>
                <p className="text-[10px] font-mono text-[var(--text-tertiary)]">
                  {String(item.id)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <OrgStatusBadge
                  status={
                    archived ? "archived" : String(item.status ?? "active")
                  }
                />
                {archived ? (
                  <GovernedActionButton
                    label="Restore"
                    title={`Restore ${config.singular}`}
                    disabled={restoreMutation.isPending}
                    className="text-[10px] font-bold text-[var(--status-success)]"
                    onConfirm={({ reason, caseReference }) =>
                      restore(item, reason, caseReference)
                    }
                  />
                ) : (
                  <>
                    {sensitiveEditAllowed && (
                      <button
                        onClick={() => open("edit", item)}
                        className="text-[10px] font-bold text-[var(--brand-primary)]"
                      >
                        Edit
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setArchiveTarget(item);
                        setReason("");
                        setCaseReference("");
                      }}
                      className="text-[10px] font-bold text-[var(--status-danger)]"
                    >
                      Archive
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {mode !== "closed" && (
        <OrgCard className="border-[var(--brand-primary)]/30">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <OrgSectionTitle>
                {mode === "create"
                  ? `Create ${config.singular}`
                  : `Edit ${config.singular}`}
              </OrgSectionTitle>
              <p className="text-xs text-[var(--text-tertiary)]">
                The organizer portal’s validation and entitlement limits apply.
              </p>
            </div>
            <button onClick={() => setMode("closed")} aria-label="Close editor">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {config.fields
              .filter(
                (field) =>
                  !(mode === "edit" && field.key === "secret") &&
                  !(
                    mode === "edit" &&
                    workspace === "sessions" &&
                    field.key === "session_code"
                  ),
              )
              .map((field) => (
                <label
                  key={field.key}
                  className={field.type === "textarea" ? "md:col-span-2" : ""}
                >
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                    {field.label}
                    {field.required ? " *" : ""}
                  </span>
                  {field.type === "textarea" || field.type === "json" ? (
                    <textarea
                      value={values[field.key] ?? ""}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          [field.key]: event.target.value,
                        }))
                      }
                      className="min-h-24 w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs"
                    />
                  ) : field.type === "select" ? (
                    <select
                      value={values[field.key] ?? ""}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          [field.key]: event.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs"
                    >
                      {field.options?.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={field.type ?? "text"}
                      value={values[field.key] ?? ""}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          [field.key]: event.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs"
                    />
                  )}
                </label>
              ))}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <input
              value={caseReference}
              onChange={(event) => setCaseReference(event.target.value)}
              placeholder="Case reference"
              className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs"
            />
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Administrative reason (minimum 12 characters)"
              className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs"
            />
          </div>
          <button
            disabled={
              !valid || createMutation.isPending || updateMutation.isPending
            }
            onClick={submit}
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[var(--brand-primary)] px-4 py-2 text-xs font-bold text-[var(--primary-contrast)] disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            Save {config.singular}
          </button>
        </OrgCard>
      )}
      {archiveTarget && (
        <OrgCard className="border-[var(--status-danger)]/40 bg-[var(--status-danger)]/5">
          <div className="flex items-start gap-3">
            <Archive className="mt-0.5 h-4 w-4 text-[var(--status-danger)]" />
            <div className="flex-1">
              <p className="text-xs font-black text-[var(--text-primary)]">
                Archive {config.singular}
              </p>
              <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">
                This is recoverable. Type the record ID exactly to confirm.
              </p>
              <input
                value={archiveConfirmation}
                onChange={(event) => setArchiveConfirmation(event.target.value)}
                placeholder={String(archiveTarget.id)}
                className="mt-3 w-full rounded-xl border border-[var(--status-danger)]/30 bg-[var(--bg-surface)] px-3 py-2 text-xs font-mono"
              />
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <input
                  value={caseReference}
                  onChange={(event) => setCaseReference(event.target.value)}
                  placeholder="Case reference"
                  className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-xs"
                />
                <input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Reason (minimum 12 characters)"
                  className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-xs"
                />
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  disabled={
                    archiveConfirmation !== String(archiveTarget.id) ||
                    reason.length < 12 ||
                    caseReference.length < 2
                  }
                  onClick={archive}
                  className="rounded-xl bg-[var(--status-danger)] px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
                >
                  Archive safely
                </button>
                <button
                  onClick={() => setArchiveTarget(null)}
                  className="px-3 py-2 text-xs font-bold text-[var(--text-secondary)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </OrgCard>
      )}
    </div>
  );
}
