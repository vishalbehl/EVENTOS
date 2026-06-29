"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { 
  useAdminOrgs, useOrgEvents, useCreateProposal, useUpdateProposal, 
  useProposalDetail, useAllQuotes 
} from "@/services/super-admin-service"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { 
  ArrowLeft, Plus, Check, ChevronRight, Sparkles, Layout, 
  FileText, ShieldCheck, DollarSign, PenTool, Image as ImageIcon 
} from "lucide-react"
import { formatIST } from "@/lib/formatters"
import { toast } from "sonner"

interface ProposalFormProps {
  proposalId?: string
}

export default function ProposalForm({ proposalId }: ProposalFormProps) {
  const router = useRouter()
  const isEditMode = !!proposalId

  // Fetch lists
  const { data: orgs = [] } = useAdminOrgs()
  const { data: initialProp } = useProposalDetail(proposalId || "")

  const createProposalMutation = useCreateProposal()
  const updateProposalMutation = useUpdateProposal(proposalId || "")

  // Steps state
  const [step, setStep] = useState(1)

  // Form Fields State
  const [proposalNumber, setProposalNumber] = useState("PRP-2025-0010")
  const [orgId, setOrgId] = useState("")
  const { data: events = [] } = useOrgEvents(orgId)
  const [eventId, setEventId] = useState("")
  
  // Fetch quotes linked to selected event/request
  const { data: quotes = [] } = useAllQuotes(eventId || undefined)
  const [selectedQuoteId, setSelectedQuoteId] = useState("")

  const [venue, setVenue] = useState("Convention Center Hall 2")
  const [currency, setCurrency] = useState("INR")
  const [validityDate, setValidityDate] = useState("")
  const [primaryColor, setPrimaryColor] = useState("#8B5CF6")
  const [templateName, setTemplateName] = useState("Modern Standard Theme")
  const [logoUrl, setLogoUrl] = useState("")

  // Content sections
  const [execSummary, setExecSummary] = useState("Thank you for choosing EventX. We are delighted to propose a comprehensive infrastructural networking and presenter ready room setup for your upcoming conference.")
  const [scopeText, setScopeText] = useState("Includes 12 Wi-Fi 6 wireless nodes routing, 4 check-in registration counters equipped with laptops and label printers.")
  const [deliverablesText, setDeliverablesText] = useState("• Complete LAN routing cabling setup\n• 15 Core i7 attendee laptops\n• 4 Professional Crew operators on call")
  const [termsText, setTermsText] = useState("All rentals strictly align with SLA response rules. Damages caused by third party layout alterations are subject to contingency fees.")

  useEffect(() => {
    if (isEditMode && initialProp) {
      setProposalNumber(initialProp.proposal_number || "PRP-2025-...")
      setOrgId(initialProp.organization_id || "")
      setEventId(initialProp.request_id || "")
      setSelectedQuoteId(initialProp.quote_id || "")
      setValidityDate(initialProp.validity_date || "")
      
      if (initialProp.sections) {
        initialProp.sections.forEach((sec: any) => {
          if (sec.section_name === "Executive Summary") setExecSummary(sec.content_richtext)
          if (sec.section_name === "Event Scope") setScopeText(sec.content_richtext)
          if (sec.section_name === "Deliverables") setDeliverablesText(sec.content_richtext)
          if (sec.section_name === "Terms & Conditions") setTermsText(sec.content_richtext)
        })
      }
    }
  }, [isEditMode, initialProp])

  // Save proposal
  const handleSave = async (statusOverride?: string) => {
    const sectionsPayload = [
      { section_name: "Executive Summary", content_richtext: execSummary, page_number: 1, order_index: 1 },
      { section_name: "Event Scope", content_richtext: scopeText, page_number: 2, order_index: 2 },
      { section_name: "Deliverables", content_richtext: deliverablesText, page_number: 3, order_index: 3 },
      { section_name: "Terms & Conditions", content_richtext: termsText, page_number: 5, order_index: 5 }
    ]

    const payload = {
      request_id: eventId || null,
      quote_id: selectedQuoteId || null,
      version: initialProp?.version || "1.0",
      status: statusOverride || "DRAFT",
      validity_date: validityDate,
      sections: sectionsPayload
    }

    if (isEditMode) {
      await updateProposalMutation.mutateAsync(payload)
      router.push(`/service-requests`)
    } else {
      await createProposalMutation.mutateAsync(payload)
      router.push(`/service-requests`)
    }
  }

  return (
    <PageContainer>
      {/* Header bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-xl font-black text-primary">
              {isEditMode ? `Edit Proposal: ${proposalNumber}` : "Create New Proposal"}
            </h2>
            <p className="text-[10px] text-tertiary">Proposals / Construct client proposal documents</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => handleSave("DRAFT")} className="text-xs h-9">
            Save as Draft
          </Button>
          <Button 
            onClick={() => {
              if (step < 6) {
                setStep(prev => prev + 1)
              } else {
                handleSave("SENT")
              }
            }} 
            className="bg-brand-primary text-white text-xs font-bold h-9 px-4 rounded-xl hover:bg-brand-primary/95"
          >
            {step === 6 ? "Generate PDF & Send" : "Next Step"}
          </Button>
        </div>
      </div>

      {/* Step Wizard Bar */}
      <div className="flex gap-1.5 border-b border-border/60 pb-3 mb-6 overflow-x-auto">
        {[
          { num: 1, label: "Executive Summary" },
          { num: 2, label: "Event Scope" },
          { num: 3, label: "Deliverables" },
          { num: 4, label: "Commercials" },
          { num: 5, label: "Terms & Conditions" },
          { num: 6, label: "Review & Send" }
        ].map(s => {
          const isPassed = step > s.num
          const isActive = step === s.num
          return (
            <button
              key={s.num}
              onClick={() => isPassed && setStep(s.num)}
              disabled={!isPassed && !isActive}
              className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all whitespace-nowrap flex items-center gap-1.5
                ${isActive ? "bg-brand-primary border-brand-primary text-white" : 
                  isPassed ? "bg-surface-2 border-border text-primary cursor-pointer" : 
                  "bg-surface-2 border-border text-tertiary cursor-not-allowed"}`}
            >
              <span className={`h-4.5 w-4.5 rounded-full text-[9px] font-black border flex items-center justify-center shrink-0
                ${isActive ? "bg-white text-brand-primary border-white" : "border-tertiary text-tertiary"}`}>
                {s.num}
              </span>
              {s.label}
            </button>
          )
        })}
      </div>

      {/* Step 1: Executive Summary */}
      {step === 1 && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          
          {/* Left Panel: Proposal Information */}
          <div className="xl:col-span-3 space-y-4">
            <Card className="p-5 rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-default)] space-y-4">
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary block border-b border-border/40 pb-2">
                Proposal Information
              </span>

              <div className="space-y-3.5 text-xs font-semibold text-secondary">
                <div>
                  <label className="text-[9px] text-tertiary block mb-1">Proposal Number</label>
                  <Input value={proposalNumber} readOnly className="bg-surface-2 border-border text-xs h-8 cursor-not-allowed text-tertiary font-mono" />
                </div>

                <div>
                  <label className="text-[9px] text-tertiary block mb-1">Organisation</label>
                  <select
                    value={orgId}
                    onChange={e => setOrgId(e.target.value)}
                    className="w-full bg-surface-2 border border-border text-xs rounded-xl px-3 py-1.5 text-primary outline-none"
                  >
                    <option value="">Select Organisation</option>
                    {orgs.map((org: any) => (
                      <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[9px] text-tertiary block mb-1">Linked Service Request</label>
                  <select
                    value={eventId}
                    onChange={e => setEventId(e.target.value)}
                    className="w-full bg-surface-2 border border-border text-xs rounded-xl px-3 py-1.5 text-primary outline-none"
                  >
                    <option value="">Select Request</option>
                    {events.map((ev: any) => (
                      <option key={ev.id} value={ev.id}>{ev.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[9px] text-tertiary block mb-1">Venue</label>
                  <Input value={venue} onChange={e => setVenue(e.target.value)} className="bg-surface-2 border-border text-xs h-8" />
                </div>

                <div>
                  <label className="text-[9px] text-tertiary block mb-1">Validity Date</label>
                  <Input type="date" value={validityDate} onChange={e => setValidityDate(e.target.value)} className="bg-surface-2 border-border text-xs h-8" />
                </div>
              </div>
            </Card>
          </div>

          {/* Middle Panel: Executive Summary Rich Editor */}
          <div className="xl:col-span-6 space-y-4">
            <Card className="p-6 rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-default)] space-y-4">
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary block border-b border-border/40 pb-2">
                Executive Summary text
              </span>

              <div className="space-y-2.5">
                {/* Mock rich editor tools header */}
                <div className="flex gap-2 p-1.5 bg-surface-2 border border-border/60 rounded-xl text-[10px] font-bold text-secondary">
                  <button type="button" className="px-2 py-0.5 hover:bg-surface-3 rounded">B</button>
                  <button type="button" className="px-2 py-0.5 hover:bg-surface-3 rounded">I</button>
                  <button type="button" className="px-2 py-0.5 hover:bg-surface-3 rounded underline">U</button>
                  <button type="button" className="px-2 py-0.5 hover:bg-surface-3 rounded">List</button>
                </div>

                <textarea
                  value={execSummary}
                  onChange={e => setExecSummary(e.target.value)}
                  className="w-full h-44 bg-surface-2 border border-border rounded-2xl p-3.5 text-xs text-primary outline-none focus:border-brand-primary"
                />
              </div>
            </Card>

            {/* Key Highlights strip */}
            <div className="grid grid-cols-3 gap-4">
              <Card className="p-3 bg-surface-2/40 border border-border/40 rounded-2xl text-center">
                <span className="text-[8px] uppercase tracking-wider font-extrabold text-tertiary block">Duration</span>
                <span className="text-xs font-black text-primary">3 Days</span>
              </Card>
              <Card className="p-3 bg-surface-2/40 border border-border/40 rounded-2xl text-center">
                <span className="text-[8px] uppercase tracking-wider font-extrabold text-tertiary block">Expected Pax</span>
                <span className="text-xs font-black text-primary">1,200 pax</span>
              </Card>
              <Card className="p-3 bg-surface-2/40 border border-border/40 rounded-2xl text-center">
                <span className="text-[8px] uppercase tracking-wider font-extrabold text-tertiary block">Categories</span>
                <span className="text-xs font-black text-primary">4 Modules</span>
              </Card>
            </div>
          </div>

          {/* Right Panel: Cover & Branding */}
          <div className="xl:col-span-3 space-y-4">
            <Card className="p-5 rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-default)] space-y-4">
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary block border-b border-border/40 pb-2">
                Cover & Branding
              </span>

              <div className="space-y-3.5 text-xs font-semibold text-secondary">
                <div>
                  <label className="text-[9px] text-tertiary block mb-1">Proposal Template</label>
                  <select
                    value={templateName}
                    onChange={e => setTemplateName(e.target.value)}
                    className="w-full bg-surface-2 border border-border text-xs rounded-xl px-2 py-1.5 text-primary outline-none"
                  >
                    <option value="Modern Standard Theme">Modern Purple Theme</option>
                    <option value="Classic Corporate Gray">Classic Corporate Gray</option>
                  </select>
                </div>

                <div>
                  <label className="text-[9px] text-tertiary block mb-1">Primary Color (Hex)</label>
                  <div className="flex gap-2 items-center">
                    <Input 
                      value={primaryColor} 
                      onChange={e => setPrimaryColor(e.target.value)}
                      className="bg-surface-2 border-border h-8 text-xs font-mono" 
                    />
                    <div className="h-6 w-6 rounded-lg border border-border shrink-0" style={{ backgroundColor: primaryColor }} />
                  </div>
                </div>

                <div>
                  <label className="text-[9px] text-tertiary block mb-1">Cover Image</label>
                  <Button variant="outline" size="sm" className="w-full h-8 border-border bg-surface-2 text-secondary text-xs gap-1.5">
                    <ImageIcon className="h-4 w-4" /> Upload Cover Image
                  </Button>
                </div>
              </div>
            </Card>
          </div>

        </div>
      )}

      {/* Steps 2-5 inputs */}
      {step === 2 && (
        <Card className="p-6 rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-default)] space-y-4">
          <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary block border-b border-border/40 pb-2">
            Step 2: Event Scope & Technical specifications
          </span>
          <textarea
            value={scopeText}
            onChange={e => setScopeText(e.target.value)}
            className="w-full h-40 bg-surface-2 border border-border rounded-2xl p-3 text-xs text-primary outline-none focus:border-brand-primary"
          />
        </Card>
      )}

      {step === 3 && (
        <Card className="p-6 rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-default)] space-y-4">
          <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary block border-b border-border/40 pb-2">
            Step 3: Deliverables List
          </span>
          <textarea
            value={deliverablesText}
            onChange={e => setDeliverablesText(e.target.value)}
            className="w-full h-40 bg-surface-2 border border-border rounded-2xl p-3 text-xs text-primary outline-none focus:border-brand-primary"
          />
        </Card>
      )}

      {step === 4 && (
        <Card className="p-6 rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-default)] space-y-4">
          <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary block border-b border-border/40 pb-2">
            Step 4: Linked Commercial Quotation Summary
          </span>

          <div className="space-y-4 text-xs font-semibold text-secondary">
            <div>
              <label className="text-[9px] uppercase tracking-wider font-extrabold text-tertiary block mb-1.5">Select Quote Source</label>
              <select
                value={selectedQuoteId}
                onChange={e => setSelectedQuoteId(e.target.value)}
                className="bg-surface-2 border border-border text-xs rounded-xl px-3 py-2 text-primary outline-none max-w-sm"
              >
                <option value="">Link Quote</option>
                {quotes.map((q: any) => (
                  <option key={q.id} value={q.id}>{q.quote_number} (₹{q.estimated_value.toLocaleString()})</option>
                ))}
              </select>
            </div>

            <div className="bg-surface-2/40 p-4 border border-border/40 rounded-2xl text-[10px] text-tertiary leading-relaxed space-y-2">
              <span className="text-secondary font-black block">Commercials client view note:</span>
              <p>Margins are completely hidden in all customer-facing views, proposal generator cover pages, and public share links. The client will only view consolidated itemised billing.</p>
            </div>
          </div>
        </Card>
      )}

      {step === 5 && (
        <Card className="p-6 rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-default)] space-y-4">
          <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary block border-b border-border/40 pb-2">
            Step 5: Terms & Conditions
          </span>
          <textarea
            value={termsText}
            onChange={e => setTermsText(e.target.value)}
            className="w-full h-40 bg-surface-2 border border-border rounded-2xl p-3 text-xs text-primary outline-none focus:border-brand-primary"
          />
        </Card>
      )}

      {step === 6 && (
        <Card className="p-6 rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-default)] space-y-4">
          <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary block border-b border-border/40 pb-2">
            Step 6: Review & Submit Proposal
          </span>

          <div className="space-y-4 text-xs font-semibold text-secondary">
            <div>
              <span className="text-tertiary block font-bold">Proposal Number:</span>
              <span className="text-primary font-bold block">{proposalNumber}</span>
            </div>
            <div>
              <span className="text-tertiary block font-bold">Executive Summary:</span>
              <p className="text-secondary bg-surface-2 p-3 rounded-xl border border-border/40 mt-1">{execSummary}</p>
            </div>
            <div>
              <span className="text-tertiary block font-bold">Terms:</span>
              <p className="text-secondary bg-surface-2 p-3 rounded-xl border border-border/40 mt-1">{termsText}</p>
            </div>
          </div>
        </Card>
      )}
    </PageContainer>
  )
}
