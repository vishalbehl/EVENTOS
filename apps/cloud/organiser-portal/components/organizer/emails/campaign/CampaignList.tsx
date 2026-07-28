'use client'

import { motion } from 'framer-motion'
import { 
    Send, 
    RefreshCcw, 
    Trash2, 
    Play, 
    CheckCircle, 
    Clock, 
    Loader2
} from 'lucide-react'
import { sendCampaign, resendFailed, deleteCampaign, Campaign } from '@/services/email-service'
import { toast } from 'sonner'
import { CapabilityAction } from '@/lib/capabilities'

interface Props {
    campaigns: Campaign[]
    eventId: string
    onSelect?: (campaign: Campaign) => void
    onDeleted?: () => void
}

export default function CampaignList({ campaigns, eventId, onSelect, onDeleted }: Props) {
    const handleSend = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation()
        try {
            await sendCampaign(eventId, id)
            toast.success('Campaign transmission initialized.')
            onDeleted?.() // Reload list
        } catch (err) {
            toast.error('Transmission failure.')
        }
    }

    const handleResend = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation()
        try {
            await resendFailed(eventId, id)
            toast.success('Retry sequence dispatched.')
            onDeleted?.() // Reload list
        } catch (err) {
            toast.error('Retry failure.')
        }
    }

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation()
        if (!confirm('Are you sure you want to delete this campaign? All associated logs will also be permanently deleted.')) {
            return
        }
        try {
            await deleteCampaign(eventId, id)
            toast.success('Campaign deleted successfully.')
            onDeleted?.()
        } catch (err) {
            toast.error('Failed to delete campaign.')
        }
    }

    return (
        <div className="space-y-4 flex-1 min-h-0 flex flex-col">
            <h3 className="text-sm font-black uppercase tracking-[0.3em] text-[var(--muted)] px-2 shrink-0">
                Active Campaign Registry
            </h3>

            <div className="glass-card rounded-[2rem] border border-white/5 flex flex-col flex-1 min-h-0 overflow-hidden">
                <div className="overflow-auto flex-1 min-h-0 custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-white/5 border-b border-white/5">
                            <tr>
                                <th className="p-5 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--muted)]">Campaign Details</th>
                                <th className="p-5 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--muted)]">Status</th>
                                <th className="p-5 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--muted)]">Recipients</th>
                                <th className="p-5 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--muted)]">Delivered</th>
                                <th className="p-5 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--muted)]">Created At</th>
                                <th className="p-5 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--muted)] text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {campaigns.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-12 text-center text-[var(--muted)] uppercase text-[10px] font-black tracking-widest opacity-50">
                                        No campaigns found in current sector
                                    </td>
                                </tr>
                            ) : (
                                campaigns.map((campaign, idx) => (
                                    <motion.tr
                                        key={campaign.id}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: idx * 0.02 }}
                                        onClick={() => onSelect?.(campaign)}
                                        className="hover:bg-white/[0.02] transition-colors group cursor-pointer"
                                    >
                                        {/* Campaign Info */}
                                        <td className="p-5">
                                            <div className="flex items-center gap-3">
                                                <div className="h-8 w-8 rounded-lg bg-white/5 flex items-center justify-center text-[var(--pri)] group-hover:scale-105 transition-transform">
                                                    {getStatusIcon(campaign.status)}
                                                </div>
                                                <div>
                                                    <span className="font-bold text-[var(--text)] text-sm">{campaign.name}</span>
                                                    <p className="text-[9px] uppercase tracking-wider text-[var(--muted)] font-mono">
                                                        ID: {campaign.id.slice(0, 8)}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Status Badge */}
                                        <td className="p-5">
                                            <span className={`
                                                px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest
                                                ${getStatusBadgeStyle(campaign.status)}
                                            `}>
                                                {campaign.status}
                                            </span>
                                        </td>

                                        {/* Total Recipients */}
                                        <td className="p-5">
                                            <span className="text-sm font-bold text-[var(--text)]">
                                                {campaign.total_recipients}
                                            </span>
                                        </td>

                                        {/* Delivered */}
                                        <td className="p-5">
                                            <span className="text-sm font-bold text-[var(--pri)]">
                                                {campaign.sent_count}
                                            </span>
                                        </td>

                                        {/* Created Date */}
                                        <td className="p-5">
                                            <span className="text-xs text-[var(--muted)] font-medium">
                                                {new Date(campaign.created_at).toLocaleDateString('en-IN', {
                                                    day: 'numeric',
                                                    month: 'short',
                                                    year: 'numeric',
                                                    timeZone: 'Asia/Kolkata'
                                                })}
                                            </span>
                                        </td>

                                        {/* Actions */}
                                        <td className="p-5 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {campaign.status === 'draft' && (
                                                  <CapabilityAction operation="communications.bulk_email.send">
                                                    <button
                                                        onClick={(e) => handleSend(e, campaign.id)}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--pri)] text-white hover:scale-105 active:scale-95 transition-all text-[9px] font-black uppercase tracking-widest rounded-lg shadow-md shadow-[var(--pri)]/20"
                                                    >
                                                        <Play className="w-3 h-3" />
                                                        Send
                                                    </button>
                                                  </CapabilityAction>
                                                )}
                                                {campaign.status === 'sent' && campaign.sent_count < campaign.total_recipients && (
                                                  <CapabilityAction operation="communications.bulk_email.send">
                                                    <button
                                                        onClick={(e) => handleResend(e, campaign.id)}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 text-[var(--text)] border border-white/10 hover:bg-white/10 transition-all text-[9px] font-black uppercase tracking-widest rounded-lg"
                                                    >
                                                        <RefreshCcw className="w-3 h-3 animate-spin-slow" />
                                                        Retry
                                                    </button>
                                                  </CapabilityAction>
                                                )}
                                                <button 
                                                    onClick={(e) => handleDelete(e, campaign.id)}
                                                    className="p-2 rounded-lg text-red-400/50 hover:text-red-400 hover:bg-red-400/10 transition-all"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
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

function getStatusBadgeStyle(status: string) {
    switch (status) {
        case 'sent':
            return 'bg-green-500/10 text-green-500 border border-green-500/20'
        case 'sending':
            return 'bg-blue-500/10 text-blue-500 border border-blue-500/20 animate-pulse'
        case 'scheduled':
            return 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
        default:
            return 'bg-white/10 text-[var(--muted)] border border-white/10'
    }
}

function getStatusIcon(status: string) {
    switch (status) {
        case 'sent':
            return <CheckCircle className="w-4 h-4" />
        case 'sending':
            return <Loader2 className="w-4 h-4 animate-spin" />
        case 'scheduled':
            return <Clock className="w-4 h-4" />
        default:
            return <Send className="w-4 h-4" />
    }
}
