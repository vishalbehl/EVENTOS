"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Pause, Play, Plus, RefreshCw, Send, Trash2, Webhook } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiClient, apiGet } from "@/lib/api-client";
import { useLimitAccess, useOperationAccess } from "@/lib/capabilities";

const WEBHOOK_EVENTS = [
  "file.uploaded", "file.approved", "file.rejected", "speaker.created", "speaker.checked_in",
  "session.started", "session.completed", "import.completed", "import.failed", "device.offline",
];

type WebhookRecord = {
  id: string;
  event_id: string;
  url: string;
  description?: string | null;
  subscribed_events: string[];
  status: string;
  consecutive_failures: number;
  last_triggered_at?: string | null;
  last_success_at?: string | null;
  last_failure_reason?: string | null;
  total_deliveries: number;
  total_failures: number;
  created_at: string;
  version: number;
  secret?: string | null;
};

type IntegrationProvider = { id: string; name: string; description?: string | null };
type IntegrationConnection = { id: string; provider_id: string; provider_name: string; is_active: boolean; version: number };

function reasonLabel(value?: string | null) {
  return (value || "RESOLUTION_UNAVAILABLE").replaceAll("_", " ").toLowerCase();
}

export default function EventDeveloperPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const queryClient = useQueryClient();
  const webhookAccess = useOperationAccess("developer.webhooks.manage");
  const integrationAccess = useOperationAccess("integrations.manage");
  const integrationLimit = useLimitAccess("max_integrations");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [secret, setSecret] = useState("");
  const [events, setEvents] = useState<string[]>(["file.approved"]);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState("");

  const webhooks = useQuery({
    queryKey: ["event-webhooks", eventId],
    queryFn: () => apiGet<WebhookRecord[]>(`/events/${eventId}/webhooks`),
    enabled: Boolean(eventId) && webhookAccess.enabled,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const providers = useQuery({
    queryKey: ["integration-providers"],
    queryFn: () => apiGet<IntegrationProvider[]>("/developer/integration-providers"),
    enabled: integrationAccess.enabled,
    staleTime: 0,
  });
  const connections = useQuery({
    queryKey: ["integration-connections"],
    queryFn: () => apiGet<IntegrationConnection[]>("/developer/integration-connections"),
    enabled: integrationAccess.enabled,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["event-webhooks", eventId] });
  const create = useMutation({
    mutationFn: () => apiClient.post<WebhookRecord>(
      `/events/${eventId}/webhooks`,
      { url: url.trim(), description: description.trim() || null, subscribed_events: events, secret: secret || null },
      { headers: { "Idempotency-Key": crypto.randomUUID() } },
    ),
    onSuccess: record => {
      setRevealedSecret(record.secret || null);
      setUrl(""); setDescription(""); setSecret("");
      void refresh();
      toast.success("Webhook created. Save the secret now if one was supplied.");
    },
    onError: (error: any) => toast.error(error.message || "Webhook creation failed."),
  });
  const createConnection = useMutation({
    mutationFn: () => apiClient.post<IntegrationConnection>(
      "/developer/integration-connections",
      { provider_id: selectedProviderId },
      { headers: { "Idempotency-Key": crypto.randomUUID() } },
    ),
    onSuccess: () => {
      setSelectedProviderId("");
      void queryClient.invalidateQueries({ queryKey: ["integration-connections"] });
      toast.success("Integration connection activated.");
    },
    onError: (error: any) => toast.error(error.message || "Integration activation failed."),
  });

  const toggleConnection = async (connection: IntegrationConnection) => {
    try {
      await apiClient.patch(
        `/developer/integration-connections/${connection.id}`,
        { is_active: !connection.is_active },
        { headers: { "Idempotency-Key": crypto.randomUUID(), "If-Match": String(connection.version) } },
      );
      await queryClient.invalidateQueries({ queryKey: ["integration-connections"] });
      toast.success(connection.is_active ? "Integration connection deactivated." : "Integration connection reactivated.");
    } catch (error: any) {
      toast.error(error.message || "Integration update failed.");
    }
  };

  const mutate = async (record: WebhookRecord, action: "toggle" | "archive" | "test") => {
    if (!webhookAccess.enabled) return;
    const headers = { "Idempotency-Key": crypto.randomUUID(), "If-Match": String(record.version) };
    try {
      if (action === "toggle") {
        await apiClient.patch(`/events/${eventId}/webhooks/${record.id}`, { status: record.status === "active" ? "paused" : "active" }, { headers });
      } else if (action === "archive") {
        await apiClient.delete(`/events/${eventId}/webhooks/${record.id}`, { headers });
      } else {
        await apiClient.post(`/events/${eventId}/webhooks/${record.id}/test`, { event_type: record.subscribed_events[0] || "file.approved" }, { headers });
      }
      await refresh();
      toast.success(action === "test" ? "Test delivery completed." : "Webhook updated.");
    } catch (error: any) {
      toast.error(error.message || "Webhook operation failed.");
    }
  };

  if (!webhookAccess.loading && !webhookAccess.enabled) {
    return <div className="flex min-h-[360px] items-center justify-center rounded-3xl border border-amber-500/20 bg-amber-500/5 p-8 text-center text-sm text-amber-100">Webhook access is locked: {reasonLabel(webhookAccess.reason)}.</div>;
  }

  return (
    <main className="space-y-6 p-6">
      <header className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--pri)]">Developer controls</p><h1 className="mt-2 text-3xl font-black">Webhooks and integrations</h1><p className="mt-2 text-sm text-muted">Event-scoped endpoints use canonical entitlement, permission, version, and idempotency enforcement.</p></div>
        <Button variant="outline" onClick={() => void webhooks.refetch()} disabled={webhooks.isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${webhooks.isFetching ? "animate-spin" : ""}`} />Refresh</Button>
      </header>

      <Card className="border-white/10 bg-white/[0.025]"><CardContent className="space-y-5 p-6">
        <div><h2 className="font-bold">Register webhook</h2><p className="text-xs text-muted">The secret is hashed and only returned once.</p></div>
        <div className="grid gap-3 md:grid-cols-2"><Input value={url} onChange={event => setUrl(event.target.value)} placeholder="https://example.com/webhooks/eventos" /><Input value={description} onChange={event => setDescription(event.target.value)} placeholder="Description (optional)" /><Input value={secret} onChange={event => setSecret(event.target.value)} placeholder="Signing secret (optional)" type="password" /></div>
        <div className="flex flex-wrap gap-2">{WEBHOOK_EVENTS.map(item => <button key={item} type="button" onClick={() => setEvents(current => current.includes(item) ? current.filter(value => value !== item) : [...current, item])} className={`rounded-full border px-3 py-1.5 text-[11px] ${events.includes(item) ? "border-[var(--pri)] bg-[var(--pri)]/10 text-[var(--pri)]" : "border-white/10 text-muted"}`}>{item}</button>)}</div>
        <Button onClick={() => create.mutate()} disabled={create.isPending || !url.trim() || events.length === 0}><Plus className="mr-2 h-4 w-4" />Create webhook</Button>
        {revealedSecret ? <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4"><p className="text-sm font-semibold text-emerald-200">Copy this secret now</p><code className="mt-2 block overflow-x-auto text-xs text-emerald-100">{revealedSecret}</code><Button variant="outline" className="mt-3" onClick={() => { void navigator.clipboard.writeText(revealedSecret); toast.success("Secret copied."); }}>Copy secret</Button></div> : null}
      </CardContent></Card>

      {webhooks.isError ? <div className="flex items-center gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/5 p-5 text-sm text-rose-100"><AlertTriangle className="h-5 w-5" />Webhook records are unavailable; this is not an empty state.</div> : null}
      <section className="space-y-3">
        {(webhooks.data ?? []).map(record => <Card key={record.id} className="border-white/10 bg-white/[0.025]"><CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><div className="flex items-center gap-2"><Webhook className="h-4 w-4 text-[var(--pri)]" /><p className="truncate font-semibold">{record.url}</p><Badge variant="outline">{record.status}</Badge><Badge variant="outline">v{record.version}</Badge></div><p className="mt-2 text-xs text-muted">{record.subscribed_events.join(", ")}</p><p className="mt-1 text-[11px] text-muted">{record.total_deliveries} deliveries · {record.total_failures} failures{record.last_success_at ? ` · last success ${new Date(record.last_success_at).toLocaleString()}` : ""}</p>{record.last_failure_reason ? <p className="mt-2 text-xs text-rose-300">{record.last_failure_reason}</p> : null}</div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => void mutate(record, "test")}><Send className="mr-2 h-4 w-4" />Test</Button><Button variant="outline" size="sm" onClick={() => void mutate(record, "toggle")}>{record.status === "active" ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}{record.status === "active" ? "Pause" : "Resume"}</Button><Button variant="outline" size="sm" className="text-rose-300" onClick={() => void mutate(record, "archive")}><Trash2 className="mr-2 h-4 w-4" />Archive</Button></div></CardContent></Card>)}
        {!webhooks.isLoading && !webhooks.isError && (webhooks.data?.length ?? 0) === 0 ? <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-muted">No active webhook endpoints configured.</div> : null}
      </section>

      <Card className="border-white/10 bg-white/[0.025]"><CardContent className="space-y-5 p-6">
        <div className="flex items-center justify-between gap-4"><div><h2 className="font-bold">Third-party integration connections</h2><p className="mt-1 text-xs text-muted">Global provider definitions stay in Developer Console; this organization may activate only entitled providers within its integration limit.</p></div><Badge variant="outline">{integrationAccess.loading ? "CHECKING" : integrationAccess.enabled ? "ENTITLED" : "LOCKED"}</Badge></div>
        {!integrationAccess.loading && !integrationAccess.enabled ? <p className="text-xs text-amber-200">{reasonLabel(integrationAccess.reason)}</p> : null}
        {integrationAccess.enabled ? <>
          <div className="flex flex-col gap-3 sm:flex-row">
            <select value={selectedProviderId} onChange={event => setSelectedProviderId(event.target.value)} className="h-10 flex-1 rounded-xl border border-white/10 bg-[var(--surf)] px-3 text-sm">
              <option value="">Select a provider</option>
              {(providers.data ?? []).filter(provider => !(connections.data ?? []).some(connection => connection.provider_id === provider.id)).map(provider => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
            </select>
            <Button
              onClick={() => createConnection.mutate()}
              disabled={
                !selectedProviderId
                || createConnection.isPending
                || integrationLimit.loading
                || !integrationLimit.enabled
              }
              title={
                integrationLimit.enabled
                  ? undefined
                  : `Unavailable: ${(integrationLimit.reason || "RESOLUTION_UNAVAILABLE").replaceAll("_", " ").toLowerCase()}`
              }
            >
              <Plus className="mr-2 h-4 w-4" />Activate provider
            </Button>
          </div>
          {!integrationLimit.loading && !integrationLimit.enabled ? (
            <p className="text-xs text-amber-200">
              Integration capacity is unavailable: {reasonLabel(integrationLimit.reason)}.
            </p>
          ) : null}
          {(providers.isError || connections.isError) ? <p className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-xs text-rose-100">Integration records are unavailable; this is not an empty state.</p> : null}
          <div className="space-y-3">{(connections.data ?? []).map(connection => <div key={connection.id} className="flex items-center justify-between rounded-2xl border border-white/10 p-4"><div><p className="font-semibold">{connection.provider_name}</p><p className="mt-1 text-xs text-muted">{connection.is_active ? "Active" : "Inactive"} · version {connection.version}</p></div><Button variant="outline" size="sm" onClick={() => void toggleConnection(connection)}>{connection.is_active ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}{connection.is_active ? "Deactivate" : "Reactivate"}</Button></div>)}</div>
          {!connections.isLoading && !connections.isError && (connections.data?.length ?? 0) === 0 ? <p className="rounded-xl border border-dashed border-white/10 p-5 text-center text-xs text-muted">No integration connections configured.</p> : null}
        </> : null}
      </CardContent></Card>
    </main>
  );
}
