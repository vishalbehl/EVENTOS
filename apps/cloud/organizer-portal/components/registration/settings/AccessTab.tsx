'use client'

import { useState, useEffect } from 'react'
import { ShieldCheck, Save, ToggleLeft, ToggleRight, Users, ClipboardList, Lock, Eye } from 'lucide-react'
import { useEvent, useUpdateEvent } from '@/hooks/useEvents'
import { toast } from 'sonner'

interface Toggle {
  key: string
  icon: any
  label: string
  desc: string
  color: string
}

const TOGGLES: Toggle[] = [
  {
    key: 'registration_allowed',
    icon: ClipboardList,
    label: 'Registration Allowed',
    desc: 'Allow participants to submit new registration forms. Disable to freeze new signups while keeping the portal live.',
    color: 'emerald',
  },
  {
    key: 'participants_list_allowed',
    icon: Eye,
    label: 'Participants List Visible',
    desc: 'Allow registered participants to see the attendee list on the portal. Useful for networking features.',
    color: 'blue',
  },
  {
    key: 'speaker_window_required',
    icon: Users,
    label: 'Speaker Window Required',
    desc: 'Require the speaker portal to be active alongside the registration module. Enforces speaker-participant coordination.',
    color: 'pri',
  },
]

const COLOR_MAP: Record<string, string> = {
  emerald: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  blue:    'text-blue-400 bg-blue-400/10 border-blue-400/20',
  pri:     'text-[var(--pri)] bg-[var(--pri)]/10 border-[var(--pri)]/20',
}

export default function AccessTab({ eventId }: { eventId: string }) {
  const { data: event } = useEvent(eventId)
  const updateEvent = useUpdateEvent(eventId)
  const [values, setValues] = useState<Record<string, boolean>>({
    registration_allowed: true,
    participants_list_allowed: true,
    speaker_window_required: true,
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (event) {
      setValues({
        registration_allowed: (event as any).registration_allowed ?? true,
        participants_list_allowed: (event as any).participants_list_allowed ?? true,
        speaker_window_required: (event as any).speaker_window_required ?? true,
      })
    }
  }, [event])

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateEvent.mutateAsync(values as any)
      toast.success('Access settings saved.')
    } catch {
      toast.error('Failed to save access settings.')
    } finally {
      setSaving(false)
    }
  }

  const toggle = (key: string) => {
    setValues(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-between justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-[var(--pri)]" />
          <div>
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)]">Access Control</h2>
            <p className="text-[10px] font-bold text-muted">Control who can register and what they can see.</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 h-9 px-6 bg-[var(--pri)] hover:bg-[var(--pri-hover)] text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50 transition-all"
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      <div className="space-y-3">
        {TOGGLES.map(item => {
          const Icon = item.icon
          const isOn = values[item.key]
          const colorClass = COLOR_MAP[item.color]

          return (
            <div
              key={item.key}
              className={`glass-card rounded-2xl p-6 border transition-all ${
                isOn
                  ? item.color === 'pri'
                    ? 'border-[var(--pri)]/20 bg-[color-mix(in_srgb,var(--pri)_3%,transparent)]'
                    : `border-${item.color}-400/20 bg-${item.color}-400/[0.03]`
                  : 'border-white/5'
              }`}
            >
              <div className="flex items-center justify-between gap-6">
                <div className="flex items-start gap-4">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center border shrink-0 ${isOn ? colorClass : 'text-muted bg-white/5 border-white/5'}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className={`text-sm font-black ${isOn ? (item.color === 'pri' ? 'text-[var(--pri)]' : `text-${item.color}-400`) : 'text-[var(--text)]'}`}>
                      {item.label}
                    </p>
                    <p className="text-[10px] font-bold text-muted mt-1 leading-relaxed max-w-md">{item.desc}</p>
                  </div>
                </div>
                <button
                  onClick={() => toggle(item.key)}
                  className="shrink-0 transition-colors"
                >
                  {isOn
                    ? <ToggleRight className={`h-9 w-9 ${item.color === 'pri' ? 'text-[var(--pri)]' : `text-${item.color}-400`}`} />
                    : <ToggleLeft className="h-9 w-9 text-muted/40" />}
                </button>
              </div>

              {/* Status pill */}
              <div className="mt-4 pl-14">
                <span className={`inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full border ${
                  isOn ? colorClass : 'text-muted bg-white/5 border-white/5'
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${isOn ? (item.color === 'pri' ? 'bg-[var(--pri)]' : `bg-${item.color}-400`) : 'bg-muted/40'}`} />
                  {isOn ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Summary box */}
      <div className="glass-card rounded-2xl p-5 border border-white/5 space-y-3">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-[var(--pri)]" />
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-muted">Current Access Summary</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {TOGGLES.map(item => {
            const isOn = values[item.key]
            const colorClass = COLOR_MAP[item.color]
            return (
              <div key={item.key} className={`p-3 rounded-xl border text-center ${isOn ? colorClass : 'border-white/5 bg-white/[0.02]'}`}>
                <p className={`text-[10px] font-black uppercase tracking-wider ${isOn ? colorClass.split(' ')[0] : 'text-muted'}`}>
                  {item.label.split(' ').slice(0, 2).join(' ')}
                </p>
                <p className={`text-xs font-black mt-1 ${isOn ? colorClass.split(' ')[0] : 'text-muted/50'}`}>
                  {isOn ? '✓ On' : '✗ Off'}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
