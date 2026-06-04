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
import { getEmailLogs, EmailLog, PaginatedResponse } from '@/services/email-service'
import { formatDateTimeInTZ } from '@/lib/utils'

interface Props {
    eventId: string
    targetType?: 'speaker' | 'participant'
}

export default function LogsTable({ eventId, targetType = 'speaker' }: Props) {
    const [data, setData] = useState<PaginatedResponse<EmailLog>>({
        items: [],
        total: 0,
        page: 1,
        page_size: 50
    })
    const [loading, setLoading] = useState(true)
    const [statusFilter, setStatusFilter] = useState('')
    const [search, setSearch] = useState('')

    useEffect(() => {
        if (eventId && eventId !== 'undefined' && eventId !== '[eventId]') {
            fetchLogs(1)
        }
    }, [eventId, statusFilter, targetType])

    const fetchLogs = async (page: number) => {
        setLoading(true)
        try {
            const res = await getEmailLogs(eventId, {
                page,
                page_size: 50,
                status: statusFilter || undefined,
                target_type: targetType,
            } as any)
            setData(res)
        } catch (err) {
            console.error('Failed to load logs', err)
        } finally {
            setLoading(false)
        }
    }

    // Client-side search filter for current page
    const filteredLogs = data.items.filter((log) => {
        const matchesSearch =
            log.to_email.toLowerCase().includes(search.toLowerCase()) ||
            log.subject.toLowerCase().includes(search.toLowerCase())
        return matchesSearch
    })

    const exportCSV = () => {
        const headers = ['Email', 'Subject', 'Status', 'Opened At', 'Sent At']
        const rows = filteredLogs.map((log) => [
            log.to_email,
            log.subject,
            log.status,
            log.opened_at || '',
            log.sent_at,
        ])
        const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].map((e) => e.join(',')).join('\n')
        const link = document.createElement('a')
        link.href = encodeURI(csvContent)
        link.download = 'email_logs.csv'
        link.click()
    }

    return (
        <div className="flex-1 min-h-0 flex flex-col gap-4">
            {/* ===== Control Bar ===== */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between shrink-0">
                <div className="flex flex-1 gap-4 w-full">
                    <div className="relative flex-1 group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)] group-focus-within:text-[var(--pri)] transition-colors" />
                        <input
                            placeholder="Search by email or subject..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full bg-white/5 border border-white/5 rounded-2xl py-3 pl-12 pr-4 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--pri)]/50 focus:bg-white/10 transition-all"
                        />
                    </div>

                    <div className="relative group">
                        <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="bg-white/5 border border-white/5 rounded-2xl py-3 pl-12 pr-10 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--pri)]/50 appearance-none cursor-pointer"
                        >
                            <option value="">All Status</option>
                            <option value="sent">Sent</option>
                            <option value="delivered">Delivered</option>
                            <option value="failed">Failed</option>
                            <option value="bounced">Bounced</option>
                        </select>
                    </div>
                </div>

                <button
                    onClick={exportCSV}
                    className="flex items-center gap-2 px-6 py-3 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-[var(--text)] hover:bg-white/10 transition-all active:scale-95"
                >
                    <Download className="w-4 h-4" />
                    Export CSV
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
                            {loading ? (
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
                <div className="p-5 border-t border-white/5 flex items-center justify-between bg-white/[0.02] shrink-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
                        Showing {filteredLogs.length} of {data.total} records
                    </p>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => fetchLogs(data.page - 1)}
                            disabled={data.page === 1 || loading}
                            className="p-2 bg-white/5 rounded-xl text-[var(--muted)] hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)]">
                            Page {data.page}
                        </span>
                        <button
                            onClick={() => fetchLogs(data.page + 1)}
                            disabled={data.page * data.page_size >= data.total || loading}
                            className="p-2 bg-white/5 rounded-xl text-[var(--muted)] hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}