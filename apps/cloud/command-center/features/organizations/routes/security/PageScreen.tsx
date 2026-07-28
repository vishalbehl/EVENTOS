"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ShieldCheck, Shield, Laptop2, Lock, Braces, Key, Webhook,
  AlertTriangle, RefreshCw
} from "lucide-react";
import { useOrganizationDomain, usePrivilegedAccessSessions, useCreatePrivilegedAccessSession, useRevokePrivilegedAccessSession, useSecurityPolicyUpdate, useRevokeTrustedDevice, useRevokeOrganizationSessions, useCreateOrganizationApiKey, useRevokeOrganizationApiKey, useCreateIntegrationConnection, useUpdateIntegrationConnection, useCapabilityRestrictions, useRequestCapabilityRestriction, useDecideCapabilityRestriction, useRequestCapabilityRestrictionRevocation, useDecideCapabilityRestrictionRevocation } from "@/features/organizations/api/organization-console-api";
import { toast } from "sonner";
import { GovernedActionButton } from "@/features/organizations/components/GovernedActionButton";
import {
  OrgPageHeader, OrgCard, OrgTabBar, OrgDataTable, OrgStatusBadge,
  OrgSectionTitle, OrgMetricCard, LoadingPage,
} from "@/features/organizations/components/OrgPageShared";

