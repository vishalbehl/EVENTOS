"use client";

import { useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { OperationalRisk, useOperationalRisks, useOperationsProjects, useRiskMutation } from "@/services/super-admin-service";

type ReviewAction = "resolve" | "accept" | "actions" | "comments" | "evidence";

export default function RiskAnalysisPage() {
  const [selected, setSelected] = useState<OperationalRisk | null>(null);
  const [reason, setReason] = useState("");
  const [reviewAction, setReviewAction] = useState<ReviewAction>("resolve");
  const [detail, setDetail] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [assetId, setAssetId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState("MEDIUM");
  const [createReason, setCreateReason] = useState("");
  const query = useOperationalRisks({ limit: 100 });
  const projects = useOperationsProjects();
  const mutation = useRiskMutation();

  const resetReview = () => {
    setSelected(null); setReason(""); setDetail(""); setAssignedTo(""); setAssetId("");
  };

  const applyReview = async () => {
    if (!selected) return;
    if (reviewAction !== "comments" && reason.trim().length < 12) return toast.error("Enter a reason of at least 12 characters.");
    if (["actions", "comments"].includes(reviewAction) && detail.trim().length < 3) return toast.error("Enter the action or comment details.");
    if (reviewAction === "actions" && !assignedTo) return toast.error("Enter an assigned user ID.");
    if (reviewAction === "evidence" && !assetId) return toast.error("Enter a READY evidence asset ID.");
    const body = reviewAction === "actions"
      ? { organization_id: selected.organization_id, action_description: detail, assigned_to: assignedTo, reason }
      : reviewAction === "comments"
        ? { organization_id: selected.organization_id, comment: detail }
        : reviewAction === "evidence"
          ? { organization_id: selected.organization_id, asset_id: assetId, description: detail || null, reason }
          : { organization_id: selected.organization_id, version: selected.version, reason };
    try {
      await mutation.mutateAsync({ id: selected.id, action: reviewAction, body, idempotencyKey: crypto.randomUUID() });
      toast.success("Risk record updated"); resetReview();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Risk update failed"); }
  };

  return <PageContainer>
    <SectionHeader title="Operational Risk Register" description="Durable event risk ownership, mitigation, acceptance, resolution, and evidence." breadcrumb={["Console", "Operations", "Risk Analysis"]} actions={<Button variant="outline" size="sm" onClick={() => query.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>} />
    <Card className="mb-5 p-5"><h2 className="font-bold text-primary">Record operational risk</h2><div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><select aria-label="Risk project" value={projectId} onChange={event => setProjectId(event.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"><option value="">Select project</option>{projects.data?.items.map(project => <option key={project.id} value={project.id}>{project.name} ({project.project_code})</option>)}</select><input aria-label="Risk title" value={title} onChange={event => setTitle(event.target.value)} placeholder="Risk title" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" /><select aria-label="Risk severity" value={severity} onChange={event => setSeverity(event.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map(value => <option key={value}>{value}</option>)}</select><input aria-label="Risk creation reason" value={createReason} onChange={event => setCreateReason(event.target.value)} placeholder="Administrative reason" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" /></div><Button className="mt-3" disabled={!projectId || title.trim().length < 3 || createReason.trim().length < 12 || mutation.isPending} onClick={async () => { const project = projects.data?.items.find(item => item.id === projectId); if (!project) return; try { await mutation.mutateAsync({ action: "create", body: { organization_id: project.organization_id, project_id: project.id, title, severity, probability: "MEDIUM", reason: createReason } }); toast.success("Risk recorded"); setTitle(""); setCreateReason(""); } catch (error) { toast.error(error instanceof Error ? error.message : "Risk creation failed"); } }}>Create risk</Button></Card>
    {query.isError ? <Card className="border-danger/30 p-6"><AlertTriangle className="h-5 w-5 text-danger" /> Risk register unavailable.</Card> : <div className="grid gap-4 xl:grid-cols-2">{query.data?.items.map(risk => <Card key={risk.id} className="p-5"><div className="flex justify-between"><div><p className="text-xs font-bold uppercase text-tertiary">{risk.category || "Operational risk"}</p><h2 className="mt-1 font-black text-primary">{risk.title}</h2></div><span className={risk.severity === "CRITICAL" || risk.severity === "HIGH" ? "text-danger" : "text-warning"}>{risk.severity}</span></div><p className="mt-3 text-sm text-secondary">{risk.description || risk.impact || "No description provided."}</p><div className="mt-4 flex items-center justify-between text-xs"><span>{risk.status} | {risk.probability} probability</span>{!["RESOLVED", "CLOSED"].includes(risk.status) && <Button size="sm" variant="outline" onClick={() => setSelected(risk)}>Review</Button>}</div></Card>)}{!query.isLoading && !query.data?.items.length && <Card className="p-10 text-center text-secondary">No operational risks recorded.</Card>}</div>}
    {selected && <Card className="mt-5 p-5"><h2 className="font-bold">Manage {selected.title}</h2><div className="mt-3 grid gap-3 md:grid-cols-2"><select aria-label="Risk management action" value={reviewAction} onChange={event => setReviewAction(event.target.value as ReviewAction)} className="rounded-lg border border-border bg-surface px-3 py-2"><option value="resolve">Resolve</option><option value="accept">Accept risk</option><option value="actions">Add mitigation action</option><option value="comments">Add comment</option><option value="evidence">Attach evidence</option></select>{reviewAction === "actions" && <input aria-label="Risk action assignee" value={assignedTo} onChange={event => setAssignedTo(event.target.value)} placeholder="Assigned user UUID" className="rounded-lg border border-border bg-surface px-3 py-2" />}{reviewAction === "evidence" && <input aria-label="Risk evidence asset" value={assetId} onChange={event => setAssetId(event.target.value)} placeholder="READY asset UUID" className="rounded-lg border border-border bg-surface px-3 py-2" />}</div>{["actions", "comments", "evidence"].includes(reviewAction) && <textarea aria-label="Risk supporting detail" value={detail} onChange={event => setDetail(event.target.value)} className="mt-3 min-h-20 w-full rounded-lg border border-border bg-surface p-3" placeholder={reviewAction === "actions" ? "Mitigation action" : reviewAction === "comments" ? "Internal comment" : "Evidence description"} />}{reviewAction !== "comments" && <textarea aria-label="Risk administrative reason" value={reason} onChange={event => setReason(event.target.value)} className="mt-3 min-h-20 w-full rounded-lg border border-border bg-surface p-3" placeholder="Administrative reason and supporting context" />}<div className="mt-3 flex gap-2"><Button onClick={applyReview} disabled={mutation.isPending}>Apply action</Button><Button variant="outline" onClick={resetReview}>Cancel</Button></div></Card>}
  </PageContainer>;
}
