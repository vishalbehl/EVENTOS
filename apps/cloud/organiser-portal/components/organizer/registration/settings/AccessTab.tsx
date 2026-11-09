'use client'

import { useState, useEffect } from 'react'
import { ShieldCheck, Save, ToggleLeft, ToggleRight, Users, ClipboardList, Lock, Eye } from 'lucide-react'
import { useUpdateEvent } from '@/hooks/useEvents'
import { useEventEditSession } from '@/hooks/useEventEditSession'
import type { ApiError } from '@/lib/api-client'
import { useOperationAccess } from '@/lib/capabilities'
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
  const edit = useEventEditSession(eventId)
  const { event } = edit
  const [loadedEvent, setLoadedEvent] = useState<typeof event>()
  const updateEvent = useUpdateEvent(eventId, edit.version)
  const planningAccess = useOperationAccess('events.planning.manage')
  const formAccess = useOperationAccess('registration.forms.manage')
  const speakerAccess = useOperationAccess('speakers.manage')
  const canSave = planningAccess.enabled && formAccess.enabled && speakerAccess.enabled
  const [values, setValues] = useState<Record<string, boolean>>({
    registration_allowed: true,
    participants_list_allowed: true,
    speaker_window_required: true,
  })
  const saving = updateEvent.isPending

  useEffect(() => {
    if (event) {
      setValues({
        registration_allowed: event.registration_settings?.registration_allowed ?? true,
        participants_list_allowed: event.registration_settings?.participants_list_allowed ?? true,
        speaker_window_required: event.speaker_settings?.window_required ?? true,
      })
      setLoadedEvent(event)
    }
  }, [event])

  const handleSave = async () => {
    if (!edit.ready || !canSave || updateEvent.isPending || edit.reloading) return
    try {
      const saved = await updateEvent.mutateAsync({
        registration_settings: {
          registration_allowed: values.registration_allowed,
          participants_list_allowed: values.participants_list_allowed,
        },
        speaker_settings: { window_required: values.speaker_window_required },
      })
      if (!edit.complete(saved)) return
      toast.success('Access settings saved.')
    } catch (failure) {
      if (!edit.isCurrent()) return
      const error = failure as ApiError
      toast.error([409, 412].includes(error.status ?? 0)
        ? 'The settings changed. Your edits are preserved; discard and reload before saving again.'
        : error.message || 'Failed to save access settings. Your edits are preserved.')
    }
  }

  const toggle = (key: string) => {
    edit.markDirty()
    setValues(prev => ({ ...prev, [key]: !prev[key] }))
  }

  if (!edit.ready || loadedEvent !== event) return <p role={edit.error ? 'alert' : 'status'}>{edit.error || 'Loading current access settings…'}</p>

  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-[var(--pri)]" />
          <div>
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)]">Access Control</h2>
            <p className="text-[10px] font-bold text-muted">Control who can register and what they can see.</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={updateEvent.isPending || edit.reloading || !canSave}
          className="flex items-center gap-2 h-9 px-6 bg-[var(--pri)] hover:bg-[var(--pri-hover)] text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50 transition-all shrink-0"
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      <button type="button" onClick={edit.reload} disabled={updateEvent.isPending || edit.reloading} className="text-xs underline">
        Discard edits and reload
      </button>
      {edit.error && <p role="alert">{edit.error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Toggles List */}
        <div className="lg:col-span-2 space-y-3">
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
                    type="button"
                    role="switch"
                    aria-checked={isOn}
                    aria-label={item.label}
                    disabled={updateEvent.isPending || edit.reloading}
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

        {/* Right Column: Current Access Summary */}
        <div className="lg:col-span-1">
          <div className="glass-card rounded-2xl p-6 border border-white/5 space-y-4 sticky top-6">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-[var(--pri)]" />
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[var(--text)]">Current Access Summary</p>
            </div>
            
            <div className="space-y-3">
              {TOGGLES.map(item => {
                const isOn = values[item.key]
                const colorClass = COLOR_MAP[item.color]
                return (
                  <div key={item.key} className={`p-4 rounded-xl border flex items-center justify-between ${isOn ? colorClass : 'border-white/5 bg-white/[0.02]'}`}>
                    <span className={`text-[10px] font-black uppercase tracking-wider ${isOn ? colorClass.split(' ')[0] : 'text-muted'}`}>
                      {item.label}
                    </span>
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md ${isOn ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-white/5 text-muted'}`}>
                      {isOn ? 'Active' : 'Off'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
