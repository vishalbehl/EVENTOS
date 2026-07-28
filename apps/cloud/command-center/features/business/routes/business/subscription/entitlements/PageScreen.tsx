"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CheckCircle2, Clock, Gauge, Layers, Plus, RefreshCw, ShieldAlert, Zap } from "lucide-react";
import { toast } from "sonner";
import {
  BillingStatusDialog,
  GrantCapacityDialog,
  GrantIssueDialog,
} from "@/components/billing/BillingLifecycleDialogs";
import { ActivationInspectionSheet, GrantConsumptionSheet } from "@/components/billing/ActivationInspectionSheet";
import { EmptyState } from "@/components/super-admin/ui/EmptyState";
import { TableSkeleton } from "@/components/super-admin/ui/LoadingSkeleton";
import { MetricRow } from "@/components/super-admin/ui/MetricRow";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { SupportAccessScope, type SupportAccessSelection } from "@/components/super-admin/ui/SupportAccessScope";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  type EntitlementGrant,
  type EventActivation,
  type OrgSubscription,
  useEventActivations,
  useEntitlementGrants,
  useGrantCapacityMutation,
  useGrantStatusMutation,
  useIssueGrant,
  useOrgSubscriptions,
  useSubscriptionStatusMutation,
} from "@/hooks/useBilling";

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "border-green-500/20 bg-green-500/10 text-green-400",
  TRIAL: "border-cyan-500/20 bg-cyan-500/10 text-cyan-400",
  PENDING: "border-yellow-500/20 bg-yellow-500/10 text-yellow-400",
  PENDING_PAYMENT: "border-yellow-500/20 bg-yellow-500/10 text-yellow-400",
  GRACE_PERIOD: "border-orange-500/20 bg-orange-500/10 text-orange-400",
  SUSPENDED: "border-orange-500/20 bg-orange-500/10 text-orange-400",
  EXPIRED: "border-red-500/20 bg-red-500/10 text-red-400",
  CANCELLED: "border-zinc-500/20 bg-zinc-500/10 text-zinc-400",
  ARCHIVED: "border-zinc-500/20 bg-zinc-500/10 text-zinc-400",
};

const SUBSCRIPTION_TRANSITIONS: Record<string, string[]> = {
  TRIAL: ["ACTIVE", "SUSPENDED", "CANCELLED", "EXPIRED"],
  ACTIVE: ["SUSPENDED", "GRACE_PERIOD", "CANCELLED", "EXPIRED"],
  SUSPENDED: ["ACTIVE", "CANCELLED", "EXPIRED"],
  PENDING_PAYMENT: ["ACTIVE", "CANCELLED", "EXPIRED"],
  GRACE_PERIOD: ["ACTIVE", "SUSPENDED", "CANCELLED", "EXPIRED"],
  EXPIRED: ["ACTIVE", "ARCHIVED"],
  CANCELLED: ["ARCHIVED"],
  ARCHIVED: [],
};

const GRANT_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["SUSPENDED", "EXPIRED", "CANCELLED"],
  SUSPENDED: ["ACTIVE", "EXPIRED", "CANCELLED"],
  EXPIRED: [],
  CANCELLED: [],
};

function fDate(value?: string) {
  if (!value) return "-";
  try { return format(new Date(value), "dd MMM yyyy"); } catch { return value; }
}

function StatusBadge({ status }: { status: string }) {
  return <Badge className={`border px-2 py-0.5 text-[9px] font-bold uppercase ${STATUS_COLORS[status] ?? STATUS_COLORS.CANCELLED}`}>{status.replaceAll("_", " ")}</Badge>;
}

function ProgressBar({ consumed, reserved, total }: { consumed?: number; reserved?: number; total?: number }) {
  if (total == null) return <span className="text-xs text-[var(--text-tertiary)]">Not quantity-based</span>;
  const allocated = (consumed ?? 0) + (reserved ?? 0);
  const pct = total > 0 ? Math.min(100, Math.round((allocated / total) * 100)) : 0;
  const color = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-yellow-500" : "bg-green-500";
  return <div className="flex min-w-32 items-center gap-2"><div className="h-1.5 flex-1 rounded-full bg-[var(--bg-surface-2)]"><div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} /></div><span className="whitespace-nowrap font-mono text-[10px] text-[var(--text-tertiary)]">{allocated}/{total}</span></div>;
}

