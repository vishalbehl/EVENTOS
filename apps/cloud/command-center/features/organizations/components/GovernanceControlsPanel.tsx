"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useGovernanceMutation } from "@/features/organizations/api/organization-console-api";
import { OrgCard, OrgDataTable, OrgSectionTitle, OrgStatusBadge } from "./OrgPageShared";

type Row = Record<string, any>;
const inputClass = "rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-xs";

export function GovernanceControlsPanel({ orgId, data }: { orgId: string; data: Row }) {
  const mutations = useGovernanceMutation(orgId);
  const [privacy, setPrivacy] = useState({ request_type: "ACCESS", subject_reference: "", due_at: "", assigned_to: "", reason: "", case_reference: "" });
  const [retention, setRetention] = useState({ data_category: "", retention_days: "365", disposition_action: "ANONYMIZE", reason: "" });
  const [hold, setHold] = useState({ name: "", scope: "{}", reason: "", ends_at: "" });
  const [releaseReason, setReleaseReason] = useState("");

  return <div className="grid gap-5 xl:grid-cols-2">
    <OrgCard>
      <OrgSectionTitle>Privacy requests</OrgSectionTitle>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <select className={inputClass} value={privacy.request_type} onChange={event => setPrivacy(value => ({ ...value, request_type: event.target.value }))}>{["ACCESS", "ERASURE", "RECTIFICATION", "PORTABILITY", "RESTRICTION", "OBJECTION"].map(value => <option key={value}>{value}</option>)}</select>
        <input className={inputClass} type="datetime-local" value={privacy.due_at} onChange={event => setPrivacy(value => ({ ...value, due_at: event.target.value }))} />
        <input className={inputClass} value={privacy.subject_reference} onChange={event => setPrivacy(value => ({ ...value, subject_reference: event.target.value }))} placeholder="Verified subject reference" />
        <input className={inputClass} value={privacy.assigned_to} onChange={event => setPrivacy(value => ({ ...value, assigned_to: event.target.value }))} placeholder="Assignee user ID (optional)" />
        <input className={inputClass} value={privacy.case_reference} onChange={event => setPrivacy(value => ({ ...value, case_reference: event.target.value }))} placeholder="Case reference" />
        <input className={inputClass} value={privacy.reason} onChange={event => setPrivacy(value => ({ ...value, reason: event.target.value }))} placeholder="Reason (minimum 12 characters)" />
      </div>
      <button disabled={!privacy.subject_reference || !privacy.due_at || privacy.reason.length < 12 || privacy.case_reference.length < 2} onClick={async () => { try { await mutations.createPrivacy.mutateAsync({ ...privacy, due_at: new Date(privacy.due_at).toISOString(), assigned_to: privacy.assigned_to || null }); toast.success("Privacy request recorded"); } catch (error) { toast.error(error instanceof Error ? error.message : "Privacy request failed"); } }} className="mt-3 rounded-xl bg-[var(--brand-primary)] px-4 py-2 text-xs font-bold text-[var(--primary-contrast)] disabled:opacity-40">Create request</button>
      <OrgDataTable<Row> columns={[{ key: "type", header: "Type", render: row => <span className="text-xs font-bold">{String(row.request_type)}</span> }, { key: "due", header: "Due", render: row => <span className="text-[10px]">{new Date(String(row.due_at)).toLocaleString()}</span> }, { key: "status", header: "Status", render: row => <OrgStatusBadge status={String(row.status)} /> }]} rows={data.privacy_requests ?? []} keyFn={row => String(row.id)} emptyMessage="No privacy requests" />
    </OrgCard>

    <OrgCard>
      <OrgSectionTitle>Retention policy</OrgSectionTitle>
      <div className="mt-3 grid gap-2 md:grid-cols-2"><input className={inputClass} value={retention.data_category} onChange={event => setRetention(value => ({ ...value, data_category: event.target.value }))} placeholder="Data category" /><input className={inputClass} type="number" min="1" value={retention.retention_days} onChange={event => setRetention(value => ({ ...value, retention_days: event.target.value }))} /><select className={inputClass} value={retention.disposition_action} onChange={event => setRetention(value => ({ ...value, disposition_action: event.target.value }))}>{["ANONYMIZE", "ARCHIVE", "DELETE"].map(value => <option key={value}>{value}</option>)}</select><input className={inputClass} value={retention.reason} onChange={event => setRetention(value => ({ ...value, reason: event.target.value }))} placeholder="Reason (minimum 12 characters)" /></div>
      <button disabled={!retention.data_category || retention.reason.length < 12} onClick={async () => { try { await mutations.upsertRetention.mutateAsync({ ...retention, retention_days: Number(retention.retention_days), is_enabled: true }); toast.success("Retention policy saved"); } catch (error) { toast.error(error instanceof Error ? error.message : "Retention update failed"); } }} className="mt-3 rounded-xl bg-[var(--brand-primary)] px-4 py-2 text-xs font-bold text-[var(--primary-contrast)] disabled:opacity-40">Create policy</button>
      <OrgDataTable<Row> columns={[{ key: "category", header: "Category", render: row => <span className="text-xs font-bold">{String(row.data_category)}</span> }, { key: "days", header: "Days", render: row => String(row.retention_days) }, { key: "action", header: "Disposition", render: row => <OrgStatusBadge status={String(row.disposition_action)} /> }]} rows={data.retention_policies ?? []} keyFn={row => String(row.id)} emptyMessage="No retention policies" />
    </OrgCard>

    <OrgCard className="xl:col-span-2">
      <OrgSectionTitle>Legal holds</OrgSectionTitle>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4"><input className={inputClass} value={hold.name} onChange={event => setHold(value => ({ ...value, name: event.target.value }))} placeholder="Hold name" /><textarea className={inputClass} value={hold.scope} onChange={event => setHold(value => ({ ...value, scope: event.target.value }))} aria-label="Legal hold scope JSON" /><input className={inputClass} type="datetime-local" value={hold.ends_at} onChange={event => setHold(value => ({ ...value, ends_at: event.target.value }))} /><input className={inputClass} value={hold.reason} onChange={event => setHold(value => ({ ...value, reason: event.target.value }))} placeholder="Legal reason (minimum 12 characters)" /></div>
      <button disabled={!hold.name || hold.reason.length < 12} onClick={async () => { try { await mutations.createHold.mutateAsync({ name: hold.name, scope: JSON.parse(hold.scope), reason: hold.reason, ends_at: hold.ends_at ? new Date(hold.ends_at).toISOString() : null }); toast.success("Legal hold activated"); } catch (error) { toast.error(error instanceof Error ? error.message : "Legal hold request failed"); } }} className="mt-3 rounded-xl bg-[var(--status-danger)] px-4 py-2 text-xs font-bold text-white disabled:opacity-40">Create legal hold</button>
      <input className={`${inputClass} mt-3 w-full`} value={releaseReason} onChange={event => setReleaseReason(event.target.value)} placeholder="Release justification (minimum 12 characters)" />
      <OrgDataTable<Row> columns={[{ key: "name", header: "Hold", render: row => <span className="text-xs font-bold">{String(row.name)}</span> }, { key: "status", header: "Status", render: row => <OrgStatusBadge status={String(row.status)} /> }, { key: "action", header: "Action", render: row => row.status === "ACTIVE" ? <button disabled={releaseReason.trim().length < 12} onClick={async () => { try { await mutations.releaseHold.mutateAsync({ id: String(row.id), reason: releaseReason }); toast.success("Legal hold released"); setReleaseReason(""); } catch (error) { toast.error(error instanceof Error ? error.message : "Release failed"); } }} className="text-xs font-bold text-[var(--status-danger)] disabled:opacity-40">Release</button> : null }]} rows={data.legal_holds ?? []} keyFn={row => String(row.id)} emptyMessage="No legal holds" />
    </OrgCard>
  </div>;
}
