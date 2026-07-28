"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Flag, Plus, RefreshCw, ShieldAlert } from "lucide-react";

import { apiGet, apiPatch, apiPost } from "@/lib/api-client";
import { platformKey } from "@/lib/query-keys";
import { FlagGovernancePanel } from "./FlagGovernancePanel";

export type PlatformFlag = {
  id: string;
  flag_key: string;
  name: string;
  description?: string;
  flag_type: "RELEASE" | "EXPERIMENT" | "OPERATIONAL" | "MIGRATION" | "KILL_SWITCH";
  application: string;
  environment: string;
  value_type: "BOOLEAN" | "VARIANT";
  default_value: { value?: boolean | string };
  target_capabilities: string[];
  rollout_percentage: number;
  owner_team: string;
  risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  rollback_instructions: string;
  is_active: boolean;
  version: number;
  starts_at?: string | null;
  expires_at?: string | null;
  updated_at: string;
};

type CoverageItem = {
  key: string;
  name?: string;
  owner_console?: string;
  catalogued: boolean;
  catalogue_active: boolean;
  backend_status: "ENFORCED" | "COMPOSITE" | "READ_ONLY" | "PROVIDER_REQUIRED" | "NOT_IMPLEMENTED";
  availability_note?: string | null;
};

type FlagReport = {
  generated_at: string;
  stale_cutoff: string;
  total_flags: number;
  attention_count: number;
  items: Array<{
    id: string;
    flag_key: string;
    owner_team: string;
    updated_at: string;
    expires_at?: string | null;
    override_count: number;
    reasons: string[];
  }>;
};

type CreateForm = {
  flag_key: string;
  name: string;
  description: string;
  flag_type: PlatformFlag["flag_type"];
  application: string;
  environment: string;
  value_type: PlatformFlag["value_type"];
  default_boolean: boolean;
  default_variant: string;
  target_capabilities: string[];
  rollout_percentage: number;
  owner_team: string;
  risk_level: PlatformFlag["risk_level"];
  rollback_instructions: string;
  reason: string;
};

const fieldClass =
  "mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-transparent p-2 text-sm";

const initialForm: CreateForm = {
  flag_key: "",
  name: "",
  description: "",
  flag_type: "RELEASE",
  application: "ORGANIZER_PORTAL",
  environment: "ALL",
  value_type: "BOOLEAN",
  default_boolean: false,
  default_variant: "control",
  target_capabilities: [],
  rollout_percentage: 0,
  owner_team: "Platform Engineering",
  risk_level: "MEDIUM",
  rollback_instructions: "Disable the flag and restore the previous implementation.",
  reason: "Create a governed application rollout control.",
};

