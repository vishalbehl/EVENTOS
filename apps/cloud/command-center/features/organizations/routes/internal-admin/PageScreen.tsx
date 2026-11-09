"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import {
  ShieldAlert, UserCheck, Lock, RefreshCw, AlertTriangle,
  Zap, Database, Layers, Check, Shield, DollarSign, Wrench
} from "lucide-react";
import {
  useOrganizationConsoleSummary,
  useCreateLifecycleJob,
  useLifecycleJobs,
  useDecideLifecycleJob,
  useRetryLifecycleJob,
  useOrganizationDomain,
  useCreateImpersonationHandoff,
  useOrganizerRollout,
  useCapabilityDiagnostics,
  useUpdateOrganizerRollout,
  destructiveLifecycleUnavailable,
  destructiveLifecycleUnavailableReason,
} from "@/features/organizations/api/organization-console-api";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import {
  OrgPageHeader, OrgCard, OrgTabBar, OrgDataTable, OrgStatusBadge,
  OrgSectionTitle, OrgMetricCard, LoadingPage,
} from "@/features/organizations/components/OrgPageShared";
import { GovernedActionButton } from "@/features/organizations/components/GovernedActionButton";
import { FoundationRecoveryPanel } from "@/features/organizations/components/FoundationRecoveryPanel";

