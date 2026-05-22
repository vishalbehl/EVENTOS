'use client'

import { useEffect, useState } from 'react'
import { LayoutTemplate, Plus, RefreshCw, Save, Search, Tag, ToggleLeft, ToggleRight, X } from 'lucide-react'
import { apiClient } from '@/lib/api-client'
import { toast } from 'sonner'
import { useEvent, useUpdateEvent } from '@/hooks/useEvents'

const MASTER_ROLES: Record<string, { name: string; isDefault: boolean }[]> = {
  'General Attendees': [
    { name: 'Delegate', isDefault: true },
    { name: 'Student Delegate', isDefault: true },
    { name: 'Organizer', isDefault: true },
    { name: 'Faculty Delegate', isDefault: false },
    { name: 'Industry Professional', isDefault: false },
    { name: 'Research Scholar', isDefault: false },
    { name: 'International Delegate', isDefault: false },
    { name: 'Corporate Attendee', isDefault: false },
    { name: 'Government Representative', isDefault: false },
    { name: 'Academic Attendee', isDefault: false },
  ],
  'Presentation Related': [
    { name: 'Speaker', isDefault: true },
    { name: 'Keynote Speaker', isDefault: true },
    { name: 'Moderator', isDefault: true },
    { name: 'Speaker / Presenter', isDefault: false },
    { name: 'Invited Speaker', isDefault: false },
    { name: 'Panel Speaker', isDefault: false },
    { name: 'Session Chair', isDefault: false },
    { name: 'Workshop Instructor', isDefault: false },
  ],
  'Business & Partners': [
    { name: 'Sponsor Representative', isDefault: true },
    { name: 'Exhibitor', isDefault: true },
    { name: 'Partner Organization Member', isDefault: false },
    { name: 'Investor', isDefault: false },
    { name: 'Startup Founder', isDefault: false },
    { name: 'Recruiter / Hiring Partner', isDefault: false },
  ],
  'Media & Public Relations': [
    { name: 'Media', isDefault: true },
    { name: 'Media Representative', isDefault: false },
    { name: 'Journalist', isDefault: false },
    { name: 'Photographer', isDefault: false },
    { name: 'Videographer', isDefault: false },
    { name: 'Content Creator / Influencer', isDefault: false },
  ],
  'Event Operations': [
    { name: 'Volunteer', isDefault: true },
    { name: 'Technical Staff', isDefault: true },
    { name: 'AV Technician', isDefault: false },
    { name: 'Event Coordinator', isDefault: false },
    { name: 'Organizer Staff', isDefault: false },
    { name: 'Support Staff', isDefault: false },
  ],
  'Special Access': [
    { name: 'VIP Guest', isDefault: true },
    { name: 'Chief Guest', isDefault: false },
    { name: 'Guest of Honor', isDefault: false },
    { name: 'Jury Member', isDefault: false },
    { name: 'Advisory Board Member', isDefault: false },
    { name: 'Committee Member', isDefault: false },
  ],
  'Session Specific': [
    { name: 'Workshop Participant', isDefault: true },
    { name: 'Poster Presenter', isDefault: true },
    { name: 'Hands-on Training Participant', isDefault: false },
    { name: 'Competition Participant', isDefault: false },
    { name: 'ePoster Presenter', isDefault: false },
    { name: 'Networking Participant', isDefault: false },
  ],
}

const CATEGORIES = Object.keys(MASTER_ROLES)

const CAT_COLOR: Record<string, string> = {
  'General Attendees': 'text-blue-400 border-blue-400/25 bg-blue-400/8',
  'Presentation Related': 'text-[var(--pri)] border-[var(--pri)]/25 bg-[var(--pri)]/[0.08]',
  'Business & Partners': 'text-amber-400 border-amber-400/25 bg-amber-400/8',
  'Media & Public Relations': 'text-pink-400 border-pink-400/25 bg-pink-400/8',
  'Event Operations': 'text-emerald-400 border-emerald-400/25 bg-emerald-400/8',
  'Special Access': 'text-rose-400 border-rose-400/25 bg-rose-400/8',
  'Session Specific': 'text-cyan-400 border-cyan-400/25 bg-cyan-400/8',
}

interface Role {
  id: string
  category: string
  name: string
  role_code: string
  is_active: boolean
  is_default: boolean
}