export default function FeatureFlagsPage() {
  const client = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<PlatformFlag | null>(null);
  const [editForm, setEditForm] = useState({
    rollout_percentage: 0,
    is_active: true,
    expires_at: "",
    target_capabilities: [] as string[],
    reason: "",
  });
  const [form, setForm] = useState<CreateForm>(initialForm);

  const query = useQuery({
    queryKey: platformKey("capability-flags"),
    queryFn: () =>
      apiGet<{ items: PlatformFlag[] }>("/platform/capabilities/flags"),
  });
  const coverage = useQuery({
    queryKey: platformKey("capability-coverage"),
    queryFn: () =>
      apiGet<{ items: CoverageItem[] }>("/platform/capabilities/coverage"),
  });
  const hygiene = useQuery({
    queryKey: platformKey("capability-flags", "hygiene"),
    queryFn: () =>
      apiGet<FlagReport>("/platform/capabilities/flags/report?stale_days=90"),
  });

  const capabilityOptions = useMemo(
    () =>
      (coverage.data?.items ?? []).filter(
        (item) => item.catalogued && item.catalogue_active,
      ),
    [coverage.data],
  );

  const create = useMutation({
    mutationFn: () =>
      apiPost(
        "/platform/capabilities/flags",
        {
          flag_key: form.flag_key,
          name: form.name,
          description: form.description || null,
          flag_type: form.flag_type,
          application: form.application,
          environment: form.environment,
          value_type: form.value_type,
          default_value: {
            value:
              form.value_type === "BOOLEAN"
                ? form.default_boolean
                : form.default_variant,
          },
          target_capabilities: form.target_capabilities,
          rollout_percentage: form.rollout_percentage,
          owner_team: form.owner_team,
          risk_level: form.risk_level,
          rollback_instructions: form.rollback_instructions,
          reason: form.reason,
        },
        { headers: { "Idempotency-Key": crypto.randomUUID() } },
      ),
    onSuccess: () => {
      setShowCreate(false);
      setForm(initialForm);
      void client.invalidateQueries({
        queryKey: platformKey("capability-flags"),
      });
    },
  });

  const update = useMutation({
    mutationFn: () => {
      if (!editing) throw new Error("No flag selected");
      return apiPatch(
        `/platform/capabilities/flags/${editing.id}`,
        {
          rollout_percentage: editForm.rollout_percentage,
          is_active: editForm.is_active,
          expires_at: editForm.expires_at
            ? new Date(editForm.expires_at).toISOString()
            : null,
          target_capabilities: editForm.target_capabilities,
          reason: editForm.reason,
        },
        {
          headers: {
            "If-Match": String(editing.version),
            "Idempotency-Key": crypto.randomUUID(),
          },
        },
      );
    },
    onSuccess: () => {
      setEditing(null);
      void client.invalidateQueries({
        queryKey: platformKey("capability-flags"),
      });
    },
  });

  const toggleTarget = (
    key: string,
    selected: string[],
    write: (next: string[]) => void,
  ) => {
    write(
      selected.includes(key)
        ? selected.filter((item) => item !== key)
        : [...selected, key],
    );
  };

  return (
    <main className="space-y-6 p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
            Developer Console / Applications
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--text-primary)]">
            Feature flags
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--text-secondary)]">
            Control releases, experiments, migrations, operational safeguards,
            and kill switches. Flags never grant commercial entitlement.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" /> New flag
        </button>
      </header>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200">
        <ShieldAlert className="mr-2 inline h-4 w-4" />
        Final access still requires an event contract, permissions, no active
        restriction, and available quota.
      </div>

      {query.isLoading ? (
        <div className="rounded-xl border border-[var(--border-subtle)] p-10 text-center text-[var(--text-secondary)]">
          Loading authoritative flag registry…
        </div>
      ) : null}
      {query.isError ? (
        <div className="rounded-xl border border-red-500/30 p-8 text-center">
          <AlertTriangle className="mx-auto h-6 w-6 text-red-400" />
          <p className="mt-3">
            Flag data is unavailable. No empty state has been substituted.
          </p>
          <button
            onClick={() => void query.refetch()}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border px-3 py-2"
          >
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      ) : null}
      {query.data && query.data.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border-subtle)] p-10 text-center text-[var(--text-secondary)]">
          No persisted flags exist.
        </div>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-2">
        {query.data?.items.map((item) => (
          <article
            key={item.id}
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex gap-3">
                <Flag className="mt-1 h-5 w-5 text-[var(--accent-primary)]" />
                <div>
                  <h2 className="font-semibold text-[var(--text-primary)]">
                    {item.name}
                  </h2>
                  <code className="text-xs text-[var(--text-tertiary)]">
                    {item.flag_key}
                  </code>
                </div>
              </div>
              <span className="rounded-full border px-2 py-1 text-[10px] font-bold">
                {item.flag_type}
              </span>
            </div>
            <p className="mt-4 text-sm text-[var(--text-secondary)]">
              {item.description || "No description supplied."}
            </p>
            <dl className="mt-5 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              <div>
                <dt className="text-[var(--text-tertiary)]">Target</dt>
                <dd className="mt-1">
                  {item.application} / {item.environment}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--text-tertiary)]">Rollout</dt>
                <dd className="mt-1">{item.rollout_percentage}%</dd>
              </div>
              <div>
                <dt className="text-[var(--text-tertiary)]">Value</dt>
                <dd className="mt-1">{item.value_type}</dd>
              </div>
              <div>
                <dt className="text-[var(--text-tertiary)]">Owner</dt>
                <dd className="mt-1">{item.owner_team}</dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              {item.target_capabilities.length ? (
                item.target_capabilities.map((key) => (
                  <code
                    key={key}
                    className="rounded-md bg-black/20 px-2 py-1 text-[10px]"
                  >
                    {key}
                  </code>
                ))
              ) : (
                <span className="text-xs text-amber-300">
                  No capability target declared
                </span>
              )}
            </div>
          </article>
        ))}
      </section>

      <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">Flag hygiene</h2>
            <p className="mt-1 text-xs text-[var(--text-tertiary)]">
              Expired, inactive, stale, or unused controls requiring operator
              review.
            </p>
          </div>
          {hygiene.data ? (
            <span className="rounded-full border px-3 py-1 text-xs font-semibold">
              {hygiene.data.attention_count} / {hygiene.data.total_flags}
            </span>
          ) : null}
        </div>
        {hygiene.isError ? (
          <p className="mt-4 text-sm text-red-400">
            Hygiene data is unavailable; no healthy state was inferred.
          </p>
        ) : null}
        {hygiene.data?.attention_count === 0 ? (
          <p className="mt-4 text-sm text-emerald-300">
            No flags currently require hygiene review.
          </p>
        ) : null}
        <div className="mt-4 grid gap-2 lg:grid-cols-2">
          {hygiene.data?.items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] p-3"
            >
              <div>
                <code className="text-xs">{item.flag_key}</code>
                <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
                  {item.owner_team} · {item.override_count} overrides
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-1">
                {item.reasons.map((reason) => (
                  <span
                    key={reason}
                    className="rounded-full border border-amber-500/30 px-2 py-1 text-[10px] text-amber-300"
                  >
                    {reason}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {query.data?.items.length ? (
        <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
          <h2 className="font-semibold">Govern an existing rollout</h2>
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
            Updates require step-up authentication, a reason, idempotency, and
            the current version.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {query.data.items.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setEditing(item);
                  setEditForm({
                    rollout_percentage: item.rollout_percentage,
                    is_active: item.is_active,
                    expires_at: item.expires_at
                      ? item.expires_at.slice(0, 16)
                      : "",
                    target_capabilities: item.target_capabilities,
                    reason: "",
                  });
                }}
                className="rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-xs font-semibold"
              >
                {item.flag_key}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {query.data?.items.length ? (
        <FlagGovernancePanel flags={query.data.items} />
      ) : null}

      {showCreate ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-flag-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate();
            }}
            className="max-h-[90vh] w-full max-w-3xl space-y-4 overflow-y-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-6"
          >
            <h2 id="create-flag-title" className="text-xl font-semibold">
              Create governed flag
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm">
                Stable key
                <input
                  required
                  value={form.flag_key}
                  onChange={(event) =>
                    setForm({ ...form, flag_key: event.target.value })
                  }
                  placeholder="registration.v2"
                  className={fieldClass}
                />
              </label>
              <label className="text-sm">
                Name
                <input
                  required
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  className={fieldClass}
                />
              </label>
              <label className="text-sm">
                Type
                <select
                  value={form.flag_type}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      flag_type: event.target
                        .value as PlatformFlag["flag_type"],
                    })
                  }
                  className={fieldClass}
                >
                  {[
                    "RELEASE",
                    "EXPERIMENT",
                    "OPERATIONAL",
                    "MIGRATION",
                    "KILL_SWITCH",
                  ].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Value type
                <select
                  value={form.value_type}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      value_type: event.target
                        .value as PlatformFlag["value_type"],
                    })
                  }
                  className={fieldClass}
                >
                  <option>BOOLEAN</option>
                  <option>VARIANT</option>
                </select>
              </label>
              {form.value_type === "BOOLEAN" ? (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.default_boolean}
                    disabled={form.flag_type === "KILL_SWITCH"}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        default_boolean: event.target.checked,
                      })
                    }
                  />
                  Default enabled
                </label>
              ) : (
                <label className="text-sm">
                  Default variant
                  <input
                    required
                    value={form.default_variant}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        default_variant: event.target.value,
                      })
                    }
                    className={fieldClass}
                  />
                </label>
              )}
              <label className="text-sm">
                Initial rollout
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={form.rollout_percentage}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      rollout_percentage: Number(event.target.value),
                    })
                  }
                  className={fieldClass}
                />
              </label>
              <label className="text-sm">
                Owner team
                <input
                  required
                  value={form.owner_team}
                  onChange={(event) =>
                    setForm({ ...form, owner_team: event.target.value })
                  }
                  className={fieldClass}
                />
              </label>
            </div>
            <label className="block text-sm">
              Description
              <textarea
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
                className={fieldClass}
              />
            </label>
            <label className="block text-sm">
              Rollback instructions
              <textarea
                required
                minLength={12}
                value={form.rollback_instructions}
                onChange={(event) =>
                  setForm({
                    ...form,
                    rollback_instructions: event.target.value,
                  })
                }
                className={fieldClass}
              />
            </label>
            <fieldset className="rounded-lg border border-[var(--border-subtle)] p-3">
              <legend className="px-2 text-sm font-semibold">
                Governed capabilities
              </legend>
              {coverage.isError ? (
                <p className="text-xs text-red-400">
                  Capability catalogue is unavailable; flag creation is blocked.
                </p>
              ) : null}
              <div className="mt-2 grid max-h-40 gap-2 overflow-y-auto sm:grid-cols-2">
                {capabilityOptions.map((item) => (
                  <label key={item.key} className="flex gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={form.target_capabilities.includes(item.key)}
                      onChange={() =>
                        toggleTarget(
                          item.key,
                          form.target_capabilities,
                          (target_capabilities) =>
                            setForm({ ...form, target_capabilities }),
                        )
                      }
                    />
                    <span>
                      <code>{item.key}</code>
                      <small className="ml-1 text-[10px] text-[var(--text-tertiary)]">
                        [{item.backend_status.replaceAll("_", " ")}]
                      </small>
                      {item.name ? ` — ${item.name}` : ""}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block text-sm">
              Reason
              <textarea
                required
                minLength={12}
                value={form.reason}
                onChange={(event) =>
                  setForm({ ...form, reason: event.target.value })
                }
                className={fieldClass}
              />
            </label>
            {create.isError ? (
              <p className="text-sm text-red-400">
                The flag could not be created. Verify step-up authentication and
                the supplied metadata.
              </p>
            ) : null}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-lg border px-4 py-2"
              >
                Cancel
              </button>
              <button
                disabled={
                  coverage.isError ||
                  form.target_capabilities.length === 0 ||
                  form.reason.trim().length < 12 ||
                  create.isPending
                }
                className="rounded-lg bg-[var(--accent-primary)] px-4 py-2 font-semibold text-white disabled:opacity-40"
              >
                {create.isPending ? "Creating…" : "Create flag"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {editing ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-flag-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              update.mutate();
            }}
            className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-6"
          >
            <div>
              <h2 id="edit-flag-title" className="text-xl font-semibold">
                Govern {editing.name}
              </h2>
              <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                Version {editing.version} · flags control rollout and never grant
                entitlement.
              </p>
            </div>
            <label className="block text-sm">
              Rollout percentage
              <input
                type="number"
                min="0"
                max="100"
                value={editForm.rollout_percentage}
                onChange={(event) =>
                  setEditForm((value) => ({
                    ...value,
                    rollout_percentage: Number(event.target.value),
                  }))
                }
                className={fieldClass}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editForm.is_active}
                onChange={(event) =>
                  setEditForm((value) => ({
                    ...value,
                    is_active: event.target.checked,
                  }))
                }
              />
              Flag active
            </label>
            <label className="block text-sm">
              Automatic expiry
              <input
                type="datetime-local"
                value={editForm.expires_at}
                onChange={(event) =>
                  setEditForm((value) => ({
                    ...value,
                    expires_at: event.target.value,
                  }))
                }
                className={fieldClass}
              />
            </label>
            <fieldset className="rounded-lg border border-[var(--border-subtle)] p-3">
              <legend className="px-2 text-sm font-semibold">
                Governed capabilities
              </legend>
              <div className="mt-2 grid max-h-40 gap-2 overflow-y-auto sm:grid-cols-2">
                {capabilityOptions.map((item) => (
                  <label key={item.key} className="flex gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={editForm.target_capabilities.includes(item.key)}
                      onChange={() =>
                        toggleTarget(
                          item.key,
                          editForm.target_capabilities,
                          (target_capabilities) =>
                            setEditForm((value) => ({
                              ...value,
                              target_capabilities,
                            })),
                        )
                      }
                    />
                    <span>
                      <code>{item.key}</code>
                      <small className="ml-1 text-[10px] text-[var(--text-tertiary)]">
                        [{item.backend_status.replaceAll("_", " ")}]
                      </small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block text-sm">
              Reason
              <textarea
                required
                minLength={12}
                value={editForm.reason}
                onChange={(event) =>
                  setEditForm((value) => ({
                    ...value,
                    reason: event.target.value,
                  }))
                }
                className={fieldClass}
              />
            </label>
            {update.isError ? (
              <p className="text-sm text-red-400">
                Update failed. Refresh if its version changed or verify step-up
                authentication.
              </p>
            ) : null}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg border px-4 py-2"
              >
                Cancel
              </button>
              <button
                disabled={
                  editForm.reason.trim().length < 12 ||
                  editForm.target_capabilities.length === 0 ||
                  update.isPending
                }
                className="rounded-lg bg-[var(--accent-primary)] px-4 py-2 font-semibold text-white disabled:opacity-40"
              >
                Apply control
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}
