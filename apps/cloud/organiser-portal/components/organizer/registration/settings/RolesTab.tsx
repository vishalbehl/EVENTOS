'use client'

import { useEffect, useState } from 'react'
import { LayoutTemplate, Plus, RefreshCw, Save, Search, Tag, ToggleLeft, ToggleRight, X, Sparkles, Layers } from 'lucide-react'
import { apiClient } from '@/lib/api-client'
import { toast } from 'sonner'
import { useEvent, useUpdateEvent } from '@/hooks/useEvents'
import { useLimitAccess, useOperationAccess } from '@/lib/capabilities'

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

const CAT_COLOR: Record<string, { badge: string; text: string; dot: string }> = {
  'General Attendees': {
    badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    text: 'text-blue-400',
    dot: 'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.6)]',
  },
  'Presentation Related': {
    badge: 'bg-[var(--pri)]/10 text-[var(--pri)] border-[var(--pri)]/20',
    text: 'text-[var(--pri)]',
    dot: 'bg-[var(--pri)] shadow-[0_0_8px_rgba(204,255,0,0.6)]',
  },
  'Business & Partners': {
    badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    text: 'text-amber-400',
    dot: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]',
  },
  'Media & Public Relations': {
    badge: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
    text: 'text-pink-400',
    dot: 'bg-pink-400 shadow-[0_0_8px_rgba(244,114,182,0.6)]',
  },
  'Event Operations': {
    badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    text: 'text-emerald-400',
    dot: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]',
  },
  'Special Access': {
    badge: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    text: 'text-rose-400',
    dot: 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.6)]',
  },
  'Session Specific': {
    badge: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    text: 'text-cyan-400',
    dot: 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]',
  },
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
  const roleReadAccess = useOperationAccess('registration.ticket_types.read')
  const roleAccess = useOperationAccess('registration.ticket_types.manage')
  const roleLimitAccess = useLimitAccess('max_ticket_categories')
  const formAccess = useOperationAccess('registration.forms.manage')
  const badgeTemplateAccess = useOperationAccess('badges.templates.read')
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

  const disabledCategories: string[] = ((event?.registration_settings as Record<string, any>)?.disabled_categories as string[]) || []

  useEffect(() => {
    const badgeDesign = ((event?.registration_settings as Record<string, any>)?.badge_design as Record<string, any>) || {}
    setUseSameDesign(badgeDesign.use_same_design_for_all_users ?? true)
    setDefaultTemplateId((badgeDesign.default_template_id as string) || '')
    setRoleTemplateAssignments((badgeDesign.role_template_assignments as Record<string, string>) || {})
  }, [event?.registration_settings])

  useEffect(() => { load() }, [eventId, roleReadAccess.enabled, badgeTemplateAccess.enabled])

  const load = async () => {
    setLoading(true)
    try {
      const roleData = roleReadAccess.enabled
        ? await apiClient.get<Role[]>(`/events/${eventId}/registration/roles`)
        : []
      const templateData = badgeTemplateAccess.enabled
        ? await apiClient.get<PrintTemplate[]>(`/events/${eventId}/print-templates`)
        : []
      const badgeTemplates = (templateData || []).filter(t => (t as any).template_type !== 'certificate')
      setRoles(roleData || [])
      setTemplates(badgeTemplates)
      setPending({})
      setPendingCodes({})
    } catch {
      toast.error('Failed to load roles and templates.')
    } finally {
      setLoading(false)
    }
  }

  const toggleCategoryVisibility = async (cat: string, isCurrentlyEnabled: boolean) => {
    if (!event || !formAccess.enabled) return
    const currentDisabled: string[] = ((event.registration_settings as Record<string, any>)?.disabled_categories as string[]) || []
    let nextDisabled = [...currentDisabled]
    if (isCurrentlyEnabled) {
      if (!nextDisabled.includes(cat)) nextDisabled.push(cat)
    } else {
      nextDisabled = nextDisabled.filter(c => c !== cat)
    }

    try {
      await updateEvent.mutateAsync({
        registration_settings: {
          ...(event.registration_settings as Record<string, any> || {}),
          disabled_categories: nextDisabled,
        } as any
      })
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
    if (!event || !formAccess.enabled || !badgeTemplateAccess.enabled) return
    const nextUseSameDesign = overrides?.useSameDesign ?? useSameDesign
    const nextDefaultTemplateId = overrides?.defaultTemplateId ?? defaultTemplateId
    const nextAssignments = overrides?.assignments ?? roleTemplateAssignments
    const currentRS = (event.registration_settings as Record<string, any>) || {}
    const currentBadgeDesign = (currentRS.badge_design as Record<string, any>) || {}

    setTemplateSaving(true)
    try {
      await updateEvent.mutateAsync({
        registration_settings: {
          ...currentRS,
          badge_design: {
            ...currentBadgeDesign,
            use_same_design_for_all_users: nextUseSameDesign,
            default_template_id: nextDefaultTemplateId || null,
            role_template_assignments: nextAssignments,
          },
        } as any
      })
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
    if (!roleAccess.enabled) return
    const next = !current
    setPending(p => ({ ...p, [id]: next }))
    setRoles(r => r.map(x => x.id === id ? { ...x, is_active: next } : x))
  }

  const updateRoleCode = (id: string, value: string) => {
    if (!roleAccess.enabled) return
    const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)
    setPendingCodes(prev => ({ ...prev, [id]: clean }))
    setRoles(prev => prev.map(role => role.id === id ? { ...role, role_code: clean } : role))
  }

  const saveChanges = async () => {
    if (!roleAccess.enabled) return
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
    if (!roleAccess.enabled) return
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
      }, { headers: { "Idempotency-Key": crypto.randomUUID() } })
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
    if (!roleAccess.enabled) return
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
    <div className="w-full space-y-6 pb-16">
      {/* ── Top Header Toolbar ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#11131A]/90 border border-white/10 rounded-2xl p-5 backdrop-blur-xl shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="h-10 w-10 rounded-xl bg-[var(--pri)]/10 border border-[var(--pri)]/20 flex items-center justify-center shrink-0">
            <Tag className="h-5 w-5 text-[var(--pri)]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black uppercase tracking-[0.2em] text-[var(--text)]">Delegate Role Types</h2>
              <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-[var(--pri)]/10 text-[var(--pri)] border border-[var(--pri)]/20">
                {activeRoles} / {roles.length} Enabled
              </span>
            </div>
            <p className="text-[11px] font-semibold text-muted/70 mt-0.5">
              Manage participant role classifications, custom badge templates, and portal visibility by category
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted/50" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search roles or categories..."
              className="h-10 pl-10 pr-4 w-60 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-[var(--text)] focus:border-[var(--pri)]/50 focus:ring-0 focus:outline-none transition-all placeholder:text-muted/40"
            />
          </div>

          <button
            onClick={load}
            className="h-10 w-10 flex items-center justify-center bg-white/5 border border-white/10 rounded-xl text-muted hover:text-[var(--text)] hover:bg-white/10 transition-all cursor-pointer"
            title="Refresh roles"
          >
            <RefreshCw className="h-4 w-4" />
          </button>

          <button
            onClick={saveChanges}
            disabled={saving || pendingCount === 0 || !roleAccess.enabled}
            className="flex items-center gap-2 h-10 px-6 bg-[var(--pri)] hover:bg-[var(--pri-hover)] disabled:opacity-40 text-black font-black uppercase tracking-widest rounded-xl text-xs transition-all shadow-lg shadow-[var(--pri)]/20 cursor-pointer disabled:cursor-not-allowed"
          >
            <Save className="h-4 w-4" />
            Save Changes{pendingCount > 0 ? ` (${pendingCount})` : ''}
          </button>
        </div>
      </div>

      {/* ── Main Roles & Badge Assignment Card ── */}
      {loading ? (
        <div className="py-24 text-center text-muted animate-pulse text-xs font-black uppercase tracking-[0.25em] bg-[#11131A]/60 border border-white/10 rounded-2xl">
          Loading role catalogue...
        </div>
      ) : (
        <div className="w-full rounded-2xl border border-white/10 bg-[#11131A]/80 backdrop-blur-xl overflow-hidden shadow-2xl">
          {/* Badge Design Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-6 border-b border-white/10 bg-white/[0.01]">
            <div className="flex items-center gap-3.5">
              <div className="h-9 w-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
                <LayoutTemplate className="h-4.5 w-4.5 text-purple-400" />
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[var(--text)]">Badge Design Assignment</h3>
                <p className="text-[10px] font-semibold text-muted/70 mt-0.5">Use one default badge template for everyone or assign unique templates per role.</p>
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
                className="h-10 min-w-64 bg-white/5 border border-white/10 rounded-xl px-4 text-xs font-bold text-[var(--text)] focus:border-[var(--pri)]/50 focus:ring-0 focus:outline-none transition-all cursor-pointer disabled:opacity-40"
              >
                <option value="" className="bg-[#11131A] text-[var(--text)]">Select default badge template</option>
                {templates.map(template => (
                  <option key={template.id} value={template.id} className="bg-[#11131A] text-[var(--text)]">{template.template_name}</option>
                ))}
              </select>

              <button
                onClick={() => {
                  const next = !useSameDesign
                  setUseSameDesign(next)
                  saveTemplateSettings({ useSameDesign: next })
                }}
                disabled={templateSaving}
                className="flex items-center gap-3 h-10 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all disabled:opacity-40 cursor-pointer"
              >
                {useSameDesign ? <ToggleRight className="h-7 w-7 text-emerald-400" /> : <ToggleLeft className="h-7 w-7 text-muted/40" />}
                <span className="text-[10px] font-black uppercase tracking-[0.15em] text-muted">Same Design For All</span>
              </button>
            </div>
          </div>

          {/* Categories & Roles Catalogue */}
          <div className="divide-y divide-white/10">
            {filteredRoles.length === 0 ? (
              <div className="px-6 py-16 text-center text-xs font-bold text-muted/60">
                No roles match your search term.
              </div>
            ) : (
              CATEGORIES.map(category => {
                const catRoles = filteredRoles.filter(r => r.category === category)
                if (catRoles.length === 0) return null

                const style = CAT_COLOR[category] || {
                  badge: 'bg-white/10 text-muted border-white/10',
                  text: 'text-muted',
                  dot: 'bg-muted/40',
                }
                const categoryLive = !disabledCategories.includes(category)

                return (
                  <div key={category} className="p-6 space-y-4">
                    {/* Category Banner */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/[0.02] border border-white/10 rounded-2xl p-4">
                      <div className="flex items-center gap-3">
                        <span className={`h-2.5 w-2.5 rounded-full ${categoryLive ? style.dot : 'bg-muted/30'}`} />
                        <span className={`px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider border ${style.badge}`}>
                          {category}
                        </span>
                        <span className="text-[10px] font-bold text-muted/70">({catRoles.length} roles)</span>
                      </div>

                      <button
                        onClick={() => toggleCategoryVisibility(category, categoryLive)}
                        disabled={!formAccess.enabled}
                        className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all cursor-pointer disabled:opacity-40"
                        title={categoryLive ? 'Hide category on registration portal' : 'Show category on registration portal'}
                      >
                        {categoryLive ? <ToggleRight className="h-6 w-6 text-emerald-400" /> : <ToggleLeft className="h-6 w-6 text-muted/40" />}
                        <span className="text-[10px] font-black uppercase tracking-[0.15em] text-muted">Portal Category Visibility</span>
                      </button>
                    </div>

                    {/* Roles Table */}
                    <div className="w-full overflow-x-hidden rounded-xl border border-white/5 bg-white/[0.01]">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-white/10 bg-white/[0.02] text-[9px] font-black uppercase tracking-[0.2em] text-muted/70">
                            <th className="px-5 py-3.5">Role Name</th>
                            <th className="px-5 py-3.5 w-36">Reg Code</th>
                            <th className="px-5 py-3.5">Assigned Badge Template</th>
                            <th className="px-5 py-3.5 text-center w-32">Status</th>
                            <th className="px-5 py-3.5 text-right w-24">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-xs">
                          {catRoles.map(role => (
                            <tr key={role.id} className="hover:bg-white/[0.02] transition-colors">
                              <td className="px-5 py-4">
                                <div className="flex items-center gap-2.5">
                                  <span className={`font-bold ${role.is_active ? 'text-[var(--text)]' : 'text-muted/40 line-through'}`}>
                                    {role.name}
                                  </span>
                                  {!role.is_default && (
                                    <span className="text-[9px] font-black uppercase tracking-wider text-[var(--pri)] bg-[var(--pri)]/10 border border-[var(--pri)]/20 rounded-full px-2.5 py-0.5">
                                      Custom
                                    </span>
                                  )}
                                  {(pending[role.id] !== undefined || pendingCodes[role.id] !== undefined) && (
                                    <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse shrink-0" title="Unsaved change" />
                                  )}
                                </div>
                              </td>

                              <td className="px-5 py-4">
                                <input
                                  value={role.role_code || ''}
                                  onChange={(e) => updateRoleCode(role.id, e.target.value)}
                                  disabled={!roleAccess.enabled}
                                  className="h-9 w-28 bg-white/5 border border-white/10 rounded-xl px-3 text-xs font-black tracking-widest text-[var(--text)] focus:border-[var(--pri)]/50 focus:ring-0 focus:outline-none transition-all"
                                  title="Registration number prefix for this role"
                                />
                              </td>

                              <td className="px-5 py-4">
                                <select
                                  value={roleTemplateAssignments[role.id] || (useSameDesign ? defaultTemplateId : '')}
                                  onChange={(e) => {
                                    const nextTpl = e.target.value
                                    const nextAssignments = { ...roleTemplateAssignments, [role.id]: nextTpl }
                                    if (!nextTpl) delete nextAssignments[role.id]
                                    setRoleTemplateAssignments(nextAssignments)
                                    setUseSameDesign(false)
                                    saveTemplateSettings({ assignments: nextAssignments, useSameDesign: false })
                                  }}
                                  disabled={templateSaving || templates.length === 0}
                                  className="h-9 w-full max-w-72 bg-white/5 border border-white/10 rounded-xl px-3 text-xs font-bold text-[var(--text)] focus:border-[var(--pri)]/50 focus:ring-0 focus:outline-none transition-all cursor-pointer disabled:opacity-40"
                                >
                                  <option value="" className="bg-[#11131A] text-[var(--text)]">Use default template</option>
                                  {templates.map(template => (
                                    <option key={template.id} value={template.id} className="bg-[#11131A] text-[var(--text)]">{template.template_name}</option>
                                  ))}
                                </select>
                              </td>

                              <td className="px-5 py-4 text-center">
                                <button
                                  onClick={() => toggleRoleActive(role.id, role.is_active)}
                                  disabled={!roleAccess.enabled}
                                  className="inline-flex transition-transform hover:scale-105 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                                  title="Toggle role availability"
                                >
                                  {role.is_active ? <ToggleRight className={`h-7 w-7 ${style.text}`} /> : <ToggleLeft className="h-7 w-7 text-muted/30" />}
                                </button>
                              </td>

                              <td className="px-5 py-4 text-right">
                                {!role.is_default ? (
                                  <button
                                    onClick={() => removeRoleFromEvent(role.id, role.name)}
                                    disabled={!roleAccess.enabled}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                                    title="Remove role from this event"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                ) : (
                                  <span className="text-[10px] font-bold text-muted/40 uppercase tracking-wider">Default</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* ── Add Custom / Non-Default Role Panel ── */}
      {!loading && !search && (
        <div className="w-full rounded-2xl border border-white/10 bg-[#11131A]/80 backdrop-blur-xl p-6 shadow-2xl space-y-5">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-[var(--pri)]/10 border border-[var(--pri)]/20 flex items-center justify-center shrink-0">
              <Plus className="h-4 w-4 text-[var(--pri)]" />
            </div>
            <div>
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[var(--text)]">Add Custom / Non-Default Role to Event</h3>
              <p className="text-[10px] font-semibold text-muted/70 mt-0.5">Select a category and pick a predefined catalogue role or enter a custom role name.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-muted">Category</label>
              <select
                value={customCat}
                onChange={e => setCustomCat(e.target.value)}
                className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-3 text-xs font-bold text-[var(--text)] focus:border-[var(--pri)]/50 focus:ring-0 focus:outline-none transition-all cursor-pointer"
              >
                {CATEGORIES.map(c => <option key={c} value={c} className="bg-[#11131A] text-[var(--text)]">{c}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-muted">Role Catalogue</label>
              <select
                value={selectedRole}
                onChange={e => setSelectedRole(e.target.value)}
                className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-3 text-xs font-bold text-[var(--text)] focus:border-[var(--pri)]/50 focus:ring-0 focus:outline-none transition-all cursor-pointer"
              >
                {availableNonDefaults(customCat).map(r => <option key={r.name} value={r.name} className="bg-[#11131A] text-[var(--text)]">{r.name}</option>)}
                <option value="custom" className="bg-[#11131A] text-[var(--pri)] font-bold">Type custom role name...</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-muted">
                {selectedRole === 'custom' ? 'Custom Role Name' : 'Custom Name'}
              </label>
              <input
                disabled={selectedRole !== 'custom'}
                value={selectedRole === 'custom' ? customName : ''}
                onChange={e => setCustomName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addRoleToEvent()}
                placeholder={selectedRole === 'custom' ? 'e.g. Industry Advisor' : 'Select custom to type'}
                className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-4 text-xs font-bold text-[var(--text)] disabled:opacity-40 disabled:cursor-not-allowed focus:border-[var(--pri)]/50 focus:ring-0 focus:outline-none transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-muted">Reg Code</label>
              <input
                value={customCode}
                onChange={e => setCustomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
                placeholder="e.g. ADV"
                className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-4 text-xs font-black tracking-widest text-[var(--text)] focus:border-[var(--pri)]/50 focus:ring-0 focus:outline-none transition-all"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={addRoleToEvent}
              disabled={
                adding
                || !roleAccess.enabled
                || roleLimitAccess.loading
                || !roleLimitAccess.enabled
              }
              title={
                roleLimitAccess.enabled
                  ? undefined
                  : `Unavailable: ${(roleLimitAccess.reason || 'RESOLUTION_UNAVAILABLE').replaceAll('_', ' ').toLowerCase()}`
              }
              className="h-11 px-8 bg-[var(--pri)] hover:bg-[var(--pri-hover)] disabled:opacity-40 text-black font-black uppercase tracking-widest rounded-xl text-xs transition-all shadow-lg shadow-[var(--pri)]/20 cursor-pointer disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Plus className="h-4 w-4" /> Add Role to Event
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
