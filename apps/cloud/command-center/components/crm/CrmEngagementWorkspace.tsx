"use client";

import { useState } from "react";
import { Archive, CheckCircle2, FileText, History, Pencil, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDestructiveAction } from "@/components/super-admin/ui/ConfirmDestructiveAction";
import { EmptyState } from "@/components/super-admin/ui/EmptyState";
import { TableSkeleton } from "@/components/super-admin/ui/LoadingSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  type CRMEngagementRecord,
  type CRMEngagementType,
  type CRMEntityType,
  type CRMResourceType,
  type CRMSupportScope,
  useCrmEngagements,
  useCrmMutation,
} from "@/hooks/useCRM";

export interface CrmEntityTarget {
  type: CRMEntityType;
  id: string;
  label: string;
}

interface EngagementForm {
  entityKey: string;
  title: string;
  detail: string;
  activityType: "CALL" | "EMAIL" | "MEETING" | "DEMO" | "FOLLOW_UP" | "OTHER";
  taskStatus: "NOT_STARTED" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED" | "CANCELLED";
  occurredAt: string;
  dueDate: string;
  reason: string;
}

const EMPTY_FORM: EngagementForm = {
  entityKey: "",
  title: "",
  detail: "",
  activityType: "FOLLOW_UP",
  taskStatus: "NOT_STARTED",
  occurredAt: "",
  dueDate: "",
  reason: "",
};

const PATH_LABEL: Record<CRMEngagementType, string> = {
  activity: "Activity",
  task: "Task",
  note: "Note",
};

function isActivity(record: CRMEngagementRecord): record is Extract<CRMEngagementRecord, { activity_type: string }> {
  return "activity_type" in record;
}

function isTask(record: CRMEngagementRecord): record is Extract<CRMEngagementRecord, { subject: string }> {
  return "subject" in record;
}

function recordTitle(record: CRMEngagementRecord) {
  if (isTask(record)) return record.subject;
  if (isActivity(record)) return `${record.activity_type}: ${record.description || "No description"}`;
  return record.content;
}

function toLocalDateTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function CrmEngagementWorkspace({ scope, targets }: { scope: CRMSupportScope; targets: CrmEntityTarget[] }) {
  const [activeType, setActiveType] = useState<CRMEngagementType>("activity");
  const [editing, setEditing] = useState<CRMEngagementRecord | null>(null);
  const [form, setForm] = useState<EngagementForm>(EMPTY_FORM);
  const [lifecycleTarget, setLifecycleTarget] = useState<CRMEngagementRecord | null>(null);

  const activityQuery = useCrmEngagements(scope, "activity");
  const taskQuery = useCrmEngagements(scope, "task");
  const noteQuery = useCrmEngagements(scope, "note");
  const queries = { activity: activityQuery, task: taskQuery, note: noteQuery };
  const activeQuery = queries[activeType];
  const records = activeQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const mutation = useCrmMutation(scope, activeType);

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      entityKey: targets[0] ? `${targets[0].type}:${targets[0].id}` : "",
      occurredAt: toLocalDateTime(new Date().toISOString()),
    });
  };

  const openEdit = (record: CRMEngagementRecord) => {
    setEditing(record);
    setForm({
      entityKey: `${record.entity_type}:${record.entity_id}`,
      title: isTask(record) ? record.subject : "",
      detail: isActivity(record) ? record.description ?? "" : isTask(record) ? "" : record.content,
      activityType: isActivity(record) ? record.activity_type : "FOLLOW_UP",
      taskStatus: isTask(record) ? record.status : "NOT_STARTED",
      occurredAt: isActivity(record) ? toLocalDateTime(record.occurred_at) : "",
      dueDate: isTask(record) ? toLocalDateTime(record.due_date) : "",
      reason: "",
    });
  };

  const closeEditor = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  const submit = async () => {
    const [entityType, entityId] = form.entityKey.split(":") as [CRMEntityType, string];
    const base = editing ? { version: editing.version } : { entity_type: entityType, entity_id: entityId };
    const payload = activeType === "activity"
      ? { ...base, activity_type: form.activityType, description: form.detail || null, occurred_at: new Date(form.occurredAt).toISOString(), reason: form.reason.trim() }
      : activeType === "task"
        ? { ...base, subject: form.title.trim(), due_date: form.dueDate ? new Date(form.dueDate).toISOString() : null, status: form.taskStatus, reason: form.reason.trim() }
        : { ...base, content: form.detail.trim(), reason: form.reason.trim() };
    try {
      await mutation.mutateAsync({
        action: editing ? "update" : "create",
        recordId: editing?.id,
        payload,
        idempotencyKey: crypto.randomUUID(),
      });
      toast.success(`${PATH_LABEL[activeType]} ${editing ? "updated" : "created"}.`);
      closeEditor();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `${PATH_LABEL[activeType]} could not be saved.`);
    }
  };

  const confirmLifecycle = async (reason?: string) => {
    if (!lifecycleTarget || !reason) return;
    const resourceType = (isActivity(lifecycleTarget) ? "activity" : isTask(lifecycleTarget) ? "task" : "note") as CRMResourceType;
    try {
      await applyLifecycle(resourceType, lifecycleTarget, reason);
      setLifecycleTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lifecycle change failed.");
    }
  };

  const applyLifecycle = async (resourceType: CRMResourceType, record: CRMEngagementRecord, reason: string) => {
    if (resourceType !== activeType) throw new Error("The active engagement type changed. Reopen the lifecycle action.");
    await mutation.mutateAsync({
      action: record.archived_at ? "restore" : "archive",
      recordId: record.id,
      payload: { version: record.version, reason },
      idempotencyKey: crypto.randomUUID(),
    });
    toast.success(`${PATH_LABEL[activeType]} ${record.archived_at ? "restored" : "archived"}.`);
  };

  const editorOpen = form.entityKey !== "";
  const formValid = form.reason.trim().length >= 12 && (
    activeType === "activity" ? Boolean(form.occurredAt) : activeType === "task" ? form.title.trim().length >= 3 : form.detail.trim().length > 0
  );

  return (
    <section className="mt-10 rounded-3xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--brand-primary)]">Engagement ledger</p>
          <h2 className="mt-1 text-lg font-bold text-[var(--text-primary)]">Activities, tasks, and notes</h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">Versioned tenant records linked to an organization or active CRM entity.</p>
        </div>
        <Button size="sm" className="gap-2" disabled={!scope.organizationId || targets.length === 0} onClick={openCreate}>
          <Plus className="size-3.5" />Create {PATH_LABEL[activeType].toLowerCase()}
        </Button>
      </div>

      <Tabs value={activeType} onValueChange={(value) => setActiveType(value as CRMEngagementType)}>
        <TabsList className="mb-4">
          <TabsTrigger value="activity"><History className="mr-2 size-3.5" />Activities</TabsTrigger>
          <TabsTrigger value="task"><CheckCircle2 className="mr-2 size-3.5" />Tasks</TabsTrigger>
          <TabsTrigger value="note"><FileText className="mr-2 size-3.5" />Notes</TabsTrigger>
        </TabsList>
      </Tabs>

      {activeQuery.isLoading ? <TableSkeleton rows={4} cols={5} /> : records.length === 0 ? (
        <EmptyState title={`No ${PATH_LABEL[activeType].toLowerCase()} records`} description="Create the first audited CRM engagement record for this tenant." />
      ) : (
        <div className="space-y-2">
          {records.map((record) => (
            <article key={record.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] p-4 ${record.archived_at ? "opacity-60" : ""}`}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-[9px] uppercase">{record.entity_type}</Badge>
                  {isTask(record) ? <Badge variant="outline" className="text-[9px] uppercase">{record.status}</Badge> : null}
                  {record.archived_at ? <Badge className="bg-amber-500/10 text-amber-300">Archived</Badge> : null}
                </div>
                <p className="mt-2 truncate text-sm font-semibold text-[var(--text-primary)]">{recordTitle(record)}</p>
                <p className="mt-1 font-mono text-[10px] text-[var(--text-tertiary)]">{record.entity_id} · v{record.version}</p>
              </div>
              <div className="flex gap-1">
                {!record.archived_at ? <Button variant="ghost" size="icon" aria-label={`Edit ${PATH_LABEL[activeType]}`} onClick={() => openEdit(record)}><Pencil className="size-4" /></Button> : null}
                <Button variant="ghost" size="icon" aria-label={`${record.archived_at ? "Restore" : "Archive"} ${PATH_LABEL[activeType]}`} onClick={() => setLifecycleTarget(record)}>
                  {record.archived_at ? <RotateCcw className="size-4 text-emerald-300" /> : <Archive className="size-4 text-amber-300" />}
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      {activeQuery.hasNextPage ? <div className="mt-4 text-center"><Button variant="outline" size="sm" onClick={() => void activeQuery.fetchNextPage()} disabled={activeQuery.isFetchingNextPage}>{activeQuery.isFetchingNextPage ? "Loading..." : "Load more"}</Button></div> : null}

      <Dialog open={editorOpen} onOpenChange={(open) => !open && closeEditor()}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Update" : "Create"} {PATH_LABEL[activeType].toLowerCase()}</DialogTitle><DialogDescription>Changes are tenant-scoped, versioned, idempotent, and audited.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div><Label htmlFor="crm-engagement-target">Linked record</Label><select id="crm-engagement-target" disabled={Boolean(editing)} value={form.entityKey} onChange={(event) => setForm((current) => ({ ...current, entityKey: event.target.value }))} className="mt-1 h-10 w-full rounded-md border border-border bg-surface-2 px-3 text-sm">{targets.map((target) => <option key={`${target.type}:${target.id}`} value={`${target.type}:${target.id}`}>{target.label}</option>)}</select></div>
            {activeType === "activity" ? <><div><Label htmlFor="crm-activity-type">Activity type</Label><select id="crm-activity-type" value={form.activityType} onChange={(event) => setForm((current) => ({ ...current, activityType: event.target.value as EngagementForm["activityType"] }))} className="mt-1 h-10 w-full rounded-md border border-border bg-surface-2 px-3 text-sm">{["CALL", "EMAIL", "MEETING", "DEMO", "FOLLOW_UP", "OTHER"].map((value) => <option key={value}>{value}</option>)}</select></div><div><Label htmlFor="crm-occurred-at">Occurred at</Label><Input id="crm-occurred-at" type="datetime-local" value={form.occurredAt} onChange={(event) => setForm((current) => ({ ...current, occurredAt: event.target.value }))} /></div><div><Label htmlFor="crm-activity-detail">Description</Label><Textarea id="crm-activity-detail" value={form.detail} onChange={(event) => setForm((current) => ({ ...current, detail: event.target.value }))} /></div></> : null}
            {activeType === "task" ? <><div><Label htmlFor="crm-task-subject">Subject</Label><Input id="crm-task-subject" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></div><div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="crm-task-status">Status</Label><select id="crm-task-status" value={form.taskStatus} onChange={(event) => setForm((current) => ({ ...current, taskStatus: event.target.value as EngagementForm["taskStatus"] }))} className="mt-1 h-10 w-full rounded-md border border-border bg-surface-2 px-3 text-sm">{["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"].map((value) => <option key={value}>{value}</option>)}</select></div><div><Label htmlFor="crm-task-due">Due date</Label><Input id="crm-task-due" type="datetime-local" value={form.dueDate} onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))} /></div></div></> : null}
            {activeType === "note" ? <div><Label htmlFor="crm-note-content">Note</Label><Textarea id="crm-note-content" className="min-h-32" value={form.detail} onChange={(event) => setForm((current) => ({ ...current, detail: event.target.value }))} /></div> : null}
            <div><Label htmlFor="crm-engagement-reason">Audit reason</Label><Textarea id="crm-engagement-reason" minLength={12} value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={closeEditor}>Cancel</Button><Button onClick={() => void submit()} disabled={!formValid || mutation.isPending}>{mutation.isPending ? "Saving..." : "Save record"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDestructiveAction
        open={Boolean(lifecycleTarget)}
        onOpenChange={(open) => !open && setLifecycleTarget(null)}
        title={lifecycleTarget?.archived_at ? "Restore engagement record" : "Archive engagement record"}
        description="The server verifies tenant ownership and optimistic version before applying this audited lifecycle change."
        resourceName={lifecycleTarget ? recordTitle(lifecycleTarget) : undefined}
        confirmLabel={lifecycleTarget?.archived_at ? "Restore record" : "Archive record"}
        requireReason
        minimumReasonLength={12}
        destructive={!lifecycleTarget?.archived_at}
        pending={mutation.isPending}
        onConfirm={confirmLifecycle}
      />
    </section>
  );
}
