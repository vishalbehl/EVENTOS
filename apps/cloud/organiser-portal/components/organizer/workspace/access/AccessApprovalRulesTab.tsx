"use client";

import { type FormEvent, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePortalQueryScope } from "@/hooks/useAccessBootstrap";
import { apiClient, apiGet } from "@/lib/api-client";
import { DataTable, Panel, StatusBadge } from "../OrganiserPrimitives";
import { AccessPage } from "./shared";

type Rule = {
  id: string;
  name: string;
  domain: string;
  scope: string;
  approver_count: number;
  approver_chain: Array<{ type: string; id: string }>;
  status: string;
  version: number;
};

const blank = { name: "", domain: "registration", approverIds: "", status: "ACTIVE" };

export function AccessApprovalRulesTab() {
  const client = useQueryClient();
  const scope = usePortalQueryScope();
  const receipt = useRef<{ signature: string; key: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [form, setForm] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["organiser", ...scope, "approval-rules"],
    queryFn: () => apiGet<{ items: Rule[] }>("/organiser/access/approval-rules?page=1&page_size=100"),
  });
  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name.trim(),
        domain: form.domain,
        event_id: null,
        approver_chain: form.approverIds
          .split(",")
          .map(id => id.trim())
          .filter(Boolean)
          .map(id => ({ type: "user", id })),
        conditions: {},
        status: form.status,
      };
      const signature = JSON.stringify([scope, editing?.id, editing?.version, payload]);
      if (receipt.current?.signature !== signature) receipt.current = { signature, key: crypto.randomUUID() };
      const headers = {
        "Idempotency-Key": receipt.current.key,
        ...(editing ? { "If-Match": String(editing.version) } : {}),
      };
      return editing
        ? apiClient.put(`/organiser/access/approval-rules/${editing.id}`, payload, { headers })
        : apiClient.post("/organiser/access/approval-rules", payload, { headers });
    },
    onSuccess: async () => {
      receipt.current = null;
      await client.invalidateQueries({ queryKey: ["organiser", ...scope, "approval-rules"] });
      setOpen(false);
      setEditing(null);
      setForm(blank);
    },
    onError: (reason: any) => setError(reason?.status === 412
      ? "This approval rule changed elsewhere. Refresh before saving again."
      : reason?.message || "Approval rule could not be saved."),
  });
  const begin = (rule?: Rule) => {
    receipt.current = null;
    setEditing(rule || null);
    setError(null);
    setForm(rule ? {
      name: rule.name,
      domain: rule.domain,
      approverIds: rule.approver_chain.map(item => item.id).join(", "),
      status: rule.status,
    } : blank);
    setOpen(true);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.approverIds.trim()) {
      setError("Add at least one approver user ID.");
      return;
    }
    save.mutate();
  };

  return <AccessPage actions={<Button onClick={() => begin()}><Plus className="mr-2 h-4 w-4" />Create rule</Button>}>
    <Panel title="Approval rules" className="p-0">
      <DataTable
        columns={["Rule", "Domain", "Scope", "Approvers", "Status", "Actions"]}
        rows={(query.data?.items || []).map(rule => [
          rule.name,
          rule.domain,
          rule.scope,
          rule.approver_count,
          <StatusBadge key={rule.id} status={rule.status} />,
          <Button key={`${rule.id}-edit`} size="sm" variant="outline" onClick={() => begin(rule)}>Edit</Button>,
        ])}
        empty={query.isLoading ? "Loading approval rules..." : query.isError ? "Approval rules are unavailable." : "No approval rules are configured."}
      />
    </Panel>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <form className="space-y-5" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit approval rule" : "Create approval rule"}</DialogTitle>
            <DialogDescription>Define an ordered approval chain for registration, finance, or privileged access.</DialogDescription>
          </DialogHeader>
          <label className="block text-sm font-medium">Rule name<Input className="mt-2" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required /></label>
          <label className="block text-sm font-medium">Domain<select className="op-select mt-2 w-full" value={form.domain} onChange={event => setForm({ ...form, domain: event.target.value })}><option value="registration">Registration</option><option value="finance">Finance</option><option value="access">Privileged access</option></select></label>
          <label className="block text-sm font-medium">Approver user IDs, in order<Input className="mt-2" value={form.approverIds} onChange={event => setForm({ ...form, approverIds: event.target.value })} placeholder="UUID, UUID" required /></label>
          {error ? <p role="alert" className="text-sm text-[var(--op-danger)]">{error}</p> : null}
          <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving..." : "Save rule"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </AccessPage>;
}
