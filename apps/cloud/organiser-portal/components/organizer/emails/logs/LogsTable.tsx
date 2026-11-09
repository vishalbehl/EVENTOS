'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { 
    Search, 
    Filter, 
    Download, 
    CheckCircle2, 
    XCircle, 
    Clock, 
    Eye,
    Mail,
    ChevronLeft,
    ChevronRight
} from 'lucide-react'
import { useDeliveryLogPage } from '@/hooks/useCommunicationPages'
import { usePermissions } from '@/hooks/usePermissions'
import { useAuthStore } from '@/store/use-auth-store'
import type { ApiError } from '@/lib/api-client'
import { safeCsv } from '@/lib/safe-csv'
import { formatDateTimeInTZ } from '@/lib/utils'

interface Props {
    eventId: string
    targetType?: 'speaker' | 'participant'
    campaignId?: string
}

export default function LogsTable({ eventId, targetType = 'speaker', campaignId }: Props) {
    const { user } = useAuthStore()
    const access = usePermissions(eventId)
    // Reset all local filters/cursors when the identity, tenant or policy changes.
    return <ScopedLogsTable key={JSON.stringify([user?.id, user?.organization_id,
        eventId, targetType, campaignId, access.policyRevision])} eventId={eventId} targetType={targetType} campaignId={campaignId} />
}

