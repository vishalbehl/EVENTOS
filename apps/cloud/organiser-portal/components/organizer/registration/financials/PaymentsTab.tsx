'use client'

import { useState, useEffect } from 'react'
import { 
  CreditCard, Save, Lock, Unlock, Eye, EyeOff, 
  CheckCircle, AlertCircle, RefreshCw, Search 
} from 'lucide-react'
import { apiClient } from '@/lib/api-client'
import { toast } from 'sonner'

interface Transaction {
  id: string
  registration_id?: string
  amount: number
  currency: string
  status: string
  payment_method: string
  gateway_order_id?: string
  gateway_payment_id?: string
  discount_applied: number
  created_at: string
  registration_name?: string
  registration_email?: string
}

export default function PaymentsTab({ eventId }: { eventId: string }) {
  const [paymentEnabled, setPaymentEnabled] = useState(false)
  const [activeGateway, setActiveGateway] = useState('simulated')
  const [autoApprovePaid, setAutoApprovePaid] = useState(true)
  
  // Stripe Credentials
  const [stripePubKey, setStripePubKey] = useState('')
  const [stripeSecKey, setStripeSecKey] = useState('')
  
  // Razorpay Credentials
  const [razorpayKeyId, setRazorpayKeyId] = useState('')
  const [razorpayKeySecret, setRazorpayKeySecret] = useState('')
  
  const [showStripeSecret, setShowStripeSecret] = useState(false)
  const [showRazorpaySecret, setShowRazorpaySecret] = useState(false)
  
  const [saving, setSaving] = useState(false)
  const [loadingConfig, setLoadingConfig] = useState(true)
  
  // Transactions list
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loadingTx, setLoadingTx] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    loadConfig()
    loadTransactions()
  }, [eventId])

  const loadConfig = async () => {
    setLoadingConfig(true)
    try {
      const res = await apiClient.get<any>(`/events/${eventId}/payments/config`)
      setPaymentEnabled(res.payment_enabled)
      setActiveGateway(res.active_gateway)
      setAutoApprovePaid(res.auto_approve_paid ?? true)
      setStripePubKey(res.stripe_credentials?.publishable_key || '')
      setStripeSecKey(res.stripe_credentials?.secret_key || '')
      setRazorpayKeyId(res.razorpay_credentials?.key_id || '')
      setRazorpayKeySecret(res.razorpay_credentials?.key_secret || '')
    } catch {
      toast.error('Failed to load payment configuration.')
    } finally {
      setLoadingConfig(false)
    }
  }

  const loadTransactions = async () => {
    setLoadingTx(true)
    try {
      const res = await apiClient.get<Transaction[]>(`/events/${eventId}/payments/transactions`)
      setTransactions(res || [])
    } catch {
      toast.error('Failed to load transactions.')
    } finally {
      setLoadingTx(false)
    }
  }

  const handleSaveConfig = async () => {
    setSaving(true)
    try {
      await apiClient.post(`/events/${eventId}/payments/config`, {
        payment_enabled: paymentEnabled,
        active_gateway: activeGateway,
        auto_approve_paid: autoApprovePaid,
        stripe_credentials: {
          publishable_key: stripePubKey,
          secret_key: stripeSecKey
        },
        razorpay_credentials: {
          key_id: razorpayKeyId,
          key_secret: razorpayKeySecret
        }
      })
      toast.success('Payment settings updated!')
    } catch {
      toast.error('Failed to update payment settings.')
    } finally {
      setSaving(false)
    }
  }

  const filteredTransactions = transactions.filter(tx => {
    const q = searchQuery.toLowerCase()
    return (
      (tx.registration_name || '').toLowerCase().includes(q) ||
      (tx.registration_email || '').toLowerCase().includes(q) ||
      (tx.gateway_payment_id || '').toLowerCase().includes(q) ||
      (tx.payment_method || '').toLowerCase().includes(q)
    )
  })

  if (loadingConfig) {
    return (
      <div className="flex items-center justify-center py-24 text-muted animate-pulse text-xs font-black uppercase tracking-widest">
        Loading payment gateway config...
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0 overflow-hidden">
      {/* ── Settings Panel ── */}
      <div className="lg:col-span-1 flex flex-col space-y-4 h-full overflow-y-auto custom-scrollbar pr-1">
        <div className="glass-card rounded-[2rem] p-6 border border-white/5 bg-[var(--surf)]/20 space-y-6 flex flex-col">
          <div className="flex items-center gap-3 shrink-0 mb-2">
            <CreditCard className="h-5 w-5 text-[var(--pri)]" />
            <div>
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-[var(--text)]">Gateway Settings</h2>
              <p className="text-[9px] font-bold text-muted mt-0.5">Choose checkout gateway & credentials</p>
            </div>
          </div>

          {/* Enable toggle */}
          <div className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-xl">
            <div className="space-y-0.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text)]">Enable Payments</span>
              <p className="text-[9px] font-bold text-muted">Collect fees at checkout</p>
            </div>
            <button
              type="button"
              onClick={() => setPaymentEnabled(!paymentEnabled)}
              className={`h-6 w-11 rounded-full p-1 transition-colors duration-300 focus:outline-none ${
                paymentEnabled ? 'bg-[var(--pri)]' : 'bg-white/10'
              }`}
            >
              <div
                className={`h-4 w-4 rounded-full bg-white transition-transform duration-300 ${
                  paymentEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {paymentEnabled && (
            <>
              {/* Active gateway selection */}
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase tracking-[0.2em] text-muted block">Payment Gateway</label>
                <select
                  value={activeGateway}
                  onChange={e => setActiveGateway(e.target.value)}
                  className="w-full h-11 px-4 bg-[#080912] border border-white/10 rounded-xl text-xs font-bold text-[var(--text)] focus:border-[var(--pri)]/50 focus:ring-0 focus:outline-none cursor-pointer"
                >
                  <option value="simulated" className="bg-[var(--base)] text-[var(--text)]">Simulation Sandbox (Mock)</option>
                </select>
              </div>

              {/* Auto Approve Toggle */}
              <div className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-xl">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text)]">Auto-Approve Paid</span>
                  <p className="text-[9px] font-bold text-muted">Verify & approve instantly</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoApprovePaid(!autoApprovePaid)}
                  className={`h-6 w-11 rounded-full p-1 transition-colors duration-300 focus:outline-none ${
                    autoApprovePaid ? 'bg-[var(--pri)]' : 'bg-white/10'
                  }`}
                >
                  <div
                    className={`h-4 w-4 rounded-full bg-white transition-transform duration-300 ${
                      autoApprovePaid ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </>
          )}

          <div className="pt-4 border-t border-white/5 shrink-0 mt-4">
            <button
              onClick={handleSaveConfig}
              disabled={saving}
              className="flex items-center justify-center gap-2.5 w-full h-11 bg-[var(--pri)] hover:bg-[var(--pri-hover)] text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50 transition-all shadow-lg shadow-[var(--pri)]/20 cursor-pointer"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Transactions Panel ── */}
      <div className="lg:col-span-2 flex flex-col min-h-0 h-full overflow-hidden space-y-4">
        <div className="flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text)]">Transaction History</span>
            <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-white/5 border border-white/5 text-muted">
              {filteredTransactions.length} items
            </span>
          </div>
          
          <button
            onClick={loadTransactions}
            className="p-2 bg-white/5 border border-white/5 text-muted hover:text-[var(--text)] rounded-lg hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
            title="Refresh Transactions"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingTx ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Search bar */}
        <div className="relative shrink-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted" />
          <input
            type="text"
            placeholder="Search by name, email, gateway ID..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-10 pr-4 bg-white/5 border border-white/5 rounded-xl text-xs font-bold text-[var(--text)] placeholder:text-muted/40 focus:border-[var(--pri)]/50 focus:ring-0 focus:outline-none"
          />
        </div>

        {/* Transactions Table Card */}
        <div className="glass-card rounded-[2rem] border border-white/5 overflow-hidden flex-1 min-h-0 flex flex-col bg-[var(--surf)]/20">
          <div className="flex-1 overflow-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white/5 border-b border-white/5 sticky top-0 z-20">
                  <th className="px-5 py-4 text-[9px] font-black uppercase tracking-[0.25em] text-muted bg-[#141318] sticky top-0 z-20">Attendee / Email</th>
                  <th className="px-4 py-4 text-[9px] font-black uppercase tracking-[0.25em] text-muted bg-[#141318] sticky top-0 z-20">Amount</th>
                  <th className="px-4 py-4 text-[9px] font-black uppercase tracking-[0.25em] text-muted bg-[#141318] sticky top-0 z-20">Method</th>
                  <th className="px-4 py-4 text-[9px] font-black uppercase tracking-[0.25em] text-muted bg-[#141318] sticky top-0 z-20">Gateway ID</th>
                  <th className="px-4 py-4 text-[9px] font-black uppercase tracking-[0.25em] text-muted bg-[#141318] sticky top-0 z-20">Status</th>
                  <th className="px-5 py-4 text-[9px] font-black uppercase tracking-[0.25em] text-muted bg-[#141318] sticky top-0 z-20">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {loadingTx ? (
                  <tr>
                    <td colSpan={6} className="text-center py-20 text-xs font-black uppercase tracking-widest text-muted/50 animate-pulse bg-transparent">
                      Fetching Transactions...
                    </td>
                  </tr>
                ) : filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-20 text-xs font-bold text-muted/55 bg-transparent">
                      No transactions recorded.
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map(tx => (
                    <tr key={tx.id} className="hover:bg-white/[0.01] transition-all">
                      <td className="px-5 py-3">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-[var(--text)]">{tx.registration_name || 'Anonymous'}</span>
                          <span className="text-[9px] font-bold text-muted mt-0.5">{tx.registration_email || '—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="text-xs font-black text-[#E8EAFF]">
                            {tx.currency} {tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                          {tx.discount_applied > 0 && (
                            <span className="text-[8px] font-black text-emerald-400 uppercase tracking-wider">
                              Saved {tx.currency} {tx.discount_applied}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 bg-white/5 border border-white/5 rounded-full text-muted">
                          {tx.payment_method}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-[9px] text-muted block truncate max-w-[140px]" title={tx.gateway_payment_id || '—'}>
                          {tx.gateway_payment_id || tx.gateway_order_id || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {tx.status === 'completed' ? (
                            <>
                              <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                              <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400">Success</span>
                            </>
                          ) : (
                            <>
                              <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                              <span className="text-[9px] font-black uppercase tracking-wider text-amber-400">{tx.status}</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-[9px] font-bold text-muted">
                          {new Date(tx.created_at).toLocaleDateString()} {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