interface PrintTemplate {
  id: string
  template_name: string
}

export default function RolesTab({ eventId }: { eventId: string }) {
  const { data: event } = useEvent(eventId)
  const updateEvent = useUpdateEvent(eventId)

  const [roles, setRoles] = useState<Role[]>([])
  const [templates, setTemplates] = useState<PrintTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [templateSaving, setTemplateSaving] = useState(false)
  const [pending, setPending] = useState<Record<string, boolean>>({})
  const [pendingCodes, setPendingCodes] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')

  const [customCat, setCustomCat] = useState('General Attendees')
  const [selectedRole, setSelectedRole] = useState('')
  const [customName, setCustomName] = useState('')
  const [customCode, setCustomCode] = useState('')
  const [adding, setAdding] = useState(false)

  const [useSameDesign, setUseSameDesign] = useState(true)
  const [defaultTemplateId, setDefaultTemplateId] = useState('')
  const [roleTemplateAssignments, setRoleTemplateAssignments] = useState<Record<string, string>>({})

  const disabledCategories = event?.registration_settings?.disabled_categories || []

  useEffect(() => {
    const badgeDesign = event?.registration_settings?.badge_design || {}
    setUseSameDesign(badgeDesign.use_same_design_for_all_users ?? true)
    setDefaultTemplateId(badgeDesign.default_template_id || '')
    setRoleTemplateAssignments(badgeDesign.role_template_assignments || {})
  }, [event?.registration_settings])

  useEffect(() => { load() }, [eventId])

  const load = async () => {
    setLoading(true)
    try {
      const [roleData, templateData] = await Promise.all([
        apiClient.get<Role[]>(`/events/${eventId}/registration/roles`),
        apiClient.get<PrintTemplate[]>(`/events/${eventId}/print-templates`),
      ])
      setRoles(roleData || [])
      setTemplates(templateData || [])
      setPending({})
      setPendingCodes({})
    } catch {
      toast.error('Failed to load roles and templates.')
    } finally {
      setLoading(false)
    }
  }

  const toggleCategoryVisibility = async (cat: string, isCurrentlyEnabled: boolean) => {
    if (!event) return
    let nextDisabled = [...(event.registration_settings?.disabled_categories || [])]
    if (isCurrentlyEnabled) {
      if (!nextDisabled.includes(cat)) nextDisabled.push(cat)
    } else {
      nextDisabled = nextDisabled.filter(c => c !== cat)
    }

    try {
      await updateEvent.mutateAsync({
        registration_settings: {
          ...(event.registration_settings || {}),
          disabled_categories: nextDisabled,
        }
      } as any)
      toast.success(`Category "${cat}" ${isCurrentlyEnabled ? 'hidden' : 'shown'} on registration portal.`)
    } catch {
      toast.error('Failed to update category visibility.')
    }
  }

  const saveTemplateSettings = async (overrides?: {
    useSameDesign?: boolean
    defaultTemplateId?: string
    assignments?: Record<string, string>
  }) => {
    if (!event) return
    const nextUseSameDesign = overrides?.useSameDesign ?? useSameDesign
    const nextDefaultTemplateId = overrides?.defaultTemplateId ?? defaultTemplateId
    const nextAssignments = overrides?.assignments ?? roleTemplateAssignments

    setTemplateSaving(true)
    try {
      await updateEvent.mutateAsync({
        registration_settings: {
          ...(event.registration_settings || {}),
          badge_design: {
            ...((event.registration_settings || {}).badge_design || {}),
            use_same_design_for_all_users: nextUseSameDesign,
            default_template_id: nextDefaultTemplateId || null,
            role_template_assignments: nextAssignments,
          },
        }
      } as any)
      toast.success('Role design assignment saved.')
    } catch {
      toast.error('Failed to save role design assignment.')
    } finally {
      setTemplateSaving(false)
    }
  }

  const existingNames = new Set(roles.map(r => r.name))
  const availableNonDefaults = (cat: string) =>
    (MASTER_ROLES[cat] || []).filter(r => !r.isDefault && !existingNames.has(r.name))

  const toggleRoleActive = (id: string, current: boolean) => {
    const next = !current
    setPending(p => ({ ...p, [id]: next }))
    setRoles(r => r.map(x => x.id === id ? { ...x, is_active: next } : x))
  }

  const updateRoleCode = (id: string, value: string) => {
    const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)
    setPendingCodes(prev => ({ ...prev, [id]: clean }))
    setRoles(prev => prev.map(role => role.id === id ? { ...role, role_code: clean } : role))
  }

  const saveChanges = async () => {
    if (!Object.keys(pending).length && !Object.keys(pendingCodes).length) {
      toast.info('No role changes.')
      return
    }
    setSaving(true)
    try {
      const ids = new Set([...Object.keys(pending), ...Object.keys(pendingCodes)])
      const updates = Array.from(ids).map(id => ({
        id,
        is_active: pending[id] ?? roles.find(role => role.id === id)?.is_active,
        role_code: pendingCodes[id] ?? roles.find(role => role.id === id)?.role_code,
      }))
      await apiClient.patch(`/events/${eventId}/registration/roles/bulk-toggle`, { updates })
      toast.success(`${updates.length} role update${updates.length === 1 ? '' : 's'} saved.`)
      setPending({})
      setPendingCodes({})
    } catch {
      toast.error('Failed to save role changes.')
    } finally {
      setSaving(false)
    }
  }

  const addRoleToEvent = async () => {
    const nameToAdd = selectedRole === 'custom' ? customName.trim() : selectedRole
    if (!nameToAdd) {
      toast.error('Please select or enter a role name.')
      return
    }

    setAdding(true)
    try {
      await apiClient.post(`/events/${eventId}/registration/roles`, {
        category: customCat,
        name: nameToAdd,
        role_code: customCode || nameToAdd.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase(),
        is_active: true,
        sort_order: 99,
      })
      toast.success(`"${nameToAdd}" added to this event.`)
      setSelectedRole('')
      setCustomName('')
      setCustomCode('')
      await load()
    } catch {
      toast.error('Failed to add role.')
    } finally {
      setAdding(false)
    }
  }

  const removeRoleFromEvent = async (id: string, name: string) => {
    try {
      await apiClient.delete(`/events/${eventId}/registration/roles/${id}`)
      setRoles(r => r.filter(x => x.id !== id))
      toast.success(`"${name}" removed from this event.`)
    } catch {
      toast.error('Cannot remove this role.')
    }
  }

  useEffect(() => {
    const av = availableNonDefaults(customCat)
    setSelectedRole(av.length > 0 ? av[0].name : 'custom')
  }, [customCat, roles])

  const pendingCount = new Set([...Object.keys(pending), ...Object.keys(pendingCodes)]).size
  const activeRoles = roles.filter(r => r.is_active).length
  const filteredRoles = roles.filter(r =>
    !search ||
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.category.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-5 max-w-7xl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Tag className="h-5 w-5 text-[var(--pri)]" />
          <div>
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)]">Delegate Role Types</h2>
            <p className="text-[10px] font-bold text-muted">
              {activeRoles}/{roles.length} roles enabled · assign print templates and portal visibility by row
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter roles..."
              className="h-9 pl-9 pr-4 w-44 bg-white/5 border border-white/5 rounded-xl text-xs font-bold text-[var(--text)] focus:border-[var(--pri)]/40 focus:ring-0 focus:outline-none transition-all"
            />
          </div>
          <button onClick={load} className="h-9 w-9 flex items-center justify-center bg-white/5 border border-white/5 rounded-xl text-muted hover:text-[var(--text)] hover:bg-white/10 transition-all">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={saveChanges}
            disabled={saving || pendingCount === 0}
            className="flex items-center gap-2 h-9 px-5 bg-[var(--pri)] hover:bg-[var(--pri-hover)] disabled:opacity-40 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
          >
            <Save className="h-3.5 w-3.5" />
            Save{pendingCount > 0 ? ` (${pendingCount})` : ''}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-muted animate-pulse text-xs font-black uppercase tracking-widest">Loading roles...</div>
      ) : (
        <div className="rounded-2xl border border-white/5 bg-white/[0.015] overflow-hidden">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 border-b border-white/5">
            <div className="flex items-center gap-3">
              <LayoutTemplate className="h-4 w-4 text-[var(--pri)]" />
              <div>
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text)]">Badge Design Assignment</h3>
                <p className="text-[9px] font-bold text-muted mt-0.5">Use one template for everyone or assign a separate template per role.</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <select
                value={defaultTemplateId}
                onChange={(e) => {
                  setDefaultTemplateId(e.target.value)
                  saveTemplateSettings({ defaultTemplateId: e.target.value })
                }}
                disabled={templateSaving || templates.length === 0}
                className="h-10 min-w-56 bg-white/5 border border-white/5 rounded-xl px-3 text-xs font-bold text-[var(--text)] focus:border-[var(--pri)]/40 focus:ring-0 focus:outline-none transition-all cursor-pointer disabled:opacity-40"
              >
                <option value="" className="bg-[var(--base)] text-[var(--text)]">Select default template</option>
                {templates.map(template => (
                  <option key={template.id} value={template.id} className="bg-[var(--base)] text-[var(--text)]">{template.template_name}</option>
                ))}
              </select>
              <button
                onClick={() => {
                  const next = !useSameDesign
                  setUseSameDesign(next)
                  saveTemplateSettings({ useSameDesign: next })
                }}
                disabled={templateSaving}
                className="flex items-center gap-2 h-10 px-4 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl transition-all disabled:opacity-40"
              >
                {useSameDesign ? <ToggleRight className="h-7 w-7 text-emerald-400" /> : <ToggleLeft className="h-7 w-7 text-muted/30" />}
                <span className="text-[9px] font-black uppercase tracking-[0.15em] text-muted">Same Design For All</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left">
              <thead className="bg-white/[0.025] border-b border-white/5">
                <tr className="text-[9px] font-black uppercase tracking-[0.18em] text-muted">
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3">Reg Code</th>
                  <th className="px-5 py-3">Template</th>
                  <th className="px-5 py-3 text-center">Role Active</th>
                  <th className="px-5 py-3 text-center">Portal Category</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredRoles.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-xs font-bold text-muted">No roles match your search.</td>
                  </tr>
                ) : filteredRoles.map(role => {
                  const colorCls = CAT_COLOR[role.category] || 'text-muted border-white/10 bg-white/5'
                  const [textCls] = colorCls.split(' ')
                  const categoryLive = !disabledCategories.includes(role.category)
                  return (
                    <tr key={role.id} className="hover:bg-white/[0.025] transition-colors">
                      <td className="px-5 py-4">
                        <span className={`inline-flex text-[9px] font-black px-2.5 py-1 rounded-full border ${colorCls}`}>{role.category}</span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`text-xs font-black ${role.is_active ? 'text-[var(--text)]' : 'text-muted/40 line-through'}`}>{role.name}</span>
                          {!role.is_default && <span className="text-[8px] font-black uppercase tracking-wider text-[var(--pri)] bg-[var(--pri)]/10 border border-[var(--pri)]/20 rounded-full px-2 py-0.5">Custom</span>}
                          {(pending[role.id] !== undefined || pendingCodes[role.id] !== undefined) && <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <input
                          value={role.role_code || ''}
                          onChange={(e) => updateRoleCode(role.id, e.target.value)}
                          className="h-9 w-24 bg-white/5 border border-white/5 rounded-xl px-3 text-xs font-black tracking-widest text-[var(--text)] focus:border-[var(--pri)]/40 focus:ring-0 focus:outline-none transition-all"
                          title="Registration number prefix for this role"
                        />
                      </td>
                      <td className="px-5 py-4">
                        <select
                          value={useSameDesign ? defaultTemplateId : (roleTemplateAssignments[role.id] || '')}
                          onChange={(e) => {
                            const nextAssignments = { ...roleTemplateAssignments, [role.id]: e.target.value }
                            if (!e.target.value) delete nextAssignments[role.id]
                            setRoleTemplateAssignments(nextAssignments)
                            saveTemplateSettings({ assignments: nextAssignments })
                          }}
                          disabled={useSameDesign || templateSaving || templates.length === 0}
                          className="h-9 w-full max-w-64 bg-white/5 border border-white/5 rounded-xl px-3 text-xs font-bold text-[var(--text)] focus:border-[var(--pri)]/40 focus:ring-0 focus:outline-none transition-all cursor-pointer disabled:opacity-45"
                        >
                          <option value="" className="bg-[var(--base)] text-[var(--text)]">Use default template</option>
                          {templates.map(template => (
                            <option key={template.id} value={template.id} className="bg-[var(--base)] text-[var(--text)]">{template.template_name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <button onClick={() => toggleRoleActive(role.id, role.is_active)} className="inline-flex transition-colors" title="Toggle role availability">
                          {role.is_active ? <ToggleRight className={`h-7 w-7 ${textCls}`} /> : <ToggleLeft className="h-7 w-7 text-muted/30" />}
                        </button>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <button onClick={() => toggleCategoryVisibility(role.category, categoryLive)} className="inline-flex transition-colors" title={categoryLive ? 'Hide this category on registration portal' : 'Show this category on registration portal'}>
                          {categoryLive ? <ToggleRight className={`h-7 w-7 ${textCls}`} /> : <ToggleLeft className="h-7 w-7 text-muted/30" />}
                        </button>
                      </td>
                      <td className="px-5 py-4 text-right">
                        {!role.is_default ? (
                          <button onClick={() => removeRoleFromEvent(role.id, role.name)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors" title="Remove role from this event">
                            <X className="h-4 w-4" />
                          </button>
                        ) : (
                          <span className="text-[9px] font-bold text-muted/45 uppercase tracking-wider">Default</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && !search && (
        <div className="glass-card rounded-2xl p-6 border border-white/5 space-y-4">
          <div>
            <h3 className="text-xs font-black uppercase tracking-[0.15em] text-[var(--text)]">Add Custom / Non-Default Role to Event</h3>
            <p className="text-[9px] font-bold text-muted mt-0.5">Select a category and choose a predefined role, or type a custom role name.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <label className="text-[9px] font-black uppercase tracking-wider text-muted">Category</label>
              <select value={customCat} onChange={e => setCustomCat(e.target.value)} className="w-full h-11 bg-white/5 border border-white/5 rounded-xl px-3 text-xs font-bold text-[var(--text)] focus:border-[var(--pri)]/40 focus:ring-0 focus:outline-none transition-all cursor-pointer">
                {CATEGORIES.map(c => <option key={c} value={c} className="bg-[var(--base)] text-[var(--text)]">{c}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] font-black uppercase tracking-wider text-muted">Role Catalogue</label>
              <select value={selectedRole} onChange={e => setSelectedRole(e.target.value)} className="w-full h-11 bg-white/5 border border-white/5 rounded-xl px-3 text-xs font-bold text-[var(--text)] focus:border-[var(--pri)]/40 focus:ring-0 focus:outline-none transition-all cursor-pointer">
                {availableNonDefaults(customCat).map(r => <option key={r.name} value={r.name} className="bg-[var(--base)] text-[var(--text)]">{r.name}</option>)}
                <option value="custom" className="bg-[var(--base)] text-[var(--pri)] font-bold">Type custom role name...</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] font-black uppercase tracking-wider text-muted">{selectedRole === 'custom' ? 'Enter Custom Role Name' : 'Custom Name'}</label>
              <input
                disabled={selectedRole !== 'custom'}
                value={selectedRole === 'custom' ? customName : ''}
                onChange={e => setCustomName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addRoleToEvent()}
                placeholder={selectedRole === 'custom' ? 'e.g. Industry Advisor' : 'Select custom to type'}
                className="w-full h-11 bg-white/5 border border-white/5 rounded-xl px-4 text-xs font-bold text-[var(--text)] disabled:opacity-40 disabled:cursor-not-allowed focus:border-[var(--pri)]/40 focus:ring-0 focus:outline-none transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] font-black uppercase tracking-wider text-muted">Reg Code</label>
              <input
                value={customCode}
                onChange={e => setCustomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
                placeholder="e.g. STU"
                className="w-full h-11 bg-white/5 border border-white/5 rounded-xl px-4 text-xs font-black tracking-widest text-[var(--text)] focus:border-[var(--pri)]/40 focus:ring-0 focus:outline-none transition-all"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button onClick={addRoleToEvent} disabled={adding} className="h-11 px-6 bg-[var(--pri)] hover:bg-[var(--pri-hover)] disabled:opacity-50 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2">
              <Plus className="h-4 w-4" /> Add Role to Event
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
