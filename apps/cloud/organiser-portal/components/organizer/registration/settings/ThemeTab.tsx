'use client'

import { useState, useEffect, useRef } from 'react'
import { 
  Palette, Upload, X, Loader2, Save,
  Plus, Image, Mail, Phone, FileText, ToggleLeft, ToggleRight, Check, Eye,
  ExternalLink, Trash2, Star, HelpCircle, ChevronRight, Code2, SplitSquareHorizontal,
  MapPin, Globe
} from 'lucide-react'
import { useEvent } from '@/hooks/useEvents'
import { useAuthStore } from '@/store/use-auth-store'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useOperationAccess } from '@/lib/capabilities'

const DEFAULT_TERMS = `# Registration Portal Terms & Conditions

By registering for this event, you acknowledge that you have read, understood, and agree to these Terms & Conditions.

---

# 1. Registration

* Registration is valid only after successful submission of the registration form and receipt of payment confirmation (if applicable).
* The Organizer reserves the right to approve, reject, or cancel any registration at its sole discretion.
* Providing false or misleading information may result in cancellation without refund.

---

# 2. Payment & Refund Policy

* Registration fees, if applicable, must be paid through the official payment gateway.
* Refund eligibility and cancellation deadlines are determined by the Organizer.
* Transaction charges imposed by banks or payment gateways may be non-refundable.
* In the event of force majeure, event postponement, or circumstances beyond the Organizer's control, refunds shall be subject to Organizer policy.

---

# 3. Personal Information

* Information provided during registration will be used solely for event management, communication, badge generation, and related operational activities.
* The Organizer may send important notifications regarding schedules, venue changes, or emergency announcements.
* Your information will not be sold to third parties.

---

# 4. Event Admission

* Registration confirmation does not guarantee admission if security or venue regulations require additional verification.
* Participants may be required to present a valid government-issued photo ID.
* The Organizer reserves the right to refuse entry for misconduct or violation of event policies.

---

# 5. Badge Usage

* Event badges are personal and non-transferable.
* Lost badges may require identity verification before reissuance.
* Sharing badges with unauthorized individuals is strictly prohibited.

---

# 6. Photography & Recording

* Official event photographers and videographers may capture images and recordings during the event.
* By attending, participants grant permission for reasonable use of such materials for event documentation and promotional purposes.

---

# 7. Code of Conduct

Participants are expected to behave professionally and respectfully.

The Organizer reserves the right to remove any participant who:

* Harasses attendees, speakers, or staff.
* Disrupts event operations.
* Violates venue policies.
* Engages in illegal or unsafe activities.

---

# 8. Limitation of Liability

The Organizer shall not be responsible for:

* Loss or theft of personal belongings.
* Travel disruptions.
* Technical failures beyond reasonable control.
* Indirect or consequential damages arising from participation.

---

# 9. Schedule Changes

The Organizer may modify:

* Speakers,
* Sessions,
* Venue locations,
* Event timings,
* Agenda items,

without prior notice whenever operationally necessary.
`

const DEFAULT_FAQS = [
  { q: "How do I register?", a: "Complete the registration form and submit the required information. Payment (if applicable) must be completed before registration is confirmed.", is_default: true },
  { q: "I did not receive my confirmation email.", a: "Please:\n\n1. Check your Spam/Junk folder.\n2. Verify that you entered the correct email address.\n3. Wait a few minutes for email delivery.\n\nIf you still have not received it, contact the event support team.", is_default: true },
  { q: "Can I update my registration details?", a: "Yes, depending on Organizer settings. Some information may be editable before the registration deadline.", is_default: true },
  { q: "Can I transfer my registration to someone else?", a: "Unless specifically permitted by the Organizer, registrations are non-transferable.", is_default: true },
  { q: "How do I access the Speaker Portal?", a: "Please use your registered email address or the access code provided by the Organizer via email.", is_default: true },
  { q: "What if I forget my access code?", a: "Use the registered email recovery option or contact the Organizer for assistance.", is_default: true },
  { q: "Can I cancel my registration?", a: "Cancellation and refund policies vary by event. Please refer to the event-specific cancellation policy.", is_default: true },
  { q: "Who should I contact for technical support?", a: "Please contact the event support desk using the contact information provided in your confirmation email.", is_default: true }
]


