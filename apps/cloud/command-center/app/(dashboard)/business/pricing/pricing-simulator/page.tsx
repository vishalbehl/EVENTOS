"use client"
import { useState, useMemo, useEffect } from "react"
import { usePricingRules, useRunPricingSimulation, useHardwareCatalog, useStaffCatalog, useCatalogTemplates, formatINR, usePricingSimulations } from "@/services/super-admin-service"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Trash2, Plus, Minus, Sparkles, RefreshCw, Save, FileText, CheckCircle2, Search, X, Check, ArrowRight, ArrowLeft, Percent, Printer, Layout, Users, Grid, Network } from "lucide-react"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"
import { toast } from "sonner"

type SelectedTemplateConfig = {
  selected: boolean
  params: {
    attendees?: number
    counters?: number
    kiosks?: number
    days?: number
    preview_stations?: number
    upload_stations?: number
    speakers?: number
    rooms?: number
    capacity?: number
    access_points?: number
  }
}

interface AggregatedHardwareItem {
  id: string
  name: string
  category: string
  qty: number
  unit: string
  sources: string[]
}

interface AggregatedStaffItem {
  id: string
  name: string
  dept: string
  qty: number
  days: number
  sources: string[]
}

export default function PricingSimulatorPage() {
  const { data: rules = [] } = usePricingRules()
  const { data: hardwareData } = useHardwareCatalog({ limit: 100 })
  const { data: staffData } = useStaffCatalog({ limit: 100 })
  const { data: templatesData } = useCatalogTemplates()
  const { refetch: refetchSimulations } = usePricingSimulations()
  const runSimulation = useRunPricingSimulation()

  const [currentStep, setCurrentStep] = useState(1)
  const [activeCategory, setActiveCategory] = useState<"room" | "registration" | "srr" | "network">("registration")

  // Standalone Add-ons selection state (quantities)
  const [addons, setAddons] = useState<Record<string, number>>({
    "extra-kiosk": 0,
    "extra-printer": 0,
    "extra-technician": 0,
    "vip-lead": 0,
    "extra-ap": 0
  })

  // Predefined Add-ons details
  const addonsCatalog = [
    { id: "extra-kiosk", name: "Extra iPad check-in kiosk", rate: 2200, unit: "Nos", desc: "Additional self-service QR ticket scanner & iPad stand" },
    { id: "extra-printer", name: "Heavy-Duty Thermal badge printer", rate: 2600, unit: "Nos", desc: "Zebra thermal label printer for high-speed badge dispensing" },
    { id: "extra-technician", name: "On-site IT support technician", rate: 3000, unit: "Nos", desc: "On-site engineer for network setup, printer configuration, and tech support" },
    { id: "vip-lead", name: "VIP Helpdesk Crew Supervisor", rate: 6000, unit: "Nos", desc: "Dedicated logistics lead managing checking counters & queue flows" },
    { id: "extra-ap", name: "Venue-wide Wi-Fi Access Point", rate: 1200, unit: "Nos", desc: "Ceiling-mount high-density backup wireless transceiver" }
  ]

  // Global inputs
  const [inputs, setInputs] = useState({
    event_city_tier: "Tier 1 - Metro City",
    event_days: 3,
    simulationName: "Simulation Run - " + new Date().toLocaleDateString(),
    preparedBy: "Super Admin",
    customer: "Venue Corp Client",
    refNumber: "SIM-" + Math.floor(Math.random() * 90000 + 10000),
    notes: ""
  })

  // Selected templates and their parameters
  const [selectedTemplates, setSelectedTemplates] = useState<Record<string, SelectedTemplateConfig>>({})

  // Margins parameters
  const [margins, setMargins] = useState({
    overhead_pct: 10,
    contingency_pct: 5,
    margin_pct: 15,
    discount_pct: 0
  })

  // Save Modal state
  const [showSaveModal, setShowSaveModal] = useState(false)

  // Lists
  const hardwareList = useMemo(() => hardwareData?.items ?? [], [hardwareData])
  const staffRolesList = useMemo(() => staffData?.items ?? [], [staffData])

  const roomTemplates = templatesData?.room_templates ?? []
  const registrationTemplates = templatesData?.registration_templates ?? []
  const srrTemplates = templatesData?.srr_templates ?? []
  const networkTemplates = templatesData?.network_templates ?? []

  const allTemplatesList = useMemo(() => {
    return [...roomTemplates, ...registrationTemplates, ...srrTemplates, ...networkTemplates]
  }, [roomTemplates, registrationTemplates, srrTemplates, networkTemplates])

  const activeTemplatesList = useMemo(() => {
    switch (activeCategory) {
      case "room": return roomTemplates
      case "registration": return registrationTemplates
      case "srr": return srrTemplates
      case "network": return networkTemplates
      default: return []
    }
  }, [activeCategory, roomTemplates, registrationTemplates, srrTemplates, networkTemplates])

  // Initialize templates configurations
  useEffect(() => {
    if (allTemplatesList.length > 0 && Object.keys(selectedTemplates).length === 0) {
      const initial: typeof selectedTemplates = {}
      allTemplatesList.forEach((t: any) => {
        initial[t.slug] = {
          selected: t.is_default || false,
          params: {
            attendees: t.specs?.min_attendees ?? 1000,
            counters: t.specs?.reg_counters ?? 4,
            kiosks: t.specs?.kiosks ?? 2,
            days: t.specs?.event_days ?? inputs.event_days,
            preview_stations: t.specs?.preview_stations ?? 8,
            upload_stations: t.specs?.upload_stations ?? 4,
            speakers: t.specs?.min_speakers ?? 50,
            rooms: t.specs?.rooms ?? 6,
            capacity: t.specs?.default_capacity ?? 100,
            access_points: t.specs?.access_points ?? 8
          }
        }
      })
      setSelectedTemplates(initial)
    }
  }, [allTemplatesList])

  const toggleTemplateSelection = (slug: string) => {
    setSelectedTemplates(prev => {
      const current = prev[slug]
      if (!current) return prev
      return {
        ...prev,
        [slug]: {
          ...current,
          selected: !current.selected
        }
      }
    })
  }

  const updateTemplateParam = (slug: string, key: string, value: any) => {
    setSelectedTemplates(prev => {
      const current = prev[slug]
      if (!current) return prev
      return {
        ...prev,
        [slug]: {
          ...current,
          params: {
            ...current.params,
            [key]: value
          }
        }
      }
    })
  }

  // Dynamic cost helper maps
  const hardwarePricesMap = useMemo(() => {
    const m: Record<string, number> = {}
    hardwareList.forEach((h: any) => {
      m[h.id] = h.selling_price || h.renting_price || 0
    })
    return m
  }, [hardwareList])

  const staffPricesMap = useMemo(() => {
    const m: Record<string, number> = {}
    staffRolesList.forEach((s: any) => {
      m[s.id] = s.selling_per_day || s.daily_rate || 0
    })
    return m
  }, [staffRolesList])

  // Aggregated allocations from selected templates and standalone add-ons
  const aggregatedHardware = useMemo(() => {
    const map: Record<string, AggregatedHardwareItem> = {}
    
    // 1. Templates hardware
    Object.entries(selectedTemplates).forEach(([slug, config]) => {
      if (!config.selected) return
      const tpl = allTemplatesList.find((t: any) => t.slug === slug)
      if (!tpl) return

      let factor = 1
      if (tpl.template_type === "room") {
        factor = Number(config.params.rooms || 1)
      } else if (tpl.template_type === "registration") {
        factor = Math.ceil(Number(config.params.attendees || 1000) / 1000)
      } else if (tpl.template_type === "srr") {
        factor = Math.ceil(Number(config.params.upload_stations || 4) / 4)
      }

      (tpl.hardware_allocation || []).forEach((alloc: any) => {
        const hw = hardwareList.find((h: any) => h.id === alloc.hardware_item_id)
        if (!hw) return
        const qtyToAdd = alloc.quantity * factor
        if (map[hw.id]) {
          const existing = map[hw.id]
          if (existing) {
            existing.qty += qtyToAdd
            if (!existing.sources.includes(tpl.name)) {
              existing.sources.push(tpl.name)
            }
          }
        } else {
          map[hw.id] = {
            id: hw.id,
            name: hw.name,
            category: hw.category_name || "Accessories",
            qty: qtyToAdd,
            unit: hw.pricing_unit || "PER_EVENT",
            sources: [tpl.name]
          }
        }
      })
    })

    // 2. Add-ons hardware
    addonsCatalog.forEach(addon => {
      const qty = addons[addon.id] || 0
      if (qty > 0 && (addon.id.includes("kiosk") || addon.id.includes("printer") || addon.id.includes("ap"))) {
        const key = addon.id
        map[key] = {
          id: key,
          name: addon.name,
          category: "Add-on Extras",
          qty,
          unit: addon.unit,
          sources: ["Standalone Add-on"]
        }
      }
    })

    return Object.values(map)
  }, [selectedTemplates, allTemplatesList, hardwareList, addons])

  const aggregatedStaff = useMemo(() => {
    const map: Record<string, AggregatedStaffItem> = {}
    
    // 1. Templates staff
    Object.entries(selectedTemplates).forEach(([slug, config]) => {
      if (!config.selected) return
      const tpl = allTemplatesList.find((t: any) => t.slug === slug)
      if (!tpl) return

      let factor = 1
      if (tpl.template_type === "room") {
        factor = Number(config.params.rooms || 1)
      } else if (tpl.template_type === "registration") {
        factor = Math.ceil(Number(config.params.attendees || 1000) / 1000)
      } else if (tpl.template_type === "srr") {
        factor = Math.ceil(Number(config.params.upload_stations || 4) / 4)
      }

      const days = Number(config.params.days || inputs.event_days);

      (tpl.staff_allocation || []).forEach((alloc: any) => {
        const st = staffRolesList.find((s: any) => s.id === alloc.staff_role_id)
        if (!st) return
        const qtyToAdd = alloc.quantity * factor
        if (map[st.id]) {
          const existing = map[st.id]
          if (existing) {
            existing.qty += qtyToAdd
            existing.days = Math.max(existing.days, days)
            if (!existing.sources.includes(tpl.name)) {
              existing.sources.push(tpl.name)
            }
          }
        } else {
          map[st.id] = {
            id: st.id,
            name: st.name,
            dept: st.team_category || st.department || "Operations",
            qty: qtyToAdd,
            days: days,
            sources: [tpl.name]
          }
        }
      })
    })

    // 2. Add-ons staff
    addonsCatalog.forEach(addon => {
      const qty = addons[addon.id] || 0
      if (qty > 0 && (addon.id.includes("technician") || addon.id.includes("lead"))) {
        const key = addon.id
        map[key] = {
          id: key,
          name: addon.name,
          dept: "Add-on Operations",
          qty,
          days: inputs.event_days,
          sources: ["Standalone Add-on"]
        }
      }
    })

    return Object.values(map)
  }, [selectedTemplates, allTemplatesList, staffRolesList, inputs.event_days, addons])

  // Costs subtotals
  const costs = useMemo(() => {
    const hwSubtotal = aggregatedHardware.reduce((acc, item) => {
      const addonMatch = addonsCatalog.find(a => a.id === item.id)
      if (addonMatch) {
        return acc + (item.qty * addonMatch.rate * inputs.event_days)
      }
      const price = hardwarePricesMap[item.id] || 0
      return acc + (item.qty * price * inputs.event_days)
    }, 0)

    const staffSubtotal = aggregatedStaff.reduce((acc, item) => {
      const addonMatch = addonsCatalog.find(a => a.id === item.id)
      if (addonMatch) {
        return acc + (item.qty * addonMatch.rate * item.days)
      }
      const price = staffPricesMap[item.id] || 0
      return acc + (item.qty * price * item.days)
    }, 0)

    const baseCost = hwSubtotal + staffSubtotal
    const overhead = baseCost * (margins.overhead_pct / 100)
    const contingency = baseCost * (margins.contingency_pct / 100)
    const profit = baseCost * (margins.margin_pct / 100)
    const discount = baseCost * (margins.discount_pct / 100)
    const preGst = baseCost + overhead + contingency + profit - discount
    const gst = preGst * 0.18
    const grandTotal = preGst + gst

    return {
      hardware: hwSubtotal,
      staff: staffSubtotal,
      base: baseCost,
      overhead,
      contingency,
      profit,
      discount,
      preGst,
      gst,
      total: grandTotal
    }
  }, [aggregatedHardware, aggregatedStaff, hardwarePricesMap, staffPricesMap, margins, inputs.event_days])

  // Pie chart cost ratio data
  const chartData = useMemo(() => {
    const total = costs.total || 1
    return [
      { name: "Hardware", value: Math.round((costs.hardware / total) * 100), color: "#8B5CF6" },
      { name: "Crew Manpower", value: Math.round((costs.staff / total) * 100), color: "#3B82F6" },
      { name: "Overhead & Fees", value: Math.round(((costs.overhead + costs.contingency + costs.profit) / total) * 100), color: "#F59E0B" },
      { name: "GST Taxes", value: Math.round((costs.gst / total) * 100), color: "#10B981" }
    ].filter(i => i.value > 0)
  }, [costs])

  const handleSaveSimulation = async () => {
    const activeRule = rules.find((r) => r.is_default) || rules[0]
    const payload = {
      pricing_rule_id: activeRule?.id || "",
      event_city_tier: inputs.event_city_tier,
      event_days: inputs.event_days,
      attendee_count: Number(selectedTemplates["large-conference-registration"]?.params?.attendees || 1000),
      room_count: Number(selectedTemplates["standard-presentation-room"]?.params?.rooms || 6),
      counter_count: Number(selectedTemplates["large-conference-registration"]?.params?.counters || 4),
      srr_stations: Number(selectedTemplates["16-station-srr"]?.params?.upload_stations || 4),
      selected_hardware: aggregatedHardware.filter(h => !h.id.includes("extra")).map(h => ({ hardware_item_id: h.id, quantity: h.qty })),
      selected_staff: aggregatedStaff.filter(s => !s.id.includes("technician") && !s.id.includes("lead")).map(s => ({ staff_role_id: s.id, quantity: s.qty, days: s.days }))
    }

    await runSimulation.mutateAsync(payload)
    refetchSimulations()
    toast.success("Simulation saved successfully!")
    setShowSaveModal(false)
  }

  const handlePrintPDF = () => {
    const printWindow = window.open("", "_blank")
    if (!printWindow) return

    const itemsHtml = [
      ...aggregatedHardware.map(h => `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #E5E7EB; font-size: 13px;">${h.name} (Hardware)</td>
          <td style="padding: 10px; border-bottom: 1px solid #E5E7EB; font-size: 13px; text-align: center;">${h.qty}</td>
          <td style="padding: 10px; border-bottom: 1px solid #E5E7EB; font-size: 13px; text-align: center;">${inputs.event_days}</td>
          <td style="padding: 10px; border-bottom: 1px solid #E5E7EB; font-size: 13px; text-align: right; font-family: monospace;">₹${(h.id.includes("extra") ? addonsCatalog.find(a => a.id === h.id)?.rate || 0 : hardwarePricesMap[h.id] || 0).toLocaleString()}</td>
          <td style="padding: 10px; border-bottom: 1px solid #E5E7EB; font-size: 13px; text-align: right; font-family: monospace; font-weight: bold;">₹${(h.qty * (h.id.includes("extra") ? addonsCatalog.find(a => a.id === h.id)?.rate || 0 : hardwarePricesMap[h.id] || 0) * inputs.event_days).toLocaleString()}</td>
        </tr>
      `),
      ...aggregatedStaff.map(s => `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #E5E7EB; font-size: 13px;">${s.name} (Crew)</td>
          <td style="padding: 10px; border-bottom: 1px solid #E5E7EB; font-size: 13px; text-align: center;">${s.qty}</td>
          <td style="padding: 10px; border-bottom: 1px solid #E5E7EB; font-size: 13px; text-align: center;">${s.days}</td>
          <td style="padding: 10px; border-bottom: 1px solid #E5E7EB; font-size: 13px; text-align: right; font-family: monospace;">₹${(s.id.includes("technician") || s.id.includes("lead") ? addonsCatalog.find(a => a.id === s.id)?.rate || 0 : staffPricesMap[s.id] || 0).toLocaleString()}</td>
          <td style="padding: 10px; border-bottom: 1px solid #E5E7EB; font-size: 13px; text-align: right; font-family: monospace; font-weight: bold;">₹${(s.qty * (s.id.includes("technician") || s.id.includes("lead") ? addonsCatalog.find(a => a.id === s.id)?.rate || 0 : staffPricesMap[s.id] || 0) * s.days).toLocaleString()}</td>
        </tr>
      `)
    ].join("")

    const Rose = `
      <html>
        <head>
          <title>${inputs.simulationName}</title>
          <style>
            body { font-family: 'Inter', sans-serif; padding: 40px; color: #1F2937; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #5B21B6; padding-bottom: 20px; }
            h1 { color: #5B21B6; margin: 0; font-size: 24px; font-weight: 800; }
            .meta-grid { display: grid; grid-template-cols: 1fr 1fr; gap: 20px; margin: 30px 0; }
            .meta-card { background: #F9FAFB; padding: 15px; border-radius: 8px; font-size: 13px; border: 1px solid #E5E7EB; }
            .meta-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
            .items-table { width: 100%; margin-top: 30px; border-collapse: collapse; text-align: left; }
            .items-table th { padding: 12px 10px; background-color: #F3F4F6; font-size: 12px; font-weight: bold; text-transform: uppercase; color: #4B5563; }
            .summary-card { margin-top: 40px; border: 1px solid #E5E7EB; padding: 20px; border-radius: 12px; background-color: #FAFAFA; width: 380px; margin-left: auto; }
            .summary-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; }
            .summary-row.total { border-top: 2px solid #E5E7EB; padding-top: 10px; font-size: 16px; font-weight: 800; color: #5B21B6; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1>COMMERCIAL ESTIMATION PROPOSAL</h1>
              <span style="font-size: 11px; text-transform: uppercase; color: #6B7280; font-weight: bold; tracking-wider">EventX Quoting Engine</span>
            </div>
            <div style="text-align: right; font-size: 12px; color: #4B5563;">
              <strong>Date:</strong> ${new Date().toLocaleDateString()}<br/>
              <strong>Ref:</strong> ${inputs.refNumber}
            </div>
          </div>

          <div class="meta-grid">
            <div class="meta-card">
              <h4 style="margin: 0 0 10px 0; color: #5B21B6;">Simulation Specifications</h4>
              <div class="meta-row"><span>Prepared For:</span> <strong>${inputs.customer}</strong></div>
              <div class="meta-row"><span>Prepared By:</span> <strong>${inputs.preparedBy}</strong></div>
              <div class="meta-row"><span>City Tier:</span> <strong>${inputs.event_city_tier}</strong></div>
            </div>
            <div class="meta-card">
              <h4 style="margin: 0 0 10px 0; color: #5B21B6;">Parameters</h4>
              <div class="meta-row"><span>Event Duration:</span> <strong>${inputs.event_days} days</strong></div>
              <div class="meta-row"><span>Active Configs:</span> <strong>${Object.values(selectedTemplates).filter(x => x.selected).length} Active templates</strong></div>
            </div>
          </div>

          <h3>Aggregated Bill of Materials</h3>
          <table class="items-table">
            <thead>
              <tr>
                <th>Resource description</th>
                <th style="text-align: center;">Qty</th>
                <th style="text-align: center;">Days</th>
                <th style="text-align: right;">Unit Daily Price</th>
                <th style="text-align: right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div class="summary-card">
            <div class="summary-row"><span>Hardware Subtotal:</span> <span style="font-family: monospace;">₹${costs.hardware.toLocaleString()}</span></div>
            <div class="summary-row"><span>Crew Labor Subtotal:</span> <span style="font-family: monospace;">₹${costs.staff.toLocaleString()}</span></div>
            <div class="summary-row"><span>Management Overhead:</span> <span style="font-family: monospace;">₹${costs.overhead.toLocaleString()}</span></div>
            <div class="summary-row"><span>Contingency Buffer:</span> <span style="font-family: monospace;">₹${costs.contingency.toLocaleString()}</span></div>
            <div class="summary-row"><span>Suggested Profit Yield:</span> <span style="font-family: monospace;">₹${costs.profit.toLocaleString()}</span></div>
            <div class="summary-row"><span>Taxes (GST):</span> <span style="font-family: monospace;">₹${costs.gst.toLocaleString()}</span></div>
            <div class="summary-row total">
              <span>Grand Quote Total:</span> <span style="font-family: monospace;">₹${costs.total.toLocaleString()}</span>
            </div>
          </div>
        </body>
      </html>
    `
    printWindow.document.write(Rose)
    printWindow.document.close()
    printWindow.print()
  }

  const stepLabels = [
    "Select Templates",
    "Review Resources",
    "Cost Summary",
    "Pricing & Margins",
    "Proposal Preview"
  ]

  // Category Configuration
  const categoriesList = [
    { id: "registration", label: "Registration Templates", icon: Users, desc: "Counters, self check-in, badge printers", count: registrationTemplates.length },
    { id: "srr", label: "Speaker Ready Room", icon: Grid, desc: "Preview stations, network nodes, crew leads", count: srrTemplates.length },
    { id: "room", label: "Presentation Rooms", icon: Layout, desc: "Standard room ratios, setup workflow controls", count: roomTemplates.length },
    { id: "network", label: "Venue Infrastructure WiFi", icon: Network, desc: "Core transceivers, network AP deployments", count: networkTemplates.length }
  ] as const

  return (
    <PageContainer>
      <div className="flex justify-between items-center mb-4 border-b border-border pb-3">
        <div>
          <h2 className="text-lg font-black text-primary">Pricing Simulator</h2>
          <p className="text-[10px] text-tertiary">Quote Sandbox & B2B Estimation Engine</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowSaveModal(true)} className="text-xs font-bold gap-1">
            <Save className="h-3.5 w-3.5" /> Save Run
          </Button>
        </div>
      </div>

      {/* Wizard Progress Tracker */}
      <div className="w-full bg-surface-2 p-4 rounded-2xl border border-border mb-6">
        <div className="flex justify-between items-center mb-2">
          {stepLabels.map((lbl, idx) => (
            <div key={idx} className="flex flex-col items-center gap-1">
              <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold transition-all
                ${currentStep === idx + 1 ? 'bg-brand-primary text-white scale-110 shadow-md' : currentStep > idx + 1 ? 'bg-success text-white' : 'bg-surface-3 text-secondary'}`}>
                {currentStep > idx + 1 ? "✓" : idx + 1}
              </div>
              <span className={`text-[9px] font-bold tracking-wider uppercase ${currentStep === idx + 1 ? 'text-brand-primary' : 'text-secondary'}`}>
                {lbl}
              </span>
            </div>
          ))}
        </div>
        <Progress value={((currentStep - 1) / 4) * 100} className="h-1.5 bg-surface-3" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        {/* Left Side: Step View */}
        <div className="xl:col-span-9 space-y-6">

          {/* STEP 1: Select & Configure Templates & Add-ons */}
          {currentStep === 1 && (
            <div className="space-y-6">
              
              {/* Category Card Grid */}
              <div>
                <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary block mb-2">Choose Template Category</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {categoriesList.map(cat => {
                    const isActive = activeCategory === cat.id
                    return (
                      <Card
                        key={cat.id}
                        onClick={() => setActiveCategory(cat.id)}
                        className={`p-4 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between h-24 select-none
                          ${isActive ? 'bg-brand-primary/10 border-brand-primary' : 'bg-[var(--bg-surface)] border-border hover:border-brand-primary/45'}`}
                      >
                        <div className="flex justify-between items-center">
                          <cat.icon className={`h-4 w-4 ${isActive ? 'text-brand-primary' : 'text-secondary'}`} />
                          <span className="text-[9px] bg-surface-2 text-tertiary px-2 py-0.5 rounded-full font-bold">
                            {cat.count} Templates
                          </span>
                        </div>
                        <div>
                          <h4 className="text-xs font-black text-primary truncate">{cat.label}</h4>
                          <span className="text-[9px] text-tertiary truncate block mt-0.5">{cat.desc}</span>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              </div>

              {/* Template list under Active Category */}
              <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-6">
                <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary block mb-4">
                  Available Templates in {categoriesList.find(c => c.id === activeCategory)?.label}
                </span>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {activeTemplatesList.map((tpl: any) => {
                    const config = selectedTemplates[tpl.slug] || { selected: false, params: {} }
                    const isSelected = config.selected

                    return (
                      <Card
                        key={tpl.slug}
                        className={`p-4 rounded-2xl border transition-all flex flex-col justify-between
                          ${isSelected ? 'bg-brand-primary/5 border-brand-primary/45' : 'bg-surface-2/30 border-border hover:border-brand-primary/30'}`}
                      >
                        <div className="space-y-2">
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="text-xs font-black text-primary">{tpl.name}</h4>
                              <span className="text-[10px] text-secondary leading-relaxed block">{tpl.description || "No description provided"}</span>
                            </div>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleTemplateSelection(tpl.slug)}
                              className="rounded h-4 w-4 text-brand-primary bg-surface-3 border-border cursor-pointer mt-0.5"
                            />
                          </div>

                          {/* Specific Specs display only (No hardware/staff allocations) */}
                          <div className="pt-2 border-t border-border/40 space-y-1">
                            {tpl.template_type === "registration" && (
                              <>
                                <div className="flex justify-between text-[10px] text-secondary">
                                  <span>Check-in Counters:</span>
                                  <span className="text-primary font-bold">{tpl.specs?.reg_counters || 4} Counters</span>
                                </div>
                                <div className="flex justify-between text-[10px] text-secondary">
                                  <span>Self check-in kiosks:</span>
                                  <span className="text-primary font-bold">{tpl.specs?.kiosks || 2} Kiosks</span>
                                </div>
                                {isSelected && (
                                  <div className="pt-2 grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="text-[9px] text-secondary block font-bold mb-0.5">Attendees scaling</label>
                                      <Input
                                        type="number"
                                        value={config.params.attendees}
                                        onChange={e => updateTemplateParam(tpl.slug, "attendees", parseInt(e.target.value) || 1000)}
                                        className="h-8 text-xs bg-surface-2 border-border"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[9px] text-secondary block font-bold mb-0.5">Days</label>
                                      <Input
                                        type="number"
                                        value={config.params.days}
                                        onChange={e => updateTemplateParam(tpl.slug, "days", parseInt(e.target.value) || 1)}
                                        className="h-8 text-xs bg-surface-2 border-border"
                                      />
                                    </div>
                                  </div>
                                )}
                              </>
                            )}

                            {tpl.template_type === "srr" && (
                              <>
                                <div className="flex justify-between text-[10px] text-secondary">
                                  <span>Preview Stations:</span>
                                  <span className="text-primary font-bold">{tpl.specs?.preview_stations || 8} Stations</span>
                                </div>
                                <div className="flex justify-between text-[10px] text-secondary">
                                  <span>Upload Stations:</span>
                                  <span className="text-primary font-bold">{tpl.specs?.upload_stations || 4} Stations</span>
                                </div>
                                {isSelected && (
                                  <div className="pt-2 grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="text-[9px] text-secondary block font-bold mb-0.5">Upload stations</label>
                                      <Input
                                        type="number"
                                        value={config.params.upload_stations}
                                        onChange={e => updateTemplateParam(tpl.slug, "upload_stations", parseInt(e.target.value) || 4)}
                                        className="h-8 text-xs bg-surface-2 border-border"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[9px] text-secondary block font-bold mb-0.5">Days</label>
                                      <Input
                                        type="number"
                                        value={config.params.days}
                                        onChange={e => updateTemplateParam(tpl.slug, "days", parseInt(e.target.value) || 1)}
                                        className="h-8 text-xs bg-surface-2 border-border"
                                      />
                                    </div>
                                  </div>
                                )}
                              </>
                            )}

                            {tpl.template_type === "room" && (
                              <>
                                <div className="flex justify-between text-[10px] text-secondary">
                                  <span>Parallel Rooms capacity:</span>
                                  <span className="text-primary font-bold">{tpl.specs?.rooms || 6} Rooms</span>
                                </div>
                                <div className="flex justify-between text-[10px] text-secondary">
                                  <span>Default seating layout:</span>
                                  <span className="text-primary font-bold">{tpl.room_type || "Theater"}</span>
                                </div>
                                {isSelected && (
                                  <div className="pt-2 grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="text-[9px] text-secondary block font-bold mb-0.5">Parallel Rooms</label>
                                      <Input
                                        type="number"
                                        value={config.params.rooms}
                                        onChange={e => updateTemplateParam(tpl.slug, "rooms", parseInt(e.target.value) || 1)}
                                        className="h-8 text-xs bg-surface-2 border-border"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[9px] text-secondary block font-bold mb-0.5">Days</label>
                                      <Input
                                        type="number"
                                        value={config.params.days}
                                        onChange={e => updateTemplateParam(tpl.slug, "days", parseInt(e.target.value) || 1)}
                                        className="h-8 text-xs bg-surface-2 border-border"
                                      />
                                    </div>
                                  </div>
                                )}
                              </>
                            )}

                            {tpl.template_type === "network" && (
                              <>
                                <div className="flex justify-between text-[10px] text-secondary">
                                  <span>Access Transceivers:</span>
                                  <span className="text-primary font-bold">{tpl.specs?.access_points || 8} Nodes</span>
                                </div>
                                <div className="flex justify-between text-[10px] text-secondary">
                                  <span>Speed limit:</span>
                                  <span className="text-primary font-bold">1 Gbps fiber</span>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              </div>

              {/* Standalone Add-ons selection */}
              <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-6">
                <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary block mb-4">
                  Inject Standalone Add-ons
                </span>

                <div className="space-y-3">
                  {addonsCatalog.map(addon => {
                    const qty = addons[addon.id] || 0
                    return (
                      <div key={addon.id} className="flex justify-between items-center p-3 rounded-xl bg-surface-2/40 border border-border/40 hover:border-brand-primary/20 transition-colors">
                        <div>
                          <span className="text-xs font-bold text-primary block">{addon.name}</span>
                          <span className="text-[10px] text-tertiary block mt-0.5">{addon.desc}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-xs font-mono font-bold text-secondary">{formatINR(addon.rate)} <span className="text-[9px] font-medium text-tertiary">/day</span></span>
                          
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={qty === 0}
                              onClick={() => setAddons(prev => ({ ...prev, [addon.id]: Math.max(0, qty - 1) }))}
                              className="h-7 w-7 rounded-lg bg-surface-3 border border-border text-secondary flex items-center justify-center hover:bg-surface-hover transition-colors disabled:opacity-40"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="text-xs font-bold text-primary w-5 text-center font-mono">{qty}</span>
                            <button
                              type="button"
                              onClick={() => setAddons(prev => ({ ...prev, [addon.id]: qty + 1 }))}
                              className="h-7 w-7 rounded-lg bg-surface-3 border border-border text-secondary flex items-center justify-center hover:bg-surface-hover transition-colors"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

            </div>
          )}

          {/* STEP 2: Resource Review */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <Tabs defaultValue="all">
                <TabsList className="bg-surface-2 border border-border w-full flex justify-start rounded-xl mb-4">
                  <TabsTrigger value="all" className="text-xs font-bold px-4 py-2 border-b-2 border-transparent data-[state=active]:border-brand-primary">
                    All Resources
                  </TabsTrigger>
                  <TabsTrigger value="hardware" className="text-xs font-bold px-4 py-2 border-b-2 border-transparent data-[state=active]:border-brand-primary">
                    Hardware Assets ({aggregatedHardware.length})
                  </TabsTrigger>
                  <TabsTrigger value="staff" className="text-xs font-bold px-4 py-2 border-b-2 border-transparent data-[state=active]:border-brand-primary">
                    Manpower Staffing ({aggregatedStaff.length})
                  </TabsTrigger>
                </TabsList>

                {/* All Resources */}
                <TabsContent value="all" className="space-y-6">
                  <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl overflow-hidden">
                    <div className="p-4 bg-surface-2 border-b border-border flex justify-between items-center">
                      <h4 className="text-xs font-bold text-primary uppercase tracking-wider">Aggregated Bill of Materials</h4>
                      <Button size="sm" variant="outline" className="text-[10px] font-bold h-8">Export Excel</Button>
                    </div>

                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-surface-2 border-b border-border text-secondary">
                          <th className="p-3">Resource Name</th>
                          <th className="p-3">Category / Department</th>
                          <th className="p-3 text-center">Qty</th>
                          <th className="p-3 text-center">Days</th>
                          <th className="p-3 text-right">Unit Rate</th>
                          <th className="p-3">Source Templates</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* Hardware items */}
                        {aggregatedHardware.map((hw) => {
                          const addonMatch = addonsCatalog.find(a => a.id === hw.id)
                          const rate = addonMatch ? addonMatch.rate : (hardwarePricesMap[hw.id] || 0)
                          return (
                            <tr key={hw.id} className="border-b border-border/40 hover:bg-surface-hover/20">
                              <td className="p-3 font-semibold text-primary">{hw.name}</td>
                              <td className="p-3 text-secondary text-[10px]">{hw.category}</td>
                              <td className="p-3 text-center font-mono font-bold text-primary">{hw.qty}</td>
                              <td className="p-3 text-center font-mono text-secondary">{inputs.event_days}</td>
                              <td className="p-3 text-right font-mono text-secondary">{formatINR(rate)}</td>
                              <td className="p-3 text-[10px] text-brand-primary font-bold">
                                {hw.sources.join(", ")}
                              </td>
                            </tr>
                          )
                        })}

                        {/* Staff roles */}
                        {aggregatedStaff.map((st) => {
                          const addonMatch = addonsCatalog.find(a => a.id === st.id)
                          const rate = addonMatch ? addonMatch.rate : (staffPricesMap[st.id] || 0)
                          return (
                            <tr key={st.id} className="border-b border-border/40 hover:bg-surface-hover/20">
                              <td className="p-3 font-semibold text-primary">{st.name}</td>
                              <td className="p-3 text-secondary text-[10px]">{st.dept}</td>
                              <td className="p-3 text-center font-mono font-bold text-primary">{st.qty}</td>
                              <td className="p-3 text-center font-mono text-secondary">{st.days}</td>
                              <td className="p-3 text-right font-mono text-secondary">{formatINR(rate)}</td>
                              <td className="p-3 text-[10px] text-brand-primary font-bold">
                                {st.sources.join(", ")}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>

                {/* Hardware */}
                <TabsContent value="hardware" className="space-y-4">
                  <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-surface-2/40 border-b border-border text-secondary">
                          <th className="p-3">Hardware Item</th>
                          <th className="p-3">Category</th>
                          <th className="p-3 text-center">Quantity</th>
                          <th className="p-3 text-right">Daily Cost</th>
                          <th className="p-3 text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aggregatedHardware.map((hw) => {
                          const addonMatch = addonsCatalog.find(a => a.id === hw.id)
                          const rate = addonMatch ? addonMatch.rate : (hardwarePricesMap[hw.id] || 0)
                          return (
                            <tr key={hw.id} className="border-b border-border/40 hover:bg-surface-hover/20">
                              <td className="p-3 font-semibold text-primary">{hw.name}</td>
                              <td className="p-3 text-secondary text-[10px]">{hw.category}</td>
                              <td className="p-3 text-center font-mono font-bold">{hw.qty}</td>
                              <td className="p-3 text-right font-mono">{formatINR(rate)}</td>
                              <td className="p-3 text-right font-mono font-bold text-success">
                                {formatINR(hw.qty * rate * inputs.event_days)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>

                {/* Staff */}
                <TabsContent value="staff" className="space-y-4">
                  <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-surface-2/40 border-b border-border text-secondary">
                          <th className="p-3">Manpower Role</th>
                          <th className="p-3">Department</th>
                          <th className="p-3 text-center">Headcount</th>
                          <th className="p-3 text-center">Days</th>
                          <th className="p-3 text-right">Daily Rate</th>
                          <th className="p-3 text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aggregatedStaff.map((st) => {
                          const addonMatch = addonsCatalog.find(a => a.id === st.id)
                          const rate = addonMatch ? addonMatch.rate : (staffPricesMap[st.id] || 0)
                          return (
                            <tr key={st.id} className="border-b border-border/40 hover:bg-surface-hover/20">
                              <td className="p-3 font-semibold text-primary">{st.name}</td>
                              <td className="p-3 text-secondary text-[10px]">{st.dept}</td>
                              <td className="p-3 text-center font-mono font-bold">{st.qty}</td>
                              <td className="p-3 text-center font-mono">{st.days}</td>
                              <td className="p-3 text-right font-mono">{formatINR(rate)}</td>
                              <td className="p-3 text-right font-mono font-bold text-success">
                                {formatINR(st.qty * rate * st.days)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}

          {/* STEP 3: Cost Summary */}
          {currentStep === 3 && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-8 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-6">
                <h4 className="text-xs font-extrabold uppercase tracking-widest text-secondary mb-4">Quotation Cost Breakdown</h4>
                <div className="space-y-3 text-xs font-semibold text-secondary">
                  <div className="flex justify-between p-2.5 rounded-xl bg-surface-2/40 border border-border/40">
                    <span>Aggregated Hardware Cost</span>
                    <span className="font-mono text-primary font-bold">{formatINR(costs.hardware)}</span>
                  </div>
                  <div className="flex justify-between p-2.5 rounded-xl bg-surface-2/40 border border-border/40">
                    <span>Operations Manpower Cost</span>
                    <span className="font-mono text-primary font-bold">{formatINR(costs.staff)}</span>
                  </div>
                  <div className="flex justify-between p-2.5 rounded-xl bg-surface-2/40 border border-border/40">
                    <span>Total Operational Base Cost</span>
                    <span className="font-mono text-brand-primary font-extrabold">{formatINR(costs.base)}</span>
                  </div>
                </div>
              </div>

              {/* Cost Ratio Pie Chart */}
              <div className="lg:col-span-4 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-6 flex flex-col justify-between">
                <h4 className="text-xs font-extrabold uppercase tracking-widest text-secondary mb-3">Cost Split Ratio</h4>
                <div className="h-44 w-full relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={chartData} cx="50%" cy="50%" innerRadius={45} outerRadius={60} paddingAngle={3} dataKey="value">
                        {chartData.map((e, idx) => (
                          <Cell key={`cell-${idx}`} fill={e.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => `${value}%`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1 mt-4 text-[10px] font-bold text-secondary">
                  {chartData.map((e, idx) => (
                    <div key={idx} className="flex justify-between">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: e.color }} /> {e.name}
                      </span>
                      <span className="font-mono text-primary font-extrabold">{e.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Pricing & Margins */}
          {currentStep === 4 && (
            <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-6 space-y-6">
              <h4 className="text-xs font-extrabold uppercase tracking-widest text-secondary flex items-center gap-1.5">
                <Percent className="h-4 w-4 text-brand-primary" /> Markup Pricing Margin Rules
              </h4>

              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs mb-1 font-bold text-secondary">
                    <span>Management Overhead Fee</span>
                    <span className="text-brand-primary font-bold">{margins.overhead_pct}%</span>
                  </div>
                  <input
                    type="range" min="0" max="30" value={margins.overhead_pct}
                    onChange={e => setMargins(prev => ({ ...prev, overhead_pct: parseInt(e.target.value) || 0 }))}
                    className="w-full accent-brand-primary"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1 font-bold text-secondary">
                    <span>Contingency Buffer</span>
                    <span className="text-brand-primary font-bold">{margins.contingency_pct}%</span>
                  </div>
                  <input
                    type="range" min="0" max="20" value={margins.contingency_pct}
                    onChange={e => setMargins(prev => ({ ...prev, contingency_pct: parseInt(e.target.value) || 0 }))}
                    className="w-full accent-brand-primary"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1 font-bold text-secondary">
                    <span>Target Profit Margin</span>
                    <span className="text-brand-primary font-bold">{margins.margin_pct}%</span>
                  </div>
                  <input
                    type="range" min="0" max="40" value={margins.margin_pct}
                    onChange={e => setMargins(prev => ({ ...prev, margin_pct: parseInt(e.target.value) || 0 }))}
                    className="w-full accent-brand-primary"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1 font-bold text-secondary">
                    <span>Client Discount</span>
                    <span className="text-danger font-bold">{margins.discount_pct}%</span>
                  </div>
                  <input
                    type="range" min="0" max="25" value={margins.discount_pct}
                    onChange={e => setMargins(prev => ({ ...prev, discount_pct: parseInt(e.target.value) || 0 }))}
                    className="w-full accent-brand-primary"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: Proposal Preview */}
          {currentStep === 5 && (
            <div className="space-y-6">
              <h4 className="text-xs font-extrabold uppercase tracking-widest text-secondary flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-brand-primary" /> Quote B2B Proposal Cover Sheet
              </h4>

              <div className="w-full aspect-[4/3] rounded-3xl p-12 flex flex-col justify-between text-white shadow-2xl relative overflow-hidden bg-brand-primary">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_75%_25%,rgba(255,255,255,0.06),transparent_24rem)]" />
                <div className="flex justify-between items-start">
                  <span className="text-sm font-black tracking-widest">EVENTX</span>
                  <span className="text-[10px] bg-white/10 px-2.5 py-1 rounded-full uppercase tracking-wider font-extrabold border border-white/20">Quotation Summary</span>
                </div>
                <div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight max-w-lg leading-tight">
                    {inputs.simulationName}
                  </h2>
                  <p className="text-xs text-white/80 max-w-md mt-3 leading-relaxed">
                    Prepared for: {inputs.customer}
                  </p>
                </div>
                <div className="flex justify-between items-end border-t border-white/10 pt-4 text-[10px] text-white/70">
                  <div>
                    <span className="block font-semibold uppercase text-white/50 text-[8px] tracking-widest mb-0.5">Prepared By</span>
                    <span className="font-bold text-white text-xs">{inputs.preparedBy}</span>
                  </div>
                  <div className="text-right">
                    <span className="block font-semibold uppercase text-white/50 text-[8px] tracking-widest mb-0.5">Grand Total Quote</span>
                    <span className="font-bold text-white text-xs">{formatINR(costs.total)}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={handlePrintPDF} className="text-xs font-bold gap-1 h-9">
                  <Printer className="h-4 w-4" /> Print / Export Proposal Draft
                </Button>
              </div>
            </div>
          )}

          {/* Stepper Navigation Buttons */}
          <div className="flex justify-between pt-4 border-t border-border">
            <Button
              variant="outline"
              disabled={currentStep === 1}
              onClick={() => setCurrentStep(prev => prev - 1)}
              className="text-xs font-bold gap-1"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Previous Step
            </Button>

            {currentStep < 5 ? (
              <Button
                onClick={() => setCurrentStep(prev => prev + 1)}
                className="bg-brand-primary text-white text-xs font-bold gap-1"
              >
                Continue <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                onClick={() => setShowSaveModal(true)}
                className="bg-success text-white text-xs font-bold gap-1"
              >
                <Save className="h-3.5 w-3.5" /> Save Quotation
              </Button>
            )}
          </div>

        </div>

        {/* Right Side: Sticky Financial Dashboard */}
        <div className="xl:col-span-3 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-6 flex flex-col justify-between h-[480px]">
          <div>
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-secondary mb-4">
              Real-time Output
            </h3>

            <div className="space-y-4 text-xs font-semibold text-secondary">
              <div className="flex justify-between">
                <span>Simulation Name</span>
                <span className="text-primary truncate max-w-[120px]">{inputs.simulationName}</span>
              </div>
              <div className="flex justify-between">
                <span>Event Duration</span>
                <span className="text-primary">{inputs.event_days} days</span>
              </div>
              <div className="h-px bg-border/40 my-2" />
              <div className="flex justify-between">
                <span>Total Hardware Cost</span>
                <span className="font-mono text-primary">{formatINR(costs.hardware)}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Manpower Cost</span>
                <span className="font-mono text-primary">{formatINR(costs.staff)}</span>
              </div>
              <div className="flex justify-between text-success">
                <span>Margin Fees Applied</span>
                <span className="font-mono">+{formatINR(costs.overhead + costs.contingency + costs.profit)}</span>
              </div>
              {costs.discount > 0 && (
                <div className="flex justify-between text-danger">
                  <span>Client Discount</span>
                  <span className="font-mono">-{formatINR(costs.discount)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-[var(--border-subtle)]">
            <div className="flex justify-between items-baseline mb-2">
              <span className="text-xs font-bold text-primary">Suggested Quote</span>
              <span className="text-lg font-black font-mono text-brand-primary">
                {formatINR(costs.total)}
              </span>
            </div>
            <Button
              onClick={() => setShowSaveModal(true)}
              className="w-full bg-brand-primary hover:bg-brand-primary/90 text-white text-xs font-bold h-9 gap-1.5"
            >
              <Save className="h-4 w-4" /> Save Simulation Run
            </Button>
          </div>
        </div>

      </div>

      {/* Save Simulation Modal Dialog */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-base font-bold text-primary">Save Simulation Run</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-secondary mb-1 block">Simulation Name *</label>
                <Input
                  value={inputs.simulationName}
                  onChange={e => setInputs(prev => ({ ...prev, simulationName: e.target.value }))}
                  className="bg-surface-2 border-border text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-secondary mb-1 block">Prepared By</label>
                <Input
                  value={inputs.preparedBy}
                  onChange={e => setInputs(prev => ({ ...prev, preparedBy: e.target.value }))}
                  className="bg-surface-2 border-border text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-secondary mb-1 block">Customer / Client</label>
                <Input
                  value={inputs.customer}
                  onChange={e => setInputs(prev => ({ ...prev, customer: e.target.value }))}
                  className="bg-surface-2 border-border text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-secondary mb-1 block">Reference / Quote Number</label>
                <Input
                  value={inputs.refNumber}
                  onChange={e => setInputs(prev => ({ ...prev, refNumber: e.target.value }))}
                  className="bg-surface-2 border-border text-xs"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setShowSaveModal(false)} className="text-xs">
                Cancel
              </Button>
              <Button
                onClick={handleSaveSimulation}
                disabled={!inputs.simulationName}
                className="bg-brand-primary text-white text-xs"
              >
                Confirm Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  )
}
