"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import { platformKey } from "@/lib/query-keys";
import {
  CircleDollarSign,
  Plus,
  Check,
  X,
  Layers,
  Wallet,
  Percent,
  HardDrive,
  RefreshCw,
} from "lucide-react";
import {
  useOrganizationDomain,
  useOrganizationEvents,
  useAllocateExtraUsage,
  useUpdateEntitlementOverride,
  useApplyDiscount,
  useAdjustCreditWallet,
  useResolvedEntitlements,
  useEntitlementOverrideRequests,
  useDecideEntitlementOverride,
  useRequestEntitlementOverrideRevocation,
  useDecideEntitlementOverrideRevocation,
  useOrganizationUsage,
  useFinancialAdjustments,
  useDecideFinancialAdjustment,
  useCommercialAccessRequests,
  useDecideCommercialAccessRequest,
} from "@/features/organizations/api/organization-console-api";
import { toast } from "sonner";
import { useOrgConsole } from "@/features/organizations/context/OrgConsoleContext";
import { GovernedActionButton } from "@/features/organizations/components/GovernedActionButton";
import {
  OrgPageHeader,
  OrgCard,
  OrgTabBar,
  OrgDataTable,
  OrgStatusBadge,
  OrgSectionTitle,
  OrgMetricCard,
  UnavailableDomain,
  LoadingPage,
} from "@/features/organizations/components/OrgPageShared";

function EntitlementMatrixCell({ orgId, eventId, featureKey }: { orgId: string; eventId: string; featureKey: string }) {
  const resolved = useResolvedEntitlements(orgId, eventId);
  const requestOverride = useUpdateEntitlementOverride(orgId);
  if (resolved.isLoading) return <span className="text-[10px] text-[var(--text-tertiary)]">Loading…</span>;
  if (resolved.isError || !resolved.data) return <span className="text-[10px] font-bold text-[var(--status-danger)]">Unavailable</span>;
  const capability = resolved.data.capabilities?.[featureKey];
  if (!capability) return <span className="text-[10px] text-[var(--text-tertiary)]">Not configured</span>;
  const canRequestCommercialChange = capability.enabled || capability.reason_code === "NOT_ENTITLED";
  const status = capability.enabled ? "ENABLED" : capability.reason_code ?? "RESTRICTED";
  return <div className="flex flex-col items-center gap-1" title={capability.availability_note ?? undefined}><OrgStatusBadge status={status} /><span className="text-[9px] text-[var(--text-tertiary)]">{capability.backend_mode.replaceAll("_", " ")} {capability.sources.length} source{capability.sources.length === 1 ? "" : "s"}</span>{canRequestCommercialChange ? <GovernedActionButton label={`Request ${capability.enabled ? "restriction" : "unlock"}`} title={`Request ${capability.enabled ? "restriction" : "unlock"} for ${featureKey}`} className="text-[9px] font-bold text-[var(--brand-primary)]" onConfirm={({ reason, caseReference }) => requestOverride.mutateAsync({ event_id: eventId, entitlement_key: featureKey, operation: capability.enabled ? "RESTRICT" : "UNLOCK", requested_value: !capability.enabled, reason, case_reference: caseReference }).then(() => undefined)} /> : null}</div>;
}

