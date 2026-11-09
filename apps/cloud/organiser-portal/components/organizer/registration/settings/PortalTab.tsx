import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { 
  Globe, ToggleLeft, ToggleRight, Copy, Check, 
  Zap, Palette, ExternalLink, Info,
  Mail, Clock, Megaphone, FileText, Upload, X, Loader2, Save,
  Calendar, Phone, Sparkles, Layout, Sliders, CheckCircle2
} from 'lucide-react'
import { useUpdateEvent } from '@/hooks/useEvents'
import { useEventEditSession } from '@/hooks/useEventEditSession'
import { apiClient, type ApiError } from '@/lib/api-client'
import { toast } from 'sonner'
import { useOperationAccess } from '@/lib/capabilities'
import { uploadAndWaitForScan, requiresNewUploadAttempt } from '@/services/scan-gated-upload-service'

const PRESET_PALETTES = [
  {
    id: 'dark-luxury',
    name: 'AI Summit Dark Luxury',
    primary: '#6366F1',
    secondary: '#8B5CF6',
    bg: '#080912',
    accent: '#4F46E5',
    desc: 'Deep obsidian backdrop with glowing violet ambient particles'
  },
  {
    id: 'cyber-emerald',
    name: 'Cyber Emerald',
    primary: '#10B981',
    secondary: '#059669',
    bg: '#051b14',
    accent: '#34D399',
    desc: 'Tech-forward emerald with high contrast dark jade surfaces'
  },
  {
    id: 'royal-azure',
    name: 'Royal Azure',
    primary: '#3B82F6',
    secondary: '#2563EB',
    bg: '#0a1128',
    accent: '#60A5FA',
    desc: 'Classic deep sapphire enterprise theme with electric blue accents'
  },
  {
    id: 'midnight-crimson',
    name: 'Midnight Crimson',
    primary: '#F43F5E',
    secondary: '#E11D48',
    bg: '#18070d',
    accent: '#FB7185',
    desc: 'Dramatic ruby dark aesthetic for high-impact innovation summits'
  },
  {
    id: 'executive-titanium',
    name: 'Executive Titanium',
    primary: '#64748B',
    secondary: '#475569',
    bg: '#0f172a',
    accent: '#94A3B8',
    desc: 'Minimalist sleek slate palette for corporate governance events'
  }
]

