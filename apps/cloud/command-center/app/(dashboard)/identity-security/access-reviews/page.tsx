"use client";

import { FormEvent, useState } from "react";
import { KeyRound, Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/super-admin/ui/EmptyState";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { StatusBadge } from "@/components/super-admin/ui/StatusBadge";
import { SupportAccessScope, type SupportAccessSelection } from "@/components/super-admin/ui/SupportAccessScope";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAccessReviews, useCreateAccessReview, useDecideAccessReview } from "@/services/security-governance-service";
import { useGlobalUsers } from "@/services/super-admin-service";

export default function AccessReviewsPage() {
  const [scope, setScope] = useState<SupportAccessSelection | null>(null);
  const [targetUserId, setTargetUserId] = useState("");
  const [reviewType, setReviewType] = useState("PERIODIC");
  const [reason, setReason] = useState("");
  const [decisionReasons, setDecisionReasons] = useState<Record<string, string>>({});
  const reviews = useAccessReviews(scope);
  const create = useCreateAccessReview(scope);
  const decide = useDecideAccessReview(scope);
  const users = useGlobalUsers(
    { org_id: scope?.organizationId, limit: 200, is_active: true },
    { enabled: Boolean(scope?.organizationId) },
  );
  const rows = reviews.data?.pages.flatMap((page) => page.items) ?? [];

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await create.mutateAsync({ target_user_id: targetUserId, review_type: reviewType, reason: reason.trim(), due_in_hours: reviewType === "BREAK_GLASS" ? 4 : 168, scope_json: { requested_from: "COMMAND_CENTER" } });
      toast.success("Access review created.");
      setReason("");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Access review could not be created."); }
  }

  async function makeDecision(reviewId: string, version: number, status: "APPROVED" | "DENIED") {
    const decisionReason = decisionReasons[reviewId]?.trim() ?? "";
    if (decisionReason.length < 12) return;
    try {
      await decide.mutateAsync({ reviewId, payload: { status, reason: decisionReason, version } });
      toast.success(`Review ${status.toLowerCase()}.`);
      setDecisionReasons((current) => ({ ...current, [reviewId]: "" }));
    } catch (error) { toast.error(error instanceof Error ? error.message : "Decision failed."); }
  }

  return <PageContainer>
    <SectionHeader title="Access Reviews and Break-glass" description="Dual-control evidence for privileged access decisions. Approval never bypasses RLS or grants access automatically." breadcrumb={["Console", "Identity & Security", "Access Reviews"]} />
    <SupportAccessScope value={scope} onApply={setScope} />
    {!scope ? <EmptyState title="Select a tenant scope" description="Access review evidence is always read and changed inside one explicit organization." /> : (
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-2xl border border-border bg-surface">
          <div className="border-b border-border p-5"><h2 className="text-sm font-semibold">Review register</h2><p className="mt-1 text-xs text-[var(--text-tertiary)]">Break-glass approval requires a different privileged reviewer from the requester.</p></div>
          {!rows.length ? <EmptyState title="No access reviews" description="No governed review request exists for this tenant." className="m-5 min-h-56" /> : <div className="divide-y divide-border">{rows.map((review) => (
            <article key={review.id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 flex-1"><div className="flex items-center gap-2">{review.review_type === "BREAK_GLASS" ? <KeyRound className="size-4 text-amber-300" /> : <ShieldCheck className="size-4 text-cyan-300" />}<h3 className="text-sm font-semibold">{review.review_type.replaceAll("_", " ")}</h3><StatusBadge status={review.status} /></div><p className="mt-2 text-xs text-[var(--text-secondary)]">{review.request_reason}</p><p className="mt-2 font-mono text-[10px] text-[var(--text-tertiary)]">Target {review.target_user_id} / v{review.version}</p></div>{review.status === "OPEN" ? <div className="w-full space-y-2 sm:w-72"><Input aria-label={`Decision reason for ${review.id}`} value={decisionReasons[review.id] ?? ""} onChange={(event) => setDecisionReasons((current) => ({ ...current, [review.id]: event.target.value }))} placeholder="Independent decision reason" /><div className="flex justify-end gap-2"><Button size="sm" variant="outline" disabled={(decisionReasons[review.id]?.trim().length ?? 0) < 12} onClick={() => void makeDecision(review.id, review.version, "APPROVED")}>Approve</Button><Button size="sm" variant="destructive" disabled={(decisionReasons[review.id]?.trim().length ?? 0) < 12} onClick={() => void makeDecision(review.id, review.version, "DENIED")}>Deny</Button></div></div> : null}</div></article>
          ))}</div>}
        </section>
        <form onSubmit={submit} className="h-fit space-y-4 rounded-2xl border border-border bg-surface p-5">
          <div><h2 className="text-sm font-semibold">Create review request</h2><p className="mt-1 text-xs text-[var(--text-tertiary)]">Recent step-up authentication is required.</p></div>
          <label className="block text-xs text-[var(--text-secondary)]">Target user<Select value={targetUserId} onValueChange={setTargetUserId}><SelectTrigger className="mt-1.5"><SelectValue placeholder="Select user" /></SelectTrigger><SelectContent>{(users.data?.items ?? []).map((user) => <SelectItem key={user.id} value={user.id}>{user.first_name} {user.last_name} ({user.email})</SelectItem>)}</SelectContent></Select></label>
          <label className="block text-xs text-[var(--text-secondary)]">Review type<Select value={reviewType} onValueChange={setReviewType}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PERIODIC">Periodic review</SelectItem><SelectItem value="ROLE_CHANGE">Role change</SelectItem><SelectItem value="BREAK_GLASS">Break-glass request</SelectItem></SelectContent></Select></label>
          <label className="block text-xs text-[var(--text-secondary)]">Reason<Textarea value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1.5 min-h-24" minLength={12} required /></label>
          <Button className="w-full" type="submit" disabled={!targetUserId || reason.trim().length < 12 || create.isPending}><Plus className="mr-2 size-4" />Create review</Button>
        </form>
      </div>
    )}
  </PageContainer>;
}
