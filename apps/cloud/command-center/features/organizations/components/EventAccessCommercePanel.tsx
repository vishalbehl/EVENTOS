"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useExecuteEventWorkspaceAction } from "@/features/organizations/api/organization-console-api";
import { OrgCard, OrgSectionTitle } from "./OrgPageShared";

type Item = Record<string, unknown>;

export function EventAccessCommercePanel({ orgId, eventId, workspace, data }: { orgId: string; eventId: string; workspace: string; data: Record<string, unknown> }) {
  const action = useExecuteEventWorkspaceAction(orgId, eventId, workspace);
  const [reason, setReason] = useState("");
  const [caseReference, setCaseReference] = useState("");
  const [participantId, setParticipantId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [userId, setUserId] = useState("");
  const [permissions, setPermissions] = useState("{}");
  const initialPricing = useMemo(() => ((data.items as Item[] | undefined) ?? []).map(item => ({ role: String(item.role_name ?? ""), tier: String(item.tier_name ?? ""), price: String(item.price ?? "0") })), [data.items]);
  const [pricing, setPricing] = useState(initialPricing);
  const validEnvelope = reason.trim().length >= 12 && caseReference.trim().length >= 2;

  const run = async (resourceId: string, actionName: "SET_PRICING" | "CHECK_IN" | "ASSIGN_USER", actionData: Record<string, unknown>) => {
    if (!validEnvelope) return;
    try {
      await action.mutateAsync({ resourceId, action: actionName, reason, case_reference: caseReference, data: actionData });
      toast.success("Administrative change completed");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Administrative change failed"); }
  };

  return <OrgCard className="border-[var(--brand-primary)]/20">
    <OrgSectionTitle>{workspace === "tickets" ? "Ticket pricing administration" : workspace === "checkins" ? "Attendee check-in administration" : "Event user assignment"}</OrgSectionTitle>
    <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">Uses the same validation service as the organizer portal. Every change requires an audit reason and case reference.</p>
    <div className="mt-3 grid gap-3 md:grid-cols-2"><input value={caseReference} onChange={event => setCaseReference(event.target.value)} placeholder="Case reference" className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-xs" /><input value={reason} onChange={event => setReason(event.target.value)} placeholder="Administrative reason (minimum 12 characters)" className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-xs" /></div>
    {workspace === "tickets" && <div className="mt-4 space-y-2">{pricing.map((row, index) => <div key={`${index}-${row.role}-${row.tier}`} className="grid gap-2 md:grid-cols-[1fr_1fr_160px_auto]"><input aria-label={`Role ${index + 1}`} value={row.role} onChange={event => setPricing(items => items.map((item, itemIndex) => itemIndex === index ? { ...item, role: event.target.value } : item))} placeholder="Role" className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-xs" /><input aria-label={`Tier ${index + 1}`} value={row.tier} onChange={event => setPricing(items => items.map((item, itemIndex) => itemIndex === index ? { ...item, tier: event.target.value } : item))} placeholder="Tier" className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-xs" /><input aria-label={`Price ${index + 1}`} type="number" min="0" step="0.01" value={row.price} onChange={event => setPricing(items => items.map((item, itemIndex) => itemIndex === index ? { ...item, price: event.target.value } : item))} className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-xs" /><button onClick={() => setPricing(items => items.filter((_, itemIndex) => itemIndex !== index))} className="rounded-lg border border-[var(--status-danger)] px-3 py-2 text-xs text-[var(--status-danger)]">Remove</button></div>)}<div className="flex gap-2"><button onClick={() => setPricing(items => [...items, { role: "", tier: "", price: "0" }])} className="rounded-lg border border-[var(--border-default)] px-3 py-2 text-xs font-bold">Add price</button><button disabled={!validEnvelope || action.isPending || pricing.some(row => !row.role.trim() || !row.tier.trim() || Number(row.price) < 0)} onClick={() => run(eventId, "SET_PRICING", { tiers: Array.from(new Set(pricing.map(row => row.tier))), pricing_data: Object.fromEntries(pricing.map(row => [`${row.role}_${row.tier}`, Number(row.price)])) })} className="rounded-lg bg-[var(--brand-primary)] px-3 py-2 text-xs font-bold text-[var(--primary-contrast)] disabled:opacity-40">Replace pricing matrix</button></div></div>}
    {workspace === "checkins" && <div className="mt-4 grid gap-2 md:grid-cols-[1fr_1fr_auto]"><input value={participantId} onChange={event => setParticipantId(event.target.value)} placeholder="Participant ID" className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-mono" /><input value={sessionId} onChange={event => setSessionId(event.target.value)} placeholder="Session ID" className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-mono" /><button disabled={!validEnvelope || !participantId || !sessionId || action.isPending} onClick={() => run(participantId, "CHECK_IN", { session_id: sessionId })} className="rounded-lg bg-[var(--brand-primary)] px-3 py-2 text-xs font-bold text-[var(--primary-contrast)] disabled:opacity-40">Check in</button></div>}
    {workspace === "users" && <div className="mt-4 grid gap-2 md:grid-cols-[1fr_1fr_auto]"><input value={userId} onChange={event => setUserId(event.target.value)} placeholder="Organization user ID" className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-mono" /><textarea value={permissions} onChange={event => setPermissions(event.target.value)} aria-label="Event permissions JSON" className="min-h-20 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-mono" /><button disabled={!validEnvelope || !userId || action.isPending} onClick={() => { try { void run(userId, "ASSIGN_USER", { permissions: JSON.parse(permissions) }); } catch { toast.error("Permissions must be valid JSON"); } }} className="rounded-lg bg-[var(--brand-primary)] px-3 py-2 text-xs font-bold text-[var(--primary-contrast)] disabled:opacity-40">Assign or update</button></div>}
  </OrgCard>;
}
