import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  Globe, ToggleLeft, ToggleRight, Copy, Check, 
  Zap, Palette, ExternalLink, Info,
  Mail, Clock, Megaphone, FileText, Upload, X, Loader2, Save,
  Calendar, Phone, Sparkles, Layout, Sliders, CheckCircle2
} from 'lucide-react'
import { useEvent, useUpdateEvent } from '@/hooks/useEvents'
import { apiClient } from '@/lib/api-client'
import { toast } from 'sonner'
import { useOperationAccess } from '@/lib/capabilities'

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
  const { data: event } = useEvent(eventId)
  const updateEvent = useUpdateEvent(eventId)
  const [isLive, setIsLive] = useState(false)
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

  const [savingSettings, setSavingSettings] = useState(false)
  const [uploadingProgram, setUploadingProgram] = useState(false)

  useEffect(() => {
    if (event?.registration_settings) {
      const rs = event.registration_settings as Record<string, any>
      setSupportEmail((rs.support_email as string) || '')
      setSupportPhone((rs.support_phone as string) || '')
      setAdditionalContacts((rs.additional_contacts as Array<{ id: string, type: 'email' | 'phone', value: string, label: string }>) || [])
      setEditCutoffDays((rs.edit_cutoff_days as number) || 0)
      
      const dateVal = (rs.edit_cutoff_date as string) || '';
      setEditCutoffDate(dateVal.split('T')[0]);

      if (rs.tagline) setTagline(rs.tagline)
      if (rs.description) setHeroDescription(rs.description)

      const tc = rs.theme_config || {}
      if (tc.preset) setSelectedPreset(tc.preset)
      if (tc.primary_color) setPrimaryColor(tc.primary_color)
      else if ((event as any)?.theme_color) setPrimaryColor((event as any).theme_color)
      if (tc.secondary_color) setSecondaryColor(tc.secondary_color)

      if (Array.isArray(rs.stats) && rs.stats.length >= 4) {
        setStat1(rs.stats[0]?.label || '1 Day Conference')
        setStat2(rs.stats[1]?.label || '8 Tracks')
        setStat3(rs.stats[2]?.label || '42 Sessions')
        setStat4(rs.stats[3]?.label || '38 Speakers')
      }
    } else if ((event as any)?.theme_color) {
      setPrimaryColor((event as any).theme_color)
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

  const handleSelectPreset = (preset: typeof PRESET_PALETTES[0]) => {
    setSelectedPreset(preset.id)
    setPrimaryColor(preset.primary)
    setSecondaryColor(preset.secondary)
  }

  const handleSaveSettings = async () => {
    setSavingSettings(true)
    try {
      const currentSettings = event?.registration_settings || {}
      await updateEvent.mutateAsync({
        theme_color: primaryColor,
        registration_settings: {
          ...currentSettings,
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
      toast.success('Portal design & theme settings updated successfully! 🎨')
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
      const currentSettings = (event?.registration_settings || {}) as Record<string, any>
      const { program_url: _removed, ...rest } = currentSettings
      await updateEvent.mutateAsync({
        registration_settings: rest as any
      })
      toast.success('Program removed.')
    } catch {
      toast.error('Failed to remove program.')
    }
  }

  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto">
      {/* ── Top Portal Status & Action Banner ── */}
      <div className="glass-card rounded-[2rem] p-6 md:p-8 border border-white/5 space-y-6">
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
                ? 'Participants can access the landing page, register, and log in with OTP.'
                : 'Portal is in draft mode. Only organizers can preview.'}
            </p>
          </div>
          <button
            onClick={handleToggleLive}
            disabled={toggling || planningAccess.loading || !planningAccess.enabled}
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
                disabled={savingSettings || formAccess.loading || !formAccess.enabled}
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
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 text-rose-400 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 h-12 rounded-xl border border-dashed border-white/20 hover:border-[var(--pri)] bg-white/5 text-xs font-bold text-muted cursor-pointer transition-colors">
                  <input
                    type="file"
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
    </div>
  )
}
