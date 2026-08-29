'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Mail, Monitor, Smartphone, Layout } from 'lucide-react'

// ===== Props =====
interface Props {
    html: string
    subject: string
    onClose: () => void
}

// ===== Dummy Data for Preview =====
const DUMMY_DATA: Record<string, string> = {
    SpeakerName: 'Dr. Sarah Chen',
    SpeakerFirstName: 'Sarah',
    SpeakerEmail: 's.chen@mit.edu',
    EventName: 'Quantum Computing Summit 2026',
    SessionName: 'Advances in Qubit Stability',
    SessionDate: 'May 14, 2026',
    SessionTime: '09:00 AM',
    RoomName: 'Grand Ballroom C',
    UploadLink: 'https://eventos.io/upload/demo-token',
    Affiliation: 'MIT Center for Quantum Tech',
    Country: 'USA',
    Deadline: '20 May 2026',
    AccessCode: 'QCS-8472-CH',
    RejectionReason: 'Font size on slide 3 is too small and background image has compression artifacts.',
    RejectedReason: 'Font size on slide 3 is too small and background image has compression artifacts.',
    QRCodeURL: 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=SarahChen-MIT',
    QRCodeImg: '<img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=SarahChen-MIT" width="150" height="150" alt="Speaker QR Badge" style="display:block; border-radius:12px; border:1px solid #eee;" />',
    QR: '<img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=SarahChen-MIT" width="150" height="150" alt="Speaker QR Badge" style="display:block; border-radius:12px; border:1px solid #eee;" />',
    QRCode: '<img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=SarahChen-MIT" width="150" height="150" alt="Speaker QR Badge" style="display:block; border-radius:12px; border:1px solid #eee;" />',
    RejectedPresentationTable: `
        <div style="overflow-x: auto; margin: 24px 0; border: 1px solid #fee2e2; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
                <thead>
                    <tr style="background-color: #fef2f2; border-bottom: 1px solid #fee2e2;">
                        <th style="padding: 14px 16px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #991b1b;">Session</th>
                        <th style="padding: 14px 16px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #991b1b;">Rejected File</th>
                        <th style="padding: 14px 16px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #991b1b;">Reason for Rejection</th>
                    </tr>
                </thead>
                <tbody style="background-color: #ffffff;">
                    <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="padding: 12px 16px; font-size: 13px; font-weight: 600; color: #1e293b;">Advances in Qubit Stability</td>
                        <td style="padding: 12px 16px; font-size: 13px; color: #475569;">
                            <div style="font-family: monospace; font-size: 12px; color: #ef4444; font-weight: bold;">qubit_stability_v1.pptx</div>
                            <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">14.2 MB</div>
                        </td>
                        <td style="padding: 12px 16px; font-size: 13px; color: #b91c1c; background-color: #fef2f2; font-weight: 500; border-radius: 8px;">Font size on slide 3 is too small and background image has compression artifacts.</td>
                    </tr>
                </tbody>
            </table>
        </div>
    `,
}

