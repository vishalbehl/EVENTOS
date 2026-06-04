import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  Globe, ToggleLeft, ToggleRight, Copy, Check, 
  Palette, ExternalLink, Info,
  Clock, Loader2, Save, Calendar
} from 'lucide-react'
import { useEvent, useUpdateEvent } from '@/hooks/useEvents'
import { toast } from 'sonner'

const THEMES = [
  { id: 'midnight', label: 'Midnight', desc: 'Deep dark with violet accents', color: '#7c3aed', bg: '#0f0a1a' },
  { id: 'ocean',    label: 'Ocean',    desc: 'Cool blue, professional',        color: '#0ea5e9', bg: '#0c1b2e' },
  { id: 'emerald',  label: 'Emerald',  desc: 'Green growth, fresh feel',       color: '#10b981', bg: '#0a1a14' },
  { id: 'sunset',   label: 'Sunset',   desc: 'Warm amber, energetic',          color: '#f59e0b', bg: '#1a1200' },
  { id: 'rose',     label: 'Rose',     desc: 'Elegant pink, modern',           color: '#f43f5e', bg: '#1a0a10' },
  { id: 'slate',    label: 'Slate',    desc: 'Neutral, corporate clean',       color: '#94a3b8', bg: '#111827' },
]

export default function SpeakerTab({ eventId }: { eventId: string }) {
  const { data: event } = useEvent(eventId)
  const updateEvent = useUpdateEvent(eventId)
  
  const [isLive, setIsLive] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [copied, setCopied] = useState(false)
  const [selectedTheme, setSelectedTheme] = useState('midnight')
  const [uploadDeadline, setUploadDeadline] = useState('')
  const [savingSettings, setSavingSettings] = useState(false)

  useEffect(() => {
    if (event) {
      setIsLive(event.speaker_settings?.enabled ?? false)
      
      // Select theme based on branding_settings.theme_color
      const color = event.branding_settings?.theme_color || '#7c3aed'
      const matched = THEMES.find(t => t.color.toLowerCase() === color.toLowerCase())
      if (matched) {
        setSelectedTheme(matched.id)
      }
      
      // Set deadline
      if (event.upload_deadline) {
        // Convert to YYYY-MM-DDTHH:MM (local datetime format for input)
        const date = new Date(event.upload_deadline)
        const offset = date.getTimezoneOffset()
        const localDate = new Date(date.getTime() - offset * 60 * 1000)
        setUploadDeadline(localDate.toISOString().slice(0, 16))
      } else {
        setUploadDeadline('')
      }
    }
  }, [event])

  const speakerPortalUrl = process.env.NEXT_PUBLIC_SPEAKER_PORTAL_URL || 'http://localhost:3001'

  const handleToggleLive = async () => {
    setToggling(true)
    try {
      await updateEvent.mutateAsync({
        speaker_settings: { enabled: !isLive, window_required: event?.speaker_settings?.window_required ?? true }
      })
      setIsLive(!isLive)
      toast.success(!isLive ? 'Speaker Portal is now LIVE 🚀' : 'Speaker Portal set to Draft')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to update portal status.')
    } finally {
      setToggling(false)
    }
  }

  const copyLink = () => {
    navigator.clipboard.writeText(`${speakerPortalUrl}/${eventId}`)
    setCopied(true)
    toast.success('Link copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSaveSettings = async () => {
    setSavingSettings(true)
    try {
      const themeColor = THEMES.find(t => t.id === selectedTheme)?.color || '#7c3aed'
      const isoDeadline = uploadDeadline ? new Date(uploadDeadline).toISOString() : null
      
      await updateEvent.mutateAsync({
        upload_deadline: isoDeadline,
        branding_settings: {
          theme_color: themeColor,
          logo_url: event?.branding_settings?.logo_url ?? null,
          banner_url: event?.branding_settings?.banner_url ?? null,
        }
      })
      toast.success('Speaker Portal settings updated successfully!')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to update settings.')
    } finally {
      setSavingSettings(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full max-w-7xl mx-auto">
      {/* Left Column: Status Card + Upload Settings Card */}
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
                  {isLive ? 'Live — Accepting Uploads' : 'Draft — Portal Hidden'}
                </span>
              </div>
              <p className="text-[10px] font-bold text-muted pl-4">
                {isLive
                  ? 'Speakers can access the portal and upload slides.'
                  : 'Portal is not accessible. Switch to Live when ready.'}
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
                <span className="truncate">{speakerPortalUrl}/{eventId}</span>
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

        {/* Upload Settings Card */}
        <div className="glass-card rounded-[2rem] p-8 border border-white/5 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-[var(--pri)]" />
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)]">Upload Deadline</h2>
            </div>
            <button
              onClick={handleSaveSettings}
              disabled={savingSettings}
              className="flex items-center gap-2 h-9 px-6 bg-[var(--pri)] hover:bg-[var(--pri-hover)] text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50 transition-all"
            >
              {savingSettings ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save Deadline
            </button>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted block">Submission Deadline</label>
              <div className="relative">
                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                <input
                  type="datetime-local"
                  value={uploadDeadline}
                  onChange={e => setUploadDeadline(e.target.value)}
                  className="w-full h-12 bg-[#080912] border border-white/10 focus:border-[var(--pri)] focus:ring-0 rounded-xl pl-12 pr-4 text-xs text-[var(--text)] font-semibold transition-all"
                />
              </div>
              <p className="text-[9px] font-bold text-muted mt-1 leading-relaxed">
                After this deadline, slide and poster submissions will be locked unless an override is set per speaker. Leave empty for no deadline.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Theme Selector Card */}
      <div className="space-y-6">
        {/* Theme Selector */}
        <div className="glass-card rounded-[2rem] p-8 border border-white/5 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Palette className="h-5 w-5 text-[var(--pri)]" />
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)]">Portal Theme Color</h2>
            </div>
            <button
              onClick={handleSaveSettings}
              disabled={savingSettings}
              className="flex items-center gap-2 h-9 px-6 bg-[var(--pri)] hover:bg-[var(--pri-hover)] text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50 transition-all"
            >
              {savingSettings ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save Theme
            </button>
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
              Choosing a theme color immediately updates the accent styles and primary actions of the speaker portal interface.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
