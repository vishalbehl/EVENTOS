import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  Globe, ToggleLeft, ToggleRight, Copy, Check, 
  Zap, Palette, ExternalLink, Info,
  Mail, Clock, Megaphone, FileText, Upload, X, Loader2, Save,
  Calendar, Phone
} from 'lucide-react'
import { useEvent, useUpdateEvent } from '@/hooks/useEvents'
import { apiClient } from '@/lib/api-client'
import { toast } from 'sonner'

const THEMES = [
  { id: 'midnight', label: 'Midnight', desc: 'Deep dark with violet accents', color: '#7c3aed', bg: '#0f0a1a' },
  { id: 'ocean',    label: 'Ocean',    desc: 'Cool blue, professional',        color: '#0ea5e9', bg: '#0c1b2e' },
  { id: 'emerald',  label: 'Emerald',  desc: 'Green growth, fresh feel',       color: '#10b981', bg: '#0a1a14' },
  { id: 'sunset',   label: 'Sunset',   desc: 'Warm amber, energetic',          color: '#f59e0b', bg: '#1a1200' },
  { id: 'rose',     label: 'Rose',     desc: 'Elegant pink, modern',           color: '#f43f5e', bg: '#1a0a10' },
  { id: 'slate',    label: 'Slate',    desc: 'Neutral, corporate clean',       color: '#94a3b8', bg: '#111827' },
]

