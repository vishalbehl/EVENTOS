"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { 
  useAdminOrgs, useOrgEvents, useCreateQuote, useUpdateQuote, 
  useQuoteDetail, usePricingRulesCatalog, useServiceRequestPlanning, 
  useAllQuotes 
} from "@/services/super-admin-service"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { 
  ArrowLeft, Plus, Trash2, Edit, Save, Calculator, Check, 
  ChevronRight, Calendar, MapPin, Users, HelpCircle, AlertTriangle 
} from "lucide-react"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"
import { formatIST, formatLakhRupee } from "@/lib/formatters"
import { toast } from "sonner"

interface QuoteFormProps {
  quoteId?: string
}

export default function QuoteForm({ quoteId }: QuoteFormProps) {
  const router = useRouter()
  const isEditMode = !!quoteId

  // Fetch lists
  const { data: orgs = [] } = useAdminOrgs()
  const { data: pricingRules = [] } = usePricingRulesCatalog()

  // Fetch quote detail if edit mode
  const { data: initialQuote, isLoading: quoteLoading } = useQuoteDetail(quoteId || "")

  // Mutations
  const createQuoteMutation = useCreateQuote()
  const updateQuoteMutation = useUpdateQuote(quoteId || "")

  // Form State
  const [step, setStep] = useState(1)
  const [eventId, setEventId] = useState("")
  const { data: resourcePlan } = useServiceRequestPlanning(eventId)

  const [eventName, setEventName] = useState("")
  const [selectedOrgId, setSelectedOrgId] = useState("")
  const [venue, setVenue] = useState("")
  const [dates, setDates] = useState({ start: "", end: "" })
  const [attendees, setAttendees] = useState(1000)
  const [validityDays, setValidityDays] = useState(30)
  const [currency, setCurrency] = useState("INR")
  const [internalNotes, setInternalNotes] = useState("")
  
  const [lineItems, setLineItems] = useState<any[]>([])
  const [margins, setMargins] = useState<any[]>([
    { category: "Hardware", margin_percent: 15 },
    { category: "Staffing", margin_percent: 20 },
    { category: "Logistics", margin_percent: 10 }
  ])

  // Custom Item Form State
  const [showCustomForm, setShowCustomForm] = useState(false)
  const [customItem, setCustomItem] = useState({
    category: "Hardware",
    service_name: "",
    description: "",
    quantity: 1,
    duration_days: 1,
    unit_rate: 0
  })

  // Catalog Drawer Modal
  const [showCatalogModal, setShowCatalogModal] = useState(false)

  // Step 3 state
  const [selectedPricingRule, setSelectedPricingRule] = useState("")
  const [discountPercent, setDiscountPercent] = useState(0)

  // Prepopulate form if editing
  useEffect(() => {
    if (isEditMode && initialQuote) {
      setEventId(initialQuote.request_id || "")
      setEventName(initialQuote.event_name || "")
      setSelectedOrgId(initialQuote.organization_id || "")
      setVenue(initialQuote.venue || "Grand Plenary Suite")
      setValidityDays(initialQuote.validity_days || 30)
      setCurrency(initialQuote.currency || "INR")
      setInternalNotes(initialQuote.internal_notes || "")
      if (initialQuote.line_items) setLineItems(initialQuote.line_items)
      if (initialQuote.margins) setMargins(initialQuote.margins)
    }
  }, [isEditMode, initialQuote])

  // Import line items from linked resource plan
  useEffect(() => {
    if (resourcePlan && lineItems.length === 0) {
      const planItems: any[] = []
      // Add hardware items
      if (resourcePlan.hardware) {
        resourcePlan.hardware.forEach((hw: any) => {
          planItems.push({
            category: "Hardware",
            service_name: hw.item_name,
            description: hw.specification || "",
            quantity: hw.quantity,
            duration_days: 1,
            unit_rate: hw.unit_cost
          })
        })
      }
      // Add staff roles
      if (resourcePlan.staff) {
        resourcePlan.staff.forEach((st: any) => {
          planItems.push({
            category: "Staffing",
            service_name: st.role,
            description: "Onsite technical operations support",
            quantity: st.quantity,
            duration_days: st.days,
            unit_rate: st.cost_per_day
          })
        })
      }
      setLineItems(planItems)
    }
  }, [resourcePlan])

  // Calculations
  const calculatedSummary = useMemo(() => {
    let subTotal = 0
    let staffing = 0
    let hardware = 0
    let logistics = 15000 // default mock logistics & others

    lineItems.forEach(li => {
      const itemTotal = li.quantity * li.duration_days * li.unit_rate
      subTotal += itemTotal
      if (li.category === "Staffing") staffing += itemTotal
      if (li.category === "Hardware") hardware += itemTotal
    })

    // Compute Margins
    let totalMarginVal = 0
    margins.forEach(m => {
      let catSum = 0
      lineItems.forEach(li => {
        if (li.category === m.category) {
          catSum += li.quantity * li.duration_days * li.unit_rate
        }
      })
      const mVal = catSum * (m.margin_percent / 100)
      m.margin_amount = mVal
      totalMarginVal += mVal
    })

    const contingency = subTotal * 0.05
    const managementFee = subTotal * 0.10
    const subTotalWithExtras = subTotal + logistics + contingency + managementFee + totalMarginVal
    
    // Apply discount
    const discountVal = subTotalWithExtras * (discountPercent / 100)
    const gst = (subTotalWithExtras - discountVal) * 0.18
    const totalAmount = (subTotalWithExtras - discountVal) + gst
    
    // Profit margin percentage
    const profitMarginPct = totalAmount > 0 ? (totalMarginVal / totalAmount) * 100 : 0

    return {
      subTotal,
      staffing,
      hardware,
      logistics,
      contingency,
      managementFee,
      totalMarginVal,
      gst,
      discountVal,
      totalAmount,
      profitMarginPct
    }
  }, [lineItems, margins, discountPercent])

  // Donut chart cost vs margin segments
  const donutData = useMemo(() => {
    return [
      { name: "Direct Cost", value: calculatedSummary.subTotal },
      { name: "Margins & Fees", value: calculatedSummary.totalMarginVal + calculatedSummary.managementFee }
    ]
  }, [calculatedSummary])

  const COLORS = ["#8B5CF6", "#F59E0B"]

  // Add Custom Item to line items
  const handleAddCustomItem = () => {
    if (!customItem.service_name) return
    setLineItems(prev => [...prev, { ...customItem }])
    setShowCustomForm(false)
    setCustomItem({
      category: "Hardware",
      service_name: "",
      description: "",
      quantity: 1,
      duration_days: 1,
      unit_rate: 0
    })
  }

  // Remove Line Item
  const handleRemoveItem = (index: number) => {
    setLineItems(prev => prev.filter((_, i) => i !== index))
  }

  // Save Quote
  const handleSave = async (statusOverride?: string) => {
    const payload = {
      request_id: eventId || null,
      version: initialQuote?.version || "1.0",
      status: statusOverride || "DRAFT",
      internal_notes: internalNotes,
      validity_days: validityDays,
      currency: currency,
      line_items: lineItems,
      margins: margins
    }

    if (isEditMode) {
      await updateQuoteMutation.mutateAsync(payload)
      router.push(`/service-requests`)
    } else {
      await createQuoteMutation.mutateAsync(payload)
      router.push(`/service-requests`)
    }
  }

  // Next Step validation
  const nextStep = () => {
    if (step === 1 && lineItems.length === 0) {
      toast.warning("Please add at least one line item before proceeding.")
      return
    }
    setStep(prev => prev + 1)
  }

  return (
    <PageContainer>
      {/* Top Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-xl font-black text-primary">
              {isEditMode ? `Edit Quote: ${initialQuote?.quote_number || "QTE-..."}` : "Create New Quote"}
            </h2>
            <p className="text-[10px] text-tertiary">Quotes / Build commercials quote sheet</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => handleSave("DRAFT")} className="text-xs h-9">
            Save as Draft
          </Button>
          <Button 
            onClick={() => {
              if (step < 4) {
                nextStep()
              } else {
                handleSave("SENT")
              }
            }} 
            className="bg-brand-primary text-white text-xs font-bold h-9 px-4 rounded-xl hover:bg-brand-primary/95"
          >
            {step === 4 ? "Preview & Send" : "Next Step"}
          </Button>
        </div>
      </div>

      {/* Step Wizard Bar */}
      <div className="flex gap-1.5 border-b border-border/60 pb-3 mb-6 overflow-x-auto">
        {[
          { num: 1, label: "Event & Scope" },
          { num: 2, label: "Services & Resources" },
          { num: 3, label: "Commercials" },
          { num: 4, label: "Review & Send" }
        ].map(s => {
          const isPassed = step > s.num
          const isActive = step === s.num
          return (
            <button
              key={s.num}
              onClick={() => isPassed && setStep(s.num)}
              disabled={!isPassed && !isActive}
              className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all whitespace-nowrap flex items-center gap-1.5
                ${isActive ? "bg-brand-primary border-brand-primary text-white" : 
                  isPassed ? "bg-surface-2 border-border text-primary cursor-pointer" : 
                  "bg-surface-2 border-border text-tertiary cursor-not-allowed"}`}
            >
              <span className={`h-4.5 w-4.5 rounded-full text-[9px] font-black border flex items-center justify-center shrink-0
                ${isActive ? "bg-white text-brand-primary border-white" : "border-tertiary text-tertiary"}`}>
                {s.num}
              </span>
              {s.label}
            </button>
          )
        })}
      </div>

      {/* Wizard Step Panel Contents */}
      {step === 1 && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          
          {/* Left Panel: Event Summary */}
          <div className="xl:col-span-3 space-y-4">
            <Card className="p-5 rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-default)] space-y-4">
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary block border-b border-border/40 pb-2">
                Event Summary
              </span>
              
              <div className="space-y-3.5 text-xs font-semibold text-secondary">
                <div>
                  <label className="text-[9px] text-tertiary block mb-1">Event Name</label>
                  <Input 
                    value={eventName}
                    onChange={e => setEventName(e.target.value)}
                    placeholder="e.g. IT Summit"
                    className="bg-surface-2 border-border text-xs h-8"
                  />
                </div>

                <div>
                  <label className="text-[9px] text-tertiary block mb-1">Organisation</label>
                  <select
                    value={selectedOrgId}
                    onChange={e => setSelectedOrgId(e.target.value)}
                    className="w-full bg-surface-2 border border-border text-xs rounded-xl px-3 py-1.5 text-primary outline-none"
                  >
                    <option value="">Select Organisation</option>
                    {orgs.map((org: any) => (
                      <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[9px] text-tertiary block mb-1">Venue Location</label>
                  <Input 
                    value={venue}
                    onChange={e => setVenue(e.target.value)}
                    className="bg-surface-2 border-border text-xs h-8"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] text-tertiary block mb-1">Validity (Days)</label>
                    <Input 
                      type="number"
                      value={validityDays}
                      onChange={e => setValidityDays(parseInt(e.target.value) || 30)}
                      className="bg-surface-2 border-border text-xs h-8"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-tertiary block mb-1">Currency</label>
                    <select
                      value={currency}
                      onChange={e => setCurrency(e.target.value)}
                      className="w-full bg-surface-2 border border-border text-xs rounded-xl px-2 py-1.5 text-primary outline-none"
                    >
                      <option value="INR">INR (₹)</option>
                      <option value="USD">USD ($)</option>
                    </select>
                  </div>
                </div>
              </div>
            </Card>

            {/* Services Included list below left panel */}
            <Card className="p-5 rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-default)] space-y-3">
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary block">
                Services Included
              </span>
              <div className="space-y-1.5">
                {Array.from(new Set(lineItems.map(li => li.category))).map((cat, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 text-[10px] text-secondary font-bold">
                    <Check className="h-3.5 w-3.5 text-success" />
                    <span>{cat}</span>
                  </div>
                ))}
                {lineItems.length === 0 && (
                  <span className="text-[9px] text-tertiary block">No services configured yet.</span>
                )}
              </div>
            </Card>
          </div>

          {/* Middle Panel: Selected Services Line Items */}
          <div className="xl:col-span-6 space-y-4">
            <Card className="p-6 rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-default)] space-y-4">
              <div className="flex justify-between items-center border-b border-border/40 pb-2">
                <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary">
                  Selected Quote Line Items
                </span>
                <div className="flex items-center gap-2">
                  <Button 
                    onClick={() => setShowCustomForm(true)} 
                    variant="outline" 
                    size="sm" 
                    className="text-[10px] h-7 gap-1 border-border bg-surface-2 text-secondary"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Custom
                  </Button>
                </div>
              </div>

              {/* Line Items Table */}
              <div className="overflow-hidden border border-border/40 rounded-2xl text-xs font-semibold text-secondary">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-2 border-b border-border text-secondary">
                      <th className="p-2.5">Service Name</th>
                      <th className="p-2.5 text-center w-16">Qty</th>
                      <th className="p-2.5 text-center w-16">Days</th>
                      <th className="p-2.5 text-right w-24">Rate</th>
                      <th className="p-2.5 text-right w-24">Total</th>
                      <th className="p-2.5 text-center w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((li, idx) => (
                      <tr key={idx} className="border-b border-border/20 hover:bg-surface-hover/10">
                        <td className="p-2.5">
                          <span className="text-primary font-bold block">{li.service_name}</span>
                          <span className="text-[9px] text-tertiary block truncate max-w-[200px]">{li.description}</span>
                        </td>
                        <td className="p-2.5 text-center font-mono">
                          <input
                            type="number"
                            value={li.quantity}
                            onChange={e => {
                              const val = parseInt(e.target.value) || 0
                              setLineItems(prev => prev.map((item, i) => i === idx ? { ...item, quantity: val } : item))
                            }}
                            className="w-10 bg-transparent text-center border-b border-border font-mono text-xs focus:border-brand-primary outline-none"
                          />
                        </td>
                        <td className="p-2.5 text-center font-mono">
                          <input
                            type="number"
                            value={li.duration_days}
                            onChange={e => {
                              const val = parseInt(e.target.value) || 0
                              setLineItems(prev => prev.map((item, i) => i === idx ? { ...item, duration_days: val } : item))
                            }}
                            className="w-10 bg-transparent text-center border-b border-border font-mono text-xs focus:border-brand-primary outline-none"
                          />
                        </td>
                        <td className="p-2.5 text-right font-mono">
                          <input
                            type="number"
                            value={li.unit_rate}
                            onChange={e => {
                              const val = parseFloat(e.target.value) || 0
                              setLineItems(prev => prev.map((item, i) => i === idx ? { ...item, unit_rate: val } : item))
                            }}
                            className="w-16 bg-transparent text-right border-b border-border font-mono text-xs focus:border-brand-primary outline-none"
                          />
                        </td>
                        <td className="p-2.5 text-right font-mono text-primary font-bold">
                          ₹{(li.quantity * li.duration_days * li.unit_rate).toLocaleString()}
                        </td>
                        <td className="p-2.5 text-center">
                          <button onClick={() => handleRemoveItem(idx)} className="text-tertiary hover:text-danger">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {lineItems.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-[10px] text-tertiary">No line items configured. Use Add Custom or add template resources.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Inline Custom Item row form */}
              {showCustomForm && (
                <div className="p-4 rounded-2xl bg-surface-2 border border-border space-y-3">
                  <span className="text-[9px] uppercase tracking-wider font-extrabold text-secondary block">New Custom Line Item</span>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-semibold text-secondary">
                    <div>
                      <label className="text-[8px] text-tertiary block mb-1">Category</label>
                      <select
                        value={customItem.category}
                        onChange={e => setCustomItem(prev => ({ ...prev, category: e.target.value }))}
                        className="w-full bg-surface-3 border border-border text-xs rounded-xl px-2 py-1 outline-none"
                      >
                        <option value="Hardware">Hardware</option>
                        <option value="Staffing">Staffing</option>
                        <option value="Logistics">Logistics</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[8px] text-tertiary block mb-1">Item Name</label>
                      <Input
                        value={customItem.service_name}
                        onChange={e => setCustomItem(prev => ({ ...prev, service_name: e.target.value }))}
                        className="bg-surface-3 border-border h-7 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[8px] text-tertiary block mb-1">Quantity</label>
                      <Input
                        type="number"
                        value={customItem.quantity}
                        onChange={e => setCustomItem(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
                        className="bg-surface-3 border-border h-7 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[8px] text-tertiary block mb-1">Unit Rate</label>
                      <Input
                        type="number"
                        value={customItem.unit_rate}
                        onChange={e => setCustomItem(prev => ({ ...prev, unit_rate: parseFloat(e.target.value) || 0 }))}
                        className="bg-surface-3 border-border h-7 text-xs font-mono"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button onClick={() => setShowCustomForm(false)} variant="ghost" size="sm" className="text-[10px] h-7">Cancel</Button>
                    <Button onClick={handleAddCustomItem} className="bg-brand-primary text-white text-[10px] h-7">Add Item</Button>
                  </div>
                </div>
              )}
            </Card>

            {/* Internal Notes free-text box */}
            <Card className="p-5 rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-default)] space-y-2">
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary block">
                Internal Notes (Hidden from customer)
              </span>
              <textarea
                value={internalNotes}
                onChange={e => setInternalNotes(e.target.value)}
                placeholder="Specify private negotiation notes or special approvals history logs..."
                className="w-full h-20 bg-surface-2 border border-border rounded-2xl p-3 text-xs text-primary outline-none focus:border-brand-primary"
              />
            </Card>
          </div>

          {/* Right Panel: Cost Summary and Donut Chart */}
          <div className="xl:col-span-3 space-y-4">
            <Card className="p-5 rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-default)] space-y-4">
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary block border-b border-border/40 pb-2">
                Quote Breakdown
              </span>

              {/* Chart representation */}
              <div className="h-32 flex items-center justify-center relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={20}
                      outerRadius={30}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {donutData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => `₹${v.toLocaleString()}`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Summary calculations grid */}
              <div className="space-y-2.5 text-[10px] text-secondary font-bold border-t border-border/40 pt-4">
                <div className="flex justify-between">
                  <span>Sub Total Cost:</span>
                  <span className="text-primary font-mono">₹{calculatedSummary.subTotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Staffing Crew Cost:</span>
                  <span className="text-primary font-mono">₹{calculatedSummary.staffing.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Logistics & Admin:</span>
                  <span className="text-primary font-mono">₹{calculatedSummary.logistics.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>GST Taxes (18%):</span>
                  <span className="text-primary font-mono">₹{calculatedSummary.gst.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs text-primary font-black border-t border-border pt-2.5">
                  <span>Quote Total Amount:</span>
                  <span className="font-mono text-brand-primary">{formatLakhRupee(calculatedSummary.totalAmount)}</span>
                </div>
                <div className="flex justify-between text-[9px] text-tertiary">
                  <span>Expected Gross Margin:</span>
                  <span className="font-mono">{calculatedSummary.profitMarginPct.toFixed(1)}%</span>
                </div>
              </div>
            </Card>
          </div>

        </div>
      )}

      {step === 2 && (
        <Card className="p-6 rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-default)] space-y-4">
          <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary block border-b border-border/40 pb-2">
            Detailed Services & Resource Breakdown
          </span>

          <div className="space-y-4">
            {["Hardware", "Staffing"].map(category => {
              const catItems = lineItems.filter(li => li.category === category)
              return (
                <div key={category} className="border border-border/60 rounded-2xl overflow-hidden text-xs">
                  <div className="bg-surface-2 p-3 font-bold border-b border-border text-secondary flex justify-between">
                    <span className="uppercase tracking-wider">{category} Resources</span>
                    <span>{catItems.length} items allocated</span>
                  </div>
                  <div className="divide-y divide-border/20">
                    {catItems.map((item, idx) => (
                      <div key={idx} className="p-3 grid grid-cols-1 md:grid-cols-4 items-center gap-4 text-secondary font-semibold">
                        <span className="font-bold text-primary">{item.service_name}</span>
                        <span>Quantity: <strong>{item.quantity}</strong></span>
                        <span>Duration/Days: <strong>{item.duration_days}</strong></span>
                        <span className="text-right text-primary font-mono font-bold">₹{(item.quantity * item.duration_days * item.unit_rate).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {step === 3 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          <div className="lg:col-span-8 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-6 space-y-6">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary block border-b border-border/40 pb-2">
              Margins & Discount Controls
            </span>

            <div className="space-y-4">
              <span className="text-xs font-bold text-primary block">Category-Wise Profits Config</span>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {margins.map((m, idx) => (
                  <Card key={idx} className="p-4 bg-surface-2 border border-border/60 rounded-2xl space-y-2.5">
                    <span className="text-[9px] uppercase font-extrabold text-secondary block">{m.category} Markup</span>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={m.margin_percent}
                        onChange={e => {
                          const val = parseFloat(e.target.value) || 0
                          setMargins(prev => prev.map((item, i) => i === idx ? { ...item, margin_percent: val } : item))
                        }}
                        className="h-8 text-xs font-mono"
                      />
                      <span className="text-xs text-secondary font-bold">%</span>
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-border/30">
              <div>
                <label className="text-[10px] uppercase text-secondary font-extrabold block mb-1.5">Apply Pricing Rule Rule</label>
                <select
                  value={selectedPricingRule}
                  onChange={e => setSelectedPricingRule(e.target.value)}
                  className="w-full bg-surface-2 border border-border text-xs rounded-xl px-3 py-2 text-primary outline-none"
                >
                  <option value="">Select Pricing Rule</option>
                  {pricingRules.map((rule: any) => (
                    <option key={rule.id} value={rule.id}>{rule.name} ({rule.markup_value}% {rule.markup_type})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase text-secondary font-extrabold block mb-1.5">Special Discount %</label>
                <Input
                  type="number"
                  value={discountPercent}
                  onChange={e => setDiscountPercent(parseFloat(e.target.value) || 0)}
                  className="bg-surface-2 border-border text-xs"
                />
                {discountPercent > 15 && (
                  <span className="text-[9px] text-danger font-bold flex items-center gap-1 mt-1">
                    <AlertTriangle className="h-3.5 w-3.5 text-danger animate-pulse" />
                    Discounts above 15% auto-trigger Management Approval workflow!
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-4 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-5 space-y-4">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary block">Tax Settings</span>
            <div className="space-y-3.5 text-xs text-secondary font-semibold">
              <div className="flex justify-between"><span>Base Tax Code:</span> <span className="text-primary">GST-18%</span></div>
              <div className="flex justify-between"><span>Calculated Tax Value:</span> <span className="text-primary font-mono">₹{calculatedSummary.gst.toLocaleString()}</span></div>
              <div className="flex justify-between text-brand-primary font-bold"><span>Total Net Quote Amount:</span> <span className="font-mono">{formatLakhRupee(calculatedSummary.totalAmount)}</span></div>
            </div>
          </div>

        </div>
      )}

      {step === 4 && (
        <Card className="p-6 rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-default)] space-y-6">
          <div className="border-b border-border pb-3 flex justify-between items-center">
            <div>
              <span className="text-[9px] uppercase tracking-wider font-extrabold text-secondary">Final Step</span>
              <h3 className="text-sm font-black text-primary">Read-Only Document Preview</h3>
            </div>
            <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[8px] uppercase tracking-wider font-black">
              DRAFT
            </Badge>
          </div>

          <div className="space-y-4 text-xs font-semibold text-secondary">
            <div className="grid grid-cols-2 gap-4">
              <div><span>Event Name:</span> <strong className="text-primary">{eventName}</strong></div>
              <div><span>Target Venue:</span> <strong className="text-primary">{venue}</strong></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><span>Validity:</span> <strong className="text-primary">{validityDays} Days</strong></div>
              <div><span>Currency Code:</span> <strong className="text-primary">{currency}</strong></div>
            </div>

            <div className="border border-border/40 rounded-2xl overflow-hidden mt-4">
              <table className="w-full text-left border-collapse">
                <thead className="bg-surface-2 border-b border-border">
                  <tr className="text-secondary text-[10px]">
                    <th className="p-2.5">Service Name</th>
                    <th className="p-2.5 text-center">Qty</th>
                    <th className="p-2.5 text-right">Unit Rate</th>
                    <th className="p-2.5 text-right">Total Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((li, idx) => (
                    <tr key={idx} className="border-b border-border/20 text-secondary">
                      <td className="p-2.5">{li.service_name}</td>
                      <td className="p-2.5 text-center">{li.quantity}</td>
                      <td className="p-2.5 text-right font-mono">₹{li.unit_rate.toLocaleString()}</td>
                      <td className="p-2.5 text-right font-mono text-primary font-bold">₹{(li.quantity * li.duration_days * li.unit_rate).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-4 border-t border-border">
              <div className="w-64 space-y-2 text-[10px] text-secondary font-bold">
                <div className="flex justify-between"><span>Sub Total:</span> <span className="text-primary font-mono">₹{calculatedSummary.subTotal.toLocaleString()}</span></div>
                <div className="flex justify-between"><span>Markup Margins:</span> <span className="text-primary font-mono">₹{calculatedSummary.totalMarginVal.toLocaleString()}</span></div>
                <div className="flex justify-between"><span>GST Taxes (18%):</span> <span className="text-primary font-mono">₹{calculatedSummary.gst.toLocaleString()}</span></div>
                <div className="flex justify-between text-xs text-primary font-black border-t border-border pt-2">
                  <span>Grand Total:</span>
                  <span className="font-mono text-brand-primary">{formatLakhRupee(calculatedSummary.totalAmount)}</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}
    </PageContainer>
  )
}
