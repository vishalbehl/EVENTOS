"use client";

import { useState } from "react";
import { RefreshCw, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import {
  useAdminEmcAccounts,
  useAdminEmcAllocations,
  useAdminEmcHistory,
  useAdminEmcWorkspaces,
  useCreateAdminEmcAllocation,
  useCreateAdminEmcWorkspace,
  useTransferAdminEmcAllocation,
} from "@/services/super-admin-service";

export default function EmcAdministrationPage() {
  const accounts = useAdminEmcAccounts();
  const [accountId, setAccountId] = useState<string>();
  const selectedAccount = (accounts.data || []).find((account) => account.id === accountId);
  const workspaces = useAdminEmcWorkspaces(accountId);
  const allocations = useAdminEmcAllocations(accountId);
  const history = useAdminEmcHistory(accountId);
  const createWorkspace = useCreateAdminEmcWorkspace();
  const createAllocation = useCreateAdminEmcAllocation();
  const transferAllocation = useTransferAdminEmcAllocation();
  const [organizationId, setOrganizationId] = useState("");
  const [workspaceReason, setWorkspaceReason] = useState("");
  const [allocation, setAllocation] = useState({ workspaceId: "", entitlementKey: "annual_registrations", quantity: "", eventId: "", reason: "" });
  const [transfer, setTransfer] = useState({ sourceId: "", targetId: "", entitlementKey: "annual_registrations", quantity: "", reason: "" });
  const accessDenied = [accounts.error, workspaces.error, allocations.error, history.error].some((error) => (error as { status?: number } | undefined)?.status === 401 || (error as { status?: number } | undefined)?.status === 403);
  const hasRefreshingSnapshot = [accounts, workspaces, allocations, history].some((query) => query.isFetching && query.data !== undefined);

  return (
    <PageContainer>
      <SectionHeader title="EMC administration" description="Manage annual pooled capacity, client workspaces, allocations, transfers, usage, and contract ownership." actions={<Button variant="secondary" onClick={() => accounts.refetch()} disabled={accounts.isFetching}><RefreshCw className="mr-2 size-4" />Refresh</Button>} />
      {accessDenied ? <div className="mb-4 rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/5 px-3 py-2 text-xs text-[var(--text-secondary)]" role="alert">You do not have permission to administer EMC accounts.</div> : null}
      {hasRefreshingSnapshot ? <div className="mb-4 rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/5 px-3 py-2 text-xs text-[var(--text-secondary)]" role="status">Refreshing EMC data. Values shown may be briefly stale until the latest response arrives.</div> : null}
      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Users className="size-4 text-[var(--pri)]" />EMC accounts</div>
          {accounts.isLoading ? <p className="text-sm text-[var(--text-secondary)]">Loading accounts…</p> : accounts.isError ? <p className="text-sm text-[var(--text-secondary)]">{accessDenied ? "EMC account access is denied." : "EMC accounts unavailable."}</p> : (accounts.data || []).length === 0 ? <p className="text-sm text-[var(--text-secondary)]">No EMC accounts.</p> : <div className="space-y-2">{(accounts.data || []).map((account) => <button key={account.id} type="button" onClick={() => setAccountId(account.id)} className={`w-full rounded-lg border p-3 text-left text-xs ${account.id === accountId ? "border-[var(--pri)] bg-[var(--bg-surface-2)]" : "border-[var(--border-subtle)]"}`}><span className="font-medium">{account.id}</span><span className="mt-1 block text-[var(--text-secondary)]">Owner: {account.owner_organization_id}</span><span className="mt-1 block uppercase text-[var(--text-tertiary)]">{account.status} · {account.currency}</span></button>)}</div>}
        </section>
        <section className="space-y-5">
          {!accountId ? <div className="rounded-xl border border-[var(--border-subtle)] p-8 text-sm text-[var(--text-secondary)]">Select an EMC account to inspect its client workspaces and pooled allocations.</div> : <>
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
                <h2 className="font-semibold">Client workspaces</h2>
                {workspaces.isLoading ? <p className="mt-3 text-sm text-[var(--text-secondary)]">Loading workspaces…</p> : workspaces.isError ? <p className="mt-3 text-sm text-[var(--text-secondary)]">{accessDenied ? "Client workspace access is denied." : "Client workspaces are unavailable."}</p> : <>
                  <div className="mt-3 space-y-2">{(workspaces.data || []).map((workspace: any) => <div key={workspace.id} className="rounded-lg border border-[var(--border-subtle)] p-3 text-xs"><p className="font-medium">{workspace.organization_id}</p><p className="mt-1 text-[var(--text-secondary)]">{workspace.workspace_role} · {workspace.status}</p></div>)}</div>
                  <div className="mt-4 border-t border-[var(--border-subtle)] pt-4"><p className="text-xs font-semibold uppercase text-[var(--text-secondary)]">Add client workspace</p><Input className="mt-2" placeholder="Organization ID" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} /><Input className="mt-2" placeholder="Audit reason" value={workspaceReason} onChange={(event) => setWorkspaceReason(event.target.value)} /><Button className="mt-2 w-full" disabled={organizationId.length < 10 || workspaceReason.trim().length < 5 || createWorkspace.isPending || !selectedAccount} onClick={() => createWorkspace.mutate({ accountId, organizationId, reason: workspaceReason.trim(), version: selectedAccount?.version ?? 1 }, { onSuccess: () => { setOrganizationId(""); setWorkspaceReason(""); } })}>{createWorkspace.isPending ? "Adding…" : "Add client workspace"}</Button></div>
                </>}
              </div>
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
                <h2 className="font-semibold">Allocate pooled capacity</h2>
                <select value={allocation.workspaceId} onChange={(event) => setAllocation({ ...allocation, workspaceId: event.target.value })} className="input mt-3 h-9 w-full rounded-md px-3 text-sm"><option value="">Client workspace</option>{(workspaces.data || []).filter((item: any) => item.workspace_role === "CLIENT").map((item: any) => <option key={item.id} value={item.id}>{item.organization_id}</option>)}</select>
                <Input className="mt-2" placeholder="Entitlement key" value={allocation.entitlementKey} onChange={(event) => setAllocation({ ...allocation, entitlementKey: event.target.value })} />
                <Input className="mt-2" type="number" min="1" placeholder="Quantity" value={allocation.quantity} onChange={(event) => setAllocation({ ...allocation, quantity: event.target.value })} />
                <Input className="mt-2" placeholder="Event ID (optional)" value={allocation.eventId} onChange={(event) => setAllocation({ ...allocation, eventId: event.target.value })} />
                <Input className="mt-2" placeholder="Reason" value={allocation.reason} onChange={(event) => setAllocation({ ...allocation, reason: event.target.value })} />
                <Button className="mt-3 w-full" disabled={!allocation.workspaceId || !allocation.quantity || allocation.reason.length < 5 || createAllocation.isPending || !selectedAccount} onClick={() => createAllocation.mutate({ accountId, version: selectedAccount?.version ?? 1, payload: { client_workspace_id: allocation.workspaceId, entitlement_key: allocation.entitlementKey, quantity: Number(allocation.quantity), event_id: allocation.eventId || undefined, reason: allocation.reason } })}>{createAllocation.isPending ? "Allocating…" : "Allocate capacity"}</Button>
              </div>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
              <h2 className="font-semibold">Pooled and client allocations</h2>
              {allocations.isLoading ? <p className="mt-3 text-sm text-[var(--text-secondary)]">Loading allocations…</p> : allocations.isError ? <p className="mt-3 text-sm text-[var(--text-secondary)]">Allocations unavailable.</p> : <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead><tr className="border-b border-[var(--border-subtle)] uppercase text-[var(--text-secondary)]"><th className="pb-2">Entitlement</th><th className="pb-2">Workspace</th><th className="pb-2">Total</th><th className="pb-2">Used</th><th className="pb-2">Remaining</th><th className="pb-2">Status</th></tr></thead><tbody>{(allocations.data || []).map((item: any) => <tr key={item.id} className="border-b border-[var(--border-subtle)]"><td className="py-3">{item.entitlement_key}</td><td className="py-3">{item.client_workspace_id || "Pooled"}</td><td className="py-3">{item.total} {item.unit_type || ""}</td><td className="py-3">{item.consumed}</td><td className="py-3">{item.remaining}</td><td className="py-3">{item.status}</td></tr>)}</tbody></table></div>}
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5" aria-labelledby="emc-usage-title">
                <h2 id="emc-usage-title" className="font-semibold">Client usage ledger</h2>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">Most recent consumption, reservations, and allocation transfers across this EMC account.</p>
                {history.isLoading ? <p className="mt-3 text-sm text-[var(--text-secondary)]">Loading client usage…</p> : history.isError ? <p className="mt-3 text-sm text-[var(--text-secondary)]">Client usage is unavailable.</p> : (history.data?.usage || []).length === 0 ? <p className="mt-3 text-sm text-[var(--text-secondary)]">No EMC usage has been recorded.</p> : <div className="mt-3 max-h-72 overflow-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead><tr className="border-b border-[var(--border-subtle)] uppercase text-[var(--text-secondary)]"><th className="pb-2">Workspace</th><th className="pb-2">Entitlement</th><th className="pb-2">Operation</th><th className="pb-2">Quantity</th><th className="pb-2">Recorded</th></tr></thead><tbody>{(history.data?.usage || []).map((entry: any) => <tr key={entry.id} className="border-b border-[var(--border-subtle)]"><td className="py-2">{entry.organization_id}</td><td className="py-2">{entry.entitlement_key}</td><td className="py-2">{entry.operation_type}</td><td className="py-2">{entry.quantity}</td><td className="py-2">{new Date(entry.created_at).toLocaleDateString("en-IN")}</td></tr>)}</tbody></table></div>}
              </section>
              <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5" aria-labelledby="emc-contract-history-title">
                <h2 id="emc-contract-history-title" className="font-semibold">Contract, quote, and invoice history</h2>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">Immutable commercial references for this EMC account.</p>
                {history.isLoading ? <p className="mt-3 text-sm text-[var(--text-secondary)]">Loading commercial history…</p> : history.isError ? <p className="mt-3 text-sm text-[var(--text-secondary)]">Commercial history is unavailable.</p> : (history.data?.contracts || []).length === 0 ? <p className="mt-3 text-sm text-[var(--text-secondary)]">No EMC contracts have been created.</p> : <div className="mt-3 space-y-2">{(history.data?.contracts || []).map((contract: any) => <div key={contract.id} className="rounded-lg border border-[var(--border-subtle)] p-3 text-xs"><p className="font-medium">{contract.contract_type} · {contract.status}</p><p className="mt-1 text-[var(--text-secondary)]">Term: {new Date(contract.starts_at).toLocaleDateString("en-IN")} – {contract.ends_at ? new Date(contract.ends_at).toLocaleDateString("en-IN") : "Open"}</p><p className="mt-1 text-[var(--text-secondary)]">Quote: {contract.source_quote_id || "Not quote-based"} · Invoice: {contract.invoice_id || "Not issued"}</p><p className="mt-1 text-[var(--text-secondary)]">Price book: {contract.price_book_version || "Not recorded"}</p></div>)}</div>}
              </section>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
              <h2 className="font-semibold">Transfer capacity</h2>
              <div className="grid gap-2 md:grid-cols-5"><select value={transfer.sourceId} onChange={(event) => setTransfer({ ...transfer, sourceId: event.target.value })} className="input h-9 rounded-md px-3 text-sm"><option value="">Source</option>{(allocations.data || []).map((item: any) => <option key={item.id} value={item.id}>{item.entitlement_key} · {item.remaining}</option>)}</select><select value={transfer.targetId} onChange={(event) => setTransfer({ ...transfer, targetId: event.target.value })} className="input h-9 rounded-md px-3 text-sm"><option value="">Target</option>{(allocations.data || []).map((item: any) => <option key={item.id} value={item.id}>{item.entitlement_key} · {item.client_workspace_id || "pool"}</option>)}</select><Input type="number" min="1" placeholder="Quantity" value={transfer.quantity} onChange={(event) => setTransfer({ ...transfer, quantity: event.target.value })} /><Input placeholder="Reason" value={transfer.reason} onChange={(event) => setTransfer({ ...transfer, reason: event.target.value })} /><Button disabled={!transfer.sourceId || !transfer.targetId || !transfer.quantity || transfer.reason.length < 5 || transferAllocation.isPending || !selectedAccount} onClick={() => transferAllocation.mutate({ accountId, version: selectedAccount?.version ?? 1, payload: { source_allocation_id: transfer.sourceId, target_allocation_id: transfer.targetId, entitlement_key: transfer.entitlementKey, quantity: Number(transfer.quantity), reason: transfer.reason } })}><Send className="mr-2 size-4" />Transfer</Button></div>
            </div>
          </>}
        </section>
      </div>
    </PageContainer>
  );
}