function ScopedLogsTable({ eventId, targetType = 'speaker', campaignId }: Props) {
    const access = usePermissions(eventId)
    const [cursors, setCursors] = useState<(string | undefined)[]>([undefined])
    const [statusFilter, setStatusFilter] = useState('')
    const [search, setSearch] = useState('')
    const logs = useDeliveryLogPage(eventId, {
        target: targetType, campaignId, cursor: cursors[cursors.length - 1], status: statusFilter || undefined,
    })
    const problem = (logs.accessError || logs.error) as ApiError | null
    const [retrySeconds, setRetrySeconds] = useState(0)
    useEffect(() => {
        const delay = Math.min(86400, Math.max(0, problem?.retryAfter ?? 0))
        const deadline = Date.now() + delay * 1000
        const update = () => setRetrySeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)))
        update()
        if (!delay) return
        const timer = window.setInterval(update, 1000)
        return () => window.clearInterval(timer)
    }, [problem])
    const loading = logs.accessLoading || logs.isFetching
        || (!problem && !logs.accessDenied && !logs.data)
    const exportAllowed = !access.isFetching && !access.error
        && access.permissions.includes('ANALYTICS:EXPORT')
    const errorText = logs.accessDenied ? 'You do not have permission to view these logs.'
        : problem?.status === 401 ? 'Your session expired. Please sign in again.'
        : problem?.status === 403 ? 'Your access to these logs is no longer available.'
        : problem?.status === 404 ? 'These logs are not available in this context.'
        : problem?.status === 429 ? 'Too many requests. Wait before trying again.'
        : problem?.status === 503 ? 'The service is temporarily unavailable.'
        : problem?.status === 409 || problem?.status === 412 ? 'The context changed. Reload the first page.'
        : problem ? 'Logs could not be loaded. Please try again.' : null

    // Client-side search filter for current page
    const filteredLogs = (logs.data?.items ?? []).filter((log) => {
        const matchesSearch =
            log.to_email.toLowerCase().includes(search.toLowerCase()) ||
            log.subject.toLowerCase().includes(search.toLowerCase())
        return matchesSearch
    })

    const exportCSV = () => {
        if (!exportAllowed || !logs.data || loading || errorText) return
        const headers = ['Email', 'Subject', 'Status', 'Opened At', 'Sent At']
        const rows = filteredLogs.map((log) => [
            log.to_email,
            log.subject,
            log.status,
            log.opened_at || '',
            log.sent_at,
        ])
        const url = URL.createObjectURL(new Blob([safeCsv([headers, ...rows])], { type: 'text/csv;charset=utf-8' }))
        const link = document.createElement('a')
        link.href = url
        link.download = 'email_logs_visible_page.csv'
        document.body.appendChild(link)
        link.click()
        link.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    }

    return (
        <div className="flex-1 min-h-0 flex flex-col gap-4">
            {/* ===== Control Bar ===== */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between shrink-0">
                <div className="flex flex-1 gap-4 w-full">
                    <div className="relative flex-1 group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)] group-focus-within:text-[var(--pri)] transition-colors" />
                        <input
                            placeholder="Filter this page by email or subject..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full bg-white/5 border border-white/5 rounded-2xl py-3 pl-12 pr-4 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--pri)]/50 focus:bg-white/10 transition-all"
                        />
                    </div>

                    <div className="relative group">
                        <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
                        <select
                            value={statusFilter}
                            onChange={(e) => { setStatusFilter(e.target.value); setCursors([undefined]) }}
                            className="bg-white/5 border border-white/5 rounded-2xl py-3 pl-12 pr-10 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--pri)]/50 appearance-none cursor-pointer"
                        >
                            <option value="">All Status</option>
                            <option value="sent">Sent</option>
                            <option value="delivered">Delivered</option>
                            <option value="failed">Failed</option>
                            <option value="bounced">Bounced</option>
                            <option value="sending">Sending</option>
                            <option value="delivery_unknown">Outcome unconfirmed</option>
                        </select>
                    </div>
                </div>

                <button
                    onClick={exportCSV}
                    disabled={!exportAllowed || loading || !!errorText || !filteredLogs.length}
                    title={exportAllowed ? 'Only the visible, filtered page is exported.' : 'Export permission is required.'}
                    className="flex items-center gap-2 px-6 py-3 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-[var(--text)] hover:bg-white/10 transition-all active:scale-95"
                >
                    <Download className="w-4 h-4" />
                    Export visible page
                </button>
            </div>

            {/* ===== Registry Table ===== */}
            <div className="glass-card rounded-[2rem] border border-white/5 flex flex-col flex-1 min-h-0 overflow-hidden">
                <div className="overflow-auto flex-1 min-h-0 custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-white/5 border-b border-white/5">
                            <tr>
                                <th className="p-5 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--muted)]">Recipient Identity</th>
                                <th className="p-5 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--muted)]">Messaging Context</th>
                                <th className="p-5 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--muted)]">Transmission</th>
                                <th className="p-5 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--muted)]">Analytics</th>
                                <th className="p-5 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--muted)]">Sent Timestamp</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {errorText ? (
                                <tr><td colSpan={5} className="p-12 text-center" role="alert">
                                    <p>{errorText}</p>
                                    {retrySeconds > 0 && <p>Try again in {retrySeconds}s.</p>}
                                    {problem?.correlationId && <p>Reference: {problem.correlationId}</p>}
                                    {!logs.accessDenied && problem?.status !== 401 && problem?.status !== 403
                                        && problem?.status !== 404 && <button disabled={retrySeconds > 0 || logs.isFetching}
                                        onClick={() => {
                                            if (logs.accessError) { void logs.refreshAccess(); return }
                                            if (cursors.length > 1 && (problem?.status === 409 || problem?.status === 412)) {
                                                setCursors([undefined]); return
                                            }
                                            void logs.refetch()
                                        }}
                                        className="mt-3 px-4 py-2">Retry</button>}
                                </td></tr>
                            ) : loading ? (
                                <tr>
                                    <td colSpan={5} className="p-12 text-center text-[var(--muted)] animate-pulse uppercase text-[10px] font-black tracking-widest">
                                        Synchronizing Registry...
                                    </td>
                                </tr>
                            ) : filteredLogs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-12 text-center text-[var(--muted)] uppercase text-[10px] font-black tracking-widest opacity-50">
                                        No entries found in registry
                                    </td>
                                </tr>
                            ) : (
                                filteredLogs.map((log, idx) => (
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
                                            <p className="text-sm text-[var(--text)] font-medium max-w-[200px] truncate">
                                                {log.subject}
                                            </p>
                                        </td>
                                        <td className="p-5">
                                            <span className={`
                                                flex items-center gap-2 w-fit px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest
                                                ${log.status === 'delivered' || log.status === 'sent' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}
                                            `}>
                                                {log.status === 'delivered' || log.status === 'sent' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                                                {log.status}
                                            </span>
                                        </td>
                                        <td className="p-5">
                                            <div className="flex items-center gap-2">
                                                <Eye className={`w-4 h-4 ${log.opened_at ? 'text-[var(--acc)]' : 'text-white/10'}`} />
                                                <span className={`text-[10px] font-black uppercase tracking-widest ${log.opened_at ? 'text-[var(--text)]' : 'text-[var(--muted)]'}`}>
                                                    {log.opened_at ? 'Opened' : 'Unread'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="p-5">
                                            <div className="flex items-center gap-2 text-[var(--muted)] font-mono text-[11px]">
                                                <Clock className="w-3 h-3" />
                                                {formatDateTimeInTZ(log.sent_at, 'Asia/Kolkata')}
                                            </div>
                                        </td>
                                    </motion.tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                <div className="flex items-center justify-between gap-3 p-4">
                    <span className="text-sm text-[var(--muted)]">{filteredLogs.length} visible records · up to 50 per page</span>
                    <div className="flex items-center gap-3">
                        <button disabled={loading || !!errorText || cursors.length <= 1}
                            onClick={() => setCursors(previous => previous.slice(0, -1))}
                            aria-label="Previous log page"><ChevronLeft className="w-4 h-4" /></button>
                        <button disabled={loading || cursors.length <= 1}
                            onClick={() => setCursors([undefined])}>First page</button>
                        <button disabled={loading || !!errorText || !logs.data?.has_next || !logs.data?.next_cursor}
                            onClick={() => { const next = logs.data?.next_cursor; if (next) setCursors(previous => [...previous.slice(-99), next]) }}
                            aria-label="Next log page"><ChevronRight className="w-4 h-4" /></button>
                    </div>
                </div>
                {cursors.length >= 100 && <p className="p-4 text-sm">The most recent 100 page cursors are retained. Use First page to restart.</p>}
            </div>
        </div>
    )
}
