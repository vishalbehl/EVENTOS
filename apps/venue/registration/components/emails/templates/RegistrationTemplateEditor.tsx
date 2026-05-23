'use client'

import { useState, useEffect, useRef } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Plus, Save, Eye, Code, Send, Layout, Zap, History, Sparkles } from 'lucide-react'
import { apiClient } from '@/lib/api-client'
import { toast } from 'sonner'
import TemplatePreview from './TemplatePreview'
import VariablePanel from './VariablePanel'

// Default participant template variables
const PARTICIPANT_VARIABLES = [
  'ParticipantName', 'Name', 'RegNo', 'Role', 'Email',
  'Phone', 'Company', 'Designation', 'Country',
  'PaidStatus', 'EventName', 'EventCode', 'Location', 'Venue'
]

const DEFAULT_WELCOME_HTML = `<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
  <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 48px 40px; text-align: center; border-radius: 16px 16px 0 0;">
    <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 800;">Welcome, {{ParticipantName}}!</h1>
    <p style="color: rgba(255,255,255,0.85); margin-top: 12px; font-size: 14px;">Your registration for {{EventName}} is confirmed.</p>
  </div>
  <div style="padding: 40px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 16px 16px;">
    <p style="color: #374151; font-size: 15px;">Dear {{Name}},</p>
    <p style="color: #6b7280; font-size: 14px; line-height: 1.8;">Thank you for registering for <strong>{{EventName}}</strong>. Your registration number is <strong>{{RegNo}}</strong>.</p>
    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; margin: 24px 0;">
      <p style="margin: 0 0 8px 0; color: #374151; font-size: 13px;"><strong>Role:</strong> {{Role}}</p>
      <p style="margin: 0 0 8px 0; color: #374151; font-size: 13px;"><strong>Status:</strong> {{PaidStatus}}</p>
      <p style="margin: 0; color: #374151; font-size: 13px;"><strong>Venue:</strong> {{Venue}}, {{Location}}</p>
    </div>
    <p style="color: #6b7280; font-size: 13px;">We look forward to seeing you at the event!</p>
    <p style="color: #374151; font-size: 13px; margin-top: 24px;">Best regards,<br><strong>The Organizing Committee</strong></p>
  </div>
</div>`

const DEFAULT_PAYMENT_HTML = `<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
  <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 48px 40px; text-align: center; border-radius: 16px 16px 0 0;">
    <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 800;">Payment Reminder</h1>
    <p style="color: rgba(255,255,255,0.9); margin-top: 10px; font-size: 14px;">Action required for {{EventName}}</p>
  </div>
  <div style="padding: 40px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 16px 16px;">
    <p style="color: #374151; font-size: 15px;">Dear {{ParticipantName}},</p>
    <p style="color: #6b7280; font-size: 14px; line-height: 1.8;">Your registration for <strong>{{EventName}}</strong> is currently showing as <strong>{{PaidStatus}}</strong>. Please complete your payment to confirm your spot.</p>
    <p style="color: #6b7280; font-size: 14px; margin-top: 16px;">If you have already made the payment, please disregard this message.</p>
    <p style="color: #374151; font-size: 13px; margin-top: 24px;">Best regards,<br><strong>The Organizing Committee</strong></p>
  </div>
</div>`

interface Template {
  id: string
  name: string
  template_type: string
  subject: string
  body_html: string
  target_type: string
}

