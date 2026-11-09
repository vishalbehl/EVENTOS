'use client'

import { motion } from 'framer-motion'
import { useRef, useState } from 'react'
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
import { CapabilityAction, useOperationAccess } from '@/lib/capabilities'
import { useAuthStore } from '@/store/use-auth-store'
import { useRetryAfter } from '@/hooks/useRetryAfter'
import type { ApiError } from '@/lib/api-client'

interface Props {
    campaigns: Campaign[]
    eventId: string
    onSelect?: (campaign: Campaign) => void
    onDeleted?: () => void
    loading?: boolean
    errorText?: string | null
}

export default function CampaignList({ campaigns, eventId, onSelect, onDeleted, loading, errorText }: Props) {
    const campaignReadAccess = useOperationAccess('communications.campaign.read')
    const manageAccess = useOperationAccess('communications.campaign.manage')
    const sendAccess = useOperationAccess('communications.bulk_email.send')
    const inFlight = useRef(false)
    const [pending, setPending] = useState(false)
    const [command, setCommand] = useState<{ operation: 'send' | 'resend' | 'archive'; campaign: Campaign; key: string } | null>(null)
    const [reason, setReason] = useState('')
    const [failure, setFailure] = useState<ApiError | null>(null)
    const retrySeconds = useRetryAfter(failure)
    const mutate = async (operation: 'send' | 'resend' | 'archive', id: string) => {
        if (inFlight.current || loading || !!errorText || !manageAccess.enabled
            || retrySeconds > 0 || !command || command.campaign.id !== id
            || command.operation !== operation || reason.trim().length < 10
            || (operation !== 'archive' && !sendAccess.enabled)) return
        const identity = useAuthStore.getState().user
        inFlight.current = true
        setPending(true)
        setFailure(null)
        const options = { version: command.campaign.version, reason: reason.trim(), idempotencyKey: command.key }
        try {
            if (operation === 'send') await sendCampaign(eventId, id, options)
            else if (operation === 'resend') await resendFailed(eventId, id, options)
            else await deleteCampaign(eventId, id, options)
            const current = useAuthStore.getState().user
            if (current?.id !== identity?.id || current?.organization_id !== identity?.organization_id) return
            toast.success(operation === 'archive' ? 'Campaign archived; history is retained.' : 'Transmission request accepted.')
            setCommand(null)
            setReason('')
            onDeleted?.()
        } catch (error) {
            const current = useAuthStore.getState().user
            if (current?.id !== identity?.id || current?.organization_id !== identity?.organization_id) return
            setFailure(error as ApiError)
        } finally {
            inFlight.current = false
            setPending(false)
        }
    }
    const selectCommand = (operation: 'send' | 'resend' | 'archive', id: string) => {
        if (pending || command) return
        const campaign = campaigns.find(item => item.id === id)
        if (!campaign || !Number.isSafeInteger(campaign.version) || campaign.version < 1) {
            toast.error('Reload the campaign to obtain its current version.'); return
        }
        setReason('')
        setFailure(null)
        setCommand({ operation, campaign, key: crypto.randomUUID() })
    }
    const handleSend = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation()
        selectCommand('send', id)
    }

    const handleResend = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation()
        selectCommand('resend', id)
    }

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation()
        selectCommand('archive', id)
    }

    return (
        <div className="space-y-4 flex-1 min-h-0 flex flex-col">
            <h3 className="text-sm font-black uppercase tracking-[0.3em] text-[var(--muted)] px-2 shrink-0">
                Active Campaign Registry
            </h3>
            {command && <form className="glass-card rounded-2xl p-5 space-y-3" onSubmit={(event) => {
                event.preventDefault(); void mutate(command.operation, command.campaign.id)
            }}>
                <p>{command.operation === 'archive' ? 'Archive' : command.operation === 'send' ? 'Send' : 'Retry failed deliveries for'} {command.campaign.name}?</p>
                <p className="text-sm text-[var(--muted)]">Version {command.campaign.version}. Archiving retains history. Sending may deliver external emails.</p>
                <label className="block">Audit reason
                    <textarea required minLength={10} maxLength={500} value={reason} disabled={pending || !!failure}
                        onChange={event => setReason(event.target.value)} className="block w-full bg-white/5 p-3 rounded-xl" />
                </label>
                {failure && <div role="alert">
                    <p>{failure.code === 'STEP_UP_REQUIRED' ? 'Recent MFA is required. Re-authenticate, then explicitly retry.'
                        : failure.status === 412 || failure.status === 409 ? 'The state or request conflicts. Refresh and review before starting a new command.'
                        : failure.status === 429 ? 'This request was throttled.'
                        : failure.status === 503 ? 'The service is unavailable; the outcome is not confirmed.'
                        : 'The outcome could not be confirmed. Reusing this unchanged request checks its receipt.'}</p>
                    {failure.correlationId && <p>Reference: {failure.correlationId}</p>}
                    {retrySeconds > 0 && <p>Try again in {retrySeconds}s.</p>}
                </div>}
                <div className="flex gap-3">
                    <button type="submit" disabled={pending || retrySeconds > 0 || reason.trim().length < 10
                        || [409, 412].includes(failure?.status ?? 0)}>{pending ? 'Submitting…' : failure ? 'Retry unchanged request' : 'Confirm'}</button>
                    <button type="button" disabled={pending} onClick={() => { setCommand(null); setFailure(null) }}>Close</button>
                </div>
            </form>}

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
                            {!campaignReadAccess.enabled ? (
                                <tr>
                                    <td colSpan={6} className="p-12 text-center text-[var(--muted)] uppercase text-[10px] font-black tracking-widest opacity-50">
                                        Campaign access is unavailable for this event.
                                    </td>
                                </tr>
                            ) : errorText ? (
                                <tr><td colSpan={6} className="p-12 text-center" role="alert">{errorText}</td></tr>
                            ) : loading ? (
                                <tr><td colSpan={6} className="p-12 text-center" role="status">Loading campaigns…</td></tr>
                            ) : campaigns.length === 0 ? (
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
                                                  <CapabilityAction
                                                    operation="communications.bulk_email.send"
                                                    limitKey="max_emails_per_event"
                                                    quantity={Math.max(campaign.total_recipients, 1)}
                                                  >
                                                    <button
                                                        disabled={pending || !manageAccess.enabled || !sendAccess.enabled}
                                                        onClick={(e) => handleSend(e, campaign.id)}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--pri)] text-[var(--primary-contrast)] hover:scale-105 active:scale-95 transition-all text-[9px] font-black uppercase tracking-widest rounded-lg shadow-md shadow-[var(--pri)]/20"
                                                    >
                                                        <Play className="w-3 h-3" />
                                                        Send
                                                    </button>
                                                  </CapabilityAction>
                                                )}
                                                {campaign.status === 'sent' && campaign.sent_count < campaign.total_recipients && (
                                                  <CapabilityAction
                                                    operation="communications.bulk_email.send"
                                                    limitKey="max_emails_per_event"
                                                    quantity={Math.max(campaign.total_recipients - campaign.sent_count, 1)}
                                                  >
                                                    <button
                                                        disabled={pending || !manageAccess.enabled || !sendAccess.enabled}
                                                        onClick={(e) => handleResend(e, campaign.id)}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 text-[var(--text)] border border-white/10 hover:bg-white/10 transition-all text-[9px] font-black uppercase tracking-widest rounded-lg"
                                                    >
                                                        <RefreshCcw className="w-3 h-3 animate-spin-slow" />
                                                        Retry
                                                    </button>
                                                  </CapabilityAction>
                                                )}
                                                <button 
                                                    disabled={pending || !manageAccess.enabled}
                                                    aria-label={`Archive campaign ${campaign.name}`}
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
