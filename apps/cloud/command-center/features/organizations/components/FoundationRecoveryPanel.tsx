"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { useOrganizationConsoleSummary } from "../api/organization-console-api";
import { OrgCard, OrgSectionTitle } from "./OrgPageShared";
import { GovernedActionButton } from "./GovernedActionButton";

type RecoveryResult = { version: number; membership_version: number | null; invite_token: string | null; invitation_expires_at: string | null };

export function FoundationRecoveryPanel({ organizationId }: { organizationId: string }) {
  const summary = useOrganizationConsoleSummary(organizationId);
  const queries = useQueryClient();
  const [action, setAction] = useState<"classification" | "legacy_lifecycle" | "owner_invitation">("classification");
  const [kind, setKind] = useState("NORMAL");
  const [legacyState, setLegacyState] = useState("ARCHIVED");
  const [email, setEmail] = useState("");
  const [replace, setReplace] = useState(false);
  const [memberVersion, setMemberVersion] = useState("");
  const [approval, setApproval] = useState("");
  const [busy, setBusy] = useState(false);
  const [reviewRequired, setReviewRequired] = useState(false);
  const [link, setLink] = useState("");
  const [notice, setNotice] = useState("");
  const receipt = useRef<{ signature: string; key: string } | null>(null);
  const current = summary.isError ? undefined : summary.data?.organization;
  const version = current?.profile_version;
  const disabled = busy || summary.isFetching || summary.isError || reviewRequired || !Number.isInteger(version)
    || approval.trim().length < 12 || (action === "owner_invitation" && (!email.trim() || (replace && (!Number.isInteger(Number(memberVersion)) || Number(memberVersion) < 1))));
  async function save(reason: string) {
    if (disabled) throw new Error("Reload and review the organisation and recovery decision before saving.");
    const payload = { action, reason, approval_reference: approval.trim(), ...(action === "classification" ? { organization_kind: kind } :
      action === "legacy_lifecycle" ? { legacy_state: legacyState } : { owner_email: email.trim(), replace_existing_membership: replace,
        ...(replace ? { membership_version: Number(memberVersion) } : {}) }) };
    const signature = JSON.stringify([organizationId, version, payload]);
    if (receipt.current?.signature !== signature) receipt.current = { signature, key: crypto.randomUUID() };
    setBusy(true); setNotice("");
    try {
      const result = await apiClient.post<RecoveryResult>(`/platform/organizations/${organizationId}/console/foundation-recovery`, payload,
        { headers: { "If-Match": String(version), "Idempotency-Key": receipt.current.key } });
      const base = process.env.NEXT_PUBLIC_ORGANISER_PORTAL_URL;
      // No guessed deployment URL for a one-time credential.
      setLink(result.invite_token && base ? `${base.replace(/\/$/, "")}/accept-invite#token=${encodeURIComponent(result.invite_token)}` : result.invite_token ?? "");
      setNotice(result.invite_token ? "Pending owner invitation issued. Share the one-time credential only with the designated identity; acceptance is required." :
        action === "owner_invitation" ? "Invitation was already issued. Its secret cannot be retrieved by replay." : "Reviewed recovery decision saved. Commercial contracts and EMC consent were not changed.");
      await queries.invalidateQueries({ queryKey: queryKeys.organizationConsole.domain(organizationId, "summary") });
      await queries.invalidateQueries({ queryKey: queryKeys.organizationConsole.domain(organizationId, "members") });
    } catch (error) {
      if (error instanceof ApiError && error.status === 412) setReviewRequired(true);
      throw error;
    } finally { setBusy(false); }
  }
  return <OrgCard>
    <OrgSectionTitle>Reviewed foundation recovery</OrgSectionTitle>
    <p className="mb-3 text-xs text-[var(--text-tertiary)]">Resolve an explicit reconciliation conflict. No global role is used as customer authority. Legacy lifecycle resolution cannot activate a tenant; an owner invitation cannot approve EMC delegation.</p>
    <div className="space-y-3 text-xs">
      <label className="block">Recovery decision<select value={action} disabled={busy} onChange={event => { setAction(event.target.value as typeof action); setLink(""); }} className="ml-2 rounded border p-2"><option value="classification">Confirm operational classification</option><option value="legacy_lifecycle">Resolve ambiguous inactive state</option><option value="owner_invitation">Invite a designated recovery owner</option></select></label>
      {action === "classification" ? <label className="block">Confirmed organisation kind<select value={kind} disabled={busy} onChange={event => setKind(event.target.value)} className="ml-2 rounded border p-2"><option value="NORMAL">Normal organiser</option><option value="EMC">EMC</option><option value="CLIENT">Client</option></select></label> : null}
      {action === "legacy_lifecycle" ? <label className="block">Recorded legacy intent<select value={legacyState} disabled={busy} onChange={event => setLegacyState(event.target.value)} className="ml-2 rounded border p-2"><option value="ARCHIVED">Archived, data retained</option><option value="SUSPENDED">Suspended</option></select></label> : null}
      {action === "owner_invitation" ? <>
        <label className="block">Designated owner email<input type="email" value={email} disabled={busy} onChange={event => setEmail(event.target.value)} className="ml-2 rounded border p-2" /></label>
        <label className="block"><input type="checkbox" checked={replace} disabled={busy} onChange={event => setReplace(event.target.checked)} /> Explicitly replace an existing membership with a pending owner invitation. Its current access is removed until acceptance.</label>
        {replace ? <label className="block">Reviewed existing membership version<input type="number" min={1} step={1} value={memberVersion} disabled={busy} onChange={event => setMemberVersion(event.target.value)} className="ml-2 rounded border p-2" /></label> : null}
      </> : null}
      <label className="block">Owner decision / approval reference<input value={approval} minLength={12} maxLength={200} disabled={busy} onChange={event => setApproval(event.target.value)} className="ml-2 rounded border p-2" /></label>
      <GovernedActionButton key={`${organizationId}:${action}:${version}`} label="Record reviewed recovery" title="Confirm this explicit foundation recovery decision" requireCaseReference={false} disabled={disabled} onConfirm={({ reason }) => save(reason)} />
      {reviewRequired || summary.isError ? <button disabled={busy || summary.isFetching} onClick={async () => { const result = await summary.refetch(); if (!result.isError) setReviewRequired(false); }} className="ml-2 rounded border p-2">Reload and review organisation</button> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {link ? <div><label className="block">One-time owner invitation — not retained in replay or audit<input readOnly value={link} className="mt-1 w-full rounded border p-2" /></label><button onClick={() => setLink("")} className="mt-2 rounded border p-2">Hide credential</button></div> : null}
    </div>
  </OrgCard>;
}
