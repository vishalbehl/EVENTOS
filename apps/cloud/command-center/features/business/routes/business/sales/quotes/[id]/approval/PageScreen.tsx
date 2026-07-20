"use client"

import { useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, CheckCircle2, Clock3, FileCheck2, ShieldCheck, XCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { ConfirmDestructiveAction } from "@/components/super-admin/ui/ConfirmDestructiveAction"
import {
  useActionApprovalStep,
  useConvertQuoteToProposal,
  useQuoteApproval,
  useQuoteDetail,
  useSubmitQuoteApproval,
} from "@/services/super-admin-service"


export default function QuoteApprovalPage() {
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const organizationId = searchParams.get("organization_id") || undefined
  const quote = useQuoteDetail(params.id, organizationId)
  const approval = useQuoteApproval(params.id, organizationId)
  const submitApproval = useSubmitQuoteApproval(params.id, organizationId)
  const decideApproval = useActionApprovalStep(params.id, organizationId)
  const convertProposal = useConvertQuoteToProposal(params.id, organizationId)
  const [submissionReason, setSubmissionReason] = useState("")
  const [decisionReason, setDecisionReason] = useState("")
  const [proposalReason, setProposalReason] = useState("")
  const [submissionKey] = useState(() => `approval-submit-${crypto.randomUUID()}`)
  const [decisionKey] = useState(() => `approval-decision-${crypto.randomUUID()}`)
  const [proposalKey] = useState(() => `proposal-convert-${crypto.randomUUID()}`)

  // Step-up verification states
  const [showStepUpModal, setShowStepUpModal] = useState(false)
  const [stepUpAction, setStepUpAction] = useState<"APPROVE" | "REJECT" | null>(null)
  const [stepUpConfirmText, setStepUpConfirmText] = useState("")

  const workflow = approval.data
  const pendingStep = workflow?.steps.find(step => step.status === "PENDING")
  const loading = quote.isLoading || approval.isLoading

  const submit = () => {
    if (!quote.data || submissionReason.trim().length < 3) return
    submitApproval.mutate({
      expectedQuoteVersion: quote.data.version,
      reason: submissionReason.trim(),
      idempotencyKey: submissionKey,
    })
  }

  const decide = (action: "APPROVE" | "REJECT") => {
    if (!workflow || !pendingStep || decisionReason.trim().length < 3) return
    setStepUpAction(action)
    setStepUpConfirmText("")
    setShowStepUpModal(true)
  }

  const executeDecide = () => {
    if (!workflow || !pendingStep || !stepUpAction || decisionReason.trim().length < 3) return
    decideApproval.mutate({
      stepId: pendingStep.id,
      action: stepUpAction,
      reason: decisionReason.trim(),
      expectedWorkflowVersion: workflow.workflow_version,
      idempotencyKey: decisionKey,
    }, {
      onSuccess: () => {
        setShowStepUpModal(false)
        setStepUpAction(null)
      }
    })
  }

  const createProposal = () => {
    if (!quote.data || proposalReason.trim().length < 3) return
    convertProposal.mutate({
      expectedQuoteVersion: quote.data.version,
      reason: proposalReason.trim(),
      idempotencyKey: proposalKey,
    }, {
      onSuccess: proposal => {
        const query = organizationId ? `?organization_id=${organizationId}` : ""
        router.push(`/business/sales/proposals/${proposal.id}/preview${query}`)
      },
    })
  }

  if (loading) return <PageContainer><p className="text-sm text-secondary" role="status">Loading approval workflow...</p></PageContainer>
  if (quote.isError || approval.isError || !quote.data) return <PageContainer><p className="text-sm text-destructive" role="alert">The quote approval workflow could not be loaded.</p></PageContainer>

  const statusIcon = workflow?.status === "APPROVED" ? CheckCircle2 : workflow?.status === "REJECTED" ? XCircle : Clock3
  const StatusIcon = statusIcon

  return (
    <PageContainer>
      <div className="space-y-6">
        <header className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-3">
            <Button size="icon" variant="ghost" onClick={() => router.back()} aria-label="Go back"><ArrowLeft className="h-4 w-4" /></Button>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-primary">Commercial assurance</p>
              <h1 className="mt-1 text-2xl font-black text-primary">Quote approval</h1>
              <p className="mt-1 text-sm text-secondary">{quote.data.quote_number} / version {quote.data.version}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border bg-surface-2 px-4 py-2 text-sm font-bold text-primary">
            <StatusIcon className="h-4 w-4 text-brand-primary" />{workflow?.status || "NOT SUBMITTED"}
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <Card className="rounded-3xl border-border bg-surface p-6">
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <div><p className="text-xs font-bold uppercase tracking-wider text-tertiary">Quote total</p><p className="mt-2 text-lg font-black text-primary">{new Intl.NumberFormat("en-IN", { style: "currency", currency: quote.data.currency }).format(Number(quote.data.total_amount))}</p></div>
                <div><p className="text-xs font-bold uppercase tracking-wider text-tertiary">Quote version</p><p className="mt-2 text-lg font-black text-primary">v{quote.data.version}</p></div>
                <div><p className="text-xs font-bold uppercase tracking-wider text-tertiary">Workflow version</p><p className="mt-2 text-lg font-black text-primary">{workflow ? `v${workflow.workflow_version}` : "Not created"}</p></div>
                <div><p className="text-xs font-bold uppercase tracking-wider text-tertiary">Current state</p><p className="mt-2 text-lg font-black text-primary">{quote.data.status}</p></div>
              </div>
            </Card>

            {workflow ? (
              <Card className="rounded-3xl border-border bg-surface p-6">
                <h2 className="text-lg font-black text-primary">Approval history</h2>
                <p className="mt-1 text-sm text-secondary">Bound to quote version {workflow.quote_version}. Decisions cannot migrate to another revision.</p>
                <ol className="mt-6 space-y-4">
                  {workflow.steps.map(step => (
                    <li key={step.id} className="rounded-2xl border border-border bg-surface-2 p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div><p className="font-black text-primary">{step.step_order}. {step.name}</p><p className="mt-1 text-xs text-secondary">Required permission: {step.required_permission}</p></div>
                        <span className="text-xs font-black uppercase tracking-wider text-brand-primary">{step.status}</span>
                      </div>
                      {step.decision_reason && <p className="mt-4 border-l-2 border-brand-primary pl-3 text-sm text-secondary">{step.decision_reason}</p>}
                      {step.decided_at && <p className="mt-2 text-xs text-tertiary">Recorded {new Date(step.decided_at).toLocaleString()}</p>}
                    </li>
                  ))}
                </ol>
              </Card>
            ) : (
              <Card className="rounded-3xl border-dashed border-border bg-surface p-8">
                <Clock3 className="h-7 w-7 text-brand-primary" />
                <h2 className="mt-4 text-lg font-black text-primary">Not submitted</h2>
                <p className="mt-1 text-sm text-secondary">Submitting locks this exact quote version against further editing.</p>
              </Card>
            )}
          </div>

          <aside>
            {!workflow && quote.data.status === "DRAFT" ? (
              <Card className="rounded-3xl border-brand-primary/30 bg-brand-primary/5 p-6">
                <ShieldCheck className="h-6 w-6 text-brand-primary" />
                <h2 className="mt-3 text-lg font-black text-primary">Submit for approval</h2>
                <p className="mt-1 text-sm text-secondary">The first step is assigned to holders of <strong>quotes.approve</strong>.</p>
                <label className="mt-5 block space-y-2 text-sm font-semibold text-secondary">Submission reason<textarea className="min-h-28 w-full rounded-xl border border-border bg-surface p-3 text-primary" value={submissionReason} onChange={event => setSubmissionReason(event.target.value)} minLength={3} maxLength={500} /></label>
                <Button className="mt-4 w-full" disabled={submissionReason.trim().length < 3 || submitApproval.isPending} onClick={submit}>Submit version {quote.data.version}</Button>
              </Card>
            ) : workflow?.status === "PENDING" && pendingStep ? (
              <Card className="rounded-3xl border-brand-primary/30 bg-brand-primary/5 p-6">
                <ShieldCheck className="h-6 w-6 text-brand-primary" />
                <h2 className="mt-3 text-lg font-black text-primary">Record decision</h2>
                <p className="mt-1 text-sm text-secondary">Recent MFA assurance and <strong>{pendingStep.required_permission}</strong> are required.</p>
                <label className="mt-5 block space-y-2 text-sm font-semibold text-secondary">Decision reason<textarea className="min-h-28 w-full rounded-xl border border-border bg-surface p-3 text-primary" value={decisionReason} onChange={event => setDecisionReason(event.target.value)} minLength={3} maxLength={1000} /></label>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Button variant="destructive" disabled={decisionReason.trim().length < 3 || decideApproval.isPending} onClick={() => decide("REJECT")}><XCircle className="mr-2 h-4 w-4" />Reject</Button>
                  <Button disabled={decisionReason.trim().length < 3 || decideApproval.isPending} onClick={() => decide("APPROVE")}><CheckCircle2 className="mr-2 h-4 w-4" />Approve</Button>
                </div>
              </Card>
            ) : workflow?.status === "APPROVED" ? (
              <Card className="rounded-3xl border-brand-primary/30 bg-brand-primary/5 p-6">
                <FileCheck2 className="h-7 w-7 text-brand-primary" />
                <h2 className="mt-3 text-lg font-black text-primary">Create client proposal</h2>
                <p className="mt-1 text-sm text-secondary">Capture an immutable, client-safe snapshot of approved quote version {quote.data.version}.</p>
                <label className="mt-5 block space-y-2 text-sm font-semibold text-secondary">Conversion reason<textarea className="min-h-28 w-full rounded-xl border border-border bg-surface p-3 text-primary" value={proposalReason} onChange={event => setProposalReason(event.target.value)} minLength={3} maxLength={500} /></label>
                <Button className="mt-4 w-full" disabled={proposalReason.trim().length < 3 || convertProposal.isPending} onClick={createProposal}>
                  {convertProposal.isPending ? "Creating proposal..." : "Create immutable proposal"}
                </Button>
              </Card>
            ) : (
              <Card className="rounded-3xl border-border bg-surface p-6"><StatusIcon className="h-7 w-7 text-brand-primary" /><h2 className="mt-3 text-lg font-black text-primary">Workflow complete</h2><p className="mt-1 text-sm text-secondary">This decision is immutable. Any future commercial change requires an explicit new workflow policy.</p></Card>
            )}
          </aside>
        </div>
      </div>
      <ConfirmDestructiveAction
        open={showStepUpModal}
        onOpenChange={setShowStepUpModal}
        title={stepUpAction === "APPROVE" ? "Confirm Quote Approval?" : "Confirm Quote Rejection?"}
        description={`This action will record an official ${stepUpAction === "APPROVE" ? "approval" : "rejection"} on this quote. A security-assurance step-up confirmation is required.`}
        confirmLabel={stepUpAction === "APPROVE" ? "Confirm Approval" : "Confirm Rejection"}
        resourceName={quote.data?.quote_number}
        requireReason
        pending={decideApproval.isPending}
        onConfirm={executeDecide}
      />
    </PageContainer>
  )
}
