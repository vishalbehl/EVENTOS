"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, Mail, MessageCircle, RefreshCw, Send, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiGet, apiPost } from "@/lib/api-client";
import { useEventCapabilities, useFeatureAccess, useOperationAccess } from "@/lib/capabilities";

type EmailAnalytics = {
  total_campaigns: number;
  total_recipients: number;
  total_sent: number;
  failed_count: number;
  opened_count: number;
  success_rate: number;
  open_rate: number;
};

type ProviderChannel = "SMS" | "WHATSAPP" | "PUSH";
type ProviderStatus = {
  channels: Record<ProviderChannel, {
    configured: boolean;
    provider: string | null;
    state: string;
    verified_at: string | null;
    available: boolean;
  }>;
  freshness_at: string;
};
type DeliveryBatch = {
  id: string;
  channel: ProviderChannel;
  provider: string;
  status: string;
  requested_count: number;
  accepted_count: number;
  failed_count: number;
  created_at: string;
};

const EMPTY_ANALYTICS: EmailAnalytics = {
  total_campaigns: 0,
  total_recipients: 0,
  total_sent: 0,
  failed_count: 0,
  opened_count: 0,
  success_rate: 0,
  open_rate: 0,
};

export default function NotificationChannelsPage() {
  const params = useParams<{ eventId: string }>();
  const eventId = String(params.eventId);
  const { data, isLoading: capabilityLoading } = useEventCapabilities();
  const email = useFeatureAccess("FEAT_EMAIL_NOTIFICATIONS");
  const push = useFeatureAccess("FEAT_PUSH_NOTIFICATIONS");
  const sms = useFeatureAccess("FEAT_SMS");
  const whatsapp = useFeatureAccess("FEAT_WHATSAPP");
  const emailRead = useOperationAccess("communications.email.read");
  const pushSend = useOperationAccess("communications.push.send");
  const smsSend = useOperationAccess("communications.sms.send");
  const whatsappSend = useOperationAccess("communications.whatsapp.send");
  const [analytics, setAnalytics] = useState<EmailAnalytics | null>(null);
  const [analyticsError, setAnalyticsError] = useState(false);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [providerError, setProviderError] = useState(false);
  const [batches, setBatches] = useState<DeliveryBatch[]>([]);
  const [sendChannel, setSendChannel] = useState<ProviderChannel>("SMS");
  const [recipients, setRecipients] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("");
  const [caseReference, setCaseReference] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!email.enabled || !emailRead.enabled) {
      setAnalytics(null);
      setAnalyticsError(false);
      return;
    }
    setLoading(true);
    setAnalyticsError(false);
    try {
      const [speakers, participants] = await Promise.all([
        apiGet<EmailAnalytics>(`/events/${eventId}/notifications/analytics?target_type=speaker`),
        apiGet<EmailAnalytics>(`/events/${eventId}/notifications/analytics?target_type=participant`),
      ]);
      setAnalytics({
        total_campaigns: speakers.total_campaigns + participants.total_campaigns,
        total_recipients: speakers.total_recipients + participants.total_recipients,
        total_sent: speakers.total_sent + participants.total_sent,
        failed_count: speakers.failed_count + participants.failed_count,
        opened_count: speakers.opened_count + participants.opened_count,
        success_rate:
          speakers.total_recipients + participants.total_recipients > 0
            ? Math.round(((speakers.total_sent + participants.total_sent) / (speakers.total_recipients + participants.total_recipients)) * 1000) / 10
            : 0,
        open_rate:
          speakers.total_sent + participants.total_sent > 0
            ? Math.round(((speakers.opened_count + participants.opened_count) / (speakers.total_sent + participants.total_sent)) * 1000) / 10
            : 0,
      });
    } catch {
      setAnalytics(null);
      setAnalyticsError(true);
    } finally {
      setLoading(false);
    }
  };

  const loadProviders = async () => {
    setProviderError(false);
    try {
      const status = await apiGet<ProviderStatus>(`/events/${eventId}/notifications/provider-status`);
      setProviderStatus(status);
      const histories = await Promise.all(
        (["SMS", "WHATSAPP", "PUSH"] as ProviderChannel[]).map(async channel => {
          const operation = channel === "SMS" ? smsSend : channel === "WHATSAPP" ? whatsappSend : pushSend;
          if (!operation.enabled) return [];
          const page = await apiGet<{ items: DeliveryBatch[] }>(`/events/${eventId}/notifications/channels/${channel}/deliveries?limit=10`);
          return page.items;
        }),
      );
      setBatches(histories.flat().sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 20));
    } catch {
      setProviderStatus(null);
      setBatches([]);
      setProviderError(true);
    }
  };

  useEffect(() => {
    if (!email.loading && !emailRead.loading) void load();
  }, [eventId, email.enabled, emailRead.enabled]);

  useEffect(() => {
    if (!pushSend.loading && !smsSend.loading && !whatsappSend.loading) void loadProviders();
  }, [eventId, pushSend.enabled, smsSend.enabled, whatsappSend.enabled]);

  const queueDelivery = async () => {
    const values = recipients.split(/[\n,]/).map(value => value.trim()).filter(Boolean);
    if (!values.length || !message.trim() || reason.trim().length < 5) return;
    setSending(true);
    try {
      await apiPost(`/events/${eventId}/notifications/channels/${sendChannel}/deliveries`, {
        recipients: values,
        title: sendChannel === "PUSH" ? title.trim() || undefined : undefined,
        body: message.trim(),
        data: {},
        reason: reason.trim(),
        case_reference: caseReference.trim() || undefined,
      }, { headers: { "Idempotency-Key": crypto.randomUUID() } });
      setRecipients("");
      setTitle("");
      setMessage("");
      setReason("");
      setCaseReference("");
      toast.success(`${sendChannel} delivery queued`);
      await loadProviders();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `${sendChannel} delivery could not be queued`);
    } finally {
      setSending(false);
    }
  };

  const channels = [
    { key: "email", label: "Email", icon: Mail, access: email, limit: "max_emails_per_event", operational: true },
    { key: "PUSH", label: "Push", icon: Smartphone, access: push, operation: pushSend, limit: "max_push_per_event" },
    { key: "SMS", label: "SMS", icon: MessageCircle, access: sms, operation: smsSend, limit: "max_sms_per_event" },
    { key: "WHATSAPP", label: "WhatsApp", icon: MessageCircle, access: whatsapp, operation: whatsappSend, limit: "max_whatsapp_per_event" },
  ] as const;
  const figures = analytics ?? EMPTY_ANALYTICS;

  return (
    <main className="space-y-6 p-4 sm:p-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Communication control</p>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--text)]">Notification channels</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted">
            Contract access, current usage, and production availability are resolved from Command Center. No sample delivery records are shown.
          </p>
        </div>
        <Button onClick={() => void Promise.all([load(), loadProviders()])} disabled={loading} variant="outline">
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-busy={capabilityLoading}>
        {channels.map(channel => {
          const limit = channel.limit ? data?.limits[channel.limit] : undefined;
          const enabled = channel.access.enabled;
          const provider = channel.key === "email" ? null : providerStatus?.channels[channel.key];
          const operational = channel.key === "email" ? true : Boolean(provider?.available && channel.operation.enabled);
          return (
            <Card key={channel.key} className="p-5">
              <div className="flex items-center justify-between">
                <channel.icon className="h-5 w-5 text-[var(--pri)]" />
                {enabled ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : <AlertTriangle className="h-5 w-5 text-amber-400" />}
              </div>
              <h2 className="mt-4 font-semibold text-[var(--text)]">{channel.label}</h2>
              <p className="mt-1 text-xs uppercase tracking-wide text-muted">
                {enabled ? "Entitled" : (channel.access.reason ?? "RESOLUTION_UNAVAILABLE").replaceAll("_", " ")}
              </p>
              {limit ? (
                <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div><dt className="text-muted">Used</dt><dd className="mt-1 font-semibold">{limit.used}</dd></div>
                  <div><dt className="text-muted">Remaining</dt><dd className="mt-1 font-semibold">{limit.remaining ?? "Unlimited"}</dd></div>
                </dl>
              ) : null}
              {enabled && !operational ? (
                <p className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200">
                  {provider?.configured
                    ? `${provider.provider ?? "Provider"} is ${provider.state.toLowerCase()}. Command Center verification is required before delivery.`
                    : "Entitled, but no organization provider is configured. Command Center must connect and verify one before delivery."}
                </p>
              ) : null}
            </Card>
          );
        })}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Provider delivery</p>
              <h2 className="mt-1 text-lg font-semibold">Queue a governed message</h2>
              <p className="mt-1 text-sm text-muted">Every recipient is reserved against the event limit before the provider accepts the batch.</p>
            </div>
            <Send className="h-5 w-5 text-[var(--pri)]" />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-muted">Channel
              <select value={sendChannel} onChange={event => setSendChannel(event.target.value as ProviderChannel)} className="mt-1 w-full rounded-lg border border-default bg-surface px-3 py-2 text-sm text-[var(--text)]">
                {(["SMS", "WHATSAPP", "PUSH"] as ProviderChannel[]).map(channel => <option key={channel}>{channel}</option>)}
              </select>
            </label>
            {sendChannel === "PUSH" ? <label className="text-xs font-medium text-muted">Push title
              <input value={title} onChange={event => setTitle(event.target.value)} maxLength={255} className="mt-1 w-full rounded-lg border border-default bg-surface px-3 py-2 text-sm text-[var(--text)]" />
            </label> : <div />}
            <label className="text-xs font-medium text-muted sm:col-span-2">Recipients
              <textarea value={recipients} onChange={event => setRecipients(event.target.value)} rows={4} placeholder={sendChannel === "PUSH" ? "One Expo push token per line" : "One E.164 phone number per line"} className="mt-1 w-full rounded-lg border border-default bg-surface px-3 py-2 font-mono text-sm text-[var(--text)]" />
            </label>
            <label className="text-xs font-medium text-muted sm:col-span-2">Message
              <textarea value={message} onChange={event => setMessage(event.target.value)} rows={5} maxLength={4096} className="mt-1 w-full rounded-lg border border-default bg-surface px-3 py-2 text-sm text-[var(--text)]" />
            </label>
            <label className="text-xs font-medium text-muted">Operational reason
              <input value={reason} onChange={event => setReason(event.target.value)} className="mt-1 w-full rounded-lg border border-default bg-surface px-3 py-2 text-sm text-[var(--text)]" />
            </label>
            <label className="text-xs font-medium text-muted">Case reference
              <input value={caseReference} onChange={event => setCaseReference(event.target.value)} className="mt-1 w-full rounded-lg border border-default bg-surface px-3 py-2 text-sm text-[var(--text)]" />
            </label>
          </div>
          {(() => {
            const operation = sendChannel === "SMS" ? smsSend : sendChannel === "WHATSAPP" ? whatsappSend : pushSend;
            const ready = Boolean(providerStatus?.channels[sendChannel]?.available && operation.enabled);
            return <Button onClick={() => void queueDelivery()} disabled={!ready || sending || !recipients.trim() || !message.trim() || reason.trim().length < 5} className="mt-4">
              <Send className="mr-2 h-4 w-4" />{sending ? "Queuing…" : `Queue ${sendChannel}`}
            </Button>;
          })()}
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Recent provider batches</p>
          <div className="mt-4 space-y-3">
            {batches.map(batch => <div key={batch.id} className="rounded-lg border border-default p-3">
              <div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold">{batch.channel} · {batch.provider}</span><span className="text-xs text-muted">{batch.status}</span></div>
              <p className="mt-2 text-xs text-muted">{batch.accepted_count} accepted · {batch.failed_count} failed · {batch.requested_count} requested</p>
              <p className="mt-1 font-mono text-[10px] text-muted">{new Date(batch.created_at).toLocaleString()}</p>
            </div>)}
            {!batches.length && !providerError ? <p className="rounded-lg border border-dashed border-default p-5 text-center text-sm text-muted">No provider batches have been queued.</p> : null}
            {providerError ? <p className="rounded-lg border border-rose-500/25 bg-rose-500/5 p-4 text-sm text-rose-200">Provider status and delivery history are unavailable. This is not a zero-data state.</p> : null}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Campaigns", figures.total_campaigns],
          ["Recipients", figures.total_recipients],
          ["Sent", figures.total_sent],
          ["Failed", figures.failed_count],
        ].map(([label, value]) => (
          <Card key={label} className="p-5"><p className="text-xs uppercase tracking-wide text-muted">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></Card>
        ))}
      </section>

      {analyticsError ? (
        <Card className="border-rose-500/25 bg-rose-500/5 p-5 text-sm text-rose-200">
          Email analytics are unavailable. This is an API failure state, not a zero-data state.
        </Card>
      ) : null}
    </main>
  );
}
