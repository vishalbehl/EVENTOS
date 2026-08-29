'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useUIStore } from '@/store/useUIStore'
import { 
    Plus, 
    X, 
    Send, 
    Users, 
    Mail, 
    Calendar,
    Zap,
    Layout,
    ShieldCheck
} from 'lucide-react'
import { 
    createCampaign, 
    getTemplates, 
    Template 
} from '@/services/email-service'
import { toast } from 'sonner'

interface Props {
    eventId: string
    onCreated: () => void
}

export default function CampaignBuilder({ eventId, onCreated }: Props) {
    const [isOpen, setIsOpen] = useState(false)
    const [templates, setTemplates] = useState<Template[]>([])
    const [mounted, setMounted] = useState(false)
    
    const isSidebarCollapsed = useUIStore((state) => state.isSidebarCollapsed)

    const [formData, setFormData] = useState({
        name: '',
        template_id: '',
        recipient_filter: 'all',
        scheduled_at: '',
    })

    useEffect(() => {
        setMounted(true)
    }, [])

    useEffect(() => {
        if (isOpen) {
            loadData()
        }
    }, [isOpen])

    const loadData = async () => {
        try {
            const t = await getTemplates(eventId)
            setTemplates(t)
        } catch (err) {
            toast.error('Failed to load templates.')
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            await createCampaign(eventId, {
                ...formData,
                scheduled_at: formData.scheduled_at || undefined,
            })
            toast.success('Campaign created successfully.')
            setIsOpen(false)
            onCreated()
        } catch (err) {
            toast.error('Failed to create campaign.')
        }
    }

    const modalContent = (
        <AnimatePresence>
            {isOpen && (
                <div 
                    style={{ 
                        zIndex: 9999,
                        left: isSidebarCollapsed ? '80px' : '288px',
                        top: '100px',
                        bottom: 0,
                        right: 0
                    }}
                    className="fixed flex items-center justify-center p-6 md:p-12 overflow-y-auto custom-scrollbar bg-black/40 backdrop-blur-sm transition-all duration-300"
                >
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="relative w-full max-w-2xl my-auto"
                    >
                        <div className="glass-card rounded-[2.5rem] shadow-[0_40px_80px_rgba(0,0,0,0.5)] border border-white/10 overflow-hidden bg-[var(--card)]/95 backdrop-blur-3xl">
                            {/* Compact Header */}
                            <div className="p-8 pb-4 flex justify-between items-center border-b border-white/5">
                                <div className="flex items-center gap-4">
                                    <div className="h-12 w-12 rounded-xl bg-[var(--pri)]/10 flex items-center justify-center border border-[var(--pri)]/20">
                                        <Zap className="w-6 h-6 text-[var(--pri)]" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-black tracking-tighter text-[var(--text)] uppercase leading-none">
                                            New <span className="text-[var(--pri)]">Campaign</span>
                                        </h2>
                                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--muted)] mt-1">
                                            Campaign Settings
                                        </p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => setIsOpen(false)}
                                    className="h-10 w-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 hover:rotate-90 transition-all duration-300 text-[var(--text)] group"
                                >
                                    <X className="w-5 h-5 group-hover:scale-110" />
                                </button>
                            </div>

                            {/* Refined Form Body */}
                            <div className="p-8 space-y-6">
                                <form id="campaign-form" onSubmit={handleSubmit} className="space-y-5">
                                    <FieldWrapper label="Campaign Name" icon={<Send className="w-4 h-4" />}>
                                        <input
                                            required
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            placeholder="e.g., Abstract Deadline Reminder"
                                            className="w-full bg-transparent border-0 text-lg font-bold text-[var(--text)] focus:ring-0 p-0"
                                        />
                                    </FieldWrapper>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                        <FieldWrapper label="Email Template" icon={<Mail className="w-4 h-4" />}>
                                            <select
                                                required
                                                value={formData.template_id}
                                                onChange={(e) => setFormData({ ...formData, template_id: e.target.value })}
                                                className="w-full bg-transparent border-0 font-bold text-[var(--text)] focus:ring-0 p-0 appearance-none cursor-pointer"
                                            >
                                                <option value="" disabled className="bg-[var(--card)]">Select template</option>
                                                {templates.map(t => (
                                                    <option key={t.id} value={t.id} className="bg-[var(--card)]">{t.name}</option>
                                                ))}
                                            </select>
                                        </FieldWrapper>

                                        <FieldWrapper label="Send To" icon={<Users className="w-4 h-4" />}>
                                            <select
                                                value={formData.recipient_filter}
                                                onChange={(e) => setFormData({ ...formData, recipient_filter: e.target.value })}
                                                className="w-full bg-transparent border-0 font-bold text-[var(--text)] focus:ring-0 p-0 appearance-none cursor-pointer"
                                            >
                                                <option value="all" className="bg-[var(--card)]">All Attendees</option>
                                                <option value="pending" className="bg-[var(--card)]">Pending Uploads</option>
                                                <option value="uploaded" className="bg-[var(--card)]">Success Uploads</option>
                                                <option value="approved" className="bg-[var(--card)]">Approved Speakers</option>
                                                <option value="rejected" className="bg-[var(--card)]">Rejected Speakers</option>
                                                <option value="posters" className="bg-[var(--card)]">Poster Speakers</option>
                                            </select>
                                        </FieldWrapper>
                                    </div>

                                    <FieldWrapper label="Schedule (UTC)" icon={<Calendar className="w-4 h-4" />}>
                                        <input
                                            type="datetime-local"
                                            value={formData.scheduled_at}
                                            onChange={(e) => setFormData({ ...formData, scheduled_at: e.target.value })}
                                            className="w-full bg-transparent border-0 font-bold text-[var(--text)] focus:ring-0 p-0 cursor-pointer"
                                        />
                                    </FieldWrapper>
                                </form>
                            </div>

                            {/* Compact Footer */}
                            <div className="p-8 pt-0 flex items-center justify-between gap-6">
                                <div className="flex items-center gap-2 opacity-40">
                                    <ShieldCheck className="w-4 h-4 text-[var(--pri)]" />
                                    <p className="text-[8px] font-black uppercase tracking-widest text-[var(--muted)]">SECURE SYSTEM</p>
                                </div>
                                <button
                                    type="submit"
                                    form="campaign-form"
                                    className="px-10 h-14 bg-[var(--pri)] hover:bg-[var(--sec)] text-white font-black uppercase tracking-[0.3em] text-[11px] rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-3 group"
                                >
                                    Create
                                    <Zap className="w-4 h-4 group-hover:animate-bounce" />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    )

    return (
        <div>
            <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setIsOpen(true)}
                className="w-full py-4 bg-[var(--pri)] text-[var(--primary-contrast)] rounded-[1.5rem] font-black uppercase tracking-[0.3em] text-[12px] flex items-center justify-center gap-3 shadow-[0_15px_30px_color-mix(in_srgb,var(--pri)_30%,transparent)] border-0 transition-all group"
            >
                <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-500" />
                Create New Campaign
            </motion.button>

            {mounted && createPortal(modalContent, document.body)}
        </div>
    )
}

function FieldWrapper({ label, icon, children }: { label: string; icon: any; children: React.ReactNode }) {
    return (
        <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/5 focus-within:border-[var(--pri)]/40 focus-within:bg-white/[0.06] transition-all group">
            <div className="flex items-center gap-3 mb-1.5">
                <span className="text-[var(--pri)] opacity-60 group-focus-within:opacity-100 transition-opacity">{icon}</span>
                <label className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--muted)]">{label}</label>
            </div>
            <div className="pl-7">
                {children}
            </div>
        </div>
    )
}