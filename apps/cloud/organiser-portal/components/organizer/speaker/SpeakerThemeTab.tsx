'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Palette, Upload, X, Loader2, Save, Plus, Image,
  Mail, Phone, FileText, ToggleLeft, ToggleRight, Check, Eye,
  ExternalLink, Trash2, Star, HelpCircle, ChevronRight, Code2,
  MapPin, Globe, ArrowDownToLine
} from 'lucide-react'
import { useEvent } from '@/hooks/useEvents'
import { useAuthStore } from '@/store/use-auth-store'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useOperationAccess } from '@/lib/capabilities'

const DEFAULT_TERMS = `# Speaker Portal Terms & Conditions

By uploading presentation materials through this portal, you agree to the following conditions.

---

# 1. Ownership

You confirm that you have the legal right to upload and present all submitted materials.

---

# 2. File Submission

* Only approved file formats are accepted.
* Multiple versions may be uploaded before the submission deadline.
* The latest approved version will normally be treated as the active presentation.

---

# 3. File Validation

All uploaded files undergo automated validation checks, including but not limited to:

* File integrity,
* Presentation structure,
* Embedded media compatibility,
* Font availability,
* Video compatibility.

Validation warnings should be reviewed carefully before the event.

---

# 4. Speaker Ready Room (SRR)

All speakers are strongly encouraged to visit the **Speaker Ready Room (SRR)**.

Recommended guidelines:

* Visit the SRR at least **45 minutes before your scheduled presentation**.
* Review and validate your uploaded file.
* Verify fonts, videos, animations, and formatting.
* Perform any required last-minute replacements before your presentation is locked for room deployment.

Failure to complete SRR validation may increase the risk of presentation issues during the live session.

---

# 5. Late File Changes

The Organizer may restrict presentation modifications close to the scheduled session time.

Emergency replacements remain subject to technical approval and operational feasibility.

---

# 6. Presentation Compatibility

Although every effort is made to preserve formatting, differences between operating systems, fonts, codecs, and presentation software versions may occur.

Speakers are responsible for reviewing their files during SRR validation.

---

# 7. Backup Responsibility

Speakers are advised to carry a backup copy of their presentation on a USB drive.

---

# 8. Content Responsibility

Speakers are solely responsible for the content of their presentations.

The Organizer assumes no responsibility for copyright violations or unauthorized use of third-party material.

---

# 9. Recording & Distribution

Sessions may be recorded, photographed, or streamed as determined by the Organizer.

---

# 10. Acceptance

By uploading a presentation, you acknowledge and accept these Terms & Conditions.
`

