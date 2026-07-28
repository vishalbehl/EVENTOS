"use client"
import { useState, useMemo } from "react"
import { useCatalogTemplates, useHardwareCatalog, useStaffCatalog, formatINR } from "@/services/super-admin-service"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Layout, Users, Grid, Sparkles, Printer, Check, Plus, Minus, FileText, Settings, HeartHandshake } from "lucide-react"

export default function ProposalGeneratorPage() {
  const { data: templatesData, isLoading: templatesLoading } = useCatalogTemplates()
  const { data: hardwareData } = useHardwareCatalog({ limit: 100 })
  const { data: staffData } = useStaffCatalog({ limit: 100 })

  const hardwareList = useMemo(() => hardwareData?.items ?? [], [hardwareData])
  const staffRolesList = useMemo(() => staffData?.items ?? [], [staffData])

  // Selected Category
  const [activeCategory, setActiveCategory] = useState<"room" | "registration" | "srr">("registration")

  // Selected template IDs / slugs
  const [selectedTemplateSlugs, setSelectedTemplateSlugs] = useState<Record<string, boolean>>({})

  // Custom parameters per selected template
  const [templateParams, setTemplateParams] = useState<Record<string, { rooms?: number; attendees?: number; stations?: number }>>({})

  // Standalone Add-ons selection state (quantities)
  const [addons, setAddons] = useState<Record<string, number>>({
    "extra-kiosk": 0,
    "extra-printer": 0,
    "extra-technician": 0,
    "vip-lead": 0,
    "extra-ap": 0
  })

  // Global inputs
  const [inputs, setInputs] = useState({
    clientName: "Imperial Event Organizers",
    proposalTitle: "B2B SaaS platform & Tech Infrastructure Proposal",
    coverNote: "This commercial proposal outlines standard room deployment setups, self-service check-in kiosks, and on-site support crew requested for the upcoming annual summit.",
    colorTheme: "#8B5CF6", // violet
    eventDays: 3,
    contingency_pct: 5,
    margin_pct: 15
  })

  // Predefined Add-ons details
  const addonsCatalog = [
    { id: "extra-kiosk", name: "Extra iPad check-in kiosk", rate: 2200, unit: "per kiosk/day", desc: "Additional self-service QR ticket scanner & iPad stand" },
    { id: "extra-printer", name: "Heavy-Duty Thermal badge printer", rate: 2600, unit: "per printer/day", desc: "Zebra thermal label printer for high-speed badge dispensing" },
    { id: "extra-technician", name: "On-site IT support technician", rate: 3000, unit: "per operator/day", desc: "On-site engineer for network setup, printer configuration, and tech support" },
    { id: "vip-lead", name: "VIP Helpdesk Crew Supervisor", rate: 6000, unit: "per operator/day", desc: "Dedicated logistics lead managing checking counters & queue flows" },
    { id: "extra-ap", name: "Venue-wide Wi-Fi Access Point", rate: 1200, unit: "per AP/day", desc: "Ceiling-mount high-density backup wireless transceiver" }
  ]

  // Group templates by type
  const roomTemplates = templatesData?.room_templates ?? []
  const registrationTemplates = templatesData?.registration_templates ?? []
  const srrTemplates = templatesData?.srr_templates ?? []

  const activeTemplatesList = useMemo(() => {
    switch (activeCategory) {
      case "room": return roomTemplates
      case "registration": return registrationTemplates
      case "srr": return srrTemplates
      default: return []
    }
  }, [activeCategory, roomTemplates, registrationTemplates, srrTemplates])

  const handleToggleTemplate = (slug: string) => {
    setSelectedTemplateSlugs(prev => ({
      ...prev,
      [slug]: !prev[slug]
    }))
    // Initialize parameter defaults if not set
    if (!templateParams[slug]) {
      setTemplateParams(prev => ({
        ...prev,
        [slug]: { rooms: 4, attendees: 1000, stations: 4 }
      }))
    }
  }

  const handleUpdateTemplateParam = (slug: string, key: string, value: number) => {
    setTemplateParams(prev => ({
      ...prev,
      [slug]: {
        ...prev[slug],
        [key]: value
      }
    }))
  }

  // Calculate pricing based on selected templates and addons
  const calculations = useMemo(() => {
    let hardwareSubtotal = 0
    let staffSubtotal = 0
    const proposalItems: { name: string; type: string; qty: number; days: number; rate: number; total: number }[] = []

    // 1. Calculate templates base costs
    const allTemplates = [...roomTemplates, ...registrationTemplates, ...srrTemplates]
    allTemplates.forEach((tpl: any) => {
      if (!selectedTemplateSlugs[tpl.slug]) return

      const params = templateParams[tpl.slug] || { rooms: 4, attendees: 1000, stations: 4 }
      let factor = 1
      if (tpl.template_type === "room") {
        factor = params.rooms ?? 4
      } else if (tpl.template_type === "registration") {
        factor = Math.ceil((params.attendees ?? 1000) / 1000)
      } else if (tpl.template_type === "srr") {
        factor = Math.ceil((params.stations ?? 4) / 4)
      }

      // Hardware costs
      (tpl.hardware_allocation || []).forEach((alloc: any) => {
        const hw = hardwareList.find((h: any) => h.id === alloc.hardware_item_id)
        if (hw) {
          const sellingPrice = hw.renting_price || hw.selling_price || 0
          const qty = alloc.quantity * factor
          const itemTotal = qty * sellingPrice * inputs.eventDays
          hardwareSubtotal += itemTotal
          
          // Aggregate line items in preview
          const existing = proposalItems.find(p => p.name === hw.name)
          if (existing) {
            existing.qty += qty
            existing.total += itemTotal
          } else {
            proposalItems.push({
              name: hw.name,
              type: "Hardware",
              qty,
              days: inputs.eventDays,
              rate: sellingPrice,
              total: itemTotal
            })
          }
        }
      });

      // Staff costs
      (tpl.staff_allocation || []).forEach((alloc: any) => {
        const st = staffRolesList.find((s: any) => s.id === alloc.staff_role_id)
        if (st) {
          const sellingRate = st.selling_per_day || st.daily_rate || 0
          const qty = alloc.quantity * factor
          const itemTotal = qty * sellingRate * inputs.eventDays
          staffSubtotal += itemTotal

          const existing = proposalItems.find(p => p.name === st.name)
          if (existing) {
            existing.qty += qty
            existing.total += itemTotal
          } else {
            proposalItems.push({
              name: st.name,
              type: "Crew Labor",
              qty,
              days: inputs.eventDays,
              rate: sellingRate,
              total: itemTotal
            })
          }
        }
      })
    })

    // 2. Add standalone Add-ons
    addonsCatalog.forEach(addon => {
      const qty = addons[addon.id] || 0
      if (qty > 0) {
        const addonTotal = qty * addon.rate * inputs.eventDays
        if (addon.id.includes("kiosk") || addon.id.includes("printer") || addon.id.includes("ap")) {
          hardwareSubtotal += addonTotal
        } else {
          staffSubtotal += addonTotal
        }
        proposalItems.push({
          name: addon.name + " (Add-on)",
          type: "Add-on Extra",
          qty,
          days: inputs.eventDays,
          rate: addon.rate,
          total: addonTotal
        })
      }
    })

    const baseCost = hardwareSubtotal + staffSubtotal
    const contingency = baseCost * (inputs.contingency_pct / 100)
    const profit = baseCost * (inputs.margin_pct / 100)
    const preGst = baseCost + contingency + profit
    const gst = preGst * 0.18
    const total = preGst + gst

    return {
      hardware: hardwareSubtotal,
      staff: staffSubtotal,
      base: baseCost,
      contingency,
      profit,
      preGst,
      gst,
      total,
      items: proposalItems
    }
  }, [selectedTemplateSlugs, templateParams, addons, inputs, hardwareList, staffRolesList, roomTemplates, registrationTemplates, srrTemplates])

  const handlePrint = () => {
    const printWindow = window.open("", "_blank")
    if (!printWindow) return

    const itemsHtml = calculations.items.map(item => `
      <tr>
        <td style="padding: 12px 10px; border-bottom: 1px solid #E5E7EB; font-size: 13px;">
          <strong>${item.name}</strong><br/>
          <span style="font-size: 10px; color: #6B7280;">Type: ${item.type}</span>
        </td>
        <td style="padding: 12px 10px; border-bottom: 1px solid #E5E7EB; font-size: 13px; text-align: center;">${item.qty}</td>
        <td style="padding: 12px 10px; border-bottom: 1px solid #E5E7EB; font-size: 13px; text-align: center;">${item.days}</td>
        <td style="padding: 12px 10px; border-bottom: 1px solid #E5E7EB; font-size: 13px; text-align: right; font-family: monospace;">₹${item.rate.toLocaleString()}</td>
        <td style="padding: 12px 10px; border-bottom: 1px solid #E5E7EB; font-size: 13px; text-align: right; font-family: monospace; font-weight: bold;">₹${item.total.toLocaleString()}</td>
      </tr>
    `).join("")

    printWindow.document.write(`
      <html>
        <head>
          <title>${inputs.proposalTitle}</title>
          <style>
            body { font-family: 'Inter', sans-serif; color: #1F2937; margin: 0; padding: 0; }
            .cover-page {
              height: 100vh;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              padding: 80px;
              box-sizing: border-box;
              background-color: ${inputs.colorTheme};
              color: white;
              page-break-after: always;
            }
            .cover-title { font-size: 38px; font-weight: 900; margin-top: 100px; line-height: 1.2; }
            .cover-meta { margin-bottom: 40px; font-size: 15px; opacity: 0.9; }
            .content-page { padding: 60px 80px; box-sizing: border-box; }
            .section-title { color: ${inputs.colorTheme}; border-bottom: 2px solid ${inputs.colorTheme}; padding-bottom: 10px; margin-top: 40px; font-size: 20px; font-weight: 800; }
            .meta-grid { display: grid; grid-template-cols: 1fr 1fr; gap: 20px; margin: 30px 0; }
            .meta-card { background: #F9FAFB; padding: 15px; border-radius: 8px; font-size: 13px; border: 1px solid #E5E7EB; }
            .meta-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
            .items-table { width: 100%; margin-top: 25px; border-collapse: collapse; text-align: left; }
            .items-table th { padding: 12px 10px; background-color: #F3F4F6; font-size: 12px; font-weight: bold; text-transform: uppercase; color: #4B5563; border-bottom: 2px solid #E5E7EB; }
            .summary-card { margin-top: 40px; border: 1px solid #E5E7EB; padding: 25px; border-radius: 12px; background-color: #FAFAFA; width: 380px; margin-left: auto; page-break-inside: avoid; }
            .summary-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; }
            .summary-row.total { border-top: 2px solid #E5E7EB; padding-top: 10px; font-size: 16px; font-weight: 800; color: ${inputs.colorTheme}; }
          </style>
        </head>
        <body>
          <div class="cover-page">
            <div>
              <div style="font-size: 22px; font-weight: 900; letter-spacing: 2px;">Event</div>
              <h1 class="cover-title">${inputs.proposalTitle}</h1>
              <p style="font-size: 16px; max-width: 600px; margin-top: 20px; opacity: 0.85; line-height: 1.5;">${inputs.coverNote}</p>
            </div>
            <div class="cover-meta">
              <strong>PREPARED FOR:</strong> ${inputs.clientName}<br/>
              <strong>DATE GENERATED:</strong> ${new Date().toLocaleDateString()}<br/>
              <strong>EVENT DAYS:</strong> ${inputs.eventDays} days
            </div>
          </div>

          <div class="content-page">
            <h2 class="section-title">1. Selected Infrastructure & Add-ons Summary</h2>
            <table class="items-table">
              <thead>
                <tr>
                  <th>Item / Description</th>
                  <th style="text-align: center;">Qty</th>
                  <th style="text-align: center;">Days</th>
                  <th style="text-align: right;">Unit Rate</th>
                  <th style="text-align: right;">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>

            <div class="summary-card">
              <div class="summary-row"><span>Equipment rentals subtotal:</span> <span style="font-family: monospace;">₹${calculations.hardware.toLocaleString()}</span></div>
              <div class="summary-row"><span>Staff manpower subtotal:</span> <span style="font-family: monospace;">₹${calculations.staff.toLocaleString()}</span></div>
              <div class="summary-row"><span>Contingency margin buffer:</span> <span style="font-family: monospace;">₹${calculations.contingency.toLocaleString()}</span></div>
              <div class="summary-row"><span>Platform profit target:</span> <span style="font-family: monospace;">₹${calculations.profit.toLocaleString()}</span></div>
              <div class="summary-row"><span>Taxes (18% GST):</span> <span style="font-family: monospace;">₹${calculations.gst.toLocaleString()}</span></div>
              <div class="summary-row total">
                <span>Grand Quote Total:</span> <span style="font-family: monospace;">₹${calculations.total.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.print()
  }

  // Categories config
  const categories = [
    { id: "registration", label: "Registration Templates", icon: Users, desc: "Check-in counters, self-service kiosks, badge printers", count: registrationTemplates.length },
    { id: "srr", label: "SRR", icon: Grid, desc: "Preview stations, upload zones, crew operators", count: srrTemplates.length },
    { id: "room", label: "Presentation Rooms", icon: Layout, desc: "Standard setups, parallel room configs, technician crew", count: roomTemplates.length },
  ] as const

  return (
    <PageContainer>
      <SectionHeader
        title="Proposal & Quoting Builder"
        description="Select category configurations, choose specifications, inject standalone add-ons, and render printable B2B proposals"
      />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 mt-6">
        
        {/* Left Side: Category Selectors & Add-ons */}
        <div className="xl:col-span-8 space-y-8">
          
          {/* 1. Category selector cards */}
          <div>
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-secondary mb-3 flex items-center gap-1.5">
              1. Choose Template Category
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {categories.map(cat => {
                const isActive = activeCategory === cat.id
                return (
                  <Card
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`p-4 rounded-3xl border transition-all cursor-pointer select-none flex flex-col justify-between h-28
                      ${isActive ? "bg-brand-primary/10 border-brand-primary" : "bg-[var(--bg-surface)] border-border hover:border-brand-primary/40"}`}
                  >
                    <div className="flex justify-between items-start">
                      <div className={`p-2 rounded-xl border ${isActive ? "bg-brand-primary/10 border-brand-primary/20 text-brand-primary" : "bg-surface-2 border-border text-secondary"}`}>
                        <cat.icon className="h-4 w-4" />
                      </div>
                      <span className="text-[10px] bg-surface-2 text-tertiary px-2 py-0.5 rounded-full font-bold">
                        {cat.count} Templates
                      </span>
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-primary block truncate">{cat.label}</h4>
                      <span className="text-[9px] text-tertiary block mt-0.5 truncate">{cat.desc}</span>
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>

          {/* 2. Template List under Selected Category */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-6">
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-secondary mb-4 flex items-center gap-2">
              2. Available Templates in {categories.find(c => c.id === activeCategory)?.label}
            </h3>

            {templatesLoading ? (
              <div className="p-8 text-center text-xs text-secondary">Fetching templates metadata...</div>
            ) : activeTemplatesList.length === 0 ? (
              <div className="p-8 text-center text-xs text-tertiary">No templates found in this category.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeTemplatesList.map((tpl: any) => {
                  const isSelected = !!selectedTemplateSlugs[tpl.slug]
                  const params = templateParams[tpl.slug] || { rooms: 4, attendees: 1000, stations: 4 }
                  
                  return (
                    <Card
                      key={tpl.slug}
                      className={`p-5 rounded-2xl border transition-all relative flex flex-col justify-between
                        ${isSelected ? "bg-brand-primary/5 border-brand-primary/40" : "bg-surface-2/40 border-border hover:border-brand-primary/30"}`}
                    >
                      <div className="space-y-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="text-xs font-bold text-primary">{tpl.name}</h4>
                            <span className="text-[10px] text-secondary">{tpl.description || "No description provided"}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleToggleTemplate(tpl.slug)}
                            className={`h-6 w-6 rounded-full flex items-center justify-center border transition-all
                              ${isSelected ? "bg-brand-primary border-brand-primary text-white" : "bg-surface-2 border-border text-tertiary"}`}
                          >
                            {isSelected ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                          </button>
                        </div>

                        {/* Selective Specification Display (Strictly hide hardware and staff allocations count) */}
                        <div className="pt-2 border-t border-border/40 space-y-1.5">
                          {tpl.template_type === "registration" && (
                            <>
                              <div className="flex justify-between text-[10px] font-bold text-secondary">
                                <span>Check-in counters:</span>
                                <span className="text-primary">{tpl.specs?.reg_counters || 4} Counters</span>
                              </div>
                              <div className="flex justify-between text-[10px] font-bold text-secondary">
                                <span>Self check-in kiosks:</span>
                                <span className="text-primary">{tpl.specs?.kiosks || 2} Kiosks</span>
                              </div>
                              {isSelected && (
                                <div className="pt-2 space-y-1">
                                  <label className="text-[9px] text-brand-primary uppercase tracking-wider font-extrabold block">Attendee Volume scaling</label>
                                  <Input
                                    type="number"
                                    value={params.attendees}
                                    onChange={e => handleUpdateTemplateParam(tpl.slug, "attendees", parseInt(e.target.value) || 1000)}
                                    className="h-8 text-xs bg-surface-2 border-border"
                                  />
                                </div>
                              )}
                            </>
                          )}

                          {tpl.template_type === "srr" && (
                            <>
                              <div className="flex justify-between text-[10px] font-bold text-secondary">
                                <span>Preview Stations:</span>
                                <span className="text-primary">{tpl.specs?.preview_stations || 8} Stations</span>
                              </div>
                              <div className="flex justify-between text-[10px] font-bold text-secondary">
                                <span>Upload Stations:</span>
                                <span className="text-primary">{tpl.specs?.upload_stations || 4} Stations</span>
                              </div>
                              {isSelected && (
                                <div className="pt-2 space-y-1">
                                  <label className="text-[9px] text-brand-primary uppercase tracking-wider font-extrabold block">Stations capacity</label>
                                  <Input
                                    type="number"
                                    value={params.stations}
                                    onChange={e => handleUpdateTemplateParam(tpl.slug, "stations", parseInt(e.target.value) || 4)}
                                    className="h-8 text-xs bg-surface-2 border-border"
                                  />
                                </div>
                              )}
                            </>
                          )}

                          {tpl.template_type === "room" && (
                            <>
                              <div className="flex justify-between text-[10px] font-bold text-secondary">
                                <span>Default Room Capacity:</span>
                                <span className="text-primary">{tpl.specs?.default_capacity || 100} Seating</span>
                              </div>
                              <div className="flex justify-between text-[10px] font-bold text-secondary">
                                <span>Setup Time needed:</span>
                                <span className="text-primary">{tpl.specs?.setup_time || 2} Hours</span>
                              </div>
                              {isSelected && (
                                <div className="pt-2 space-y-1">
                                  <label className="text-[9px] text-brand-primary uppercase tracking-wider font-extrabold block">Parallel Rooms count</label>
                                  <Input
                                    type="number"
                                    value={params.rooms}
                                    onChange={e => handleUpdateTemplateParam(tpl.slug, "rooms", parseInt(e.target.value) || 4)}
                                    className="h-8 text-xs bg-surface-2 border-border"
                                  />
                                </div>
                              )}
                            </>
                          )}

                          {tpl.template_type === "network" && (
                            <>
                              <div className="flex justify-between text-[10px] font-bold text-secondary">
                                <span>Access Points:</span>
                                <span className="text-primary">{tpl.specs?.access_points || 8} APs</span>
                              </div>
                              <div className="flex justify-between text-[10px] font-bold text-secondary">
                                <span>Bandwidth Target:</span>
                                <span className="text-primary">Up to 1 Gbps</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>

          {/* 3. Standard Standalone Add-ons */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-6">
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-secondary mb-4 flex items-center gap-1.5">
              3. Inject Standalone Add-ons
            </h3>

            <div className="space-y-3.5">
              {addonsCatalog.map(addon => {
                const qty = addons[addon.id] || 0
                return (
                  <div key={addon.id} className="flex justify-between items-center p-3 rounded-2xl bg-surface-2/40 border border-border/40 hover:border-brand-primary/20 transition-colors">
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

        {/* Right Side: Sticky Pricing Sandpit & Cover Preview */}
        <div className="xl:col-span-4 space-y-6">
          
          {/* Pricing settings card */}
          <Card className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-6 space-y-4">
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-secondary flex items-center gap-1.5">
              <Settings className="h-4 w-4 text-brand-primary" /> Proposal Parameters
            </h3>

            <div className="space-y-3.5 text-xs font-semibold text-secondary">
              <div>
                <label className="text-xs text-secondary mb-1 block">Proposal Document Title</label>
                <Input
                  value={inputs.proposalTitle}
                  onChange={e => setInputs(prev => ({ ...prev, proposalTitle: e.target.value }))}
                  className="bg-surface-2 border-border text-xs"
                />
              </div>

              <div>
                <label className="text-xs text-secondary mb-1 block">Client Name / Organizer</label>
                <Input
                  value={inputs.clientName}
                  onChange={e => setInputs(prev => ({ ...prev, clientName: e.target.value }))}
                  className="bg-surface-2 border-border text-xs"
                />
              </div>

              <div>
                <label className="text-xs text-secondary mb-1 block">Event Duration (Days)</label>
                <Input
                  type="number"
                  value={inputs.eventDays}
                  onChange={e => setInputs(prev => ({ ...prev, eventDays: parseInt(e.target.value) || 1 }))}
                  className="bg-surface-2 border-border text-xs"
                />
              </div>

              <div className="pt-3 border-t border-border/60 space-y-3 text-[11px] text-secondary">
                <div className="flex justify-between">
                  <span>Equipment Rentals Base:</span>
                  <span className="font-mono text-primary">{formatINR(calculations.hardware)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Manpower Support Base:</span>
                  <span className="font-mono text-primary">{formatINR(calculations.staff)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Contingency Buffer ({inputs.contingency_pct}%):</span>
                  <span className="font-mono text-primary">{formatINR(calculations.contingency)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Profit Margin Target ({inputs.margin_pct}%):</span>
                  <span className="font-mono text-primary">{formatINR(calculations.profit)}</span>
                </div>
                <div className="flex justify-between text-brand-primary font-bold">
                  <span>GST Taxes (18%):</span>
                  <span className="font-mono">{formatINR(calculations.gst)}</span>
                </div>
              </div>

              <div className="pt-3 border-t border-border flex justify-between items-baseline">
                <span className="text-xs font-bold text-primary">Proposal Value</span>
                <span className="text-base font-black font-mono text-brand-primary">{formatINR(calculations.total)}</span>
              </div>

              <Button
                onClick={handlePrint}
                disabled={calculations.total === 0}
                className="w-full bg-brand-primary hover:bg-brand-primary/90 text-white font-bold text-xs gap-1.5 h-9"
              >
                <Printer className="h-4 w-4" /> Print / Export Proposal PDF
              </Button>
            </div>
          </Card>

          {/* Document Cover page Live Preview */}
          <div
            className="w-full aspect-[4/3] rounded-3xl p-8 flex flex-col justify-between text-white shadow-xl relative overflow-hidden transition-all duration-300"
            style={{ backgroundColor: inputs.colorTheme }}
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_75%_25%,rgba(255,255,255,0.06),transparent_16rem)]" />
            
            <div className="flex justify-between items-start">
              <span className="text-xs font-black tracking-widest">Event</span>
              <span className="text-[8px] bg-white/10 px-2 py-0.5 rounded-full uppercase tracking-wider font-extrabold border border-white/20">Proposal Preview</span>
            </div>

            <div>
              <h2 className="text-lg sm:text-xl font-extrabold tracking-tight max-w-xs leading-tight line-clamp-2">
                {inputs.proposalTitle || "Untitled Proposal Document"}
              </h2>
              <p className="text-[10px] text-white/80 max-w-xs mt-2 leading-relaxed line-clamp-3">
                {inputs.coverNote}
              </p>
            </div>

            <div className="flex justify-between items-end border-t border-white/10 pt-3 text-[9px] text-white/70">
              <div>
                <span className="block font-semibold uppercase text-white/50 text-[7px] tracking-widest mb-0.5">Prepared For</span>
                <span className="font-bold text-white text-xs">{inputs.clientName}</span>
              </div>
              <div className="text-right">
                <span className="block font-semibold uppercase text-white/50 text-[7px] tracking-widest mb-0.5">Event Duration</span>
                <span className="font-bold text-white text-xs">{inputs.eventDays} Days</span>
              </div>
            </div>
          </div>

        </div>

      </div>
    </PageContainer>
  )
}
