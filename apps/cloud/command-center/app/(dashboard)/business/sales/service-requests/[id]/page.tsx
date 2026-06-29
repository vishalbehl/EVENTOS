"use client"

import { useState, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import { 
  useServiceRequestOverview, useServiceRequestHistory, 
  useServiceRequestRequirements, useServiceRequestQuotes, 
  useServiceRequestDocuments, useServiceRequestActivityLogs, 
  useUpdateServiceRequest, useSubmitServiceRequest, 
  useApproveServiceRequest 
} from "@/services/super-admin-service"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  ArrowLeft, Edit, Save, Trash2, Calendar, MapPin, 
  Users, User, FileText, CheckCircle2, ChevronRight, MoreVertical 
} from "lucide-react"
import { formatIST, timeAgo, formatLakhRupee } from "@/lib/formatters"
import { toast } from "sonner"

export default function RequestDetailsPage() {
  const router = useRouter()
  const params = useParams()
  const requestId = params.id as string

  // Fetch API data
  const { data: overview, refetch: refetchOverview } = useServiceRequestOverview(requestId)
  const { data: history = [], refetch: refetchHistory } = useServiceRequestHistory(requestId)
  const { data: reqs = [] } = useServiceRequestRequirements(requestId)
  const { data: quotes = [] } = useServiceRequestQuotes(requestId)
  const { data: documents = [] } = useServiceRequestDocuments(requestId)
  const { data: activities = [], refetch: refetchActivities } = useServiceRequestActivityLogs(requestId)

  const updateRequestMutation = useUpdateServiceRequest()
  const submitRequestMutation = useSubmitServiceRequest()
  const approveRequestMutation = useApproveServiceRequest()

  const [activeTab, setActiveTab] = useState<string>("overview")
  const [isEditing, setIsEditing] = useState(false)
  const [editFields, setEditFields] = useState({
    title: "",
    description: "",
    priority: ""
  })

  // Start inline editing
  const startEditing = () => {
    if (!overview) return
    setEditFields({
      title: overview.title || "",
      description: overview.description || "",
      priority: overview.priority || "MEDIUM"
    })
    setIsEditing(true)
  }

  const saveEdit = async () => {
    await updateRequestMutation.mutateAsync({
      id: requestId,
      title: editFields.title,
      description: editFields.description,
      priority: editFields.priority
    })
    setIsEditing(false)
    refetchOverview()
  }

  // Handle workflow transitions
  const handleSubmitRequest = async () => {
    await submitRequestMutation.mutateAsync(requestId)
    refetchOverview()
    refetchHistory()
    refetchActivities()
  }

  const handleApproveRequest = async () => {
    await approveRequestMutation.mutateAsync(requestId)
    refetchOverview()
    refetchHistory()
    refetchActivities()
  }

  const handleCancelRequest = async () => {
    await updateRequestMutation.mutateAsync({ id: requestId, status: "CANCELLED" })
    refetchOverview()
    refetchHistory()
    refetchActivities()
  }

  // derive progress stepper timeline state from status_history (request_history) records, not a single status field
  const stages = [
    { id: "DRAFT", label: "Created" },
    { id: "SUBMITTED", label: "Submitted" },
    { id: "UNDER_REVIEW", label: "Under Review" },
    { id: "QUOTED", label: "Quoted" },
    { id: "ACCEPTED", label: "Accepted" },
    { id: "IN_PROGRESS", label: "In Progress" },
    { id: "COMPLETED", label: "Completed" }
  ]

  const stepperState = useMemo(() => {
    return stages.map(stage => {
      // Find matching history transition for this status
      const entry = history.find((h: any) => h.new_status?.toUpperCase() === stage.id)
      return {
        ...stage,
        completed: !!entry,
        date: entry ? formatIST(entry.performed_at) : null
      }
    })
  }, [history])

  return (
    <PageContainer>
      {/* Header section with breadcrumbs and Dynamic badges */}
      <div className="flex flex-col gap-3 mb-6">
        <div className="flex items-center gap-2 text-xs text-tertiary">
          <span className="hover:text-primary cursor-pointer" onClick={() => router.push("/service-requests")}>Service Requests</span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-primary font-extrabold uppercase tracking-wide">{overview?.request_number || "REQ-..."}</span>
        </div>

        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <Badge className="bg-brand-primary/10 border border-brand-primary/20 text-brand-primary text-[9px] font-black uppercase">
                {overview?.request_number || "REQ-..."}
              </Badge>
              <Badge className="bg-surface-2 border border-border text-secondary text-[9px] font-bold">
                Status: {overview?.status || "DRAFT"}
              </Badge>
              <Badge className="bg-danger/10 text-danger border border-danger/20 text-[9px] font-black uppercase">
                {overview?.priority || "MEDIUM"}
              </Badge>
            </div>
            
            {isEditing ? (
              <Input
                value={editFields.title}
                onChange={e => setEditFields(prev => ({ ...prev, title: e.target.value }))}
                className="text-xl font-bold bg-surface-2 border-border h-9 max-w-lg"
              />
            ) : (
              <h1 className="text-xl font-black text-primary leading-tight">
                {overview?.title || "Loading request..."}
              </h1>
            )}

            <div className="text-[10px] text-tertiary font-bold flex items-center gap-2">
              <span>Organiser: <strong>{overview?.org_name || "Imperial Organizers"}</strong></span>
              <span>•</span>
              <span>Event ID: <span className="font-mono text-secondary">{requestId.substring(0, 8)}</span></span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <Button size="sm" onClick={saveEdit} className="bg-brand-primary text-white text-xs font-bold gap-1 h-9">
                  <Save className="h-4 w-4" /> Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)} className="text-xs h-9">
                  Cancel
                </Button>
              </>
            ) : (
              <>
                {overview?.status === "DRAFT" && (
                  <Button onClick={handleSubmitRequest} className="bg-brand-primary text-white text-xs font-bold h-9">
                    Submit Request
                  </Button>
                )}
                {overview?.status === "SUBMITTED" && (
                  <Button onClick={handleApproveRequest} className="bg-success text-white text-xs font-bold h-9">
                    Approve Request
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={startEditing} className="text-xs border-border bg-surface-2 h-9 text-secondary font-bold">
                  Edit Request
                </Button>
                <Button variant="outline" size="icon" onClick={handleCancelRequest} className="border-border bg-surface-2 h-9 w-9 text-danger">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Quick Info Bar */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 p-4 rounded-3xl bg-surface-2 border border-border mb-8 text-xs font-semibold text-secondary">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-surface-3 border border-border text-tertiary">
            <Calendar className="h-4 w-4" />
          </div>
          <div>
            <span className="text-[9px] uppercase tracking-wider font-extrabold text-tertiary block">Event Dates</span>
            <span className="text-primary text-[10px]">
              {overview?.start_date ? new Date(overview.start_date).toLocaleDateString("en-IN") : "N/A"} - {overview?.end_date ? new Date(overview.end_date).toLocaleDateString("en-IN") : "N/A"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-surface-3 border border-border text-tertiary">
            <MapPin className="h-4 w-4" />
          </div>
          <div>
            <span className="text-[9px] uppercase tracking-wider font-extrabold text-tertiary block">Venue Location</span>
            <span className="text-primary text-[10px]">{overview?.venue_name || "Main Hall Suite"} ({overview?.venue_city || "Mumbai"})</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-surface-3 border border-border text-tertiary">
            <Users className="h-4 w-4" />
          </div>
          <div>
            <span className="text-[9px] uppercase tracking-wider font-extrabold text-tertiary block">Expected Attendees</span>
            <span className="text-primary text-[10px] font-mono">{overview?.attendees_count ?? 1200} pax</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-surface-3 border border-border text-tertiary">
            <User className="h-4 w-4" />
          </div>
          <div>
            <span className="text-[9px] uppercase tracking-wider font-extrabold text-tertiary block">Created By</span>
            <span className="text-primary text-[10px]">Super Admin ({formatIST(overview?.created_at)})</span>
          </div>
        </div>
      </div>

      {/* Progress Timeline Stepper */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-6 mb-8">
        <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary block mb-4">Request Progress Timeline</span>
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          {stepperState.map((step, idx) => (
            <div key={step.id} className="flex-1 w-full relative flex items-center lg:flex-col lg:text-center gap-4 lg:gap-2">
              <div className={`h-8 w-8 rounded-full border flex items-center justify-center text-xs font-black transition-all shrink-0
                ${step.completed ? "bg-success border-success text-white scale-110 shadow-md" : "bg-surface-2 border-border text-tertiary"}`}>
                {step.completed ? "✓" : idx + 1}
              </div>
              <div>
                <span className={`text-[10px] font-bold block ${step.completed ? "text-primary" : "text-tertiary"}`}>{step.label}</span>
                {step.date && <span className="text-[8px] text-tertiary block font-mono font-medium">{step.date}</span>}
              </div>
              {idx < stages.length - 1 && (
                <div className={`hidden lg:block absolute left-[calc(50%+16px)] right-[-50%] top-4 h-[2px] z-0
                  ${stepperState[idx + 1].completed ? "bg-success" : "bg-border"}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-surface-2 border border-border w-full flex justify-start rounded-xl">
          <TabsTrigger value="overview" className="text-xs font-bold px-4 py-2 border-b-2 border-transparent data-[state=active]:border-brand-primary">Overview</TabsTrigger>
          <TabsTrigger value="requirements" onClick={() => router.push(`/service-requests/${requestId}/requirements`)} className="text-xs font-bold px-4 py-2 border-b-2 border-transparent text-secondary hover:text-brand-primary">Requirements Review ↗</TabsTrigger>
          <TabsTrigger value="resources" onClick={() => router.push(`/service-requests/${requestId}/resource-planning`)} className="text-xs font-bold px-4 py-2 border-b-2 border-transparent text-secondary hover:text-brand-primary">Resource Planning ↗</TabsTrigger>
          <TabsTrigger value="quotes" className="text-xs font-bold px-4 py-2 border-b-2 border-transparent data-[state=active]:border-brand-primary">Quotes</TabsTrigger>
          <TabsTrigger value="documents" className="text-xs font-bold px-4 py-2 border-b-2 border-transparent data-[state=active]:border-brand-primary">Documents</TabsTrigger>
          <TabsTrigger value="activity" className="text-xs font-bold px-4 py-2 border-b-2 border-transparent data-[state=active]:border-brand-primary">Activity Log</TabsTrigger>
        </TabsList>

        {/* Tab 1: Overview Panel */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Event Information */}
            <Card className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-6 space-y-4">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-secondary border-b border-border/40 pb-2">Event Information</h3>
              <div className="space-y-3.5 text-xs font-semibold text-secondary">
                <div className="flex justify-between"><span>Event Name:</span> <span className="text-primary">{overview?.event_name}</span></div>
                <div className="flex justify-between"><span>Attendees Target:</span> <span className="text-primary font-mono">{overview?.attendees_count ?? 1200} pax</span></div>
                <div className="flex justify-between"><span>Organiser Contact:</span> <span className="text-brand-primary font-bold">events@imperial.com</span></div>
              </div>
            </Card>

            {/* Venue Information */}
            <Card className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-6 space-y-4">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-secondary border-b border-border/40 pb-2">Venue Layout</h3>
              <div className="space-y-3.5 text-xs font-semibold text-secondary">
                <div className="flex justify-between"><span>Venue Hall:</span> <span className="text-primary">{overview?.venue_name}</span></div>
                <div className="flex justify-between"><span>City:</span> <span className="text-primary">{overview?.venue_city}</span></div>
                <div className="flex justify-between"><span>Total mapped area:</span> <span className="text-primary">14,200 sq. ft</span></div>
              </div>
            </Card>

            {/* Summary Panel */}
            <Card className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-6 space-y-4">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-secondary border-b border-border/40 pb-2">Triaging Summary</h3>
              <div className="space-y-3 text-xs font-semibold text-secondary">
                <div className="flex justify-between"><span>Total Category Modules:</span> <span className="text-primary font-bold">{overview?.services_count} active</span></div>
                <div className="flex justify-between"><span>Total Presentation Rooms:</span> <span className="text-primary">6 rooms</span></div>
                <div className="flex justify-between"><span>Crew manpower estimate:</span> <span className="text-primary">{overview?.manpower_estimate}</span></div>
                <div className="flex justify-between text-brand-primary font-bold"><span>Estimated value (latest):</span> <span className="font-mono">{formatLakhRupee(overview?.value_estimate || 0.0)}</span></div>
                <div className="flex justify-between pt-2 border-t border-border"><span>SLA Triage Status:</span> <Badge className="bg-success/15 border-success/30 text-success text-[8px]">WITHIN_SLA</Badge></div>
              </div>
            </Card>

          </div>
        </TabsContent>

        {/* Tab 4: Quotes Table */}
        <TabsContent value="quotes" className="space-y-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-surface-2 border-b border-border text-secondary">
                  <th className="p-3">Quote Number</th>
                  <th className="p-3">Generated Date</th>
                  <th className="p-3 text-right">Value</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q: any, idx: number) => (
                  <tr key={idx} className="border-b border-border/40 hover:bg-surface-hover/20 font-semibold text-secondary">
                    <td className="p-3 text-brand-primary font-bold">{q.quote_number}</td>
                    <td className="p-3 text-tertiary">{formatIST(q.generated_at)}</td>
                    <td className="p-3 text-right font-mono text-primary font-bold">{formatLakhRupee(q.estimated_value)}</td>
                    <td className="p-3">
                      <Badge className="bg-success/10 text-success border border-success/20 text-[8px] uppercase tracking-wider font-extrabold">
                        {q.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Tab 5: Documents list */}
        <TabsContent value="documents" className="space-y-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-surface-2 border-b border-border text-secondary">
                  <th className="p-3">Filename</th>
                  <th className="p-3">Size</th>
                  <th className="p-3">Uploaded By</th>
                  <th className="p-3">Upload Time</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc: any, idx: number) => (
                  <tr key={idx} className="border-b border-border/40 hover:bg-surface-hover/20 font-semibold text-secondary">
                    <td className="p-3 text-primary flex items-center gap-2"><FileText className="h-4 w-4 text-tertiary" /> {doc.filename}</td>
                    <td className="p-3 font-mono text-[10px] text-tertiary">{(doc.size / 1024).toFixed(0)} KB</td>
                    <td className="p-3 text-secondary">{doc.uploaded_by}</td>
                    <td className="p-3 text-tertiary font-mono">{formatIST(doc.uploaded_at)}</td>
                    <td className="p-3 text-right">
                      <Button variant="ghost" size="sm" className="text-[10px] text-brand-primary font-bold h-7">Download</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Tab 6: Activity Log */}
        <TabsContent value="activity" className="space-y-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-6">
            <div className="space-y-6">
              {activities.map((act: any, idx: number) => (
                <div key={idx} className="flex gap-4 items-start text-xs font-semibold text-secondary relative">
                  {idx < activities.length - 1 && (
                    <div className="absolute left-[13px] top-[26px] bottom-[-26px] w-[2px] bg-border/40" />
                  )}
                  
                  <div className="h-7 w-7 rounded-full bg-brand-primary/10 border border-brand-primary/20 text-brand-primary flex items-center justify-center shrink-0">
                    <User className="h-3.5 w-3.5" />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-primary font-bold">{act.performed_by_name}</span>
                      <span className="text-[9px] text-tertiary uppercase font-extrabold tracking-wider">{act.action}</span>
                      <span className="text-[9px] text-tertiary font-mono">{timeAgo(act.performed_at)}</span>
                    </div>
                    <p className="text-secondary text-[10px] font-medium leading-relaxed">{act.details}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

      </Tabs>
    </PageContainer>
  )
}