export default function RegistrationTemplateEditor({ eventId }: { eventId: string }) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [editData, setEditData] = useState<Partial<Template>>({ name: '', subject: '', body_html: '' })
  const textAreaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (eventId && eventId !== 'undefined') loadTemplates()
  }, [eventId])

  const loadTemplates = async () => {
    try {
      const data = await apiClient.get(`/events/${eventId}/notifications/templates?target_type=participant`)
      setTemplates(data as Template[])
    } catch {
      toast.error('Failed to load templates.')
    }
  }

  const handleSave = async () => {
    if (!editData.name || !editData.subject) {
      toast.error('Template name and subject are required.')
      return
    }
    try {
      if (selectedId) {
        await apiClient.patch(`/events/${eventId}/notifications/templates/${selectedId}`, editData)
        toast.success('Template updated.')
      } else {
        await apiClient.post(`/events/${eventId}/notifications/templates`, {
          ...editData,
          template_type: 'custom',
          target_type: 'participant',
        })
        toast.success('Template created.')
      }
      loadTemplates()
    } catch {
      toast.error('Failed to save template.')
    }
  }

  const handleTestEmail = async () => {
    if (!selectedId) { toast.error('Select a template first.'); return }
    const testEmail = window.prompt('Send test to email:', 'admin@example.com')
    if (!testEmail) return
    try {
      await apiClient.post(`/events/${eventId}/notifications/test-template`, { template_id: selectedId, to_email: testEmail })
      toast.success(`Test email sent to ${testEmail}`)
    } catch {
      toast.error('Test dispatch failed.')
    }
  }

  const insertVariable = (variable: string) => {
    const tag = `{{${variable}}}`
    if (!textAreaRef.current) return
    const start = textAreaRef.current.selectionStart
    const end = textAreaRef.current.selectionEnd
    const text = editData.body_html || ''
    const newText = text.substring(0, start) + tag + text.substring(end)
    setEditData({ ...editData, body_html: newText })
    setTimeout(() => {
      if (textAreaRef.current) {
        textAreaRef.current.focus()
        textAreaRef.current.setSelectionRange(start + tag.length, start + tag.length)
      }
    }, 10)
  }

  return (
    <div className="grid grid-cols-12 gap-6 flex-1 min-h-0 h-full animate-in fade-in duration-700 w-full min-w-0">
      {/* Sidebar */}
      {/* Sidebar */}
      <div className="col-span-12 lg:col-span-3 flex flex-col gap-4 h-full min-h-0 min-w-0">
        {/* Template Selector Dropdown */}
        <div className="glass-card rounded-[2.5rem] p-6 border border-white/5 flex flex-col gap-4 shrink-0">
          <div className="relative group">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--pri)] mb-2 block px-1">Select Template</label>
            <div className="relative">
              <select
                value={
                  selectedId 
                    ? selectedId 
                    : editData.name === 'Welcome Confirmation' && editData.body_html === DEFAULT_WELCOME_HTML
                      ? 'quickstart:welcome'
                      : editData.name === 'Payment Reminder' && editData.body_html === DEFAULT_PAYMENT_HTML
                        ? 'quickstart:payment'
                        : ''
                }
                onChange={(e) => {
                  const val = e.target.value
                  if (val === '') {
                    setSelectedId(null)
                    setEditData({ name: '', subject: '', body_html: '' })
                  } else if (val === 'quickstart:welcome') {
                    setSelectedId(null)
                    setEditData({
                      name: 'Welcome Confirmation',
                      subject: 'Your Registration is Confirmed — {{EventName}}',
                      body_html: DEFAULT_WELCOME_HTML
                    })
                  } else if (val === 'quickstart:payment') {
                    setSelectedId(null)
                    setEditData({
                      name: 'Payment Reminder',
                      subject: 'Payment Reminder — {{EventName}}',
                      body_html: DEFAULT_PAYMENT_HTML
                    })
                  } else {
                    const t = templates.find(x => x.id === val)
                    if (t) {
                      setSelectedId(t.id)
                      setEditData(t)
                    }
                  }
                }}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 px-4 text-xs font-bold text-[var(--text)] focus:outline-none focus:border-[var(--pri)]/50 appearance-none cursor-pointer pr-10"
              >
                <option value="" className="bg-[var(--base)] text-[var(--text)]">Custom Template</option>
                {templates.length > 0 && (
                  <optgroup label="Saved Templates" className="bg-[var(--base)] text-[var(--text)]">
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Quick Start Starters" className="bg-[var(--base)] text-[var(--text)]">
                  <option value="quickstart:welcome">Welcome Confirmation</option>
                  <option value="quickstart:payment">Payment Reminder</option>
                </optgroup>
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--muted)]">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Variable panel for participants */}
        <div className="glass-card rounded-[2.5rem] p-6 border border-white/5 flex flex-col flex-1 min-h-0">
          <p className="text-[11px] font-black uppercase tracking-widest text-muted mb-3 shrink-0">Participant Variables</p>
          <div className="grid grid-cols-1 gap-2 overflow-y-auto custom-scrollbar flex-1 min-h-0 pr-1">
            {PARTICIPANT_VARIABLES.map(v => (
              <button
                key={v}
                onClick={() => insertVariable(v)}
                className="text-left px-3.5 py-2.5 rounded-lg bg-white/5 hover:bg-[var(--pri)]/10 hover:text-[var(--pri)] text-xs font-mono text-[var(--muted)] transition-all font-bold"
              >
                {'{{' + v + '}}'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Editor Canvas */}
      <div className="col-span-12 lg:col-span-9 flex flex-col gap-4 h-full min-h-0 min-w-0">
        <div className="glass-card rounded-[2.5rem] p-6 flex-1 flex flex-col relative overflow-hidden bg-[var(--card)]/80 min-h-0">
          <div className="relative z-10 flex flex-col h-full gap-4 flex-1 min-h-0">
            <div className="flex items-center justify-between shrink-0">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-[var(--pri)]/10 flex items-center justify-center border border-[var(--pri)]/20">
                  <Sparkles className="w-6 h-6 text-[var(--pri)]" />
                </div>
                <div>
                  <h2 className="text-2xl font-black tracking-tighter uppercase">
                    {selectedId ? 'Edit' : 'Create'} <span className="text-[var(--pri)]">Template</span>
                  </h2>
                  <p className="text-[9px] font-black uppercase tracking-[0.4em] text-muted mt-1.5">Participant Email Editor</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setIsPreviewOpen(true)} className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all active:scale-95">
                  <Eye className="w-3.5 h-3.5 text-[var(--pri)]" /> Preview
                </button>
                <button onClick={handleTestEmail} className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all active:scale-95">
                  <Send className="w-3.5 h-3.5 text-[var(--pri)]" /> Test
                </button>
                <button onClick={handleSave} className="flex items-center gap-2.5 px-5 py-2.5 bg-[var(--pri)] hover:bg-[var(--pri-hover)] text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all active:scale-95 animate-in">
                  <Save className="w-3.5 h-3.5" /> Save
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">
              <div className="py-2.5 px-4 rounded-xl bg-white/5 border border-white/5 focus-within:border-[var(--pri)]/50 transition-all">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="w-3.5 h-3.5 text-[var(--pri)] opacity-60" />
                  <label className="text-[9px] font-black uppercase tracking-[0.3em] text-muted">Template Name</label>
                </div>
                <input
                  value={editData.name || ''}
                  onChange={e => setEditData({ ...editData, name: e.target.value })}
                  placeholder="e.g., Welcome Confirmation"
                  className="w-full bg-transparent border-0 text-base font-bold text-[var(--text)] focus:ring-0 p-0 pl-5.5"
                />
              </div>
              <div className="py-2.5 px-4 rounded-xl bg-white/5 border border-white/5 focus-within:border-[var(--pri)]/50 transition-all">
                <div className="flex items-center gap-2 mb-1">
                  <Layout className="w-3.5 h-3.5 text-[var(--pri)] opacity-60" />
                  <label className="text-[9px] font-black uppercase tracking-[0.3em] text-muted">Email Subject</label>
                </div>
                <input
                  value={editData.subject || ''}
                  onChange={e => setEditData({ ...editData, subject: e.target.value })}
                  placeholder="Your Registration is Confirmed..."
                  className="w-full bg-transparent border-0 text-base font-bold text-[var(--text)] focus:ring-0 p-0 pl-5.5"
                />
              </div>
            </div>

            <div className="flex-1 flex flex-col rounded-[2.5rem] overflow-hidden border border-white/5 bg-black/40 min-h-0">
              <div className="bg-white/5 px-6 py-4 flex items-center justify-between border-b border-white/5 shrink-0">
                <div className="flex items-center gap-3">
                  <Code className="w-4 h-4 text-[var(--pri)]" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">Email Content (HTML)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-[var(--pri)] animate-pulse" />
                  <span className="text-[9px] font-black text-muted uppercase tracking-widest">Participant Scope</span>
                </div>
              </div>
              <textarea
                ref={textAreaRef}
                value={editData.body_html || ''}
                onChange={e => setEditData({ ...editData, body_html: e.target.value })}
                className="flex-1 w-full bg-transparent p-5 text-xs md:text-sm font-mono text-zinc-200 leading-normal focus:outline-none resize-none custom-scrollbar min-h-0"
                placeholder="<!-- Write your participant email HTML here... -->"
              />
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isPreviewOpen && (
          <TemplatePreview
            html={editData.body_html || ''}
            subject={editData.subject || 'No Subject'}
            onClose={() => setIsPreviewOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
