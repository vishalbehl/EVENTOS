'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  Globe, ToggleLeft, ToggleRight, Copy, Check, 
  Zap, Palette, ExternalLink, Info
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

  return (
    <div className="space-y-6 max-w-4xl">
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
  )
}