export default function EntitlementsPage() {
  const [activeTab, setActiveTab] = useState("grants");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [supportScope, setSupportScope] = useState<SupportAccessSelection | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [subscriptionTarget, setSubscriptionTarget] = useState<OrgSubscription | null>(null);
  const [grantStatusTarget, setGrantStatusTarget] = useState<EntitlementGrant | null>(null);
  const [grantCapacityTarget, setGrantCapacityTarget] = useState<EntitlementGrant | null>(null);
  const [activationTarget, setActivationTarget] = useState<EventActivation | null>(null);
  const [consumptionGrantId, setConsumptionGrantId] = useState<string | null>(null);
  const scope = { organizationId: supportScope?.organizationId, supportReason: supportScope?.reason, accessRequestId: supportScope?.accessRequestId };
  const grantsQuery = useEntitlementGrants({ ...scope, status: activeTab === "grants" && statusFilter !== "ALL" ? statusFilter : undefined });
  const subscriptionsQuery = useOrgSubscriptions({ ...scope, status: activeTab === "subscriptions" && statusFilter !== "ALL" ? statusFilter : undefined });
  const activationsQuery = useEventActivations({ ...scope, status: activeTab === "activations" && statusFilter !== "ALL" ? statusFilter : undefined });
  const subscriptionMutation = useSubscriptionStatusMutation(scope);
  const issueMutation = useIssueGrant(scope);
  const grantStatusMutation = useGrantStatusMutation(scope);
  const grantCapacityMutation = useGrantCapacityMutation(scope);
  const grants = grantsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const subscriptions = subscriptionsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const activations = activationsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const activeQuery = activeTab === "grants" ? grantsQuery : activeTab === "subscriptions" ? subscriptionsQuery : activationsQuery;

  const execute = async (operation: () => Promise<unknown>, success: string, close: () => void) => {
    try { await operation(); toast.success(success); close(); } catch (error) { toast.error(error instanceof Error ? error.message : "Billing operation failed"); }
  };

  const metrics = [
    { label: "Subscriptions", value: subscriptions.length, icon: ShieldAlert },
    { label: "Total grants", value: grants.length, icon: Layers },
    { label: "Active grants", value: grants.filter((grant) => grant.status === "ACTIVE").length, icon: CheckCircle2 },
    { label: "Live activations", value: activations.filter((activation) => ["PENDING", "ACTIVE", "SUSPENDED", "EXPIRED", "TRANSFER_PENDING"].includes(activation.status)).length, icon: Zap },
  ];

  return (
    <PageContainer>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <SectionHeader title="Subscriptions and Entitlement Grants" description="Audited commercial ownership, issued rights, capacity, and continuity controls" />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={!supportScope || activeQuery.isLoading} onClick={() => void activeQuery.refetch()} className="gap-2"><RefreshCw className={`size-3.5 ${activeQuery.isLoading ? "animate-spin" : ""}`} />Refresh</Button>
          <Button size="sm" disabled={!supportScope} onClick={() => setIssueOpen(true)} className="gap-2"><Plus className="size-3.5" />Issue grant</Button>
        </div>
      </div>
      <SupportAccessScope value={supportScope} onApply={setSupportScope} />
      {supportScope ? <MetricRow metrics={metrics} /> : null}

      <Tabs value={activeTab} onValueChange={(value) => { setActiveTab(value); setStatusFilter("ALL"); }} className="mt-7">
        <TabsList><TabsTrigger value="grants">Entitlement grants</TabsTrigger><TabsTrigger value="activations">Event activations</TabsTrigger><TabsTrigger value="subscriptions">Organization subscriptions</TabsTrigger></TabsList>
        <div className="my-4 flex flex-wrap gap-2">
          {["ALL", "ACTIVE", "TRIAL", "PENDING", "PENDING_PAYMENT", "GRACE_PERIOD", "SUSPENDED", "EXPIRED", "DEACTIVATED", "TRANSFER_PENDING", "CANCELLED", "ARCHIVED"].filter((status) => activeTab === "subscriptions" ? !["PENDING", "DEACTIVATED", "TRANSFER_PENDING"].includes(status) : activeTab === "activations" ? !["TRIAL", "PENDING_PAYMENT", "GRACE_PERIOD", "ARCHIVED"].includes(status) : !["TRIAL", "PENDING_PAYMENT", "GRACE_PERIOD", "ARCHIVED", "DEACTIVATED", "TRANSFER_PENDING"].includes(status)).map((status) => (
            <button key={status} onClick={() => setStatusFilter(status)} className={`rounded-lg border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${statusFilter === status ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-[var(--primary-foreground)]" : "border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)]"}`}>{status.replaceAll("_", " ")}</button>
          ))}
        </div>

        <TabsContent value="grants">
          {!supportScope ? <EmptyState title="Select a support scope" description="Choose one organization and record the access reason before viewing commercial rights." className="py-16" /> : grantsQuery.isLoading ? <TableSkeleton rows={8} cols={8} /> : !grants.length ? <EmptyState title="No entitlement grants" description="No grants match the current tenant and status filter." className="py-16" /> : (
            <div className="overflow-hidden rounded-2xl border border-[var(--border-default)]"><div className="overflow-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b border-[var(--border-default)] bg-[var(--bg-surface-2)]">{["ID", "Grant", "Model", "Capacity", "Status", "Validity", "Version", "Actions"].map((header) => <th key={header} className="h-10 whitespace-nowrap px-4 text-[10px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">{header}</th>)}</tr></thead><tbody>{grants.map((grant) => (
              <tr key={grant.id} className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-surface-2)]">
                <td className="px-4 py-3 font-mono text-[10px] text-[var(--text-tertiary)]">{grant.id.slice(0, 8)}...</td>
                <td className="px-4 py-3"><strong className="text-[var(--text-primary)]">{grant.grant_type}</strong><div className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">{grant.scope_type} / {grant.unit_type}</div></td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">{grant.consumption_model}</td>
                <td className="px-4 py-3"><ProgressBar consumed={grant.quantity_consumed} reserved={grant.quantity_reserved} total={grant.quantity_total} /></td>
                <td className="px-4 py-3"><StatusBadge status={grant.status} /></td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">{fDate(grant.valid_until)}</td>
                <td className="px-4 py-3 font-mono text-[var(--text-tertiary)]">v{grant.version}</td>
                <td className="px-4 py-3"><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setConsumptionGrantId(grant.id)}>Ledger</Button>{grant.quantity_total != null ? <Button variant="outline" size="sm" onClick={() => setGrantCapacityTarget(grant)} className="gap-1"><Gauge className="size-3" />Capacity</Button> : null}{(GRANT_TRANSITIONS[grant.status] ?? []).length ? <Button variant="outline" size="sm" onClick={() => setGrantStatusTarget(grant)}>Status</Button> : null}</div></td>
              </tr>
            ))}</tbody></table></div></div>
          )}
        </TabsContent>

        <TabsContent value="activations">
          {!supportScope ? <EmptyState title="Select a support scope" description="Choose one organization before inspecting event license bindings." className="py-16" /> : activationsQuery.isLoading ? <TableSkeleton rows={8} cols={8} /> : !activations.length ? <EmptyState title="No event activations" description="No activation records match this tenant and status filter." className="py-16" /> : (
            <div className="overflow-hidden rounded-2xl border border-[var(--border-default)]"><div className="overflow-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b border-[var(--border-default)] bg-[var(--bg-surface-2)]">{["Activation", "Event", "Grant", "Consumption", "Status", "Policy", "Snapshot", "Actions"].map((header) => <th key={header} className="h-10 whitespace-nowrap px-4 text-[10px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">{header}</th>)}</tr></thead><tbody>{activations.map((activation) => (
              <tr key={activation.id} className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-surface-2)]">
                <td className="px-4 py-3 font-mono text-[10px] text-[var(--text-tertiary)]">{activation.id.slice(0, 8)}...</td>
                <td className="px-4 py-3 font-mono text-[10px] text-[var(--text-secondary)]">{activation.event_id.slice(0, 8)}...</td>
                <td className="px-4 py-3 font-mono text-[10px] text-[var(--text-secondary)]">{activation.grant_id ? `${activation.grant_id.slice(0, 8)}...` : "-"}</td>
                <td className="px-4 py-3 font-mono text-[10px] text-[var(--text-secondary)]">{activation.grant_consumption_id ? `${activation.grant_consumption_id.slice(0, 8)}...` : "Missing"}</td>
                <td className="px-4 py-3"><StatusBadge status={activation.status} /></td>
                <td className="px-4 py-3 text-[10px] text-[var(--text-secondary)]">{activation.activation_policy.replace("SNAPSHOT_", "")}</td>
                <td className="px-4 py-3">{activation.current_snapshot_set_id ? <Badge className="border-green-500/20 bg-green-500/10 text-green-400">Bound</Badge> : <Badge className="border-red-500/20 bg-red-500/10 text-red-400">Missing</Badge>}</td>
                <td className="px-4 py-3"><Button variant="outline" size="sm" onClick={() => setActivationTarget(activation)}>Inspect</Button></td>
              </tr>
            ))}</tbody></table></div></div>
          )}
        </TabsContent>

        <TabsContent value="subscriptions">
          {!supportScope ? <EmptyState title="Select a support scope" description="Choose one organization before viewing subscriptions." className="py-16" /> : subscriptionsQuery.isLoading ? <TableSkeleton rows={6} cols={7} /> : !subscriptions.length ? <EmptyState title="No subscriptions" description="No commercial subscriptions match this tenant and status filter." className="py-16" /> : (
            <div className="overflow-hidden rounded-2xl border border-[var(--border-default)]"><div className="overflow-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b border-[var(--border-default)] bg-[var(--bg-surface-2)]">{["Subscription", "Plan", "Status", "Period end", "Cancel at end", "Version", "Actions"].map((header) => <th key={header} className="h-10 whitespace-nowrap px-4 text-[10px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">{header}</th>)}</tr></thead><tbody>{subscriptions.map((subscription) => (
              <tr key={subscription.id} className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-surface-2)]">
                <td className="px-4 py-3 font-mono text-[10px] text-[var(--text-tertiary)]">{subscription.id.slice(0, 8)}...</td>
                <td className="px-4 py-3 font-mono text-[10px] text-[var(--text-secondary)]">{subscription.plan_id.slice(0, 8)}...</td>
                <td className="px-4 py-3"><StatusBadge status={subscription.status} /></td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">{fDate(subscription.current_period_end)}</td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">{subscription.cancel_at_period_end ? "Yes" : "No"}</td>
                <td className="px-4 py-3 font-mono text-[var(--text-tertiary)]">v{subscription.version}</td>
                <td className="px-4 py-3">{(SUBSCRIPTION_TRANSITIONS[subscription.status] ?? []).length ? <Button variant="outline" size="sm" onClick={() => setSubscriptionTarget(subscription)}>Change status</Button> : null}</td>
              </tr>
            ))}</tbody></table></div></div>
          )}
        </TabsContent>
      </Tabs>

      {activeQuery.hasNextPage ? <div className="mt-4 flex justify-center"><Button variant="outline" size="sm" disabled={activeQuery.isFetchingNextPage} onClick={() => void activeQuery.fetchNextPage()}>{activeQuery.isFetchingNextPage ? "Loading..." : "Load more"}</Button></div> : null}

      <GrantIssueDialog open={issueOpen} onOpenChange={setIssueOpen} pending={issueMutation.isPending} subscriptions={subscriptions.filter((item) => ["ACTIVE", "TRIAL"].includes(item.status))} onSubmit={(payload, idempotencyKey) => execute(() => issueMutation.mutateAsync({ payload, idempotencyKey }), "Entitlement grant issued", () => setIssueOpen(false))} />
      {subscriptionTarget ? <BillingStatusDialog open onOpenChange={(open) => !open && setSubscriptionTarget(null)} pending={subscriptionMutation.isPending} title="Change subscription status" description="This propagates commercial restrictions to grants and preserves existing activation snapshots for continuity. A matching change request must already have independent approval." currentVersion={subscriptionTarget.version} statusOptions={SUBSCRIPTION_TRANSITIONS[subscriptionTarget.status] ?? []} requiresApproval approvalHint={`Use billing.subscription.status with REPLACE and requested_value {"resource_id":"${subscriptionTarget.id}","version":${subscriptionTarget.version},"status":"<selected status>"}.`} onSubmit={(payload, idempotencyKey) => execute(() => subscriptionMutation.mutateAsync({ subscriptionId: subscriptionTarget.id, payload, idempotencyKey }), "Subscription status updated", () => setSubscriptionTarget(null))} /> : null}
      {grantStatusTarget ? <BillingStatusDialog open onOpenChange={(open) => !open && setGrantStatusTarget(null)} pending={grantStatusMutation.isPending} title="Change grant status" description="New consumption is blocked when restricted; existing event activations follow continuity status policy. A matching change request must already have independent approval." currentVersion={grantStatusTarget.version} statusOptions={GRANT_TRANSITIONS[grantStatusTarget.status] ?? []} requiresApproval approvalHint={`Use billing.entitlement_grant.status with REPLACE and requested_value {"resource_id":"${grantStatusTarget.id}","version":${grantStatusTarget.version},"status":"<selected status>"}.`} onSubmit={(payload, idempotencyKey) => execute(() => grantStatusMutation.mutateAsync({ grantId: grantStatusTarget.id, payload, idempotencyKey }), "Grant status updated", () => setGrantStatusTarget(null))} /> : null}
      {grantCapacityTarget ? <GrantCapacityDialog open onOpenChange={(open) => !open && setGrantCapacityTarget(null)} pending={grantCapacityMutation.isPending} version={grantCapacityTarget.version} currentQuantity={grantCapacityTarget.quantity_total} onSubmit={(payload, idempotencyKey) => execute(() => grantCapacityMutation.mutateAsync({ grantId: grantCapacityTarget.id, payload, idempotencyKey }), "Grant capacity updated", () => setGrantCapacityTarget(null))} /> : null}
      <ActivationInspectionSheet activationId={activationTarget?.id ?? null} onOpenChange={(open) => !open && setActivationTarget(null)} scope={scope} />
      <GrantConsumptionSheet grantId={consumptionGrantId} onOpenChange={(open) => !open && setConsumptionGrantId(null)} scope={scope} />
    </PageContainer>
  );
}