const DEFAULT_FAQS = [
  { q: "How do I access the Speaker Portal?", a: "Please use your registered email address or the secure access code provided by the Organizer via email.", is_default: true },
  { q: "What file formats are supported?", a: "Supported formats are determined by the Organizer and will be displayed during upload.", is_default: true },
  { q: "Can I replace my presentation?", a: "Yes. You may upload a newer version before the submission deadline or before your presentation is locked.", is_default: true },
  { q: "What is the Speaker Ready Room (SRR)?", a: "The SRR is the official location at the venue for speakers to preview and validate their presentations before the live session.", is_default: true },
  { q: "When should I visit the SRR?", a: "You should arrive at the SRR at least 45 minutes before your scheduled presentation time.\n\nFor keynote sessions or presentations containing videos or complex animations, arriving 60–90 minutes early is recommended.", is_default: true },
  { q: "What should I check in the SRR?", a: "Please verify:\n\n* Slides display correctly.\n* Fonts are rendered properly.\n* Videos and audio play successfully.\n* Animations behave as expected.\n* The correct presentation version is loaded.\n\nAlways perform a final validation before leaving the SRR.", is_default: true },
  { q: "What if I need to make a last-minute change?", a: "A replacement may be possible, subject to Organizer approval and technical constraints.", is_default: true },
  { q: "Should I bring a USB backup?", a: "Yes. Carrying a USB backup copy of your final presentation is strongly recommended.", is_default: true },
  { q: "What happens after I complete SRR validation?", a: "Once validated and approved, your presentation will be synchronized to the presentation room and prepared for live delivery.", is_default: true },
  { q: "Who can help me on-site?", a: "Technical staff and SRR operators will be available to assist with uploads, validation, and presentation checks.", is_default: true }
]


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
  const themeAccess = useOperationAccess('branding.theme.manage')
  const logoAccess = useOperationAccess('branding.logo.manage')
  const speakerAccess = useOperationAccess('speakers.manage')

  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingHeader, setUploadingHeader] = useState(false)
  const [fetching, setFetching] = useState(false)

  // Settings states
  const [activeTab, setActiveTab] = useState<'theme' | 'terms' | 'faqs' | 'profile'>('theme')
  const [logoUrl, setLogoUrl] = useState('')
  const [headerImages, setHeaderImages] = useState<string[]>([])
  const [footerTerms, setFooterTerms] = useState('')
  const [footerSupportEmails, setFooterSupportEmails] = useState<string[]>([])
  const [footerSupportPhones, setFooterSupportPhones] = useState<string[]>([])
  const [footerWebsites, setFooterWebsites] = useState<string[]>([])
  const [footerLocations, setFooterLocations] = useState<string[]>([])
  const [footerShowLogo, setFooterShowLogo] = useState(true)
  const [selectedTheme, setSelectedTheme] = useState('midnight')
  const [customHeaderUrl, setCustomHeaderUrl] = useState('')

  // Profile Settings states
  const [profileMethods, setProfileMethods] = useState({ form: true, template: true, cv: true })
  const [templateUrl, setTemplateUrl] = useState<string | null>(null)
  const [templateFilename, setTemplateFilename] = useState<string | null>(null)
  const [uploadingTemplate, setUploadingTemplate] = useState(false)

  // Temp item inputs
  const [newEmail, setNewEmail] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newWebsite, setNewWebsite] = useState('')
  const [newLocation, setNewLocation] = useState('')

  // Terms and FAQs states
  const [termsAndConditions, setTermsAndConditions] = useState('')
  const [faqs, setFaqs] = useState<{ q: string; a: string; is_default?: boolean }[]>([])
  const [includeDefaultFaqs, setIncludeDefaultFaqs] = useState(true)
  const [tcViewMode, setTcViewMode] = useState<'edit' | 'preview' | 'split'>('split')

  // Track whether we have unsaved footer/theme changes
  const [dirtyMeta, setDirtyMeta] = useState(false)

  const logoRef = useRef<HTMLInputElement>(null)
  const headerRef = useRef<HTMLInputElement>(null)
  const templateRef = useRef<HTMLInputElement>(null)

  const uploadTemplateFile = async (file: File) => {
    if (!speakerAccess.enabled) return
    setUploadingTemplate(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('field', 'template_file')
      const res = await fetch(
        `${apiBase}/api/v1/events/${eventId}/speaker-branding/upload`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: formData,
        }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Upload failed')
      }
      const data = await res.json()
      const ps = data.profile_settings as Record<string, any>
      setTemplateUrl(ps.template_url || null)
      setTemplateFilename(ps.template_filename || null)
      toast.success('Template file uploaded and saved!')
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Upload failed.')
    } finally {
      setUploadingTemplate(false)
    }
  }

  const removeTemplateFile = async () => {
    setTemplateUrl(null)
    setTemplateFilename(null)
    setDirtyMeta(true)
  }

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'
  const speakerPortalUrl = typeof window !== 'undefined'
    ? `${window.location.origin.replace(':3000', ':3002').replace(':3001', ':3002')}/${eventId}/login`
    : `http://localhost:3002/${eventId}/login`

  // Load speaker branding on event load
  useEffect(() => {
    if (!event) {
      setHeaderImages(["/header/1.jpg", "/header/2.jpg", "/header/3.jpg"])
      setFooterSupportEmails(["support@eventos.com"])
      setFooterSupportPhones(["011-123456789"])
      return
    }
    const ss = (event as any).speaker_settings as Record<string, any> | null
    const bs: Record<string, any> = ss?.branding || {}
    setLogoUrl(bs.logo_url || '')
    
    const loadedBanners = bs.header_images || (bs.banner_url ? [bs.banner_url] : [])
    setHeaderImages(loadedBanners.length > 0 ? loadedBanners : ["/header/1.jpg", "/header/2.jpg", "/header/3.jpg"])
    
    const loadedEmails = bs.footer_support_emails || []
    setFooterSupportEmails(loadedEmails.length > 0 ? loadedEmails : ["support@eventos.com"])
    
    const loadedPhones = bs.footer_support_phones || []
    setFooterSupportPhones(loadedPhones.length > 0 ? loadedPhones : ["011-123456789"])
    
    setFooterWebsites(bs.footer_websites || [])
    setFooterLocations(bs.footer_locations || [])
    setFooterShowLogo(bs.footer_show_logo !== false)
    setSelectedTheme(bs.theme || 'midnight')
    setFooterTerms(bs.footer_terms || '')

    // Load terms and FAQs
    if (ss) {
      setTermsAndConditions(ss.terms_and_conditions || DEFAULT_TERMS)
      const resFaqs = ss.faqs || []
      const showDefaults = ss.include_default_faqs !== false
      setIncludeDefaultFaqs(showDefaults)
      if (resFaqs.length > 0) {
        setFaqs(resFaqs)
      } else {
        setFaqs(showDefaults ? DEFAULT_FAQS : [])
      }

      if (ss.profile_settings) {
        const ps = ss.profile_settings
        setProfileMethods(ps.enabled_methods || { form: true, template: true, cv: true })
        setTemplateUrl(ps.template_url || null)
        setTemplateFilename(ps.template_filename || null)
      } else {
        setProfileMethods({ form: true, template: true, cv: true })
        setTemplateUrl(null)
        setTemplateFilename(null)
      }
    } else {
      setTermsAndConditions(DEFAULT_TERMS)
      setFaqs(DEFAULT_FAQS)
      setIncludeDefaultFaqs(true)
      setProfileMethods({ form: true, template: true, cv: true })
      setTemplateUrl(null)
      setTemplateFilename(null)
    }

    setDirtyMeta(false)
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
      // Import branding settings only (layout and theme presets)
      setLogoUrl(regBranding.logo_url || '')
      setHeaderImages(regBranding.header_images || (regBranding.banner_url ? [regBranding.banner_url] : []))
      setFooterSupportEmails(regBranding.footer_support_emails || [])
      setFooterSupportPhones(regBranding.footer_support_phones || [])
      setFooterWebsites(regBranding.footer_websites || [])
      setFooterLocations(regBranding.footer_locations || [])
      setFooterShowLogo(regBranding.footer_show_logo !== false)
      setSelectedTheme(regBranding.theme || 'midnight')
      setFooterTerms(regBranding.footer_terms || '')

      setFetching(false)
      setDirtyMeta(true)
      toast.success('Registration layout & theme settings imported! Review and save to apply.')
    }, 600)
  }

  // ── Upload helpers ────────────────────────────────────────────
  const uploadFile = async (file: File, field: 'logo' | 'header') => {
    if (!logoAccess.enabled) return
    if (field === 'logo') setUploadingLogo(true)
    else setUploadingHeader(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(
        `${apiBase}/api/v1/events/${eventId}/speaker-branding/upload?field=${field}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: formData,
        }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Upload failed')
      }
      const data = await res.json()
      const bs = data.branding_settings as Record<string, any>
      if (field === 'logo') {
        setLogoUrl(bs.logo_url || '')
        toast.success('Logo uploaded and saved!')
      } else {
        setHeaderImages(bs.header_images || [])
        toast.success('Header image uploaded and saved!')
      }
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Upload failed.')
    } finally {
      setUploadingLogo(false)
      setUploadingHeader(false)
    }
  }

  // ── Remove a header image ─────────────────
  const removeHeaderImage = async (idx: number) => {
    if (!logoAccess.enabled) return
    const next = headerImages.filter((_, i) => i !== idx)
    setHeaderImages(next)

    try {
      const currentSpeakerSettings = ((event as any).speaker_settings as Record<string, any> | null) || {}
      const branding = {
        ...currentSpeakerSettings.branding,
        header_images: next,
        banner_url: next[0] || null,
      }
      const res = await fetch(`${apiBase}/api/v1/events/${eventId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          speaker_settings: {
            ...currentSpeakerSettings,
            branding: branding,
          },
        }),
      })
      if (!res.ok) throw new Error('Failed to remove image')
      refetch()
      toast.success('Image removed.')
    } catch {
      toast.error('Failed to remove image from server.')
      setHeaderImages(headerImages) // rollback
    }
  }

  const addHeaderUrl = async () => {
    if (!logoAccess.enabled) return
    if (!customHeaderUrl.trim()) return
    const url = customHeaderUrl.trim()
    setCustomHeaderUrl('')
    const next = [...headerImages, url]
    setHeaderImages(next)

    try {
      const currentSpeakerSettings = ((event as any).speaker_settings as Record<string, any> | null) || {}
      const branding = {
        ...currentSpeakerSettings.branding,
        header_images: next,
        banner_url: next[0] || null,
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
            branding: branding,
          },
        }),
      })
      refetch()
      toast.success('Image URL added and saved!')
    } catch {
      toast.error('Failed to save image URL.')
    }
  }

  const handleToggleDefaultFaqs = (val: boolean) => {
    setIncludeDefaultFaqs(val);
    setDirtyMeta(true);
    if (val) {
      setFaqs(prev => {
        const existingQs = new Set(prev.map(f => f.q.trim().toLowerCase()));
        const toAdd = DEFAULT_FAQS.filter(df => !existingQs.has(df.q.trim().toLowerCase()));
        return [...prev, ...toAdd];
      });
      toast.info("Default FAQ templates added to the list.");
    } else {
      setFaqs(prev => prev.filter(f => !f.is_default));
      toast.info("Default FAQ templates removed from the list.");
    }
  };

  // ── Save ─────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!themeAccess.enabled || !logoAccess.enabled || !speakerAccess.enabled) {
      toast.error('Theme update is unavailable for this event contract or role.')
      return
    }
    if (!event) return
    const emptyFaq = faqs.some(f => !f.q.trim() || !f.a.trim());
    if (emptyFaq) {
      toast.error("All FAQ entries must have a question and an answer.");
      return;
    }

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
        footer_terms: footerTerms,
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
            terms_and_conditions: termsAndConditions,
            faqs: faqs,
            include_default_faqs: includeDefaultFaqs,
            profile_settings: {
              enabled_methods: profileMethods,
              template_url: templateUrl,
              template_filename: templateFilename,
            }
          },
        }),
      })
      toast.success('Speaker portal theme settings saved!')
      setDirtyMeta(false)
      refetch()
    } catch {
      toast.error('Failed to save branding settings.')
    } finally {
      setSaving(false)
    }
  }

  const handleAddEmail = () => {
    if (!newEmail.trim()) return
    if (footerSupportEmails.includes(newEmail.trim())) return
    setFooterSupportEmails([...footerSupportEmails, newEmail.trim()])
    setNewEmail('')
    setDirtyMeta(true)
  }

  const handleAddPhone = () => {
    if (!newPhone.trim()) return
    if (footerSupportPhones.includes(newPhone.trim())) return
    setFooterSupportPhones([...footerSupportPhones, newPhone.trim()])
    setNewPhone('')
    setDirtyMeta(true)
  }

  const handleAddWebsite = () => {
    if (!newWebsite.trim()) return
    if (footerWebsites.includes(newWebsite.trim())) return
    setFooterWebsites([...footerWebsites, newWebsite.trim()])
    setNewWebsite('')
    setDirtyMeta(true)
  }

  const handleAddLocation = () => {
    if (!newLocation.trim()) return
    if (footerLocations.includes(newLocation.trim())) return
    setFooterLocations([...footerLocations, newLocation.trim()])
    setNewLocation('')
    setDirtyMeta(true)
  }

  const activeTheme = THEMES.find(t => t.id === selectedTheme) || THEMES[0]

  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto text-left">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 shrink-0">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted">
            Changes apply to the public speaker portal in real-time after saving.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Fetch from Registration */}
          <button
            onClick={handleFetchFromRegistration}
            disabled={fetching}
            className="flex items-center gap-2 h-9 px-5 rounded-xl border border-[var(--pri)]/30 bg-[var(--pri)]/10 text-[var(--pri)] text-[10px] font-black uppercase tracking-widest hover:bg-[var(--pri)]/20 transition-all disabled:opacity-50"
          >
            {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
            Fetch from Registration
          </button>

          {/* Preview */}
          <a
            href={speakerPortalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 h-9 px-5 bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-[#E8EAFF] transition-all"
          >
            <Eye className="h-3.5 w-3.5" />
            Preview Portal
            <ExternalLink className="h-3 w-3 opacity-60" />
          </a>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving || themeAccess.loading || logoAccess.loading || speakerAccess.loading || !themeAccess.enabled || !logoAccess.enabled || !speakerAccess.enabled}
            className="flex items-center gap-2 h-9 px-6 bg-[var(--pri)] hover:bg-[var(--pri-hover)] text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50 transition-all shadow-lg"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save All Settings
          </button>
        </div>
      </div>

      {/* Navigation Tabs Switcher */}
      <div className="flex border-b border-white/5 gap-2 shrink-0 mb-4">
        <button
          onClick={() => setActiveTab('theme')}
          className={`pb-3 px-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 ${
            activeTab === 'theme'
              ? 'border-b-2 border-[var(--pri)] text-[#E8EAFF]'
              : 'border-transparent text-muted hover:text-[#E8EAFF]'
          }`}
        >
          Portal Layout & Theme
        </button>
        <button
          onClick={() => setActiveTab('terms')}
          className={`pb-3 px-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 ${
            activeTab === 'terms'
              ? 'border-b-2 border-[var(--pri)] text-[#E8EAFF]'
              : 'border-transparent text-muted hover:text-[#E8EAFF]'
          }`}
        >
          Terms &amp; Conditions
        </button>
        <button
          onClick={() => setActiveTab('faqs')}
          className={`pb-3 px-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 ${
            activeTab === 'faqs'
              ? 'border-b-2 border-[var(--pri)] text-[#E8EAFF]'
              : 'border-transparent text-muted hover:text-[#E8EAFF]'
          }`}
        >
          Frequently Asked Questions (FAQ)
        </button>
        <button
          onClick={() => setActiveTab('profile')}
          className={`pb-3 px-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 ${
            activeTab === 'profile'
              ? 'border-b-2 border-[var(--pri)] text-[#E8EAFF]'
              : 'border-transparent text-muted hover:text-[#E8EAFF]'
          }`}
        >
          Profile Intake Settings
        </button>
      </div>

      {activeTab === 'theme' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          {/* Left Column */}
          <div className="space-y-6">
            {/* Color Theme */}
            <div className="glass-card rounded-[2rem] p-8 border border-white/5 space-y-6">
              <div className="flex items-center gap-3">
                <Palette className="h-5 w-5 text-[var(--pri)]" />
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)]">Portal Theme</h2>
              </div>
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider leading-relaxed">
                Select a color palette to apply to the speaker portal.
                {dirtyMeta && <span className="ml-2 text-amber-400">● Unsaved changes</span>}
              </p>

              {/* Theme Preview Bar */}
              <div
                className="h-10 rounded-2xl flex items-center justify-center gap-3 transition-all duration-500 border border-white/10"
                style={{ background: activeTheme.bg }}
              >
                <div className="h-5 w-5 rounded-full shadow-lg" style={{ background: activeTheme.color }} />
                <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: activeTheme.color }}>
                  {activeTheme.label}
                </span>
                <div className="h-3 w-8 rounded-full" style={{ background: activeTheme.sec }} />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {THEMES.map(theme => (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => { setSelectedTheme(theme.id); setDirtyMeta(true) }}
                    className={`relative p-4 rounded-2xl border transition-all text-left group overflow-hidden ${
                      selectedTheme === theme.id
                        ? 'border-[var(--pri)]/60 bg-[var(--pri)]/10 shadow-[0_10px_20px_color-mix(in_srgb,var(--pri)_10%,transparent)]'
                        : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.05] opacity-60 hover:opacity-100'
                    }`}
                  >
                    <div className="h-14 rounded-xl mb-3 flex items-center justify-center relative overflow-hidden" style={{ background: theme.bg }}>
                      <div className="h-5 w-5 rounded-full shadow-lg" style={{ background: theme.color }} />
                      <div className="absolute bottom-1.5 right-2 h-2 w-5 rounded-full" style={{ background: theme.sec }} />
                    </div>
                    <p className="text-xs font-black text-[var(--text)]">{theme.label}</p>
                    <p className="text-[9px] font-bold text-muted mt-0.5">{theme.desc}</p>
                    {selectedTheme === theme.id && (
                      <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-[var(--pri)] flex items-center justify-center shadow-md">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Header Slideshow */}
            <div className="glass-card rounded-[2rem] p-8 border border-white/5 space-y-5">
              <div className="flex items-center gap-3">
                <Image className="h-5 w-5 text-[var(--pri)]" />
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)]">Header Slideshow</h2>
                <span className="ml-auto text-[9px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  Auto-saves on upload
                </span>
              </div>
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider leading-relaxed">
                Upload banner images or provide URLs. Multiple images auto-rotate as a slideshow on the portal header.
              </p>

              {/* Upload Drop Zone */}
              <label className="flex flex-col items-center justify-center border border-dashed border-white/10 hover:border-[var(--pri)]/40 rounded-2xl p-6 bg-white/5 hover:bg-white/[0.08] transition-all cursor-pointer text-center group">
                <input
                  type="file"
                  ref={headerRef}
                  accept="image/*"
                  disabled={uploadingHeader || logoAccess.loading || !logoAccess.enabled}
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) uploadFile(file, 'header')
                    e.target.value = ''
                  }}
                />
                {uploadingHeader ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-6 w-6 text-[var(--pri)] animate-spin" />
                    <span className="text-[9px] font-black text-muted uppercase tracking-widest">Uploading & saving...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-5 w-5 text-[var(--pri)] group-hover:scale-110 transition-transform" />
                    <span className="text-[10px] font-black text-muted uppercase tracking-widest block">Upload Banner Image</span>
                    <span className="text-[8px] font-bold text-muted/60 uppercase tracking-wider mt-1 block">Supports JPG, PNG, WEBP (Max 10MB)</span>
                  </div>
                )}
              </label>

              {/* Add by URL */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Paste banner image URL here..."
                  value={customHeaderUrl}
                  onChange={e => setCustomHeaderUrl(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addHeaderUrl() }}
                  className="h-10 flex-1 bg-[#080912] border border-white/10 rounded-xl px-4 text-xs font-semibold text-[var(--text)] focus:border-[var(--pri)] focus:ring-0 transition-all"
                />
                <button
                  type="button"
                  onClick={addHeaderUrl}
                  disabled={!customHeaderUrl.trim()}
                  className="h-10 px-4 bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-[#E8EAFF] transition-all disabled:opacity-40"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {/* Image Grid */}
              {headerImages.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[9px] font-black text-muted uppercase tracking-widest">Active Banners ({headerImages.length})</span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {headerImages.map((url, idx) => (
                      <div key={idx} className="relative aspect-video rounded-xl overflow-hidden border border-white/10 bg-black group shadow-lg">
                        <img src={url} alt={`Banner ${idx + 1}`} className="w-full h-full object-cover" />
                        {idx === 0 && (
                          <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-[var(--pri)]/80 backdrop-blur px-1.5 py-0.5 rounded-md">
                            <Star className="h-2.5 w-2.5 text-white" />
                            <span className="text-[8px] font-black text-white uppercase">Primary</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => removeHeaderImage(idx)}
                            className="p-1.5 bg-rose-500/80 hover:bg-rose-500 rounded-lg text-white transition-colors"
                            title="Remove banner"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Logo */}
            <div className="glass-card rounded-[2rem] p-8 border border-white/5 space-y-5">
              <div className="flex items-center gap-3">
                <Palette className="h-5 w-5 text-[var(--pri)]" />
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)]">Portal Logo</h2>
                <span className="ml-auto text-[9px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  Auto-saves on upload
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-6 p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                <div className="h-20 w-20 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center relative overflow-hidden shrink-0">
                  <img
                    src={logoUrl || '/logo/1.png'}
                    alt="Logo"
                    className="max-h-[80%] max-w-[80%] object-contain"
                  />
                </div>

                <div className="flex-1 w-full space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#E8EAFF]">
                      Active Logo:
                    </span>
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full flex items-center gap-1.5 ${
                      logoUrl
                        ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
                        : 'text-indigo-400 bg-indigo-500/10 border border-indigo-500/20'
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${logoUrl ? 'bg-emerald-400 animate-pulse' : 'bg-indigo-400'}`} />
                      {logoUrl ? "Custom Uploaded" : "Default Platform Logo"}
                    </span>
                  </div>

                  <label className="flex flex-col items-center justify-center h-10 border border-dashed border-white/10 hover:border-[var(--pri)]/40 rounded-xl bg-white/5 hover:bg-white/[0.08] transition-all cursor-pointer text-center group">
                    <input
                      type="file"
                      ref={logoRef}
                      accept="image/*"
                      disabled={uploadingLogo || logoAccess.loading || !logoAccess.enabled}
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0]
                        if (file) uploadFile(file, 'logo')
                        e.target.value = ''
                      }}
                    />
                    {uploadingLogo ? (
                      <Loader2 className="h-4 w-4 text-[var(--pri)] animate-spin" />
                    ) : (
                      <span className="text-[10px] font-black text-muted uppercase tracking-widest block">Upload Logo</span>
                    )}
                  </label>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Or paste logo URL..."
                      value={logoUrl}
                      onChange={e => { setLogoUrl(e.target.value); setDirtyMeta(true) }}
                      className="h-10 flex-1 bg-[#080912] border border-white/10 rounded-xl px-4 text-xs font-semibold text-[var(--text)] focus:border-[var(--pri)] focus:ring-0 transition-all"
                    />
                    {logoUrl && (
                      <button
                        type="button"
                        onClick={() => { setLogoUrl(''); setDirtyMeta(true) }}
                        className="h-10 px-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Config */}
            <div className="glass-card rounded-[2rem] p-8 border border-white/5 space-y-5">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-[var(--pri)]" />
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)]">Portal Footer</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Emails list builder */}
                <div className="space-y-2 text-left">
                  <label className="text-[9px] font-black uppercase tracking-widest text-muted block">Support Emails</label>
                  <div className="flex gap-2">
                    <div className="relative flex-grow">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                      <input
                        type="email"
                        placeholder="E.g. contact@event.com"
                        value={newEmail}
                        onChange={e => setNewEmail(e.target.value)}
                        className="w-full h-11 bg-[#080912] border border-white/10 focus:border-[var(--pri)] focus:ring-0 rounded-xl pl-11 pr-4 text-xs text-[var(--text)] font-semibold transition-all"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddEmail}
                      className="px-4 h-11 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                    >
                      Add
                    </button>
                  </div>
                  {footerSupportEmails.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      {footerSupportEmails.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-white/[0.02] border border-white/5 px-3 py-2 rounded-xl text-xs">
                          <span className="font-semibold text-white/90">{item}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setFooterSupportEmails(footerSupportEmails.filter((_, i) => i !== idx));
                              setDirtyMeta(true);
                            }}
                            className="text-rose-400 hover:text-rose-600 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Phones list builder */}
                <div className="space-y-2 text-left">
                  <label className="text-[9px] font-black uppercase tracking-widest text-muted block">Support Phones</label>
                  <div className="flex gap-2">
                    <div className="relative flex-grow">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                      <input
                        type="text"
                        placeholder="E.g. +1 (555) 000-0000"
                        value={newPhone}
                        onChange={e => setNewPhone(e.target.value)}
                        className="w-full h-11 bg-[#080912] border border-white/10 focus:border-[var(--pri)] focus:ring-0 rounded-xl pl-11 pr-4 text-xs text-[var(--text)] font-semibold transition-all"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddPhone}
                      className="px-4 h-11 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                    >
                      Add
                    </button>
                  </div>
                  {footerSupportPhones.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      {footerSupportPhones.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-white/[0.02] border border-white/5 px-3 py-2 rounded-xl text-xs">
                          <span className="font-semibold text-white/90">{item}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setFooterSupportPhones(footerSupportPhones.filter((_, i) => i !== idx));
                              setDirtyMeta(true);
                            }}
                            className="text-rose-400 hover:text-rose-600 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Websites list builder */}
                <div className="space-y-2 text-left">
                  <label className="text-[9px] font-black uppercase tracking-widest text-muted block">Websites</label>
                  <div className="flex gap-2">
                    <div className="relative flex-grow">
                      <Globe className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                      <input
                        type="text"
                        placeholder="E.g. https://myevent.com"
                        value={newWebsite}
                        onChange={e => setNewWebsite(e.target.value)}
                        className="w-full h-11 bg-[#080912] border border-white/10 focus:border-[var(--pri)] focus:ring-0 rounded-xl pl-11 pr-4 text-xs text-[var(--text)] font-semibold transition-all"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddWebsite}
                      className="px-4 h-11 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                    >
                      Add
                    </button>
                  </div>
                  {footerWebsites.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      {footerWebsites.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-white/[0.02] border border-white/5 px-3 py-2 rounded-xl text-xs">
                          <span className="font-semibold text-white/90">{item}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setFooterWebsites(footerWebsites.filter((_, i) => i !== idx));
                              setDirtyMeta(true);
                            }}
                            className="text-rose-400 hover:text-rose-600 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Locations list builder */}
                <div className="space-y-2 text-left">
                  <label className="text-[9px] font-black uppercase tracking-widest text-muted block">Venue Locations</label>
                  <div className="flex gap-2">
                    <div className="relative flex-grow">
                      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                      <input
                        type="text"
                        placeholder="E.g. Convention Center Hall A"
                        value={newLocation}
                        onChange={e => setNewLocation(e.target.value)}
                        className="w-full h-11 bg-[#080912] border border-white/10 focus:border-[var(--pri)] focus:ring-0 rounded-xl pl-11 pr-4 text-xs text-[var(--text)] font-semibold transition-all"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddLocation}
                      className="px-4 h-11 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                    >
                      Add
                    </button>
                  </div>
                  {footerLocations.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      {footerLocations.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-white/[0.02] border border-white/5 px-3 py-2 rounded-xl text-xs">
                          <span className="font-semibold text-white/90">{item}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setFooterLocations(footerLocations.filter((_, i) => i !== idx));
                              setDirtyMeta(true);
                            }}
                            className="text-rose-400 hover:text-rose-600 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Logo display toggle */}
              <div className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl">
                <div className="space-y-0.5 text-left">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text)] block">Footer Logo Display</span>
                  <span className="text-[8px] font-bold text-muted block">Show the uploaded logo in the portal footer.</span>
                </div>
                <button
                  onClick={() => { setFooterShowLogo(!footerShowLogo); setDirtyMeta(true) }}
                  className="text-muted hover:text-[var(--pri)] transition-all"
                >
                  {footerShowLogo
                    ? <ToggleRight className="h-7 w-7 text-[var(--pri)]" />
                    : <ToggleLeft className="h-7 w-7" />
                  }
                </button>
              </div>

              {/* Copyright Text */}
              <div className="space-y-1.5 text-left">
                <label className="text-[9px] font-black uppercase tracking-widest text-muted block">Footer Copyright Caption</label>
                <textarea
                  placeholder="E.g. © 2026 EventOS Inc. All rights reserved."
                  value={footerTerms}
                  onChange={e => { setFooterTerms(e.target.value); setDirtyMeta(true) }}
                  rows={4}
                  className="w-full bg-[#080912] border border-white/10 focus:border-[var(--pri)] focus:ring-0 rounded-2xl px-4 py-3 text-xs text-[var(--text)] font-semibold leading-relaxed resize-none"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Terms & Conditions Tab */}
      {activeTab === 'terms' && (
        <div className="glass-card p-8 border border-white/5 space-y-6 rounded-[2rem] animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-[var(--pri)]" />
              <div>
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)]">Terms &amp; Conditions</h2>
                <p className="text-[9px] font-bold text-muted mt-0.5">Supports Markdown formatting — **bold**, _italic_, ## headings, lists, etc.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center rounded-xl border border-white/10 bg-white/5 p-0.5 gap-0.5">
                {(["edit", "split", "preview"] as const).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setTcViewMode(mode)}
                    className={`h-7 px-3 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                      tcViewMode === mode
                        ? "bg-[var(--pri)] text-[var(--primary-contrast)] shadow"
                        : "text-[#E8EAFF] opacity-60 hover:opacity-100"
                    }`}
                  >
                    {mode === "edit" ? "Edit" : mode === "preview" ? "Preview" : "Split"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className={`grid gap-4 ${
            tcViewMode === "split" ? "grid-cols-2" : "grid-cols-1"
          }`}>
            {(tcViewMode === "edit" || tcViewMode === "split") && (
              <div className="space-y-1.5 text-left">
                {tcViewMode === "split" && (
                  <div className="flex items-center gap-1.5">
                    <Code2 className="h-3 w-3 text-muted" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-muted">Markdown Source</span>
                  </div>
                )}
                <textarea
                  placeholder={`# Terms & Conditions\n\n## 1. Speaker Guidelines\nPlease ensure slides are submitted...`}
                  value={termsAndConditions}
                  onChange={e => { setTermsAndConditions(e.target.value); setDirtyMeta(true); }}
                  spellCheck={false}
                  className="w-full h-[360px] bg-[#080912] border border-white/10 focus:border-[var(--pri)] focus:ring-0 rounded-2xl px-4 py-3 text-xs text-[var(--text)] font-mono leading-relaxed transition-all resize-none outline-none"
                />
              </div>
            )}

            {(tcViewMode === "preview" || tcViewMode === "split") && (
              <div className="space-y-1.5 text-left">
                {tcViewMode === "split" && (
                  <div className="flex items-center gap-1.5">
                    <Eye className="h-3 w-3 text-muted" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-muted">Rendered Preview</span>
                  </div>
                )}
                <div className="h-[360px] bg-[#080912] border border-white/10 rounded-2xl px-5 py-4 overflow-y-auto prose prose-invert prose-xs max-w-none tnc-markdown
                  prose-headings:text-[var(--text)] prose-headings:font-black prose-headings:tracking-tight
                  prose-h1:text-lg prose-h2:text-sm prose-h3:text-xs
                  prose-p:text-muted prose-p:text-xs prose-p:leading-relaxed
                  prose-li:text-muted prose-li:text-xs
                  prose-strong:text-[var(--text)] prose-em:text-indigo-300
                  prose-a:text-indigo-400 prose-a:no-underline hover:prose-a:underline
                  prose-hr:border-white/10">
                  {termsAndConditions ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{termsAndConditions}</ReactMarkdown>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full min-h-[160px] text-center space-y-2 opacity-40">
                      <FileText className="h-8 w-8 text-muted" />
                      <p className="text-[10px] font-bold text-muted uppercase tracking-widest">Start typing terms & conditions</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* FAQ Tab */}
      {activeTab === 'faqs' && (
        <div className="glass-card p-8 border border-white/5 space-y-6 rounded-[2rem] animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-4">
            <div className="flex items-center gap-3">
              <HelpCircle className="h-5 w-5 text-[var(--pri)]" />
              <div>
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)]">Frequently Asked Questions</h2>
                <p className="text-[9px] font-bold text-muted mt-0.5">Configure FAQs shown in the Speaker Portal and dashboard layouts.</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-white/10 bg-white/5">
                <input
                  type="checkbox"
                  id="include-default-faqs-toggle"
                  checked={includeDefaultFaqs}
                  onChange={(e) => handleToggleDefaultFaqs(e.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-white/5 text-[var(--pri)] focus:ring-[var(--pri)] cursor-pointer"
                />
                <label htmlFor="include-default-faqs-toggle" className="text-[9px] font-black uppercase tracking-wider text-muted cursor-pointer select-none">
                  Include Defaults
                </label>
              </div>

              <button
                type="button"
                onClick={() => {
                  setFaqs(prev => [...prev, { q: "", a: "", is_default: false }]);
                  setDirtyMeta(true);
                  toast.success("Added new FAQ. Fill in the question and answer below.");
                }}
                className="h-8 px-4 bg-[var(--pri)]/10 hover:bg-[var(--pri)]/20 text-[var(--pri)] border border-[var(--pri)]/20 font-black uppercase tracking-widest text-[9px] rounded-xl flex items-center gap-1.5 transition-all"
              >
                <Plus className="h-3 w-3" />
                Add FAQ
              </button>
            </div>
          </div>

          <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
            {faqs.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 border border-dashed border-white/10 rounded-2xl text-center space-y-2 opacity-60">
                <HelpCircle className="h-8 w-8 text-muted" />
                <p className="text-[10px] font-bold text-muted uppercase tracking-widest">No FAQs configured</p>
                <p className="text-[9px] text-muted">Click "Add FAQ" to create your first question, or check "Include Defaults" to load templates.</p>
              </div>
            ) : (
              faqs.map((faq, index) => (
                <div key={index} className="p-5 bg-[#080912] border border-white/5 rounded-2xl space-y-4 relative group hover:border-white/10 transition-all">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black uppercase tracking-widest text-[var(--pri)]">FAQ #{index + 1}</span>
                      {faq.is_default && (
                        <span className="text-[7px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                          System Default
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFaqs(prev => prev.filter((_, idx) => idx !== index));
                        setDirtyMeta(true);
                        toast.info(`FAQ #${index + 1} removed.`);
                      }}
                      className="h-7 w-7 rounded-lg bg-red-500/10 hover:bg-red-500/25 border border-red-500/20 text-red-400 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                      title="Delete FAQ"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <div className="space-y-1.5 text-left">
                      <label className="text-[9px] font-black uppercase tracking-widest text-muted">Question</label>
                      <input
                        type="text"
                        placeholder="e.g. What is the presentation slides upload deadline?"
                        value={faq.q}
                        onChange={e => {
                          const newFaqs = [...faqs];
                          newFaqs[index] = { ...newFaqs[index], q: e.target.value };
                          setFaqs(newFaqs);
                          setDirtyMeta(true);
                        }}
                        className="h-10 w-full bg-black/40 border border-white/10 text-xs text-[var(--text)] rounded-xl px-4 focus:border-[var(--pri)] focus:ring-0 outline-none transition-all"
                      />
                    </div>

                    <div className="space-y-1.5 text-left">
                      <label className="text-[9px] font-black uppercase tracking-widest text-muted">Answer</label>
                      <textarea
                        placeholder="e.g. You can submit your files up to 24 hours prior to..."
                        value={faq.a}
                        onChange={e => {
                          const newFaqs = [...faqs];
                          newFaqs[index] = { ...newFaqs[index], a: e.target.value };
                          setFaqs(newFaqs);
                          setDirtyMeta(true);
                        }}
                        className="w-full h-20 bg-black/40 border border-white/10 focus:border-[var(--pri)] focus:ring-0 rounded-xl px-4 py-2.5 text-xs text-[var(--text)] leading-relaxed transition-all resize-none outline-none"
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Profile Intake Settings Tab */}
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          {/* Left Column - Submission Methods */}
          <div className="glass-card rounded-[2rem] p-8 border border-white/5 space-y-6">
            <div className="flex items-center gap-3">
              <ToggleRight className="h-5 w-5 text-[var(--pri)]" />
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)]">Profile Intake Methods</h2>
            </div>
            <p className="text-[10px] font-bold text-muted uppercase tracking-wider leading-relaxed">
              Enable or disable the methods speakers can use to submit their profile information in the portal.
            </p>

            <div className="space-y-4">
              {/* Structured Form */}
              <div className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl">
                <div className="space-y-0.5 text-left">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text)] block">Structured Intake Form</span>
                  <span className="text-[8px] font-bold text-muted block">Allow speakers to fill in detailed profile fields (Bio, Socials, State, etc.).</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setProfileMethods(prev => ({ ...prev, form: !prev.form }));
                    setDirtyMeta(true);
                  }}
                  className="text-muted hover:text-[var(--pri)] transition-all animate-press"
                >
                  {profileMethods.form ? (
                    <ToggleRight className="h-7 w-7 text-[var(--pri)]" />
                  ) : (
                    <ToggleLeft className="h-7 w-7" />
                  )}
                </button>
              </div>

              {/* Template Intake */}
              <div className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl">
                <div className="space-y-0.5 text-left">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text)] block">Template Intake (Offline Document)</span>
                  <span className="text-[8px] font-bold text-muted block">Allow speakers to download a custom template, fill it offline, and upload it.</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setProfileMethods(prev => ({ ...prev, template: !prev.template }));
                    setDirtyMeta(true);
                  }}
                  className="text-muted hover:text-[var(--pri)] transition-all animate-press"
                >
                  {profileMethods.template ? (
                    <ToggleRight className="h-7 w-7 text-[var(--pri)]" />
                  ) : (
                    <ToggleLeft className="h-7 w-7" />
                  )}
                </button>
              </div>

              {/* Upload CV */}
              <div className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl">
                <div className="space-y-0.5 text-left">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text)] block">Upload CV / Resume (PDF)</span>
                  <span className="text-[8px] font-bold text-muted block">Allow speakers to upload their CV/resume as a single PDF.</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setProfileMethods(prev => ({ ...prev, cv: !prev.cv }));
                    setDirtyMeta(true);
                  }}
                  className="text-muted hover:text-[var(--pri)] transition-all animate-press"
                >
                  {profileMethods.cv ? (
                    <ToggleRight className="h-7 w-7 text-[var(--pri)]" />
                  ) : (
                    <ToggleLeft className="h-7 w-7" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right Column - Offline Template */}
          <div className="glass-card rounded-[2rem] p-8 border border-white/5 space-y-6">
            <div className="flex items-center gap-3">
              <Upload className="h-5 w-5 text-[var(--pri)]" />
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)]">Offline Profile Template</h2>
              <span className="ml-auto text-[9px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                Auto-saves on upload
              </span>
            </div>
            <p className="text-[10px] font-bold text-muted uppercase tracking-wider leading-relaxed">
              Upload a custom profile template (DOCX/PPTX) that speakers can download, fill out, and upload back to submit their profile offline.
            </p>

            {/* Template Upload Drop Zone */}
            <label className="flex flex-col items-center justify-center border border-dashed border-white/10 hover:border-[var(--pri)]/40 rounded-2xl p-8 bg-white/5 hover:bg-white/[0.08] transition-all cursor-pointer text-center group">
              <input
                type="file"
                ref={templateRef}
                accept=".docx,.pptx,.doc,.ppt"
                disabled={uploadingTemplate || speakerAccess.loading || !speakerAccess.enabled}
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) uploadTemplateFile(file)
                  e.target.value = ''
                }}
              />
              {uploadingTemplate ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-6 w-6 text-[var(--pri)] animate-spin" />
                  <span className="text-[9px] font-black text-muted uppercase tracking-widest">Uploading template...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="h-6 w-6 text-[var(--pri)] group-hover:scale-110 transition-transform" />
                  <span className="text-[10px] font-black text-muted uppercase tracking-widest block">Upload Custom Template</span>
                  <span className="text-[8px] font-bold text-muted/60 uppercase tracking-wider mt-1 block">Supports DOCX, PPTX (Max 20MB)</span>
                </div>
              )}
            </label>

            {/* Active Template Status Card */}
            <div className="p-4 bg-[#080912] border border-white/5 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-[#E8EAFF]">
                  Active Template:
                </span>
                <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full flex items-center gap-1.5 ${
                  templateUrl
                    ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
                    : 'text-indigo-400 bg-indigo-500/10 border border-indigo-500/20'
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${templateUrl ? 'bg-emerald-400 animate-pulse' : 'bg-indigo-400'}`} />
                  {templateUrl ? "Custom Template" : "System Default"}
                </span>
              </div>

              {templateUrl ? (
                <div className="flex items-center justify-between bg-white/[0.02] border border-white/5 p-3 rounded-xl text-xs gap-3">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <FileText className="h-4 w-4 text-[var(--pri)] shrink-0" />
                    <span className="font-semibold text-white/90 truncate" title={templateFilename || "speaker_template"}>
                      {templateFilename || "Custom Speaker Template"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={templateUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-white transition-colors"
                      title="Download template file"
                    >
                      <ArrowDownToLine className="h-3.5 w-3.5" />
                    </a>
                    <button
                      type="button"
                      onClick={removeTemplateFile}
                      className="p-1.5 bg-rose-500/10 hover:bg-rose-500/25 border border-rose-500/20 text-rose-400 rounded-lg transition-colors"
                      title="Remove template file"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-[10px] text-muted font-bold text-center py-2 uppercase tracking-wider">
                  Using default conference intake form template.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sticky Save Banner */}
      {dirtyMeta && (
        <div className="glass-card rounded-2xl p-4 border border-amber-500/20 bg-amber-500/5 flex items-center justify-between gap-4 mt-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-300">
              Unsaved theme / terms / FAQ changes
            </span>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || themeAccess.loading || logoAccess.loading || speakerAccess.loading || !themeAccess.enabled || !logoAccess.enabled || !speakerAccess.enabled}
            className="flex items-center gap-2 h-8 px-5 bg-amber-500 hover:bg-amber-400 text-black rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50 transition-all"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Save Now
          </button>
        </div>
      )}
    </div>
  )
}
