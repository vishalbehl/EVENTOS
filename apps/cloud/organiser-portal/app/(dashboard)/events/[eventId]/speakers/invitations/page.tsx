"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle, Clock, Copy, Mail, RefreshCw, Send, UserCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/api-client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSpeakers, type SpeakerSummary } from "@/hooks/useSpeakers";
import { useEvent } from "@/hooks/useEvents";
import { Button } from "@/components/ui/button";
import { OrganiserPage, Panel, StatusBadge } from "@/components/organizer/workspace/OrganiserPrimitives";
import { TablePagination } from "@/components/organizer/common/TablePagination";
import { useTablePagination } from "@/hooks/useTablePagination";

type Grant = { id: string; audience: string; email: string; resource_id?: string | null; status: string; version: number; expires_at: string; created_at: string };
type IssuedGrant = Grant & { access_token: string };

export default function SpeakerInvitationsPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const queryClient = useQueryClient();
  const { data: event } = useEvent(eventId);
  const { data: speakers = [], isLoading: speakersLoading } = useSpeakers(eventId);
  const grantsQuery = useQuery({ queryKey: ["programme-speaker-grants", eventId], queryFn: () => apiGet<Grant[]>(`/events/${eventId}/programme/access-grants?audience=SPEAKER`), enabled: !!eventId });
  const [selectedSpeakerId, setSelectedSpeakerId] = useState("");
  const [issuedLink, setIssuedLink] = useState<IssuedGrant | null>(null);
  const [busy, setBusy] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const speakerById = useMemo(() => new Map((speakers as SpeakerSummary[]).map((speaker) => [speaker.id, speaker])), [speakers]);
  const grants = grantsQuery.data || [];
  const {
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    paginatedItems: paginatedGrants,
  } = useTablePagination(grants, 10);
  const active = grants.filter((grant) => grant.status === "ACTIVE" && new Date(grant.expires_at) > new Date()).length;
  const expired = grants.length - active;

  const issue = async () => {
    const speaker = speakerById.get(selectedSpeakerId);
    if (!speaker) return;
    setBusy(true);
    try {
      const grant = await apiPost<IssuedGrant>(`/events/${eventId}/programme/speaker-invitations/${speaker.id}`, {}, { headers: { "Idempotency-Key": crypto.randomUUID() } } as any);
      setIssuedLink(grant);
      await queryClient.invalidateQueries({ queryKey: ["programme-speaker-grants", eventId] });
      toast.success(`Programme invitation prepared for ${speaker.first_name} ${speaker.last_name}.`);
    } catch (error: any) { toast.error(error?.message || "The invitation could not be prepared."); }
    finally { setBusy(false); }
  };

  const copyLink = async () => {
    if (!issuedLink) return;
    await navigator.clipboard.writeText(`${window.location.origin.replace(":3001", ":3003")}/programme/${issuedLink.access_token}`);
    toast.success("Speaker access link copied.");
  };

  const revoke = async (grantId: string) => {
    setRevokingId(grantId);
    try {
      const grant = grants.find((item) => item.id === grantId);
      if (!grant) return;
      await apiPost(`/events/${eventId}/programme/access-grants/${grantId}/revoke`, {}, { headers: { "If-Match": String(grant.version) } } as any);
      await queryClient.invalidateQueries({ queryKey: ["programme-speaker-grants", eventId] });
      toast.success("Speaker access link revoked.");
    } catch (error: any) {
      toast.error(error?.message || "The speaker access link could not be revoked.");
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <OrganiserPage title="Speaker programme invitations" description={event ? `Issue secure programme access for ${event.name}.` : "Manage secure speaker programme access."} actions={<Button size="sm" onClick={() => void issue()} disabled={!selectedSpeakerId || busy}><Send className="mr-1.5 size-3.5" />{busy ? "Preparing…" : "Send invitation"}</Button>}>
      <div className="grid gap-3 sm:grid-cols-4"><Metric label="Issued" value={grants.length} icon={<Mail className="size-4" />} /><Metric label="Active links" value={active} icon={<UserCheck className="size-4" />} /><Metric label="Expired / revoked" value={expired} icon={<Clock className="size-4" />} /><Metric label="Speaker roster" value={speakers.length} icon={<CheckCircle className="size-4" />} /></div>
      <Panel title="Create a secure speaker invitation" className="p-5"><div className="flex flex-col gap-3 md:flex-row md:items-end"><label className="flex-1 text-xs font-semibold text-[var(--text-secondary)]">Speaker<select value={selectedSpeakerId} onChange={(event) => setSelectedSpeakerId(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-3 text-sm text-[var(--text-primary)]"><option value="">Choose a speaker…</option>{(speakers as SpeakerSummary[]).map((speaker) => <option key={speaker.id} value={speaker.id}>{speaker.first_name} {speaker.last_name} · {speaker.email}</option>)}</select></label><Button onClick={() => void issue()} disabled={!selectedSpeakerId || busy} className="h-10"><Send className="mr-2 size-4" />Issue access link</Button></div>{issuedLink ? <div className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950"><p className="text-xs font-bold uppercase tracking-[.14em]">Link ready for controlled delivery</p><p className="mt-1 text-sm">The raw token is shown once. Copy it into the approved speaker invitation template.</p><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" onClick={() => void copyLink()}><Copy className="mr-1.5 size-3.5" />Copy speaker link</Button><span className="inline-flex items-center rounded-lg bg-white px-3 text-xs font-mono">expires {new Date(issuedLink.expires_at).toLocaleDateString()}</span></div></div> : null}</Panel>
      <Panel title="Invitation history" className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[var(--border-default)] bg-[var(--surface-subtle)]">
              <tr>
                <th className="px-5 py-3 font-bold">Speaker</th>
                <th className="px-5 py-3 font-bold">Email</th>
                <th className="px-5 py-3 font-bold">State</th>
                <th className="px-5 py-3 font-bold">Expires</th>
                <th className="px-5 py-3 font-bold">Access</th>
                <th className="px-5 py-3 font-bold">Action</th>
              </tr>
            </thead>
            <tbody>
              {paginatedGrants.map((grant) => {
                const speaker = grant.resource_id ? speakerById.get(grant.resource_id) : undefined;
                const usable = grant.status === "ACTIVE" && new Date(grant.expires_at) > new Date();
                return (
                  <tr key={grant.id} className="border-b border-[var(--border-subtle)] last:border-0">
                    <td className="px-5 py-3 font-semibold">{speaker ? `${speaker.first_name} ${speaker.last_name}` : "Speaker record unavailable"}</td>
                    <td className="px-5 py-3 text-[var(--text-secondary)]">{grant.email}</td>
                    <td className="px-5 py-3"><StatusBadge status={usable ? "approved" : "pending"} /></td>
                    <td className="px-5 py-3 text-[var(--text-secondary)]">{new Date(grant.expires_at).toLocaleString()}</td>
                    <td className="px-5 py-3">{usable ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle className="size-3.5" /> Usable</span> : <span className="inline-flex items-center gap-1 text-rose-700"><XCircle className="size-3.5" /> Unavailable</span>}</td>
                    <td className="px-5 py-3">{usable ? <Button size="sm" variant="outline" disabled={revokingId === grant.id} onClick={() => void revoke(grant.id)}>{revokingId === grant.id ? "Revoking…" : "Revoke"}</Button> : <span className="text-[var(--text-tertiary)]">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!grants.length && !grantsQuery.isLoading ? <div className="p-8 text-center text-sm text-[var(--text-secondary)]">No programme invitations have been issued.</div> : null}
        </div>
        <TablePagination
          currentPage={currentPage}
          totalItems={grants.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          itemLabel="invitations"
        />
      </Panel>
      {speakersLoading || grantsQuery.isLoading ? <p className="inline-flex items-center gap-2 text-xs text-[var(--text-secondary)]"><RefreshCw className="size-3.5 animate-spin" /> Loading current speaker state…</p> : null}
    </OrganiserPage>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) { return <div className="rounded-xl border border-[var(--border-default)] bg-[var(--card)] p-4"><div className="flex items-center justify-between text-[var(--text-tertiary)]"><span className="text-[10px] font-bold uppercase tracking-[.14em]">{label}</span>{icon}</div><p className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{value}</p></div>; }
