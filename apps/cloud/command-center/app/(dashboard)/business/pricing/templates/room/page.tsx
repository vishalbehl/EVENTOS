"use client"
import { useState, useMemo, Fragment } from "react"
import { useCatalogTemplates, useCreateTemplate, useUpdateTemplate,
         useDuplicateTemplate, useSetDefaultTemplate, useDeleteTemplate,
         useHardwareCatalog, useStaffCatalog, formatINR } from "@/services/super-admin-service"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader"
import { MetricRow } from "@/components/super-admin/ui/MetricRow"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Layout, Plus, Search, Edit, Copy, Check, Trash2, X, FileSpreadsheet, ArrowLeft } from "lucide-react"
import { useDebounce } from "@/hooks/use-debounce"
import Link from "next/link"

export default function RoomTemplatesPage() {
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

  // Hardware/Staff references for picker
  const { data: hardwareData } = useHardwareCatalog({ limit: 100 })
  const { data: staffData } = useStaffCatalog({ limit: 100 })

  const rawTemplates = data?.room_templates ?? []
  const hardwareList = hardwareData?.items ?? []
  const staffList = staffData?.items ?? []

  // Dynamic cost helper maps
  const hardwarePricesMap = useMemo(() => {
    const m: Record<string, number> = {}
    hardwareList.forEach((h: any) => {
      m[h.id] = h.selling_price || h.renting_price || 0
    })
    return m
  }, [hardwareList])

  const staffPricesMap = useMemo(() => {
    const m: Record<string, number> = {}
    staffList.forEach((s: any) => {
      m[s.id] = s.selling_per_day || s.daily_rate || 0
    })
    return m
  }, [staffList])

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
    const defaults = rawTemplates.filter(t => t.is_default).length
    const totalUsage = rawTemplates.reduce((acc, t) => acc + (t.usage_count || 0), 0)
    return [
      { label: 'Total Templates', value: total },
      { label: 'Active Templates', value: active },
      { label: 'Default Templates', value: defaults },
      { label: 'Total Usage (This Month)', value: totalUsage },
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
        title="Room Templates"
        description="Create and manage room setup templates for automatic planning"
        actions={
          <div className="flex gap-2">
            <div className="relative w-48 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-tertiary" />
              <Input
                placeholder="Search Room Templates..."
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
        <div className="text-sm text-secondary py-10 text-center">Loading room templates...</div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center py-20 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl">
          <Layout className="h-10 w-10 text-tertiary mb-3" />
          <h3 className="text-base font-bold text-primary">No room templates found</h3>
          <Button onClick={() => setShowCreateModal(true)} className="bg-brand-primary text-white mt-4 text-xs font-bold">
            Create First Room Template
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {templates.map((tpl: any) => {
            // Dynamic cost calculations
            const hardwareCost = (tpl.hardware_allocation || []).reduce((acc: number, a: any) => {
              const price = hardwarePricesMap[a.hardware_item_id] || 0
              return acc + (a.quantity * price)
            }, 0)

            const staffCost = (tpl.staff_allocation || []).reduce((acc: number, a: any) => {
              const price = staffPricesMap[a.staff_role_id] || 0
              return acc + (a.quantity * price)
            }, 0)

            const operationalCost = hardwareCost + staffCost

            return (
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
                      <span className="text-secondary">Room Type</span>
                      <span className="text-primary font-bold">{tpl.room_type || "N/A"}</span>
                    </div>
                    <div className="flex justify-between py-0.5">
                      <span className="text-secondary">Default Capacity</span>
                      <span className="text-primary font-bold font-mono">{tpl.default_capacity || 0} pax</span>
                    </div>
                    <div className="flex justify-between py-0.5">
                      <span className="text-secondary">Setup / Teardown</span>
                      <span className="text-primary font-bold font-mono">{tpl.setup_time || 0}h / {tpl.teardown_time || 0}h</span>
                    </div>
                    
                    <div className="h-px bg-border my-1.5" />
                    
                    <div className="flex justify-between py-0.5">
                      <span className="text-secondary">Total Hardware Cost</span>
                      <span className="text-secondary font-mono font-bold">{formatINR(hardwareCost)}</span>
                    </div>
                    <div className="flex justify-between py-0.5">
                      <span className="text-secondary">Total Crew Cost</span>
                      <span className="text-secondary font-mono font-bold">{formatINR(staffCost)}</span>
                    </div>
                    <div className="flex justify-between py-1 bg-success/5 px-2 rounded-lg border border-success/15 mt-1.5">
                      <span className="text-success font-extrabold text-[11px]">Total Op Cost</span>
                      <span className="text-success font-extrabold font-mono text-[11px]">{formatINR(operationalCost)}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex justify-between items-center">
                  <span className="text-[10px] text-tertiary font-semibold">Used {tpl.usage_count || 0} times</span>
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
            )
          })}
        </div>
      )}

      {/* Actions Dialog box */}
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

      {/* Create/Edit Modal Dialog Box */}
      {(showCreateModal || !!editingTemplate) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl relative">
            <TemplateForm
              item={editingTemplate}
              hardwareList={hardwareList}
              staffList={staffList}
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

function TemplateForm({ item, hardwareList, staffList, onSubmit, onClose, isLoading }: {
  item: any; hardwareList: any[]; staffList: any[]; onSubmit: (d: any) => Promise<void>
  onClose: () => void; isLoading: boolean
}) {
  const [form, setForm] = useState({
    name: item?.name ?? '',
    version: item?.version ?? 'v1.0',
    description_text: item?.description ?? '',
    is_default: item?.is_default ?? false,
    status: item?.is_active !== false ? 'ACTIVE' : 'INACTIVE',

    // Blueprint Specs
    room_type: item?.room_type ?? 'Conference Room',
    default_capacity: item?.default_capacity ?? '100',
    setup_time: item?.setup_time ?? '2',
    teardown_time: item?.teardown_time ?? '1',
    hardware_allocation: item?.hardware_allocation ?? [],
    staff_allocation: item?.staff_allocation ?? []
  })

  // Dynamic cost helper maps for inline price feedback
  const hardwarePricesMap = useMemo(() => {
    const m: Record<string, number> = {}
    hardwareList.forEach((h: any) => {
      m[h.id] = h.selling_price || h.renting_price || 0
    })
    return m
  }, [hardwareList])

  const staffPricesMap = useMemo(() => {
    const m: Record<string, number> = {}
    staffList.forEach((s: any) => {
      m[s.id] = s.selling_per_day || s.daily_rate || 0
    })
    return m
  }, [staffList])

  const [activeFormTab, setActiveFormTab] = useState<'general' | 'hardware' | 'staff'>('general')

  const groupedHardware = useMemo(() => {
    const groups: Record<string, any[]> = {}
    hardwareList.forEach((hw: any) => {
      const cat = hw.category_name || "Accessories"
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(hw)
    })
    return groups
  }, [hardwareList])

  const groupedStaff = useMemo(() => {
    const groups: Record<string, any[]> = {}
    staffList.forEach((st: any) => {
      const cat = st.team_category || st.department || "General Operations"
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(st)
    })
    return groups
  }, [staffList])

  const set = (k: string, v: any) => setForm(f => ({...f, [k]: v}))

  // Add allocation helpers
  const addHardwareAllocation = () => {
    set('hardware_allocation', [...form.hardware_allocation, { hardware_item_id: '', quantity: 1 }])
  }

  const removeHardwareAllocation = (index: number) => {
    const list = [...form.hardware_allocation]
    list.splice(index, 1)
    set('hardware_allocation', list)
  }

  const updateHardwareAllocation = (index: number, key: string, value: any) => {
    const list = [...form.hardware_allocation]
    list[index] = { ...list[index], [key]: value }
    set('hardware_allocation', list)
  }

  const addStaffAllocation = () => {
    set('staff_allocation', [...form.staff_allocation, { staff_role_id: '', quantity: 1 }])
  }

  const removeStaffAllocation = (index: number) => {
    const list = [...form.staff_allocation]
    list.splice(index, 1)
    set('staff_allocation', list)
  }

  const updateStaffAllocation = (index: number, key: string, value: any) => {
    const list = [...form.staff_allocation]
    list[index] = { ...list[index], [key]: value }
    set('staff_allocation', list)
  }

  const handleFormSubmit = () => {
    const specs = {
      room_type: form.room_type,
      default_capacity: parseInt(form.default_capacity as string) || 0,
      setup_time: parseFloat(form.setup_time as string) || 0,
      teardown_time: parseFloat(form.teardown_time as string) || 0,
      hardware_allocation: form.hardware_allocation.filter((h: any) => h.hardware_item_id),
      staff_allocation: form.staff_allocation.filter((s: any) => s.staff_role_id)
    }

    onSubmit({
      name: form.name,
      template_type: "room",
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
          {item ? 'Edit Room Blueprint' : 'Create Room Blueprint'}
        </h3>
        <button onClick={onClose} className="text-secondary hover:text-primary">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Form Tabs */}
      <div className="flex border-b border-border">
        {[
          { id: 'general', label: 'General & Operations' },
          { id: 'hardware', label: 'Hardware Allocation' },
          { id: 'staff', label: 'Crew Allocation' }
        ].map((tab: any) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveFormTab(tab.id)}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2
              ${activeFormTab === tab.id ? 'border-brand-primary text-brand-primary' : 'border-transparent text-secondary'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeFormTab === 'general' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-secondary mb-1 block font-semibold">Template Name *</label>
              <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Standard Conference Room" className="bg-surface-2 border-border text-xs" />
            </div>
            <div>
              <label className="text-xs text-secondary mb-1 block font-semibold">Room Type *</label>
              <select value={form.room_type} onChange={e => set('room_type', e.target.value)} className="w-full px-3 py-2 text-xs bg-surface-2 border border-border rounded-lg text-primary">
                <option value="Conference Room">Conference Room</option>
                <option value="Ballroom">Ballroom</option>
                <option value="Board Room">Board Room</option>
                <option value="Auditorium">Auditorium</option>
                <option value="Exhibition Hall">Exhibition Hall</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-secondary mb-1 block font-semibold">Default Capacity (Pax) *</label>
              <Input type="number" value={form.default_capacity} onChange={e => set('default_capacity', e.target.value)} className="bg-surface-2 border-border text-xs" />
            </div>
            <div>
              <label className="text-xs text-secondary mb-1 block font-semibold">Status *</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} className="w-full px-3 py-2 text-xs bg-surface-2 border border-border rounded-lg text-primary">
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-secondary mb-1 block font-semibold">Setup Time (Hours) *</label>
              <Input type="number" step="0.5" value={form.setup_time} onChange={e => set('setup_time', e.target.value)} className="bg-surface-2 border-border text-xs" />
            </div>
            <div>
              <label className="text-xs text-secondary mb-1 block font-semibold">Teardown Time (Hours) *</label>
              <Input type="number" step="0.5" value={form.teardown_time} onChange={e => set('teardown_time', e.target.value)} className="bg-surface-2 border-border text-xs" />
            </div>
          </div>
          <div>
            <label className="text-xs text-secondary mb-1 block font-semibold">Description</label>
            <textarea value={form.description_text} onChange={e => set('description_text', e.target.value)} placeholder="Enter details of this layout setup..." rows={3} className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs text-primary" />
          </div>
          <div className="flex items-center gap-2 pt-2">
            <input type="checkbox" id="is_default" checked={form.is_default} onChange={e => set('is_default', e.target.checked)} className="rounded h-4 w-4 bg-surface-2 border-border text-brand-primary" />
            <label htmlFor="is_default" className="text-xs text-secondary font-semibold cursor-pointer">Set as Organization Default Template</label>
          </div>
        </div>
      )}

      {activeFormTab === 'hardware' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-surface-2/40 p-3.5 rounded-xl border border-border">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-primary block">Hardware Asset Allocation</span>
              <span className="text-[10px] text-tertiary block">Assign physical catalog equipment to this blueprint</span>
            </div>
            <Button onClick={addHardwareAllocation} className="bg-brand-primary hover:bg-brand-primary/90 text-white h-8 gap-1 text-xs font-bold">
              <Plus className="h-3.5 w-3.5" /> Add Asset
            </Button>
          </div>

          <div className="border border-border rounded-xl overflow-hidden max-h-64 overflow-y-auto space-y-1 bg-surface-2/20 p-2">
            {form.hardware_allocation.map((alloc: any, idx: number) => (
              <div key={idx} className="flex gap-2 items-center bg-surface-2 p-2 rounded-lg border border-border">
                <select
                  value={alloc.hardware_item_id}
                  onChange={e => updateHardwareAllocation(idx, 'hardware_item_id', e.target.value)}
                  className="flex-1 px-2.5 py-1.5 text-xs bg-surface-3 border border-border rounded-lg text-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
                >
                  <option value="">Select Hardware Item</option>
                  {Object.keys(groupedHardware).sort().map((cat) => (
                    <Fragment key={cat}>
                      <option disabled className="bg-surface-1 text-brand-primary font-extrabold text-[10px] tracking-wider uppercase py-1 select-none">
                        📁 ─── {cat.toUpperCase()} ───
                      </option>
                      {groupedHardware[cat].map((hw: any) => (
                        <option key={hw.id} value={hw.id} className="text-primary bg-surface-3 py-1 font-medium">
                          &nbsp;&nbsp;• {hw.name} ({hw.item_code})
                        </option>
                      ))}
                    </Fragment>
                  ))}
                </select>

                <div className="w-20">
                  <Input
                    type="number"
                    min="1"
                    value={alloc.quantity}
                    onChange={e => updateHardwareAllocation(idx, 'quantity', parseInt(e.target.value) || 1)}
                    className="bg-surface-3 border-border h-8 text-xs font-mono"
                    placeholder="Qty"
                  />
                </div>

                <div className="w-24 text-right pr-1">
                  <span className="text-[9px] text-tertiary block font-semibold leading-none mb-1">Per Unit</span>
                  <span className="text-[11px] font-bold text-secondary font-mono">
                    {formatINR(hardwarePricesMap[alloc.hardware_item_id] || 0)}
                  </span>
                </div>

                <div className="w-28 text-right pr-1">
                  <span className="text-[9px] text-tertiary block font-semibold leading-none mb-1">Total Price</span>
                  <span className="text-[11px] font-bold text-brand-primary font-mono">
                    {formatINR((hardwarePricesMap[alloc.hardware_item_id] || 0) * (alloc.quantity || 0))}
                  </span>
                </div>

                <button onClick={() => removeHardwareAllocation(idx)} className="text-danger hover:text-danger/80 p-1.5 ml-1">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {form.hardware_allocation.length === 0 && (
              <div className="text-center p-8 text-tertiary text-xs">
                No hardware allocated to this blueprint
              </div>
            )}
          </div>
        </div>
      )}

      {activeFormTab === 'staff' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-surface-2/40 p-3.5 rounded-xl border border-border">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-primary block">Crew Manpower Allocation</span>
              <span className="text-[10px] text-tertiary block">Assign personnel catalog roles to this blueprint</span>
            </div>
            <Button onClick={addStaffAllocation} className="bg-brand-primary hover:bg-brand-primary/90 text-white h-8 gap-1 text-xs font-bold">
              <Plus className="h-3.5 w-3.5" /> Add Crew
            </Button>
          </div>

          <div className="border border-border rounded-xl overflow-hidden max-h-64 overflow-y-auto space-y-1 bg-surface-2/20 p-2">
            {form.staff_allocation.map((alloc: any, idx: number) => (
              <div key={idx} className="flex gap-2 items-center bg-surface-2 p-2 rounded-lg border border-border">
                <select
                  value={alloc.staff_role_id}
                  onChange={e => updateStaffAllocation(idx, 'staff_role_id', e.target.value)}
                  className="flex-1 px-2.5 py-1.5 text-xs bg-surface-3 border border-border rounded-lg text-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
                >
                  <option value="">Select Crew Role</option>
                  {Object.keys(groupedStaff).sort().map((cat) => (
                    <Fragment key={cat}>
                      <option disabled className="bg-surface-1 text-brand-primary font-extrabold text-[10px] tracking-wider uppercase py-1 select-none">
                        👥 ─── {cat.toUpperCase()} ───
                      </option>
                      {groupedStaff[cat].map((st: any) => (
                        <option key={st.id} value={st.id} className="text-primary bg-surface-3 py-1 font-medium">
                          &nbsp;&nbsp;• {st.name} ({st.role_code})
                        </option>
                      ))}
                    </Fragment>
                  ))}
                </select>

                <div className="w-20">
                  <Input
                    type="number"
                    min="1"
                    value={alloc.quantity}
                    onChange={e => updateStaffAllocation(idx, 'quantity', parseInt(e.target.value) || 1)}
                    className="bg-surface-3 border-border h-8 text-xs font-mono"
                    placeholder="Qty"
                  />
                </div>

                <div className="w-24 text-right pr-1">
                  <span className="text-[9px] text-tertiary block font-semibold leading-none mb-1">Per Unit</span>
                  <span className="text-[11px] font-bold text-secondary font-mono">
                    {formatINR(staffPricesMap[alloc.staff_role_id] || 0)}
                  </span>
                </div>

                <div className="w-28 text-right pr-1">
                  <span className="text-[9px] text-tertiary block font-semibold leading-none mb-1">Total Price</span>
                  <span className="text-[11px] font-bold text-brand-primary font-mono">
                    {formatINR((staffPricesMap[alloc.staff_role_id] || 0) * (alloc.quantity || 0))}
                  </span>
                </div>

                <button onClick={() => removeStaffAllocation(idx)} className="text-danger hover:text-danger/80 p-1.5 ml-1">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {form.staff_allocation.length === 0 && (
              <div className="text-center p-8 text-tertiary text-xs">
                No crew roles allocated to this blueprint
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-4 border-t border-border">
        <Button variant="ghost" onClick={onClose} className="text-xs text-secondary">
          Cancel
        </Button>
        <Button
          onClick={handleFormSubmit}
          disabled={isLoading || !form.name || !form.default_capacity}
          className="bg-brand-primary text-white text-xs font-bold px-4"
        >
          {isLoading ? 'Saving...' : item ? 'Update Blueprint' : 'Create Blueprint'}
        </Button>
      </div>
    </div>
  )
}