const THEMES = [
  { id: 'midnight', label: 'Midnight',  desc: 'Deep dark with violet accents', color: '#7c3aed', bg: '#080410', surf: '#120924', card: '#1d0f3a', sec: '#a78bfa' },
  { id: 'ocean',    label: 'Ocean',     desc: 'Cool blue, professional',        color: '#0ea5e9', bg: '#060f1e', surf: '#0a182f', card: '#112547', sec: '#38bdf8' },
  { id: 'emerald',  label: 'Emerald',   desc: 'Green growth, fresh feel',       color: '#10b981', bg: '#040f0c', surf: '#071914', card: '#0f2a22', sec: '#34d399' },
  { id: 'sunset',   label: 'Sunset',    desc: 'Warm amber, energetic',          color: '#f59e0b', bg: '#0f0b04', surf: '#181107', card: '#2a1d0c', sec: '#fbbf24' },
  { id: 'rose',     label: 'Rose',      desc: 'Elegant pink, modern',           color: '#f43f5e', bg: '#0f0508', surf: '#190a10', card: '#2a101b', sec: '#fb7185' },
  { id: 'slate',    label: 'Slate',     desc: 'Neutral, corporate clean',       color: '#94a3b8', bg: '#0b0f17', surf: '#151e2e', card: '#202c3f', sec: '#cbd5e1' },
]

const PORTAL_FONTS = ['Inter', 'Roboto', 'Open Sans', 'Montserrat', 'Poppins', 'Lato']

