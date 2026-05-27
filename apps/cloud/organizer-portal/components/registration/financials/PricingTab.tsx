'use client'

import { useState, useEffect, forwardRef, useImperativeHandle } from 'react'
import { BadgePercent, Plus, X, Save, Info, DollarSign } from 'lucide-react'
import { apiClient } from '@/lib/api-client'
import { toast } from 'sonner'
import { useEvent, useUpdateEvent } from '@/hooks/useEvents'

const CURRENCIES = [
  { code: 'INR', symbol: '₹' }, { code: 'USD', symbol: '$' },
  { code: 'EUR', symbol: '€' }, { code: 'GBP', symbol: '£' },
  { code: 'AED', symbol: 'د.إ' }, { code: 'SGD', symbol: 'S$' },
  { code: 'CAD', symbol: 'CA$' }, { code: 'AUD', symbol: 'A$' },
  { code: 'JPY', symbol: '¥' },
]

const TIER_PRESETS = ['Early Bird', 'Standard', 'Late Registration', 'Spot Registration', 'Group Rate', 'VIP Package']

interface Role { id: string; name: string; is_active: boolean }

interface PricingTabProps {
  eventId: string;
  onSavingChange?: (saving: boolean) => void;
}

const PricingTab = forwardRef<{ handleSave: () => Promise<void> }, PricingTabProps>(
  ({ eventId, onSavingChange }, ref) => {
    const { data: event } = useEvent(eventId)
    const updateEvent = useUpdateEvent(eventId)

    const [roles, setRoles] = useState<Role[]>([])
    const [tiers, setTiers] = useState<string[]>(['Early Bird', 'Standard'])
    const [pricing, setPricing] = useState<Record<string, string>>({})
    const [currency, setCurrency] = useState('INR')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [newTier, setNewTier] = useState('')
    const [tierCutoffs, setTierCutoffs] = useState<Record<string, string>>({})

    const currencySymbol = CURRENCIES.find(c => c.code === currency)?.symbol || '₹'
    const activeRoles = roles.filter(r => r.is_active)

    useEffect(() => {
      if (event) {
        setCurrency((event as any).currency || 'INR')
        setTierCutoffs((event as any).registration_settings?.tier_cutoffs || {})
      }
    }, [event])

    useEffect(() => { loadAll() }, [eventId])

    const loadAll = async () => {
      setLoading(true)
      try {
        const [rolesData, tiersData, priceData] = await Promise.all([
          apiClient.get<Role[]>(`/events/${eventId}/registration/roles`),
          apiClient.get<string[]>(`/events/${eventId}/pricing/tiers`),
          apiClient.get<Record<string, number>>(`/events/${eventId}/pricing`),
        ])
        setRoles(rolesData || [])
        if (tiersData?.length) setTiers(tiersData)
        const fmt: Record<string, string> = {}
        Object.entries(priceData || {}).forEach(([k, v]) => { fmt[k] = String(v) })
        setPricing(fmt)
      } catch { toast.error('Failed to load pricing data.') }
      finally { setLoading(false) }
    }

    const addTier = (name?: string) => {
      const t = (name || newTier).trim()
      if (!t) return
      if (tiers.includes(t)) { toast.error('Tier already exists.'); return }
      setTiers(prev => [...prev, t])
      setNewTier('')
    }

    const removeTier = (tier: string) => {
      setTiers(prev => prev.filter(t => t !== tier))
      setPricing(prev => {
        const next = { ...prev }
        Object.keys(next).forEach(k => { if (k.endsWith(`_${tier}`)) delete next[k] })
        return next
      })
    }

    const getKey = (role: string, tier: string) => `${role}_${tier}`

    const setPrice = (role: string, tier: string, val: string) => {
      setPricing(prev => ({ ...prev, [getKey(role, tier)]: val }))
    }

    const handleSave = async () => {
      setSaving(true)
      if (onSavingChange) onSavingChange(true)
      try {
        // Save tiers list
        await apiClient.post(`/events/${eventId}/pricing/tiers`, { tiers })
        // Save currency & cutoffs
        const updatedSettings = {
          ...(event as any).registration_settings,
          tier_cutoffs: tierCutoffs
        }
        await updateEvent.mutateAsync({ currency, registration_settings: updatedSettings })
        // Save pricing matrix
        const pricingPayload: Record<string, number | null> = {}
        activeRoles.forEach(role => {
          tiers.forEach(tier => {
            const key = getKey(role.name, tier)
            const val = pricing[key]
            pricingPayload[key] = val ? parseFloat(val) : null
          })
        })
        await apiClient.post(`/events/${eventId}/pricing`, { pricingData: pricingPayload })
        toast.success('Pricing matrix saved!')
      } catch { toast.error('Failed to save pricing.') }
      finally {
        setSaving(false)
        if (onSavingChange) onSavingChange(false)
      }
    }

    useImperativeHandle(ref, () => ({
      handleSave
    }))

    if (loading) {
      return <div className="flex items-center justify-center py-24 text-muted animate-pulse text-xs font-black uppercase tracking-widest">Loading pricing matrix...</div>
    }

    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0 overflow-hidden">
        {/* ── Settings Panel ── */}
        <div className="lg:col-span-1 flex flex-col space-y-4 h-full overflow-y-auto custom-scrollbar pr-1">
          {/* Tier Manager */}
          <div className="glass-card rounded-2xl p-5 border border-white/5 space-y-3 bg-[var(--surf)]/20">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-muted">Pricing Tiers</p>
            <div className="flex flex-wrap gap-2">
              {tiers.map(tier => (
                <div key={tier} className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[var(--pri)]/10 border border-[var(--pri)]/20 text-[var(--pri)]">
                  <span className="text-[10px] font-black uppercase tracking-wider">{tier}</span>
                  <button onClick={() => removeTier(tier)} className="hover:text-rose-400 transition-colors">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <input
                  value={newTier}
                  onChange={e => setNewTier(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addTier()}
                  placeholder="New tier..."
                  className="h-8 px-3 bg-white/5 border border-white/5 rounded-full text-[10px] font-bold text-[var(--text)] focus:border-[var(--pri)]/50 focus:ring-0 focus:outline-none w-24 transition-all"
                />
                <button onClick={() => addTier()} className="h-8 w-8 rounded-full bg-[var(--pri)] hover:bg-[var(--pri-hover)] text-white flex items-center justify-center transition-all shrink-0">
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {/* Quick-add preset tiers */}
            <div className="flex flex-wrap gap-1.5">
              {TIER_PRESETS.filter(p => !tiers.includes(p)).map(p => (
                <button
                  key={p}
                  onClick={() => addTier(p)}
                  className="text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/5 border border-white/5 text-muted hover:text-[var(--pri)] hover:border-[var(--pri)]/30 hover:bg-[var(--pri)]/5 transition-all"
                >
                  + {p}
                </button>
              ))}
            </div>
          </div>

          {/* Smart Early Bird Cutoffs */}
          <div className="glass-card rounded-2xl p-5 border border-white/5 space-y-4 bg-[var(--surf)]/20">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-muted">Smart Early Bird Cutoffs</p>
            <p className="text-[10px] font-bold text-muted/60 leading-relaxed">
              Define when each tier automatically expires. The registration portal automatically selects the active tier based on the current datetime.
            </p>
            <div className="space-y-4">
              {tiers.map(tier => (
                <div key={tier} className="flex flex-col gap-1.5 p-3.5 bg-white/5 border border-white/5 rounded-xl">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text)]">{tier} Cutoff Date & Time</span>
                  <input
                    type="datetime-local"
                    value={tierCutoffs[tier] ? tierCutoffs[tier].substring(0, 16) : ''}
                    onChange={e => {
                      const val = e.target.value;
                      setTierCutoffs(prev => ({
                        ...prev,
                        [tier]: val ? new Date(val).toISOString() : ''
                      }))
                    }}
                    className="h-9 px-3 bg-[#080912] border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-[var(--text)] focus:border-[var(--pri)]/50 focus:ring-0 focus:outline-none w-full transition-all cursor-pointer"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Pricing Matrix Table ── */}
        <div className="lg:col-span-2 flex flex-col min-h-0 h-full overflow-hidden space-y-4">
          <div className="flex items-center justify-between gap-4 shrink-0">
            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-[var(--text)]">Pricing Matrix Table</span>
            {/* Currency */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/5 rounded-xl">
              <DollarSign className="h-3.5 w-3.5 text-[var(--pri)]" />
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                className="bg-transparent text-[10px] font-black uppercase tracking-wider text-[var(--text)] focus:ring-0 focus:outline-none cursor-pointer"
              >
                {CURRENCIES.map(c => <option key={c.code} value={c.code} className="bg-[var(--base)] text-[var(--text)]">{c.code} ({c.symbol})</option>)}
              </select>
            </div>
          </div>

          {activeRoles.length === 0 ? (
            <div className="glass-card rounded-2xl p-10 border border-white/5 text-center space-y-2 flex-1 flex flex-col justify-center items-center">
              <p className="text-sm font-black text-muted">No active roles</p>
              <p className="text-[10px] font-bold text-muted/60">Enable roles in the Delegate Roles tab to configure their pricing.</p>
            </div>
          ) : (
            <div className="glass-card rounded-2xl border border-white/5 overflow-hidden flex-1 min-h-0 flex flex-col bg-[var(--surf)]/20">
              <div className="flex-1 overflow-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white/5 border-b border-white/5 sticky top-0 z-20">
                      <th className="px-5 py-4 text-[9px] font-black uppercase tracking-[0.25em] text-muted w-52 sticky left-0 bg-[#141318] z-30">
                        Role / Delegate Type
                      </th>
                      {tiers.map(tier => (
                        <th key={tier} className="px-4 py-4 text-[9px] font-black uppercase tracking-[0.2em] text-[var(--pri)] min-w-[140px] bg-[#141318]">
                          <div className="flex flex-col gap-0.5">
                            <span>{tier}</span>
                            <span className="text-muted font-bold normal-case tracking-normal text-[8px]">{currency}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {activeRoles.map((role, idx) => (
                      <tr key={role.id} className={`hover:bg-white/[0.02] transition-colors ${idx % 2 === 0 ? '' : 'bg-white/[0.01]'}`}>
                        <td className="px-5 py-3 sticky left-0 bg-[#141318]/90 backdrop-blur-sm z-10 border-r border-white/5">
                          <span className="text-xs font-bold text-[var(--text)]">{role.name}</span>
                        </td>
                        {tiers.map(tier => {
                          const key = getKey(role.name, tier)
                          return (
                            <td key={tier} className="px-4 py-2.5">
                              <div className="relative flex items-center">
                                <span className="absolute left-3 text-[10px] font-bold text-muted pointer-events-none">{currencySymbol}</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={pricing[key] || ''}
                                  onChange={e => setPrice(role.name, tier, e.target.value)}
                                  placeholder="—"
                                  className="w-full h-9 pl-7 pr-3 bg-white/5 border border-white/5 rounded-xl text-xs font-bold text-[var(--text)] text-right focus:border-[var(--pri)]/50 focus:ring-0 focus:outline-none focus:bg-white/10 transition-all placeholder:text-muted/30"
                                />
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Table Footer */}
              <div className="px-5 py-3 border-t border-white/5 bg-white/[0.02] flex items-center gap-2 shrink-0">
                <Info className="h-3.5 w-3.5 text-muted shrink-0" />
                <p className="text-[9px] font-bold text-muted">
                  Leave empty for &quot;price on request&quot;. Pricing applies to new registrations only.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }
)

PricingTab.displayName = 'PricingTab'
export default PricingTab

