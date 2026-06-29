"use client"

import { useState, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import { 
  useServiceRequestOverview, useServiceRequestRequirements, 
  useUpdateServiceRequestRequirements, useServiceRequestRemarks, 
  useAddServiceRequestRemark, useServiceRequestAttachments, 
  useAddServiceRequestAttachment 
} from "@/services/super-admin-service"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { 
  ArrowLeft, Search, Filter, Download, Plus, FileText, 
  Trash2, User, Send, Edit, Save, Paperclip, ChevronRight 
} from "lucide-react"

export default function RequirementsReviewPage() {
  const router = useRouter()
  const params = useParams()
  const requestId = params.id as string

  // Fetch API data
  const { data: overview } = useServiceRequestOverview(requestId)
  const { data: requirements = [] } = useServiceRequestRequirements(requestId)
  const { data: remarks = [], refetch: refetchRemarks } = useServiceRequestRemarks(requestId)
  
  const updateRequirementsMutation = useUpdateServiceRequestRequirements(requestId)
  const addRemarkMutation = useAddServiceRequestRemark(requestId)
  const addAttachmentMutation = useAddServiceRequestAttachment(requestId)

  // Active Category pill tab
  const [activeTab, setActiveTab] = useState<string>("REGISTRATION")
  const { data: attachments = [], refetch: refetchAttachments } = useServiceRequestAttachments(requestId, activeTab)

  const [searchTerm, setSearchTerm] = useState("")
  const [newRemarkText, setNewRemarkText] = useState("")
  const [isEditingNotes, setIsEditingNotes] = useState(false)
  const [tempNotes, setTempNotes] = useState("")

  // Categories config
  const categories = [
    { id: "REGISTRATION", label: "Registration" },
    { id: "SPEAKER READY ROOM", label: "Speaker Ready Room" },
    { id: "SESSION ROOMS", label: "Session Rooms" },
    { id: "NETWORKING", label: "Networking" },
    { id: "DIGITAL SIGNAGE", label: "Digital Signage" },
    { id: "OTHERS", label: "Others" }
  ]

  // Filter current requirement details
  const activeReq = useMemo(() => {
    return requirements.find((r: any) => r.requirement_type.toUpperCase() === activeTab) || {
      requirement_data: {}
    }
  }, [requirements, activeTab])

  // Filtered requirements table list
  const filteredFields = useMemo(() => {
    const data = activeReq.requirement_data || {}
    return Object.entries(data).filter(([key, val]) => {
      const matchKey = key.toLowerCase().includes(searchTerm.toLowerCase())
      const matchVal = String(val).toLowerCase().includes(searchTerm.toLowerCase())
      return matchKey || matchVal
    })
  }, [activeReq, searchTerm])

  const handleUpdateNotes = async () => {
    const currentData = activeReq.requirement_data || {}
    await updateRequirementsMutation.mutateAsync({
      requirement_type: activeTab,
      requirement_data: {
        ...currentData,
        additional_notes: tempNotes
      }
    })
    setIsEditingNotes(false)
  }

  const handleAddRemark = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newRemarkText.trim()) return
    await addRemarkMutation.mutateAsync({ remark_text: newRemarkText })
    setNewRemarkText("")
    refetchRemarks()
  }

  const handleUploadAttachment = async () => {
    const filename = prompt("Enter simulated attachment filename (e.g. badge_design.png):")
    if (!filename) return
    await addAttachmentMutation.mutateAsync({
      requirement_type: activeTab,
      filename,
      file_size: Math.floor(Math.random() * 500000 + 50000)
    })
    refetchAttachments()
  }

  const handleExportData = () => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + ["Requirement Field,Value", ...filteredFields.map(f => `"${f[0]}","${f[1]}"`)].join("\n")
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `REQ_${activeTab}_export.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <PageContainer>
      {/* Header Breadcrumbs & Action Bar */}
      <div className="flex flex-col gap-3 mb-6">
        <div className="flex items-center gap-2 text-xs text-tertiary">
          <span className="hover:text-primary cursor-pointer" onClick={() => router.push("/service-requests")}>Service Requests</span>
          <ChevronRight className="h-3 w-3" />
          <span className="hover:text-primary cursor-pointer font-bold text-secondary" onClick={() => router.push(`/service-requests/${requestId}`)}>{overview?.request_number || "REQ-..."}</span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-primary font-extrabold uppercase tracking-wide">Requirements</span>
        </div>

        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h1 className="text-xl font-black text-primary flex items-center gap-2">
              <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg" onClick={() => router.push(`/service-requests/${requestId}`)}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              Requirements Review
            </h1>
            <p className="text-[10px] text-tertiary">Verify event specifications, notes, attachments, and organizer feedback</p>
          </div>

          <div className="flex items-center gap-3 w-full lg:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 lg:flex-initial">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-tertiary" />
              <Input
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search specs..."
                className="pl-9 h-9 text-xs bg-surface-2 border-border"
              />
            </div>

            <Button variant="outline" size="sm" className="text-xs h-9 gap-1 text-secondary border-border bg-surface-2">
              <Filter className="h-3.5 w-3.5" /> Filter
            </Button>

            <Button
              onClick={handleExportData}
              variant="outline"
              size="sm"
              className="text-xs h-9 gap-1 text-secondary border-border bg-surface-2"
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
          </div>
        </div>
      </div>

      {/* Service Category Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 border-b border-border/60 mb-6">
        {categories.map(cat => {
          const isActive = activeTab === cat.id
          return (
            <button
              key={cat.id}
              onClick={() => {
                setActiveTab(cat.id)
                setTempNotes((activeReq.requirement_data as any)?.additional_notes || "")
              }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border whitespace-nowrap flex items-center gap-1.5
                ${isActive ? "bg-brand-primary border-brand-primary text-white shadow-md" : "bg-surface-2 border-border text-secondary hover:border-brand-primary/45"}`}
            >
              {cat.label}
            </button>
          )
        })}
      </div>

      {/* Two-Column Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        
        {/* Left Column: Requirements Specs */}
        <div className="xl:col-span-8 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-6 space-y-4">
          <h2 className="text-xs font-extrabold uppercase tracking-widest text-secondary border-b border-border/40 pb-2">
            Category Specifications: {categories.find(c => c.id === activeTab)?.label}
          </h2>

          <div className="overflow-hidden border border-border/40 rounded-2xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-surface-2 border-b border-border/60 text-secondary">
                  <th className="p-3">Specification Key</th>
                  <th className="p-3">Requirement Value</th>
                </tr>
              </thead>
              <tbody>
                {filteredFields.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="p-4 text-center text-[10px] text-tertiary">No spec keys matching search criteria.</td>
                  </tr>
                ) : (
                  filteredFields.filter(f => f[0] !== "additional_notes").map(([key, val]) => (
                    <tr key={key} className="border-b border-border/30 hover:bg-surface-hover/20 font-semibold text-secondary">
                      <td className="p-3 font-mono text-tertiary text-[10px] capitalize">{key.replace("_", " ")}</td>
                      <td className="p-3 text-primary">{String(val)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Notes, Attachments, Remarks */}
        <div className="xl:col-span-4 space-y-6">
          
          {/* Additional Notes Box */}
          <Card className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-5 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary">Additional Notes</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (isEditingNotes) {
                    handleUpdateNotes()
                  } else {
                    setTempNotes((activeReq.requirement_data as any)?.additional_notes || "")
                    setIsEditingNotes(true)
                  }
                }}
                className="text-[10px] text-brand-primary font-bold h-7 gap-1"
              >
                {isEditingNotes ? <Save className="h-3 w-3" /> : <Edit className="h-3 w-3" />}
                {isEditingNotes ? "Save" : "Edit"}
              </Button>
            </div>

            {isEditingNotes ? (
              <textarea
                value={tempNotes}
                onChange={e => setTempNotes(e.target.value)}
                className="w-full h-24 bg-surface-2 border border-border rounded-xl p-2 text-xs text-primary outline-none focus:border-brand-primary"
              />
            ) : (
              <div className="bg-surface-2/40 border border-border/40 p-3 rounded-2xl text-[10px] text-secondary min-h-[60px] whitespace-pre-wrap leading-relaxed">
                {(activeReq.requirement_data as any)?.additional_notes || "No additional notes configured for this category."}
              </div>
            )}
          </Card>

          {/* Attachments Card */}
          <Card className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-5 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary">Attachments</span>
              <Button
                onClick={handleUploadAttachment}
                variant="outline"
                size="sm"
                className="text-[10px] text-secondary h-7 border-border bg-surface-2 gap-1"
              >
                <Plus className="h-3 w-3" /> Add Attachment
              </Button>
            </div>

            <div className="space-y-2">
              {attachments.length === 0 ? (
                <span className="text-[9px] text-tertiary block text-center py-4">No attachments uploaded yet.</span>
              ) : (
                attachments.map((file: any) => (
                  <div key={file.id} className="flex justify-between items-center p-2.5 rounded-xl bg-surface-2 border border-border/40">
                    <div className="flex items-center gap-2">
                      <Paperclip className="h-3.5 w-3.5 text-tertiary" />
                      <div>
                        <span className="text-[10px] text-primary font-bold block truncate max-w-[150px]">{file.filename}</span>
                        <span className="text-[8px] text-tertiary block font-mono">{(file.file_size / 1024).toFixed(0)} KB</span>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-tertiary hover:text-brand-primary">
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Organiser Remarks Section */}
          <Card className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-5 flex flex-col justify-between h-[360px]">
            <div>
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary block mb-3">Organiser Remarks Feed</span>
              
              <div className="space-y-3 overflow-y-auto max-h-[220px] pr-1 scrollbar-thin">
                {remarks.length === 0 ? (
                  <span className="text-[9px] text-tertiary block text-center py-8">No remarks posted.</span>
                ) : (
                  remarks.map((rem: any, idx: number) => (
                    <div key={idx} className="space-y-1 bg-surface-2/40 border border-border/20 p-2.5 rounded-2xl">
                      <div className="flex justify-between text-[8px] font-bold text-tertiary">
                        <span className="flex items-center gap-1"><User className="h-2.5 w-2.5" /> {rem.user_name}</span>
                        <span>{new Date(rem.created_at).toLocaleTimeString("en-IN")}</span>
                      </div>
                      <p className="text-[10px] text-secondary leading-normal">{rem.remark_text}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <form onSubmit={handleAddRemark} className="flex gap-2 border-t border-border pt-3">
              <Input
                value={newRemarkText}
                onChange={e => setNewRemarkText(e.target.value)}
                placeholder="Write remark..."
                className="h-8 text-xs bg-surface-2 border-border"
              />
              <Button type="submit" size="icon" className="h-8 w-8 bg-brand-primary text-white rounded-xl">
                <Send className="h-3.5 w-3.5" />
              </Button>
            </form>
          </Card>

        </div>

      </div>
    </PageContainer>
  )
}
