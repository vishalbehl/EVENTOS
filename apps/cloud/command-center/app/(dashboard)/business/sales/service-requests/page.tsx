"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { 
  useAdminOrgs, useOrgEvents, useServiceRequestsKpi, 
  useServiceRequestsKanban, useCreateServiceRequest, 
  useGlobalUsers 
} from "@/services/super-admin-service"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { 
  Plus, Search, ArrowUpRight, ArrowDownRight, Users, 
  Calendar, MapPin, DollarSign, Clock, LayoutGrid, CheckCircle2, X 
} from "lucide-react"

import { formatIST, timeAgo, formatLakhRupee } from "@/lib/formatters"

export default function ServiceRequestsPage() {
  const router = useRouter()

  // Resolve Organization and Event Selection
  const { data: orgsData } = useAdminOrgs()
  const orgs = orgsData ?? []
  
  const [selectedOrgId, setSelectedOrgId] = useState<string>("")
  const { data: eventsData } = useOrgEvents(selectedOrgId)
  const events = eventsData ?? []
  
  const [selectedEventId, setSelectedEventId] = useState<string>("")

  // Load from local storage
  useEffect(() => {
    const storedOrg = localStorage.getItem("service_request_org_id")
    const storedEvent = localStorage.getItem("service_request_event_id")
    if (storedOrg) setSelectedOrgId(storedOrg)
    if (storedEvent) setSelectedEventId(storedEvent)
  }, [])

  // Auto pre-select first org/event
  useEffect(() => {
    if (orgs.length > 0 && !selectedOrgId) {
      setSelectedOrgId(orgs[0].id)
      localStorage.setItem("service_request_org_id", orgs[0].id)
    }
  }, [orgs])

  useEffect(() => {
    if (events.length > 0 && !selectedEventId) {
      setSelectedEventId(events[0].id)
      localStorage.setItem("service_request_event_id", events[0].id)
    }
  }, [events])

  const handleOrgChange = (id: string) => {
    setSelectedOrgId(id)
    localStorage.setItem("service_request_org_id", id)
    setSelectedEventId("")
    localStorage.removeItem("service_request_event_id")
  }

  const handleEventChange = (id: string) => {
    setSelectedEventId(id)
    localStorage.setItem("service_request_event_id", id)
  }

  // Fetch KPI statistics and Kanban columns live from DB
  const { data: kpis, refetch: refetchKpis } = useServiceRequestsKpi(selectedEventId)
  const { data: columnsData, refetch: refetchKanban } = useServiceRequestsKanban(selectedEventId, 10, 0)
  
  // Users list for assignment
  const { data: usersData } = useGlobalUsers()
  const users = usersData?.items ?? []

  // Stepper pagination limits per column
  const [columnLimits, setColumnLimits] = useState<Record<string, number>>({
    draft: 10,
    submitted: 10,
    under_review: 10,
    quoted: 10,
    accepted: 10,
    cancelled: 10
  })

  // Create Service Request
  const createRequestMutation = useCreateServiceRequest()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newRequest, setNewRequest] = useState({
    title: "",
    description: "",
    priority: "MEDIUM",
    request_type: "CUSTOM",
    venue: "Main Hall A",
    attendees: 1000,
    assigned_to: ""
  })

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedEventId || !newRequest.title) return
    
    await createRequestMutation.mutateAsync({
      eventId: selectedEventId,
      title: newRequest.title,
      description: newRequest.description,
      priority: newRequest.priority,
      request_type: newRequest.request_type
    })

    setShowCreateModal(false)
    setNewRequest({
      title: "",
      description: "",
      priority: "MEDIUM",
      request_type: "CUSTOM",
      venue: "Main Hall A",
      attendees: 1000,
      assigned_to: ""
    })
    refetchKpis()
    refetchKanban()
  }

  const loadMore = (colKey: string) => {
    setColumnLimits(prev => ({
      ...prev,
      [colKey]: prev[colKey] + 10
    }))
  }

  return (
    <PageContainer>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 border-b border-border pb-4">
        <div>
          <h2 className="text-xl font-black text-primary">Service Requests</h2>
          <p className="text-[10px] text-tertiary">Real-time Kanban Dispatch & Operational Resource Triage</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Org Selector */}
          <div className="flex flex-col">
            <span className="text-[9px] uppercase tracking-wider font-extrabold text-secondary mb-1">Organization</span>
            <select
              value={selectedOrgId}
              onChange={e => handleOrgChange(e.target.value)}
              className="bg-surface-2 border border-border text-xs rounded-xl px-3 py-1.5 text-primary outline-none max-w-xs"
            >
              <option value="">Select Organization</option>
              {orgs.map((org: any) => (
                <option key={org.id} value={org.id}>{org.name}</option>
              ))}
            </select>
          </div>

          {/* Event Selector */}
          <div className="flex flex-col">
            <span className="text-[9px] uppercase tracking-wider font-extrabold text-secondary mb-1">Active Event</span>
            <select
              value={selectedEventId}
              onChange={e => handleEventChange(e.target.value)}
              className="bg-surface-2 border border-border text-xs rounded-xl px-3 py-1.5 text-primary outline-none max-w-xs"
            >
              <option value="">Select Event</option>
              {events.map(ev => (
                <option key={ev.id} value={ev.id}>{ev.name}</option>
              ))}
            </select>
          </div>

          <Button
            onClick={() => setShowCreateModal(true)}
            disabled={!selectedEventId}
            className="bg-brand-primary text-white text-xs font-bold gap-1 mt-4"
          >
            <Plus className="h-4 w-4" /> New Request
          </Button>
        </div>
      </div>

      {!selectedEventId ? (
        <Card className="p-12 text-center border-dashed border-border bg-surface-2/40 rounded-3xl">
          <div className="max-w-xs mx-auto space-y-3">
            <LayoutGrid className="h-10 w-10 text-tertiary mx-auto" />
            <h3 className="text-xs font-extrabold uppercase text-secondary">No Context Selected</h3>
            <p className="text-[10px] text-tertiary">Please select an organization and active event above to view the live service request pipeline.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-8">
          
          {/* KPI Strip */}
          {kpis && (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
              {Object.entries(kpis).map(([key, data]: [string, any]) => {
                const isPositive = data.pct_change >= 0
                return (
                  <Card key={key} className="p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-default)] flex flex-col justify-between h-24">
                    <span className="text-[9px] uppercase tracking-wider font-extrabold text-secondary block truncate">
                      {key.replace("_", " ")}
                    </span>
                    <div className="flex justify-between items-baseline mt-2">
                      <span className="text-lg font-black font-mono text-primary">{data.count}</span>
                      <span className={`text-[9px] font-bold flex items-center gap-0.5 ${isPositive ? "text-success" : "text-danger"}`}>
                        {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {Math.abs(data.pct_change)}%
                      </span>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}

          {/* Kanban Board */}
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4 overflow-x-auto pb-4">
            {["draft", "submitted", "under_review", "quoted", "accepted", "cancelled"].map(colKey => {
              const col = columnsData?.[colKey] || { count: 0, cards: [] }
              const limit = columnLimits[colKey]
              const visibleCards = col.cards.slice(0, limit)
              const remaining = col.count - visibleCards.length

              return (
                <div key={colKey} className="flex flex-col space-y-3 min-w-[240px]">
                  {/* Column Header */}
                  <div className="flex justify-between items-center p-3 rounded-2xl bg-surface-2 border border-border">
                    <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary">
                      {colKey.replace("_", " ")}
                    </span>
                    <span className="text-[10px] font-black text-brand-primary bg-brand-primary/10 border border-brand-primary/20 px-2 py-0.5 rounded-full">
                      {col.count}
                    </span>
                  </div>

                  {/* Cards List */}
                  <div className="space-y-3 flex-1 min-h-[400px]">
                    {visibleCards.map((card: any) => {
                      const priorityColor = 
                        card.priority === "HIGH" ? "bg-danger/10 text-danger border-danger/20" :
                        card.priority === "MEDIUM" ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
                        "bg-success/10 text-success border-success/20"

                      return (
                        <Card
                          key={card.id}
                          onClick={() => router.push(`/service-requests/${card.id}`)}
                          className="p-4 rounded-2xl border border-border bg-[var(--bg-surface)] hover:border-brand-primary/50 cursor-pointer transition-all space-y-3 shadow-sm hover:shadow-md select-none"
                        >
                          <div className="space-y-1">
                            <div className="flex justify-between items-start gap-2">
                              <h4 className="text-xs font-bold text-primary leading-snug line-clamp-2">{card.title}</h4>
                              <Badge className={`text-[8px] font-black uppercase border shrink-0 ${priorityColor}`}>
                                {card.priority}
                              </Badge>
                            </div>
                            <span className="text-[9px] text-tertiary block font-semibold">{card.org_name}</span>
                          </div>

                          <div className="space-y-1.5 pt-2 border-t border-border/40 text-[9px] text-secondary font-medium">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 text-tertiary" />
                              <span>
                                {card.start_date ? new Date(card.start_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "N/A"} - {card.end_date ? new Date(card.end_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "N/A"}
                              </span>
                            </div>
                            <div className="flex items-center justify-between pt-1">
                              <span className="text-tertiary font-bold">{timeAgo(card.created_at)}</span>
                              <span className="font-bold text-primary flex items-center gap-0.5">
                                <Users className="h-3 w-3 text-tertiary" /> {card.staff_count} Crew
                              </span>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-border/40 flex justify-between items-center text-[10px] font-bold">
                            <span className="text-secondary">Estimated Value</span>
                            <span className="text-brand-primary font-mono">{formatLakhRupee(card.estimated_value)}</span>
                          </div>
                        </Card>
                      )
                    })}

                    {/* Pagination load more */}
                    {remaining > 0 && (
                      <Button
                        variant="ghost"
                        onClick={() => loadMore(colKey)}
                        className="w-full text-[10px] text-brand-primary hover:text-brand-primary/80 font-extrabold uppercase py-2 bg-surface-2 rounded-xl"
                      >
                        + {remaining} More Requests
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

        </div>
      )}

      {/* New Request Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-6 w-full max-w-lg space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-border">
              <h3 className="text-sm font-black text-primary uppercase tracking-wider">Create New Service Request</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-secondary hover:text-primary">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateRequest} className="space-y-3.5 text-xs font-semibold text-secondary">
              <div>
                <label className="text-[10px] uppercase text-secondary mb-1 block">Request / Event Name *</label>
                <Input
                  required
                  value={newRequest.title}
                  onChange={e => setNewRequest(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g. Annual IT Tech Summit 2026"
                  className="bg-surface-2 border-border text-xs"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase text-secondary mb-1 block">Short Description</label>
                <textarea
                  value={newRequest.description}
                  onChange={e => setNewRequest(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Summarize the infrastructure requests..."
                  className="w-full h-20 bg-surface-2 border border-border rounded-xl p-2.5 text-xs text-primary outline-none focus:border-brand-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase text-secondary mb-1 block">Priority</label>
                  <select
                    value={newRequest.priority}
                    onChange={e => setNewRequest(prev => ({ ...prev, priority: e.target.value }))}
                    className="w-full bg-surface-2 border border-border text-xs rounded-xl px-3 py-1.5 text-primary outline-none"
                  >
                    <option value="LOW">Low (Green)</option>
                    <option value="MEDIUM">Medium (Orange)</option>
                    <option value="HIGH">High (Red)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase text-secondary mb-1 block">Expected Attendees</label>
                  <Input
                    type="number"
                    value={newRequest.attendees}
                    onChange={e => setNewRequest(prev => ({ ...prev, attendees: parseInt(e.target.value) || 0 }))}
                    className="bg-surface-2 border-border text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase text-secondary mb-1 block">Venue Name</label>
                  <Input
                    value={newRequest.venue}
                    onChange={e => setNewRequest(prev => ({ ...prev, venue: e.target.value }))}
                    className="bg-surface-2 border-border text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase text-secondary mb-1 block">Assign To Lead</label>
                  <select
                    value={newRequest.assigned_to}
                    onChange={e => setNewRequest(prev => ({ ...prev, assigned_to: e.target.value }))}
                    className="w-full bg-surface-2 border border-border text-xs rounded-xl px-3 py-1.5 text-primary outline-none"
                  >
                    <option value="">Select User</option>
                    {users.map((u: any) => (
                      <option key={u.id} value={u.id}>{u.full_name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-border">
                <Button type="button" variant="ghost" onClick={() => setShowCreateModal(false)} className="text-xs">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!newRequest.title}
                  className="bg-brand-primary text-white text-xs font-bold"
                >
                  Create Draft Request
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageContainer>
  )
}
