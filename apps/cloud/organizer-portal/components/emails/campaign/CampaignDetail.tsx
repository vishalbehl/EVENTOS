'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
    Campaign, 
    getEmailLogs, 
    resendFailed,
    EmailLog
} from '@/services/email-service'
import { 
    Send, 
    RefreshCcw, 
    CheckCircle, 
    XCircle, 
    Clock, 
    Eye,
    TrendingUp,
    ShieldCheck,
    Mail,
    ArrowLeft
} from 'lucide-react'
import { toast } from 'sonner'
import { formatDateInTZ, formatDateTimeInTZ, formatTimeInTZ } from '@/lib/utils'

// ===== Props =====
interface Props {
    eventId: string
    campaign: Campaign
    onBack: () => void
}

// ===== Component =====
export default function CampaignDetail({ eventId, campaign, onBack }: Props) {
    const [logs, setLogs] = useState<EmailLog[]>([])
    const [loading, setLoading] = useState(true)

    // ===== Load Logs =====
    useEffect(() => {
        if (eventId && eventId !== 'undefined' && eventId !== '[eventId]') {
            fetchLogs()
        }
    }, [campaign.id, eventId])

    const fetchLogs = async () => {
        setLoading(true)
        try {
            const res = await getEmailLogs(eventId, { 
                campaign_id: campaign.id,
                target_type: campaign.target_type,
                page_size: 1000 // Get a large batch for the detail view
            })
            setLogs(res.items)
        } catch (err) {
            console.error('Failed to load logs', err)
        } finally {
            setLoading(false)
        }
    }

    const handleRetry = async () => {
        const promise = resendFailed(eventId, campaign.id)
        toast.promise(promise, {
            loading: 'Re-initializing failed transmissions...',
            success: 'Retry sequence dispatched.',
            error: 'Failed to re-trigger campaign.'
        })
        
        try {
            await promise
            setTimeout(fetchLogs, 2000)
        } catch (err) {
            console.error('Retry failed', err)
        }
    }

    // ===== Stats =====
    const total = logs.length
    const sent = logs.filter((l) => l.status === 'sent' || l.status === 'delivered').length
    const failed = logs.filter((l) => l.status === 'failed' || l.status === 'bounced').length
    const opened = logs.filter((l) => l.opened_at).length

    const successRate = total ? Math.round((sent / total) * 100) : 0
    const openRate = total ? Math.round((opened / total) * 100) : 0

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 flex-1 min-h-0 flex flex-col">
            {/* ===== Header & Back Action ===== */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
                <div className="flex items-center gap-4">
                    <button 
                        onClick={onBack}
                        className="p-3 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all text-[var(--muted)] hover:text-[var(--text)]"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h2 className="text-3xl font-black tracking-tighter text-[var(--text)] uppercase">
                            Campaign <span className="text-[var(--pri)]">Insight</span>
                        </h2>
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--muted)] mt-1">
                            {campaign.name} • Created {formatDateInTZ(campaign.created_at, 'Asia/Kolkata')}
                        </p>
                    </div>
                </div>

                <button
                    onClick={handleRetry}
                    disabled={failed === 0}
                    className={`
                        flex items-center gap-2 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all
                        ${failed > 0 
                            ? 'bg-[var(--pri)] text-white shadow-lg shadow-[var(--pri)]/20 hover:scale-105 active:scale-95' 
                            : 'bg-white/5 text-[var(--muted)] border border-white/5 opacity-50 cursor-not-allowed'
                        }
                    `}
                >
                    <RefreshCcw className={`w-4 h-4 ${failed > 0 && 'animate-spin-slow'}`} />
                    Retry Failed Transmissions
                </button>
            </div>

            {/* ===== Metrics Grid ===== */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 shrink-0">
                <MiniStatCard label="Success Rate" value={`${successRate}%`} color="var(--success)" icon={<CheckCircle className="w-4 h-4" />} />
                <MiniStatCard label="Open Rate" value={`${openRate}%`} color="var(--pri)" icon={<Eye className="w-4 h-4" />} />
                <MiniStatCard label="Total Dispatched" value={total} color="var(--text)" icon={<Send className="w-4 h-4" />} />
                <MiniStatCard label="Errors Detected" value={failed} color="var(--dan)" icon={<XCircle className="w-4 h-4" />} />
            </div>

            {/* ===== Detailed Registry Table ===== */}
            <div className="glass-card rounded-[2.5rem] border border-white/5 flex flex-col flex-1 min-h-0 overflow-hidden">
                <div className="p-8 border-b border-white/5 bg-white/[0.02] flex items-center justify-between shrink-0">
                    <h3 className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)]">
                        Transmission Registry
                    </h3>
                    <div className="flex items-center gap-2 text-[var(--muted)]">
                        <TrendingUp className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Real-time Stats</span>
                    </div>
                </div>

                <div className="overflow-auto flex-1 min-h-0 custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-white/5">
                            <tr>
                                <th className="p-5 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--muted)]">Recipient Identity</th>
                                <th className="p-5 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--muted)]">Status</th>
                                <th className="p-5 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--muted)]">Last Activity</th>
                                <th className="p-5 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--muted)]">Diagnostics</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {loading ? (
                                <tr>
                                    <td colSpan={4} className="p-12 text-center text-[var(--muted)] animate-pulse uppercase text-[10px] font-black tracking-widest">
                                        Synchronizing Registry Data...
                                    </td>
                                </tr>
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="p-12 text-center text-[var(--muted)] uppercase text-[10px] font-black tracking-widest opacity-50">
                                        No transmission data found
                                    </td>
                                </tr>
                            ) : (
                                logs.map((log, idx) => (
                                    <motion.tr 
                                        key={log.id}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: idx * 0.01 }}
                                        className="hover:bg-white/[0.02] transition-colors group"
                                    >
                                        <td className="p-5">
                                            <div className="flex items-center gap-3">
                                                <div className="h-8 w-8 rounded-lg bg-white/5 flex items-center justify-center text-[var(--muted)] group-hover:text-[var(--pri)] transition-colors">
                                                    <Mail className="w-4 h-4" />
                                                </div>
                                                <span className="font-bold text-[var(--text)]">{log.to_email}</span>
                                            </div>
                                        </td>
                                        <td className="p-5">
                                            <StatusBadge status={log.status} />
                                        </td>
                                        <td className="p-5">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2 text-[var(--muted)] font-mono text-[11px]">
                                                    <Clock className="w-3 h-3" />
                                                    {formatDateTimeInTZ(log.sent_at, 'Asia/Kolkata')}
                                                </div>
                                                {log.opened_at && (
                                                    <div className="flex items-center gap-2 text-[var(--acc)] font-mono text-[11px]">
                                                        <Eye className="w-3 h-3" />
                                                        Opened: {formatTimeInTZ(log.opened_at, 'Asia/Kolkata')}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-5">
                                            <p className={`text-[10px] font-black uppercase tracking-tight max-w-[200px] ${log.error_message ? 'text-red-400' : 'text-[var(--muted)]'}`}>
                                                {log.error_message || 'No errors reported'}
                                            </p>
                                        </td>
                                    </motion.tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}

function MiniStatCard({ label, value, color, icon }: { label: string; value: any; color: string; icon: any }) {
    return (
        <div className="glass-card rounded-2xl p-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-125 transition-transform">
                {icon}
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-1">
                {label}
            </p>
            <h4 className="text-2xl font-black tracking-tighter" style={{ color }}>
                {value}
            </h4>
        </div>
    )
}

function StatusBadge({ status }: { status: string }) {
    const isSuccess = status === 'sent' || status === 'delivered'
    const isError = status === 'failed' || status === 'bounced'
    const isPending = status === 'queued'

    return (
        <span className={`
            px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest
            ${isSuccess ? 'bg-green-500/10 text-green-500 border border-green-500/20' : ''}
            ${isError ? 'bg-red-500/10 text-red-500 border border-red-500/20' : ''}
            ${isPending ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : ''}
        `}>
            {status}
        </span>
    )
}