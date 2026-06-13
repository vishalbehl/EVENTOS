'use client'

import { motion } from 'framer-motion'
import { 
    Send, 
    Clock, 
    CheckCircle, 
    AlertCircle, 
    TrendingUp, 
    Users 
} from 'lucide-react'
import AnalyticsDashboard from './AnalyticsDashboard'

interface Campaign {
    id: string
    name: string
    status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed'
    total_recipients: number
    sent_count: number
    created_at: string
}

interface Props {
    eventId: string
    campaigns: Campaign[]
    targetType?: string
}

export default function CampaignDashboard({ eventId, campaigns, targetType }: Props) {
    return (
        <div className="space-y-12 flex-1 min-h-0 overflow-y-auto pr-2 custom-scrollbar">
            {/* ===== Analytics Section (Server-side powered) ===== */}
            <AnalyticsDashboard eventId={eventId} targetType={targetType} />

            {/* ===== Recent Activity (Client-side filtered) ===== */}
            <div className="glass-card rounded-[2rem] p-8 overflow-hidden relative">
                <div className="absolute top-0 right-0 p-8 opacity-5">
                    <TrendingUp className="w-32 h-32 text-[var(--pri)]" />
                </div>

                <div className="relative z-10">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="text-xl font-black tracking-tighter text-[var(--text)] uppercase">
                                Recent Activity
                            </h3>
                            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mt-1">
                                Latest dispatch status across registry
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {campaigns.slice(0, 5).map((campaign, idx) => (
                            <motion.div
                                key={campaign.id}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.1 }}
                                className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 transition-all group"
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`p-3 rounded-xl bg-white/5 text-[var(--pri)] group-hover:scale-110 transition-transform`}>
                                        <Send className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-[var(--text)]">{campaign.name}</h4>
                                        <p className="text-[10px] uppercase tracking-widest text-[var(--muted)]">
                                            {new Date(campaign.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-6">
                                    <div className="text-right">
                                        <p className="text-sm font-black text-[var(--text)]">{campaign.sent_count}</p>
                                        <p className="text-[10px] uppercase tracking-tighter text-[var(--muted)]">Delivered</p>
                                    </div>
                                    <span className={`
                                        px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest
                                        ${getStatusColor(campaign.status)}
                                    `}>
                                        {campaign.status}
                                    </span>
                                </div>
                            </motion.div>
                        ))}

                        {campaigns.length === 0 && (
                            <div className="text-center py-12">
                                <AlertCircle className="w-12 h-12 text-[var(--muted)] mx-auto mb-4 opacity-20" />
                                <p className="text-[var(--muted)] uppercase text-[10px] font-black tracking-[0.3em]">
                                    No campaigns found in current sector
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

function getStatusColor(status: string) {
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