export default function ThemeTab({ eventId }: { eventId: string }) {
  const { data: event, refetch } = useEvent(eventId)
  const token = useAuthStore(s => s.accessToken)
  const themeAccess = useOperationAccess('branding.theme.manage')
  const colorAccess = useOperationAccess('branding.colors.manage')
  const fontAccess = useOperationAccess('branding.fonts.manage')
  const logoAccess = useOperationAccess('branding.logo.manage')

  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingHeader, setUploadingHeader] = useState(false)

  // Settings states
  const [activeTab, setActiveTab] = useState<'theme' | 'terms' | 'faqs'>('theme')
  const [logoUrl, setLogoUrl] = useState('')
  const [headerImages, setHeaderImages] = useState<string[]>([])
  const [footerTerms, setFooterTerms] = useState('')
  const [footerSupportEmail, setFooterSupportEmail] = useState('')
  const [footerSupportPhone, setFooterSupportPhone] = useState('')
  const [footerSupportEmails, setFooterSupportEmails] = useState<string[]>([])
  const [footerSupportPhones, setFooterSupportPhones] = useState<string[]>([])
  const [footerWebsites, setFooterWebsites] = useState<string[]>([])
  const [footerLocations, setFooterLocations] = useState<string[]>([])
  const [footerShowLogo, setFooterShowLogo] = useState(true)
  const [selectedTheme, setSelectedTheme] = useState('midnight')
  const [fontFamily, setFontFamily] = useState('Inter')
  const [customHeaderUrl, setCustomHeaderUrl] = useState('')

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

  const portalUrl = typeof window !== 'undefined'
    ? `${window.location.origin.replace(':3000', ':3003')}/${eventId}/register`
    : `http://localhost:3003/${eventId}/register`

  useEffect(() => {
    if (event?.branding_settings) {
      const bs = event.branding_settings as Record<string, any>
      setLogoUrl(bs.logo_url || '')
      
      const loadedBanners = bs.header_images || (bs.banner_url ? [bs.banner_url] : [])
      setHeaderImages(loadedBanners)
      
      setFooterTerms(bs.footer_terms || '')
      setFooterSupportEmail(bs.footer_support_email || '')
      setFooterSupportPhone(bs.footer_support_phone || '')
      
      const loadedEmails = bs.footer_support_emails || []
      setFooterSupportEmails(loadedEmails)
      
      const loadedPhones = bs.footer_support_phones || []
      setFooterSupportPhones(loadedPhones)
      
      setFooterWebsites(bs.footer_websites || [])
      setFooterLocations(bs.footer_locations || [])
      setFooterShowLogo(bs.footer_show_logo !== false)
      setSelectedTheme(bs.theme || 'midnight')
      setFontFamily(bs.font_family || 'Inter')
    } else {
      setHeaderImages([])
      setFooterSupportEmails([])
      setFooterSupportPhones([])
      setFontFamily('Inter')
    }
    if (event?.registration_settings) {
      const rs = event.registration_settings as Record<string, any>
      setTermsAndConditions(rs.terms_and_conditions || DEFAULT_TERMS)
      const resFaqs = rs.faqs || []
      const showDefaults = rs.include_default_faqs !== false
      setIncludeDefaultFaqs(showDefaults)
      if (resFaqs.length > 0) {
        setFaqs(resFaqs)
      } else {
        setFaqs(showDefaults ? DEFAULT_FAQS : [])
      }
    } else {
      setTermsAndConditions(DEFAULT_TERMS)
      setFaqs(DEFAULT_FAQS)
      setIncludeDefaultFaqs(true)
    }
    setDirtyMeta(false)
  }, [event])

  // ── Authenticated branding upload ────────────────────────────────
  const handleFileUpload = async (file: File, field: 'logo' | 'header') => {
    if (!logoAccess.enabled) {
      toast.error(`Branding upload unavailable: ${(logoAccess.reason || 'capability unavailable').replaceAll('_', ' ').toLowerCase()}`)
      return
    }
    if (field === 'logo') setUploadingLogo(true)
    else setUploadingHeader(true)

    try {
      const form = new FormData()
      form.append('file', file)
      form.append('field', field)

      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'
      const res = await fetch(`${apiBase}/api/v1/events/${eventId}/branding/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Upload failed')
      }
      const data = await res.json()

      // Update local state from the server-persisted branding_settings
      const bs = data.branding_settings as Record<string, any>
      if (field === 'logo') {
        setLogoUrl(bs.logo_url || '')
        toast.success('Logo uploaded and saved!')
      } else {
        setHeaderImages(bs.header_images || [])
        toast.success('Header image uploaded and saved!')
      }
      // Refresh react-query cache so command center reflects changes
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload image.')
    } finally {
      setUploadingLogo(false)
      setUploadingHeader(false)
    }
  }

  // ── Remove a header image (persists immediately) ─────────────────
  const removeHeaderImage = async (idx: number) => {
    if (!logoAccess.enabled) return
    const next = headerImages.filter((_, i) => i !== idx)
    setHeaderImages(next)

    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'
      const currentBranding = (event?.branding_settings as Record<string, any>) || {}
      const res = await fetch(`${apiBase}/api/v1/events/${eventId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          branding_settings: {
            ...currentBranding,
            header_images: next,
            banner_url: next[0] || null,
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

  // ── Save footer / theme / text settings ─────────────────────────
  const handleSave = async () => {
    const blockedAccess = [themeAccess, colorAccess, fontAccess, logoAccess].find(access => !access.enabled)
    if (blockedAccess) {
      toast.error(`Theme update unavailable: ${(blockedAccess.reason || 'capability unavailable').replaceAll('_', ' ').toLowerCase()}`)
      return
    }
    const emptyFaq = faqs.some(f => !f.q.trim() || !f.a.trim());
    if (emptyFaq) {
      toast.error("All FAQ entries must have a question and an answer.");
      return;
    }

    setSaving(true)
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'
      const currentBranding = (event?.branding_settings as Record<string, any>) || {}
      const currentRegSettings = (event?.registration_settings as Record<string, any>) || {}

      const res = await fetch(`${apiBase}/api/v1/events/${eventId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          branding_settings: {
            ...currentBranding,
            logo_url: logoUrl || null,
            header_images: headerImages,
            banner_url: headerImages[0] || null,
            footer_terms: footerTerms,
            footer_support_email: footerSupportEmail,
            footer_support_phone: footerSupportPhone,
            footer_support_emails: footerSupportEmails,
            footer_support_phones: footerSupportPhones,
            footer_websites: footerWebsites,
            footer_locations: footerLocations,
            footer_show_logo: footerShowLogo,
            theme: selectedTheme,
            font_family: fontFamily,
          },
          registration_settings: {
            ...currentRegSettings,
            terms_and_conditions: termsAndConditions,
            faqs: faqs,
            include_default_faqs: includeDefaultFaqs
          }
        }),
      })

      if (!res.ok) throw new Error('Save failed')
      await refetch()
      setDirtyMeta(false)
      toast.success('Theme & branding settings saved! Changes will appear on the portal.')
    } catch (err: any) {
      toast.error('Failed to save settings.')
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

  const addHeaderUrl = async () => {
    if (!logoAccess.enabled) return
    if (!customHeaderUrl.trim()) return
    const url = customHeaderUrl.trim()
    setCustomHeaderUrl('')
    const next = [...headerImages, url]
    setHeaderImages(next)

    // Auto-persist
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'
      const currentBranding = (event?.branding_settings as Record<string, any>) || {}
      await fetch(`${apiBase}/api/v1/events/${eventId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          branding_settings: {
            ...currentBranding,
            header_images: next,
            banner_url: next[0] || null,
          },
        }),
      })
      refetch()
      toast.success('Image URL added and saved!')
    } catch {
      toast.error('Failed to save image URL.')
    }
  }

  const currentTheme = THEMES.find(t => t.id === selectedTheme) || THEMES[0]

  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto text-left">

      {/* ── Header: Title + Preview + Save ── */}
      <div className="flex items-center justify-between gap-4 shrink-0">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted">
            Changes apply to the public registration portal in real-time after saving.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={portalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 h-9 px-5 bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-[#E8EAFF] transition-all"
          >
            <Eye className="h-3.5 w-3.5" />
            Preview Portal
            <ExternalLink className="h-3 w-3 opacity-60" />
          </a>
          <button
            onClick={handleSave}
            disabled={saving || themeAccess.loading || colorAccess.loading || fontAccess.loading || logoAccess.loading || !themeAccess.enabled || !colorAccess.enabled || !fontAccess.enabled || !logoAccess.enabled}
            className="flex items-center gap-2 h-9 px-6 bg-[var(--pri)] hover:bg-[var(--pri-hover)] text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50 transition-all shadow-lg"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save All Settings
          </button>
        </div>
      </div>

      {/* ── Navigation Tabs Switcher ── */}
      <div className="flex border-b border-white/5 gap-2 shrink-0 mb-4">
        <button
          onClick={() => setActiveTab('theme')}
          className={`pb-3 px-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 ${
            activeTab === 'theme'
              ? 'border-[var(--pri)] text-[#E8EAFF]'
              : 'border-transparent text-muted hover:text-[#E8EAFF]'
          }`}
        >
          Portal Layout & Theme
        </button>
        <button
          onClick={() => setActiveTab('terms')}
          className={`pb-3 px-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 ${
            activeTab === 'terms'
              ? 'border-[var(--pri)] text-[#E8EAFF]'
              : 'border-transparent text-muted hover:text-[#E8EAFF]'
          }`}
        >
          Terms & Conditions
        </button>
        <button
          onClick={() => setActiveTab('faqs')}
          className={`pb-3 px-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 ${
            activeTab === 'faqs'
              ? 'border-[var(--pri)] text-[#E8EAFF]'
              : 'border-transparent text-muted hover:text-[#E8EAFF]'
          }`}
        >
          Frequently Asked Questions (FAQ)
        </button>
      </div>

      {activeTab === 'theme' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">

          {/* ── Left Column ── */}
          <div className="space-y-6">

            {/* Portal Theme Selector */}
            <div className="glass-card rounded-[2rem] p-8 border border-white/5 space-y-6">
              <div className="flex items-center gap-3">
                <Palette className="h-5 w-5 text-[var(--pri)]" />
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)]">Portal Theme</h2>
              </div>
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider leading-relaxed">
                Select a color palette to apply to the registration portal.
                {dirtyMeta && <span className="ml-2 text-amber-400">● Unsaved changes</span>}
              </p>

              {/* Theme Preview Bar */}
              <div
                className="h-10 rounded-2xl flex items-center justify-center gap-3 transition-all duration-500 border border-white/10"
                style={{ background: currentTheme.bg }}
              >
                <div className="h-5 w-5 rounded-full shadow-lg" style={{ background: currentTheme.color }} />
                <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: currentTheme.color }}>
                  {currentTheme.label}
                </span>
                <div className="h-3 w-8 rounded-full" style={{ background: currentTheme.sec }} />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {THEMES.map(theme => (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => { if (themeAccess.enabled && colorAccess.enabled) { setSelectedTheme(theme.id); setDirtyMeta(true) } }}
                    disabled={!themeAccess.enabled || !colorAccess.enabled}
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

              <div className="mt-6 space-y-2">
                <label htmlFor="portal-font-family" className="text-[9px] font-black uppercase tracking-widest text-muted block">Portal font</label>
                <select
                  id="portal-font-family"
                  value={fontFamily}
                  onChange={event => { setFontFamily(event.target.value); setDirtyMeta(true) }}
                  disabled={fontAccess.loading || !fontAccess.enabled}
                  title={fontAccess.enabled ? 'Portal font family' : `Unavailable: ${(fontAccess.reason || 'RESOLUTION_UNAVAILABLE').replaceAll('_', ' ').toLowerCase()}`}
                  className="h-11 w-full rounded-xl border border-white/10 bg-[#080912] px-4 text-xs font-semibold text-[var(--text)] disabled:opacity-50"
                >
                  {PORTAL_FONTS.map(font => <option key={font} value={font}>{font}</option>)}
                </select>
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
                  accept="image/*"
                  disabled={uploadingHeader || logoAccess.loading || !logoAccess.enabled}
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) handleFileUpload(file, 'header')
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
                        {/* Primary badge */}
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

          {/* ── Right Column ── */}
          <div className="space-y-6">

            {/* Portal Logo */}
            <div className="glass-card rounded-[2rem] p-8 border border-white/5 space-y-5">
              <div className="flex items-center gap-3">
                <Palette className="h-5 w-5 text-[var(--pri)]" />
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)]">Portal Logo</h2>
                <span className="ml-auto text-[9px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  Auto-saves on upload
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-6 p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                {/* Logo Preview */}
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
                      accept="image/*"
                      disabled={uploadingLogo || logoAccess.loading || !logoAccess.enabled}
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0]
                        if (file) handleFileUpload(file, 'logo')
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

            {/* Footer Configuration */}
            <div className="glass-card rounded-[2rem] p-8 border border-white/5 space-y-5">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-[var(--pri)]" />
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)]">Portal Footer</h2>
              </div>

              {/* Multi Contact details section */}
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

              {/* Logo toggle */}
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

              {/* Terms text */}
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

      {/* ── Terms & Conditions Tab ── */}
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
                        ? "bg-[var(--pri)] text-white shadow"
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
                  placeholder={`# Terms & Conditions\n\n## 1. Registration Policy\nRegistration is non-transferable...`}
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

      {/* ── Frequently Asked Questions Tab ── */}
      {activeTab === 'faqs' && (
        <div className="glass-card p-8 border border-white/5 space-y-6 rounded-[2rem] animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-4">
            <div className="flex items-center gap-3">
              <HelpCircle className="h-5 w-5 text-[var(--pri)]" />
              <div>
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)]">Frequently Asked Questions</h2>
                <p className="text-[9px] font-bold text-muted mt-0.5">Configure FAQs shown in the Attendee Portal and registration layouts.</p>
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
                        placeholder="e.g. What is the cancellation policy?"
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
                        placeholder="e.g. You can cancel your registration up to 7 days before..."
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

      {/* Sticky Save Banner (visible when there are unsaved meta changes) */}
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
            disabled={saving || themeAccess.loading || colorAccess.loading || fontAccess.loading || logoAccess.loading || !themeAccess.enabled || !colorAccess.enabled || !fontAccess.enabled || !logoAccess.enabled}
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
