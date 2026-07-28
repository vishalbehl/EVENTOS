"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, FlaskConical, Shield, X } from "lucide-react";

import { apiGet, apiPost } from "@/lib/api-client";
import { platformKey } from "@/lib/query-keys";
import type { PlatformFlag } from "./PageScreen";

type FlagOverride = {
  id: string;
  scope_type: "GLOBAL" | "ORGANIZATION" | "EVENT" | "USER";
  organization_id?: string | null;
  event_id?: string | null;
  user_id?: string | null;
  value: { value?: boolean | string };
  rollout_percentage?: number | null;
  reason: string;
  case_reference: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  starts_at?: string | null;
  expires_at?: string | null;
};

const fieldClass = "rounded-lg border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm";

export function FlagGovernancePanel({ flags }: { flags: PlatformFlag[] }) {
  const queryClient = useQueryClient();
  const [flagId, setFlagId] = useState(flags[0]?.id ?? "");
  const [form, setForm] = useState({ scope_type: "ORGANIZATION" as FlagOverride["scope_type"], organization_id: "", event_id: "", user_id: "", enabled: true, variant: "control", rollout_percentage: "100", reason: "", case_reference: "", starts_at: "", expires_at: "" });
  const [preview, setPreview] = useState({ organization_id: "", event_id: "", user_id: "", environment: "ALL" });
  const [previewRequested, setPreviewRequested] = useState(false);

  const overrides = useQuery({
    queryKey: platformKey("capability-flags", flagId, "overrides"),
    queryFn: () => apiGet<{ items: FlagOverride[] }>(`/platform/capabilities/flags/${flagId}/overrides`),
    enabled: Boolean(flagId),
  });

  const requestOverride = useMutation({
    mutationFn: () => apiPost(`/platform/capabilities/flags/${flagId}/overrides`, {
      scope_type: form.scope_type,
      organization_id: form.scope_type === "ORGANIZATION" || form.scope_type === "EVENT" ? form.organization_id || null : null,
      event_id: form.scope_type === "EVENT" ? form.event_id || null : null,
      user_id: form.scope_type === "USER" ? form.user_id || null : null,
      value: { value: selectedFlag?.value_type === "VARIANT" ? form.variant : form.enabled },
      rollout_percentage: Number(form.rollout_percentage),
      reason: form.reason,
      case_reference: form.case_reference,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
    }, { headers: { "Idempotency-Key": crypto.randomUUID() } }),
    onSuccess: () => {
      setForm(value => ({ ...value, reason: "", case_reference: "" }));
      void queryClient.invalidateQueries({
        queryKey: platformKey("capability-flags", flagId, "overrides"),
      });
    },
  });

  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "APPROVED" | "REJECTED" }) => apiPost(
      `/platform/capabilities/flags/overrides/${id}/decision`,
      { decision, reason: `${decision === "APPROVED" ? "Approved" : "Rejected"} after independent rollout review.` },
      { headers: { "Idempotency-Key": crypto.randomUUID() } },
    ),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: platformKey("capability-flags", flagId, "overrides"),
      }),
  });

  const evaluationQuery = useQuery({
    queryKey: platformKey("capability-flags", "evaluation", preview),
    queryFn: () => {
      const params = new URLSearchParams({ application: "ORGANIZER_PORTAL", environment: preview.environment });
      if (preview.organization_id) params.set("organization_id", preview.organization_id);
      if (preview.event_id) params.set("event_id", preview.event_id);
      if (preview.user_id) params.set("user_id", preview.user_id);
      return apiGet<Record<string, unknown>>(`/platform/capabilities/flags/evaluate?${params.toString()}`);
    },
    enabled: previewRequested,
  });

  const selectedFlag = flags.find(item => item.id === flagId);
  const requiredTargetPresent = form.scope_type === "GLOBAL" || (form.scope_type === "ORGANIZATION" && Boolean(form.organization_id)) || (form.scope_type === "EVENT" && Boolean(form.organization_id && form.event_id)) || (form.scope_type === "USER" && Boolean(form.user_id));

  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
      <div className="space-y-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
        <div className="flex items-start gap-3"><Shield className="mt-0.5 h-5 w-5 text-[var(--accent-primary)]" /><div><h2 className="font-semibold">Scoped overrides and approvals</h2><p className="mt-1 text-xs text-[var(--text-tertiary)]">Target one environment, organization, event, or user. The requester cannot approve the request.</p></div></div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs">Flag<select value={flagId} onChange={event => setFlagId(event.target.value)} className={`mt-1 w-full ${fieldClass}`}>{flags.map(flag => <option key={flag.id} value={flag.id}>{flag.flag_key}</option>)}</select></label>
          <label className="text-xs">Scope<select value={form.scope_type} onChange={event => setForm(value => ({ ...value, scope_type: event.target.value as FlagOverride["scope_type"] }))} className={`mt-1 w-full ${fieldClass}`}>{["GLOBAL", "ORGANIZATION", "EVENT", "USER"].map(scope => <option key={scope}>{scope}</option>)}</select></label>
          {(form.scope_type === "ORGANIZATION" || form.scope_type === "EVENT") ? <label className="text-xs">Organization ID<input value={form.organization_id} onChange={event => setForm(value => ({ ...value, organization_id: event.target.value }))} className={`mt-1 w-full ${fieldClass}`} /></label> : null}
          {form.scope_type === "EVENT" ? <label className="text-xs">Event ID<input value={form.event_id} onChange={event => setForm(value => ({ ...value, event_id: event.target.value }))} className={`mt-1 w-full ${fieldClass}`} /></label> : null}
          {form.scope_type === "USER" ? <label className="text-xs">User ID<input value={form.user_id} onChange={event => setForm(value => ({ ...value, user_id: event.target.value }))} className={`mt-1 w-full ${fieldClass}`} /></label> : null}
          {selectedFlag?.value_type === "VARIANT"
            ? <label className="text-xs">Variant value<input required value={form.variant} onChange={event => setForm(value => ({ ...value, variant: event.target.value }))} className={`mt-1 w-full ${fieldClass}`} /></label>
            : <label className="text-xs">Boolean value<select value={String(form.enabled)} onChange={event => setForm(value => ({ ...value, enabled: event.target.value === "true" }))} className={`mt-1 w-full ${fieldClass}`}><option value="true">Enabled</option><option value="false">Disabled</option></select></label>}
          <label className="text-xs">Percentage<input type="number" min="0" max="100" value={form.rollout_percentage} onChange={event => setForm(value => ({ ...value, rollout_percentage: event.target.value }))} className={`mt-1 w-full ${fieldClass}`} /></label>
          <label className="text-xs">Starts<input type="datetime-local" value={form.starts_at} onChange={event => setForm(value => ({ ...value, starts_at: event.target.value }))} className={`mt-1 w-full ${fieldClass}`} /></label>
          <label className="text-xs">Expires<input type="datetime-local" value={form.expires_at} onChange={event => setForm(value => ({ ...value, expires_at: event.target.value }))} className={`mt-1 w-full ${fieldClass}`} /></label>
          <label className="text-xs">Case reference<input value={form.case_reference} onChange={event => setForm(value => ({ ...value, case_reference: event.target.value }))} className={`mt-1 w-full ${fieldClass}`} /></label>
          <label className="text-xs">Reason<input value={form.reason} onChange={event => setForm(value => ({ ...value, reason: event.target.value }))} className={`mt-1 w-full ${fieldClass}`} /></label>
        </div>
        {requestOverride.isError ? <p className="text-xs text-red-400">The request was rejected. Verify the typed value, target IDs, expiry, and step-up authentication.</p> : null}
        <button disabled={!flagId || !requiredTargetPresent || (selectedFlag?.value_type === "VARIANT" && !form.variant.trim()) || form.reason.trim().length < 12 || form.case_reference.trim().length < 2 || requestOverride.isPending} onClick={() => requestOverride.mutate()} className="rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Request scoped override</button>

        <div className="border-t border-[var(--border-subtle)] pt-4">
          <h3 className="text-sm font-semibold">{selectedFlag?.flag_key ?? "Flag"} history</h3>
          {overrides.isError ? <p className="mt-3 text-xs text-red-400">Override history is unavailable.</p> : null}
          {decide.isError ? <p className="mt-3 text-xs text-red-400">The decision failed. The requester cannot approve their own change and step-up authentication is required.</p> : null}
          <div className="mt-3 space-y-2">{overrides.data?.items.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] p-3"><div><p className="text-xs font-semibold">{item.scope_type} · {String(item.value?.value)}</p><p className="mt-1 text-[11px] text-[var(--text-tertiary)]">{item.case_reference} · {item.status}{item.expires_at ? ` · expires ${new Date(item.expires_at).toLocaleString()}` : ""}</p></div>{item.status === "PENDING" ? <div className="flex gap-2"><button aria-label="Approve override" disabled={decide.isPending} onClick={() => decide.mutate({ id: item.id, decision: "APPROVED" })} className="rounded-md border border-emerald-500/30 p-2 text-emerald-400 disabled:opacity-40"><Check className="h-4 w-4" /></button><button aria-label="Reject override" disabled={decide.isPending} onClick={() => decide.mutate({ id: item.id, decision: "REJECTED" })} className="rounded-md border border-red-500/30 p-2 text-red-400 disabled:opacity-40"><X className="h-4 w-4" /></button></div> : <span className="text-[10px] font-bold">{item.status}</span>}</div>)}</div>
        </div>
      </div>

      <div className="h-fit space-y-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
        <div className="flex items-start gap-3"><FlaskConical className="mt-0.5 h-5 w-5 text-[var(--accent-primary)]" /><div><h2 className="font-semibold">Evaluation preview</h2><p className="mt-1 text-xs text-[var(--text-tertiary)]">Inspect the exact persisted decision without changing access.</p></div></div>
        <div className="grid gap-2"><input value={preview.organization_id} onChange={event => { setPreviewRequested(false); setPreview(value => ({ ...value, organization_id: event.target.value })); }} placeholder="Organization ID" className={fieldClass} /><input value={preview.event_id} onChange={event => { setPreviewRequested(false); setPreview(value => ({ ...value, event_id: event.target.value })); }} placeholder="Event ID (optional)" className={fieldClass} /><input value={preview.user_id} onChange={event => { setPreviewRequested(false); setPreview(value => ({ ...value, user_id: event.target.value })); }} placeholder="User ID (optional)" className={fieldClass} /><input value={preview.environment} onChange={event => { setPreviewRequested(false); setPreview(value => ({ ...value, environment: event.target.value.toUpperCase() })); }} placeholder="Environment" className={fieldClass} /></div>
        <button onClick={() => setPreviewRequested(true)} className="rounded-lg border border-[var(--border-subtle)] px-4 py-2 text-sm font-semibold">Evaluate flags</button>
        {evaluationQuery.isError ? <div className="flex gap-2 rounded-lg border border-red-500/30 p-3 text-xs text-red-300"><AlertTriangle className="h-4 w-4 shrink-0" />Evaluation unavailable; no permissive result was substituted.</div> : null}
        {previewRequested && evaluationQuery.data ? <pre className="max-h-96 overflow-auto rounded-lg bg-black/30 p-3 text-[11px] leading-5 text-[var(--text-secondary)]">{JSON.stringify(evaluationQuery.data, null, 2)}</pre> : null}
      </div>
    </section>
  );
}
