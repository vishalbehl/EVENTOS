'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  SlidersHorizontal, Globe, Clock, ShieldCheck, Mail, Phone, 
  MessageSquare, FileText, CheckCircle2, AlertCircle, Save, 
  ExternalLink, Copy, Check, Plus, Trash2, Upload, Loader2,
  Bell, FileCheck, Tag, Info, HelpCircle, UserCheck, Lock
} from 'lucide-react'
import Link from 'next/link'
import { useEvent, useUpdateEvent } from '@/hooks/useEvents'
import { apiClient } from '@/lib/api-client'
import { toast } from 'sonner'
import { useOperationAccess } from '@/lib/capabilities'

const SETTINGS_TABS = [
  { id: 'intake',        label: 'Intake & Timeline',    icon: Clock },
  { id: 'policies',      label: 'Approval & Policies',  icon: UserCheck },
  { id: 'support',       label: 'Support & Help Desk',  icon: Phone },
  { id: 'terms-faqs',    label: 'Terms & FAQs',         icon: HelpCircle },
  { id: 'notifications', label: 'Notifications & Files', icon: Bell },
]

export default function RegistrationSettingsPage() {
  const { eventId } = useParams()
  const eid = eventId as string
  const formAccess = useOperationAccess('registration.forms.manage')
  const { data: event, isLoading: eventLoading } = useEvent(eid)
  const updateEvent = useUpdateEvent(eid)

  const [activeTab, setActiveTab] = useState('intake')
  const [isLive, setIsLive] = useState(false)
  const [togglingLive, setTogglingLive] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [saving, setSaving] = useState(false)

  // 1. Intake & Timeline
  const [regCutoffDate, setRegCutoffDate] = useState('')
  const [editCutoffDays, setEditCutoffDays] = useState(0)
  const [editCutoffDate, setEditCutoffDate] = useState('')
  const [tagline, setTagline] = useState('')
  const [description, setDescription] = useState('')

  // 2. Approval & Intake Policies
  const [autoApprovePaid, setAutoApprovePaid] = useState(true)
  const [autoApproveFree, setAutoApproveFree] = useState(true)
  const [singleRegPerEmail, setSingleRegPerEmail] = useState(true)
  const [requireOtpVerification, setRequireOtpVerification] = useState(true)

  // 3. Support & Assistance Contacts
  const [supportEmail, setSupportEmail] = useState('')
  const [supportPhone, setSupportPhone] = useState('')
  const [additionalContacts, setAdditionalContacts] = useState<Array<{ id: string; type: 'email' | 'phone' | 'whatsapp' | 'other'; value: string; label: string }>>([])
  const [newContactType, setNewContactType] = useState<'email' | 'phone' | 'whatsapp' | 'other'>('whatsapp')
  const [newContactValue, setNewContactValue] = useState('')
  const [newContactLabel, setNewContactLabel] = useState('')

  // 4. Terms, Conditions & FAQs
  const [termsAndConditions, setTermsAndConditions] = useState('')
  const [includeDefaultFaqs, setIncludeDefaultFaqs] = useState(true)
  const [faqs, setFaqs] = useState<Array<{ q: string; a: string }>>([])
  const [newFaqQ, setNewFaqQ] = useState('')
  const [newFaqA, setNewFaqA] = useState('')

  // 5. Notifications & Documents
  const [sendEmailConfirmation, setSendEmailConfirmation] = useState(true)
  const [sendWhatsappAlerts, setSendWhatsappAlerts] = useState(false)
  const [confirmationMessage, setConfirmationMessage] = useState('')
  const [programUrl, setProgramUrl] = useState('')
  const [speakerGuidelinesUrl, setSpeakerGuidelinesUrl] = useState('')
  const [presentationTemplateUrl, setPresentationTemplateUrl] = useState('')
  const [uploadingProgram, setUploadingProgram] = useState(false)
  const [uploadingGuidelines, setUploadingGuidelines] = useState(false)
  const [uploadingTemplate, setUploadingTemplate] = useState(false)

  // Load Event Settings
  useEffect(() => {
    if (event?.registration_settings) {
      const rs = event.registration_settings as Record<string, any>
      setSupportEmail((rs.support_email as string) || '')
      setSupportPhone((rs.support_phone as string) || '')
      setAdditionalContacts((rs.additional_contacts as any[]) || [])
      setEditCutoffDays((rs.edit_cutoff_days as number) || 0)
      
      const editDateVal = (rs.edit_cutoff_date as string) || ''
      setEditCutoffDate(editDateVal.split('T')[0])

      const regDateVal = (rs.registration_cutoff_date as string) || ''
      setRegCutoffDate(regDateVal.split('T')[0])

      setTagline(rs.tagline || '')
      setDescription(rs.description || '')

      setAutoApprovePaid(rs.auto_approve_paid !== false)
      setAutoApproveFree(rs.auto_approve_free !== false)
      setSingleRegPerEmail(rs.single_reg_per_email !== false)
      setRequireOtpVerification(rs.require_otp_verification !== false)

      setTermsAndConditions(rs.terms_and_conditions || '')
      setIncludeDefaultFaqs(rs.include_default_faqs !== false)
      setFaqs(Array.isArray(rs.faqs) ? rs.faqs : [])

      setSendEmailConfirmation(rs.send_email_confirmation !== false)
      setSendWhatsappAlerts(Boolean(rs.send_whatsapp_alerts))
      setConfirmationMessage(rs.confirmation_message || '')

      setProgramUrl(rs.program_url || '')
      setSpeakerGuidelinesUrl(rs.speaker_guidelines_url || '')
      setPresentationTemplateUrl(rs.presentation_template_url || '')
    }
  }, [event])

  // Load Live Portal Status
  useEffect(() => {
    const fetchPortalStatus = async () => {
      try {
        const res = await apiClient.get<any>(`/events/${eid}/registration/form-config?t=${Date.now()}`)
        setIsLive(res.is_live || false)
      } catch (err) {
        console.error('Failed to fetch portal status:', err)
      }
    }
    if (eid) {
      fetchPortalStatus()
    }
  }, [eid])

  const portalUrl = `${process.env.NEXT_PUBLIC_REGISTRATION_URL || 'http://localhost:3003'}/${eid}`

  const handleToggleLive = async () => {
    setTogglingLive(true)
    try {
      const res = await apiClient.post<any>(`/events/${eid}/registration/form-config`, {
        is_live: !isLive
      })
      setIsLive(res.is_live)
      toast.success(res.is_live ? 'Registration portal is now LIVE 🚀' : 'Registration portal set to Draft (Offline)')
    } catch {
      toast.error('Failed to update registration portal live status.')
    } finally {
      setTogglingLive(false)
    }
  }

  const copyPortalLink = () => {
    navigator.clipboard.writeText(portalUrl)
    setCopiedLink(true)
    toast.success('Registration portal link copied!')
    setTimeout(() => setCopiedLink(false), 2000)
  }

  const handleAddContact = () => {
    if (!newContactValue.trim()) {
      toast.error('Please enter a contact email or phone number.')
      return
    }
    const newContact = {
      id: Math.random().toString(36).substring(2, 9),
      type: newContactType,
      value: newContactValue.trim(),
      label: newContactLabel.trim() || `${newContactType.toUpperCase()} Helpline`
    }
    setAdditionalContacts([...additionalContacts, newContact])
    setNewContactValue('')
    setNewContactLabel('')
    toast.success('Contact added.')
  }

  const handleRemoveContact = (id: string) => {
    setAdditionalContacts(additionalContacts.filter(c => c.id !== id))
  }

  const handleAddFaq = () => {
    if (!newFaqQ.trim() || !newFaqA.trim()) {
      toast.error('Please provide both a question and answer.')
      return
    }
    setFaqs([...faqs, { q: newFaqQ.trim(), a: newFaqA.trim() }])
    setNewFaqQ('')
    setNewFaqA('')
    toast.success('FAQ added.')
  }

  const handleRemoveFaq = (index: number) => {
    setFaqs(faqs.filter((_, i) => i !== index))
  }

  const handleFileUpload = async (file: File, type: 'program' | 'guidelines' | 'template') => {
    const setter = type === 'program' ? setUploadingProgram : type === 'guidelines' ? setUploadingGuidelines : setUploadingTemplate
    setter(true)
    try {
      const uploadForm = new FormData()
      uploadForm.append('file', file)
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'
      const res = await fetch(`${apiBase}/api/v1/portal/registration/${eid}/upload`, {
        method: 'POST',
        body: uploadForm
      })
      if (!res.ok) throw new Error('Upload failed')
      const data = await res.json()
      if (data.status === 'success' && data.url) {
        if (type === 'program') setProgramUrl(data.url)
        else if (type === 'guidelines') setSpeakerGuidelinesUrl(data.url)
        else if (type === 'template') setPresentationTemplateUrl(data.url)
        toast.success(`${type.toUpperCase()} file uploaded successfully!`)
      }
    } catch {
      toast.error(`Failed to upload ${type} document.`)
    } finally {
      setter(false)
    }
  }

  const handleSaveAllSettings = async () => {
    setSaving(true)
    try {
      const currentSettings = event?.registration_settings || {}
      await updateEvent.mutateAsync({
        registration_settings: {
          ...currentSettings,
          registration_cutoff_date: regCutoffDate,
          edit_cutoff_days: Number(editCutoffDays),
          edit_cutoff_date: editCutoffDate,
          tagline,
          description,
          auto_approve_paid: autoApprovePaid,
          auto_approve_free: autoApproveFree,
          single_reg_per_email: singleRegPerEmail,
          require_otp_verification: requireOtpVerification,
          support_email: supportEmail,
          support_phone: supportPhone,
          additional_contacts: additionalContacts,
          terms_and_conditions: termsAndConditions,
          include_default_faqs: includeDefaultFaqs,
          faqs,
          send_email_confirmation: sendEmailConfirmation,
          send_whatsapp_alerts: sendWhatsappAlerts,
          confirmation_message: confirmationMessage,
          program_url: programUrl,
          speaker_guidelines_url: speakerGuidelinesUrl,
          presentation_template_url: presentationTemplateUrl,
        }
      })
      toast.success('Registration settings saved successfully! ⚙️')
    } catch {
      toast.error('Failed to save registration settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="w-full max-w-full overflow-x-hidden p-6 space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <SlidersHorizontal className="h-4 w-4 text-[var(--pri)]" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--pri)]">Configuration</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Registration Settings
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Manage registration intake timelines, auto-approval rules, support assistance, terms, FAQs, and notifications.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/events/${eid}/registration/review`}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] shadow-sm transition-colors"
          >
            <span>Capacity &amp; Approval &rarr;</span>
          </Link>

          <button
            type="button"
            onClick={handleSaveAllSettings}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--pri)] px-4 py-2 text-xs font-bold text-[var(--primary-contrast)] shadow-md shadow-[var(--pri)]/20 hover:opacity-95 transition-all cursor-pointer disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            <span>Save Settings</span>
          </button>
        </div>
      </div>

      {/* ── Live Portal Quick Action Bar ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl border border-[var(--border-default)] bg-[var(--card)] shadow-sm">
        <div className="flex items-center gap-3">
          <div className={`h-3 w-3 rounded-full ${isLive ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[var(--text-primary)]">
                Portal Status: {isLive ? 'Live & Accepting Registrations' : 'Draft Mode (Offline)'}
              </span>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                isLive ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
              }`}>
                {isLive ? 'Online' : 'Draft'}
              </span>
            </div>
            <span className="text-[11px] text-[var(--text-secondary)] font-mono truncate max-w-md block mt-0.5">
              {portalUrl}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={copyPortalLink}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
          >
            {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copiedLink ? 'Copied' : 'Copy Link'}</span>
          </button>

          <a
            href={portalUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>Open Portal</span>
          </a>

          <button
            type="button"
            onClick={handleToggleLive}
            disabled={togglingLive}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-sm ${
              isLive 
                ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20' 
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            {togglingLive && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>{isLive ? 'Set to Draft' : 'Publish Live 🚀'}</span>
          </button>
        </div>
      </div>

      {/* ── Settings Tab Bar ── */}
      <div className="flex gap-1 p-1 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border-default)] w-fit overflow-x-auto">
        {SETTINGS_TABS.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-[var(--pri)] text-[var(--primary-contrast)] shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* ── Settings Tab Panels ── */}
      <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--card)] p-6 shadow-sm">
        
        {/* ── TAB 1: INTAKE & TIMELINE ── */}
        {activeTab === 'intake' && (
          <div className="space-y-6 max-w-3xl">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">
                Registration Timeline &amp; Intake Rules
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Set cutoffs for attendee intake and manage how long participants can edit their details.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--text-primary)] block">
                  Registration Intake Cutoff Date
                </label>
                <input
                  type="date"
                  value={regCutoffDate}
                  onChange={(e) => setRegCutoffDate(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                />
                <span className="text-[11px] text-[var(--text-secondary)] block">
                  Portal closes new registrations after this date. Leave blank for indefinite intake.
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--text-primary)] block">
                  Profile Edit Cutoff Date
                </label>
                <input
                  type="date"
                  value={editCutoffDate}
                  onChange={(e) => setEditCutoffDate(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                />
                <span className="text-[11px] text-[var(--text-secondary)] block">
                  Attendees cannot alter their attendee badge details after this date.
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--text-primary)] block">
                Allowed Profile Modification Window (Days Post-Registration)
              </label>
              <input
                type="number"
                min={0}
                max={365}
                value={editCutoffDays}
                onChange={(e) => setEditCutoffDays(Number(e.target.value))}
                className="w-full max-w-xs h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
              />
              <span className="text-[11px] text-[var(--text-secondary)] block">
                Number of days an attendee can update their registration form after submitting (0 for unrestricted until event date).
              </span>
            </div>

            <div className="pt-4 border-t border-[var(--border-subtle)] space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--text-primary)] block">
                  Event Headline / Tagline
                </label>
                <input
                  type="text"
                  placeholder="e.g. Shape the future of intelligence."
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--text-primary)] block">
                  Event Description &amp; Welcome Message
                </label>
                <textarea
                  rows={3}
                  placeholder="Welcome message displayed on attendee registration portal"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full p-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none resize-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 2: APPROVAL & POLICIES ── */}
        {activeTab === 'policies' && (
          <div className="space-y-6 max-w-3xl">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">
                Intake &amp; Approval Policies
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Configure automated confirmation, verification, and admission policies.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border-default)]">
                <div>
                  <span className="text-xs font-bold text-[var(--text-primary)] block">
                    Auto-Approve Paid Passes
                  </span>
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    Automatically issue QR passes and approve delegates upon verified online payment.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoApprovePaid(!autoApprovePaid)}
                  className={`h-6 w-11 rounded-full p-0.5 transition-colors duration-300 focus:outline-none border ${
                    autoApprovePaid ? 'bg-[var(--pri)] border-[var(--pri)]' : 'bg-[var(--bg-surface-3)] border-[var(--border-default)]'
                  }`}
                >
                  <div className={`h-4 w-4 rounded-full transition-transform duration-300 shadow-sm ${
                    autoApprovePaid ? 'translate-x-5 bg-[var(--primary-contrast)]' : 'translate-x-0.5 bg-[var(--text-secondary)]'
                  }`} />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border-default)]">
                <div>
                  <span className="text-xs font-bold text-[var(--text-primary)] block">
                    Auto-Approve Complimentary Passes
                  </span>
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    Automatically issue delegate pass immediately for free ticket categories without manual review.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoApproveFree(!autoApproveFree)}
                  className={`h-6 w-11 rounded-full p-0.5 transition-colors duration-300 focus:outline-none border ${
                    autoApproveFree ? 'bg-[var(--pri)] border-[var(--pri)]' : 'bg-[var(--bg-surface-3)] border-[var(--border-default)]'
                  }`}
                >
                  <div className={`h-4 w-4 rounded-full transition-transform duration-300 shadow-sm ${
                    autoApproveFree ? 'translate-x-5 bg-[var(--primary-contrast)]' : 'translate-x-0.5 bg-[var(--text-secondary)]'
                  }`} />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border-default)]">
                <div>
                  <span className="text-xs font-bold text-[var(--text-primary)] block">
                    Enforce Single Registration per Email
                  </span>
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    Prevents duplicate registrations using the same email address.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSingleRegPerEmail(!singleRegPerEmail)}
                  className={`h-6 w-11 rounded-full p-0.5 transition-colors duration-300 focus:outline-none border ${
                    singleRegPerEmail ? 'bg-[var(--pri)] border-[var(--pri)]' : 'bg-[var(--bg-surface-3)] border-[var(--border-default)]'
                  }`}
                >
                  <div className={`h-4 w-4 rounded-full transition-transform duration-300 shadow-sm ${
                    singleRegPerEmail ? 'translate-x-5 bg-[var(--primary-contrast)]' : 'translate-x-0.5 bg-[var(--text-secondary)]'
                  }`} />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border-default)]">
                <div>
                  <span className="text-xs font-bold text-[var(--text-primary)] block">
                    Require OTP Verification on Sign-In
                  </span>
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    Enforces 6-digit one-time password verification before users access the portal.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setRequireOtpVerification(!requireOtpVerification)}
                  className={`h-6 w-11 rounded-full p-0.5 transition-colors duration-300 focus:outline-none border ${
                    requireOtpVerification ? 'bg-[var(--pri)] border-[var(--pri)]' : 'bg-[var(--bg-surface-3)] border-[var(--border-default)]'
                  }`}
                >
                  <div className={`h-4 w-4 rounded-full transition-transform duration-300 shadow-sm ${
                    requireOtpVerification ? 'translate-x-5 bg-[var(--primary-contrast)]' : 'translate-x-0.5 bg-[var(--text-secondary)]'
                  }`} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 3: SUPPORT CONTACTS & HELP DESK ── */}
        {activeTab === 'support' && (
          <div className="space-y-6 max-w-3xl">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">
                Support &amp; Assistance Directory
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Contact details displayed on the attendee registration portal for participant inquiries.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                  <Mail className="size-3.5 text-[var(--pri)]" />
                  <span>Primary Support Email</span>
                </label>
                <input
                  type="email"
                  placeholder="support@eventos.io"
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                  <Phone className="size-3.5 text-[var(--pri)]" />
                  <span>Primary Support Phone / WhatsApp</span>
                </label>
                <input
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={supportPhone}
                  onChange={(e) => setSupportPhone(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                />
              </div>
            </div>

            {/* Additional Contacts List */}
            <div className="space-y-3 pt-4 border-t border-[var(--border-subtle)]">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] block">
                Additional Help Desk &amp; Emergency Contacts
              </span>

              {additionalContacts.length > 0 && (
                <div className="divide-y divide-[var(--border-subtle)] rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] overflow-hidden">
                  {additionalContacts.map((contact) => (
                    <div key={contact.id} className="flex items-center justify-between p-3 text-xs">
                      <div className="flex items-center gap-2.5">
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-[var(--pri)]/10 text-[var(--pri)] border border-[var(--pri)]/20">
                          {contact.type}
                        </span>
                        <div>
                          <span className="font-bold text-[var(--text-primary)] block">{contact.label}</span>
                          <span className="text-[11px] text-[var(--text-secondary)] font-mono">{contact.value}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveContact(contact.id)}
                        className="text-[var(--text-tertiary)] hover:text-rose-500 p-1 transition-colors"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add New Contact Row */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 p-3 rounded-xl bg-[var(--bg-surface-2)]/60 border border-[var(--border-default)]">
                <select
                  value={newContactType}
                  onChange={(e: any) => setNewContactType(e.target.value)}
                  className="h-9 px-2 rounded-lg border border-[var(--border-default)] bg-[var(--card)] text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">Email</option>
                  <option value="phone">Phone</option>
                  <option value="other">Tech Support</option>
                </select>

                <input
                  type="text"
                  placeholder="Label (e.g. VIP Desk)"
                  value={newContactLabel}
                  onChange={(e) => setNewContactLabel(e.target.value)}
                  className="h-9 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--card)] text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                />

                <input
                  type="text"
                  placeholder="Value (+91... or email)"
                  value={newContactValue}
                  onChange={(e) => setNewContactValue(e.target.value)}
                  className="h-9 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--card)] text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                />

                <button
                  type="button"
                  onClick={handleAddContact}
                  className="h-9 px-3 rounded-lg bg-[var(--pri)] text-[var(--primary-contrast)] text-xs font-bold hover:opacity-95 transition-all cursor-pointer flex items-center justify-center gap-1"
                >
                  <Plus className="size-3.5" />
                  <span>Add Contact</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 4: TERMS, CONDITIONS & FAQS ── */}
        {activeTab === 'terms-faqs' && (
          <div className="space-y-6 max-w-3xl">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">
                Terms &amp; Conditions and Participant FAQs
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Set event policies, cancellation terms, and manage the FAQs modal on the attendee portal.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--text-primary)] block">
                Terms &amp; Conditions / Cancellation &amp; Refund Policy
              </label>
              <textarea
                rows={6}
                placeholder="Enter event registration policies, cancellation terms, and code of conduct..."
                value={termsAndConditions}
                onChange={(e) => setTermsAndConditions(e.target.value)}
                className="w-full p-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none font-mono resize-none"
              />
              <span className="text-[11px] text-[var(--text-secondary)] block">
                Supports markdown or HTML formatting. Displayed in the attendee portal footer &amp; modal.
              </span>
            </div>

            <div className="pt-4 border-t border-[var(--border-subtle)] space-y-4">
              <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border-default)]">
                <div>
                  <span className="text-xs font-bold text-[var(--text-primary)] block">
                    Include Default Conference FAQs
                  </span>
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    Automatically includes standard questions on pass inclusions, check-in, and receipts.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIncludeDefaultFaqs(!includeDefaultFaqs)}
                  className={`h-6 w-11 rounded-full p-0.5 transition-colors duration-300 focus:outline-none border ${
                    includeDefaultFaqs ? 'bg-[var(--pri)] border-[var(--pri)]' : 'bg-[var(--bg-surface-3)] border-[var(--border-default)]'
                  }`}
                >
                  <div className={`h-4 w-4 rounded-full transition-transform duration-300 shadow-sm ${
                    includeDefaultFaqs ? 'translate-x-5 bg-[var(--primary-contrast)]' : 'translate-x-0.5 bg-[var(--text-secondary)]'
                  }`} />
                </button>
              </div>

              {/* Custom FAQ Builder */}
              <div className="space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] block">
                  Custom Event FAQs ({faqs.length})
                </span>

                {faqs.map((faq, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border-default)] space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[var(--text-primary)]">Q: {faq.q}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveFaq(idx)}
                        className="text-[var(--text-tertiary)] hover:text-rose-500 transition-colors"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)]">A: {faq.a}</p>
                  </div>
                ))}

                <div className="p-4 rounded-xl bg-[var(--bg-surface-2)]/60 border border-[var(--border-default)] space-y-2.5">
                  <input
                    type="text"
                    placeholder="Question (e.g. Is lunch provided with the delegate pass?)"
                    value={newFaqQ}
                    onChange={(e) => setNewFaqQ(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--card)] text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                  />
                  <textarea
                    rows={2}
                    placeholder="Answer..."
                    value={newFaqA}
                    onChange={(e) => setNewFaqA(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-[var(--border-default)] bg-[var(--card)] text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none resize-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddFaq}
                    className="h-9 px-4 rounded-lg bg-[var(--pri)] text-[var(--primary-contrast)] text-xs font-bold hover:opacity-95 transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <Plus className="size-3.5" />
                    <span>Add FAQ</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 5: NOTIFICATIONS & RESOURCES ── */}
        {activeTab === 'notifications' && (
          <div className="space-y-6 max-w-3xl">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">
                Notifications &amp; Attendee Resources
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Configure automated registration emails, WhatsApp alerts, and downloadable event assets.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border-default)]">
                <div>
                  <span className="text-xs font-bold text-[var(--text-primary)] block">
                    Automated Confirmation Email with QR Pass
                  </span>
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    Instantly email the confirmed delegate their official badge QR and PDF receipt.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSendEmailConfirmation(!sendEmailConfirmation)}
                  className={`h-6 w-11 rounded-full p-0.5 transition-colors duration-300 focus:outline-none border ${
                    sendEmailConfirmation ? 'bg-[var(--pri)] border-[var(--pri)]' : 'bg-[var(--bg-surface-3)] border-[var(--border-default)]'
                  }`}
                >
                  <div className={`h-4 w-4 rounded-full transition-transform duration-300 shadow-sm ${
                    sendEmailConfirmation ? 'translate-x-5 bg-[var(--primary-contrast)]' : 'translate-x-0.5 bg-[var(--text-secondary)]'
                  }`} />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border-default)]">
                <div>
                  <span className="text-xs font-bold text-[var(--text-primary)] block">
                    WhatsApp Confirmation Alerts
                  </span>
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    Send instant WhatsApp notification with check-in pass details.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSendWhatsappAlerts(!sendWhatsappAlerts)}
                  className={`h-6 w-11 rounded-full p-0.5 transition-colors duration-300 focus:outline-none border ${
                    sendWhatsappAlerts ? 'bg-[var(--pri)] border-[var(--pri)]' : 'bg-[var(--bg-surface-3)] border-[var(--border-default)]'
                  }`}
                >
                  <div className={`h-4 w-4 rounded-full transition-transform duration-300 shadow-sm ${
                    sendWhatsappAlerts ? 'translate-x-5 bg-[var(--primary-contrast)]' : 'translate-x-0.5 bg-[var(--text-secondary)]'
                  }`} />
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--text-primary)] block">
                  Custom On-Screen Confirmation Message
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Your delegate pass has been issued. Please keep your QR code ready at the registration desk."
                  value={confirmationMessage}
                  onChange={(e) => setConfirmationMessage(e.target.value)}
                  className="w-full p-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none resize-none"
                />
              </div>
            </div>

            {/* Document Uploads */}
            <div className="pt-4 border-t border-[var(--border-subtle)] space-y-4">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] block">
                Attendee Downloadable Resources
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Program PDF */}
                <div className="p-4 rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border-default)] space-y-2 text-xs">
                  <span className="font-bold text-[var(--text-primary)] block">Conference Program PDF</span>
                  <label className="flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--card)] hover:bg-[var(--bg-surface-hover)] cursor-pointer text-xs font-semibold">
                    {uploadingProgram ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                    <span>{programUrl ? 'Replace Program' : 'Upload Program'}</span>
                    <input
                      type="file"
                      accept=".pdf"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'program')}
                    />
                  </label>
                  {programUrl && (
                    <a href={programUrl} target="_blank" rel="noreferrer" className="text-[11px] text-[var(--pri)] underline block truncate">
                      View Uploaded PDF
                    </a>
                  )}
                </div>

                {/* Speaker Guidelines PDF */}
                <div className="p-4 rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border-default)] space-y-2 text-xs">
                  <span className="font-bold text-[var(--text-primary)] block">Speaker Guidelines PDF</span>
                  <label className="flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--card)] hover:bg-[var(--bg-surface-hover)] cursor-pointer text-xs font-semibold">
                    {uploadingGuidelines ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                    <span>{speakerGuidelinesUrl ? 'Replace Guidelines' : 'Upload Guidelines'}</span>
                    <input
                      type="file"
                      accept=".pdf"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'guidelines')}
                    />
                  </label>
                  {speakerGuidelinesUrl && (
                    <a href={speakerGuidelinesUrl} target="_blank" rel="noreferrer" className="text-[11px] text-[var(--pri)] underline block truncate">
                      View Uploaded PDF
                    </a>
                  )}
                </div>

                {/* Presentation Template */}
                <div className="p-4 rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border-default)] space-y-2 text-xs">
                  <span className="font-bold text-[var(--text-primary)] block">Presentation Template</span>
                  <label className="flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--card)] hover:bg-[var(--bg-surface-hover)] cursor-pointer text-xs font-semibold">
                    {uploadingTemplate ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                    <span>{presentationTemplateUrl ? 'Replace Template' : 'Upload Template'}</span>
                    <input
                      type="file"
                      accept=".pptx,.pdf,.zip"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'template')}
                    />
                  </label>
                  {presentationTemplateUrl && (
                    <a href={presentationTemplateUrl} target="_blank" rel="noreferrer" className="text-[11px] text-[var(--pri)] underline block truncate">
                      View Uploaded File
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
