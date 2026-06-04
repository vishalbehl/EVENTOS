'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Palette, Upload, X, Loader2, Save, Plus, Image,
  Mail, Phone, ToggleLeft, ToggleRight, Check, Eye,
  MapPin, Globe, RefreshCw, ArrowDownToLine
} from 'lucide-react'
import { useEvent } from '@/hooks/useEvents'
import { useAuthStore } from '@/store/use-auth-store'
import { toast } from 'sonner'

const THEMES = [
  { id: 'midnight', label: 'Midnight',  desc: 'Deep dark with violet accents', color: '#7c3aed', bg: '#080410', surf: '#120924', card: '#1d0f3a', sec: '#a78bfa' },
  { id: 'ocean',    label: 'Ocean',     desc: 'Cool blue, professional',        color: '#0ea5e9', bg: '#060f1e', surf: '#0a182f', card: '#112547', sec: '#38bdf8' },
  { id: 'emerald',  label: 'Emerald',   desc: 'Green growth, fresh feel',       color: '#10b981', bg: '#040f0c', surf: '#071914', card: '#0f2a22', sec: '#34d399' },
  { id: 'sunset',   label: 'Sunset',    desc: 'Warm amber, energetic',          color: '#f59e0b', bg: '#0f0b04', surf: '#181107', card: '#2a1d0c', sec: '#fbbf24' },
  { id: 'rose',     label: 'Rose',      desc: 'Elegant pink, modern',           color: '#f43f5e', bg: '#0f0508', surf: '#190a10', card: '#2a101b', sec: '#fb7185' },
  { id: 'slate',    label: 'Slate',     desc: 'Neutral, corporate clean',       color: '#94a3b8', bg: '#0b0f17', surf: '#151e2e', card: '#202c3f', sec: '#cbd5e1' },
]

