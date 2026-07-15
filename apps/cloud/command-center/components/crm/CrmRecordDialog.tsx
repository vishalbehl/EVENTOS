"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  type CRMAccount,
  type CRMContact,
  type CRMLead,
  type CRMOpportunity,
  type CRMPipelineStage,
  type CRMCoreResourceType,
  type CRMSupportScope,
  useCrmMutation,
} from "@/hooks/useCRM";

type CRMRecord = CRMAccount | CRMContact | CRMLead | CRMOpportunity;

interface CrmRecordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resourceType: CRMCoreResourceType;
  scope: CRMSupportScope;
  record?: CRMRecord | null;
  accounts: CRMAccount[];
  contacts: CRMContact[];
  stages: CRMPipelineStage[];
}

const labels: Record<CRMCoreResourceType, string> = {
  account: "Account",
  contact: "Contact",
  lead: "Lead",
  opportunity: "Opportunity",
};

export function CrmRecordDialog({
  open,
  onOpenChange,
  resourceType,
  scope,
  record,
  accounts,
  contacts,
  stages,
}: CrmRecordDialogProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const mutation = useCrmMutation(scope, resourceType);
  const editing = Boolean(record);

  useEffect(() => {
    if (!open) return;
    setIdempotencyKey(crypto.randomUUID());
    const value = (key: string, fallback = "") => {
      if (!record || !(key in record)) return fallback;
      return String((record as unknown as Record<string, unknown>)[key] ?? fallback);
    };
    const closeDate = value("close_date");
    setValues({
      name: value("name"),
      website: value("website"),
      industry: value("industry"),
      account_id: value("account_id"),
      first_name: value("first_name"),
      last_name: value("last_name"),
      email: value("email"),
      contact_id: value("contact_id"),
      status: value("status", "NEW"),
      source: value("source"),
      stage_id: value("stage_id"),
      amount: value("amount", "0"),
      close_date: closeDate ? closeDate.slice(0, 10) : "",
      reason: "",
    });
  }, [open, record]);

  const set = (field: string, value: string) => setValues((current) => ({ ...current, [field]: value }));
  const reasonValid = (values.reason ?? "").trim().length >= 12;

  const submit = async () => {
    const payload: Record<string, unknown> = { reason: values.reason.trim() };
    if (editing && record) payload.version = record.version;
    if (resourceType === "account") Object.assign(payload, {
      name: values.name,
      website: values.website || null,
      industry: values.industry || null,
    });
    if (resourceType === "contact") Object.assign(payload, {
      account_id: values.account_id,
      first_name: values.first_name,
      last_name: values.last_name,
      email: values.email,
    });
    if (resourceType === "lead") Object.assign(payload, {
      contact_id: values.contact_id || null,
      status: values.status,
      source: values.source || null,
    });
    if (resourceType === "opportunity") Object.assign(payload, {
      account_id: values.account_id,
      stage_id: values.stage_id,
      name: values.name,
      amount: Number(values.amount),
      close_date: values.close_date ? new Date(`${values.close_date}T00:00:00Z`).toISOString() : null,
    });
    try {
      await mutation.mutateAsync({
        action: editing ? "update" : "create",
        recordId: record?.id,
        payload,
        idempotencyKey,
      });
      toast.success(`${labels[resourceType]} ${editing ? "updated" : "created"}`);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Unable to save ${labels[resourceType].toLowerCase()}`);
    }
  };

  const field = (id: string, label: string, type = "text") => (
    <div className="space-y-1.5">
      <Label htmlFor={`crm-${id}`}>{label}</Label>
      <Input id={`crm-${id}`} type={type} value={values[id] ?? ""} onChange={(event) => set(id, event.target.value)} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-[var(--border-default)] bg-[var(--bg-surface)] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit" : "Create"} {labels[resourceType]}</DialogTitle>
          <DialogDescription>Changes are tenant-scoped, version checked, idempotent, and audited.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          {resourceType === "account" && <>{field("name", "Account name")}{field("website", "Website")}{field("industry", "Industry")}</>}
          {resourceType === "contact" && <>
            <SelectField id="account_id" label="Account" value={values.account_id} onChange={(value) => set("account_id", value)} options={accounts.map((item) => ({ value: item.id, label: item.name }))} />
            {field("first_name", "First name")}{field("last_name", "Last name")}{field("email", "Email", "email")}
          </>}
          {resourceType === "lead" && <>
            <SelectField id="contact_id" label="Contact (optional)" value={values.contact_id} onChange={(value) => set("contact_id", value)} allowEmpty options={contacts.map((item) => ({ value: item.id, label: `${item.first_name} ${item.last_name}` }))} />
            <SelectField id="status" label="Status" value={values.status} onChange={(value) => set("status", value)} options={["NEW", "CONTACTED", "QUALIFIED", "LOST"].map((value) => ({ value, label: value }))} />
            {field("source", "Source")}
          </>}
          {resourceType === "opportunity" && <>
            {field("name", "Opportunity name")}
            <SelectField id="account_id" label="Account" value={values.account_id} onChange={(value) => set("account_id", value)} options={accounts.map((item) => ({ value: item.id, label: item.name }))} />
            <SelectField id="stage_id" label="Pipeline stage" value={values.stage_id} onChange={(value) => set("stage_id", value)} options={stages.map((item) => ({ value: item.id, label: item.name }))} />
            {field("amount", "Amount", "number")}{field("close_date", "Close date", "date")}
          </>}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="crm-reason">Change reason</Label>
            <Textarea id="crm-reason" value={values.reason ?? ""} onChange={(event) => set("reason", event.target.value)} placeholder="Provide at least 12 characters for the audit record" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={mutation.isPending} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!reasonValid || mutation.isPending} onClick={() => void submit()}>{mutation.isPending ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SelectField({ id, label, value, onChange, options, allowEmpty = false }: { id: string; label: string; value?: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; allowEmpty?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`crm-${id}`}>{label}</Label>
      <select id={`crm-${id}`} value={value ?? ""} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-sm">
        <option value="">{allowEmpty ? "None" : "Select..."}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  );
}
