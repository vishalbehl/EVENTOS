'use client'

import { useEffect, useState } from 'react'
import { getEmailAnalytics, EmailAnalytics } from '@/services/email-service'
import { motion } from 'framer-motion'
import { BarChart3, Activity, PieChart, Users, ArrowRight, Loader2 } from 'lucide-react'

// ===== Props =====
interface Props {
    eventId: string
    targetType?: string
}

// ===== Component =====
export default function AnalyticsDashboard({ eventId, targetType }: Props) {
    const [stats, setStats] = useState<EmailAnalytics | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (eventId) {
            fetchAnalytics()
        }
    }, [eventId, targetType])

    const fetchAnalytics = async () => {
        setLoading(true)
        try {
            const data = await getEmailAnalytics(eventId, targetType)
            setStats(data)
        } catch (err: any) {
            const status = err.response?.status || err.status;
            const message = err.response?.data?.detail || err.message || JSON.stringify(err);
            console.error(`Failed to fetch analytics [${status}]:`, message);
        } finally {
            setLoading(false)
        }
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
                <Loader2 className="w-8 h-8 text-[var(--pri)] animate-spin" />
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--muted)]">Calculating Real-time Analytics...</p>
            </div>
        )
    }

    if (!stats) return null

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* ===== Premium Summary Grid ===== */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <AnalyticsCard title="Campaign Reach" value={stats.total_recipients} icon={<Users className="w-4 h-4" />} color="var(--pri)" />
                <AnalyticsCard title="Transmitted" value={stats.total_sent} icon={<Activity className="w-4 h-4" />} color="var(--success)" />
                <AnalyticsCard title="Success Rate" value={`${stats.success_rate}%`} icon={<PieChart className="w-4 h-4" />} color="var(--acc)" />
                <AnalyticsCard title="Open Engagement" value={`${stats.open_rate}%`} icon={<BarChart3 className="w-4 h-4" />} color="var(--pri)" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* ===== Engagement Terminal ===== */}
                <div className="glass-card rounded-[2.5rem] p-8 border border-white/5 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-5">
                        <Activity className="w-32 h-32" />
                    </div>
                    
                    <h3 className="text-sm font-black uppercase tracking-[0.3em] text-[var(--muted)] mb-8 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[var(--pri)] animate-pulse" />
                        Campaign Health
                    </h3>

                    <div className="space-y-6">
                        <StatusProgress label="Successfully Delivered" value={stats.total_sent} percent={stats.success_rate} color="var(--success)" />
                        <StatusProgress label="Read Engagement" value={stats.opened_count} percent={stats.open_rate} color="var(--pri)" />
                        <StatusProgress label="Bounced / Failed" value={stats.failed_count} percent={100 - stats.success_rate} color="var(--dan)" />
                    </div>
                </div>

                {/* ===== Transmission Funnel ===== */}
                <div className="glass-card rounded-[2.5rem] p-8 border border-white/5 bg-[var(--pri)]/5 relative overflow-hidden">
                    <h3 className="text-sm font-black uppercase tracking-[0.3em] text-[var(--muted)] mb-8">
                        Transmission Funnel
                    </h3>

                    <div className="space-y-4">
                        <FunnelLayer label="Identified Recipients" value={stats.total_recipients} opacity="1" />
                        <div className="flex justify-center text-[var(--muted)] opacity-30"><ArrowRight className="w-4 h-4 rotate-90" /></div>
                        <FunnelLayer label="Successfully Sent" value={stats.total_sent} opacity="0.7" color="var(--success)" />
                        <div className="flex justify-center text-[var(--muted)] opacity-30"><ArrowRight className="w-4 h-4 rotate-90" /></div>
                        <FunnelLayer label="Unique Opens" value={stats.opened_count} opacity="0.4" color="var(--acc)" />
                    </div>
                </div>
            </div>
        </div>
    )
}

function AnalyticsCard({ title, value, icon, color }: { title: string; value: any; icon: any; color: string }) {
    return (
        <div className="glass-card rounded-3xl p-6 border border-white/5 relative group overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-125 transition-transform duration-500">
                {icon}
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-1">
                {title}
            </p>
            <h4 className="text-3xl font-black tracking-tighter" style={{ color }}>
                {value}
            </h4>
        </div>
    )
}

function StatusProgress({ label, value, percent, color }: { label: string; value: number; percent: number; color: string }) {
    return (
        <div className="space-y-2">
            <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                <span className="text-[var(--muted)]">{label}</span>
                <span style={{ color }}>{value}</span>
            </div>
            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${percent}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className="h-full rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)]"
                    style={{ backgroundColor: color }}
                />
            </div>
        </div>
    )
}

function FunnelLayer({ label, value, opacity, color }: { label: string; value: number; opacity: string; color?: string }) {
    return (
        <div 
            className="p-6 rounded-2xl border border-white/5 flex items-center justify-between transition-all hover:scale-[1.02]"
            style={{ 
                backgroundColor: color ? `color-mix(in srgb, ${color} 10%, transparent)` : 'rgba(255,255,255,0.02)',
                borderColor: color ? `color-mix(in srgb, ${color} 20%, transparent)` : 'rgba(255,255,255,0.05)'
            }}
        >
            <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--muted)]">{label}</p>
                <p className="text-xl font-black tracking-tighter text-[var(--text)]">{value}</p>
            </div>
            <Activity className="w-5 h-5 text-[var(--muted)] opacity-20" />
        </div>
    )
}