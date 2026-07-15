"use client";

import { useState } from "react";
import { format } from "date-fns";
import { AlertTriangle, ArrowRightLeft, CheckCircle2, History, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDestructiveAction } from "@/components/super-admin/ui/ConfirmDestructiveAction";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOrgEvents } from "@/services/super-admin-service";
import {
  type BillingSupportParams,
  useActivationInspection,
  useDeactivateActivationMutation,
  useGrantConsumptions,
  useSnapshotRefreshMutation,
  useTransferActivationMutation,
} from "@/hooks/useBilling";

function compactId(value?: string) {
  return value ? `${value.slice(0, 8)}...${value.slice(-4)}` : "-";
}

function dateTime(value?: string) {
  return value ? format(new Date(value), "dd MMM yyyy, HH:mm") : "-";
}

function DataPair({ label, value, mono = false }: { label: string; value: string | number; mono?: boolean }) {
  return <div><dt className="text-[9px] font-bold uppercase tracking-widest text-white/40">{label}</dt><dd className={`mt-1 text-xs text-white/85 ${mono ? "font-mono" : ""}`}>{value}</dd></div>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-white/10 bg-white/[0.035] p-4"><h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">{title}</h3>{children}</section>;
}

export function ActivationInspectionSheet({
  activationId,
  onOpenChange,
  scope,
}: {
  activationId: string | null;
  onOpenChange: (open: boolean) => void;
  scope: BillingSupportParams;
}) {
  const inspection = useActivationInspection(activationId, scope);
  const refresh = useSnapshotRefreshMutation(scope);
  const deactivate = useDeactivateActivationMutation(scope);
  const transfer = useTransferActivationMutation(scope);
  const events = useOrgEvents(scope.organizationId ?? "");
  const [showRefresh, setShowRefresh] = useState(false);
  const [reason, setReason] = useState("");
  const [resolutionReason, setResolutionReason] = useState("SNAPSHOT_REFRESH");
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [targetEventId, setTargetEventId] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const data = inspection.data;

  const submitRefresh = async () => {
    if (!activationId || reason.trim().length < 12) return;
    try {
      await refresh.mutateAsync({
        activationId,
        payload: { reason: reason.trim(), resolution_reason: resolutionReason },
        idempotencyKey: crypto.randomUUID(),
      });
      toast.success("Snapshot refreshed and current pointer switched");
      setReason("");
      setShowRefresh(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Snapshot refresh failed");
    }
  };

  return (
    <Sheet open={!!activationId} onOpenChange={onOpenChange}>
      <SheetContent className="max-w-4xl bg-[#07090d]">
        <div className="border-b border-white/10 p-5 pr-14">
          <SheetHeader>
            <div className="mb-2 flex items-center gap-2"><ShieldCheck className="size-4 text-cyan-400" /><Badge className="border-cyan-400/20 bg-cyan-400/10 text-cyan-300">Snapshot-first</Badge></div>
            <SheetTitle>{data?.event_name ?? "Activation entitlement inspection"}</SheetTitle>
            <SheetDescription>Authoritative event license binding, immutable snapshot inputs, and current usage headroom.</SheetDescription>
          </SheetHeader>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-4 p-5">
            {inspection.isLoading ? <div className="py-20 text-center text-sm text-white/50">Loading activation evidence...</div> : null}
            {inspection.isError ? <div className="rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">{inspection.error instanceof Error ? inspection.error.message : "Unable to inspect activation"}</div> : null}
            {data?.denial_reason ? <div className="flex gap-3 rounded-xl border border-red-400/25 bg-red-400/10 p-4"><AlertTriangle className="mt-0.5 size-4 text-red-300" /><div><p className="text-xs font-bold text-red-200">Runtime access fails closed</p><p className="mt-1 text-xs text-red-200/70">{data.denial_reason}. Use the controlled recovery workflow; ordinary requests never recalculate plan data.</p></div></div> : null}

            {data ? <>
              <Panel title="Runtime binding">
                <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  <DataPair label="Activation" value={compactId(data.activation.id)} mono />
                  <DataPair label="Event" value={compactId(data.activation.event_id)} mono />
                  <DataPair label="Status" value={data.activation.status} />
                  <DataPair label="Policy" value={data.activation.activation_policy} />
                  <DataPair label="Plan" value={data.plan_name ?? compactId(data.plan_id)} />
                  <DataPair label="Grant" value={compactId(data.activation.grant_id)} mono />
                  <DataPair label="Consumption" value={compactId(data.activation.grant_consumption_id)} mono />
                  <DataPair label="Activated" value={dateTime(data.activation.activated_at)} />
                </dl>
              </Panel>

              <Panel title="Current snapshot">
                {data.current_snapshot ? <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                  <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    <DataPair label="Version" value={`v${data.current_snapshot.version}`} />
                    <DataPair label="Reason" value={data.current_snapshot.resolution_reason} />
                    <DataPair label="Resolver" value={data.current_snapshot.resolver_version} />
                    <DataPair label="Created" value={dateTime(data.current_snapshot.created_at)} />
                    <div className="col-span-2 md:col-span-4"><DataPair label="Canonical checksum" value={data.current_snapshot.checksum} mono /></div>
                  </dl>
                  {data.activation.activation_policy === "SNAPSHOT_REFRESHABLE" ? <Button variant="outline" size="sm" className="gap-2 self-start" onClick={() => setShowRefresh((value) => !value)}><RefreshCw className="size-3.5" />Refresh</Button> : null}
                </div> : <p className="text-xs text-red-300">No current snapshot is bound.</p>}
                {showRefresh ? <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-white/55">Resolution reason<select value={resolutionReason} onChange={(event) => setResolutionReason(event.target.value)} className="mt-1.5 h-9 w-full rounded-md border border-white/15 bg-black px-3 text-xs text-white"><option value="SNAPSHOT_REFRESH">Snapshot refresh</option><option value="PLATFORM_OVERRIDE">Platform override</option><option value="CONTRACT_AMENDMENT">Contract amendment</option><option value="RECOVERY_REBUILD">Recovery rebuild</option></select></label>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-white/55">Audit reason<Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Describe the approved entitlement change (minimum 12 characters)" className="mt-1.5 min-h-20" /></label>
                  <Button size="sm" disabled={reason.trim().length < 12 || refresh.isPending} onClick={() => void submitRefresh()}>{refresh.isPending ? "Refreshing..." : "Create snapshot vNext"}</Button>
                </div> : null}
              </Panel>

              <Panel title={`Limits and usage (${data.limits.length})`}>
                <div className="space-y-2">{data.limits.map((limit) => {
                  const total = limit.limit_value;
                  const percent = total == null || total <= 0 ? 0 : Math.min(100, Math.round((limit.usage_value / total) * 100));
                  return <div key={limit.limit_key} className="rounded-lg border border-white/8 bg-black/25 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-mono text-[11px] text-white/90">{limit.limit_key}</p><p className="mt-0.5 text-[9px] uppercase tracking-wider text-white/35">{limit.source_type} / {limit.usage_strategy}</p></div><div className="text-right"><p className="font-mono text-xs text-white">{limit.usage_value} / {total ?? "Unlimited"}</p><p className={`text-[10px] ${limit.denial_reason ? "text-red-300" : "text-white/40"}`}>{limit.denial_reason ?? `${limit.remaining_value ?? "Unlimited"} remaining`}</p></div></div>{total != null ? <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10"><div className={`h-full ${percent >= 100 ? "bg-red-400" : percent >= 80 ? "bg-amber-400" : "bg-cyan-400"}`} style={{ width: `${percent}%` }} /></div> : null}</div>;
                })}</div>
              </Panel>

              <Panel title={`Feature entitlements (${data.features.length})`}>
                {data.features.length ? <div className="grid gap-2 md:grid-cols-2">{data.features.map((feature) => <div key={feature.feature_key} className="flex items-start gap-2 rounded-lg border border-white/8 bg-black/25 p-3">{feature.enabled ? <CheckCircle2 className="mt-0.5 size-3.5 text-green-400" /> : <XCircle className="mt-0.5 size-3.5 text-red-400" />}<div><p className="font-mono text-[11px] text-white/90">{feature.feature_key}</p><p className="mt-1 text-[9px] uppercase tracking-wider text-white/35">{feature.source_type} / {feature.scope_type}</p>{feature.denial_reason ? <p className="mt-1 text-[10px] text-red-300">{feature.denial_reason}</p> : null}</div></div>)}</div> : <p className="text-xs text-white/45">No feature items are present in the current snapshot.</p>}
              </Panel>

              <Panel title="Consumption and transfer policy">
                <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  <DataPair label="Ledger status" value={data.consumption?.status ?? "Missing"} />
                  <DataPair label="Quantity" value={data.consumption?.quantity ?? 0} />
                  <DataPair label="Unit" value={data.consumption?.unit_type ?? "-"} />
                  <DataPair label="Transfer" value={data.transfer_eligibility?.action ?? "UNKNOWN"} />
                </dl>
                {data.activation.status === "ACTIVE" ? <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowTransfer((value) => !value)}><ArrowRightLeft className="size-3.5" />Transfer activation</Button>
                  <Button variant="destructive" size="sm" onClick={() => setConfirmDeactivate(true)}>Deactivate</Button>
                </div> : null}
                {showTransfer ? <div className="mt-4 space-y-3 rounded-lg border border-amber-400/20 bg-amber-400/[0.04] p-3">
                  <p className="text-[10px] leading-4 text-amber-100/75">Transfer eligibility is recalculated by UsageService. Meaningful usage locks the transfer; draft setup can require support review.</p>
                  <Select value={targetEventId} onValueChange={setTargetEventId}><SelectTrigger aria-label="Target event"><SelectValue placeholder="Select target event" /></SelectTrigger><SelectContent>{(events.data ?? []).filter((event) => event.id !== data.activation.event_id).map((event) => <SelectItem key={event.id} value={event.id}>{event.name} ({event.status})</SelectItem>)}</SelectContent></Select>
                  <Textarea value={transferReason} onChange={(event) => setTransferReason(event.target.value)} placeholder="Approved transfer reason (minimum 12 characters)" className="min-h-20" />
                  <Button size="sm" disabled={!targetEventId || transferReason.trim().length < 12 || transfer.isPending} onClick={async () => {
                    if (!activationId) return;
                    try {
                      const result = await transfer.mutateAsync({ activationId, targetEventId, reason: transferReason.trim(), idempotencyKey: crypto.randomUUID() });
                      toast.success(result.status === "REVIEW_REQUIRED" ? "Transfer moved to support review." : "Activation transferred with a new snapshot binding.");
                      setShowTransfer(false); setTargetEventId(""); setTransferReason("");
                    } catch (error) { toast.error(error instanceof Error ? error.message : "Activation transfer failed"); }
                  }}>{transfer.isPending ? "Transferring..." : "Evaluate and transfer"}</Button>
                </div> : null}
              </Panel>

              <Panel title="Snapshot history">
                <div className="space-y-2">{data.snapshot_history.map((snapshot) => <div key={snapshot.id} className="flex items-center gap-3 rounded-lg border border-white/8 bg-black/25 p-3"><History className="size-3.5 text-white/45" /><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-white">v{snapshot.version} - {snapshot.resolution_reason}</p><p className="truncate font-mono text-[9px] text-white/35">{snapshot.checksum}</p></div>{snapshot.is_current ? <Badge className="border-green-400/20 bg-green-400/10 text-green-300">Current</Badge> : null}<span className="text-[10px] text-white/35">{dateTime(snapshot.created_at)}</span></div>)}</div>
              </Panel>
            </> : null}
          </div>
        </ScrollArea>
        <SheetFooter><p className="text-[10px] text-white/35">Reads and refreshes are tenant-scoped, reason-captured, and audited.</p></SheetFooter>
      </SheetContent>
      <ConfirmDestructiveAction open={confirmDeactivate} onOpenChange={setConfirmDeactivate} title="Deactivate event license" description="The server will preserve consumed capacity when meaningful usage exists and release eligible unused capacity according to the grant model." confirmLabel="Deactivate activation" requireReason pending={deactivate.isPending} onConfirm={async (auditReason) => {
        if (!activationId || !auditReason) return;
        try { await deactivate.mutateAsync({ activationId, reason: auditReason, idempotencyKey: crypto.randomUUID() }); toast.success("Activation deactivated according to consumption policy."); setConfirmDeactivate(false); }
        catch (error) { toast.error(error instanceof Error ? error.message : "Activation deactivation failed"); }
      }} />
    </Sheet>
  );
}

export function GrantConsumptionSheet({
  grantId,
  onOpenChange,
  scope,
}: {
  grantId: string | null;
  onOpenChange: (open: boolean) => void;
  scope: BillingSupportParams;
}) {
  const consumptions = useGrantConsumptions(grantId, scope);
  const rows = consumptions.data?.pages.flatMap((page) => page.items) ?? [];
  return <Sheet open={!!grantId} onOpenChange={onOpenChange}><SheetContent className="max-w-2xl bg-[#07090d]"><div className="border-b border-white/10 p-5 pr-14"><SheetHeader><SheetTitle>Grant consumption ledger</SheetTitle><SheetDescription>Authoritative reservations and consumed commercial units for {compactId(grantId ?? undefined)}.</SheetDescription></SheetHeader></div><ScrollArea className="flex-1"><div className="space-y-3 p-5">{consumptions.isLoading ? <p className="py-16 text-center text-sm text-white/45">Loading ledger...</p> : null}{!consumptions.isLoading && !rows.length ? <p className="py-16 text-center text-sm text-white/45">No consumption rows exist for this grant.</p> : null}{rows.map((row) => <div key={row.id} className="rounded-xl border border-white/10 bg-white/[0.035] p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs text-white">{compactId(row.id)}</p><p className="mt-1 text-[10px] text-white/40">Event {compactId(row.event_id)}</p></div><Badge className="border-white/15 bg-white/5 text-white/70">{row.status}</Badge></div><dl className="mt-4 grid grid-cols-3 gap-3"><DataPair label="Quantity" value={row.quantity} /><DataPair label="Unit" value={row.unit_type} /><DataPair label="Consumed" value={dateTime(row.consumed_at)} /></dl></div>)}</div></ScrollArea>{consumptions.hasNextPage ? <SheetFooter><Button variant="outline" size="sm" disabled={consumptions.isFetchingNextPage} onClick={() => void consumptions.fetchNextPage()}>{consumptions.isFetchingNextPage ? "Loading..." : "Load more"}</Button></SheetFooter> : null}</SheetContent></Sheet>;
}