export default function CommercialPageScreen() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;
  const { summary } = useOrgConsole();

  const [activeTab, setActiveTab] = useState("subscriptions");

  const { data: domainRes, isLoading } = useOrganizationDomain(
    orgId,
    "billing",
  );
  const { data: events = [] } = useOrganizationEvents(orgId);

  const allocateUsage = useAllocateExtraUsage(orgId);
  const updateEntitlement = useUpdateEntitlementOverride(orgId);
  const applyDiscount = useApplyDiscount(orgId);
  const adjustWallet = useAdjustCreditWallet(orgId);
  const overrideRequests = useEntitlementOverrideRequests(orgId);
  const decideOverride = useDecideEntitlementOverride(orgId);
  const requestOverrideRevocation = useRequestEntitlementOverrideRevocation(orgId);
  const decideOverrideRevocation = useDecideEntitlementOverrideRevocation(orgId);
  const usageQuery = useOrganizationUsage(orgId);
  const financialAdjustments = useFinancialAdjustments(orgId);
  const decideFinancialAdjustment = useDecideFinancialAdjustment(orgId);
  const commercialAccessRequests = useCommercialAccessRequests(orgId);
  const decideCommercialAccess = useDecideCommercialAccessRequest(orgId);
  const catalogue = useQuery({
    queryKey: platformKey("capability-coverage"),
    queryFn: () => apiGet<{ features: Record<string, { scope: string; value_type: string }> }>("/platform/capabilities/coverage"),
  });

  // Modal / Input States
  const [showAllocateModal, setShowAllocateModal] = useState(false);
  const [allocForm, setAllocForm] = useState({
    resource_type: "storage" as any,
    quantity: 100,
    reason: "Extra allocation top-up via Command Center",
    case_reference: "",
  });

  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discForm, setDiscForm] = useState({
    discount_type: "PERCENTAGE" as any,
    value: 10,
    reason: "Promotional commercial override",
  });

  const [showWalletModal, setShowWalletModal] = useState(false);
  const [walletForm, setWalletForm] = useState({
    amount: 500,
    type: "CREDIT" as any,
    reason: "Customer satisfaction credit allocation",
  });

  const [editingQuotaKey, setEditingQuotaKey] = useState<string | null>(null);
  const [editingQuotaValue, setEditingQuotaValue] = useState<string>("");

  if (isLoading) return <LoadingPage />;

  const domainData = domainRes?.data as any;
  const subscriptions: any[] = domainData?.subscriptions ?? [];
  const invoiceAgg = domainData?.invoices ?? { count: 0, total: 0 };
  const invoices: any[] = invoiceAgg.items ?? [];
  const approvedAdjustments = (financialAdjustments.data?.items ?? []).filter((item) => item.status === "APPROVED");
  const walletBalance = approvedAdjustments.reduce((total, item) => total + (item.adjustment_type === "CREDIT" ? Number(item.amount) : item.adjustment_type === "DEBIT" ? -Number(item.amount) : 0), 0);
  const activeSub =
    subscriptions.find((s) => s.status === "active") ?? subscriptions[0];

  const usageItems = usageQuery.data?.items ?? [];

  const tabs = [
    { key: "subscriptions", label: "Subscriptions" },
    { key: "requests", label: "Access Requests" },
    { key: "matrix", label: "Feature Matrix" },
    { key: "entitlements", label: "Entitlements Engine" },
    { key: "usage", label: "Usage & Top-ups" },
    { key: "discounts", label: "Discounts & Wallet" },
    { key: "invoices", label: "Invoice Center" },
  ];

  const handleAllocateUsageSubmit = async () => {
    try {
      await allocateUsage.mutateAsync(allocForm);
      toast.success(`Top-up request created; independent approval is required`);
      setShowAllocateModal(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to allocate extra usage");
    }
  };

  const handleApplyDiscountSubmit = async () => {
    try {
      await applyDiscount.mutateAsync(discForm);
      toast.success(
        "Discount request created; independent approval is required",
      );
      setShowDiscountModal(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to apply discount");
    }
  };

  const handleWalletSubmit = async () => {
    try {
      await adjustWallet.mutateAsync(walletForm);
      toast.success(
        "Credit adjustment requested; independent approval is required",
      );
      setShowWalletModal(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to adjust credit wallet");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <OrgPageHeader
        icon={CircleDollarSign}
        title="Commercial Workspace"
        description="Comprehensive commercial management, per-event subscriptions, feature matrix, entitlements & billing."
        generatedAt={domainRes?.generated_at}
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => setShowAllocateModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--brand-primary)] text-[var(--primary-contrast)] text-xs font-bold hover:bg-[var(--brand-primary-hover)] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Top-up Usage
            </button>
          </div>
        }
      />

      {summary?.organization.is_internal_unrestricted ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-[var(--text-primary)]">
          <strong>Internal unrestricted tenant.</strong> Every capability resolves from the internal baseline, not from a plan or event contract, and all metered allowances are unlimited. Tenant feature restrictions and commercial limits apply only to other organizations. This status is read-only.
        </div>
      ) : null}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <OrgMetricCard
          label="Active Subscription"
          value={activeSub?.status ? activeSub.status.toUpperCase() : "Unavailable"}
        />
        <OrgMetricCard label="Active Events" value={events.length} />
        <OrgMetricCard label="Total Invoices" value={invoiceAgg.count ?? 0} />
        <OrgMetricCard
          label="Credit Wallet Balance"
          value={financialAdjustments.isError ? "Unavailable" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(walletBalance)}
          sub="Approved credit ledger"
        />
      </div>

      <OrgTabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {/* ── Subscriptions Tab ──────────────────────────────── */}
      {activeTab === "subscriptions" && (
        <div className="space-y-6">
          <OrgCard>
            <OrgSectionTitle>Organization Master Subscription</OrgSectionTitle>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                  Plan
                </p>
                <p className="text-sm font-bold text-[var(--text-primary)]">
                  {activeSub?.plan_id || "Unavailable"}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                  Status
                </p>
                <OrgStatusBadge status={activeSub?.status || "ACTIVE"} />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                  Period End
                </p>
                <p className="text-xs font-mono text-[var(--text-secondary)]">
                  {activeSub?.current_period_end
                    ? new Date(
                      activeSub.current_period_end,
                    ).toLocaleDateString()
                    : "Unavailable"}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                  Auto-renew
                </p>
                <p className="text-xs font-bold text-[var(--status-success)]">
                  {activeSub?.auto_renew === undefined ? "Unavailable" : activeSub.auto_renew ? "Enabled" : "Disabled"}
                </p>
              </div>
            </div>
          </OrgCard>

          <OrgCard>
            <OrgSectionTitle>
              Per-Event Subscription Hierarchy ({events.length} Events)
            </OrgSectionTitle>
            <OrgDataTable
              columns={[
                {
                  key: "name",
                  header: "Event Name",
                  render: (ev: any) => (
                    <div>
                      <p className="text-xs font-bold text-[var(--text-primary)]">
                        {ev.name || ev.id}
                      </p>
                      <p className="text-[10px] font-mono text-[var(--text-tertiary)]">
                        {ev.slug || ev.id}
                      </p>
                    </div>
                  ),
                },
                {
                  key: "plan",
                  header: "Assigned Event Plan",
                  render: (ev: any) => (
                    <span className="text-xs font-bold text-[var(--brand-primary)]">
                      {ev.plan_name || "Contract not linked"}
                    </span>
                  ),
                },
                {
                  key: "status",
                  header: "Status",
                  render: (ev: any) => (
                    <OrgStatusBadge status={ev.status || "NOT_MEASURED"} />
                  ),
                },
                {
                  key: "regs",
                  header: "Registrations",
                  render: (ev: any) => (
                    <span className="text-xs font-mono text-[var(--text-secondary)]">
                      {ev.registrations_count ?? "Not measured"}
                    </span>
                  ),
                },
                {
                  key: "financial_source",
                  header: "Financial records",
                  render: (ev: any) => (
                    <span className="text-xs text-[var(--text-tertiary)]">
                      Event Payments / Revenue Console
                    </span>
                  ),
                },
              ]}
              rows={events}
              keyFn={(ev: any) => ev.id}
              emptyMessage="No event subscriptions created"
            />
          </OrgCard>
        </div>
      )}

      {/* ── Feature Matrix Tab ──────────────────────────────── */}
      {activeTab === "requests" && (
        <OrgCard>
          <OrgSectionTitle>Organizer Plan & Add-on Requests</OrgSectionTitle>
          {commercialAccessRequests.isError ? (
            <UnavailableDomain reason="The commercial request ledger could not be loaded. No empty-data fallback was used." />
          ) : (
            <OrgDataTable
              columns={[
                { key: "created_at", header: "Requested", render: (item: any) => <span className="text-xs font-mono">{new Date(item.created_at).toLocaleString()}</span> },
                { key: "plan", header: "Plan & Add-ons", render: (item: any) => <div><p className="text-xs font-bold">{item.requested_plan_name || item.requested_plan_id} <span className="font-mono text-[10px] text-[var(--text-tertiary)]">v{item.requested_plan_version ?? "?"}</span></p><p className="mt-1 text-[10px] text-[var(--text-tertiary)]">{item.requested_addon_keys?.length ? item.requested_addon_keys.join(", ") : "No add-ons"}</p></div> },
                { key: "quote", header: "Quoted", render: (item: any) => <span className="text-xs font-bold">{item.quoted_amount == null ? "Unavailable" : new Intl.NumberFormat("en-IN", { style: "currency", currency: item.currency || "INR" }).format(Number(item.quoted_amount))}</span> },
                { key: "status", header: "Status", render: (item: any) => <OrgStatusBadge status={item.status} /> },
                { key: "reason", header: "Reason", render: (item: any) => <p className="max-w-64 text-xs text-[var(--text-secondary)]">{item.reason}</p> },
                { key: "actions", header: "Decision", render: (item: any) => item.status === "PENDING" ? <div className="flex gap-2"><GovernedActionButton label="Approve" title={`Approve ${item.requested_plan_name || "commercial access"}`} className="text-xs font-bold text-[var(--status-success)]" onConfirm={({ reason, caseReference }) => decideCommercialAccess.mutateAsync({ id: item.id, version: item.version, decision: "APPROVED", reason, case_reference: caseReference }).then(() => { toast.success("Commercial access applied"); })} /><GovernedActionButton label="Reject" title="Reject commercial access request" className="text-xs font-bold text-[var(--status-danger)]" onConfirm={({ reason, caseReference }) => decideCommercialAccess.mutateAsync({ id: item.id, version: item.version, decision: "REJECTED", reason, case_reference: caseReference }).then(() => { toast.success("Commercial request rejected"); })} /></div> : <span className="text-[10px] text-[var(--text-tertiary)]">{item.decision_reason || "Decision recorded"}</span> },
              ]}
              rows={commercialAccessRequests.data?.items ?? []}
              keyFn={(item: any) => item.id}
              isLoading={commercialAccessRequests.isLoading}
              emptyMessage="No commercial access requests"
            />
          )}
        </OrgCard>
      )}

      {activeTab === "matrix" && (
        <OrgCard>
          <div className="flex items-center justify-between mb-4">
            <div>
              <OrgSectionTitle>
                Inter-Event Feature Entitlement Matrix
              </OrgSectionTitle>
              <p className="text-xs text-[var(--text-tertiary)]">
                Canonical resolved access by event. Changes enter the independent approval queue.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto border border-[var(--border-default)] rounded-xl">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[var(--bg-surface-3)] border-b border-[var(--border-default)] text-[10px] font-black uppercase text-[var(--text-tertiary)]">
                  <th className="px-4 py-3 text-left min-w-[180px]">
                    Feature Module
                  </th>
                  {events.map((ev: any) => (
                    <th
                      key={ev.id}
                      className="px-4 py-3 text-center min-w-[120px]"
                    >
                      {ev.name || ev.slug}
                    </th>
                  ))}
                  {events.length === 0 && (
                    <th className="px-4 py-3 text-center">Global Default</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {Object.keys(catalogue.data?.features ?? {}).map((key) => ({ key, label: key.replace(/^FEAT_/, "").replaceAll("_", " ") })).map((feat) => (
                  <tr
                    key={feat.key}
                    className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-surface-3)]/30"
                  >
                    <td className="px-4 py-3 font-bold text-[var(--text-primary)]">
                      {feat.label}
                    </td>
                    {events.map((ev: any) => <td key={ev.id} className="px-4 py-3 text-center"><EntitlementMatrixCell orgId={orgId} eventId={ev.id} featureKey={feat.key} /></td>)}
                    {events.length === 0 && (
                      <td className="px-4 py-3 text-center">
                        <span className="px-2 py-1 rounded text-[var(--text-tertiary)] text-[10px] font-bold">
                          NO EVENTS
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </OrgCard>
      )}

      {/* ── Entitlements Engine Tab ─────────────────────────── */}
      {activeTab === "entitlements" && (
        <OrgCard>
          <OrgSectionTitle>
            Commercial Quota & Entitlement Overrides
          </OrgSectionTitle>
          <p className="text-xs text-[var(--text-tertiary)] mb-4">
            Changes are requests. A different super admin must approve them
            before enforcement changes.
          </p>
          {overrideRequests.isError ? (
            <UnavailableDomain reason="Approval queue could not be loaded. No approval state is inferred." />
          ) : (
            <div className="space-y-3">
              {(overrideRequests.data?.items ?? []).map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-xs font-bold text-[var(--text-primary)]">
                      {item.entitlement_key} · {item.operation}
                    </p>
                    <p className="text-[10px] text-[var(--text-tertiary)]">
                      {item.case_reference} · requested value{" "}
                      {String(item.requested_value)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <OrgStatusBadge status={item.status} />
                    {item.status === "PENDING" && (
                      <>
                        <GovernedActionButton
                          label="Approve"
                          title="Approve entitlement override"
                          requireCaseReference={false}
                          className="px-2 py-1 text-xs font-bold text-[var(--status-success)]"
                          onConfirm={async ({ reason }) => {
                            await decideOverride.mutateAsync({ id: item.id, version: item.version, decision: "APPROVED", reason });
                          }}
                        />
                        <GovernedActionButton
                          label="Reject"
                          title="Reject entitlement override"
                          requireCaseReference={false}
                          className="px-2 py-1 text-xs font-bold text-[var(--status-danger)]"
                          onConfirm={async ({ reason }) => {
                            await decideOverride.mutateAsync({ id: item.id, version: item.version, decision: "REJECTED", reason });
                          }}
                        />
                      </>
                    )}
                    {item.status === "APPROVED" && item.revocation_status !== "PENDING" && (
                      <GovernedActionButton
                        label="Request revoke"
                        title="Request entitlement override revocation"
                        className="px-2 py-1 text-xs font-bold text-[var(--status-danger)]"
                        onConfirm={async ({ reason, caseReference }) => {
                          await requestOverrideRevocation.mutateAsync({ id: item.id, version: item.version, reason, case_reference: caseReference });
                        }}
                      />
                    )}
                    {item.status === "APPROVED" && item.revocation_status === "PENDING" && (
                      <>
                        <GovernedActionButton
                          label="Approve revoke"
                          title="Approve entitlement override revocation"
                          requireCaseReference={false}
                          className="px-2 py-1 text-xs font-bold text-[var(--status-danger)]"
                          onConfirm={async ({ reason }) => {
                            await decideOverrideRevocation.mutateAsync({ id: item.id, version: item.version, decision: "APPROVED", reason });
                          }}
                        />
                        <GovernedActionButton
                          label="Reject revoke"
                          title="Reject entitlement override revocation"
                          requireCaseReference={false}
                          className="px-2 py-1 text-xs font-bold text-[var(--text-tertiary)]"
                          onConfirm={async ({ reason }) => {
                            await decideOverrideRevocation.mutateAsync({ id: item.id, version: item.version, decision: "REJECTED", reason });
                          }}
                        />
                      </>
                    )}
                  </div>
                </div>
              ))}
              {!overrideRequests.isLoading &&
                !overrideRequests.data?.items.length && (
                  <p className="text-xs text-[var(--text-tertiary)]">
                    No entitlement override requests have been recorded.
                  </p>
                )}
              <button
                onClick={() => {
                  setEditingQuotaKey("registrations");
                  setEditingQuotaValue("0");
                }}
                className="px-3 py-1.5 rounded-lg border border-[var(--border-default)] text-xs font-bold text-[var(--brand-primary)]"
              >
                Request entitlement override
              </button>
            </div>
          )}
        </OrgCard>
      )}

      {/* ── Usage & Top-ups Tab ─────────────────────────────── */}
      {activeTab === "usage" && (
        <div className="space-y-6">
          <OrgCard>
            <OrgSectionTitle>Live Consumption vs Quotas</OrgSectionTitle>
            {usageQuery.isError ? (
              <UnavailableDomain reason="Usage ledger is unavailable. Zero usage is not assumed." />
            ) : (
              <div className="space-y-3 mt-2">
                {usageItems.map((item) => (
                  <div
                    key={`${item.metric_key}-${item.unit}`}
                    className="flex justify-between rounded-xl border border-[var(--border-subtle)] p-3 text-xs"
                  >
                    <span className="font-bold text-[var(--text-primary)]">
                      {item.metric_key}
                    </span>
                    <span className="font-mono text-[var(--text-secondary)]">
                      {item.quantity.toLocaleString()} {item.unit} ·{" "}
                      {item.freshness_at
                        ? new Date(item.freshness_at).toLocaleString()
                        : "freshness unknown"}
                    </span>
                  </div>
                ))}
                {!usageQuery.isLoading && !usageItems.length && (
                  <p className="text-xs text-[var(--text-tertiary)]">
                    No metered usage has been recorded in the ledger.
                  </p>
                )}
              </div>
            )}
          </OrgCard>

          <OrgCard>
            <OrgSectionTitle>Extra Usage Request Presets</OrgSectionTitle>
            <p className="mt-1 text-xs text-[var(--text-tertiary)]">Presets open a governed request. Allocation begins only after an independent approval.</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
              {[
                { label: "+100 GB Storage", type: "storage", qty: 100 },
                { label: "+10,000 Emails", type: "emails", qty: 10000 },
                { label: "+1,000 SMS", type: "sms", qty: 1000 },
                { label: "+100,000 API Calls", type: "api_calls", qty: 100000 },
              ].map((btn) => (
                <button
                  key={btn.label}
                  onClick={() => {
                    setAllocForm(current => ({ ...current, resource_type: btn.type as any, quantity: btn.qty }));
                    setShowAllocateModal(true);
                  }}
                  className="p-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] hover:bg-[var(--bg-surface-hover)] text-xs font-bold text-[var(--text-primary)] text-center transition-all"
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </OrgCard>
        </div>
      )}

      {/* ── Discounts & Wallet Tab ──────────────────────────── */}
      {activeTab === "discounts" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <OrgCard>
            <div className="flex items-center justify-between mb-4">
              <OrgSectionTitle>Discount Manager</OrgSectionTitle>
              <button
                onClick={() => setShowDiscountModal(true)}
                className="flex items-center gap-1 text-xs font-bold text-[var(--brand-primary)] hover:underline"
              >
                <Percent className="w-3.5 h-3.5" />
                Apply Discount
              </button>
            </div>
            <p className="text-xs text-[var(--text-tertiary)] mb-4">
              Financial changes remain pending until a different super admin
              approves them.
            </p>
            {financialAdjustments.isError ? (
              <UnavailableDomain reason="Financial adjustment ledger is unavailable." />
            ) : (
              <div className="space-y-2">
                {(financialAdjustments.data?.items ?? []).map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-xs font-bold text-[var(--text-primary)]">
                        {item.adjustment_type} · {item.currency}{" "}
                        {Number(item.amount).toLocaleString()}
                      </p>
                      <p className="text-[10px] text-[var(--text-tertiary)]">
                        {item.case_reference} · {item.reason}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <OrgStatusBadge status={item.status} />
                      {item.status === "PENDING" && (
                        <>
                          <GovernedActionButton
                            label="Approve"
                            title="Approve financial adjustment"
                            requireCaseReference={false}
                            className="text-[10px] font-bold text-[var(--status-success)]"
                            onConfirm={async ({ reason }) => {
                              await decideFinancialAdjustment.mutateAsync({ id: item.id, version: item.version, decision: "APPROVED", reason });
                            }}
                          />
                          <GovernedActionButton
                            label="Reject"
                            title="Reject financial adjustment"
                            requireCaseReference={false}
                            className="text-[10px] font-bold text-[var(--status-danger)]"
                            onConfirm={async ({ reason }) => {
                              await decideFinancialAdjustment.mutateAsync({ id: item.id, version: item.version, decision: "REJECTED", reason });
                            }}
                          />
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {!financialAdjustments.isLoading &&
                  !financialAdjustments.data?.items.length && (
                    <p className="text-xs text-[var(--text-tertiary)]">
                      No financial adjustments have been requested.
                    </p>
                  )}
              </div>
            )}
          </OrgCard>

          <OrgCard>
            <div className="flex items-center justify-between mb-4">
              <OrgSectionTitle>Credit Wallet Balance</OrgSectionTitle>
              <button
                onClick={() => setShowWalletModal(true)}
                className="flex items-center gap-1 text-xs font-bold text-[var(--brand-primary)] hover:underline"
              >
                <Wallet className="w-3.5 h-3.5" />
                Adjust Balance
              </button>
            </div>
            <div className="text-3xl font-black text-[var(--text-primary)] font-mono mb-2">{financialAdjustments.isLoading ? "Loading…" : new Intl.NumberFormat("en-IN", { style: "currency", currency: approvedAdjustments[0]?.currency || "INR" }).format(walletBalance)}</div>
            <p className="text-xs text-[var(--text-tertiary)]">
              Derived from approved credit and debit adjustments in the financial ledger.
            </p>
          </OrgCard>
        </div>
      )}

      {/* ── Invoice Center Tab ──────────────────────────────── */}
      {activeTab === "invoices" && (
        <OrgCard>
          <div className="mb-4"><OrgSectionTitle>Invoice & Billing Records</OrgSectionTitle></div>
          <p className="text-xs text-[var(--text-tertiary)] mb-4">
            Total Invoices: {invoiceAgg.count} | Billed Total: $
            {invoiceAgg.total}
          </p>
          <OrgDataTable columns={[
            { key: "invoice", header: "Invoice", render: (row: any) => <div><p className="text-xs font-bold">{row.invoice_number || row.id}</p><p className="text-[10px] text-[var(--text-tertiary)]">{row.items?.length ?? 0} line items</p></div> },
            { key: "event", header: "Event", render: (row: any) => <span className="font-mono text-[10px]">{row.event_id || "Organization"}</span> },
            { key: "total", header: "Total", render: (row: any) => <span className="text-xs font-bold">{new Intl.NumberFormat("en-IN", { style: "currency", currency: row.currency || "INR" }).format(Number(row.total_amount_inr || row.amount || 0))}</span> },
            { key: "status", header: "Status", render: (row: any) => <OrgStatusBadge status={row.status} /> },
            { key: "issued", header: "Issued", render: (row: any) => <span className="text-[10px]">{row.issued_at ? new Date(row.issued_at).toLocaleDateString() : "—"}</span> },
          ]} rows={invoices} keyFn={(row: any) => row.id} emptyMessage="No invoice records found" />
        </OrgCard>
      )}

      {/* Modals */}
      {showAllocateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-sm font-black text-[var(--text-primary)] uppercase tracking-wider mb-4">
              Request Extra Usage
            </h3>
            <div className="space-y-3 mb-4">
              <select
                value={allocForm.resource_type}
                onChange={(e) =>
                  setAllocForm((f) => ({
                    ...f,
                    resource_type: e.target.value as any,
                  }))
                }
                className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs text-[var(--text-primary)]"
              >
                <option value="storage">Storage (GB)</option>
                <option value="emails">Emails</option>
                <option value="sms">SMS</option>
                <option value="api_calls">API Calls</option>
                <option value="registrations">Registrations</option>
              </select>
              <input
                type="number"
                value={allocForm.quantity}
                onChange={(e) =>
                  setAllocForm((f) => ({
                    ...f,
                    quantity: parseInt(e.target.value) || 0,
                  }))
                }
                className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs text-[var(--text-primary)]"
                placeholder="Quantity"
              />
              <input
                value={allocForm.reason}
                onChange={(e) =>
                  setAllocForm((f) => ({ ...f, reason: e.target.value }))
                }
                className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs text-[var(--text-primary)]"
                placeholder="Reason"
              />
              <input
                value={allocForm.case_reference}
                onChange={(e) => setAllocForm({ ...allocForm, case_reference: e.target.value })}
                placeholder="Support, sales, or operations case reference"
                className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowAllocateModal(false)}
                className="px-3 py-2 text-xs text-[var(--text-secondary)]"
              >
                Cancel
              </button>
              <button
                onClick={handleAllocateUsageSubmit}
                disabled={allocForm.quantity <= 0 || allocForm.reason.trim().length < 12 || allocForm.case_reference.trim().length < 2 || allocateUsage.isPending}
                className="px-4 py-2 bg-[var(--brand-primary)] text-[var(--primary-contrast)] text-xs font-bold rounded-xl"
              >
                Submit for approval
              </button>
            </div>
          </div>
        </div>
      )}

      {showDiscountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-sm font-black text-[var(--text-primary)] uppercase tracking-wider mb-4">
              Apply Commercial Discount
            </h3>
            <div className="space-y-3 mb-4">
              <select
                value={discForm.discount_type}
                onChange={(e) =>
                  setDiscForm((f) => ({
                    ...f,
                    discount_type: e.target.value as any,
                  }))
                }
                className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs text-[var(--text-primary)]"
              >
                <option value="PERCENTAGE">Percentage (%)</option>
                <option value="FLAT">Flat Amount ($)</option>
                <option value="RECURRING">Recurring Discount</option>
              </select>
              <input
                type="number"
                value={discForm.value}
                onChange={(e) =>
                  setDiscForm((f) => ({
                    ...f,
                    value: parseFloat(e.target.value) || 0,
                  }))
                }
                className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs text-[var(--text-primary)]"
                placeholder="Value"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDiscountModal(false)}
                className="px-3 py-2 text-xs text-[var(--text-secondary)]"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyDiscountSubmit}
                className="px-4 py-2 bg-[var(--brand-primary)] text-[var(--primary-contrast)] text-xs font-bold rounded-xl"
              >
                Apply Discount
              </button>
            </div>
          </div>
        </div>
      )}

      {showWalletModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-sm font-black text-[var(--text-primary)] uppercase tracking-wider mb-4">
              Adjust Credit Wallet
            </h3>
            <div className="space-y-3 mb-4">
              <select
                value={walletForm.type}
                onChange={(e) =>
                  setWalletForm((f) => ({ ...f, type: e.target.value as any }))
                }
                className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs text-[var(--text-primary)]"
              >
                <option value="CREDIT">Add Credit (+)</option>
                <option value="DEBIT">Debit Credit (-)</option>
              </select>
              <input
                type="number"
                value={walletForm.amount}
                onChange={(e) =>
                  setWalletForm((f) => ({
                    ...f,
                    amount: parseFloat(e.target.value) || 0,
                  }))
                }
                className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs text-[var(--text-primary)]"
                placeholder="Amount ($)"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowWalletModal(false)}
                className="px-3 py-2 text-xs text-[var(--text-secondary)]"
              >
                Cancel
              </button>
              <button
                onClick={handleWalletSubmit}
                className="px-4 py-2 bg-[var(--brand-primary)] text-[var(--primary-contrast)] text-xs font-bold rounded-xl"
              >
                Adjust Balance
              </button>
            </div>
          </div>
        </div>
      )}

      {editingQuotaKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-sm font-black text-[var(--text-primary)] uppercase tracking-wider mb-4">
              Request governed commercial change
            </h3>
            <input
              value={editingQuotaKey}
              onChange={(e) => setEditingQuotaKey(e.target.value)}
              className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs text-[var(--text-primary)] mb-4"
              placeholder="Entitlement or change key"
            />
            <textarea
              value={editingQuotaValue}
              onChange={(e) => setEditingQuotaValue(e.target.value)}
              className="min-h-28 w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] mb-2"
              placeholder='JSON requested value, for example {"resource_id":"...","version":1,"status":"SUSPENDED"}'
            />
            <p className="mb-4 text-[10px] text-[var(--text-tertiary)]">
              Billing lifecycle keys: billing.subscription.status,
              billing.entitlement_grant.issue,
              billing.entitlement_grant.capacity, and
              billing.entitlement_grant.status. The approved JSON must exactly
              match the later mutation.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditingQuotaKey(null)}
                className="px-3 py-2 text-xs text-[var(--text-secondary)]"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    let parsedValue: unknown;
                    try {
                      parsedValue = JSON.parse(editingQuotaValue);
                    } catch {
                      const numericValue = Number(editingQuotaValue);
                      parsedValue =
                        editingQuotaValue === "unlimited" ||
                          !Number.isFinite(numericValue)
                          ? editingQuotaValue
                          : numericValue;
                    }
                    await updateEntitlement.mutateAsync({
                      entitlement_key: editingQuotaKey,
                      operation: "REPLACE",
                      requested_value: parsedValue,
                      reason: "Commercial quota override requested",
                      case_reference: "COMMAND-CENTER",
                    });
                    toast.success("Override sent for independent approval");
                    setEditingQuotaKey(null);
                  } catch (e: any) {
                    toast.error("Failed to override entitlement");
                  }
                }}
                disabled={!editingQuotaKey.trim() || !editingQuotaValue.trim()}
                className="px-4 py-2 bg-[var(--brand-primary)] text-[var(--primary-contrast)] text-xs font-bold rounded-xl disabled:opacity-40"
              >
                Save Override
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
