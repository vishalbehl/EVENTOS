"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { 
  useQuoteDetail, useQuoteRevisions, useCreateQuoteRevision 
} from "@/services/super-admin-service"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { 
  ArrowLeft, Plus, GitMerge, FileText, CheckCircle2, 
  ChevronRight, Calendar, User, ArrowDown, ArrowUp 
} from "lucide-react"
import { formatIST, formatLakhRupee } from "@/lib/formatters"
import { toast } from "sonner"

export default function QuoteRevisionsPage() {
  const router = useRouter()
  const params = useParams()
  const quoteId = params.id as string

  // Fetch API
  const { data: quote } = useQuoteDetail(quoteId)
  const { data: revisions = [], refetch: refetchRevisions } = useQuoteRevisions(quoteId)
  const createRevisionMutation = useCreateQuoteRevision(quoteId)

  // Version selection
  const [selectedVerId, setSelectedVerId] = useState<string>("")
  const [verX, setVerX] = useState<string>("")
  const [verY, setVerY] = useState<string>("")
  const [compareMode, setCompareMode] = useState(false)

  // New Revision Notes State
  const [noteInput, setNoteInput] = useState("")

  const activeRevision = revisions.find((r: any) => r.id === selectedVerId) || revisions[0]

  const handleCreateRevision = async () => {
    await createRevisionMutation.mutateAsync({
      notes: [noteInput || "Regular quota adjustment revision."]
    })
    setNoteInput("")
    refetchRevisions()
  }

  // Mock comparison list mapping category costs
  const comparisonData = [
    { category: "Hardware", valX: 120000, valY: 105000 },
    { category: "Staffing", valX: 80000, valY: 95000 },
    { category: "Logistics", valX: 15000, valY: 15000 }
  ]

  return (
    <PageContainer>
      {/* Header bar */}
      <div className="flex flex-col gap-3 mb-6">
        <div className="flex items-center gap-2 text-xs text-tertiary">
          <span className="hover:text-primary cursor-pointer" onClick={() => router.push("/service-requests")}>Service Requests</span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-primary font-extrabold uppercase tracking-wide">{quote?.quote_number || "QTE-..."}</span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-primary font-extrabold uppercase tracking-wide">Revisions</span>
        </div>

        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h1 className="text-xl font-black text-primary flex items-center gap-2">
              <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              Quote Revision Manager
            </h1>
            <p className="text-[10px] text-tertiary">Trace quotations version progression and audit category deltas</p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => setCompareMode(!compareMode)}
              variant="outline"
              size="sm"
              className={`text-xs h-9 gap-1 text-secondary border-border bg-surface-2 ${compareMode ? "border-brand-primary" : ""}`}
            >
              <GitMerge className="h-3.5 w-3.5" /> Compare Revisions
            </Button>
            <Button
              onClick={handleCreateRevision}
              className="bg-brand-primary text-white text-xs font-bold h-9 px-4 rounded-xl"
            >
              <Plus className="h-3.5 w-3.5" /> Create Revision
            </Button>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        
        {/* Left Panel: Vertical Version Card List */}
        <div className="xl:col-span-4 space-y-4">
          <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary block">
            Revision Versions List
          </span>

          <div className="space-y-3">
            {revisions.map((rev: any) => {
              const isActive = rev.id === selectedVerId || (!selectedVerId && rev.id === revisions[0]?.id)
              return (
                <Card
                  key={rev.id}
                  onClick={() => setSelectedVerId(rev.id)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between h-28
                    ${isActive ? "bg-[var(--bg-surface)] border-brand-primary/50 shadow-md" : "bg-surface-2 border-border/40 hover:border-brand-primary/30"}`}
                >
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-black text-primary">Version {rev.version_number}</span>
                    <Badge className="bg-success/15 border-success/30 text-success border text-[8px] font-black uppercase">
                      {rev.status || "REVISED"}
                    </Badge>
                  </div>

                  <div className="flex justify-between items-baseline pt-2">
                    <span className="text-sm font-black font-mono text-primary">{formatLakhRupee(rev.total_amount)}</span>
                    <span className="text-[9px] text-tertiary font-bold flex items-center gap-1">
                      <User className="h-3 w-3" /> Super Admin
                    </span>
                  </div>

                  <span className="text-[8px] text-tertiary block font-mono border-t border-border/20 pt-1.5 mt-1.5">
                    Created: {formatIST(rev.created_at)}
                  </span>
                </Card>
              )
            })}

            {revisions.length === 0 && (
              <span className="text-[10px] text-tertiary block text-center py-8">No previous revisions stored.</span>
            )}
          </div>
        </div>

        {/* Right Panel: Compare Revisions Mode OR Notes View */}
        <div className="xl:col-span-8 space-y-6">
          
          {compareMode ? (
            /* Compare Revisions Panel */
            <Card className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-6 space-y-6">
              <div className="flex justify-between items-center border-b border-border pb-3">
                <span className="text-xs font-bold text-primary">Revisions Cost Comparison delta</span>
                <div className="flex items-center gap-2">
                  <select
                    value={verX}
                    onChange={e => setVerX(e.target.value)}
                    className="bg-surface-2 border border-border text-xs rounded-xl px-3 py-1 text-primary outline-none"
                  >
                    <option value="">Compare Version X</option>
                    {revisions.map((r: any) => (
                      <option key={r.id} value={r.version_number}>Version {r.version_number}</option>
                    ))}
                  </select>
                  <span className="text-xs text-tertiary font-bold">vs</span>
                  <select
                    value={verY}
                    onChange={e => setVerY(e.target.value)}
                    className="bg-surface-2 border border-border text-xs rounded-xl px-3 py-1 text-primary outline-none"
                  >
                    <option value="">Compare Version Y</option>
                    {revisions.map((r: any) => (
                      <option key={r.id} value={r.version_number}>Version {r.version_number}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Comparison table */}
              <div className="overflow-hidden border border-border/40 rounded-2xl text-xs font-semibold text-secondary">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-2 border-b border-border text-secondary text-[10px]">
                      <th className="p-3">Category</th>
                      <th className="p-3 text-right">Ver {verX || "X"} (INR)</th>
                      <th className="p-3 text-right">Ver {verY || "Y"} (INR)</th>
                      <th className="p-3 text-right">Difference</th>
                      <th className="p-3 text-center">Change %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonData.map((item, idx) => {
                      const diff = item.valY - item.valX
                      const pct = item.valX > 0 ? (diff / item.valX) * 100 : 0
                      const isIncrease = diff > 0
                      return (
                        <tr key={idx} className="border-b border-border/20 text-secondary hover:bg-surface-hover/10">
                          <td className="p-3 text-primary">{item.category}</td>
                          <td className="p-3 text-right font-mono text-tertiary">₹{item.valX.toLocaleString()}</td>
                          <td className="p-3 text-right font-mono text-primary">₹{item.valY.toLocaleString()}</td>
                          <td className={`p-3 text-right font-mono font-bold ${isIncrease ? "text-danger" : "text-success"}`}>
                            {isIncrease ? "+" : ""}₹{diff.toLocaleString()}
                          </td>
                          <td className="p-3 text-center">
                            <Badge className={`text-[8px] font-black border ${isIncrease ? "bg-danger/10 text-danger border-danger/20" : "bg-success/10 text-success border-success/20"}`}>
                              {isIncrease ? <ArrowUp className="h-2.5 w-2.5 inline mr-0.5" /> : <ArrowDown className="h-2.5 w-2.5 inline mr-0.5" />}
                              {Math.abs(pct).toFixed(1)}%
                            </Badge>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : (
            /* Selected Version Detail: Notes & Inputs */
            <div className="space-y-6">
              
              {/* Revision Notes List */}
              <Card className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-5 space-y-4">
                <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary block border-b border-border/40 pb-2">
                  Revision Changelog Notes: Version {activeRevision?.version_number}
                </span>

                <div className="space-y-2">
                  {activeRevision?.notes?.map((note: string, idx: number) => (
                    <div key={idx} className="flex gap-2 items-start text-xs font-semibold text-secondary">
                      <FileText className="h-4 w-4 text-brand-primary shrink-0 mt-0.5" />
                      <span>{note}</span>
                    </div>
                  ))}
                  {(!activeRevision?.notes || activeRevision?.notes?.length === 0) && (
                    <span className="text-[9px] text-tertiary block">No notes configured for this version revision.</span>
                  )}
                </div>
              </Card>

              {/* Create new revision notes editor */}
              <Card className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-5 space-y-3">
                <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary block">
                  Add Revision Notes
                </span>
                <textarea
                  value={noteInput}
                  onChange={e => setNoteInput(e.target.value)}
                  placeholder="Summarize changes for the new version revision..."
                  className="w-full h-20 bg-surface-2 border border-border rounded-2xl p-3 text-xs text-primary outline-none focus:border-brand-primary"
                />
              </Card>

            </div>
          )}

        </div>

      </div>

      {/* Revision History Timeline (Bottom) */}
      <Card className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-6 mt-8">
        <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary block mb-4 border-b border-border/40 pb-2">
          Revision Dispatch Timeline History
        </span>

        <div className="space-y-5">
          {revisions.map((rev: any, idx: number) => (
            <div key={idx} className="flex gap-3 text-xs font-semibold text-secondary relative items-start">
              {idx < revisions.length - 1 && (
                <div className="absolute left-[13px] top-[26px] bottom-[-26px] w-[2px] bg-border/40" />
              )}
              <div className="h-7 w-7 rounded-full bg-brand-primary/10 border border-brand-primary/20 text-brand-primary flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <div className="space-y-1">
                <p className="text-primary font-bold">
                  Version {rev.version_number} generated to status '{rev.status || "REVISED"}'
                </p>
                <span className="text-[9px] text-tertiary block font-mono">
                  {formatIST(rev.created_at)} — Super Admin
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </PageContainer>
  )
}