export default function PortalTab({ eventId }: { eventId: string }) {
  const { data: event } = useEvent(eventId)
  const updateEvent = useUpdateEvent(eventId)
  const [isLive, setIsLive] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [copied, setCopied] = useState(false)
  const [selectedTheme, setSelectedTheme] = useState('midnight')

  const [supportEmail, setSupportEmail] = useState('')
  const [supportPhone, setSupportPhone] = useState('')
  const [additionalContacts, setAdditionalContacts] = useState<Array<{ id: string, type: 'email' | 'phone', value: string, label: string }>>([])
  const [editCutoffDate, setEditCutoffDate] = useState('')
  const [editCutoffDays, setEditCutoffDays] = useState(0)
  const [savingSettings, setSavingSettings] = useState(false)
  const [uploadingProgram, setUploadingProgram] = useState(false)

  useEffect(() => {
    if (event?.registration_settings) {
      setSupportEmail(event.registration_settings.support_email || '')
      setSupportPhone(event.registration_settings.support_phone || '')
      setAdditionalContacts(event.registration_settings.additional_contacts || [])
      setEditCutoffDays(event.registration_settings.edit_cutoff_days || 0)
      
      const dateVal = event.registration_settings.edit_cutoff_date || '';
      setEditCutoffDate(dateVal.split('T')[0]);
    }
  }, [event])

  useEffect(() => {
    const fetchPortalStatus = async () => {
      try {
        const res = await apiClient.get<any>(`/events/${eventId}/registration/form-config?t=${Date.now()}`)
        setIsLive(res.is_live || false)
      } catch (err) {
        console.error('Failed to fetch portal status:', err)
      }
    }

    if (eventId) {
      fetchPortalStatus()
    }
  }, [eventId])

  const portalUrl = `${process.env.NEXT_PUBLIC_REGISTRATION_URL || 'http://localhost:3003'}/${eventId}`

  const handleToggleLive = async () => {
    setToggling(true)
    try {
      const res = await apiClient.post<any>(`/events/${eventId}/registration/form-config`, {
        is_live: !isLive
      })
      setIsLive(res.is_live)
      toast.success(res.is_live ? 'Portal is now LIVE 🚀' : 'Portal set to Draft')
    } catch {
      toast.error('Failed to update portal status.')
    } finally {
      setToggling(false)
    }
  }

  const copyLink = () => {
    navigator.clipboard.writeText(portalUrl)
    setCopied(true)
    toast.success('Link copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSaveSettings = async () => {
    setSavingSettings(true)
    try {
      const currentSettings = event?.registration_settings || {}
      await updateEvent.mutateAsync({
        registration_settings: {
          ...currentSettings,
          support_email: supportEmail,
          support_phone: supportPhone,
          additional_contacts: additionalContacts,
          edit_cutoff_days: Number(editCutoffDays),
          edit_cutoff_date: editCutoffDate,
        }
      })
      toast.success('Registration settings updated successfully!')
    } catch {
      toast.error('Failed to update registration settings.')
    } finally {
      setSavingSettings(false)
    }
  }

  const handleProgramUpload = async (file: File) => {
    setUploadingProgram(true)
    try {
      const uploadForm = new FormData()
      uploadForm.append('file', file)
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'
      const res = await fetch(`${apiBase}/api/v1/portal/registration/${eventId}/upload`, {
        method: 'POST',
        body: uploadForm
      })
      if (!res.ok) throw new Error('Upload failed')
      const data = await res.json()
      if (data.status === 'success' && data.url) {
        const currentSettings = event?.registration_settings || {}
        await updateEvent.mutateAsync({
          registration_settings: {
            ...currentSettings,
            program_url: data.url
          }
        })
        toast.success('Program uploaded successfully!')
      } else {
        throw new Error('Invalid upload response')
      }
    } catch (err) {
      toast.error('Failed to upload event program.')
    } finally {
      setUploadingProgram(false)
    }
  }

  const handleDeleteProgram = async () => {
    try {
      const currentSettings = event?.registration_settings || {}
      const { program_url, ...rest } = currentSettings
      await updateEvent.mutateAsync({
        registration_settings: rest
      })
      toast.success('Program removed.')
    } catch {
      toast.error('Failed to remove program.')
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full max-w-7xl mx-auto">
      {/* Left Column: Status Card + General Settings Card */}
      <div className="space-y-6">
        {/* Status Card */}
        <div className="glass-card rounded-[2rem] p-8 border border-white/5 space-y-6">
          <div className="flex items-center gap-3">
            <Globe className="h-5 w-5 text-[var(--pri)]" />
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)]">Portal Status</h2>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 p-6 rounded-2xl bg-white/[0.03] border border-white/5">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className={`h-2.5 w-2.5 rounded-full ${isLive ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500/60'}`} />
                <span className={`text-sm font-black uppercase tracking-wider ${isLive ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isLive ? 'Live — Accepting Registrations' : 'Draft — Portal Hidden'}
                </span>
              </div>
              <p className="text-[10px] font-bold text-muted pl-4">
                {isLive
                  ? 'Participants can access and register via the portal link.'
                  : 'Portal is not publicly accessible. Switch to Live when ready.'}
              </p>
            </div>
            <button
              onClick={handleToggleLive}
              disabled={toggling}
              className={`flex items-center gap-3 px-8 py-3 rounded-full text-[11px] font-black uppercase tracking-widest transition-all shrink-0 ${
                isLive
                  ? 'bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20'
                  : 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-500/20'
              }`}
            >
              {isLive ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
              {isLive ? 'Set to Draft' : 'Go Live'}
            </button>
          </div>

          {/* Portal URL */}
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">Portal URL</p>
            <div className="flex items-center gap-3">
              <div className="flex-1 flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/5 font-mono text-xs text-muted overflow-hidden">
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[var(--pri)]" />
                <span className="truncate">{portalUrl}</span>
              </div>
              <button
                onClick={copyLink}
                className="flex items-center gap-2 px-5 py-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 text-[10px] font-black uppercase tracking-widest text-[var(--text)] transition-all shrink-0"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>

        {/* General Settings Card */}
        <div className="glass-card rounded-[2rem] p-8 border border-white/5 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-[var(--pri)]" />
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)]">General Settings</h2>
            </div>
            <button
              onClick={handleSaveSettings}
              disabled={savingSettings}
              className="flex items-center gap-2 h-9 px-6 bg-[var(--pri)] hover:bg-[var(--pri-hover)] text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50 transition-all"
            >
              {savingSettings ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save Settings
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted block">Primary Support Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                <input
                  type="email"
                  placeholder="support@event.com"
                  value={supportEmail}
                  onChange={e => setSupportEmail(e.target.value)}
                  className="w-full h-12 bg-[#080912] border border-white/10 focus:border-[var(--pri)] focus:ring-0 rounded-xl pl-12 pr-4 text-xs text-[var(--text)] font-semibold transition-all"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted block">Primary Support Phone</label>
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                <input
                  type="text"
                  placeholder="+1 (555) 000-0000"
                  value={supportPhone}
                  onChange={e => setSupportPhone(e.target.value)}
                  className="w-full h-12 bg-[#080912] border border-white/10 focus:border-[var(--pri)] focus:ring-0 rounded-xl pl-12 pr-4 text-xs text-[var(--text)] font-semibold transition-all"
                />
              </div>
            </div>
          </div>

          {/* Additional Support Contacts */}
          <div className="space-y-4">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted block">Additional Support Contacts</label>
            
            {additionalContacts.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {additionalContacts.map((contact, idx) => (
                  <div key={contact.id || idx} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                    <div className="h-8 w-8 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center text-muted">
                      {contact.type === 'email' ? <Mail className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-black uppercase tracking-wider text-[var(--pri)] block">
                        {contact.label || (contact.type === 'email' ? 'Alternate Email' : 'Alternate Phone')}
                      </span>
                      <span className="text-xs font-semibold text-[var(--text)] truncate block mt-0.5">{contact.value}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAdditionalContacts(prev => prev.filter((_, i) => i !== idx))}
                      className="p-1 rounded bg-white/5 hover:bg-rose-500/10 hover:text-rose-400 text-muted transition-all shrink-0"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs font-semibold text-muted italic">No additional support contacts configured.</p>
            )}

            {/* Composer for adding contacts */}
            <div className="flex flex-wrap items-end gap-3 p-4 rounded-xl bg-white/[0.01] border border-white/5 w-fit">
              <div className="space-y-1">
                <span className="text-[8px] font-black uppercase tracking-widest text-muted block">Contact Type</span>
                <select
                  id="new-contact-type"
                  className="h-10 bg-[#080912] border border-white/10 rounded-lg text-xs text-[var(--text)] px-3 focus:outline-none cursor-pointer"
                >
                  <option value="email">Email</option>
                  <option value="phone">Phone</option>
                </select>
              </div>
              <div className="space-y-1">
                <span className="text-[8px] font-black uppercase tracking-widest text-muted block">Label / Description</span>
                <input
                  id="new-contact-label"
                  type="text"
                  placeholder="e.g. Technical Help"
                  className="h-10 bg-[#080912] border border-white/10 rounded-lg text-xs text-[var(--text)] px-3 focus:outline-none w-36"
                />
              </div>
              <div className="space-y-1">
                <span className="text-[8px] font-black uppercase tracking-widest text-muted block">Value</span>
                <input
                  id="new-contact-value"
                  type="text"
                  placeholder="email or phone number"
                  className="h-10 bg-[#080912] border border-white/10 rounded-lg text-xs text-[var(--text)] px-3 focus:outline-none w-48"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  const typeEl = document.getElementById('new-contact-type') as HTMLSelectElement;
                  const labelEl = document.getElementById('new-contact-label') as HTMLInputElement;
                  const valEl = document.getElementById('new-contact-value') as HTMLInputElement;
                  if (!valEl.value.trim()) return;
                  setAdditionalContacts(prev => [
                    ...prev,
                    {
                      id: Math.random().toString(36).substring(2),
                      type: typeEl.value as 'email' | 'phone',
                      label: labelEl.value.trim(),
                      value: valEl.value.trim()
                    }
                  ]);
                  labelEl.value = '';
                  valEl.value = '';
                }}
                className="h-10 px-4 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-black uppercase tracking-widest text-[var(--text)]"
              >
                Add Contact
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-white/5">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted block">Last Registration Day (Cutoff Date)</label>
              <div className="relative">
                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                <input
                  type="date"
                  value={editCutoffDate}
                  onChange={e => setEditCutoffDate(e.target.value)}
                  className="w-full h-12 bg-[#080912] border border-white/10 focus:border-[var(--pri)] focus:ring-0 rounded-xl pl-12 pr-4 text-xs text-[var(--text)] font-semibold transition-all"
                />
              </div>
              <p className="text-[9px] font-bold text-muted mt-1 leading-relaxed">
                Lock attendee edits (e.g. name changes) and close online portal intake after this date. Leave empty to allow registration until the event starts.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Event Program Card + Theme Selector Card */}
      <div className="space-y-6">
        {/* Event Program Card */}
        <div className="glass-card rounded-[2rem] p-8 border border-white/5 space-y-6">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-[var(--pri)]" />
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)]">Event Program</h2>
          </div>

          {event?.registration_settings?.program_url ? (
            <div className="flex items-center justify-between p-6 rounded-2xl bg-emerald-500/5 border border-emerald-500/20">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-emerald-500/10 rounded-xl flex items-center justify-center border border-emerald-500/20 shrink-0">
                  <FileText className="h-5 w-5 text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black text-[var(--text)] uppercase tracking-wider">Program Document Active</p>
                  <a
                    href={event.registration_settings.program_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-[var(--pri)] font-bold hover:underline truncate block mt-0.5"
                  >
                    View Program File <ExternalLink className="inline h-3 w-3 mb-0.5 ml-0.5" />
                  </a>
                </div>
              </div>
              <button
                onClick={handleDeleteProgram}
                className="flex items-center justify-center p-2 rounded-xl bg-white/5 border border-white/5 hover:bg-rose-500/10 hover:border-rose-500/20 text-muted hover:text-rose-400 transition-all"
                title="Remove program file"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center border border-dashed border-white/10 hover:border-[var(--pri)]/40 rounded-[2rem] p-10 bg-white/5 hover:bg-white/[0.08] transition-all cursor-pointer relative group text-center">
              <input
                type="file"
                accept=".pdf,.docx,.doc,.xlsx,.xls"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) handleProgramUpload(file)
                }}
                disabled={uploadingProgram}
                className="hidden"
              />
              {uploadingProgram ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 text-[var(--pri)] animate-spin" />
                  <span className="text-[10px] font-black text-muted uppercase tracking-widest">Uploading program file...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <Upload className="h-8 w-8 text-[var(--pri)] group-hover:scale-110 transition-transform" />
                  <div>
                    <span className="text-xs font-black text-muted uppercase tracking-widest block">Upload Event Program</span>
                    <span className="text-[9px] font-bold text-muted/60 uppercase tracking-wider mt-1 block">Supports PDF, DOCX, XLSX (Max 10MB)</span>
                  </div>
                </div>
              )}
            </label>
          )}
        </div>

        {/* Theme Selector */}
        <div className="glass-card rounded-[2rem] p-8 border border-white/5 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Palette className="h-5 w-5 text-[var(--pri)]" />
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)]">Portal Theme</h2>
            </div>
            <span className="text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-[var(--pri)]/10 text-[var(--pri)] border border-[var(--pri)]/20">
              Coming Soon
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {THEMES.map(theme => (
              <button
                key={theme.id}
                onClick={() => setSelectedTheme(theme.id)}
                className={`relative p-4 rounded-2xl border transition-all text-left group overflow-hidden ${
                  selectedTheme === theme.id
                    ? 'border-[var(--pri)]/60 bg-[var(--pri)]/10'
                    : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.05] opacity-60'
                }`}
              >
                {/* Color preview */}
                <div
                  className="h-16 rounded-xl mb-3 flex items-center justify-center"
                  style={{ background: theme.bg }}
                >
                  <div className="h-6 w-6 rounded-full shadow-lg" style={{ background: theme.color }} />
                </div>
                <p className="text-xs font-black text-[var(--text)]">{theme.label}</p>
                <p className="text-[9px] font-bold text-muted mt-0.5">{theme.desc}</p>
                {selectedTheme === theme.id && (
                  <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-[var(--pri)] flex items-center justify-center">
                    <Check className="h-3 w-3 text-white" />
                  </div>
                )}
              </button>
            ))}
          </div>

          <div className="flex items-start gap-2.5 p-4 rounded-xl bg-white/[0.02] border border-white/5">
            <Info className="h-4 w-4 text-[var(--pri)] shrink-0 mt-0.5" />
            <p className="text-[10px] font-bold text-muted leading-relaxed">
              Theme customization will be available in a future update. Your selection will be saved and applied when released.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
