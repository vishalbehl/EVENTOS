'use client'

import { useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, CheckCircle, Eye, RefreshCcw, Send, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { type Campaign, resendFailed } from '@/services/email-service'
import { useCampaignSummary } from '@/hooks/useCommunicationPages'
import { usePermissions } from '@/hooks/usePermissions'
import { useAuthStore } from '@/store/use-auth-store'
import { useOperationAccess } from '@/lib/capabilities'
import { formatDateInTZ, formatDateTimeInTZ } from '@/lib/utils'
import type { ApiError } from '@/lib/api-client'
import { useRetryAfter } from '@/hooks/useRetryAfter'
import LogsTable from '@/components/organizer/emails/logs/LogsTable'

interface Props { eventId: string; campaign: Campaign; onBack: () => void }

export default function CampaignDetail({ eventId, campaign, onBack }: Props) {
    const { user } = useAuthStore()
    const access = usePermissions(eventId)
    return <ScopedCampaignDetail key={JSON.stringify([user?.id, user?.organization_id,
        eventId, campaign.id, access.policyRevision])} eventId={eventId} campaign={campaign} onBack={onBack} />
}

function ScopedCampaignDetail({ eventId, campaign, onBack }: Props) {
    const summary = useCampaignSummary(eventId, campaign.id)
    const access = usePermissions(eventId)
    const sending = useOperationAccess('communications.bulk_email.send')
    const managing = useOperationAccess('communications.campaign.manage')
    const [pending, setPending] = useState(false)
    const [mutationMessage, setMutationMessage] = useState<string | null>(null)
    const [reason, setReason] = useState('')
    const [mutationFailure, setMutationFailure] = useState<ApiError | null>(null)
    const mutationRetrySeconds = useRetryAfter(mutationFailure)
    const receipt = useRef<{ version: number; reason: string; key: string } | null>(null)
    const inFlight = useRef(false)
    const data = summary.data
    const problem = (summary.accessError || summary.error) as ApiError | null
    const retrySeconds = useRetryAfter(problem)
    const unavailable = summary.accessDenied ? 'Campaign access is unavailable.'
        : problem?.status === 401 ? 'Your session expired. Sign in again.'
        : problem?.status === 403 ? 'Your campaign access has changed.'
        : problem?.status === 404 ? 'This campaign is not available in the selected context.'
        : problem?.status === 429 ? 'Too many requests. Try again after the waiting period.'
        : problem?.status === 503 ? 'The service is temporarily unavailable.'
        : problem ? 'The campaign summary could not be loaded.' : null
    const canRetry = !!data && data.failed_count > 0 && data.unknown_count === 0
        && data.sending_count === 0 && ['sent', 'failed'].includes(data.status)
        && !access.isFetching && !access.error && access.permissions.includes('CAMPAIGNS:SEND')
        && sending.enabled && managing.enabled && !pending && reason.trim().length >= 10
        && mutationRetrySeconds === 0 && ![409, 412].includes(mutationFailure?.status ?? 0)

    const handleRetry = async () => {
        if (!canRetry || !data || inFlight.current) return
        const identity = useAuthStore.getState().user
        inFlight.current = true
        setPending(true)
        setMutationMessage(null)
        setMutationFailure(null)
        if (!receipt.current || receipt.current.version !== data.version || receipt.current.reason !== reason.trim())
            receipt.current = { version: data.version, reason: reason.trim(), key: crypto.randomUUID() }
        try {
            await resendFailed(eventId, campaign.id, {
                version: receipt.current.version, reason: receipt.current.reason, idempotencyKey: receipt.current.key,
            })
            const current = useAuthStore.getState().user
            if (current?.id !== identity?.id || current?.organization_id !== identity?.organization_id) return
            toast.success('Retry accepted for queued delivery.')
            setReason('')
            receipt.current = null
            await summary.refetch()
        } catch (error) {
            const current = useAuthStore.getState().user
            if (current?.id !== identity?.id || current?.organization_id !== identity?.organization_id) return
            const failure = error as ApiError
            setMutationFailure(failure)
            setMutationMessage(failure.code === 'STEP_UP_REQUIRED'
                ? 'Recent MFA is required. Re-authenticate and explicitly retry the unchanged request.'
                : failure.status === 429
                ? 'Retry was throttled. Wait before submitting again; it will not be replayed automatically.'
                : failure.status === 503 ? 'The service is unavailable. The retry outcome is not confirmed.'
                : failure.status === 409 || failure.status === 412 ? 'Campaign state changed. Refresh and review before retrying.'
                : 'The retry could not be confirmed. Refresh the campaign before submitting again.')
        } finally {
            inFlight.current = false
            setPending(false)
        }
    }

    if (!data) return <div className="space-y-4">
        <button onClick={onBack} className="px-4 py-2">Back to campaigns</button>
        <p role={unavailable ? 'alert' : 'status'}>{unavailable || 'Loading campaign summary…'}</p>
        {retrySeconds > 0 && <p role="status">Try again in {retrySeconds}s.</p>}
        {problem?.correlationId && <p>Reference: {problem.correlationId}</p>}
        {unavailable && !summary.accessDenied && ![401, 403, 404].includes(problem?.status ?? 0)
            && <button disabled={retrySeconds > 0 || summary.isFetching}
                onClick={() => { if (summary.accessError) void summary.refreshAccess(); else void summary.refetch() }}>Retry summary</button>}
    </div>

    const successRate = data.total_logs ? Math.round(data.sent_count / data.total_logs * 100) : null
    const openRate = data.total_logs ? Math.round(data.opened_count / data.total_logs * 100) : null
    return <div className="space-y-6 flex-1 min-h-0 flex flex-col">
        <div className="flex flex-wrap items-center justify-between gap-4 shrink-0">
            <div className="flex items-center gap-4">
                <button onClick={onBack} aria-label="Back to campaigns" className="p-3 rounded-2xl bg-white/5">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                    <h2 className="text-3xl font-black tracking-tighter">Campaign Insight</h2>
                    <p className="text-sm text-[var(--muted)]">{data.name} · Created {formatDateInTZ(data.created_at, 'Asia/Kolkata')}</p>
                    <p className="text-xs text-[var(--muted)]">Snapshot: {formatDateTimeInTZ(data.observed_at, 'Asia/Kolkata')} · {data.status}</p>
                </div>
            </div>
            <div className="flex gap-3">
                <button onClick={() => void summary.refetch()} disabled={pending} className="px-4 py-2">Refresh summary</button>
                <button onClick={handleRetry} disabled={!canRetry} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 disabled:opacity-50">
                    <RefreshCcw className="w-4 h-4" />{pending ? 'Submitting…' : 'Retry failed transmissions'}
                </button>
            </div>
        </div>
        {mutationMessage && <p role="alert">{mutationMessage}</p>}
        {data.unknown_count > 0 && <p role="alert">{data.unknown_count} delivery outcome(s) are unconfirmed.
            Reconciliation is required before retrying; an automatic resend could duplicate delivery.</p>}
        {data.sending_count > 0 && <p role="status">{data.sending_count} provider attempt(s) are still recorded as in progress.</p>}
        {mutationRetrySeconds > 0 && <p role="status">Try again in {mutationRetrySeconds}s.</p>}
        {mutationFailure?.correlationId && <p>Reference: {mutationFailure.correlationId}</p>}
        <label className="block shrink-0">Audit reason for retry
            <textarea minLength={10} maxLength={500} value={reason} disabled={pending || !!mutationFailure}
                onChange={event => setReason(event.target.value)} className="block w-full bg-white/5 p-3 rounded-xl" />
        </label>
        {mutationFailure && <button disabled={pending} onClick={() => {
            setMutationFailure(null); setMutationMessage(null); receipt.current = null; void summary.refetch()
        }}>Refresh and review a new request</button>}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 shrink-0">
            <MiniStatCard label="Recorded success rate" value={successRate === null ? '—' : successRate + '%'} color="var(--success)" icon={<CheckCircle className="w-4 h-4" />} />
            <MiniStatCard label="Recorded open rate" value={openRate === null ? '—' : openRate + '%'} color="var(--pri)" icon={<Eye className="w-4 h-4" />} />
            <MiniStatCard label="Recorded transmissions" value={data.total_logs} color="var(--text)" icon={<Send className="w-4 h-4" />} />
            <MiniStatCard label="Recorded failures" value={data.failed_count} color="var(--dan)" icon={<XCircle className="w-4 h-4" />} />
        </div>
        <p className="text-xs text-[var(--muted)]">Campaign-wide counts of retained, in-scope recipient logs. These are not provider delivery guarantees.</p>
        <LogsTable eventId={eventId} campaignId={campaign.id} targetType={data.target_type === 'participant' ? 'participant' : 'speaker'} />
    </div>
}

function MiniStatCard({ label, value, color, icon }: { label: string; value: string | number; color: string; icon: ReactNode }) {
    return <div className="glass-card rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-5">{icon}</div>
        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-1">{label}</p>
        <h4 className="text-2xl font-black tracking-tighter" style={{ color }}>{value}</h4>
    </div>
}
