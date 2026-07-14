"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { 
  useAdminOrgs, useOrgEvents, useServiceRequestsKpi, 
  useServiceRequestsKanban, useCreateServiceRequest,
} from "@/services/super-admin-service"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { 
  Plus, Clock, LayoutGrid, X
} from "lucide-react"

import { timeAgo } from "@/lib/formatters"

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

  // Stepper pagination limits per column
  const [columnLimits, setColumnLimits] = useState<Record<string, number>>({
    draft: 10,
    submitted: 10,
    in_progress: 10,
    completed: 10,
    cancelled: 10
  })

  const requestedCardLimit = Math.max(10, ...Object.values(columnLimits))
  const { data: kpis, refetch: refetchKpis, isLoading: kpisLoading, error: kpisError } = useServiceRequestsKpi(selectedOrgId, selectedEventId)
  const { data: columnsData, refetch: refetchKanban, isLoading: kanbanLoading, error: kanbanError } = useServiceRequestsKanban(selectedOrgId, selectedEventId, requestedCardLimit, 0)

  // Create Service Request
  const createRequestMutation = useCreateServiceRequest()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newRequest, setNewRequest] = useState({
    title: "",
    description: "",
    priority: "MEDIUM",
    request_type: "CUSTOM",
  })

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedEventId || !newRequest.title) return
    
    await createRequestMutation.mutateAsync({
      eventId: selectedEventId,
      organizationId: selectedOrgId,
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
    })
    refetchKpis()
    refetchKanban()
  }

  const loadMore = (colKey: string) => {
    setColumnLimits(prev => ({
      ...prev,
      [colKey]: (prev[colKey] ?? 10) + 10
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
            <label htmlFor="service-request-organization" className="text-[9px] uppercase tracking-wider font-extrabold text-secondary mb-1">Organization</label>
            <select
              id="service-request-organization"
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
            <label htmlFor="service-request-event" className="text-[9px] uppercase tracking-wider font-extrabold text-secondary mb-1">Active Event</label>
            <select
              id="service-request-event"
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
          {kpisLoading && <p className="text-xs text-secondary" role="status">Loading service-request summary...</p>}
          {kpisError && <p className="rounded-xl border border-danger/20 bg-danger-muted p-3 text-xs text-danger" role="alert">Service-request summary could not be loaded.</p>}
          {kpis && (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
              {[
                { key: "total", count: kpis.total },
                { key: "open", count: kpis.open },
                ...Object.entries(kpis.status_counts).map(([key, count]) => ({ key: key.toLowerCase(), count })),
              ].map(({ key, count }) => (
                  <Card key={key} className="p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-default)] flex flex-col justify-between h-24">
                    <span className="text-[9px] uppercase tracking-wider font-extrabold text-secondary block truncate">
                      {key.replaceAll("_", " ")}
                    </span>
                    <span className="mt-2 text-lg font-black font-mono text-primary">{count}</span>
                  </Card>
              ))}
            </div>
          )}

          {/* Kanban Board */}
          {kanbanLoading && <p className="text-xs text-secondary" role="status">Loading service-request board...</p>}
          {kanbanError && <p className="rounded-xl border border-danger/20 bg-danger-muted p-3 text-xs text-danger" role="alert">Service-request board could not be loaded.</p>}
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4 overflow-x-auto pb-4">
            {(columnsData?.columns ?? []).map(col => {
              const colKey = col.key
              const limit = columnLimits[colKey]
              const visibleCards = col.cards.slice(0, limit ?? 10)
              const remaining = col.count - visibleCards.length

              return (
                <div key={colKey} className="flex flex-col space-y-3 min-w-[240px]">
                  {/* Column Header */}
                  <div className="flex justify-between items-center p-3 rounded-2xl bg-surface-2 border border-border">
                    <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary">
                      {col.label}
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
                        <Card key={card.id} className="rounded-2xl border border-border bg-[var(--bg-surface)] p-0 shadow-sm hover:border-brand-primary/50 hover:shadow-md">
                          <button
                            type="button"
                            onClick={() => router.push(`/business/sales/service-requests/${card.id}`)}
                            className="w-full space-y-3 p-4 text-left"
                          >
                          <div className="space-y-1">
                            <div className="flex justify-between items-start gap-2">
                              <h4 className="text-xs font-bold text-primary leading-snug line-clamp-2">{card.title}</h4>
                              <Badge className={`text-[8px] font-black uppercase border shrink-0 ${priorityColor}`}>
                                {card.priority}
                              </Badge>
                            </div>
                            <span className="text-[9px] text-tertiary block font-mono font-semibold">{card.request_number}</span>
                          </div>

                          <div className="space-y-1.5 pt-2 border-t border-border/40 text-[9px] text-secondary font-medium">
                            <div className="flex items-center gap-1.5">
                              <LayoutGrid className="h-3.5 w-3.5 text-tertiary" />
                              <span>{card.request_type.replaceAll("_", " ")}</span>
                            </div>
                            <div className="flex items-center justify-between pt-1">
                              <span className="flex items-center gap-1 text-tertiary font-bold"><Clock className="h-3 w-3" /> Updated {timeAgo(card.updated_at)}</span>
                              <span className="font-bold text-primary">{card.status.replaceAll("_", " ")}</span>
                            </div>
                          </div>
                          </button>
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
              <button type="button" aria-label="Close create request dialog" onClick={() => setShowCreateModal(false)} className="text-secondary hover:text-primary">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateRequest} className="space-y-3.5 text-xs font-semibold text-secondary">
              <div>
                <label htmlFor="service-request-title" className="text-[10px] uppercase text-secondary mb-1 block">Request name *</label>
                <Input
                  id="service-request-title"
                  required
                  value={newRequest.title}
                  onChange={e => setNewRequest(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g. Annual IT Tech Summit 2026"
                  className="bg-surface-2 border-border text-xs"
                />
              </div>

              <div>
                <label htmlFor="service-request-description" className="text-[10px] uppercase text-secondary mb-1 block">Short description</label>
                <textarea
                  id="service-request-description"
                  value={newRequest.description}
                  onChange={e => setNewRequest(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Summarize the infrastructure requests..."
                  className="w-full h-20 bg-surface-2 border border-border rounded-xl p-2.5 text-xs text-primary outline-none focus:border-brand-primary"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="service-request-priority" className="text-[10px] uppercase text-secondary mb-1 block">Priority</label>
                  <select
                    id="service-request-priority"
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
                  <label htmlFor="service-request-type" className="text-[10px] uppercase text-secondary mb-1 block">Request type</label>
                  <select
                    id="service-request-type"
                    value={newRequest.request_type}
                    onChange={e => setNewRequest(prev => ({ ...prev, request_type: e.target.value }))}
                    className="w-full bg-surface-2 border border-border text-xs rounded-xl px-3 py-1.5 text-primary outline-none"
                  >
                    <option value="CUSTOM">Custom</option>
                    <option value="SESSION_ROOM_TECH">Session room technology</option>
                    <option value="REGISTRATION_TECH">Registration technology</option>
                    <option value="NETWORK">Network</option>
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
