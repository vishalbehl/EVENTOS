'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  SlidersHorizontal, Globe, Clock, ShieldCheck, Mail, Phone, 
  MessageSquare, FileText, CheckCircle2, AlertCircle, Save, 
  ExternalLink, Copy, Check, Plus, Trash2, Upload, Loader2,
  Bell, FileCheck, Tag, Info, HelpCircle, UserCheck, Lock,
  Download, Eye, ArrowRight, X, Edit3, Layers
} from 'lucide-react'
import Link from 'next/link'
import { useUpdateEvent } from '@/hooks/useEvents'
import { useEventEditSession } from '@/hooks/useEventEditSession'
import { ScopedEventEditor } from '@/components/organizer/events/ScopedEventEditor'
import { apiClient } from '@/lib/api-client'
import { toast } from 'sonner'
import { useOperationAccess } from '@/lib/capabilities'
import { organiserFormService } from '@/services/form-template-service'
import { useFormConfigSave } from '@/hooks/useFormConfigSave'
import { FormTemplate, FormRenderer } from '@eventos/form-builder-studio'
import { uploadAndWaitForScan, requiresNewUploadAttempt } from '@/services/scan-gated-upload-service'

const SETTINGS_TABS = [
  { id: 'form-blueprint', label: 'Default Form Blueprint', icon: FileCheck },
  { id: 'intake',        label: 'Intake & Timeline',    icon: Clock },
  { id: 'policies',      label: 'Approval & Policies',  icon: UserCheck },
  { id: 'support',       label: 'Support & Help Desk',  icon: Phone },
  { id: 'terms-faqs',    label: 'Terms & FAQs',         icon: HelpCircle },
  { id: 'notifications', label: 'Notifications & Files', icon: Bell },
]

export default function RegistrationSettingsPage() {
  const { eventId } = useParams()
  return <ScopedEventEditor eventId={String(eventId)}><RegistrationSettingsEditor /></ScopedEventEditor>
}