export default function SecurityPageScreen() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;

  const [activeTab, setActiveTab] = useState("policy");
  const [accessReason, setAccessReason] = useState("");
  const [caseReference, setCaseReference] = useState("");
  const [securityReason, setSecurityReason] = useState("");
  const [policyDraft, setPolicyDraft] = useState({ require_mfa: true, allowed_auth_methods: "PASSWORD,TOTP", sso_enforced: false, allowed_cidrs: "" });
  const [apiKeyForm, setApiKeyForm] = useState({ name: "", expires_in_days: "30", reason: "", case_reference: "" });
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [integrationForm, setIntegrationForm] = useState({ provider_id: "", reason: "", case_reference: "" });
  const [restrictionForm, setRestrictionForm] = useState({ event_id: "", capability_key: "", restriction_type: "SECURITY" as "SECURITY" | "OPERATIONAL" | "COMPLIANCE" | "SUSPENSION", reason_code: "SECURITY_RESTRICTED" as "SUSPENDED" | "SECURITY_RESTRICTED" | "ROLLOUT_DISABLED" | "PROVIDER_UNAVAILABLE", reason: "", case_reference: "", expires_at: "" });

  const { data: secRes, isLoading } = useOrganizationDomain(orgId, "security");
  const { data: apiRes } = useOrganizationDomain(orgId, "api-webhooks");
  const { data: integrationRes } = useOrganizationDomain(orgId, "integrations");
  const privilegedAccess = usePrivilegedAccessSessions(orgId);
  const createPrivilegedAccess = useCreatePrivilegedAccessSession(orgId);
  const revokePrivilegedAccess = useRevokePrivilegedAccessSession(orgId);
  const updatePolicy = useSecurityPolicyUpdate(orgId);
  const revokeDevice = useRevokeTrustedDevice(orgId);
  const revokeSessions = useRevokeOrganizationSessions(orgId);
  const createApiKey = useCreateOrganizationApiKey(orgId);
  const revokeApiKey = useRevokeOrganizationApiKey(orgId);
  const createConnection = useCreateIntegrationConnection(orgId);
  const updateConnection = useUpdateIntegrationConnection(orgId);
  const restrictions = useCapabilityRestrictions(orgId);
  const requestRestriction = useRequestCapabilityRestriction(orgId);
  const decideRestriction = useDecideCapabilityRestriction(orgId);
  const requestRestrictionRevocation = useRequestCapabilityRestrictionRevocation(orgId);
  const decideRestrictionRevocation = useDecideCapabilityRestrictionRevocation(orgId);

  const secData = secRes?.data as any;
  const policy = secData?.policy ?? null;
  const devices: any[] = secData?.trusted_devices ?? [];
  const secEvents: any[] = secData?.security_events ?? [];

  const apiData = apiRes?.data as any;
  const apiKeys: any[] = apiData?.api_keys ?? [];
  const webhooks: any[] = apiData?.webhooks ?? [];
  const integrationData = integrationRes?.data as any;
  const providers: any[] = integrationData?.providers ?? [];
  const connections: any[] = integrationData?.connections ?? [];

  const highCount = secEvents.filter((e) => e.risk_level === "HIGH" || e.risk_level === "CRITICAL").length;
  useEffect(() => { if (policy) setPolicyDraft({ require_mfa: Boolean(policy.require_mfa), allowed_auth_methods: (policy.allowed_auth_methods ?? []).join(","), sso_enforced: Boolean(policy.sso_enforced), allowed_cidrs: (policy.allowed_cidrs ?? []).join(",") }); }, [policy?.version]);

  if (isLoading) return <LoadingPage />;

  const tabs = [
    { key: "policy", label: "Security Policy & SSO" },
    { key: "api-webhooks", label: "API Keys & Webhooks" },
    { key: "devices", label: "Devices & Sessions" },
    { key: "restrictions", label: "Capability Restrictions" },
    { key: "audit", label: "Security Events" },
    { key: "privileged-access", label: "Sensitive Data Access" },
  ];

  return (
    <div className="p-6 space-y-6">
      <OrgPageHeader
        icon={ShieldCheck}
        title="Security Workspace"
        description="Comprehensive security policy enforcement, API credentials, active sessions & security audit."
      />

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <OrgMetricCard label="MFA Status" value={policy?.require_mfa ? "Enforced" : "Optional"} />
        <OrgMetricCard label="Active API Keys" value={apiKeys.filter((k) => k.is_active).length} />
        <OrgMetricCard label="Registered Devices" value={devices.length} />
        <OrgMetricCard label="Security Risk Events" value={highCount} />
      </div>

      <OrgTabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {activeTab === "restrictions" && (
        <div className="space-y-5">
          <OrgCard>
            <OrgSectionTitle>Request a governed restriction</OrgSectionTitle>
            <p className="mb-3 text-xs text-[var(--text-tertiary)]">Leave event and capability blank to suspend the whole organization. Requests default to a 24-hour expiry and require approval by a different Super Admin.</p>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              <input value={restrictionForm.event_id} onChange={event => setRestrictionForm(value => ({ ...value, event_id: event.target.value }))} placeholder="Event ID (optional)" className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs" />
              <input value={restrictionForm.capability_key} onChange={event => setRestrictionForm(value => ({ ...value, capability_key: event.target.value.toUpperCase() }))} placeholder="FEAT_* (optional)" className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs" />
              <select value={restrictionForm.restriction_type} onChange={event => setRestrictionForm(value => ({ ...value, restriction_type: event.target.value as typeof value.restriction_type }))} className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs"><option>SECURITY</option><option>OPERATIONAL</option><option>COMPLIANCE</option><option>SUSPENSION</option></select>
              <select value={restrictionForm.reason_code} onChange={event => setRestrictionForm(value => ({ ...value, reason_code: event.target.value as typeof value.reason_code }))} className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs"><option>SECURITY_RESTRICTED</option><option>SUSPENDED</option><option>ROLLOUT_DISABLED</option><option>PROVIDER_UNAVAILABLE</option></select>
              <input type="datetime-local" value={restrictionForm.expires_at} onChange={event => setRestrictionForm(value => ({ ...value, expires_at: event.target.value }))} className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs" />
              <input value={restrictionForm.case_reference} onChange={event => setRestrictionForm(value => ({ ...value, case_reference: event.target.value }))} placeholder="Case reference" className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs" />
              <input value={restrictionForm.reason} onChange={event => setRestrictionForm(value => ({ ...value, reason: event.target.value }))} placeholder="Reason (minimum 12 characters)" className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs xl:col-span-2" />
            </div>
            <button disabled={restrictionForm.reason.length < 12 || restrictionForm.case_reference.length < 2 || requestRestriction.isPending} onClick={async () => { try { await requestRestriction.mutateAsync({ event_id: restrictionForm.event_id || undefined, capability_key: restrictionForm.capability_key || undefined, restriction_type: restrictionForm.restriction_type, reason_code: restrictionForm.reason_code, reason: restrictionForm.reason, case_reference: restrictionForm.case_reference, expires_at: restrictionForm.expires_at ? new Date(restrictionForm.expires_at).toISOString() : undefined }); toast.success("Restriction submitted for independent approval"); setRestrictionForm(value => ({ ...value, reason: "", case_reference: "" })); } catch (error) { toast.error(error instanceof Error ? error.message : "Restriction request failed"); } }} className="mt-3 rounded-xl bg-[var(--status-danger)] px-4 py-2 text-xs font-bold text-white disabled:opacity-40">Request restriction</button>
          </OrgCard>
          <OrgCard>
            <OrgSectionTitle>Restriction requests and active controls</OrgSectionTitle>
            <OrgDataTable columns={[
              { key: "scope", header: "Scope", render: (row: any) => <div><p className="text-xs font-bold">{row.capability_key || (row.event_id ? "All event capabilities" : "Entire organization")}</p><p className="text-[10px] text-[var(--text-tertiary)]">{row.event_id || orgId}</p></div> },
              { key: "reason", header: "Reason", render: (row: any) => <div><p className="text-xs">{row.reason_code}</p><p className="text-[10px] text-[var(--text-tertiary)]">{row.case_reference} · {row.reason}</p></div> },
              { key: "expiry", header: "Expiry", render: (row: any) => <span className="text-[10px]">{row.expires_at ? new Date(row.expires_at).toLocaleString() : "Permanent"}</span> },
              { key: "status", header: "Status", render: (row: any) => <OrgStatusBadge status={row.status} /> },
              {
                key: "actions",
                header: "Governance",
                render: (row: any) => (
                  <div className="flex gap-2">
                    {row.status === "PENDING" && (
                      <>
                        <button onClick={() => decideRestriction.mutate({ id: row.id, version: row.version, decision: "APPROVED", reason: "Approved after independent security review" })} className="text-[10px] font-bold text-[var(--status-success)]">Approve</button>
                        <button onClick={() => decideRestriction.mutate({ id: row.id, version: row.version, decision: "REJECTED", reason: "Rejected after independent security review" })} className="text-[10px] font-bold text-[var(--status-danger)]">Reject</button>
                      </>
                    )}
                    {row.status === "APPROVED" && row.revocation_status !== "PENDING" && (
                      <GovernedActionButton
                        label="Request restore"
                        title="Request restriction revocation"
                        className="text-[10px] font-bold text-[var(--brand-primary)]"
                        onConfirm={({ reason, caseReference }) => requestRestrictionRevocation.mutateAsync({ id: row.id, version: row.version, reason, case_reference: caseReference }).then(() => undefined)}
                      />
                    )}
                    {row.status === "APPROVED" && row.revocation_status === "PENDING" && (
                      <>
                        <button onClick={() => decideRestrictionRevocation.mutate({ id: row.id, version: row.version, decision: "APPROVED", reason: "Access restoration approved after independent security review" })} className="text-[10px] font-bold text-[var(--status-success)]">Approve restore</button>
                        <button onClick={() => decideRestrictionRevocation.mutate({ id: row.id, version: row.version, decision: "REJECTED", reason: "Access restoration rejected after independent security review" })} className="text-[10px] font-bold text-[var(--status-danger)]">Reject restore</button>
                      </>
                    )}
                  </div>
                ),
              },
            ]} rows={restrictions.data?.items ?? []} keyFn={(row: any) => row.id} emptyMessage={restrictions.isError ? "Restriction data unavailable" : "No restriction records"} />
          </OrgCard>
        </div>
      )}

      {/* ── Policy Tab ──────────────────────────────────────── */}
      {activeTab === "policy" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <OrgCard>
            <OrgSectionTitle>MFA & Authentication</OrgSectionTitle>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-[var(--text-secondary)]">Require MFA</span>
                <span className="font-bold text-[var(--text-primary)]">{policy?.require_mfa ? "YES" : "NO"}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-[var(--text-secondary)]">Auth Methods</span>
                <span className="font-bold text-[var(--text-primary)]">{policy?.allowed_auth_methods?.join(", ") || "All"}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-[var(--text-secondary)]">SSO Enforced</span>
                <span className="font-bold text-[var(--text-primary)]">{policy?.sso_enforced ? "YES" : "NO"}</span>
              </div>
            </div>
          </OrgCard>

          <OrgCard>
            <OrgSectionTitle>Password Policy</OrgSectionTitle>
            {policy?.password_policy ? (
              Object.entries(policy.password_policy).map(([k, v]) => (
                <div key={k} className="flex justify-between text-xs mb-2">
                  <span className="text-[var(--text-secondary)] capitalize">{k.replace(/_/g, " ")}</span>
                  <span className="font-bold text-[var(--text-primary)]">{String(v)}</span>
                </div>
              ))
            ) : (
              <p className="text-xs text-[var(--text-tertiary)]">Platform standard password rules active.</p>
            )}
          </OrgCard>

          <OrgCard>
            <OrgSectionTitle>IP CIDR Allowlist</OrgSectionTitle>
            {policy?.allowed_cidrs?.length > 0 ? (
              <div className="space-y-1.5">
                {policy.allowed_cidrs.map((cidr: string, i: number) => (
                  <div key={i} className="flex items-center gap-2 bg-[var(--bg-surface-3)] px-3 py-1.5 rounded-lg text-xs font-mono text-[var(--text-primary)]">
                    <Lock className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                    {cidr}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--text-tertiary)]">All IP addresses permitted.</p>
            )}
          </OrgCard>
          <OrgCard className="md:col-span-3">
            <OrgSectionTitle>Edit organization security policy</OrgSectionTitle>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={policyDraft.require_mfa} onChange={event => setPolicyDraft(value => ({ ...value, require_mfa: event.target.checked }))} />Require MFA</label><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={policyDraft.sso_enforced} onChange={event => setPolicyDraft(value => ({ ...value, sso_enforced: event.target.checked }))} />Enforce SSO</label><input value={policyDraft.allowed_auth_methods} onChange={event => setPolicyDraft(value => ({ ...value, allowed_auth_methods: event.target.value }))} placeholder="Auth methods, comma separated" className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs" /><input value={policyDraft.allowed_cidrs} onChange={event => setPolicyDraft(value => ({ ...value, allowed_cidrs: event.target.value }))} placeholder="CIDRs, comma separated" className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs" /></div><input value={securityReason} onChange={event => setSecurityReason(event.target.value)} placeholder="Security change reason (minimum 12 characters)" className="mt-3 w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs" /><button disabled={securityReason.trim().length < 12 || updatePolicy.isPending} onClick={async () => { try { await updatePolicy.mutateAsync({ require_mfa: policyDraft.require_mfa, allowed_auth_methods: policyDraft.allowed_auth_methods.split(",").map(value => value.trim()).filter(Boolean), password_policy: policy?.password_policy ?? {}, session_policy: policy?.session_policy ?? {}, trusted_device_policy: policy?.trusted_device_policy ?? {}, sso_config: policy?.sso_config ?? {}, sso_enforced: policyDraft.sso_enforced, allowed_cidrs: policyDraft.allowed_cidrs.split(",").map(value => value.trim()).filter(Boolean), version: policy?.version ?? 1, reason: securityReason }); toast.success("Security policy updated"); setSecurityReason(""); } catch (error) { toast.error(error instanceof Error ? error.message : "Security update failed"); } }} className="mt-3 rounded-xl bg-[var(--brand-primary)] px-4 py-2 text-xs font-bold text-[var(--primary-contrast)] disabled:opacity-40">Save security policy</button>
          </OrgCard>
        </div>
      )}

      {activeTab === "privileged-access" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <OrgCard>
            <OrgSectionTitle>Start time-limited access</OrgSectionTitle>
            <p className="text-xs text-[var(--text-tertiary)] mb-4">PII remains masked until a step-up authenticated session is started. Every access session is audited.</p>
            <div className="space-y-3"><input value={caseReference} onChange={e => setCaseReference(e.target.value)} placeholder="Support, legal, or security case" className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs" /><textarea value={accessReason} onChange={e => setAccessReason(e.target.value)} placeholder="Reason (minimum 12 characters)" className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs" /><button disabled={caseReference.length < 2 || accessReason.length < 12 || createPrivilegedAccess.isPending} onClick={async () => { try { await createPrivilegedAccess.mutateAsync({ reason: accessReason, case_reference: caseReference, field_categories: ["IDENTITY", "CONTACT", "PAYMENT"], duration_minutes: 15 }); toast.success("Sensitive-data access active for 15 minutes"); setAccessReason(""); setCaseReference(""); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not start sensitive-data access"); } }} className="rounded-xl bg-[var(--status-danger)] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Start 15-minute access</button></div>
          </OrgCard>
          <OrgCard>
            <OrgSectionTitle>Your access history</OrgSectionTitle>
            <div className="space-y-2">{(privilegedAccess.data?.items ?? []).map(session => <div key={session.id} className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] p-3 flex items-center justify-between gap-3"><div><p className="text-xs font-bold text-[var(--text-primary)]">{session.case_reference}</p><p className="text-[10px] text-[var(--text-tertiary)]">{session.field_categories.join(", ")} · expires {new Date(session.expires_at).toLocaleString()}</p></div>{session.active ? <button onClick={() => revokePrivilegedAccess.mutate(session.id)} className="text-[10px] font-bold text-[var(--status-danger)]">End access</button> : <OrgStatusBadge status={session.revoked_at ? "REVOKED" : "EXPIRED"} />}</div>)}{!privilegedAccess.isLoading && !privilegedAccess.data?.items.length && <p className="text-xs text-[var(--text-tertiary)]">No sensitive-data access sessions recorded for your account.</p>}</div>
          </OrgCard>
        </div>
      )}

      {/* ── API & Webhooks Tab ─────────────────────────────── */}
      {activeTab === "api-webhooks" && (
        <div className="space-y-6">
          <OrgCard>
            <OrgSectionTitle>Create organization API key</OrgSectionTitle>
            <p className="mb-3 text-[10px] text-[var(--text-tertiary)]">The plaintext secret is displayed once. Global credential policy remains owned by Developer Console.</p>
            {revealedSecret && <div className="mb-3 rounded-xl border border-[var(--status-warning)]/30 bg-[var(--status-warning)]/5 p-3"><p className="text-[10px] font-bold uppercase text-[var(--status-warning)]">Copy this secret now</p><code className="mt-1 block break-all text-xs">{revealedSecret}</code><button onClick={() => setRevealedSecret(null)} className="mt-2 text-[10px] font-bold">I have stored it securely</button></div>}
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4"><input value={apiKeyForm.name} onChange={event => setApiKeyForm(value => ({ ...value, name: event.target.value }))} placeholder="Key name" className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs" /><input type="number" min="1" max="3650" value={apiKeyForm.expires_in_days} onChange={event => setApiKeyForm(value => ({ ...value, expires_in_days: event.target.value }))} placeholder="Expiry days" className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs" /><input value={apiKeyForm.case_reference} onChange={event => setApiKeyForm(value => ({ ...value, case_reference: event.target.value }))} placeholder="Case reference" className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs" /><input value={apiKeyForm.reason} onChange={event => setApiKeyForm(value => ({ ...value, reason: event.target.value }))} placeholder="Reason (minimum 12 characters)" className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs" /></div><button disabled={!apiKeyForm.name || apiKeyForm.case_reference.length < 2 || apiKeyForm.reason.length < 12 || createApiKey.isPending} onClick={async () => { try { const result = await createApiKey.mutateAsync({ idempotencyKey: crypto.randomUUID(), payload: { name: apiKeyForm.name, expires_in_days: Number(apiKeyForm.expires_in_days), reason: apiKeyForm.reason, case_reference: apiKeyForm.case_reference } }); setRevealedSecret(result.plaintext_key ?? null); toast.success("API key created"); } catch (error) { toast.error(error instanceof Error ? error.message : "API key creation failed"); } }} className="mt-3 rounded-xl bg-[var(--brand-primary)] px-4 py-2 text-xs font-bold text-[var(--primary-contrast)] disabled:opacity-40">Create API key</button>
          </OrgCard>
          <OrgCard>
            <OrgSectionTitle>Developer API Keys ({apiKeys.length})</OrgSectionTitle>
            <OrgDataTable
              columns={[
                { key: "name", header: "Key Name", render: (k: any) => (
                  <div>
                    <p className="text-xs font-bold text-[var(--text-primary)]">{k.name}</p>
                    <p className="text-[10px] font-mono text-[var(--text-tertiary)]">{k.prefix}***</p>
                  </div>
                )},
                { key: "status", header: "Status", render: (k: any) => <OrgStatusBadge status={k.is_active ? "ACTIVE" : "INACTIVE"} /> },
                { key: "last_used", header: "Last Used", render: (k: any) => (
                  <span className="text-[10px] font-mono text-[var(--text-tertiary)]">
                    {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : "Never"}
                  </span>
                )},
                { key: "action", header: "Action", render: (k: any) => k.is_active ? <button disabled={apiKeyForm.reason.length < 12} onClick={async () => { try { await revokeApiKey.mutateAsync({ keyId: k.id, reason: apiKeyForm.reason }); toast.success("API key revoked"); } catch (error) { toast.error(error instanceof Error ? error.message : "API key revocation failed"); } }} className="text-[10px] font-bold text-[var(--status-danger)] disabled:opacity-40">Revoke</button> : null },
              ]}
              rows={apiKeys}
              keyFn={(k: any) => k.id}
              emptyMessage="No API keys generated"
            />
          </OrgCard>

          <OrgCard>
            <OrgSectionTitle>Organization integration connections</OrgSectionTitle>
            <div className="my-3 grid gap-2 md:grid-cols-3"><select value={integrationForm.provider_id} onChange={event => setIntegrationForm(value => ({ ...value, provider_id: event.target.value }))} className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs"><option value="">Select global provider</option>{providers.map(provider => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select><input value={integrationForm.case_reference} onChange={event => setIntegrationForm(value => ({ ...value, case_reference: event.target.value }))} placeholder="Case reference" className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs" /><input value={integrationForm.reason} onChange={event => setIntegrationForm(value => ({ ...value, reason: event.target.value }))} placeholder="Reason (minimum 12 characters)" className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs" /></div><button disabled={!integrationForm.provider_id || integrationForm.case_reference.length < 2 || integrationForm.reason.length < 12 || createConnection.isPending} onClick={async () => { try { await createConnection.mutateAsync({ idempotencyKey: crypto.randomUUID(), payload: integrationForm }); toast.success("Integration connected"); } catch (error) { toast.error(error instanceof Error ? error.message : "Connection failed"); } }} className="rounded-xl bg-[var(--brand-primary)] px-4 py-2 text-xs font-bold text-[var(--primary-contrast)] disabled:opacity-40">Connect provider</button>
            <OrgDataTable columns={[{ key: "provider", header: "Provider", render: (row: any) => <span className="text-xs font-bold">{row.provider_name}</span> }, { key: "status", header: "Status", render: (row: any) => <OrgStatusBadge status={row.is_active ? "ACTIVE" : "PAUSED"} /> }, { key: "action", header: "Action", render: (row: any) => <button disabled={integrationForm.reason.length < 12 || integrationForm.case_reference.length < 2} onClick={async () => { try { await updateConnection.mutateAsync({ connectionId: row.id, version: row.version, is_active: !row.is_active, reason: integrationForm.reason, case_reference: integrationForm.case_reference }); toast.success(row.is_active ? "Integration paused" : "Integration resumed"); } catch (error) { toast.error(error instanceof Error ? error.message : "Integration update failed"); } }} className="text-[10px] font-bold text-[var(--brand-primary)] disabled:opacity-40">{row.is_active ? "Pause" : "Resume"}</button> }]} rows={connections} keyFn={(row: any) => row.id} emptyMessage="No organization integration connections" />
          </OrgCard>

          <OrgCard>
            <OrgSectionTitle>Registered Webhook Endpoints ({webhooks.length})</OrgSectionTitle>
            <OrgDataTable
              columns={[
                { key: "url", header: "Endpoint URL", render: (w: any) => (
                  <span className="text-xs font-mono text-[var(--text-primary)] truncate max-w-[250px] block">{w.url}</span>
                )},
                { key: "status", header: "Status", render: (w: any) => <OrgStatusBadge status={w.status || "ACTIVE"} /> },
                { key: "deliveries", header: "Deliveries", render: (w: any) => (
                  <span className="text-xs font-mono text-[var(--text-secondary)]">{w.total_deliveries ?? 0}</span>
                )},
              ]}
              rows={webhooks}
              keyFn={(w: any) => w.id}
              emptyMessage="No webhook endpoints registered"
            />
          </OrgCard>
        </div>
      )}

      {/* ── Devices Tab ─────────────────────────────────────── */}
      {activeTab === "devices" && (
        <OrgCard>
          <OrgSectionTitle>Active Sessions & Trusted Devices ({devices.length})</OrgSectionTitle>
          <div className="my-3 flex flex-wrap gap-2"><input value={securityReason} onChange={event => setSecurityReason(event.target.value)} placeholder="Revocation reason (minimum 12 characters)" className="min-w-72 flex-1 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs" /><button disabled={securityReason.trim().length < 12 || revokeSessions.isPending} onClick={async () => { try { const result = await revokeSessions.mutateAsync(securityReason) as { sessions_revoked?: number }; toast.success(`${result.sessions_revoked ?? 0} sessions revoked`); setSecurityReason(""); } catch (error) { toast.error(error instanceof Error ? error.message : "Session revocation failed"); } }} className="rounded-xl bg-[var(--status-danger)] px-4 py-2 text-xs font-bold text-white disabled:opacity-40">Revoke all sessions</button></div>
          <OrgDataTable
            columns={[
              { key: "device", header: "Fingerprint", render: (d: any) => (
                <div className="flex items-center gap-2">
                  <Laptop2 className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                  <span className="text-xs font-mono text-[var(--text-primary)]">{d.device_fingerprint_hash?.slice(0, 24) || "—"}</span>
                </div>
              )},
              { key: "user", header: "User ID", render: (d: any) => (
                <span className="text-xs font-mono text-[var(--text-secondary)]">{d.user_id?.slice(0, 16) || "—"}</span>
              )},
              { key: "ip", header: "Last IP", render: (d: any) => (
                <span className="text-[10px] font-mono text-[var(--text-tertiary)]">{d.last_seen_ip || "—"}</span>
              )},
              { key: "status", header: "State", render: (d: any) => <OrgStatusBadge status={d.revoked_at ? "INACTIVE" : "ACTIVE"} /> },
              { key: "action", header: "Action", render: (d: any) => !d.revoked_at ? <button disabled={securityReason.trim().length < 12} onClick={async () => { try { await revokeDevice.mutateAsync({ deviceId: d.id, reason: securityReason }); toast.success("Trusted device revoked"); } catch (error) { toast.error(error instanceof Error ? error.message : "Device revocation failed"); } }} className="text-[10px] font-bold text-[var(--status-danger)] disabled:opacity-40">Revoke</button> : null },
            ]}
            rows={devices}
            keyFn={(d: any) => d.id}
            emptyMessage="No devices recorded"
          />
        </OrgCard>
      )}

      {/* ── Audit Events Tab ────────────────────────────────── */}
      {activeTab === "audit" && (
        <OrgCard>
          <OrgSectionTitle>Security Audit Events</OrgSectionTitle>
          <OrgDataTable
            columns={[
              { key: "type", header: "Event Type", render: (e: any) => <span className="text-xs font-bold text-[var(--text-primary)]">{e.event_type || "—"}</span> },
              { key: "risk", header: "Risk Level", render: (e: any) => (
                <span className={`text-[10px] font-bold ${e.risk_level === "CRITICAL" ? "text-[var(--status-danger)]" : "text-[var(--status-warning)]"}`}>
                  {e.risk_level}
                </span>
              )},
              { key: "actor", header: "Actor User ID", render: (e: any) => <span className="text-[10px] font-mono text-[var(--text-tertiary)]">{e.actor_user_id?.slice(0, 16) || "—"}</span> },
              { key: "time", header: "Timestamp", render: (e: any) => (
                <span className="text-[10px] font-mono text-[var(--text-tertiary)]">{e.occurred_at ? new Date(e.occurred_at).toLocaleString() : "—"}</span>
              )},
            ]}
            rows={secEvents}
            keyFn={(e: any) => e.id}
            emptyMessage="No security risk events recorded"
          />
        </OrgCard>
      )}
    </div>
  );
}
