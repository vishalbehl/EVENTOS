"use client";

import React, { useState } from "react";
import { format } from "date-fns";
import {
  Archive,
  ArrowRight,
  Building2,
  Eye,
  Filter,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  TrendingUp,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { CrmRecordDialog } from "@/components/crm/CrmRecordDialog";
import { CrmAccountWorkspaceSheet } from "@/components/crm/CrmAccountWorkspaceSheet";
import { CrmEngagementWorkspace, type CrmEntityTarget } from "@/components/crm/CrmEngagementWorkspace";
import { ConfirmDestructiveAction } from "@/components/super-admin/ui/ConfirmDestructiveAction";
import { EmptyState } from "@/components/super-admin/ui/EmptyState";
import { TableSkeleton } from "@/components/super-admin/ui/LoadingSkeleton";
import { MetricRow } from "@/components/super-admin/ui/MetricRow";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import {
  SupportAccessScope,
  type SupportAccessSelection,
} from "@/components/super-admin/ui/SupportAccessScope";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  type CRMAccount,
  type CRMContact,
  type CRMLead,
  type CRMOpportunity,
  type CRMCoreResourceType,
  useAccounts,
  useContacts,
  useCrmMutation,
  useLeads,
  useLeadConversion,
  useOpportunities,
  usePipelineStages,
} from "@/hooks/useCRM";

type CRMRecord = CRMAccount | CRMContact | CRMLead | CRMOpportunity;
type TabKey = "accounts" | "contacts" | "leads" | "opportunities";

interface LifecycleTarget {
  action: "archive" | "restore";
  resourceType: CRMCoreResourceType;
  record: CRMRecord;
  name: string;
  idempotencyKey: string;
}

const TAB_RESOURCE: Record<TabKey, CRMCoreResourceType> = {
  accounts: "account",
  contacts: "contact",
  leads: "lead",
  opportunities: "opportunity",
};

const RESOURCE_LABEL: Record<CRMCoreResourceType, string> = {
  account: "account",
  contact: "contact",
  lead: "lead",
  opportunity: "opportunity",
};

const ROW_CLS = "border-b border-[var(--border-subtle)] transition-colors hover:bg-[var(--bg-surface-2)]";
const CELL_CLS = "px-4 py-3 text-xs text-[var(--text-secondary)] align-middle";
const MONO_CLS = "font-mono text-[10px] text-[var(--text-tertiary)]";

