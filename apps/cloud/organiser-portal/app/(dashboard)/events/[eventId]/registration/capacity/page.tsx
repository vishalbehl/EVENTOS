'use client'

import { useParams } from 'next/navigation'
import { Box, Tag } from 'lucide-react'
import Link from 'next/link'
import CapacityTab from '@/components/organizer/registration/settings/CapacityTab'

export default function CapacityPage() {
  const { eventId } = useParams()
  const eid = eventId as string

  return (
    <div className="w-full max-w-full overflow-x-hidden p-6 space-y-6">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Box className="h-4 w-4 text-[var(--pri)]" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--pri)]">Capacity Management</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Capacity &amp; Allocation
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Event-wide registration limits, session seat caps, room limits, waitlists, and auto-promotion policies.
          </p>
        </div>

        <Link
          href={`/events/${eid}/registration/categories`}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] shadow-sm transition-colors"
        >
          <Tag className="size-3.5 text-[var(--pri)]" />
          <span>Manage Pass Pricing &rarr;</span>
        </Link>
      </div>

      {/* ── Capacity Manager ── */}
      <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--card)] p-6 shadow-sm">
        <CapacityTab />
      </div>
    </div>
  )
}