export default function InternalAdminPageScreen() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;
  const router = useRouter();

  const [activeTab, setActiveTab] = useState("org-controls");

  const { data: summary, isLoading, isError: summaryError, isFetching: summaryFetching, refetch } = useOrganizationConsoleSummary(orgId);
  const createJob = useCreateLifecycleJob(orgId);
  const lifecycleJobs = useLifecycleJobs(orgId);
  const decideJob = useDecideLifecycleJob(orgId);
  const retryJob = useRetryLifecycleJob(orgId);
  const members = useOrganizationDomain(orgId, "members");
  const createHandoff = useCreateImpersonationHandoff(orgId);
  const rollout = useOrganizerRollout(orgId);
  const diagnostics = useCapabilityDiagnostics(orgId);
  const updateRollout = useUpdateOrganizerRollout(orgId);
  const [handoff, setHandoff] = useState({ target_user_id: "", case_reference: "", reason: "" });
  const [lifecycleReview, setLifecycleReview] = useState(false);

  if (isLoading) return <LoadingPage />;

  const org = summaryError ? undefined : summary?.organization;

  const requestLifecycle = async (jobType: "ARCHIVE" | "RESTORE", reason: string) => {
    if (!org || summaryError || summaryFetching || lifecycleReview) throw new Error("Reload and review the organisation before requesting a lifecycle change.");
    try {
      await createJob.mutateAsync({
        idempotencyKey: crypto.randomUUID(),
        organizationVersion: org.profile_version,
        payload: { job_type: jobType, reason },
      });
      toast.success(`${jobType === "ARCHIVE" ? "Archive" : "Restore"} job requested. Check the lifecycle ledger for completion.`);
      refetch();
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 412) { setLifecycleReview(true); await refetch(); }
      throw e;
    }
  };


  const tabs = [
    { key: "org-controls", label: "Organization Controls" },
    { key: "commercial-controls", label: "Commercial Overrides" },
    { key: "event-controls", label: "Event Overrides" },
    { key: "platform-ops", label: "Platform Operations & Caches" },
    { key: "financial-ops", label: "Financial Operations" },
    { key: "danger-zone", label: "Danger Zone" },
  ];

  return (
    <div className="p-6 space-y-6">
      <OrgPageHeader
        icon={ShieldAlert}
        title="Internal Admin Workspace"
        description="Permission-scoped organisation operations and platform diagnostics. Commercial changes use separate approval workflows."
      />

      <div className="flex items-center gap-3 rounded-xl border border-[var(--status-danger)]/20 bg-[var(--status-danger)]/5 px-4 py-3">
        <ShieldAlert className="w-5 h-5 text-[var(--status-danger)] shrink-0" />
        <p className="text-xs text-[var(--text-primary)]">
          <span className="font-bold">Super Admin Privileged Access:</span> Actions taken in this workspace override tenant configurations and create audit logs.
        </p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <OrgMetricCard label="Tenant Status" value={org?.lifecycle_state ?? "UNAVAILABLE"} />
        <OrgMetricCard label="Sandbox Mode" value={org?.is_sandbox ? "Sandbox" : "Production"} />
        <OrgMetricCard label="Privileged handoff" value="Single-use / 15 min" />
        <OrgMetricCard label="Health Score" value={summary?.health_score != null ? `${summary.health_score}%` : "—"} />
      </div>

      <OrgTabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />
      {activeTab === "org-controls" ? <FoundationRecoveryPanel key={orgId} organizationId={orgId} /> : null}

      <OrgCard>
        <OrgSectionTitle>Lifecycle job ledger</OrgSectionTitle>
        <p className="mb-3 text-xs text-[var(--text-tertiary)]">{destructiveLifecycleUnavailableReason} Earlier requests remain visible for audit; approval does not enable these operations.</p>
        {lifecycleJobs.isError ? <p className="text-xs text-[var(--status-danger)]">Lifecycle records are unavailable. No empty-state substitution has been applied.</p> : null}
        <div className="space-y-2">
          {(lifecycleJobs.isError ? [] : lifecycleJobs.data ?? []).map((job) => (
            <div key={job.id} className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold">{job.job_type} <span className="font-mono text-[var(--text-tertiary)]">{job.id.slice(0, 8)}</span></p><OrgStatusBadge status={job.status} /></div>
              <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">{job.reason} · execution attempts {job.attempt_count} · delivery attempts {job.dispatch_attempts} · manifest {job.manifest_checksum.slice(0, 12)}</p>
              {job.status === "PENDING" || job.status === "RETRY_PENDING" ? <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">Queued, not completed. {job.next_dispatch_at ? `Delivery retry after ${new Date(job.next_dispatch_at).toLocaleString()}.` : "Awaiting delivery."}</p> : null}
              {job.job_type === "CLONE" ? <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">Copies portable colour settings to a new draft only. No assets, locations, contacts, templates or published state are transferred.</p> : null}
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-black/20 p-2 text-[10px]">{JSON.stringify(job.dry_run_manifest, null, 2)}</pre>
              {job.failure_reason ? <p className="mt-2 text-[11px] text-[var(--status-danger)]">{job.failure_reason}</p> : null}
              {job.status === "AWAITING_APPROVAL" ? <div className="mt-2 flex gap-2">{(["APPROVED", "REJECTED"] as const).map(decision => <GovernedActionButton key={`${job.id}:${job.version}:${decision}`} label={decision === "APPROVED" ? "Approve manifest" : "Reject"} title={decision === "APPROVED" ? "Review and approve this lifecycle manifest" : "Reject this lifecycle manifest"} requireCaseReference={false} disabled={(decision === "APPROVED" && destructiveLifecycleUnavailable(job.job_type)) || decideJob.isPending || lifecycleJobs.isFetching} onConfirm={({ reason }) => decideJob.mutateAsync({ jobId: job.id, decision, reason, version: job.version }).then(() => undefined)} />)}</div> : null}
              {job.status === "FAILED" ? <GovernedActionButton key={`${job.id}:${job.version}:retry`} label="Retry failed job" title="Review failure and request a retry" requireCaseReference={false} disabled={destructiveLifecycleUnavailable(job.job_type) || retryJob.isPending || lifecycleJobs.isFetching} onConfirm={({ reason }) => retryJob.mutateAsync({ jobId: job.id, reason, version: job.version }).then(() => undefined)} /> : null}
            </div>
          ))}
          {!lifecycleJobs.isLoading && !lifecycleJobs.isError && lifecycleJobs.data?.length === 0 ? <p className="text-xs text-[var(--text-tertiary)]">No lifecycle jobs have been requested.</p> : null}
        </div>
      </OrgCard>

      <OrgCard>
        <OrgSectionTitle>Production rollout gate</OrgSectionTitle>
        <p className="mt-1 text-xs text-[var(--text-tertiary)]">
          Shadow mode backfills immutable contracts and compares legacy activation results with canonical resolution. The backend preflight also verifies catalogue coverage, current resolution, metering reconciliation, and provider readiness evidence.
        </p>
        {rollout.isError ? (
          <p className="mt-3 text-xs text-[var(--status-danger)]">Rollout evidence is unavailable. Enforcement controls remain unavailable.</p>
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-4 xl:grid-cols-9">
            <OrgMetricCard label="Mode" value={rollout.data?.enforcement_enabled ? "ENFORCED" : rollout.data?.shadow_enabled ? "SHADOW" : "LEGACY"} />
            <OrgMetricCard label="Preflight" value={rollout.data?.preflight.ready_for_enforcement ? "READY" : "BLOCKED"} />
            <OrgMetricCard label="Activated" value={rollout.data?.activated_events ?? 0} />
            <OrgMetricCard label="Contracts" value={rollout.data?.contracted_events ?? 0} />
            <OrgMetricCard label="Missing contracts" value={rollout.data?.missing_contracts ?? 0} />
            <OrgMetricCard label="Compared" value={rollout.data?.comparisons.sample_size ?? 0} />
            <OrgMetricCard label="Matched" value={rollout.data?.comparisons.matched ?? 0} />
            <OrgMetricCard label="Diverged" value={rollout.data?.comparisons.diverged ?? 0} />
            <OrgMetricCard label="Stale" value={rollout.data?.comparisons.stale ?? 0} />
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <GovernedActionButton
            label="Start shadow mode"
            title="Start entitlement shadow rollout"
            requireCaseReference={false}
            disabled={updateRollout.isPending || rollout.data?.shadow_enabled}
            className="rounded-lg border border-[var(--border-default)] px-3 py-2 text-xs font-bold disabled:opacity-40"
            onConfirm={({ reason }) => updateRollout.mutateAsync({ shadow_enabled: true, enforcement_enabled: false, reason }).then(() => undefined)}
          />
          <GovernedActionButton
            label="Enable enforcement"
            title="Enable contract entitlement enforcement"
            requireCaseReference={false}
            confirmationText={org?.slug}
            disabled={
              updateRollout.isPending
              || rollout.data?.enforcement_enabled
              || !rollout.data?.preflight.ready_for_enforcement
            }
            className="rounded-lg bg-[var(--brand-primary)] px-3 py-2 text-xs font-bold text-[var(--primary-contrast)] disabled:opacity-40"
            onConfirm={({ reason }) => updateRollout.mutateAsync({ shadow_enabled: true, enforcement_enabled: true, reason }).then(() => undefined)}
          />
        </div>
        {rollout.data?.missing_contracts ? (
          <p className="mt-3 rounded-xl border border-[var(--status-warning)]/25 bg-[var(--status-warning-muted)] px-3 py-2 text-xs text-[var(--status-warning)]">
            {rollout.data.missing_contracts} activated event contract{rollout.data.missing_contracts === 1 ? "" : "s"} must be backfilled before enforcement. Starting shadow mode queues the governed backfill.
          </p>
        ) : null}
        {rollout.data?.items.some(item => item.status === "DIVERGED" || !item.fresh) ? (
          <div className="mt-3 max-h-40 overflow-auto rounded-xl border border-[var(--status-danger)]/25 p-3">
            {rollout.data.items.filter(item => item.status === "DIVERGED" || !item.fresh).map(item => (
              <p key={item.id} className="font-mono text-[10px] text-[var(--status-danger)]">
                {item.event_id}: {!item.fresh ? "STALE COMPARISON" : JSON.stringify(item.differences)}
              </p>
            ))}
          </div>
        ) : null}
        {rollout.data?.preflight.blockers.length ? (
          <div className="mt-3 rounded-xl border border-[var(--status-danger)]/25 bg-[var(--status-danger-muted)] p-3">
            <p className="text-xs font-bold text-[var(--status-danger)]">Promotion blockers</p>
            <div className="mt-2 space-y-1">
              {rollout.data.preflight.blockers.map((issue, index) => (
                <p key={`${issue.code}-${issue.event_id ?? index}`} className="text-[11px] text-[var(--status-danger)]">
                  <span className="font-mono font-bold">{issue.code}</span>: {issue.message}
                </p>
              ))}
            </div>
          </div>
        ) : null}
        {rollout.data?.preflight.warnings.length ? (
          <div className="mt-3 rounded-xl border border-[var(--status-warning)]/25 bg-[var(--status-warning-muted)] p-3">
            <p className="text-xs font-bold text-[var(--status-warning)]">Operational warnings</p>
            <div className="mt-2 space-y-1">
              {rollout.data.preflight.warnings.map((issue, index) => (
                <p key={`${issue.code}-${issue.event_id ?? index}`} className="text-[11px] text-[var(--status-warning)]">
                  <span className="font-mono font-bold">{issue.code}</span>: {issue.message}
                </p>
              ))}
            </div>
          </div>
        ) : null}
      </OrgCard>

      {/* ── Organization Controls ──────────────────────────── */}
      {activeTab === "org-controls" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <OrgCard>
            <OrgSectionTitle>Tenant Impersonation</OrgSectionTitle>
            <p className="text-xs text-[var(--text-tertiary)] mb-4">
              Creates a five-minute single-use handoff. The exchanged organizer session lasts 15 minutes, is revocable, and preserves the real platform actor in every audit record.
            </p>
            <div className="space-y-2"><select aria-label="Impersonation target user" value={handoff.target_user_id} onChange={event => setHandoff(value => ({ ...value, target_user_id: event.target.value }))} className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs"><option value="">Select active organization user</option>{((members.data?.data as any)?.items ?? []).filter((item: any) => item.is_active && item.user_id).map((item: any) => <option key={item.user_id} value={item.user_id}>{item.email} · {item.org_role}</option>)}</select><input aria-label="Impersonation case reference" value={handoff.case_reference} onChange={event => setHandoff(value => ({ ...value, case_reference: event.target.value }))} placeholder="Support or security case" className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs" /><textarea aria-label="Impersonation reason" value={handoff.reason} onChange={event => setHandoff(value => ({ ...value, reason: event.target.value }))} placeholder="Justification (minimum 12 characters)" className="min-h-20 w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs" /></div>
            <button disabled={!handoff.target_user_id || handoff.case_reference.length < 2 || handoff.reason.length < 12 || createHandoff.isPending} onClick={async () => { try { const result = await createHandoff.mutateAsync(handoff); const portalBase = process.env.NEXT_PUBLIC_ORGANISER_PORTAL_URL || "http://localhost:3001"; window.open(`${portalBase}/impersonate?code=${encodeURIComponent(result.handoff_code)}`, "_blank", "noopener,noreferrer"); setHandoff({ target_user_id: "", case_reference: "", reason: "" }); toast.success("Single-use organizer handoff opened"); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create handoff"); } }} className="mt-3 rounded-xl bg-[var(--status-danger)] px-4 py-2 text-xs font-bold text-white disabled:opacity-40">Create and open governed handoff</button>
          </OrgCard>

          <OrgCard>
            <OrgSectionTitle>Lifecycle & Status Overrides</OrgSectionTitle>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-surface-3)]">
                <div>
                  <p className="text-xs font-bold text-[var(--text-primary)]">Request organisation archive</p>
                  <p className="text-[10px] text-[var(--text-tertiary)]">Queues an archive job; completion is recorded in the lifecycle ledger</p>
                </div>
                <GovernedActionButton
                  key={`${orgId}:archive`}
                  label="Request archive" title="Archive organisation without deleting data"
                  requireCaseReference={false}
                  onConfirm={({ reason }) => requestLifecycle("ARCHIVE", reason)}
                  disabled={createJob.isPending || summaryError || summaryFetching || lifecycleReview || org?.lifecycle_state !== "ACTIVE" || !Number.isInteger(org?.profile_version)}
                  className="px-3 py-1.5 rounded-lg border border-[var(--status-warning)] text-[var(--status-warning)] text-xs font-bold hover:bg-[var(--status-warning)]/10 disabled:opacity-40"
                />
              </div>
              {org?.lifecycle_state === "ARCHIVED" ? <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-surface-3)]">
                <div><p className="text-xs font-bold">Restore archived organisation</p><p className="text-[10px] text-[var(--text-tertiary)]">Preserves contracts and does not approve suspended relationships</p></div>
                <GovernedActionButton key={`${orgId}:restore`} label="Request restore" title="Restore archived organisation" requireCaseReference={false}
                  disabled={createJob.isPending || summaryError || summaryFetching || lifecycleReview || !Number.isInteger(org?.profile_version)}
                  onConfirm={({ reason }) => requestLifecycle("RESTORE", reason)} className="px-3 py-1.5 rounded-lg border border-[var(--border-default)] text-xs font-bold disabled:opacity-40" />
              </div> : null}
              {lifecycleReview ? <p role="alert" className="text-xs text-[var(--status-warning)]">The organisation changed. Review its current state before trying again. <button type="button" disabled={summaryFetching || summaryError} onClick={() => setLifecycleReview(false)} className="underline disabled:opacity-40">I have reviewed the updated organisation</button></p> : null}
            </div>
          </OrgCard>
        </div>
      )}

      {/* ── Commercial Overrides ───────────────────────────── */}
      {activeTab === "commercial-controls" && (
        <OrgCard>
          <OrgSectionTitle>Commercial & Billing Overrides</OrgSectionTitle>
          <p className="mt-3 text-xs text-[var(--text-tertiary)]">Use Commercial workspace override requests and Financial workspace adjustments. Both require a separately approved request; Internal Admin does not bypass that control.</p>
        </OrgCard>
      )}

      {/* ── Event Overrides ────────────────────────────────── */}
      {activeTab === "event-controls" && (
        <OrgCard>
          <OrgSectionTitle>Super Admin Event Controls</OrgSectionTitle>
          <p className="text-xs text-[var(--text-tertiary)] mb-4">
            Perform administrative operations across all tenant events.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => router.push(`/organizations/${orgId}/events`)}
              className="px-4 py-2 bg-[var(--brand-primary)] text-[var(--primary-contrast)] text-xs font-bold rounded-xl"
            >
              Open Events Directory & Controls
            </button>
          </div>
        </OrgCard>
      )}

      {/* ── Platform Operations ────────────────────────────── */}
      {activeTab === "platform-ops" && (
        <div className="space-y-4">
          {diagnostics.isLoading ? (
            <div className="grid gap-3 md:grid-cols-5">
              {[0, 1, 2, 3, 4].map((item) => (
                <div key={item} className="h-24 animate-pulse rounded-2xl bg-[var(--bg-surface-3)]" />
              ))}
            </div>
          ) : diagnostics.isError || !diagnostics.data ? (
            <OrgCard>
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-[var(--status-danger)]" />
                <div>
                  <p className="text-sm font-bold text-[var(--text-primary)]">Capability diagnostics unavailable</p>
                  <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                    The authoritative diagnostics API failed. No zero-value or healthy state has been inferred.
                  </p>
                  <button
                    onClick={() => diagnostics.refetch()}
                    className="mt-3 rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-xs font-bold"
                  >
                    Retry
                  </button>
                </div>
              </div>
            </OrgCard>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                <OrgMetricCard label="Rollout mode" value={diagnostics.data.rollout.mode} />
                <OrgMetricCard label="Gate denials" value={diagnostics.data.summary.gate_denials} sub="Last 24 hours" />
                <OrgMetricCard label="Resolver failures" value={diagnostics.data.summary.resolution_failures} sub="Last 24 hours" />
                <OrgMetricCard label="Shadow divergence" value={diagnostics.data.summary.shadow_divergences} sub="Last 24 hours" />
                <OrgMetricCard label="Meter drift" value={diagnostics.data.summary.metering_drift} sub="Last 24 hours" />
                <OrgMetricCard label="Legacy calls" value={diagnostics.data.summary.legacy_resolver_calls} sub="Last 24 hours" />
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
                <OrgCard>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <OrgSectionTitle>Recent capability evidence</OrgSectionTitle>
                      <p className="text-xs text-[var(--text-tertiary)]">
                        Tenant-scoped denials, failures, divergence, and reconciliation drift. Metadata is secret-redacted before storage.
                      </p>
                    </div>
                    <button
                      onClick={() => diagnostics.refetch()}
                      className="rounded-lg border border-[var(--border-default)] p-2 text-[var(--text-secondary)]"
                      aria-label="Refresh capability diagnostics"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${diagnostics.isFetching ? "animate-spin" : ""}`} />
                    </button>
                  </div>
                  {diagnostics.data.items.length ? (
                    <div className="mt-4 max-h-[420px] space-y-2 overflow-auto pr-1">
                      {diagnostics.data.items.map((item) => (
                        <div key={item.id} className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <OrgStatusBadge status={item.severity} />
                              <span className="font-mono text-[11px] font-bold text-[var(--text-primary)]">{item.event_type}</span>
                              {item.reason_code ? <span className="font-mono text-[10px] text-[var(--status-warning)]">{item.reason_code}</span> : null}
                            </div>
                            <span className="text-[10px] text-[var(--text-tertiary)]">{new Date(item.occurred_at).toLocaleString()}</span>
                          </div>
                          <div className="mt-2 grid gap-1 text-[10px] text-[var(--text-secondary)] sm:grid-cols-2">
                            <span>Source: <span className="font-mono">{item.source}</span></span>
                            <span>Event: <span className="font-mono">{item.event_id ?? "Organization scope"}</span></span>
                            <span>Capability: <span className="font-mono">{item.capability_key ?? item.limit_key ?? "—"}</span></span>
                            <span>Operation: <span className="font-mono">{item.operation_key ?? "—"}</span></span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 rounded-xl border border-[var(--status-success)]/20 bg-[var(--status-success-muted)] px-3 py-3 text-xs text-[var(--status-success)]">
                      No capability diagnostic events were recorded for this organization in the selected 24-hour window.
                    </p>
                  )}
                </OrgCard>

                <div className="space-y-4">
                  <OrgCard>
                    <OrgSectionTitle>Coverage integrity</OrgSectionTitle>
                    <div className="grid grid-cols-2 gap-3">
                      <OrgMetricCard label="Features" value={diagnostics.data.coverage.feature_count} />
                      <OrgMetricCard label="Limits" value={diagnostics.data.coverage.limit_count} />
                    </div>
                    {[
                      ["Missing catalogue keys", diagnostics.data.coverage.missing_catalogue_keys],
                      ["Unknown catalogue keys", diagnostics.data.coverage.unknown_catalogue_keys],
                      ["Ungated operations", diagnostics.data.coverage.ungated_operations],
                      ["Unenforced limits", diagnostics.data.coverage.unenforced_limits],
                    ].map(([label, items]) => (
                      <div key={label as string} className="mt-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{label as string}</p>
                        {(items as string[]).length ? (
                          <p className="mt-1 break-words font-mono text-[10px] text-[var(--status-danger)]">{(items as string[]).join(", ")}</p>
                        ) : (
                          <p className="mt-1 text-xs font-bold text-[var(--status-success)]">None</p>
                        )}
                      </div>
                    ))}
                  </OrgCard>

                  <OrgCard>
                    <OrgSectionTitle>Flag hygiene</OrgSectionTitle>
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-2xl font-black text-[var(--text-primary)]">{diagnostics.data.flag_hygiene.attention_count}</p>
                        <p className="text-[10px] text-[var(--text-tertiary)]">of {diagnostics.data.flag_hygiene.total_flags} flags need attention</p>
                      </div>
                      <button
                        onClick={() => router.push("/developer/feature-flags")}
                        className="rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-xs font-bold"
                      >
                        Open flags
                      </button>
                    </div>
                    {diagnostics.data.flag_hygiene.items.slice(0, 5).map((flag) => (
                      <div key={flag.id} className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--border-default)] pt-3">
                        <span className="truncate font-mono text-[10px] text-[var(--text-primary)]">{flag.flag_key}</span>
                        <span className="text-[10px] font-bold text-[var(--status-warning)]">{flag.reasons.join(" · ")}</span>
                      </div>
                    ))}
                  </OrgCard>

                  <OrgCard>
                    <OrgSectionTitle>Cache & rebuild jobs</OrgSectionTitle>
                    <p className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs text-[var(--text-tertiary)]">
                      Cache purge and search rebuild remain unavailable until tenant-scoped operational jobs expose authoritative status and audit evidence.
                    </p>
                  </OrgCard>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Financial Operations ───────────────────────────── */}
      {activeTab === "financial-ops" && (
        <OrgCard>
          <OrgSectionTitle>Financial Operations</OrgSectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">MRR</p>
              <p className="text-lg font-black text-[var(--text-primary)] font-mono">Not measured</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Outstanding Invoices</p>
              <p className="text-lg font-black text-[var(--text-primary)] font-mono">Not measured</p>
            </div>
          </div>
        </OrgCard>
      )}

      {/* ── Danger Zone ────────────────────────────────────── */}
      {activeTab === "danger-zone" && (
        <div className="rounded-2xl border-2 border-[var(--status-danger)]/30 bg-[var(--status-danger)]/5 overflow-hidden">
          <div className="p-5 border-b border-[var(--status-danger)]/20 flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-[var(--status-danger)]" />
            <h3 className="text-sm font-black text-[var(--status-danger)] uppercase tracking-wider">Danger Zone</h3>
          </div>
          <div className="p-5 flex items-start justify-between gap-6">
            <div>
              <p className="text-sm font-bold text-[var(--text-primary)] mb-1">Delete Organization</p>
              <p className="text-xs text-[var(--text-tertiary)] leading-relaxed max-w-2xl">
                {destructiveLifecycleUnavailableReason}
              </p>
            </div>
            <button
              disabled
              className="shrink-0 px-4 py-2.5 rounded-xl bg-[var(--status-danger)] text-white text-xs font-bold opacity-40"
            >
              Purge unavailable
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
