"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useProposalDetail, useCreateProposalShareLink } from "@/services/super-admin-service"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { 
  ArrowLeft, Edit, Download, Printer, ZoomIn, ZoomOut, 
  Share2, ChevronRight, FileText, LayoutGrid, Calendar, Clock, Copy 
} from "lucide-react"
import { formatIST } from "@/lib/formatters"
import { toast } from "sonner"

export default function ProposalPreviewPage() {
  const router = useRouter()
  const params = useParams()
  const propId = params.id as string

  // Fetch proposal details
  const { data: proposal, isLoading } = useProposalDetail(propId)
  const shareLinkMutation = useCreateProposalShareLink(propId)

  // Zoom / PDF states
  const [zoom, setZoom] = useState(100)
  const [page, setPage] = useState(1)
  const totalPages = 14

  // Share Dialog state
  const [showShareModal, setShowShareModal] = useState(false)
  const [expiryHours, setExpiryHours] = useState(24)
  const [copiedLink, setCopiedLink] = useState("")

  if (isLoading || !proposal) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <p className="text-zinc-500 text-xs font-black uppercase tracking-widest animate-pulse">Loading Proposal preview...</p>
      </div>
    )
  }

  // Generate public share link
  const handleGenerateShareLink = async () => {
    const res = await shareLinkMutation.mutateAsync({ expires_in_hours: expiryHours })
    if (res && res.token) {
      const link = `${window.location.origin}/proposals/share/${res.token}`
      setCopiedLink(link)
      navigator.clipboard.writeText(link)
      toast.success("Client public share link generated and copied to clipboard!")
    }
  }

  const sectionsList = [
    { name: "Executive Summary", page: 1 },
    { name: "Event Scope Requirements", page: 3 },
    { name: "Consolidated Deliverables", page: 6 },
    { name: "Commercial Quotations Sheet", page: 8 },
    { name: "Terms & Conditions SLA", page: 12 }
  ]

  return (
    <PageContainer>
      {/* Header bar */}
      <div className="flex flex-col gap-3 mb-6">
        <div className="flex items-center gap-2 text-xs text-tertiary">
          <span className="hover:text-primary cursor-pointer" onClick={() => router.push("/service-requests")}>Service Requests</span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-primary font-extrabold uppercase tracking-wide">PRP-2025-0010</span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-primary font-extrabold uppercase tracking-wide">Preview</span>
        </div>

        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h1 className="text-xl font-black text-primary flex items-center gap-2">
              <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              Proposal Document Triage Preview
            </h1>
            <p className="text-[10px] text-tertiary">In-browser document layout validation, client previews, and public sharing controls</p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => router.push(`/proposals/${propId}/edit`)}
              variant="outline"
              size="sm"
              className="text-xs h-9 gap-1 text-secondary border-border bg-surface-2"
            >
              <Edit className="h-3.5 w-3.5" /> Edit Proposal
            </Button>
            <Button
              onClick={() => setShowShareModal(true)}
              className="bg-brand-primary text-white text-xs font-bold h-9 px-4 rounded-xl"
            >
              <Share2 className="h-3.5 w-3.5" /> Share with Client
            </Button>
          </div>
        </div>
      </div>

      {/* Preview Section */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        
        {/* Left: Mock PDF Viewer */}
        <div className="xl:col-span-8 bg-zinc-950 border border-zinc-800 rounded-3xl p-4 flex gap-4 h-[560px]">
          
          {/* Page thumbnails strip on left side */}
          <div className="w-16 flex flex-col gap-2.5 overflow-y-auto pr-1 scrollbar-thin hidden md:flex border-r border-zinc-800/40 mr-2">
            {Array.from({ length: 5 }).map((_, idx) => (
              <div
                key={idx}
                onClick={() => setPage(idx + 1)}
                className={`w-full aspect-[3/4] bg-zinc-900 border text-[8px] font-black text-zinc-500 rounded-md flex items-center justify-center cursor-pointer transition-all hover:border-zinc-500
                  ${page === idx + 1 ? "border-brand-primary text-brand-primary scale-95" : "border-zinc-800"}`}
              >
                P. {idx + 1}
              </div>
            ))}
          </div>

          {/* Core Viewer Area */}
          <div className="flex-1 flex flex-col justify-between h-full">
            {/* Toolbar */}
            <div className="flex justify-between items-center bg-zinc-900 border border-zinc-800 px-3.5 py-1.5 rounded-xl text-[10px] text-zinc-400">
              <span className="font-bold">Page {page} / {totalPages}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setZoom(z => Math.max(z - 10, 50))}><ZoomOut className="h-3.5 w-3.5" /></button>
                <span className="font-mono">{zoom}%</span>
                <button onClick={() => setZoom(z => Math.min(z + 10, 200))}><ZoomIn className="h-3.5 w-3.5" /></button>
              </div>
              <div className="flex items-center gap-2">
                <button><Download className="h-3.5 w-3.5" /></button>
                <button><Printer className="h-3.5 w-3.5" /></button>
              </div>
            </div>

            {/* Rendered Mock Page Frame */}
            <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl my-4 flex items-center justify-center p-6 text-center select-none overflow-hidden relative">
              <div className="space-y-4 max-w-sm" style={{ transform: `scale(${zoom / 100})` }}>
                <FileText className="h-10 w-10 text-brand-primary mx-auto animate-pulse" />
                <h3 className="text-sm font-black text-white uppercase tracking-wider">Proposal Document Cover page</h3>
                <p className="text-[9px] text-zinc-500 leading-normal">
                  Auto-compiled standard corporate PDF layout. Integrated styles: purple margin accent, responsive tables.
                </p>
                <Badge className="bg-brand-primary/10 border-brand-primary/20 text-brand-primary border text-[8px] uppercase tracking-widest">
                  Preview Mode
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Document Details Panel */}
        <div className="xl:col-span-4 space-y-6">
          <Card className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-5 space-y-4">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary block border-b border-border/40 pb-2">
              Document details
            </span>

            <div className="space-y-3.5 text-xs text-secondary font-semibold">
              <div className="flex justify-between"><span>Proposal ID:</span> <span className="text-primary font-mono">{proposal.proposal_number || "PRP-2025-0010"}</span></div>
              <div className="flex justify-between"><span>Version:</span> <span className="text-primary">V{proposal.version || "1.0"}</span></div>
              <div className="flex justify-between"><span>Total Pages:</span> <span className="text-primary">{totalPages} Pages</span></div>
              <div className="flex justify-between"><span>Generated On:</span> <span className="text-primary font-mono">{formatIST(proposal.created_at)}</span></div>
              <div className="flex justify-between"><span>Valid Until:</span> <span className="text-primary font-mono">{proposal.validity_date ? new Date(proposal.validity_date).toLocaleDateString("en-IN") : "N/A"}</span></div>
            </div>
          </Card>

          {/* Sections List */}
          <Card className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-5 space-y-3">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary block">
              Sections Map Outline
            </span>

            <div className="space-y-2">
              {sectionsList.map((sec, idx) => (
                <div
                  key={idx}
                  onClick={() => setPage(sec.page)}
                  className="flex justify-between items-center p-2.5 rounded-xl bg-surface-2 border border-border/40 hover:border-brand-primary/45 cursor-pointer text-xs font-semibold text-secondary"
                >
                  <span className="text-primary">{sec.name}</span>
                  <Badge className="bg-brand-primary/10 border-brand-primary/20 text-brand-primary border text-[8px] font-mono font-black">
                    Page {sec.page}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>

      </div>

      {/* Share settings Modal */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-6 w-full max-w-md space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-border">
              <h3 className="text-xs font-black text-primary uppercase tracking-wider">
                Generate Public Client Share Link
              </h3>
              <button onClick={() => setShowShareModal(false)} className="text-secondary hover:text-primary">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-semibold text-secondary">
              <div>
                <label className="text-[9px] uppercase tracking-wider font-extrabold text-secondary block mb-1.5">
                  Link Expiration Duration (Hours)
                </label>
                <select
                  value={expiryHours}
                  onChange={e => setExpiryHours(parseInt(e.target.value) || 24)}
                  className="w-full bg-surface-2 border border-border text-xs rounded-xl px-3 py-2 text-primary outline-none"
                >
                  <option value={24}>24 Hours (1 Day)</option>
                  <option value={48}>48 Hours (2 Days)</option>
                  <option value={72}>72 Hours (3 Days)</option>
                  <option value={168}>168 Hours (1 Week)</option>
                </select>
              </div>

              {copiedLink && (
                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider font-extrabold text-tertiary block">Public Access Link</label>
                  <div className="flex gap-2">
                    <Input readOnly value={copiedLink} className="bg-surface-2 border-border text-[10px] font-mono h-8 select-all text-secondary" />
                    <Button
                      onClick={() => {
                        navigator.clipboard.writeText(copiedLink)
                        toast.success("Link copied!")
                      }}
                      size="icon"
                      variant="outline"
                      className="h-8 w-8 border-border bg-surface-2"
                    >
                      <Copy className="h-4 w-4 text-secondary" />
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-border">
                <Button type="button" variant="ghost" onClick={() => setShowShareModal(false)} className="text-xs">
                  Close
                </Button>
                <Button
                  onClick={handleGenerateShareLink}
                  className="bg-brand-primary text-white text-xs font-bold px-4 rounded-xl"
                >
                  Generate & Copy Share Link
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  )
}

// Simple dummy close icon wrapper
function X(props: any) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  )
}
