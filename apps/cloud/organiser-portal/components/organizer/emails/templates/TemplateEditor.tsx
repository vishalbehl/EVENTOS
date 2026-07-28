'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
    Plus, 
    Save, 
    Eye, 
    Code, 
    Send,
    Layout,
    Zap,
    History,
    Search,
    ChevronRight,
    Sparkles
} from 'lucide-react'
import { 
    getTemplates, 
    createTemplate, 
    updateTemplate, 
    Template 
} from '@/services/email-service'
import { apiClient } from '@/lib/api-client'
import { toast } from 'sonner'
import { useOperationAccess } from '@/lib/capabilities'

// ===== Specialized Sub-components =====
import VariablePanel from './VariablePanel'
import TemplatePreview from './TemplatePreview'

interface Props {
    eventId: string
}

export default function TemplateEditor({ eventId }: Props) {
    const readAccess = useOperationAccess('communications.email.read')
    const manageAccess = useOperationAccess('communications.campaign.manage')
    const sendAccess = useOperationAccess('communications.email.send')
    const [templates, setTemplates] = useState<Template[]>([])
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [isPreviewOpen, setIsPreviewOpen] = useState(false)
    const [editData, setEditData] = useState<Partial<Template>>({
        name: '',
        subject: '',
        body_html: '',
    })

    const textAreaRef = useRef<HTMLTextAreaElement>(null)

    useEffect(() => {
        if (eventId && eventId !== 'undefined' && eventId !== '[eventId]' && readAccess.enabled) {
            void loadTemplates()
        }
    }, [eventId, readAccess.enabled])

    const loadTemplates = async () => {
        try {
            const data = await getTemplates(eventId)
            setTemplates(data)
        } catch (err) {
            toast.error('Failed to load templates.')
        }
    }

    const handleSave = async () => {
        if (!manageAccess.enabled) {
            toast.error(`Template changes unavailable: ${(manageAccess.reason || 'RESOLUTION_UNAVAILABLE').replaceAll('_', ' ').toLowerCase()}.`)
            return
        }
        if (!editData.name || !editData.subject) {
            toast.error('Identity and Subject required.')
            return
        }

        try {
            if (selectedId) {
                await updateTemplate(eventId, selectedId, editData)
                toast.success('Template updated successfully.')
            } else {
                await createTemplate(eventId, {
                    name: editData.name || '',
                    template_type: 'custom',
                    subject: editData.subject || '',
                    body_html: editData.body_html || '',
                })
                toast.success('New template created.')
            }
            loadTemplates()
        } catch (err) {
            toast.error('Processing failure.')
        }
    }

    const handleTestEmail = async () => {
        if (!sendAccess.enabled) {
            toast.error(`Test sending unavailable: ${(sendAccess.reason || 'RESOLUTION_UNAVAILABLE').replaceAll('_', ' ').toLowerCase()}.`)
            return
        }
        if (!selectedId) {
            toast.error('Please select and save a template first.')
            return
        }
        
        const testEmail = window.prompt('Enter destination email for preview test:', 'admin@example.com')
        if (!testEmail) return

        try {
            await apiClient.post(`/events/${eventId}/notifications/test-template`, {
                template_id: selectedId,
                to_email: testEmail
            }, { headers: { "Idempotency-Key": crypto.randomUUID() } })
            toast.success(`Test email sent to ${testEmail}`)
        } catch (err) {
            toast.error('Test dispatch failure.')
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
        
        // Return focus
        setTimeout(() => {
            if (textAreaRef.current) {
                textAreaRef.current.focus()
                textAreaRef.current.setSelectionRange(start + tag.length, start + tag.length)
            }
        }, 10)
    }

    if (!readAccess.loading && !readAccess.enabled) {
        return (
            <div className="flex min-h-[320px] items-center justify-center rounded-3xl border border-amber-500/20 bg-amber-500/5 p-8 text-center text-sm text-amber-100">
                Email templates are unavailable: {(readAccess.reason || 'RESOLUTION_UNAVAILABLE').replaceAll('_', ' ').toLowerCase()}.
            </div>
        )
    }

    return (
        <div className="grid grid-cols-12 gap-6 flex-1 min-h-0 h-full animate-in fade-in duration-700 w-full min-w-0">
            {/* ===== Sidebar: Template Registry ===== */}
            <div className="col-span-12 lg:col-span-3 flex flex-col gap-4 h-full min-h-0 min-w-0">
                {/* Template Selector Dropdown */}
                <div className="glass-card rounded-[2.5rem] p-6 border border-white/5 flex flex-col gap-4 shrink-0">
                    <div className="relative group">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--pri)] mb-2 block px-1">Select Template</label>
                        <div className="relative">
                            <select
                                value={selectedId || ''}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === '') {
                                        setSelectedId(null);
                                        setEditData({ name: '', subject: '', body_html: '' });
                                    } else {
                                        const t = templates.find(x => x.id === val);
                                        if (t) {
                                            setSelectedId(t.id);
                                            setEditData(t);
                                        }
                                    }
                                }}
                                className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 px-4 text-xs font-bold text-[var(--text)] focus:outline-none focus:border-[var(--pri)]/50 appearance-none cursor-pointer pr-10"
                            >
                                <option value="" className="bg-[var(--base)] text-[var(--text)]">Custom Template</option>
                                {templates.map((t) => (
                                    <option key={t.id} value={t.id} className="bg-[var(--base)] text-[var(--text)]">
                                        {t.name}
                                    </option>
                                ))}
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--muted)]">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Variable Selector */}
                <div className="flex-1 min-h-0">
                    <VariablePanel onInsert={insertVariable} />
                </div>
            </div>

            {/* ===== Main Editor Canvas ===== */}
            <div className="col-span-12 lg:col-span-9 flex flex-col gap-4 h-full min-h-0 min-w-0">
                <div className="glass-card rounded-[2.5rem] p-6 flex-1 flex flex-col relative overflow-hidden bg-[var(--card)]/80 backdrop-blur-3xl min-h-0">
                    <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                        <Code className="w-36 h-36 text-[var(--pri)]" />
                    </div>

                    <div className="relative z-10 flex flex-col h-full gap-4 flex-1 min-h-0">
                        {/* Editor Header */}
                        <div className="flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-xl bg-[var(--pri)]/10 flex items-center justify-center border border-[var(--pri)]/20">
                                    <Sparkles className="w-6 h-6 text-[var(--pri)]" />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black tracking-tighter text-[var(--text)] uppercase leading-none">
                                        {selectedId ? 'Edit' : 'Create'} <span className="text-[var(--pri)]">Template</span>
                                    </h2>
                                    <p className="text-[9px] font-black uppercase tracking-[0.4em] text-[var(--muted)] mt-1.5">
                                        Email Editor & Template List
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setIsPreviewOpen(true)}
                                    className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 text-[var(--text)] rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all active:scale-95"
                                >
                                    <Eye className="w-3.5 h-3.5 text-[var(--success)]" />
                                    Preview
                                </button>
                                <button
                                    onClick={handleTestEmail}
                                    disabled={sendAccess.loading || !sendAccess.enabled}
                                    title={sendAccess.enabled ? 'Send test email' : `Unavailable: ${(sendAccess.reason || 'RESOLUTION_UNAVAILABLE').replaceAll('_', ' ').toLowerCase()}`}
                                    className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 text-[var(--text)] rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all active:scale-95"
                                >
                                    <Send className="w-3.5 h-3.5 text-[var(--pri)]" />
                                    Test
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={manageAccess.loading || !manageAccess.enabled}
                                    title={manageAccess.enabled ? 'Save template' : `Unavailable: ${(manageAccess.reason || 'RESOLUTION_UNAVAILABLE').replaceAll('_', ' ').toLowerCase()}`}
                                    className="flex items-center gap-2.5 px-5 py-2.5 bg-[var(--pri)] text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-[var(--pri)]/20 hover:bg-[var(--sec)] transition-all active:scale-95"
                                >
                                    <Save className="w-3.5 h-3.5" />
                                    Save
                                </button>
                            </div>
                        </div>

                        {/* Top Metadata Fields */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">
                            <EditorField label="Template Name" icon={<Zap className="w-4 h-4 text-[var(--pri)]" />}>
                                <input
                                    value={editData.name}
                                    onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                                    placeholder="e.g., Speaker Welcome Node"
                                    className="w-full bg-transparent border-0 text-lg font-bold text-[var(--text)] focus:ring-0 p-0"
                                />
                            </EditorField>
                            <EditorField label="Email Subject" icon={<Layout className="w-4 h-4 text-[var(--pri)]" />}>
                                <input
                                    value={editData.subject}
                                    onChange={(e) => setEditData({ ...editData, subject: e.target.value })}
                                    placeholder="Enter subject line..."
                                    className="w-full bg-transparent border-0 text-lg font-bold text-[var(--text)] focus:ring-0 p-0"
                                />
                            </EditorField>
                        </div>

                        {/* Source Code Editor */}
                        <div className="flex-1 flex flex-col rounded-[2.5rem] overflow-hidden border border-white/5 bg-black/40 min-h-0">
                            <div className="bg-white/5 px-6 py-4 flex items-center justify-between border-b border-white/5 shrink-0">
                                <div className="flex items-center gap-3">
                                    <Code className="w-4 h-4 text-[var(--pri)]" />
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--muted)]">Email Content (HTML)</span>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="h-2 w-2 rounded-full bg-[var(--success)] animate-pulse" />
                                    <span className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest">Editor Ready</span>
                                </div>
                            </div>
                            <textarea
                                ref={textAreaRef}
                                value={editData.body_html}
                                onChange={(e) => setEditData({ ...editData, body_html: e.target.value })}
                                className="flex-1 w-full bg-transparent p-5 text-xs md:text-sm font-mono text-zinc-200 leading-normal focus:outline-none resize-none custom-scrollbar min-h-0"
                                placeholder="<!-- Write your email here... -->"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* ===== Full-Screen Preview Portal ===== */}
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

function EditorField({ label, icon, children }: { label: string; icon: any; children: React.ReactNode }) {
    return (
        <div className="py-2.5 px-4 rounded-xl bg-white/5 border border-white/5 focus-within:border-[var(--pri)]/50 transition-all group">
            <div className="flex items-center gap-2 mb-1">
                <span className="opacity-60 group-focus-within:opacity-100 transition-opacity w-3.5 h-3.5 flex items-center justify-center">{icon}</span>
                <label className="text-[9px] font-black uppercase tracking-[0.3em] text-[var(--muted)]">{label}</label>
            </div>
            <div className="pl-5.5">
                {children}
            </div>
        </div>
    )
}
