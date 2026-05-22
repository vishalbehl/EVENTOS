'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Globe, Tag, BadgePercent, ShieldCheck, Palette } from 'lucide-react'
import PortalTab from '@/components/registration/settings/PortalTab'
import RolesTab from '@/components/registration/settings/RolesTab'
import PricingTab from '@/components/registration/settings/PricingTab'
// Access control tab component
import AccessTab from '@/components/registration/settings/AccessTab'

const TABS = [
  { id: 'portal',  label: 'Portal',         icon: Globe },
  { id: 'roles',   label: 'Delegate Roles',  icon: Tag },
  { id: 'pricing', label: 'Pricing Matrix',  icon: BadgePercent },
  { id: 'access',  label: 'Access Control',  icon: ShieldCheck },
]

export default function RegistrationSettings() {
  const { eventId } = useParams()
  const [activeTab, setActiveTab] = useState('portal')

  const eid = eventId as string

  return (
    <div className="min-h-screen p-6 space-y-6">
      {/* ── Page Header ── */}
      <div className="flex items-end justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Palette className="h-4 w-4 text-[var(--pri)]" />
            <span className="text-[9px] font-black uppercase tracking-[0.35em] text-[var(--pri)]">Configure</span>
          </div>
          <h1 className="text-4xl font-black tracking-tighter text-[var(--text)]">
            Registration <span className="text-[var(--pri)]">Config</span>
          </h1>
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted mt-1">
            Portal · Roles · Pricing · Access
          </p>
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div className="relative flex gap-1 p-1.5 rounded-2xl bg-white/5 border border-white/5 w-fit">
        {TABS.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all z-10 ${
                isActive ? 'text-white' : 'text-muted hover:text-[var(--text)]'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="tab-bg"
                  className="absolute inset-0 rounded-xl bg-[var(--pri)] shadow-lg shadow-[var(--pri)]/30"
                  transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                />
              )}
              <Icon className="h-3.5 w-3.5 relative z-10" />
              <span className="relative z-10">{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* ── Tab Content ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'portal'  && <PortalTab  eventId={eid} />}
          {activeTab === 'roles'   && <RolesTab   eventId={eid} />}
          {activeTab === 'pricing' && <PricingTab  eventId={eid} />}
          {activeTab === 'access'  && <AccessTab   eventId={eid} />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