function formatDate(date?: string) {
  if (!date) return "-";
  try {
    return format(new Date(date), "dd MMM yyyy");
  } catch {
    return date;
  }
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

const LEAD_STATUS_COLORS: Record<string, string> = {
  NEW: "border-blue-500/20 bg-blue-500/10 text-blue-400",
  CONTACTED: "border-yellow-500/20 bg-yellow-500/10 text-yellow-400",
  QUALIFIED: "border-green-500/20 bg-green-500/10 text-green-400",
  LOST: "border-red-500/20 bg-red-500/10 text-red-400",
};

function LeadStatusBadge({ status }: { status: string }) {
  const cls = LEAD_STATUS_COLORS[status] ?? "border-zinc-500/20 bg-zinc-500/10 text-zinc-400";
  return <Badge className={`border px-2 py-0.5 text-[9px] font-bold uppercase ${cls}`}>{status}</Badge>;
}

function CRMTable({
  headers,
  children,
  isEmpty,
  emptyTitle,
  emptyDescription,
}: {
  headers: string[];
  children: React.ReactNode;
  isEmpty: boolean;
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (isEmpty) {
    return <EmptyState title={emptyTitle} description={emptyDescription} className="py-16" />;
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border-default)]">
      <div className="max-h-[calc(100vh-420px)] overflow-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--border-default)] bg-[var(--bg-surface-2)]">
              {headers.map((header) => (
                <th key={header} className="sticky top-0 h-10 whitespace-nowrap border-b border-[var(--border-default)] bg-[var(--bg-surface-2)] px-4 text-[10px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

function LifecycleBadge({ record }: { record: CRMRecord }) {
  return record.archived_at ? (
    <Badge variant="outline" className="border-amber-400/25 bg-amber-400/10 text-[9px] uppercase text-amber-300">Archived</Badge>
  ) : null;
}

function RowActions({
  resourceType,
  record,
  name,
  onEdit,
  onLifecycle,
}: {
  resourceType: CRMCoreResourceType;
  record: CRMRecord;
  name: string;
  onEdit: (resourceType: CRMCoreResourceType, record: CRMRecord) => void;
  onLifecycle: (target: LifecycleTarget) => void;
}) {
  const archived = Boolean(record.archived_at);
  return (
    <div className="flex justify-end gap-1">
      {!archived ? (
        <Button variant="ghost" size="icon" className="size-8" aria-label={`Edit ${name}`} onClick={() => onEdit(resourceType, record)}>
          <Pencil className="size-3.5" aria-hidden="true" />
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="icon"
        className={`size-8 ${archived ? "text-emerald-300" : "text-amber-300"}`}
        aria-label={`${archived ? "Restore" : "Archive"} ${name}`}
        onClick={() => onLifecycle({
          action: archived ? "restore" : "archive",
          resourceType,
          record,
          name,
          idempotencyKey: crypto.randomUUID(),
        })}
      >
        {archived ? <RotateCcw className="size-3.5" aria-hidden="true" /> : <Archive className="size-3.5" aria-hidden="true" />}
      </Button>
    </div>
  );
}

interface TabProps<T extends CRMRecord> {
  records: T[];
  isLoading: boolean;
  onEdit: (resourceType: CRMCoreResourceType, record: CRMRecord) => void;
  onLifecycle: (target: LifecycleTarget) => void;
}

function AccountsTab({ records, isLoading, onEdit, onLifecycle, onInspect }: TabProps<CRMAccount> & { onInspect: (account: CRMAccount) => void }) {
  if (isLoading) return <TableSkeleton rows={6} cols={7} />;
  return (
    <CRMTable headers={["ID", "Name", "Website", "Industry", "Created", "State", "Actions"]} isEmpty={!records.length} emptyTitle="No accounts found" emptyDescription="No CRM accounts match this tenant scope.">
      {records.map((account) => (
        <tr key={account.id} className={`${ROW_CLS} ${account.archived_at ? "opacity-70" : ""}`}>
          <td className={CELL_CLS}><span className={MONO_CLS}>{account.id.slice(0, 8)}...</span></td>
          <td className={CELL_CLS}><button type="button" className="font-semibold text-[var(--text-primary)] hover:text-[var(--brand-primary)] hover:underline" onClick={() => onInspect(account)}>{account.name}</button></td>
          <td className={CELL_CLS}>{account.website ? <a href={account.website} target="_blank" rel="noopener noreferrer" className="block max-w-40 truncate text-[var(--brand-primary)] hover:underline">{account.website}</a> : "-"}</td>
          <td className={CELL_CLS}>{account.industry ?? "-"}</td>
          <td className={CELL_CLS}>{formatDate(account.created_at)}</td>
          <td className={CELL_CLS}><LifecycleBadge record={account} /></td>
          <td className={CELL_CLS}><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" className="size-8" aria-label={`Open ${account.name} workspace`} onClick={() => onInspect(account)}><Eye className="size-3.5" aria-hidden="true" /></Button><RowActions resourceType="account" record={account} name={account.name} onEdit={onEdit} onLifecycle={onLifecycle} /></div></td>
        </tr>
      ))}
    </CRMTable>
  );
}

function ContactsTab({ records, isLoading, onEdit, onLifecycle }: TabProps<CRMContact>) {
  if (isLoading) return <TableSkeleton rows={6} cols={7} />;
  return (
    <CRMTable headers={["ID", "Name", "Email", "Account", "Created", "State", "Actions"]} isEmpty={!records.length} emptyTitle="No contacts found" emptyDescription="No CRM contacts match this tenant scope.">
      {records.map((contact) => {
        const name = `${contact.first_name} ${contact.last_name}`.trim();
        return (
          <tr key={contact.id} className={`${ROW_CLS} ${contact.archived_at ? "opacity-70" : ""}`}>
            <td className={CELL_CLS}><span className={MONO_CLS}>{contact.id.slice(0, 8)}...</span></td>
            <td className={CELL_CLS}><span className="font-semibold text-[var(--text-primary)]">{name}</span></td>
            <td className={CELL_CLS}><a href={`mailto:${contact.email}`} className="text-[var(--brand-primary)] hover:underline">{contact.email}</a></td>
            <td className={CELL_CLS}><span className={MONO_CLS}>{contact.account_id.slice(0, 8)}...</span></td>
            <td className={CELL_CLS}>{formatDate(contact.created_at)}</td>
            <td className={CELL_CLS}><LifecycleBadge record={contact} /></td>
            <td className={CELL_CLS}><RowActions resourceType="contact" record={contact} name={name} onEdit={onEdit} onLifecycle={onLifecycle} /></td>
          </tr>
        );
      })}
    </CRMTable>
  );
}

function LeadsTab({ records, isLoading, onEdit, onLifecycle, onConvert }: TabProps<CRMLead> & { onConvert: (lead: CRMLead) => void }) {
  if (isLoading) return <TableSkeleton rows={6} cols={7} />;
  return (
    <CRMTable headers={["ID", "Status", "Source", "Contact", "Created", "State", "Actions"]} isEmpty={!records.length} emptyTitle="No leads found" emptyDescription="No CRM leads match this tenant scope.">
      {records.map((lead) => {
        const name = `Lead ${lead.id.slice(0, 8)}`;
        return (
          <tr key={lead.id} className={`${ROW_CLS} ${lead.archived_at ? "opacity-70" : ""}`}>
            <td className={CELL_CLS}><span className={MONO_CLS}>{lead.id.slice(0, 8)}...</span></td>
            <td className={CELL_CLS}><LeadStatusBadge status={lead.status} /></td>
            <td className={CELL_CLS}>{lead.source ?? "-"}</td>
            <td className={CELL_CLS}>{lead.contact_id ? <span className={MONO_CLS}>{lead.contact_id.slice(0, 8)}...</span> : "-"}</td>
            <td className={CELL_CLS}>{formatDate(lead.created_at)}</td>
            <td className={CELL_CLS}><LifecycleBadge record={lead} /></td>
            <td className={CELL_CLS}><div className="flex justify-end gap-1">{lead.status === "QUALIFIED" && !lead.archived_at ? <Button variant="ghost" size="icon" className="size-8 text-emerald-300" aria-label={`Convert ${name}`} onClick={() => onConvert(lead)}><ArrowRight className="size-3.5" /></Button> : null}<RowActions resourceType="lead" record={lead} name={name} onEdit={onEdit} onLifecycle={onLifecycle} /></div></td>
          </tr>
        );
      })}
    </CRMTable>
  );
}

function OpportunitiesTab({ records, isLoading, onEdit, onLifecycle }: TabProps<CRMOpportunity>) {
  if (isLoading) return <TableSkeleton rows={6} cols={7} />;
  return (
    <CRMTable headers={["Name", "Amount", "Account", "Close date", "Created", "State", "Actions"]} isEmpty={!records.length} emptyTitle="No opportunities found" emptyDescription="No CRM opportunities match this tenant scope.">
      {records.map((opportunity) => (
        <tr key={opportunity.id} className={`${ROW_CLS} ${opportunity.archived_at ? "opacity-70" : ""}`}>
          <td className={CELL_CLS}><span className="font-semibold text-[var(--text-primary)]">{opportunity.name}</span></td>
          <td className={CELL_CLS}><span className="font-mono font-bold text-green-400">{formatCurrency(opportunity.amount)}</span></td>
          <td className={CELL_CLS}><span className={MONO_CLS}>{opportunity.account_id.slice(0, 8)}...</span></td>
          <td className={CELL_CLS}>{formatDate(opportunity.close_date)}</td>
          <td className={CELL_CLS}>{formatDate(opportunity.created_at)}</td>
          <td className={CELL_CLS}><LifecycleBadge record={opportunity} /></td>
          <td className={CELL_CLS}><RowActions resourceType="opportunity" record={opportunity} name={opportunity.name} onEdit={onEdit} onLifecycle={onLifecycle} /></td>
        </tr>
      ))}
    </CRMTable>
  );
}

export default function CRMPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("accounts");
  const [supportScope, setSupportScope] = useState<SupportAccessSelection | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [dialog, setDialog] = useState<{ resourceType: CRMCoreResourceType; record: CRMRecord | null } | null>(null);
  const [lifecycleTarget, setLifecycleTarget] = useState<LifecycleTarget | null>(null);
  const [convertLead, setConvertLead] = useState<CRMLead | null>(null);
  const [workspaceAccount, setWorkspaceAccount] = useState<CRMAccount | null>(null);
  const [conversion, setConversion] = useState({ name: "", amount: "0", stageId: "", closeDate: "", reason: "" });

  const queryScope = {
    organizationId: supportScope?.organizationId,
    supportReason: supportScope?.reason,
    accessRequestId: supportScope?.accessRequestId,
    includeArchived,
  };
  const accountsQuery = useAccounts(queryScope);
  const contactsQuery = useContacts(queryScope);
  const leadsQuery = useLeads(queryScope);
  const opportunitiesQuery = useOpportunities(queryScope);
  const stagesQuery = usePipelineStages();
  const lifecycleMutation = useCrmMutation(queryScope, lifecycleTarget?.resourceType ?? TAB_RESOURCE[activeTab]);
  const leadConversion = useLeadConversion(queryScope);

  const accounts = accountsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const contacts = contactsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const leads = leadsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const opportunities = opportunitiesQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const isAnyLoading = accountsQuery.isLoading || contactsQuery.isLoading || leadsQuery.isLoading || opportunitiesQuery.isLoading;

  const editRecord = (resourceType: CRMCoreResourceType, record: CRMRecord) => setDialog({ resourceType, record });
  const confirmLifecycle = async (reason?: string) => {
    if (!lifecycleTarget || !reason) return;
    try {
      await lifecycleMutation.mutateAsync({
        action: lifecycleTarget.action,
        recordId: lifecycleTarget.record.id,
        payload: { version: lifecycleTarget.record.version, reason },
        idempotencyKey: lifecycleTarget.idempotencyKey,
      });
      toast.success(`${lifecycleTarget.name} ${lifecycleTarget.action === "archive" ? "archived" : "restored"}`);
      setLifecycleTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Unable to ${lifecycleTarget.action} record`);
    }
  };

  const activeQuery = activeTab === "accounts" ? accountsQuery : activeTab === "contacts" ? contactsQuery : activeTab === "leads" ? leadsQuery : opportunitiesQuery;
  const metrics = [
    { label: "Accounts", value: accountsQuery.isLoading ? "-" : accounts.length },
    { label: "Contacts", value: contactsQuery.isLoading ? "-" : contacts.length },
    { label: "Leads", value: leadsQuery.isLoading ? "-" : leads.length },
    { label: "Opportunities", value: opportunitiesQuery.isLoading ? "-" : opportunities.length },
  ];
  const engagementTargets: CrmEntityTarget[] = supportScope ? [
    { type: "organization", id: supportScope.organizationId, label: "Organization-wide" },
    ...accounts.filter((record) => !record.archived_at).map((record) => ({ type: "account" as const, id: record.id, label: `Account · ${record.name}` })),
    ...contacts.filter((record) => !record.archived_at).map((record) => ({ type: "contact" as const, id: record.id, label: `Contact · ${record.first_name} ${record.last_name}` })),
    ...leads.filter((record) => !record.archived_at).map((record) => ({ type: "lead" as const, id: record.id, label: `Lead · ${record.id.slice(0, 8)}` })),
    ...opportunities.filter((record) => !record.archived_at).map((record) => ({ type: "opportunity" as const, id: record.id, label: `Opportunity · ${record.name}` })),
  ] : [];

  return (
    <PageContainer>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <SectionHeader title="CRM Overview" description="Audited tenant-scoped sales pipeline operations for platform support" />
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-[var(--border-default)] px-3 py-2">
            <Switch id="crm-show-archived" checked={includeArchived} onCheckedChange={setIncludeArchived} disabled={!supportScope} />
            <label htmlFor="crm-show-archived" className="cursor-pointer text-xs text-[var(--text-secondary)]">Show archived</label>
          </div>
          <Button variant="outline" size="sm" onClick={() => void activeQuery.refetch()} disabled={isAnyLoading || !supportScope} className="gap-2 text-xs">
            <RefreshCw className={`size-3.5 ${isAnyLoading ? "animate-spin" : ""}`} aria-hidden="true" />
            Refresh
          </Button>
          <Button size="sm" className="gap-2" disabled={!supportScope} onClick={() => setDialog({ resourceType: TAB_RESOURCE[activeTab], record: null })}>
            <Plus className="size-3.5" aria-hidden="true" />
            Create {RESOURCE_LABEL[TAB_RESOURCE[activeTab]]}
          </Button>
        </div>
      </div>

      <SupportAccessScope value={supportScope} onApply={setSupportScope} />
      {supportScope ? <MetricRow metrics={metrics} /> : null}

      <div className="mt-8">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabKey)}>
          <TabsList className="mb-6">
            <TabsTrigger value="accounts" className="gap-2"><Building2 className="size-3.5" aria-hidden="true" />Accounts</TabsTrigger>
            <TabsTrigger value="contacts" className="gap-2"><Users className="size-3.5" aria-hidden="true" />Contacts</TabsTrigger>
            <TabsTrigger value="leads" className="gap-2"><Filter className="size-3.5" aria-hidden="true" />Leads</TabsTrigger>
            <TabsTrigger value="opportunities" className="gap-2"><TrendingUp className="size-3.5" aria-hidden="true" />Opportunities</TabsTrigger>
          </TabsList>
          <TabsContent value="accounts"><AccountsTab records={accounts} isLoading={accountsQuery.isLoading} onEdit={editRecord} onLifecycle={setLifecycleTarget} onInspect={setWorkspaceAccount} /></TabsContent>
          <TabsContent value="contacts"><ContactsTab records={contacts} isLoading={contactsQuery.isLoading} onEdit={editRecord} onLifecycle={setLifecycleTarget} /></TabsContent>
          <TabsContent value="leads"><LeadsTab records={leads} isLoading={leadsQuery.isLoading} onEdit={editRecord} onLifecycle={setLifecycleTarget} onConvert={(lead) => { setConvertLead(lead); setConversion({ name: `Opportunity from lead ${lead.id.slice(0, 8)}`, amount: "0", stageId: stagesQuery.data?.[0]?.id ?? "", closeDate: "", reason: "" }); }} /></TabsContent>
          <TabsContent value="opportunities"><OpportunitiesTab records={opportunities} isLoading={opportunitiesQuery.isLoading} onEdit={editRecord} onLifecycle={setLifecycleTarget} /></TabsContent>
        </Tabs>
        {activeQuery.hasNextPage ? (
          <div className="mt-4 flex justify-center">
            <Button variant="outline" size="sm" disabled={activeQuery.isFetchingNextPage} onClick={() => void activeQuery.fetchNextPage()}>
              {activeQuery.isFetchingNextPage ? "Loading..." : "Load more"}
            </Button>
          </div>
        ) : null}
      </div>

      {supportScope ? <CrmEngagementWorkspace scope={queryScope} targets={engagementTargets} /> : null}

      <CrmAccountWorkspaceSheet
        account={workspaceAccount}
        scope={queryScope}
        open={Boolean(workspaceAccount)}
        onOpenChange={(open) => { if (!open) setWorkspaceAccount(null); }}
      />

      {dialog ? (
        <CrmRecordDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          resourceType={dialog.resourceType}
          scope={queryScope}
          record={dialog.record}
          accounts={accounts.filter((record) => !record.archived_at)}
          contacts={contacts.filter((record) => !record.archived_at)}
          stages={stagesQuery.data ?? []}
        />
      ) : null}

      <ConfirmDestructiveAction
        open={Boolean(lifecycleTarget)}
        onOpenChange={(open) => !open && setLifecycleTarget(null)}
        title={lifecycleTarget?.action === "restore" ? "Restore CRM record" : "Archive CRM record"}
        description={lifecycleTarget?.action === "restore" ? "This record will return to active CRM workflows." : "This record will be hidden from active CRM workflows. Dependencies are checked by the server."}
        resourceName={lifecycleTarget?.name}
        confirmLabel={lifecycleTarget?.action === "restore" ? "Restore record" : "Archive record"}
        cancelLabel="Cancel"
        destructive={lifecycleTarget?.action !== "restore"}
        requireReason
        minimumReasonLength={12}
        pending={lifecycleMutation.isPending}
        onConfirm={confirmLifecycle}
      />
      <Dialog open={Boolean(convertLead)} onOpenChange={(open) => !open && setConvertLead(null)}>
        <DialogContent><DialogHeader><DialogTitle>Convert qualified lead</DialogTitle><DialogDescription>Create one opportunity from this lead's tenant-owned contact and account. The lead becomes archived as converted.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div><Label htmlFor="convert-name">Opportunity name</Label><Input id="convert-name" value={conversion.name} onChange={(event) => setConversion((current) => ({ ...current, name: event.target.value }))} /></div><div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="convert-stage">Pipeline stage</Label><select id="convert-stage" value={conversion.stageId} onChange={(event) => setConversion((current) => ({ ...current, stageId: event.target.value }))} className="mt-1 h-10 w-full rounded-md border border-border bg-surface-2 px-3 text-sm">{(stagesQuery.data ?? []).map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></div><div><Label htmlFor="convert-amount">Amount</Label><Input id="convert-amount" type="number" min="0" step="0.01" value={conversion.amount} onChange={(event) => setConversion((current) => ({ ...current, amount: event.target.value }))} /></div></div><div><Label htmlFor="convert-close-date">Expected close date</Label><Input id="convert-close-date" type="date" value={conversion.closeDate} onChange={(event) => setConversion((current) => ({ ...current, closeDate: event.target.value }))} /></div><div><Label htmlFor="convert-reason">Conversion reason</Label><Textarea id="convert-reason" minLength={12} value={conversion.reason} onChange={(event) => setConversion((current) => ({ ...current, reason: event.target.value }))} /></div></div><DialogFooter><Button variant="outline" onClick={() => setConvertLead(null)}>Cancel</Button><Button disabled={!convertLead || !conversion.stageId || conversion.name.trim().length < 3 || conversion.reason.trim().length < 12 || leadConversion.isPending} onClick={async () => { if (!convertLead) return; try { await leadConversion.mutateAsync({ leadId: convertLead.id, idempotencyKey: crypto.randomUUID(), payload: { version: convertLead.version, stage_id: conversion.stageId, opportunity_name: conversion.name.trim(), amount: Number(conversion.amount), close_date: conversion.closeDate ? new Date(conversion.closeDate).toISOString() : null, reason: conversion.reason.trim() } }); toast.success("Lead converted to opportunity."); setConvertLead(null); } catch (error) { toast.error(error instanceof Error ? error.message : "Lead conversion failed."); } }}>{leadConversion.isPending ? "Converting..." : "Convert lead"}</Button></DialogFooter></DialogContent>
      </Dialog>
    </PageContainer>
  );
}
