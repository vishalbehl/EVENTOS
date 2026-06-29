"use client"
import { useState, useMemo } from "react"
import { useCatalogTemplates, useCreateTemplate, useUpdateTemplate,
         useDuplicateTemplate, useSetDefaultTemplate, useDeleteTemplate } from "@/services/super-admin-service"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader"
import { MetricRow } from "@/components/super-admin/ui/MetricRow"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Network, Plus, Search, Edit, Copy, Check, Trash2, X, ArrowLeft } from "lucide-react"
import { useDebounce } from "@/hooks/use-debounce"
import Link from "next/link"

export default function NetworkTemplatesPage() {
  const [search, setSearch] = useState("")
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<any>(null)
  const [showActionsFor, setShowActionsFor] = useState<any>(null)
  
  const debouncedSearch = useDebounce(search, 300)

  const { data, isLoading } = useCatalogTemplates()
  const createTemplate = useCreateTemplate()
  const updateTemplate = useUpdateTemplate()
  const duplicateTemplate = useDuplicateTemplate()
  const setDefaultTemplate = useSetDefaultTemplate()
  const deleteTemplate = useDeleteTemplate()

  const rawTemplates = data?.network_templates ?? []

  // Filter templates
  const templates = useMemo(() => {
    if (!debouncedSearch) return rawTemplates
    return rawTemplates.filter(t => 
      t.name.toLowerCase().includes(debouncedSearch.toLowerCase()) || 
      (t.description && t.description.toLowerCase().includes(debouncedSearch.toLowerCase()))
    )
  }, [rawTemplates, debouncedSearch])

  // KPIs
  const kpis = useMemo(() => {
    const total = rawTemplates.length
    const active = rawTemplates.filter(t => t.is_active).length
    const totalAPs = rawTemplates.reduce((acc, t) => acc + (t.access_points ?? 0), 0)
    
    // Sum network capacities
    let totalCapGbps = 0
    rawTemplates.forEach(t => {
      if (t.network_capacity) {
        const val = parseFloat(t.network_capacity) || 0
        totalCapGbps += val
      }
    })
    return [
      { label: 'Total Templates', value: total },
      { label: 'Active Templates', value: active },
      { label: 'Total Access Points', value: totalAPs },
      { label: 'Total Network Capacity', value: `${totalCapGbps} Gbps` },
    ]
  }, [rawTemplates])

  return (
    <PageContainer>
      <div className="mb-4">
        <Link href="/commercial/templates" className="inline-flex items-center gap-1.5 text-xs text-secondary hover:text-primary transition-colors font-bold uppercase tracking-wider">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Templates Library
        </Link>
      </div>
      <SectionHeader
        title="Network Templates"
        description="Manage venue networking and infrastructure templates"
        actions={
          <div className="flex gap-2">
            <div className="relative w-48 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-tertiary" />
              <Input
                placeholder="Search Network Templates..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 bg-surface-2 border-border h-9 text-xs"
              />
            </div>
            <Button
              onClick={() => setShowCreateModal(true)}
              className="bg-brand-primary hover:bg-brand-primary/90 text-white gap-2 h-9 text-xs font-bold"
            >
              <Plus className="h-4 w-4" />
              New Template
            </Button>
          </div>
        }
      />

      {/* KPI Cards */}
      <MetricRow metrics={kpis} />

      {/* Template Cards Grid */}
      {isLoading ? (
        <div className="text-sm text-secondary py-10 text-center">Loading network templates...</div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center py-20 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl">
          <Network className="h-10 w-10 text-tertiary mb-3" />
          <h3 className="text-base font-bold text-primary">No network templates found</h3>
          <Button onClick={() => setShowCreateModal(true)} className="bg-brand-primary text-white mt-4 text-xs font-bold">
            Create First Network Template
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {templates.map((tpl: any) => (
            <div
              key={tpl.slug}
              className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-5 shadow-sm flex flex-col justify-between hover:border-brand-primary/45 transition-colors relative"
            >
              <div className="space-y-4">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <h4 className="text-xs font-extrabold text-primary uppercase tracking-wide">{tpl.name}</h4>
                    <span className="text-[10px] text-tertiary font-medium">Version {tpl.version}</span>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {tpl.is_default && (
                      <Badge className="bg-success-muted/20 text-success border border-success/30 text-[9px] px-1 py-0 font-bold">
                        Default
                      </Badge>
                    )}
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border
                      ${tpl.is_active ? 'bg-success-muted/20 text-success border-success/30' : 'bg-surface-2 text-tertiary border-border'}`}>
                      {tpl.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>

                {tpl.description && (
                  <p className="text-xs text-secondary line-clamp-2 leading-relaxed">{tpl.description}</p>
                )}

                <div className="bg-[var(--bg-surface-2)] border border-[var(--border-subtle)] rounded-2xl p-3 space-y-2 text-xs font-medium">
                  <div className="flex justify-between py-0.5">
                    <span className="text-secondary">Venue Capacity</span>
                    <span className="text-primary font-bold font-mono">{tpl.venue_capacity || 'Up to 500'}</span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span className="text-secondary">Access Points</span>
                    <span className="text-primary font-bold font-mono">{tpl.access_points ?? 0}</span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span className="text-secondary">Switches</span>
                    <span className="text-primary font-bold font-mono">{tpl.switches ?? 0}</span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span className="text-secondary">Redundancy</span>
                    <span className="text-primary font-bold">{tpl.redundancy ?? 'Basic'}</span>
                  </div>
                  <div className="flex justify-between py-0.5 border-t border-border/40 pt-1.5">
                    <span className="text-secondary">Backhaul Bandwidth</span>
                    <span className="text-success font-extrabold font-mono">{tpl.network_capacity ?? '1 Gbps'}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex justify-between items-center">
                <span className="text-[10px] text-tertiary font-mono">Used {tpl.usage_count || 0} times</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowActionsFor(tpl)}
                  className="text-xs h-8 font-bold border-border text-secondary hover:text-primary bg-surface-2"
                >
                  Manage
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pop-up Actions Dialog box */}
      {showActionsFor && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-6 w-full max-w-sm space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-border">
              <h3 className="text-sm font-extrabold text-primary uppercase tracking-wider">Template Actions</h3>
              <button onClick={() => setShowActionsFor(null)} className="text-secondary hover:text-primary">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <Button
                onClick={() => {
                  setEditingTemplate(showActionsFor)
                  setShowActionsFor(null)
                }}
                variant="outline"
                className="w-full text-xs font-bold gap-2 justify-start h-10 border-border text-secondary hover:text-primary"
              >
                <Edit className="h-4 w-4" />
                Edit Template Configuration
              </Button>

              <Button
                onClick={async () => {
                  await duplicateTemplate.mutateAsync(showActionsFor.slug)
                  setShowActionsFor(null)
                }}
                variant="outline"
                className="w-full text-xs font-bold gap-2 justify-start h-10 border-border text-secondary hover:text-primary"
              >
                <Copy className="h-4 w-4" />
                Duplicate Preset
              </Button>

              {!showActionsFor.is_default && (
                <Button
                  onClick={async () => {
                    await setDefaultTemplate.mutateAsync(showActionsFor.slug)
                    setShowActionsFor(null)
                  }}
                  variant="outline"
                  className="w-full text-xs font-bold gap-2 justify-start h-10 border-border text-secondary hover:text-primary"
                >
                  <Check className="h-4 w-4" />
                  Set as Organization Default
                </Button>
              )}

              <Button
                onClick={async () => {
                  if (confirm("Are you sure you want to delete this template?")) {
                    await deleteTemplate.mutateAsync(showActionsFor.slug)
                    setShowActionsFor(null)
                  }
                }}
                variant="outline"
                className="w-full text-xs font-bold gap-2 justify-start h-10 border-danger/30 text-danger hover:bg-danger/5"
              >
                <Trash2 className="h-4 w-4" />
                Archive / Delete Preset
              </Button>
            </div>

            <div className="pt-2 border-t border-border flex justify-end">
              <Button onClick={() => setShowActionsFor(null)} variant="ghost" className="text-xs text-secondary">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Pop-up window: Create/Edit Modal Dialog Box */}
      {(showCreateModal || !!editingTemplate) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl relative">
            <TemplateForm
              item={editingTemplate}
              onSubmit={async (formData) => {
                if (editingTemplate) {
                  await updateTemplate.mutateAsync({ slug: editingTemplate.slug, ...formData })
                } else {
                  await createTemplate.mutateAsync(formData)
                }
                setShowCreateModal(false)
                setEditingTemplate(null)
              }}
              onClose={() => {
                setShowCreateModal(false)
                setEditingTemplate(null)
              }}
              isLoading={createTemplate.isPending || updateTemplate.isPending}
            />
          </div>
        </div>
      )}
    </PageContainer>
  )
}

function TemplateForm({ item, onSubmit, onClose, isLoading }: {
  item: any; onSubmit: (d: any) => Promise<void>; onClose: () => void; isLoading: boolean
}) {
  const [form, setForm] = useState({
    name: item?.name ?? '',
    version: item?.version ?? 'v1.0',
    description_text: item?.description ?? '',
    is_default: item?.is_default ?? false,
    status: item?.is_active ? 'ACTIVE' : 'ACTIVE',

    // Infrastructure
    internet_links: item?.internet_links ?? '2',
    network_capacity: item?.network_capacity ?? '1 Gbps',
    isp_type: item?.isp_type ?? 'Dual Fiber Active-Passive',
    primary_router: item?.primary_router ?? 'Cisco Catalyst 8300',
    backup_router: item?.backup_router ?? 'Cisco Catalyst 8200',
    firewall: item?.firewall ?? 'FortiGate 100F',
    core_switches: item?.core_switches ?? '1',
    dist_switches: item?.dist_switches ?? '2',
    access_switches: item?.access_switches ?? '4',
    access_points: item?.access_points ?? '12',
    controllers: item?.controllers ?? 'Cloud Controller',

    // Connectivity VLANs
    reg_vlan: item?.reg_vlan ?? 'VLAN 10 - Registration (10.10.10.0/24)',
    srr_vlan: item?.srr_vlan ?? 'VLAN 20 - Speaker Ready (10.10.20.0/24)',
    org_vlan: item?.org_vlan ?? 'VLAN 30 - Organizer (10.10.30.0/24)',
    prod_vlan: item?.prod_vlan ?? 'VLAN 40 - Production (10.10.40.0/24)',
    guest_wifi: item?.guest_wifi ?? 'VLAN 50 - Guest (10.10.50.0/22)',
    exhibitor_network: item?.exhibitor_network ?? 'VLAN 60 - Exhibitor (10.10.60.0/23)',
    streaming_network: item?.streaming_network ?? 'VLAN 70 - Streaming (10.10.70.0/24)',

    // Monitoring
    monitoring_tool: item?.monitoring_tool ?? 'Zabbix / Grafana',
    alerts: item?.alerts ?? 'Slack + SMS Notifications',
    logging: item?.logging ?? 'Syslog Server',
    redundancy_level: item?.redundancy ?? 'High (Dual ISP + Dual Router)',
    failover_time: item?.failover_time ?? '< 3 seconds',

    venue_capacity: item?.venue_capacity ?? '500-2000'
  })

  const [activeFormTab, setActiveFormTab] = useState<'general' | 'infrastructure' | 'vlans' | 'redundancy'>('general')

  const set = (k: string, v: any) => setForm(f => ({...f, [k]: v}))

  const handleFormSubmit = () => {
    const specs = {
      venue_capacity: form.venue_capacity,
      internet_links: parseInt(form.internet_links) || 0,
      network_capacity: form.network_capacity,
      isp_type: form.isp_type,
      primary_router: form.primary_router,
      backup_router: form.backup_router,
      firewall: form.firewall,
      core_switches: parseInt(form.core_switches) || 0,
      dist_switches: parseInt(form.dist_switches) || 0,
      access_switches: parseInt(form.access_switches) || 0,
      access_points: parseInt(form.access_points) || 0,
      controllers: form.controllers,
      reg_vlan: form.reg_vlan,
      srr_vlan: form.srr_vlan,
      org_vlan: form.org_vlan,
      prod_vlan: form.prod_vlan,
      guest_wifi: form.guest_wifi,
      exhibitor_network: form.exhibitor_network,
      streaming_network: form.streaming_network,
      monitoring_tool: form.monitoring_tool,
      alerts: form.alerts,
      logging: form.logging,
      redundancy: form.redundancy_level,
      failover_time: form.failover_time
    }

    onSubmit({
      name: form.name,
      template_type: "network",
      description_text: form.description_text,
      version: form.version,
      is_default: form.is_default,
      specs,
      status: form.status
    })
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-center pb-2 border-b border-border">
        <h3 className="text-base font-extrabold text-primary">
          {item ? 'Edit Network Template' : 'Create Network Template'}
        </h3>
        <button onClick={onClose} className="text-secondary hover:text-primary">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {['general', 'infrastructure', 'vlans', 'redundancy'].map((tab: any) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveFormTab(tab)}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2
              ${activeFormTab === tab ? 'border-brand-primary text-brand-primary' : 'border-transparent text-secondary'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeFormTab === 'general' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-secondary mb-1 block font-semibold">Template Name *</label>
              <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="High Density Gigabit Wireless" className="bg-surface-2 border-border text-xs" />
            </div>
            <div>
              <label className="text-xs text-secondary mb-1 block font-semibold">Version *</label>
              <Input value={form.version} onChange={e => set('version', e.target.value)} placeholder="v1.0" className="bg-surface-2 border-border text-xs" />
            </div>
            <div>
              <label className="text-xs text-secondary mb-1 block font-semibold">Venue Capacity Category</label>
              <select value={form.venue_capacity} onChange={e => set('venue_capacity', e.target.value)} className="w-full px-3 py-2 text-xs bg-surface-2 border border-border rounded-lg text-primary">
                <option value="Up to 500">Up to 500 Attendees</option>
                <option value="500-2000">500-2000 Attendees</option>
                <option value="2000-8000">2000-8000 Attendees</option>
                <option value="Multi Floor">Multi Floor Venue</option>
              </select>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input type="checkbox" id="is_default" checked={form.is_default} onChange={e => set('is_default', e.target.checked)} className="rounded h-4 w-4 bg-surface-2 border-border" />
              <label htmlFor="is_default" className="text-xs text-secondary font-semibold">Set as default setup</label>
            </div>
          </div>
          <div>
            <label className="text-xs text-secondary mb-1 block font-semibold">Description</label>
            <textarea value={form.description_text} onChange={e => set('description_text', e.target.value)} placeholder="Network design constraints and notes..." rows={3} className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs text-primary" />
          </div>
        </div>
      )}

      {activeFormTab === 'infrastructure' && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-secondary mb-1 block font-semibold">Internet Links Count</label>
            <Input type="number" value={form.internet_links} onChange={e => set('internet_links', e.target.value)} className="bg-surface-2 border-border text-xs" />
          </div>
          <div>
            <label className="text-xs text-secondary mb-1 block font-semibold">Total Bandwidth (e.g. 10 Gbps) *</label>
            <Input value={form.network_capacity} onChange={e => set('network_capacity', e.target.value)} className="bg-surface-2 border-border text-xs" />
          </div>
          <div>
            <label className="text-xs text-secondary mb-1 block font-semibold">ISP Connection Type</label>
            <Input value={form.isp_type} onChange={e => set('isp_type', e.target.value)} className="bg-surface-2 border-border text-xs" />
          </div>
          <div>
            <label className="text-xs text-secondary mb-1 block font-semibold">Primary Gateway Router</label>
            <Input value={form.primary_router} onChange={e => set('primary_router', e.target.value)} className="bg-surface-2 border-border text-xs" />
          </div>
          <div>
            <label className="text-xs text-secondary mb-1 block font-semibold">Backup Gateway Router</label>
            <Input value={form.backup_router} onChange={e => set('backup_router', e.target.value)} className="bg-surface-2 border-border text-xs" />
          </div>
          <div>
            <label className="text-xs text-secondary mb-1 block font-semibold">Next-Gen Firewall</label>
            <Input value={form.firewall} onChange={e => set('firewall', e.target.value)} className="bg-surface-2 border-border text-xs" />
          </div>
          <div>
            <label className="text-xs text-secondary mb-1 block font-semibold">Core Switches</label>
            <Input type="number" value={form.core_switches} onChange={e => set('core_switches', e.target.value)} className="bg-surface-2 border-border text-xs" />
          </div>
          <div>
            <label className="text-xs text-secondary mb-1 block font-semibold">Access Points Count</label>
            <Input type="number" value={form.access_points} onChange={e => set('access_points', e.target.value)} className="bg-surface-2 border-border text-xs" />
          </div>
        </div>
      )}

      {activeFormTab === 'vlans' && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-secondary mb-1 block font-semibold">Registration VLAN</label>
            <Input value={form.reg_vlan} onChange={e => set('reg_vlan', e.target.value)} className="bg-surface-2 border-border text-xs" />
          </div>
          <div>
            <label className="text-xs text-secondary mb-1 block font-semibold">Speaker Ready Room VLAN</label>
            <Input value={form.srr_vlan} onChange={e => set('srr_vlan', e.target.value)} className="bg-surface-2 border-border text-xs" />
          </div>
          <div>
            <label className="text-xs text-secondary mb-1 block font-semibold">Organizer VLAN</label>
            <Input value={form.org_vlan} onChange={e => set('org_vlan', e.target.value)} className="bg-surface-2 border-border text-xs" />
          </div>
          <div>
            <label className="text-xs text-secondary mb-1 block font-semibold">Production VLAN</label>
            <Input value={form.prod_vlan} onChange={e => set('prod_vlan', e.target.value)} className="bg-surface-2 border-border text-xs" />
          </div>
          <div>
            <label className="text-xs text-secondary mb-1 block font-semibold">Guest WiFi Network</label>
            <Input value={form.guest_wifi} onChange={e => set('guest_wifi', e.target.value)} className="bg-surface-2 border-border text-xs" />
          </div>
          <div>
            <label className="text-xs text-secondary mb-1 block font-semibold">Streaming Network VLAN</label>
            <Input value={form.streaming_network} onChange={e => set('streaming_network', e.target.value)} className="bg-surface-2 border-border text-xs" />
          </div>
        </div>
      )}

      {activeFormTab === 'redundancy' && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-secondary mb-1 block font-semibold">Monitoring System</label>
            <Input value={form.monitoring_tool} onChange={e => set('monitoring_tool', e.target.value)} className="bg-surface-2 border-border text-xs" />
          </div>
          <div>
            <label className="text-xs text-secondary mb-1 block font-semibold">Alerting Mechanism</label>
            <Input value={form.alerts} onChange={e => set('alerts', e.target.value)} className="bg-surface-2 border-border text-xs" />
          </div>
          <div>
            <label className="text-xs text-secondary mb-1 block font-semibold">Logging Repository</label>
            <Input value={form.logging} onChange={e => set('logging', e.target.value)} className="bg-surface-2 border-border text-xs" />
          </div>
          <div>
            <label className="text-xs text-secondary mb-1 block font-semibold">Redundancy Level</label>
            <Input value={form.redundancy_level} onChange={e => set('redundancy_level', e.target.value)} className="bg-surface-2 border-border text-xs" />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-secondary mb-1 block font-semibold">Failover Trigger Time</label>
            <Input value={form.failover_time} onChange={e => set('failover_time', e.target.value)} placeholder="< 3 seconds" className="bg-surface-2 border-border text-xs" />
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-4 border-t border-border">
        <Button variant="ghost" onClick={onClose} className="text-xs text-secondary">
          Cancel
        </Button>
        <Button
          onClick={handleFormSubmit}
          disabled={isLoading || !form.name || !form.network_capacity}
          className="bg-brand-primary text-white text-xs font-bold"
        >
          {isLoading ? 'Saving...' : item ? 'Update Template' : 'Create Template'}
        </Button>
      </div>
    </div>
  )
}
