'use client'

import { useState, useEffect } from 'react'
import { Ticket, Plus, Trash2, Calendar, Users, Percent, DollarSign, ToggleLeft, ToggleRight } from 'lucide-react'
import { apiClient } from '@/lib/api-client'
import { formatApiError } from '@/lib/utils'
import { toast } from 'sonner'

interface PromoCode {
  id: string
  event_id: string
  code: string
  discount_type: string
  discount_value: number
  max_uses?: number
  used_count: number
  expiry_date?: string
  is_active: boolean
  created_at: string
}

export default function PromosTab({ eventId }: { eventId: string }) {
  const [promos, setPromos] = useState<PromoCode[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Form State
  const [code, setCode] = useState('')
  const [discountType, setDiscountType] = useState('percentage')
  const [discountValue, setDiscountValue] = useState('')
  const [maxUses, setMaxUses] = useState('')
  const [expiryDate, setExpiryDate] = useState('')

  useEffect(() => {
    loadPromos()
  }, [eventId])

  const loadPromos = async () => {
    setLoading(true)
    try {
      const res = await apiClient.get<PromoCode[]>(`/events/${eventId}/payments/promos`)
      setPromos(res || [])
    } catch {
      toast.error('Failed to load promo codes.')
    } finally {
      setLoading(false)
    }
  }

  const handleCreatePromo = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanCode = code.trim().toUpperCase()
    if (!cleanCode) return
    const val = parseFloat(discountValue)
    if (isNaN(val) || val <= 0) {
      toast.error('Please enter a valid discount value.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        code: cleanCode,
        discount_type: discountType,
        discount_value: val,
        max_uses: maxUses ? parseInt(maxUses) : null,
        expiry_date: expiryDate ? new Date(expiryDate).toISOString() : null,
        is_active: true
      }
      
      const newPromo = await apiClient.post<PromoCode>(`/events/${eventId}/payments/promos`, payload)
      setPromos(prev => [newPromo, ...prev])
      toast.success(`Promo code ${cleanCode} created successfully!`)
      
      // Reset form
      setCode('')
      setDiscountValue('')
      setMaxUses('')
      setExpiryDate('')
    } catch (err: any) {
      toast.error(formatApiError(err, 'Failed to create promo code.'))
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (promo: PromoCode) => {
    try {
      const res = await apiClient.patch<PromoCode>(`/events/${eventId}/payments/promos/${promo.id}`, {
        is_active: !promo.is_active
      })
      setPromos(prev => prev.map(p => p.id === promo.id ? res : p))
      toast.success(res.is_active ? 'Promo code activated!' : 'Promo code deactivated.')
    } catch {
      toast.error('Failed to update promo code.')
    }
  }

  const handleDeletePromo = async (id: string) => {
    if (!confirm('Are you sure you want to delete this promo code?')) return
    try {
      await apiClient.delete(`/events/${eventId}/payments/promos/${id}`)
      setPromos(prev => prev.filter(p => p.id !== id))
      toast.success('Promo code deleted.')
    } catch {
      toast.error('Failed to delete promo code.')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted animate-pulse text-xs font-black uppercase tracking-widest">
        Loading promo codes...
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full min-h-0 overflow-hidden">
      {/* ── Add Promo Form ── */}
      <div className="lg:col-span-1 flex flex-col min-h-0 h-full overflow-hidden">
        <form onSubmit={handleCreatePromo} className="glass-card rounded-[2rem] p-6 border border-white/5 space-y-5 h-full overflow-y-auto custom-scrollbar bg-[var(--surf)]/20">
          <div className="flex items-center gap-3">
            <Ticket className="h-5 w-5 text-[var(--pri)]" />
            <div>
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-[var(--text)]">New Promo Code</h2>
              <p className="text-[9px] font-bold text-muted mt-0.5">Generate a new registration coupon</p>
            </div>
          </div>

          {/* Code */}
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase tracking-wider text-muted block">Promo Code</label>
            <input
              type="text"
              required
              placeholder="e.g. WELCOME20"
              value={code}
              onChange={e => setCode(e.target.value)}
              className="w-full h-10 px-4 bg-[#080912] border border-white/10 rounded-xl text-xs font-black uppercase text-[var(--text)] placeholder:normal-case placeholder:text-muted/40 focus:border-[var(--pri)]/50 focus:ring-0 focus:outline-none"
            />
          </div>

          {/* Discount Type & Value */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase tracking-wider text-muted block">Discount Type</label>
              <select
                value={discountType}
                onChange={e => setDiscountType(e.target.value)}
                className="w-full h-10 px-3 bg-[#080912] border border-white/10 rounded-xl text-xs font-bold text-[var(--text)] focus:ring-0 focus:outline-none cursor-pointer"
              >
                <option value="percentage" className="bg-[var(--base)]">Percentage (%)</option>
                <option value="fixed" className="bg-[var(--base)]">Fixed Flat</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase tracking-wider text-muted block">Discount Value</label>
              <div className="relative flex items-center">
                <span className="absolute left-3.5 text-xs text-muted font-bold pointer-events-none">
                  {discountType === 'percentage' ? <Percent className="h-3.5 w-3.5 text-muted" /> : <DollarSign className="h-3.5 w-3.5 text-muted" />}
                </span>
                <input
                  type="number"
                  required
                  min="0"
                  step="any"
                  placeholder={discountType === 'percentage' ? '15' : '500'}
                  value={discountValue}
                  onChange={e => setDiscountValue(e.target.value)}
                  className="w-full h-10 pl-8 pr-3 bg-[#080912] border border-white/10 rounded-xl text-xs font-bold text-[var(--text)] focus:border-[var(--pri)]/50 focus:ring-0 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Max Uses & Expiry */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase tracking-wider text-muted block">Usage Limit</label>
              <div className="relative flex items-center">
                <span className="absolute left-3.5 text-muted pointer-events-none">
                  <Users className="h-3.5 w-3.5" />
                </span>
                <input
                  type="number"
                  min="1"
                  placeholder="Unlimited"
                  value={maxUses}
                  onChange={e => setMaxUses(e.target.value)}
                  className="w-full h-10 pl-8 pr-3 bg-[#080912] border border-white/10 rounded-xl text-xs font-bold text-[var(--text)] focus:border-[var(--pri)]/50 focus:ring-0 focus:outline-none"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase tracking-wider text-muted block">Expiry Date</label>
              <div className="relative flex items-center">
                <span className="absolute left-3.5 text-muted pointer-events-none">
                  <Calendar className="h-3.5 w-3.5" />
                </span>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={e => setExpiryDate(e.target.value)}
                  className="w-full h-10 pl-8 pr-3 bg-[#080912] border border-white/10 rounded-xl text-xs font-bold text-[var(--text)] focus:border-[var(--pri)]/50 focus:ring-0 focus:outline-none cursor-pointer"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="flex items-center justify-center gap-2 w-full h-11 bg-[var(--pri)] hover:bg-[var(--pri-hover)] text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50 transition-all shadow-lg shadow-[var(--pri)]/20 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            {saving ? 'Creating...' : 'Create Promo'}
          </button>
        </form>
      </div>

      {/* ── Active Promos List ── */}
      <div className="lg:col-span-2 flex flex-col min-h-0 h-full overflow-hidden space-y-4">
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text)]">Active Coupons</span>
          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-white/5 border border-white/5 text-muted">
            {promos.length} codes
          </span>
        </div>

        {promos.length === 0 ? (
          <div className="glass-card rounded-[2rem] p-12 border border-white/5 text-center space-y-2 flex-1 flex flex-col justify-center items-center">
            <Ticket className="h-8 w-8 text-muted/30 mx-auto" />
            <p className="text-xs font-black text-muted">No promo codes configured</p>
            <p className="text-[9px] font-bold text-muted/60">Generate coupon codes on the left panel to offer discounts.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 pb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {promos.map(promo => {
                const hasExpired = promo.expiry_date && new Date(promo.expiry_date) < new Date()
                const hasReachedLimit = promo.max_uses && promo.used_count >= promo.max_uses
                const isInvalid = hasExpired || hasReachedLimit
                
                return (
                  <div 
                    key={promo.id} 
                    className={`glass-card rounded-2xl p-5 border relative overflow-hidden flex flex-col justify-between h-48 transition-all bg-[var(--surf)]/20 ${
                      promo.is_active && !isInvalid 
                        ? 'border-white/5 hover:border-[var(--pri)]/30 hover:bg-white/[0.03]' 
                        : 'border-white/5 opacity-50 bg-white/[0.01]'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[9px] font-black uppercase tracking-[0.15em] text-muted">Coupon Code</span>
                        <h3 className="text-lg font-black text-[#E8EAFF] tracking-wider uppercase mt-0.5">{promo.code}</h3>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => handleToggleActive(promo)}
                          className="text-muted hover:text-[var(--text)] transition-colors cursor-pointer"
                        >
                          {promo.is_active ? (
                            <ToggleRight className="h-6 w-6 text-[var(--pri)]" />
                          ) : (
                            <ToggleLeft className="h-6 w-6" />
                          )}
                        </button>
                        <button 
                          onClick={() => handleDeletePromo(promo.id)}
                          className="text-muted hover:text-rose-400 p-1 bg-white/5 rounded-lg border border-white/5 hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Value / Amount */}
                    <div className="my-2">
                      <span className="text-2xl font-black text-[var(--pri)]">
                        {promo.discount_type === 'percentage' ? `${promo.discount_value}%` : `Flat ${promo.discount_value}`} Off
                      </span>
                    </div>

                    {/* Coupon status / details */}
                    <div className="pt-3 border-t border-white/[0.04] flex justify-between items-center text-[9px] font-black uppercase tracking-wider text-muted">
                      <div className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5 shrink-0 text-muted" />
                        <span>{promo.used_count} / {promo.max_uses || '∞'} Uses</span>
                      </div>

                      <div className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5 shrink-0 text-muted" />
                        <span>
                          {hasExpired ? (
                            <span className="text-rose-400">Expired</span>
                          ) : promo.expiry_date ? (
                            new Date(promo.expiry_date).toLocaleDateString()
                          ) : (
                            'No Expiry'
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Status label overlay */}
                    {isInvalid && (
                      <div className="absolute top-2 right-14 text-[7px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                        {hasExpired ? 'Expired' : 'Limit Reached'}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
