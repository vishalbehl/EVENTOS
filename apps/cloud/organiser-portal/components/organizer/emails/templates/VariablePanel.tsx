'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
    Database, 
    Search, 
    Copy, 
    User, 
    Calendar, 
    MapPin, 
    Link as LinkIcon,
    ChevronRight,
    Zap
} from 'lucide-react'
import { toast } from 'sonner'

// ===== Props =====
interface Props {
    onInsert: (variable: string) => void
}

// ===== Variable Definitions =====
const VARIABLE_GROUPS = [
    {
        title: 'Speaker Info',
        icon: <User className="w-3 h-3" />,
        variables: [
            'SpeakerName',
            'SpeakerFirstName',
            'SpeakerEmail',
            'Affiliation',
            'Country',
            'AccessCode',
            'RejectedReason',
        ],
    },
    {
        title: 'Event Info',
        icon: <Zap className="w-3 h-3" />,
        variables: [
            'EventName',
            'Deadline',
        ],
    },
    {
        title: 'Session Info',
        icon: <Calendar className="w-3 h-3" />,
        variables: [
            'SessionName',
            'SessionDate',
            'SessionTime',
            'RoomName',
            'SessionTable',
            'RejectedPresentationTable',
        ],
    },
    {
        title: 'Action Links & QR',
        icon: <LinkIcon className="w-3 h-3" />,
        variables: [
            'UploadLink',
            'QRCodeImg',
            'QRCodeURL',
        ],
    },
]

// ===== Component =====
export default function VariablePanel({ onInsert }: Props) {
    const [search, setSearch] = useState('')

    const filteredGroups = VARIABLE_GROUPS.map((group) => ({
        ...group,
        variables: group.variables.filter((v) =>
            v.toLowerCase().includes(search.toLowerCase())
        ),
    })).filter((group) => group.variables.length > 0)

    const copyToClipboard = (variable: string) => {
        navigator.clipboard.writeText(`{{${variable}}}`)
        toast.success(`Copied: {{${variable}}}`)
    }

    return (
        <div className="glass-card rounded-[1.5rem] border border-white/5 flex flex-col h-full overflow-hidden">
            {/* ===== Header ===== */}
            <div className="p-4 border-b border-white/5 bg-white/[0.02] shrink-0">
                <div className="flex items-center gap-2 mb-3">
                    <div className="h-8 w-8 rounded-lg bg-[var(--pri)]/10 flex items-center justify-center text-[var(--pri)]">
                        <Database className="w-4 h-4" />
                    </div>
                    <div>
                        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[var(--text)]">Placeholders</h3>
                        <p className="text-[9px] font-black uppercase tracking-widest text-[var(--muted)]">Custom Variables</p>
                    </div>
                </div>

                {/* ===== Tactical Search ===== */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--muted)]" />
                    <input
                        placeholder="Search variables..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full bg-white/5 border border-white/5 rounded-lg py-1.5 pl-9 pr-3 text-[10px] font-bold text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--pri)]/50 transition-all"
                    />
                </div>
            </div>

            {/* ===== Available Placeholders ===== */}
            <div className="flex-1 overflow-auto p-3 space-y-4 scrollbar-hide">
                <AnimatePresence mode="popLayout">
                    {filteredGroups.map((group) => (
                        <motion.div 
                            key={group.title}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="space-y-1.5"
                        >
                            <p className="px-1 text-[9px] font-black uppercase tracking-[0.3em] text-[var(--muted)] flex items-center gap-1.5">
                                {group.icon}
                                {group.title}
                            </p>

                            <div className="grid grid-cols-1 gap-1.5">
                                {group.variables.map((v) => (
                                    <div
                                        key={v}
                                        className="group flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-white/[0.03] border border-white/5 hover:border-[var(--pri)]/30 hover:bg-white/[0.05] transition-all"
                                    >
                                        <button
                                            onClick={() => onInsert(v)}
                                            className="flex-1 text-left"
                                        >
                                            <code className="text-[10px] font-bold text-[var(--pri)] group-hover:text-[var(--text)] transition-colors font-mono">
                                                {`{{${v}}}`}
                                            </code>
                                        </button>

                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => copyToClipboard(v)}
                                                className="p-1 rounded-md hover:bg-white/10 text-[var(--muted)] hover:text-[var(--text)] transition-all"
                                                title="Copy Variable"
                                            >
                                                <Copy className="w-3 h-3" />
                                            </button>
                                            <button
                                                onClick={() => onInsert(v)}
                                                className="p-1 rounded-md bg-[var(--pri)] text-[var(--primary-contrast)] shadow-lg shadow-[var(--pri)]/20 transition-transform active:scale-90"
                                                title="Insert Variable"
                                            >
                                                <ChevronRight className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {filteredGroups.length === 0 && (
                    <div className="py-8 text-center">
                        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] opacity-50">
                            No variables found
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}