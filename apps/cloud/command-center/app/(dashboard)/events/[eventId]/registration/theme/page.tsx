'use client'

import { use } from 'react'
import ThemeTab from '@/components/registration/settings/ThemeTab'

export default function ThemePage({ params: paramsPromise }: { params: Promise<{ eventId: string }> }) {
  const params = use(paramsPromise)
  const { eventId } = params
  return (
    <div className="relative w-full max-w-full overflow-x-hidden p-6">
      {/* Background Aesthetics */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-[var(--pri)] rounded-full blur-[120px] opacity-10 animate-pulse" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-[var(--sec)] rounded-full blur-[120px] opacity-10" />
      </div>

      <div className="relative z-10 w-full">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 shrink-0 mb-6 pb-4 border-b border-white/5">
          <div className="animate-in fade-in slide-in-from-left-4 duration-700">
            <h1 className="text-4xl font-black tracking-tighter text-[var(--text)] text-glow-indigo">
              THEME <span className="text-[var(--pri)]">DESIGNER</span>
            </h1>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-[var(--muted)] mt-1">
              EventOS Registration Portal Styling &amp; Layout Manager
            </p>
          </div>
        </header>

        <main className="perspective-1000">
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
            <ThemeTab eventId={eventId} />
          </div>
        </main>
      </div>
    </div>
  )
}
