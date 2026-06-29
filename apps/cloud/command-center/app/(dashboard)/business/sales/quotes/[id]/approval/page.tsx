"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { 
  useQuoteDetail, useQuoteApproval, useActionApprovalStep 
} from "@/services/super-admin-service"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { 
  ArrowLeft, FileText, CheckCircle2, ChevronRight, Clock, 
  User, Check, X, ShieldAlert, Send, Eye 
} from "lucide-react"
import { formatIST } from "@/lib/formatters"
import { toast } from "sonner"

export default function QuoteApprovalPage() {
  const router = useRouter()
  const params = useParams()
  const quoteId = params.id as string

  // Fetch API
  const { data: quote } = useQuoteDetail(quoteId)
  const { data: approvalData, refetch: refetchApproval } = useQuoteApproval(quoteId)
  const actionStepMutation = useActionApprovalStep(quoteId)

  // Rejection Modal state
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectStepId, setRejectStepId] = useState("")
  const [rejectionComment, setRejectionComment] = useState("")

  if (!approvalData) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <p className="text-zinc-500 text-xs font-black uppercase tracking-widest animate-pulse">Loading Approval workflow...</p>
      </div>
    )
  }

  const { workflow, steps = [], comments = [] } = approvalData

  // Approve action handler
  const handleApprove = async (stepId: string) => {
    await actionStepMutation.mutateAsync({
      stepId,
      action: "APPROVE",
      comment: "Standard verification completed successfully."
    })
    refetchApproval()
  }

  // Reject action handler
  const handleRejectTrigger = (stepId: string) => {
    setRejectStepId(stepId)
    setRejectionComment("")
    setShowRejectModal(true)
  }

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!rejectionComment.trim()) {
      toast.error("Rejection comment is mandatory!")
      return
    }

    await actionStepMutation.mutateAsync({
      stepId: rejectStepId,
      action: "REJECT",
      comment: rejectionComment
    })

    setShowRejectModal(false)
    refetchApproval()
  }

  // Stakeholders list
  const stakeholders = [
    { name: "Super Admin", role: "Owner", status: "COMPLETED" },
    { name: "Neha Kapoor", role: "Finance Approver", status: "PENDING" },
    { name: "Vikram Malhotra", role: "Commercial Lead", status: "NOT_STARTED" }
  ]

  return (
    <PageContainer>
      {/* Header bar */}
      <div className="flex flex-col gap-3 mb-6">
        <div className="flex items-center gap-2 text-xs text-tertiary">
          <span className="hover:text-primary cursor-pointer" onClick={() => router.push("/service-requests")}>Service Requests</span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-primary font-extrabold uppercase tracking-wide font-mono">{quote?.quote_number || "QTE-..."}</span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-primary font-extrabold uppercase tracking-wide">Approval Workflow</span>
        </div>

        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h1 className="text-xl font-black text-primary flex items-center gap-2">
              <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              Approval Workflow Timeline
            </h1>
            <p className="text-[10px] text-tertiary">Track internal checks, legal limits review and B2B client sign-offs</p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => router.push(`/quotes/${quoteId}/cost-breakdown`)}
              variant="outline"
              size="sm"
              className="text-xs h-9 gap-1 text-secondary border-border bg-surface-2"
            >
              <Eye className="h-3.5 w-3.5" /> View Quote
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-9 gap-1 text-secondary border-border bg-surface-2"
            >
              <Send className="h-3.5 w-3.5" /> Export Workflow
            </Button>
          </div>
        </div>
      </div>

      {/* Main Two-Column grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        
        {/* Left Column: Approval Steps Vertical Timeline */}
        <div className="xl:col-span-8 space-y-4">
          <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary block">
            Approval Steps Sequence
          </span>

          <div className="space-y-4">
            {steps.map((step: any, idx: number) => {
              const isCompleted = step.status === "APPROVED" || step.status === "COMPLETED"
              const isPending = step.status === "PENDING"
              const isRejected = step.status === "REJECTED"
              
              const statusBadgeColor = 
                isCompleted ? "bg-success/15 border-success/30 text-success" :
                isRejected ? "bg-danger/15 border-danger/30 text-danger" :
                "bg-zinc-500/10 text-tertiary border-border"

              return (
                <Card key={step.id} className={`p-5 rounded-3xl border flex gap-4 items-start relative
                  ${isPending ? "bg-[var(--bg-surface)] border-brand-primary shadow-sm" : "bg-surface-2/40 border-border/40"}`}>
                  
                  {idx < steps.length - 1 && (
                    <div className="absolute left-[31px] top-[48px] bottom-[-24px] w-[2px] bg-border/40" />
                  )}

                  <div className={`h-8 w-8 rounded-full border flex items-center justify-center text-xs font-black shrink-0
                    ${isCompleted ? "bg-success border-success text-white" : 
                      isRejected ? "bg-danger border-danger text-white" : 
                      isPending ? "bg-brand-primary border-brand-primary text-white scale-105" : 
                      "bg-surface-2 border-border text-tertiary"}`}>
                    {idx + 1}
                  </div>

                  <div className="flex-1 space-y-3.5">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <h4 className="text-xs font-black text-primary">{step.step_name}</h4>
                        <span className="text-[9px] text-tertiary block font-semibold">Assigned: {step.assigned_to_name}</span>
                      </div>
                      <Badge className={`text-[8px] border font-black uppercase tracking-wider ${statusBadgeColor}`}>
                        {step.status}
                      </Badge>
                    </div>

                    {/* Pending Action Buttons */}
                    {isPending && (
                      <div className="flex items-center gap-2 pt-1">
                        <Button 
                          onClick={() => handleApprove(step.id)} 
                          className="bg-success text-white text-[10px] font-bold h-7 gap-1 px-3.5 hover:bg-success/90"
                        >
                          <Check className="h-3.5 w-3.5" /> Approve Step
                        </Button>
                        <Button 
                          onClick={() => handleRejectTrigger(step.id)} 
                          variant="outline" 
                          className="border-danger/30 text-danger bg-danger/5 hover:bg-danger/10 text-[10px] font-bold h-7 gap-1 px-3.5"
                        >
                          <X className="h-3.5 w-3.5" /> Reject Step
                        </Button>
                      </div>
                    )}

                    {step.actioned_at && (
                      <span className="text-[8px] text-tertiary block font-mono font-medium">
                        Actioned: {formatIST(step.actioned_at)}
                      </span>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        </div>

        {/* Right Column: Workflow Summary, Stakeholders, and Comments */}
        <div className="xl:col-span-4 space-y-6">
          
          {/* Summary Panel */}
          <Card className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-5 space-y-4">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary block border-b border-border/40 pb-2">
              Workflow Status Summary
            </span>

            <div className="space-y-3 text-xs text-secondary font-semibold">
              <div className="flex justify-between"><span>Current Step:</span> <span className="text-primary font-bold">{workflow.current_step}</span></div>
              <div className="flex justify-between"><span>Overall Status:</span> <Badge className="bg-brand-primary/10 border-brand-primary/20 text-brand-primary text-[8px] uppercase tracking-wider font-black">{workflow.status}</Badge></div>
              <div className="flex justify-between"><span>Elapsed Triage:</span> <span className="font-mono text-primary flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-tertiary" /> 18 hours</span></div>
            </div>
          </Card>

          {/* Stakeholders Section */}
          <Card className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-5 space-y-4">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary block">
              Workflow Stakeholders
            </span>

            <div className="space-y-3">
              {stakeholders.map((s, idx) => (
                <div key={idx} className="flex justify-between items-center p-2 rounded-xl bg-surface-2 border border-border/40">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-brand-primary/10 border border-brand-primary/20 text-brand-primary flex items-center justify-center text-[10px] font-black uppercase">
                      {s.name[0]}
                    </div>
                    <div>
                      <span className="text-[10px] text-primary font-bold block">{s.name}</span>
                      <span className="text-[8px] text-tertiary block font-semibold">{s.role}</span>
                    </div>
                  </div>
                  <Badge className={`text-[8px] uppercase font-black ${s.status === "COMPLETED" ? "bg-success/10 text-success" : s.status === "PENDING" ? "bg-amber-500/10 text-amber-500 animate-pulse" : "bg-zinc-500/10 text-tertiary"}`}>
                    {s.status}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>

          {/* Approval Comments Section (append-only) */}
          <Card className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-5 space-y-4">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary block border-b border-border/40 pb-2">
              Approvers Comment Logs (Append-Only)
            </span>

            <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
              {comments.map((c: any, idx: number) => (
                <div key={idx} className={`p-2.5 rounded-2xl border ${c.is_rejection ? "bg-danger/5 border-danger/10" : "bg-surface-2/40 border-border/30"} space-y-1`}>
                  <div className="flex justify-between text-[8px] font-bold text-tertiary">
                    <span className="flex items-center gap-1 text-primary"><User className="h-2.5 w-2.5" /> {c.user_name} ({c.step_name})</span>
                    <span>{new Date(c.created_at).toLocaleTimeString("en-IN")}</span>
                  </div>
                  <p className="text-[10px] text-secondary leading-normal">{c.comment_text}</p>
                </div>
              ))}
              {comments.length === 0 && (
                <span className="text-[9px] text-tertiary block text-center py-6">No action comments logged.</span>
              )}
            </div>
          </Card>

        </div>

      </div>

      {/* Rejection comment Mandatory Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-6 w-full max-w-md space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-border">
              <h3 className="text-xs font-black text-danger uppercase tracking-wider flex items-center gap-1.5">
                <ShieldAlert className="h-4 w-4 text-danger animate-bounce" /> Rejection Comment Required
              </h3>
              <button onClick={() => setShowRejectModal(false)} className="text-secondary hover:text-primary">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleRejectSubmit} className="space-y-4">
              <div>
                <label className="text-[9px] uppercase tracking-wider font-extrabold text-secondary block mb-1.5">
                  Reason for Rejection *
                </label>
                <textarea
                  required
                  value={rejectionComment}
                  onChange={e => setRejectionComment(e.target.value)}
                  placeholder="Explain why the quote pricing or margins rules require adjustment..."
                  className="w-full h-24 bg-surface-2 border border-border rounded-xl p-3 text-xs text-primary outline-none focus:border-danger/60"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-border">
                <Button type="button" variant="ghost" onClick={() => setShowRejectModal(false)} className="text-xs">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!rejectionComment.trim()}
                  className="bg-danger text-white text-xs font-bold px-4 rounded-xl"
                >
                  Submit Rejection
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageContainer>
  )
}