export default function PortalTab({ eventId }: { eventId: string }) {
  const planningAccess = useOperationAccess('events.planning.manage')
  const formAccess = useOperationAccess('registration.forms.manage')
  const themeAccess = useOperationAccess('branding.theme.manage')
  const colorAccess = useOperationAccess('branding.colors.manage')
  const edit = useEventEditSession(eventId)
  const { event } = edit
  const [loadedEvent, setLoadedEvent] = useState<typeof event>()
  const loadedScope = useRef<string | null>(null)
  const updateEvent = useUpdateEvent(eventId, edit.version)
  const [portalStatus, setPortalStatus] = useState<{ scope: string; is_live: boolean; version: number } | null>(null)
  const status = portalStatus?.scope === edit.scope ? portalStatus : null
  const isLive = status?.is_live ?? false
  const [statusError, setStatusError] = useState<string | null>(null)
  const [statusRefresh, setStatusRefresh] = useState(0)
  const statusReceipt = useRef<{ fingerprint: string; key: string } | null>(null)
  const programReceipt = useRef<{ file: File; scope: string; key: string; managedUrl?: string } | null>(null)
  const [toggling, setToggling] = useState(false)
  const [copied, setCopied] = useState(false)

  const [supportEmail, setSupportEmail] = useState('')
  const [supportPhone, setSupportPhone] = useState('')
  const [additionalContacts, setAdditionalContacts] = useState<Array<{ id: string, type: 'email' | 'phone', value: string, label: string }>>([])
  const [editCutoffDate, setEditCutoffDate] = useState('')
  const [editCutoffDays, setEditCutoffDays] = useState(0)
  
  // Theme & Hero Branding State
  const [selectedPreset, setSelectedPreset] = useState('dark-luxury')
  const [primaryColor, setPrimaryColor] = useState('#6366F1')
  const [secondaryColor, setSecondaryColor] = useState('#8B5CF6')
  const [tagline, setTagline] = useState('Shape the future of intelligence.')
  const [heroDescription, setHeroDescription] = useState('Join industry leaders, innovators, and AI enthusiasts for a day of insights, innovation and inspiration.')
  const [stat1, setStat1] = useState('1 Day Conference')
  const [stat2, setStat2] = useState('8 Tracks')
  const [stat3, setStat3] = useState('42 Sessions')
  const [stat4, setStat4] = useState('38 Speakers')

  const savingSettings = updateEvent.isPending
  const [uploadingProgram, setUploadingProgram] = useState(false)

  useEffect(() => {
    if (event && edit.dirty && loadedScope.current === edit.scope) {
      setLoadedEvent(event)
      return
    }
    if (event?.registration_settings) {
      const rs = event.registration_settings as Record<string, any>
      setSupportEmail((rs.support_email as string) || '')
      setSupportPhone((rs.support_phone as string) || '')
      setAdditionalContacts((rs.additional_contacts as Array<{ id: string, type: 'email' | 'phone', value: string, label: string }>) || [])
      setEditCutoffDays((rs.edit_cutoff_days as number) || 0)
      
      const dateVal = (rs.edit_cutoff_date as string) || '';
      setEditCutoffDate(dateVal.split('T')[0]);

      setTagline(rs.tagline || '')
      setHeroDescription(rs.description || '')

      const tc = rs.theme_config || {}
      setSelectedPreset(tc.preset || 'dark-luxury')
      setPrimaryColor(tc.primary_color || event.theme_color || '#6366F1')
      setSecondaryColor(tc.secondary_color || '#8B5CF6')

      if (Array.isArray(rs.stats) && rs.stats.length >= 4) {
        setStat1(rs.stats[0]?.label || '1 Day Conference')
        setStat2(rs.stats[1]?.label || '8 Tracks')
        setStat3(rs.stats[2]?.label || '42 Sessions')
        setStat4(rs.stats[3]?.label || '38 Speakers')
      } else {
        setStat1(''); setStat2(''); setStat3(''); setStat4('')
      }
      setLoadedEvent(event)
      loadedScope.current = edit.scope
    } else if ((event as any)?.theme_color) {
      setPrimaryColor((event as any).theme_color)
    }
  }, [event, edit.scope])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setPortalStatus(null)
    setStatusError(null)
    setToggling(false)
    setUploadingProgram(false)
    const fetchPortalStatus = async () => {
      try {
        const res = await apiClient.get<{ is_live: boolean; version: number }>(`/events/${eventId}/registration/form-config`, { signal: controller.signal })
        if (active && edit.isCurrent()) setPortalStatus({ scope: edit.scope, is_live: res.is_live, version: res.version })
      } catch (err) {
        if (active && edit.isCurrent()) setStatusError((err as ApiError).message || 'Portal status unavailable.')
      }
    }

    if (edit.ready) {
      fetchPortalStatus()
    }
    return () => { active = false; controller.abort() }
  }, [eventId, edit.scope, edit.ready, statusRefresh])

  const portalUrl = `${process.env.NEXT_PUBLIC_REGISTRATION_URL || 'http://localhost:3003'}/${eventId}`

  const handleToggleLive = async () => {
    if (!status || toggling || !formAccess.enabled) return
    setToggling(true)
    try {
      const fingerprint = JSON.stringify([edit.scope, status.version, !isLive])
      if (statusReceipt.current?.fingerprint !== fingerprint) statusReceipt.current = { fingerprint, key: crypto.randomUUID() }
      const res = await apiClient.post<{ is_live: boolean; version: number }>(`/events/${eventId}/registration/portal-status`, {
        is_live: !isLive
      }, { headers: { 'If-Match': String(status.version), 'Idempotency-Key': statusReceipt.current.key } })
      if (!edit.isCurrent()) return
      statusReceipt.current = null
      setPortalStatus({ scope: edit.scope, ...res })
      toast.success(res.is_live ? 'Portal is now LIVE 🚀' : 'Portal set to Draft')
    } catch (err) {
      if (edit.isCurrent()) toast.error((err as ApiError).message || 'Failed to update portal status.')
    } finally {
      if (edit.isCurrent()) setToggling(false)
    }
  }

  const copyLink = () => {
    navigator.clipboard.writeText(portalUrl)
    setCopied(true)
    toast.success('Link copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSelectPreset = (preset: typeof PRESET_PALETTES[0]) => {
    edit.markDirty()
    setSelectedPreset(preset.id)
    setPrimaryColor(preset.primary)
    setSecondaryColor(preset.secondary)
  }

  const handleSaveSettings = async () => {
    if (!edit.ready || savingSettings || uploadingProgram || !planningAccess.enabled
        || !formAccess.enabled || !themeAccess.enabled || !colorAccess.enabled) return
    try {
      const saved = await updateEvent.mutateAsync({
        theme_color: primaryColor,
        registration_settings: {
          support_email: supportEmail,
          support_phone: supportPhone,
          additional_contacts: additionalContacts,
          edit_cutoff_days: Number(editCutoffDays),
          edit_cutoff_date: editCutoffDate,
          tagline,
          description: heroDescription,
          stats: [
            { label: stat1, icon: 'calendar' },
            { label: stat2, icon: 'tracks' },
            { label: stat3, icon: 'sessions' },
            { label: stat4, icon: 'speakers' }
          ],
          theme_config: {
            preset: selectedPreset,
            primary_color: primaryColor,
            secondary_color: secondaryColor,
            dark_mode_default: true
          }
        }
      })
      if (!edit.complete(saved)) return
      toast.success('Portal design & theme settings updated successfully! 🎨')
    } catch (err) {
      if (edit.isCurrent()) toast.error((err as ApiError).message || 'Failed to update registration settings. Your edits are preserved.')
    }
  }

  const handleProgramUpload = async (file: File) => {
    if (!edit.ready || savingSettings || uploadingProgram || !formAccess.enabled) return
    edit.markDirty()
    setUploadingProgram(true)
    let requestReceiptKey: string | undefined
    try {
      if (programReceipt.current?.file !== file || programReceipt.current.scope !== edit.scope) {
        programReceipt.current = { file, scope: edit.scope, key: crypto.randomUUID() }
      }
      const receipt = programReceipt.current
      requestReceiptKey = receipt.key
      const managedUrl = receipt.managedUrl || (await uploadAndWaitForScan({
        eventId,
        file,
        staffProgram: true,
        idempotencyKey: receipt.key,
      })).managed_url
      if (!edit.isCurrent()) return
      if (managedUrl) {
        receipt.managedUrl = managedUrl
        const saved = await updateEvent.mutateAsync({
          registration_settings: {
            program_url: managedUrl
          }
        })
        if (!edit.complete(saved, true)) return
        programReceipt.current = null
        toast.success('Program uploaded successfully!')
      } else {
        throw new Error('Invalid upload response')
      }
    } catch (err) {
      if (edit.isCurrent()) {
        if (requiresNewUploadAttempt(err) && programReceipt.current?.key === requestReceiptKey) programReceipt.current = null
        toast.error((err as ApiError).message || 'Failed to attach event program. Your edits are preserved.')
      }
    } finally {
      if (edit.isCurrent()) setUploadingProgram(false)
    }
  }

  const handleDeleteProgram = async () => {
    if (!edit.ready || savingSettings || uploadingProgram || !formAccess.enabled) return
    try {
      const saved = await updateEvent.mutateAsync({
        registration_settings: { program_url: '' }
      })
      if (!edit.complete(saved, true)) return
      toast.success('Program removed.')
    } catch (err) {
      if (edit.isCurrent()) toast.error((err as ApiError).message || 'Failed to remove program.')
    }
  }

  if (!edit.ready || loadedEvent !== event) return <p role={edit.error ? 'alert' : 'status'}>{edit.error || 'Loading current portal settings…'}</p>

  return (
    <fieldset disabled={savingSettings || uploadingProgram || toggling || edit.reloading} onChangeCapture={edit.markDirty} className="space-y-6 w-full max-w-7xl mx-auto min-w-0">
      <button type="button" onClick={async () => { await edit.reload(); if (edit.isCurrent()) setStatusRefresh(value => value + 1) }} className="text-xs underline">Discard edits and reload settings/status</button>
      {edit.error && <p role="alert">{edit.error}</p>}
      {statusError && <p role="alert">{statusError}</p>}
      {programReceipt.current?.scope === edit.scope && (
        <button type="button" onClick={() => {
          const pending = programReceipt.current
          if (pending?.scope === edit.scope) void handleProgramUpload(pending.file)
        }} disabled={savingSettings || uploadingProgram || !formAccess.enabled || !planningAccess.enabled}
          className="text-xs underline">
          Retry pending program upload
        </button>
      )}
      {/* ── Top Portal Status & Action Banner ── */}
      <div className="glass-card rounded-[2rem] p-6 md:p-8 border border-white/5 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 p-6 rounded-2xl bg-white/[0.03] border border-white/5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className={`h-2.5 w-2.5 rounded-full ${isLive ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500/60'}`} />
              <span className={`text-sm font-black uppercase tracking-wider ${isLive ? 'text-emerald-400' : 'text-rose-400'}`}>
                {status ? isLive ? 'Live — Accepting Registrations' : 'Draft — Portal Hidden' : 'Portal status unavailable'}
              </span>
            </div>
            <p className="text-[10px] font-bold text-muted pl-4">
              {!status ? 'Current publication status has not been loaded.' : isLive
                ? 'Participants can access the landing page, register, and log in with OTP.'
                : 'Portal is in draft mode. Only organizers can preview.'}
            </p>
          </div>
          <button
            onClick={handleToggleLive}
            disabled={toggling || !status || formAccess.loading || !formAccess.enabled}
            className={`flex items-center gap-3 px-8 py-3 rounded-full text-[11px] font-black uppercase tracking-widest transition-all shrink-0 cursor-pointer ${
              isLive
                ? 'bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20'
                : 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-500/20'
            }`}
          >
            {isLive ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
            {isLive ? 'Set to Draft' : 'Go Live'}
          </button>
        </div>

        {/* Portal URL and Live Preview Link */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          <div className="flex-1 flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/5 font-mono text-xs text-muted overflow-hidden">
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[var(--pri)]" />
            <span className="truncate">{portalUrl}</span>
          </div>
          <button
            onClick={copyLink}
            className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 text-[10px] font-black uppercase tracking-widest text-[var(--text)] transition-all shrink-0 cursor-pointer"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy Link'}
          </button>
          <a
            href={portalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[var(--pri)] hover:bg-[var(--pri-hover)] text-white text-[10px] font-black uppercase tracking-widest transition-all shrink-0 shadow-sm"
          >
            <span>Open Public Portal</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      {/* ── Main 2-Column Studio Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* Left Column: Theme Presets & Color Customization */}
        <div className="space-y-6 flex flex-col">
          <div className="glass-card rounded-[2rem] p-6 md:p-8 border border-white/5 space-y-6 flex-1">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div className="flex items-center gap-3">
                <Palette className="h-5 w-5 text-[var(--pri)]" />
                <div>
                  <h2 className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)]">
                    Theme & Color Palette Studio
                  </h2>
                  <p className="text-[10px] font-bold text-muted mt-0.5">
                    Customize the look and feel of the Participant Portal & Speaker Center
                  </p>
                </div>
              </div>

              <button
                onClick={handleSaveSettings}
                disabled={savingSettings || !planningAccess.enabled || !formAccess.enabled || !themeAccess.enabled || !colorAccess.enabled}
                className="flex items-center gap-2 h-9 px-6 bg-[var(--pri)] hover:bg-[var(--pri-hover)] text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50 transition-all cursor-pointer shadow-sm"
              >
                {savingSettings ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save Theme
              </button>
            </div>

            {/* Presets List */}
            <div className="space-y-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted block">
                1. Select Curated Design Preset
              </span>
              <div className="grid grid-cols-1 gap-2.5">
                {PRESET_PALETTES.map((preset) => {
                  const isSelected = selectedPreset === preset.id
                  return (
                    <div
                      key={preset.id}
                      onClick={() => handleSelectPreset(preset)}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-4 ${
                        isSelected
                          ? 'bg-white/10 border-[var(--pri)] shadow-[0_0_15px_rgba(99,102,241,0.15)] ring-1 ring-[var(--pri)]'
                          : 'bg-white/[0.02] border-white/5 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Swatch Pill */}
                        <div className="flex items-center -space-x-1 shrink-0">
                          <div
                            className="h-7 w-7 rounded-full border-2 border-[#080912] shadow-sm"
                            style={{ backgroundColor: preset.primary }}
                          />
                          <div
                            className="h-7 w-7 rounded-full border-2 border-[#080912] shadow-sm"
                            style={{ backgroundColor: preset.secondary }}
                          />
                        </div>
                        <div className="truncate">
                          <h4 className="text-xs font-black text-[var(--text)] uppercase tracking-wider">
                            {preset.name}
                          </h4>
                          <p className="text-[10px] font-medium text-muted truncate">{preset.desc}</p>
                        </div>
                      </div>

                      {isSelected ? (
                        <span className="h-6 w-6 rounded-full bg-[var(--pri)] text-white flex items-center justify-center shrink-0">
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      ) : (
                        <div className="h-5 w-5 rounded-full border border-white/20 shrink-0" />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Custom Brand Colors */}
            <div className="pt-4 border-t border-white/5 space-y-4">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted block">
                2. Custom Color Calibration
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
                  <span className="text-[9px] font-black text-muted uppercase tracking-widest block">
                    Primary Brand Color
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => {
                        setPrimaryColor(e.target.value)
                        setSelectedPreset('custom')
                      }}
                      className="h-9 w-12 rounded-lg border border-white/10 bg-transparent cursor-pointer"
                    />
                    <input
                      type="text"
                      value={primaryColor}
                      onChange={(e) => {
                        setPrimaryColor(e.target.value)
                        setSelectedPreset('custom')
                      }}
                      className="flex-1 h-9 px-3 rounded-lg bg-[#080912] border border-white/10 font-mono text-xs font-bold uppercase text-[var(--text)]"
                    />
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
                  <span className="text-[9px] font-black text-muted uppercase tracking-widest block">
                    Secondary Accent Color
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={secondaryColor}
                      onChange={(e) => {
                        setSecondaryColor(e.target.value)
                        setSelectedPreset('custom')
                      }}
                      className="h-9 w-12 rounded-lg border border-white/10 bg-transparent cursor-pointer"
                    />
                    <input
                      type="text"
                      value={secondaryColor}
                      onChange={(e) => {
                        setSecondaryColor(e.target.value)
                        setSelectedPreset('custom')
                      }}
                      className="flex-1 h-9 px-3 rounded-lg bg-[#080912] border border-white/10 font-mono text-xs font-bold uppercase text-[var(--text)]"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Live Palette Visualizer */}
            <div
              className="p-5 rounded-2xl border border-white/10 flex items-center justify-between text-white shadow-xl relative overflow-hidden"
              style={{
                background: `linear-gradient(135deg, ${primaryColor}22 0%, #080912 60%, ${secondaryColor}22 100%)`,
                borderColor: `${primaryColor}44`
              }}
            >
              <div className="space-y-1 relative z-10">
                <span className="text-[8px] font-black uppercase tracking-widest" style={{ color: primaryColor }}>
                  Active Palette Preview
                </span>
                <h4 className="text-sm font-black tracking-tight">{tagline || 'AI Summit 2026'}</h4>
              </div>
              <button
                type="button"
                className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider text-white shadow-lg relative z-10"
                style={{ backgroundColor: primaryColor }}
              >
                Access Portal →
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Hero Content, Conference Stats, Support & Cutoff */}
        <div className="space-y-6 flex flex-col">
          {/* Landing Page Content */}
          <div className="glass-card rounded-[2rem] p-6 md:p-8 border border-white/5 space-y-6">
            <div className="flex items-center gap-3 border-b border-white/5 pb-4">
              <Layout className="h-5 w-5 text-[var(--pri)]" />
              <div>
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)]">
                  Landing Page Hero Copy
                </h2>
                <p className="text-[10px] font-bold text-muted mt-0.5">
                  Headline, tagline, and bottom conference statistics displayed on the landing page
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted block">
                  Tagline / Subheading
                </label>
                <input
                  type="text"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder="e.g. Shape the future of intelligence."
                  className="w-full h-11 bg-[#080912] border border-white/10 rounded-xl px-4 text-xs text-[var(--text)] font-semibold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted block">
                  Hero Overview Description
                </label>
                <textarea
                  rows={3}
                  value={heroDescription}
                  onChange={(e) => setHeroDescription(e.target.value)}
                  placeholder="e.g. Join industry leaders, innovators, and AI enthusiasts for a day of insights..."
                  className="w-full bg-[#080912] border border-white/10 rounded-xl p-3 text-xs text-[var(--text)] font-semibold leading-relaxed"
                />
              </div>

              <div className="pt-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted block mb-2">
                  Conference Highlights (Stats Bar)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={stat1}
                    onChange={(e) => setStat1(e.target.value)}
                    placeholder="Stat 1 (e.g. 1 Day Conference)"
                    className="h-10 bg-[#080912] border border-white/10 rounded-xl px-3 text-xs text-[var(--text)] font-semibold"
                  />
                  <input
                    type="text"
                    value={stat2}
                    onChange={(e) => setStat2(e.target.value)}
                    placeholder="Stat 2 (e.g. 8 Tracks)"
                    className="h-10 bg-[#080912] border border-white/10 rounded-xl px-3 text-xs text-[var(--text)] font-semibold"
                  />
                  <input
                    type="text"
                    value={stat3}
                    onChange={(e) => setStat3(e.target.value)}
                    placeholder="Stat 3 (e.g. 42 Sessions)"
                    className="h-10 bg-[#080912] border border-white/10 rounded-xl px-3 text-xs text-[var(--text)] font-semibold"
                  />
                  <input
                    type="text"
                    value={stat4}
                    onChange={(e) => setStat4(e.target.value)}
                    placeholder="Stat 4 (e.g. 38 Speakers)"
                    className="h-10 bg-[#080912] border border-white/10 rounded-xl px-3 text-xs text-[var(--text)] font-semibold"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Program Schedule & General Support */}
          <div className="glass-card rounded-[2rem] p-6 md:p-8 border border-white/5 space-y-6 flex-1">
            <div className="flex items-center gap-3 border-b border-white/5 pb-4">
              <Mail className="h-5 w-5 text-[var(--pri)]" />
              <div>
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)]">
                  Support & Cutoff Date
                </h2>
                <p className="text-[10px] font-bold text-muted mt-0.5">Attendee inquiries and intake deadline</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted block">Support Email</label>
                <input
                  type="email"
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  placeholder="support@event.com"
                  className="w-full h-11 bg-[#080912] border border-white/10 rounded-xl px-4 text-xs text-[var(--text)] font-semibold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted block">Support Phone</label>
                <input
                  type="text"
                  value={supportPhone}
                  onChange={(e) => setSupportPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full h-11 bg-[#080912] border border-white/10 rounded-xl px-4 text-xs text-[var(--text)] font-semibold"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted block">
                Last Registration Day (Cutoff Date)
              </label>
              <input
                type="date"
                value={editCutoffDate}
                onChange={(e) => setEditCutoffDate(e.target.value)}
                className="w-full h-11 bg-[#080912] border border-white/10 rounded-xl px-4 text-xs text-[var(--text)] font-semibold"
              />
            </div>

            {/* Event Program Document */}
            <div className="pt-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted block mb-2">
                Event Program PDF Schedule
              </label>
              {(event?.registration_settings as Record<string, any>)?.program_url ? (
                <div className="flex items-center justify-between p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-emerald-400" />
                    <span className="text-xs font-bold text-emerald-300">Schedule Document Active</span>
                  </div>
                  <button
                    onClick={handleDeleteProgram}
                    type="button"
                    aria-label="Remove program link"
                    disabled={!formAccess.enabled || !planningAccess.enabled}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 text-rose-400 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 h-12 rounded-xl border border-dashed border-white/20 hover:border-[var(--pri)] bg-white/5 text-xs font-bold text-muted cursor-pointer transition-colors">
                  <input
                    type="file"
                    disabled={!formAccess.enabled || !planningAccess.enabled}
                    accept=".pdf,.docx,.xlsx"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) handleProgramUpload(f)
                    }}
                    className="hidden"
                  />
                  {uploadingProgram ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-[var(--pri)]" />
                      <span>Uploading PDF...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 text-[var(--pri)]" />
                      <span>Upload Program Schedule (PDF)</span>
                    </>
                  )}
                </label>
              )}
            </div>
          </div>
        </div>
      </div>
    </fieldset>
  )
}
