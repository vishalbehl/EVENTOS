"use client";

import { useState } from "react";
import { Archive, Plus, RotateCcw, Save, X } from "lucide-react";
import { toast } from "sonner";
import {
  useArchiveEventWorkspaceResource,
  useCreateEventWorkspaceResource,
  useRestoreEventWorkspaceResource,
  useUpdateEventWorkspaceResource,
} from "@/features/organizations/api/organization-console-api";
import { OrgCard, OrgSectionTitle, OrgStatusBadge } from "./OrgPageShared";
import { GovernedActionButton } from "./GovernedActionButton";

type Template = Record<string, unknown> & { kind: "email" | "print" };

export function EventTemplateControlPanel({
  orgId,
  eventId,
  data,
}: {
  orgId: string;
  eventId: string;
  data: Record<string, unknown>;
}) {
  const createMutation = useCreateEventWorkspaceResource(
    orgId,
    eventId,
    "templates",
  );
  const updateMutation = useUpdateEventWorkspaceResource(
    orgId,
    eventId,
    "templates",
  );
  const archiveMutation = useArchiveEventWorkspaceResource(
    orgId,
    eventId,
    "templates",
  );
  const restoreMutation = useRestoreEventWorkspaceResource(
    orgId,
    eventId,
    "templates",
  );
  const items = [
    ...((data.email_templates as Template[] | undefined) ?? []),
    ...((data.print_templates as Template[] | undefined) ?? []),
  ];
  const [editing, setEditing] = useState<Template | "new" | null>(null);
  const [kind, setKind] = useState<"email" | "print">("email");
  const [values, setValues] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [caseReference, setCaseReference] = useState("");

  const open = (item?: Template) => {
    const nextKind = item?.kind ?? "email";
    setKind(nextKind);
    setEditing(item ?? "new");
    setReason("");
    setCaseReference("");
    setValues(
      nextKind === "email"
        ? {
            name: String(item?.name ?? ""),
            template_type: String(item?.template_type ?? "custom"),
            target_type: String(item?.target_type ?? "speaker"),
            subject: String(item?.subject ?? ""),
            body_html: String(item?.body_html ?? ""),
            body_text: String(item?.body_text ?? ""),
          }
        : {
            template_name: String(item?.template_name ?? ""),
            template_type: String(item?.template_type ?? "badge"),
            template_data: JSON.stringify(item?.template_data ?? {}, null, 2),
          },
    );
  };
  const valid =
    reason.trim().length >= 12 &&
    caseReference.trim().length >= 2 &&
    (kind === "email"
      ? Boolean(
          values.name?.trim() &&
          values.subject?.trim() &&
          values.body_html?.trim(),
        )
      : Boolean(values.template_name?.trim() && values.template_data?.trim()));
  const submit = async () => {
    if (!editing || !valid) return;
    try {
      const payload: Record<string, unknown> = { kind, ...values };
      if (kind === "print")
        payload.template_data = JSON.parse(values.template_data || "{}");
      if (editing === "new")
        await createMutation.mutateAsync({
          data: payload,
          reason,
          case_reference: caseReference,
        });
      else
        await updateMutation.mutateAsync({
          resourceId: String(editing.id),
          data: payload,
          reason,
          case_reference: caseReference,
        });
      toast.success(`Template ${editing === "new" ? "created" : "updated"}`);
      setEditing(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Template save failed",
      );
    }
  };
  const lifecycle = async (
    item: Template,
    restore: boolean,
    why: string,
    caseRef: string,
  ) => {
    try {
      const mutation = restore ? restoreMutation : archiveMutation;
      await mutation.mutateAsync({
        resourceId: String(item.id),
        reason: why,
        case_reference: caseRef,
      });
      toast.success(`Template ${restore ? "restored" : "archived"}`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Template lifecycle action failed",
      );
      throw error;
    }
  };

  return (
    <OrgCard className="border-[var(--brand-primary)]/20">
      <div className="flex items-center justify-between gap-3">
        <div>
          <OrgSectionTitle>Template controls</OrgSectionTitle>
          <p className="text-[10px] text-[var(--text-tertiary)]">
            Email and print templates remain event-scoped and recoverable.
          </p>
        </div>
        <button
          onClick={() => open()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--brand-primary)] px-3 py-2 text-xs font-bold text-[var(--primary-contrast)]"
        >
          <Plus className="h-3.5 w-3.5" />
          Create template
        </button>
      </div>
      <div className="mt-4 space-y-2">
        {items.map((item) => {
          const archived = item.lifecycle_state === "archived";
          return (
            <div
              key={String(item.id)}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-3)] p-3"
            >
              <div>
                <p className="text-xs font-bold text-[var(--text-primary)]">
                  {String(item.name ?? item.template_name ?? item.id)}
                </p>
                <p className="text-[9px] text-[var(--text-tertiary)]">
                  {item.kind} · {String(item.template_type)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <OrgStatusBadge status={archived ? "archived" : "active"} />
                {archived ? (
                  <GovernedActionButton
                    label="Restore"
                    title="Restore template"
                    className="inline-flex items-center gap-1 text-[10px] font-bold text-[var(--status-success)]"
                    onConfirm={({ reason: why, caseReference: caseRef }) =>
                      lifecycle(item, true, why, caseRef)
                    }
                  />
                ) : (
                  <>
                    <button
                      onClick={() => open(item)}
                      className="text-[10px] font-bold text-[var(--brand-primary)]"
                    >
                      Edit
                    </button>
                    <GovernedActionButton
                      label="Archive"
                      title="Archive template"
                      confirmationText={String(item.id)}
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-[var(--status-danger)]"
                      onConfirm={({ reason: why, caseReference: caseRef }) =>
                        lifecycle(item, false, why, caseRef)
                      }
                    />
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {editing && (
        <div className="mt-4 rounded-xl border border-[var(--brand-primary)]/30 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-black text-[var(--text-primary)]">
              {editing === "new" ? "Create template" : "Edit template"}
            </p>
            <button
              aria-label="Close template editor"
              onClick={() => setEditing(null)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {editing === "new" && (
            <select
              value={kind}
              onChange={(event) => {
                setKind(event.target.value as "email" | "print");
                setValues(
                  event.target.value === "email"
                    ? { template_type: "custom", target_type: "speaker" }
                    : { template_type: "badge", template_data: "{}" },
                );
              }}
              className="mt-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs"
            >
              <option value="email">Email template</option>
              <option value="print">Print template</option>
            </select>
          )}
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {kind === "email" ? (
              <>
                <input
                  value={values.name ?? ""}
                  onChange={(event) =>
                    setValues((v) => ({ ...v, name: event.target.value }))
                  }
                  placeholder="Template name"
                  className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs"
                />
                <input
                  value={values.subject ?? ""}
                  onChange={(event) =>
                    setValues((v) => ({ ...v, subject: event.target.value }))
                  }
                  placeholder="Subject"
                  className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs"
                />
                <select
                  value={values.template_type ?? "custom"}
                  onChange={(event) =>
                    setValues((v) => ({
                      ...v,
                      template_type: event.target.value,
                    }))
                  }
                  className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs"
                >
                  {[
                    "upload_invite",
                    "reminder",
                    "deadline",
                    "approval",
                    "rejection",
                    "confirmation",
                    "custom",
                    "guidelines",
                    "promotion",
                  ].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
                <select
                  value={values.target_type ?? "speaker"}
                  onChange={(event) =>
                    setValues((v) => ({
                      ...v,
                      target_type: event.target.value,
                    }))
                  }
                  className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs"
                >
                  <option>speaker</option>
                  <option>participant</option>
                </select>
                <textarea
                  value={values.body_html ?? ""}
                  onChange={(event) =>
                    setValues((v) => ({ ...v, body_html: event.target.value }))
                  }
                  placeholder="HTML body"
                  className="min-h-32 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs md:col-span-2"
                />
                <textarea
                  value={values.body_text ?? ""}
                  onChange={(event) =>
                    setValues((v) => ({ ...v, body_text: event.target.value }))
                  }
                  placeholder="Plain text body"
                  className="min-h-20 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs md:col-span-2"
                />
              </>
            ) : (
              <>
                <input
                  value={values.template_name ?? ""}
                  onChange={(event) =>
                    setValues((v) => ({
                      ...v,
                      template_name: event.target.value,
                    }))
                  }
                  placeholder="Template name"
                  className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs"
                />
                <select
                  value={values.template_type ?? "badge"}
                  onChange={(event) =>
                    setValues((v) => ({
                      ...v,
                      template_type: event.target.value,
                    }))
                  }
                  className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs"
                >
                  <option>badge</option>
                  <option>certificate</option>
                  <option>custom</option>
                </select>
                <textarea
                  value={values.template_data ?? "{}"}
                  onChange={(event) =>
                    setValues((v) => ({
                      ...v,
                      template_data: event.target.value,
                    }))
                  }
                  placeholder="Template JSON"
                  className="min-h-40 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 font-mono text-xs md:col-span-2"
                />
              </>
            )}
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
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[var(--brand-primary)] px-4 py-2 text-xs font-bold text-[var(--primary-contrast)] disabled:opacity-40"
          >
            <Save className="h-3.5 w-3.5" />
            Save template
          </button>
        </div>
      )}
    </OrgCard>
  );
}