export default function SpeakerThemeTab({ eventId }: { eventId: string }) {
  const { data: event, refetch } = useEvent(eventId)
  const token = useAuthStore(s => s.accessToken)

  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingHeader, setUploadingHeader] = useState(false)
  const [fetching, setFetching] = useState(false)

  const [logoUrl, setLogoUrl] = useState('')
  const [headerImages, setHeaderImages] = useState<string[]>([])
  const [footerSupportEmails, setFooterSupportEmails] = useState<string[]>([])
  const [footerSupportPhones, setFooterSupportPhones] = useState<string[]>([])
  const [footerWebsites, setFooterWebsites] = useState<string[]>([])
  const [footerLocations, setFooterLocations] = useState<string[]>([])
  const [footerShowLogo, setFooterShowLogo] = useState(true)
  const [selectedTheme, setSelectedTheme] = useState('midnight')
  const [customHeaderUrl, setCustomHeaderUrl] = useState('')

  const [newEmail, setNewEmail] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newWebsite, setNewWebsite] = useState('')
  const [newLocation, setNewLocation] = useState('')

  const logoRef = useRef<HTMLInputElement>(null)
  const headerRef = useRef<HTMLInputElement>(null)

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'
  const speakerPortalUrl = typeof window !== 'undefined'
    ? `${window.location.origin.replace(':3000', ':3002')}/${eventId}/login`
    : `http://localhost:3002/${eventId}/login`

  // Load speaker branding on event load
  useEffect(() => {
    if (!event) return
    const ss = (event as any).speaker_settings as Record<string, any> | null
    const bs: Record<string, any> = ss?.branding || {}
    setLogoUrl(bs.logo_url || '')
    setHeaderImages(bs.header_images || (bs.banner_url ? [bs.banner_url] : []))
    setFooterSupportEmails(bs.footer_support_emails || [])
    setFooterSupportPhones(bs.footer_support_phones || [])
    setFooterWebsites(bs.footer_websites || [])
    setFooterLocations(bs.footer_locations || [])
    setFooterShowLogo(bs.footer_show_logo !== false)
    setSelectedTheme(bs.theme || 'midnight')
  }, [event])

  // ── Fetch from Registration ──────────────────────────────────
  const handleFetchFromRegistration = () => {
    if (!event) return
    const regBranding = (event as any).branding_settings as Record<string, any> | null
    if (!regBranding) {
      toast.error('No registration branding configured yet.')
      return
    }
    setFetching(true)
    setTimeout(() => {
      setLogoUrl(regBranding.logo_url || '')
      setHeaderImages(regBranding.header_images || (regBranding.banner_url ? [regBranding.banner_url] : []))
      setFooterSupportEmails(regBranding.footer_support_emails || [])
      setFooterSupportPhones(regBranding.footer_support_phones || [])
      setFooterWebsites(regBranding.footer_websites || [])
      setFooterLocations(regBranding.footer_locations || [])
      setFooterShowLogo(regBranding.footer_show_logo !== false)
      setSelectedTheme(regBranding.theme || 'midnight')
      setFetching(false)
      toast.success('Registration branding imported! Review and save to apply.')
    }, 600)
  }

  // ── Upload helpers ────────────────────────────────────────────
  const uploadFile = async (file: File, field: 'logo' | 'header') => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(
      `${apiBase}/api/v1/events/${eventId}/speaker-branding/upload?field=${field}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      }
    )
    if (!res.ok) throw new Error('Upload failed')
    return (await res.json()) as { url: string }
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingLogo(true)
    try {
      const { url } = await uploadFile(file, 'logo')
      setLogoUrl(url)
      toast.success('Logo uploaded!')
    } catch {
      toast.error('Logo upload failed.')
    } finally {
      setUploadingLogo(false)
      if (logoRef.current) logoRef.current.value = ''
    }
  }

  const handleHeaderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    setUploadingHeader(true)
    try {
      const urls: string[] = []
      for (const file of Array.from(files)) {
        const { url } = await uploadFile(file, 'header')
        urls.push(url)
      }
      setHeaderImages(prev => [...prev, ...urls])
      toast.success(`${urls.length} banner(s) uploaded!`)
    } catch {
      toast.error('Header upload failed.')
    } finally {
      setUploadingHeader(false)
      if (headerRef.current) headerRef.current.value = ''
    }
  }

  // ── Save ─────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!event) return
    setSaving(true)
    try {
      const currentSpeakerSettings = ((event as any).speaker_settings as Record<string, any> | null) || {}
      const brandingPayload = {
        theme: selectedTheme,
        logo_url: logoUrl || null,
        header_images: headerImages,
        footer_support_emails: footerSupportEmails,
        footer_support_phones: footerSupportPhones,
        footer_websites: footerWebsites,
        footer_locations: footerLocations,
        footer_show_logo: footerShowLogo,
      }
      await fetch(`${apiBase}/api/v1/events/${eventId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          speaker_settings: {
            ...currentSpeakerSettings,
            branding: brandingPayload,
          },
        }),
      })
      toast.success('Speaker portal branding saved!')
      refetch()
    } catch {
      toast.error('Failed to save branding.')
    } finally {
      setSaving(false)
    }
  }

  const activeTheme = THEMES.find(t => t.id === selectedTheme) || THEMES[0]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tighter text-[var(--text)] mb-1">
            Speaker Portal <span className="text-[var(--pri)]">Theme Designer</span>
          </h2>
          <p className="text-[12px] font-bold text-muted uppercase tracking-[0.2em]">
            Customize the visual identity of your speaker portal
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Fetch from Registration */}
          <button
            onClick={handleFetchFromRegistration}
            disabled={fetching}
            className="flex items-center gap-2 h-11 px-5 rounded-2xl border border-[var(--pri)]/30 bg-[var(--pri)]/10 text-[var(--pri)] text-[11px] font-black uppercase tracking-widest hover:bg-[var(--pri)]/20 transition-all disabled:opacity-50"
          >
            {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
            Fetch from Registration
          </button>

          {/* Preview */}
          <a
            href={speakerPortalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 h-11 px-5 rounded-2xl border border-default bg-white/5 text-muted text-[11px] font-black uppercase tracking-widest hover:text-[var(--text)] transition-all"
          >
            <Eye className="h-4 w-4" /> Preview Portal
          </a>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 h-11 px-6 rounded-2xl bg-[var(--pri)] text-[var(--text)] text-[11px] font-black uppercase tracking-widest hover:bg-[var(--sec)] transition-all shadow-lg disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Settings
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-8">
        {/* Left column */}
        <div className="space-y-8">

          {/* Theme Selection */}
          <section className="glass-3d rounded-[2rem] p-8 border-default">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-9 w-9 rounded-xl bg-[var(--pri)]/10 flex items-center justify-center">
                <Palette className="h-4 w-4 text-[var(--pri)]" />
              </div>
              <div>
                <h3 className="text-[14px] font-black text-[var(--text)]">Color Theme</h3>
                <p className="text-[10px] font-bold text-muted uppercase tracking-widest">Portal color scheme</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {THEMES.map(theme => (
                <button
                  key={theme.id}
                  onClick={() => setSelectedTheme(theme.id)}
                  className={`relative p-4 rounded-2xl border-2 transition-all text-left group overflow-hidden ${
                    selectedTheme === theme.id
                      ? 'border-[var(--pri)] shadow-lg shadow-[var(--pri)]/20'
                      : 'border-default hover:border-white/20'
                  }`}
                  style={{ background: theme.bg }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-5 w-5 rounded-full" style={{ background: theme.color }} />
                    <div className="h-5 w-5 rounded-full opacity-60" style={{ background: theme.sec }} />
                  </div>
                  <p className="text-[12px] font-black text-white">{theme.label}</p>
                  <p className="text-[9px] font-bold text-white/40 mt-0.5">{theme.desc}</p>
                  {selectedTheme === theme.id && (
                    <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-[var(--pri)] flex items-center justify-center">
                      <Check className="h-3 w-3 text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </section>

          {/* Logo */}
          <section className="glass-3d rounded-[2rem] p-8 border-default">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-9 w-9 rounded-xl bg-[var(--pri)]/10 flex items-center justify-center">
                <Image className="h-4 w-4 text-[var(--pri)]" />
              </div>
              <div>
                <h3 className="text-[14px] font-black text-[var(--text)]">Event Logo</h3>
                <p className="text-[10px] font-bold text-muted uppercase tracking-widest">Displayed in header & footer</p>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="h-20 w-20 rounded-2xl bg-white/5 border border-default flex items-center justify-center overflow-hidden shrink-0">
                {logoUrl
                  ? <img src={logoUrl} alt="Logo" className="h-full w-full object-contain p-2" />
                  : <Image className="h-8 w-8 text-muted" />
                }
              </div>
              <div className="flex-1 space-y-3">
                <input ref={logoRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                <button
                  onClick={() => logoRef.current?.click()}
                  disabled={uploadingLogo}
                  className="flex items-center gap-2 h-10 px-5 rounded-xl border border-default bg-white/5 text-[11px] font-black uppercase tracking-widest text-muted hover:text-[var(--text)] transition-all"
                >
                  {uploadingLogo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  Upload Logo
                </button>
                {logoUrl && (
                  <button onClick={() => setLogoUrl('')} className="flex items-center gap-1.5 text-[10px] font-black text-red-400 hover:text-red-300 transition-colors">
                    <X className="h-3 w-3" /> Remove
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Header Banners */}
          <section className="glass-3d rounded-[2rem] p-8 border-default">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-9 w-9 rounded-xl bg-[var(--pri)]/10 flex items-center justify-center">
                <Image className="h-4 w-4 text-[var(--pri)]" />
              </div>
              <div>
                <h3 className="text-[14px] font-black text-[var(--text)]">Header Slideshow</h3>
                <p className="text-[10px] font-bold text-muted uppercase tracking-widest">Banner images for the portal header</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {headerImages.map((img, i) => (
                <div key={i} className="relative group rounded-xl overflow-hidden aspect-video bg-white/5 border border-default">
                  <img src={img} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => setHeaderImages(prev => prev.filter((_, idx) => idx !== i))}
                    className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3 text-white" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <input ref={headerRef} type="file" accept="image/*" multiple onChange={handleHeaderUpload} className="hidden" />
              <button
                onClick={() => headerRef.current?.click()}
                disabled={uploadingHeader}
                className="flex items-center gap-2 h-10 px-5 rounded-xl border border-dashed border-[var(--pri)]/30 bg-[var(--pri)]/5 text-[11px] font-black uppercase tracking-widest text-[var(--pri)] hover:bg-[var(--pri)]/10 transition-all"
              >
                {uploadingHeader ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Upload Banners
              </button>
              <div className="flex-1 flex items-center gap-2">
                <input
                  type="url"
                  placeholder="Or paste image URL..."
                  value={customHeaderUrl}
                  onChange={e => setCustomHeaderUrl(e.target.value)}
                  className="flex-1 h-10 px-4 rounded-xl bg-white/5 border border-default text-[12px] font-bold text-[var(--text)] placeholder:text-muted focus:outline-none focus:border-[var(--pri)]/50"
                />
                <button
                  onClick={() => { if (customHeaderUrl.trim()) { setHeaderImages(p => [...p, customHeaderUrl.trim()]); setCustomHeaderUrl('') } }}
                  className="h-10 px-4 rounded-xl bg-white/10 border border-default text-[11px] font-black text-muted hover:text-[var(--text)] transition-all"
                >
                  Add
                </button>
              </div>
            </div>
          </section>

          {/* Footer Contact Info */}
          <section className="glass-3d rounded-[2rem] p-8 border-default">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-9 w-9 rounded-xl bg-[var(--pri)]/10 flex items-center justify-center">
                <Mail className="h-4 w-4 text-[var(--pri)]" />
              </div>
              <div>
                <h3 className="text-[14px] font-black text-[var(--text)]">Footer Contact</h3>
                <p className="text-[10px] font-bold text-muted uppercase tracking-widest">Support details shown at the bottom of the portal</p>
              </div>
            </div>

            {/* Show logo toggle */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-white/3 border border-default mb-6">
              <span className="text-[12px] font-black text-[var(--text)]">Show logo in footer</span>
              <button onClick={() => setFooterShowLogo(v => !v)} className="shrink-0">
                {footerShowLogo
                  ? <ToggleRight className="h-6 w-6 text-[var(--pri)]" />
                  : <ToggleLeft className="h-6 w-6 text-muted" />
                }
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Emails */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted uppercase tracking-widest flex items-center gap-1.5">
                  <Mail className="h-3 w-3" /> Support Emails
                </label>
                {footerSupportEmails.map((e, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-default">
                    <span className="flex-1 text-[12px] font-bold text-[var(--text)] truncate">{e}</span>
                    <button onClick={() => setFooterSupportEmails(p => p.filter((_, idx) => idx !== i))}><X className="h-3 w-3 text-muted hover:text-red-400" /></button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <input type="email" placeholder="support@event.com" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && newEmail.trim()) { setFooterSupportEmails(p => [...p, newEmail.trim()]); setNewEmail('') }}}
                    className="flex-1 h-9 px-3 rounded-xl bg-white/5 border border-default text-[12px] text-[var(--text)] placeholder:text-muted focus:outline-none focus:border-[var(--pri)]/50" />
                  <button onClick={() => { if (newEmail.trim()) { setFooterSupportEmails(p => [...p, newEmail.trim()]); setNewEmail('') }}} className="h-9 px-3 rounded-xl bg-white/10 border border-default text-muted hover:text-[var(--text)] transition-all"><Plus className="h-3.5 w-3.5" /></button>
                </div>
              </div>

              {/* Phones */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted uppercase tracking-widest flex items-center gap-1.5">
                  <Phone className="h-3 w-3" /> Support Phones
                </label>
                {footerSupportPhones.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-default">
                    <span className="flex-1 text-[12px] font-bold text-[var(--text)]">{p}</span>
                    <button onClick={() => setFooterSupportPhones(p => p.filter((_, idx) => idx !== i))}><X className="h-3 w-3 text-muted hover:text-red-400" /></button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <input type="tel" placeholder="+1 555 000 0000" value={newPhone} onChange={e => setNewPhone(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && newPhone.trim()) { setFooterSupportPhones(p => [...p, newPhone.trim()]); setNewPhone('') }}}
                    className="flex-1 h-9 px-3 rounded-xl bg-white/5 border border-default text-[12px] text-[var(--text)] placeholder:text-muted focus:outline-none focus:border-[var(--pri)]/50" />
                  <button onClick={() => { if (newPhone.trim()) { setFooterSupportPhones(p => [...p, newPhone.trim()]); setNewPhone('') }}} className="h-9 px-3 rounded-xl bg-white/10 border border-default text-muted hover:text-[var(--text)] transition-all"><Plus className="h-3.5 w-3.5" /></button>
                </div>
              </div>

              {/* Websites */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted uppercase tracking-widest flex items-center gap-1.5">
                  <Globe className="h-3 w-3" /> Websites
                </label>
                {footerWebsites.map((w, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-default">
                    <span className="flex-1 text-[12px] font-bold text-[var(--text)] truncate">{w}</span>
                    <button onClick={() => setFooterWebsites(p => p.filter((_, idx) => idx !== i))}><X className="h-3 w-3 text-muted hover:text-red-400" /></button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <input type="url" placeholder="https://event.com" value={newWebsite} onChange={e => setNewWebsite(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && newWebsite.trim()) { setFooterWebsites(p => [...p, newWebsite.trim()]); setNewWebsite('') }}}
                    className="flex-1 h-9 px-3 rounded-xl bg-white/5 border border-default text-[12px] text-[var(--text)] placeholder:text-muted focus:outline-none focus:border-[var(--pri)]/50" />
                  <button onClick={() => { if (newWebsite.trim()) { setFooterWebsites(p => [...p, newWebsite.trim()]); setNewWebsite('') }}} className="h-9 px-3 rounded-xl bg-white/10 border border-default text-muted hover:text-[var(--text)] transition-all"><Plus className="h-3.5 w-3.5" /></button>
                </div>
              </div>

              {/* Locations */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted uppercase tracking-widest flex items-center gap-1.5">
                  <MapPin className="h-3 w-3" /> Locations
                </label>
                {footerLocations.map((l, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-default">
                    <span className="flex-1 text-[12px] font-bold text-[var(--text)] truncate">{l}</span>
                    <button onClick={() => setFooterLocations(p => p.filter((_, idx) => idx !== i))}><X className="h-3 w-3 text-muted hover:text-red-400" /></button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <input type="text" placeholder="City, Country" value={newLocation} onChange={e => setNewLocation(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && newLocation.trim()) { setFooterLocations(p => [...p, newLocation.trim()]); setNewLocation('') }}}
                    className="flex-1 h-9 px-3 rounded-xl bg-white/5 border border-default text-[12px] text-[var(--text)] placeholder:text-muted focus:outline-none focus:border-[var(--pri)]/50" />
                  <button onClick={() => { if (newLocation.trim()) { setFooterLocations(p => [...p, newLocation.trim()]); setNewLocation('') }}} className="h-9 px-3 rounded-xl bg-white/10 border border-default text-muted hover:text-[var(--text)] transition-all"><Plus className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Right column — Live Preview */}
        <div className="space-y-6">
          <section className="glass-3d rounded-[2rem] p-6 border-default sticky top-6">
            <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-4">Live Preview</p>
            <div className="rounded-2xl overflow-hidden border border-white/10" style={{ background: activeTheme.bg }}>
              {/* Mock header */}
              <div className="relative h-28 overflow-hidden" style={{ background: activeTheme.surf }}>
                {headerImages[0] && (
                  <img src={headerImages[0]} alt="" className="w-full h-full object-cover opacity-60" />
                )}
                <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-black/60 flex items-end p-3 gap-2">
                  {logoUrl && (
                    <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center overflow-hidden shrink-0">
                      <img src={logoUrl} alt="" className="h-full w-full object-contain" />
                    </div>
                  )}
                  <div>
                    <p className="text-white text-[10px] font-black leading-none">Speaker Portal</p>
                    <p className="text-white/50 text-[8px] font-bold">Preview</p>
                  </div>
                </div>
              </div>
              {/* Mock content */}
              <div className="p-4 space-y-2">
                <div className="h-2.5 rounded-full w-3/4" style={{ background: activeTheme.color, opacity: 0.8 }} />
                <div className="h-2 rounded-full w-1/2" style={{ background: activeTheme.surf }} />
                <div className="h-8 rounded-xl mt-3" style={{ background: activeTheme.card }} />
                <div className="h-8 rounded-xl" style={{ background: activeTheme.card }} />
                <div className="h-10 rounded-xl mt-2" style={{ background: activeTheme.color }} />
              </div>
            </div>

            <div className="mt-4 space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                <span className="text-muted">Theme</span>
                <span style={{ color: activeTheme.color }}>{activeTheme.label}</span>
              </div>
              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                <span className="text-muted">Banners</span>
                <span className="text-[var(--text)]">{headerImages.length}</span>
              </div>
              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                <span className="text-muted">Logo</span>
                <span className="text-[var(--text)]">{logoUrl ? 'Set' : 'Default'}</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