// ===== Component =====
export default function TemplatePreview({
    html,
    subject,
    onClose,
}: Props) {
    const [rendered, setRendered] = useState('')
    const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop')
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
        return () => setMounted(false)
    }, [])

    useEffect(() => {
        let output = html
        Object.entries(DUMMY_DATA).forEach(([key, value]) => {
            const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g')
            output = output.replace(regex, value)
        })
        setRendered(output)
    }, [html])

    if (!mounted) return null

    return createPortal(
        <div className="fixed top-[100px] bottom-0 left-0 right-0 z-[9999] flex items-center justify-center border-t border-white/5 shadow-2xl">
            {/* ===== Modal Content ===== */}
            <motion.div 
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="relative w-full h-full flex flex-col bg-[var(--base)] overflow-hidden"
            >
                {/* ===== Header ===== */}
                <div className="p-6 md:px-8 md:py-5 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/[0.02]">
                    <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-2xl bg-[var(--pri)] flex items-center justify-center text-white shadow-lg shadow-[var(--pri)]/20">
                            <Mail className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black tracking-tighter uppercase text-[var(--text)]">
                                Email <span className="text-[var(--pri)]">Preview</span>
                            </h2>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--muted)] mt-1">
                                Subject: {subject}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 bg-white/5 p-1 rounded-xl border border-white/5">
                        <ViewToggle active={viewMode === 'desktop'} onClick={() => setViewMode('desktop')} icon={<Monitor className="w-4 h-4" />} label="Desktop" />
                        <ViewToggle active={viewMode === 'mobile'} onClick={() => setViewMode('mobile')} icon={<Smartphone className="w-4 h-4" />} label="Mobile" />
                        <div className="w-px h-4 bg-white/10 mx-2" />
                        <button 
                            onClick={onClose}
                            className="p-2 rounded-lg hover:bg-red-500/10 text-[var(--muted)] hover:text-red-400 transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* ===== Body / Preview Area ===== */}
                <div className="flex-1 overflow-hidden transition-colors duration-300 relative bg-[color-mix(in_srgb,var(--base)_95%,black)] p-4 md:p-6 lg:p-8 flex justify-center items-center">
                    {/* Background glows */}
                    <div className="absolute inset-0 pointer-events-none overflow-hidden">
                        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[var(--pri)] rounded-full blur-[120px] opacity-[0.03]" />
                    </div>

                    <div className="h-full flex justify-center items-center w-full min-h-0">
                        <motion.div 
                            animate={{ 
                                width: viewMode === 'desktop' ? '100%' : '375px',
                                maxWidth: viewMode === 'desktop' ? '850px' : '375px',
                            }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="bg-white rounded-3xl shadow-[0_32px_96px_rgba(0,0,0,0.6)] border border-white/5 flex flex-col overflow-hidden h-full w-full relative"
                        >
                            {/* Mock Email Client Header */}
                            <div className="px-6 py-4 bg-zinc-50 border-b border-zinc-200 shrink-0 text-left select-none">
                                <div className="flex items-center gap-1.5 mb-3">
                                    <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                                </div>
                                <div className="space-y-1 text-[11px] md:text-xs text-zinc-500 font-sans">
                                    <div>
                                        <span className="font-semibold text-zinc-400 w-16 inline-block">From:</span>
                                        <span className="text-zinc-700">EventOS Ecosystem &lt;noreply@eventos.io&gt;</span>
                                    </div>
                                    <div>
                                        <span className="font-semibold text-zinc-400 w-16 inline-block">To:</span>
                                        <span className="text-zinc-700">Dr. Sarah Chen &lt;s.chen@mit.edu&gt;</span>
                                    </div>
                                    <div className="truncate">
                                        <span className="font-semibold text-zinc-400 w-16 inline-block">Subject:</span>
                                        <span className="text-zinc-800 font-medium">{subject}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Iframe Viewport */}
                            <div className="flex-1 bg-white relative overflow-hidden min-h-0">
                                <iframe 
                                    srcDoc={rendered}
                                    title="Email Preview"
                                    className="w-full h-full border-0 bg-white"
                                />
                            </div>
                        </motion.div>
                    </div>
                </div>

                {/* ===== Footer / Info ===== */}
                <div className="px-8 py-4 bg-white/[0.02] border-t border-white/5 flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
                    <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1"><Layout className="w-3 h-3" /> Responsive Engine</span>
                        <span className="opacity-30">|</span>
                        <span>Sample Data: Default Speaker</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Live Render
                    </div>
                </div>
            </motion.div>
        </div>,
        document.body
    )
}

function ViewToggle({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
    return (
        <button
            onClick={onClick}
            className={`
                flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all
                ${active ? 'bg-[var(--pri)] text-[var(--primary-contrast)] shadow-lg' : 'text-[var(--muted)] hover:text-[var(--text)]'}
            `}
        >
            {icon}
            <span className="hidden md:inline">{label}</span>
        </button>
    )
}