function RegistrationSettingsEditor() {
  const { eventId } = useParams()
  const eid = eventId as string
  const formAccess = useOperationAccess('registration.forms.manage')
  const paymentAccess = useOperationAccess('registration.payments.manage')
  const edit = useEventEditSession(eid)
  const event = edit.event
  const [loadedEvent, setLoadedEvent] = useState<typeof event>()
  const eventLoading = !edit.ready
  const updateEvent = useUpdateEvent(eid, edit.version)
  const formSave = useFormConfigSave(eid)

  const [activeTab, setActiveTab] = useState('form-blueprint')
  const [isLive, setIsLive] = useState(false)
  const [formVersion, setFormVersion] = useState<number | null>(null)
  const publicationReceipt = useRef<{ fingerprint: string; key: string } | null>(null)
  const [togglingLive, setTogglingLive] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [saving, setSaving] = useState(false)

  // 0. Default Form Blueprint
  const [activeTemplateId, setActiveTemplateId] = useState<string>('')
  const [activeFormFieldsCount, setActiveFormFieldsCount] = useState<number>(0)
  const [availableTemplates, setAvailableTemplates] = useState<FormTemplate[]>([])
  const [nextBlueprintCursor, setNextBlueprintCursor] = useState<string | null>(null)
  const [loadingBlueprints, setLoadingBlueprints] = useState(false)
  const [loadingMoreBlueprints, setLoadingMoreBlueprints] = useState(false)
  const [blueprintLoadError, setBlueprintLoadError] = useState<string | null>(null)
  const [previewBlueprint, setPreviewBlueprint] = useState<FormTemplate | null>(null)
  const [applyingBlueprintId, setApplyingBlueprintId] = useState<string | null>(null)
  const [isLibraryOpen, setIsLibraryOpen] = useState(false)

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
  const uploadRetryReceipts = useRef(new Map<string, { fingerprint: string; key: string }>())

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
      setLoadedEvent(event)
    }
  }, [event])

  // Load Live Portal Status & Blueprint Templates
  useEffect(() => {
    const controller = new AbortController()
    const fetchPortalStatus = async () => {
      try {
        const res = await apiClient.get<any>(`/events/${eid}/registration/form-config`, { signal: controller.signal })
        if (!edit.isCurrent() || controller.signal.aborted) return
        setIsLive(res.is_live || false)
        setFormVersion(Number.isInteger(res.version) && res.version > 0 ? res.version : null)
        if (res.template_id) {
          setActiveTemplateId(String(res.template_id))
        }
        if (Array.isArray(res.fields)) {
          setActiveFormFieldsCount(res.fields.length)
        }
      } catch (err) {
        console.error('Failed to fetch portal status:', err)
      }
    }

    const loadBlueprints = async () => {
      setLoadingBlueprints(true)
      setBlueprintLoadError(null)
      try {
        const page = await organiserFormService.listTemplatePage({
          category_key: 'registration', event_id: eid, page_size: '50',
        })
        setAvailableTemplates(page.items || [])
        setNextBlueprintCursor(page.has_next ? page.next_cursor || null : null)
      } catch (err) {
        setAvailableTemplates([])
        setNextBlueprintCursor(null)
        setBlueprintLoadError('The registration template catalogue is unavailable. Reload before selecting a form.')
        console.error('Failed to load form blueprints:', err)
      } finally {
        setLoadingBlueprints(false)
      }
    }

    if (eid) {
      fetchPortalStatus()
      loadBlueprints()
    }
    return () => controller.abort()
  }, [eid])

  const loadMoreBlueprints = async () => {
    if (!nextBlueprintCursor || loadingMoreBlueprints) return
    setLoadingMoreBlueprints(true)
    try {
      const page = await organiserFormService.listTemplatePage({
        category_key: 'registration', event_id: eid,
        cursor: nextBlueprintCursor, page_size: '50',
      })
      if (!edit.isCurrent()) return
      setAvailableTemplates((current) => {
        const seen = new Set(current.map((template) => template.id))
        return [...current, ...page.items.filter((template) => !seen.has(template.id))]
      })
      setNextBlueprintCursor(page.has_next ? page.next_cursor || null : null)
    } catch (err) {
      if (edit.isCurrent()) {
        setBlueprintLoadError('More templates could not be loaded. Your current selection is unchanged.')
      }
    } finally {
      if (edit.isCurrent()) setLoadingMoreBlueprints(false)
    }
  }

  const handleSelectDefaultForm = async (tpl: FormTemplate) => {
    if (!eid || applyingBlueprintId || togglingLive || !formAccess.enabled) return
    setApplyingBlueprintId(tpl.id)
    try {
      const saved = await formSave.save(formVersion, {
        template_id: tpl.id.startsWith('tpl_') ? tpl.slug : tpl.id,
        fields: tpl.fields || [],
        settings: tpl.settings || {},
      })
      if (!saved || !edit.isCurrent()) return
      setFormVersion(saved.version)
      setIsLive(saved.is_live)
      setActiveTemplateId(saved.template_id || '')
      setActiveFormFieldsCount(saved.fields?.length || 0)
      toast.success(`"${tpl.name}" is now the active default registration form! Reflected on event portal. 🚀`)
    } catch (err: any) {
      if (edit.isCurrent()) toast.error(err.message || 'Failed to apply default registration form. Reload if its version has changed.')
    } finally {
      if (edit.isCurrent()) setApplyingBlueprintId(null)
    }
  }

  const portalUrl = `${process.env.NEXT_PUBLIC_REGISTRATION_URL || 'http://localhost:3003'}/${eid}`

  const handleToggleLive = async () => {
    if (!formVersion || togglingLive || formSave.pending || applyingBlueprintId || !formAccess.enabled) {
      toast.error('Reload the current portal state before changing publication.')
      return
    }
    setTogglingLive(true)
    try {
      const fingerprint = JSON.stringify([edit.scope, formVersion, !isLive])
      if (publicationReceipt.current?.fingerprint !== fingerprint) publicationReceipt.current = { fingerprint, key: crypto.randomUUID() }
      const res = await apiClient.post<any>(`/events/${eid}/registration/portal-status`, {
        is_live: !isLive,
      }, { headers: { 'If-Match': String(formVersion), 'Idempotency-Key': publicationReceipt.current.key } })
      if (!edit.isCurrent()) return
      publicationReceipt.current = null
      setIsLive(res.is_live)
      setFormVersion(res.version)
      toast.success(res.is_live ? 'Registration portal is now LIVE 🚀' : 'Registration portal set to Draft (Offline)')
    } catch (error: any) {
      if (edit.isCurrent()) toast.error(error.message || 'Failed to update registration portal live status.')
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
    let requestReceiptKey: string | undefined
    try {
      const fingerprint = [eid, type, file.name, file.size, file.lastModified, file.type].join(':')
      let receipt = uploadRetryReceipts.current.get(type)
      if (!receipt || receipt.fingerprint !== fingerprint) {
        receipt = { fingerprint, key: crypto.randomUUID() }
        uploadRetryReceipts.current.set(type, receipt)
      }
      requestReceiptKey = receipt.key
      const data = await uploadAndWaitForScan({
        eventId: eid,
        file,
        staffProgram: true,
        idempotencyKey: receipt.key,
      })
      if (!edit.isCurrent()) return
      if (type === 'program') setProgramUrl(data.managed_url)
      else if (type === 'guidelines') setSpeakerGuidelinesUrl(data.managed_url)
      else setPresentationTemplateUrl(data.managed_url)
      uploadRetryReceipts.current.delete(type)
      toast.success(`${type.toUpperCase()} file uploaded and security checked.`)
    } catch (error: any) {
      if (edit.isCurrent()) {
        if (requiresNewUploadAttempt(error) && uploadRetryReceipts.current.get(type)?.key === requestReceiptKey) uploadRetryReceipts.current.delete(type)
        toast.error(error?.message || `Failed to upload ${type} document.`)
      }
    } finally {
      if (edit.isCurrent()) setter(false)
    }
  }

  const handleSaveAllSettings = async () => {
    if (!edit.ready || saving || updateEvent.isPending || !formAccess.enabled || !paymentAccess.enabled) return
    setSaving(true)
    try {
      const saved = await updateEvent.mutateAsync({
        registration_settings: {
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
      if (!edit.complete(saved)) return
      toast.success('Registration settings saved successfully! ⚙️')
    } catch (error: any) {
      if (edit.isCurrent()) toast.error(error.message || 'Failed to save registration settings. Your edits are retained.')
    } finally {
      setSaving(false)
    }
  }

  if (!edit.ready || (!edit.dirty && loadedEvent !== event)) return <p role="status">{edit.error || 'Loading event settings…'}</p>
  return (
    <fieldset disabled={saving || updateEvent.isPending || edit.reloading || formSave.pending || togglingLive} className="w-full max-w-full overflow-x-hidden p-6 space-y-6" onChangeCapture={edit.markDirty} onClickCapture={edit.markDirty}>
      <button type="button" disabled={saving || edit.reloading} onClick={() => void edit.reload()}>Discard changes and reload current settings</button>
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
            disabled={saving || !formAccess.enabled || !paymentAccess.enabled || !edit.ready}
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
        
        {/* ── TAB 0: DEFAULT FORM BLUEPRINT ── */}
        {activeTab === 'form-blueprint' && (
          <div className="space-y-6">
            {blueprintLoadError ? (
              <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
                {blueprintLoadError}
              </div>
            ) : null}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[var(--border-default)]">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)] flex items-center gap-2">
                  <FileCheck className="h-4 w-4 text-indigo-400" />
                  Default Registration Form Blueprint
                </h2>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Select which questionnaire layout serves as the default registration form for attendees on your event portal.
                </p>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <Link
                  href={`/events/${eid}/registration/form-builder${activeTemplateId ? `?templateId=${activeTemplateId}` : ''}`}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/30 transition cursor-pointer"
                >
                  <Edit3 className="size-3.5" />
                  <span>Edit in Designer</span>
                  <ArrowRight className="size-3.5" />
                </Link>

                <button
                  type="button"
                  onClick={() => setIsLibraryOpen(true)}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[var(--bg-surface-2)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-default)] text-xs font-bold text-[var(--text-primary)] transition cursor-pointer"
                >
                  <Layers className="size-3.5 text-indigo-400" />
                  <span>Show Form Templates</span>
                </button>
              </div>
            </div>

            {/* Active Template Status Card */}
            {(() => {
              const activeTpl = activeTemplateId
                ? availableTemplates.find(
                    (t) =>
                      t.id === activeTemplateId ||
                      t.slug === activeTemplateId ||
                      (t.settings as any)?._source_template_id === activeTemplateId
                  ) || null
                : null;

              return activeTpl ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* Left Column (5 cols): Template Details & Actions */}
                  <div className="lg:col-span-5 space-y-6">
                    <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/60 backdrop-blur-sm shadow-xl space-y-6">
                      <div className="space-y-3 pb-5 border-b border-zinc-800">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700">
                            {activeTpl.category_name || "Registration Form"}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                            <CheckCircle2 className="size-3" />
                            Active Default on Event Portal
                          </span>
                        </div>

                        <h3 className="text-xl font-bold text-white tracking-tight">
                          {activeTpl.name}
                        </h3>
                        <p className="text-xs text-zinc-400 leading-relaxed">
                          {activeTpl.description || "Active registration questionnaire layout applied to this event."}
                        </p>

                        <div className="flex items-center gap-2.5 pt-2">
                          <Link
                            href={`/events/${eid}/registration/form-builder${activeTemplateId ? `?templateId=${activeTemplateId}` : ''}`}
                            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/30 transition cursor-pointer"
                          >
                            <Edit3 className="size-3.5" />
                            <span>Edit in Designer</span>
                            <ArrowRight className="size-3.5" />
                          </Link>

                          <button
                            type="button"
                            onClick={() => setIsLibraryOpen(true)}
                            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl border border-zinc-700 bg-zinc-800/80 hover:bg-zinc-750 text-zinc-200 hover:text-white text-xs font-semibold cursor-pointer transition"
                          >
                            <Layers className="size-3.5 text-indigo-400" />
                            <span>Change Template</span>
                          </button>
                        </div>
                      </div>

                      {/* Attributes */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Total Questions</span>
                          <p className="text-lg font-black text-white">
                            {activeFormFieldsCount || activeTpl.fields?.length || 0}
                          </p>
                        </div>

                        <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Required Questions</span>
                          <p className="text-lg font-black text-indigo-400">
                            {activeTpl.fields?.filter((f) => f.is_required).length || 0}
                          </p>
                        </div>

                        <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Form Scope</span>
                          <p className="text-xs font-bold text-zinc-300 mt-1">
                            Event &amp; Organisation Copy
                          </p>
                        </div>

                        <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Attendee Portal</span>
                          <p className="text-xs font-bold text-emerald-400 mt-1 flex items-center gap-1">
                            <CheckCircle2 className="size-3" /> Live &amp; Reflected
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column (7 cols): Live Form Interactive Preview Window */}
                  <div className="lg:col-span-7">
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 backdrop-blur-sm shadow-xl overflow-hidden">
                      <div className="px-5 py-3.5 border-b border-zinc-800 bg-zinc-950/50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
                            <Eye className="size-3.5 text-indigo-400" />
                            Live Form Preview
                          </span>
                        </div>
                        <span className="text-[11px] text-zinc-500 font-medium">
                          Attendee Registration View
                        </span>
                      </div>
                      <div className="p-6 max-h-[750px] overflow-y-auto bg-zinc-950/30">
                        <FormRenderer
                          fields={activeTpl.fields || []}
                          settings={activeTpl.settings || {}}
                          previewMode={true}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-16 border-2 border-dashed border-zinc-800 rounded-2xl text-center space-y-4 bg-zinc-900/40">
                  <Layers className="size-12 text-indigo-500/60 mx-auto" />
                  <div>
                    <h4 className="text-base font-bold text-white">No registration form selected</h4>
                    <p className="text-xs text-zinc-400 max-w-sm mx-auto mt-1">
                      No versioned registration-form configuration is bound to this event. Open the catalogue to choose one.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsLibraryOpen(true)}
                    className="h-9 px-4 rounded-xl text-xs font-bold gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-600/30 cursor-pointer inline-flex items-center"
                  >
                    <Layers className="size-3.5" />
                    Show Form Templates
                  </button>
                </div>
              );
            })()}

            {/* ── Dialogue Pop-up Window: Template Library Modal ── */}
            {isLibraryOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in">
                <div className="w-full max-w-5xl max-h-[90vh] bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                  <div className="h-16 border-b border-zinc-800 px-6 flex items-center justify-between shrink-0 bg-zinc-900/90">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-indigo-600/10 border border-indigo-600/20 flex items-center justify-center">
                        <Layers className="size-5 text-indigo-400" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-white">Select Default Registration Blueprint</h3>
                        <p className="text-xs text-zinc-400">
                          Fetching a template copies the design for this event and activates it immediately on the attendee portal.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsLibraryOpen(false)}
                      className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
                    >
                      <X className="size-5" />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 bg-zinc-950/40">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {availableTemplates.map((template) => {
                        const isSelected =
                          template.id === activeTemplateId ||
                          template.slug === activeTemplateId ||
                          (template.settings as any)?._source_template_id === activeTemplateId;
                        const isApplying = applyingBlueprintId === template.id;

                        return (
                          <div
                            key={template.id}
                            className={`rounded-xl border p-4.5 flex flex-col justify-between transition-all ${
                              isSelected
                                ? 'border-indigo-500/60 bg-indigo-500/[0.04] shadow-sm ring-1 ring-indigo-500/30'
                                : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700'
                            }`}
                          >
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700">
                                  {template.category_name || "Registration"}
                                </span>
                                {isSelected && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                    <CheckCircle2 className="size-3" />
                                    Active Default
                                  </span>
                                )}
                              </div>

                              <div>
                                <h4 className="text-sm font-bold text-white">
                                  {template.name}
                                </h4>
                                <p className="text-xs text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
                                  {template.description || "Questionnaire layout tailored for event registration."}
                                </p>
                              </div>

                              <div className="text-[11px] text-zinc-500 flex items-center gap-2 pt-2 border-t border-zinc-800">
                                <span>{template.fields?.length || 0} Questions</span>
                                <span>•</span>
                                <span>{template.fields?.filter(f => f.is_required).length || 0} Required</span>
                              </div>
                            </div>

                            <div className="pt-4 mt-4 border-t border-zinc-800 flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => setPreviewBlueprint(template)}
                                className="h-8 px-3 rounded-lg border border-zinc-700 bg-zinc-800/80 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 hover:text-white flex items-center gap-1.5 transition cursor-pointer"
                              >
                                <Eye className="size-3.5 text-indigo-400" />
                                <span>Preview</span>
                              </button>

                              {isSelected ? (
                                <div className="h-8 px-3 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold flex items-center gap-1.5 select-none">
                                  <Check className="size-3.5" />
                                  <span>Selected</span>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleSelectDefaultForm(template)}
                                  disabled={isApplying}
                                  className="h-8 px-3.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm shadow-indigo-600/30 transition cursor-pointer disabled:opacity-50"
                                >
                                  {isApplying ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                                  <span>Fetch &amp; Set Default</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {nextBlueprintCursor && (
                      <div className="pt-6 flex justify-center">
                        <button
                          type="button"
                          onClick={loadMoreBlueprints}
                          disabled={loadingMoreBlueprints}
                          className="h-9 px-4 rounded-xl border border-zinc-700 bg-zinc-900 text-xs font-bold text-zinc-200 hover:bg-zinc-800 disabled:opacity-50 inline-flex items-center gap-2"
                        >
                          {loadingMoreBlueprints && <Loader2 className="size-3.5 animate-spin" />}
                          Load more templates
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

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

      {/* ── Blueprint Preview Modal ── */}
      {previewBlueprint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-2xl max-h-[90vh] bg-[var(--bg-surface-2,#18181b)] border border-[var(--border-default)] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="h-14 border-b border-[var(--border-default)] px-5 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm font-bold text-[var(--text-primary,#ffffff)]">{previewBlueprint.name}</h3>
                <span className="text-[10px] text-[var(--pri)] font-semibold">
                  {previewBlueprint.category_name || "Registration Form"} Blueprint
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewBlueprint(null)}
                className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-surface-3)] cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <FormRenderer fields={previewBlueprint.fields} settings={previewBlueprint.settings} previewMode={true} />
            </div>

            <div className="h-14 border-t border-[var(--border-default)] px-5 flex items-center justify-between shrink-0 bg-[var(--bg-surface-3,#1b1b1d)]">
              <span className="text-xs text-[var(--text-secondary)]">
                {previewBlueprint.fields?.length || 0} questions in this template
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewBlueprint(null)}
                  className="h-8 px-3.5 text-xs font-semibold rounded-xl border border-[var(--border-default)] hover:bg-[var(--bg-surface-2)] text-[var(--text-secondary)] cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const t = previewBlueprint;
                    setPreviewBlueprint(null);
                    handleSelectDefaultForm(t);
                  }}
                  className="h-8 px-4 text-xs font-bold rounded-xl bg-[var(--pri)] text-[var(--primary-contrast)] hover:opacity-90 cursor-pointer shadow-sm flex items-center gap-1.5"
                >
                  <Download className="size-3.5" />
                  <span>Select as Default Form</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </fieldset>
  )
}
