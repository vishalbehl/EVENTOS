"use client"
import { useState, useMemo, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { usePricingRules, useRunPricingSimulation, useHardwareCatalog, useStaffCatalog, useCatalogTemplates, formatINR, usePricingSimulations, useAddons, type Addon } from "@/services/super-admin-service"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader"
import { PremiumTemplateCard } from "@/components/super-admin/ui/PremiumTemplateCard"
import { TemplateDetailSheet } from "@/components/super-admin/ui/TemplateDetailSheet"
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock"
import styles from "./pricing-simulator.module.css"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Trash2, Plus, Minus, Sparkles, RefreshCw, Save, FileText, CheckCircle2, Search, X, Check, ArrowRight, ArrowLeft, Percent, Printer, Layout, Users, Grid, Pencil } from "lucide-react"
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

type TemplateCategory = "registration" | "srr" | "room"

const attendeeRangeOptions = Array.from({ length: 10 }, (_, index) => {
  const min = 50 + (index * 100)
  const max = Math.min(min + 100, 1000)
  return { label: `${min.toLocaleString()} - ${max.toLocaleString()}`, value: max, min, max }
})
const speakerRangeOptions = Array.from({ length: 10 }, (_, index) => {
  const min = 5 + (index * 10)
  const max = Math.min(min + 10, 100)
  return { label: `${min} - ${max}`, value: max, min, max }
})
const roomOptions = Array.from({ length: 10 }, (_, index) => ({ label: String(index + 1), value: index + 1 }))
const dayOptions = Array.from({ length: 10 }, (_, index) => ({ label: String(index + 1), value: index + 1 }))

type RoomAssignment = {
  id: string
  name: string
  templateSlug: string
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

type SavedAllocationItem = {
  id: string
  name: string
  qty: number
  days?: number
  category?: string
  department?: string
  unit?: string
  sources: string[]
  actualUnitCost: number
  askedUnitCost: number
  actualTotalCost: number
  askedTotalCost: number
}

export default function PricingSimulatorPage() {
  const { data: rules = [] } = usePricingRules()
  const { data: hardwareData } = useHardwareCatalog({ limit: 100 })
  const { data: staffData } = useStaffCatalog({ limit: 100 })
  const { data: templatesData } = useCatalogTemplates()
  const { refetch: refetchSimulations } = usePricingSimulations()
  const runSimulation = useRunPricingSimulation()
  const { data: dbAddons = [] } = useAddons()
  const addonsCatalog = useMemo(() => dbAddons.filter((addon: Addon) => addon.is_active && addon.addon_type !== "PLAN"), [dbAddons])

  /* Legacy duplicate block retained temporarily during the earlier redesign.
     The active implementation starts below this block. */
  /*
  const [currentStep, setCurrentStep] = useState(1)
  const [activeCategory, setActiveCategory] = useState<TemplateCategory>("registration")

  // Database add-ons selection state (quantities)
  const [addons, setAddons] = useState<Record<string, number>>({})

  // Global inputs
  const [inputs, setInputs] = useState({
    event_city_tier: "Tier 1 - Metro City",
    event_days: 3,
    simulationName: "Quote - " + new Date().toLocaleDateString(),
    preparedBy: "Super Admin",
    customer: "Venue Corp Client",
    refNumber: "SIM-" + Math.floor(Math.random() * 90000 + 10000),
    notes: ""
  })
  const [pdfTemplate, setPdfTemplate] = useState({
    companyName: "EVENTX",
    companyTagline: "Event Technology Solutions",
    logoUrl: "",
    stampUrl: "",
    stampLabel: "Approved",
    footerText: "Thank you for considering EventX for your event technology needs.",
    coverTitle: "Pricing Proposal",
    coverSubtitle: "Event Technology Quotation",
    solutionTitle: "Solution Configuration",
    solutionSubtitle: "Service & Infrastructure Overview",
    addOnsTitle: "Add-ons",
    addOnsSubtitle: "Additional Services Included",
    summaryTitle: "Commercial Summary",
    summarySubtitle: "Investment Overview",
    termsTitle: "Terms & Conditions",
    termsItems: "This quotation is valid for the period shown.\nPrices are in INR and inclusive of applicable taxes shown.\nPayment schedule and scope will be confirmed during onboarding.",
    nextStepsTitle: "Next Steps",
    nextStepsItems: "Review this proposal and confirm acceptance.\nWe will schedule a detailed planning call.\nResource allocation and logistics will be initiated.",
    validityDays: 14,
  })
  const [pdfTemplate, setPdfTemplate] = useState({
    companyName: "EVENTX",
    companyTagline: "Event Technology Solutions",
    logoUrl: "",
    stampUrl: "",
    stampLabel: "Approved",
    footerText: "Thank you for considering EventX for your event technology needs.",
    coverTitle: "Pricing Proposal",
    coverSubtitle: "Event Technology Quotation",
    solutionTitle: "Solution Configuration",
    solutionSubtitle: "Service & Infrastructure Overview",
    addOnsTitle: "Add-ons",
    addOnsSubtitle: "Additional Services Included",
    summaryTitle: "Commercial Summary",
    summarySubtitle: "Investment Overview",
    termsTitle: "Terms & Conditions",
    termsItems: "This quotation is valid for the period shown.\nPrices are in INR and inclusive of applicable taxes shown.\nPayment schedule and scope will be confirmed during onboarding.",
    nextStepsTitle: "Next Steps",
    nextStepsItems: "Review this proposal and confirm acceptance.\nWe will schedule a detailed planning call.\nResource allocation and logistics will be initiated.",
    validityDays: 14,
  })
  // Default each category to the global event duration so costs are right
  // out of the box; user can fine-tune per category with the +/- buttons.
  const [categoryDays, setCategoryDays] = useState<Record<TemplateCategory, number>>({
    registration: 3,
    srr: 3,
    room: 3
  })

  // Selected templates and their parameters
  const [selectedTemplates, setSelectedTemplates] = useState<Record<string, SelectedTemplateConfig>>({})

  // Margins parameters — everything starts at zero, so the suggested quote
  // equals the actual cost until the user chooses to add margins, fees or tax.
  const [margins, setMargins] = useState({
    overhead_pct: 0,
    contingency_pct: 0,
    margin_pct: 0,
    discount_pct: 0,
    gst_pct: 0
  })

  // Save Modal state
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [modalCategory, setModalCategory] = useState<TemplateCategory | null>(null)
  const [detailTemplate, setDetailTemplate] = useState<{ template: any; category: TemplateCategory } | null>(null)
  const proposalIframeRef = useRef<HTMLIFrameElement>(null)

  useBodyScrollLock(Boolean(showSaveModal || showEditModal || modalCategory !== null || detailTemplate))

  // Event wizard — pre-Step 1 form to capture attendee/room/speaker ranges
  const [wizardDone, setWizardDone] = useState(false)
  // Every question we ask the user starts at 0 — they fill in real numbers,
  // consistent with margins (which also start at 0).
  const [wizard, setWizard] = useState({
    minAttendees: 0,
    maxAttendees: 0,
    roomCount: 0,
    deskCount: 0,
    minSpeakers: 0,
    maxSpeakers: 0,
    srrStations: 0,
  })
  const [questionIndex, setQuestionIndex] = useState(0)
  const [customAnswers, setCustomAnswers] = useState<Record<string, boolean>>({})

  // Named room list — lets different physical rooms (Room A, Room B, ...)
  // use different room templates. The count per template slug drives that
  // template's scale factor (hardware quantity, projected cost).
  const [roomAssignments, setRoomAssignments] = useState<RoomAssignment[]>([])

  // Keep all category day counts in sync with the global event_days whenever
  // the user updates it in the Edit modal.
  useEffect(() => {
    const d = inputs.event_days
    setCategoryDays({ registration: d, srr: d, room: d })
  }, [inputs.event_days])

  // Preset options for the City Tier dropdown
  const cityTierOptions = ["Tier 1 - Metro City", "Tier 2 - City", "Tier 3 - Town"]

  const getAddonCommercialRange = (addon: Addon) => {
    const min = Number(addon.min_price_inr ?? addon.price_inr ?? addon.max_price_inr ?? 0)
    const max = Number(addon.max_price_inr ?? addon.price_inr ?? addon.min_price_inr ?? 0)
    return { min, max: Math.max(min, max) }
  }
  const getAddonCommercialAmount = (addon: Addon) => getAddonCommercialRange(addon).min

  const getAddonBillingLabel = (addon: Addon) =>
    (addon.billing_unit || "PER_EVENT").replace(/_/g, " ").toLowerCase()

  const getAddonOperationalCost = (addon: Addon, quantity = 1) => {
    const hardwareCost = (addon.hardware_spec || []).reduce((acc: number, spec: any) => {
      const hw = hardwareList.find((item: any) => item.id === spec.item_id)
      return acc + (Number(hw?.selling_price || 0) * Number(spec.quantity || 0) * Number(spec.days || 1))
    }, 0)
    const staffCost = (addon.staff_spec || []).reduce((acc: number, spec: any) => {
      const staff = staffRolesList.find((item: any) => item.id === spec.role_id)
      return acc + (Number(staff?.selling_per_day || 0) * Number(spec.quantity || 0) * Number(spec.days || 1))
    }, 0)
    const consumablesCost = Number(addon.consumables_cost || 0)

    return {
      hardware: hardwareCost * quantity,
      staff: staffCost * quantity,
      consumables: consumablesCost * quantity,
      total: (hardwareCost + staffCost + consumablesCost) * quantity,
    }
  }

  // The client-facing add-on price includes its configured commercial amount
  // plus the hardware and staff required to deliver one unit.
  const getAddonPrice = (addon: Addon) => {
    const operational = getAddonOperationalCost(addon)
    return getAddonCommercialAmount(addon) + operational.hardware + operational.staff
  }
  const getAddonPriceRange = (addon: Addon) => {
    const commercial = getAddonCommercialRange(addon)
    const operational = getAddonOperationalCost(addon)
    return {
      min: commercial.min + operational.hardware + operational.staff,
      max: commercial.max + operational.hardware + operational.staff,
    }
  }
  const getAddonPriceLabel = (addon: Addon) => {
    const range = getAddonPriceRange(addon)
    return range.min === range.max ? formatINR(range.min) : `${formatINR(range.min)} - ${formatINR(range.max)}`
  }

  const getAddonOperationalCost = (addon: Addon, quantity = 1) => {
    const hardwareCost = (addon.hardware_spec || []).reduce((acc: number, spec: any) => {
      const hw = hardwareList.find((item: any) => item.id === spec.item_id)
      return acc + (Number(hw?.selling_price || 0) * Number(spec.quantity || 0) * Number(spec.days || 1))
    }, 0)
    const staffCost = (addon.staff_spec || []).reduce((acc: number, spec: any) => {
      const staff = staffRolesList.find((item: any) => item.id === spec.role_id)
      return acc + (Number(staff?.selling_per_day || 0) * Number(spec.quantity || 0) * Number(spec.days || 1))
    }, 0)
    const consumablesCost = Number(addon.consumables_cost || 0)

    return {
      hardware: hardwareCost * quantity,
      staff: staffCost * quantity,
      consumables: consumablesCost * quantity,
      total: (hardwareCost + staffCost + consumablesCost) * quantity,
    }
  }

  const getTemplatePrice = (tpl: any) => {
    const days = Math.max(1, Number(categoryDays[tpl.template_type as TemplateCategory] || inputs.event_days || 1))
    const factor = tpl.template_type === "room" ? Math.max(1, roomAssignments.filter(r => r.templateSlug === tpl.slug).length || 1) : 1
    const hardwareCost = (tpl.hardware_allocation || []).reduce((acc: number, alloc: any) => {
      return acc + getHardwareLineCost(alloc.hardware_item_id, alloc.quantity * factor, days)
    }, 0)

    const staffCost = (tpl.staff_allocation || []).reduce((acc: number, alloc: any) => {
      const rate = staffPricesMap[alloc.staff_role_id] || 0
      const qty = tpl.template_type === "room" ? alloc.quantity * factor : alloc.quantity
      return acc + qty * rate * days
    }, 0)

    if (tpl.template_type === "registration") {
      const badgePrice = parseFloat(tpl.badge_per_piece_cost) || 0
      const minBadgeCost = (tpl.min_attendees || 0) * badgePrice
      const maxBadgeCost = (tpl.max_attendees || 0) * badgePrice
      return {
        min: hardwareCost + staffCost + minBadgeCost,
        max: hardwareCost + staffCost + maxBadgeCost,
      }
    }

    const operationalCost = hardwareCost + staffCost
    return { min: operationalCost, max: operationalCost }
  }

  const formatTemplatePrice = (price: { min: number; max: number }) => {
    if (price.min !== price.max) return `${formatINR(price.min)} - ${formatINR(price.max)}`
    return formatINR(price.min)
  }

  const getTemplateSpecRows = (tpl: any) => {
    const readSpec = (...keys: string[]) => {
      for (const key of keys) {
        const value = tpl[key] ?? tpl.specs?.[key]
        if (value !== undefined && value !== null && value !== "") return value
      }
      return 0
    }
    const hardwareCount = (tpl.hardware_allocation || []).reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0)
    const peopleCount = (tpl.staff_allocation || []).reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0)
    const rows = [
      { label: "Template Type", value: tpl.template_type, always: true },
      { label: "Hardware", value: `${hardwareCount} items`, always: true },
      { label: "People", value: `${peopleCount} pax`, always: true },
      { label: "Podiums", value: readSpec("podiums") || (tpl.name?.toLowerCase().includes("podium") ? 1 : 0) },
      { label: "Kiosks", value: readSpec("kiosks") },
      { label: "Counters", value: readSpec("reg_counters", "counters") },
      { label: "Printers", value: readSpec("badge_printers", "printers") },
      { label: "Preview Stations", value: readSpec("preview_stations") },
      { label: "Upload Stations", value: readSpec("upload_stations") },
      { label: "Wi-Fi Nodes", value: readSpec("access_points", "nodes") },
      { label: "Rooms", value: readSpec("rooms") },
      { label: "Capacity", value: readSpec("capacity", "default_capacity") },
      { label: "Check-ins / hr", value: readSpec("checkins_per_hour") },
      { label: "Venue add-ons", value: addonsCatalog.filter(addon => addon.template_types?.includes(tpl.template_type)).map(addon => addon.name).join(", ") },
    ]

    return rows.filter(row => row.always || (typeof row.value === "string" ? row.value.length > 0 : Number(row.value) > 0))
  }

  const isRecommended = (tpl: any, category: TemplateCategory): boolean => {
    if (category === "registration") {
      const minOk = !tpl.min_attendees || tpl.min_attendees <= wizard.minAttendees
      const maxOk = !tpl.max_attendees || tpl.max_attendees >= wizard.maxAttendees
      return minOk && maxOk
    }
    if (category === "srr") {
      const minOk = !tpl.min_speakers || tpl.min_speakers <= wizard.minSpeakers
      const maxOk = !tpl.max_speakers || tpl.max_speakers >= wizard.maxSpeakers
      return minOk && maxOk
    }
    if (category === "room") return (tpl.default_capacity ?? 0) > 0
    return true
  }

  // Lists
  const hardwareList = useMemo(() => hardwareData?.items ?? [], [hardwareData])
  const staffRolesList = useMemo(() => staffData?.items ?? [], [staffData])

  const roomTemplates = templatesData?.room_templates ?? []
  const registrationTemplates = templatesData?.registration_templates ?? []
  const srrTemplates = templatesData?.srr_templates ?? []

  const suggestedRegistrationTemplate = useMemo(() => registrationTemplates
    .filter((tpl: any) => (!tpl.min_attendees || tpl.min_attendees <= wizard.minAttendees) && (!tpl.max_attendees || tpl.max_attendees >= wizard.maxAttendees))
    .sort((a: any, b: any) => Number(a.max_attendees || Infinity) - Number(b.max_attendees || Infinity))[0],
  [registrationTemplates, wizard.minAttendees, wizard.maxAttendees])
  const suggestedSrrTemplate = useMemo(() => srrTemplates
    .filter((tpl: any) => (!tpl.min_speakers || tpl.min_speakers <= wizard.minSpeakers) && (!tpl.max_speakers || tpl.max_speakers >= wizard.maxSpeakers))
    .sort((a: any, b: any) => Number(a.max_speakers || Infinity) - Number(b.max_speakers || Infinity))[0],
  [srrTemplates, wizard.minSpeakers, wizard.maxSpeakers])

  useEffect(() => {
    setWizard(prev => ({
      ...prev,
      deskCount: Number(suggestedRegistrationTemplate?.reg_counters || 0),
      srrStations: Number(suggestedSrrTemplate?.preview_stations || suggestedSrrTemplate?.checkin_counters || 0),
    }))
  }, [suggestedRegistrationTemplate, suggestedSrrTemplate])

  const allTemplatesList = useMemo(() => {
    // The API does not return a template_type field, so we tag each template
    // with its category based on which list it came from. Everything downstream
    // (category breakdown, scaling, cost totals) relies on template_type./
    return [
      ...roomTemplates.map((t: any) => ({ ...t, template_type: t.template_type || "room" })),
      ...registrationTemplates.map((t: any) => ({ ...t, template_type: t.template_type || "registration" })),
      ...srrTemplates.map((t: any) => ({ ...t, template_type: t.template_type || "srr" })),
    ]
  }, [roomTemplates, registrationTemplates, srrTemplates])

  const activeTemplatesList = useMemo(() => {
    switch (activeCategory) {
      case "room": return roomTemplates
      case "registration": return registrationTemplates
      case "srr": return srrTemplates
      default: return []
    }
  }, [activeCategory, roomTemplates, registrationTemplates, srrTemplates])

  // Category Configuration
  const categoriesList = [
    { id: "registration", label: "Registration", icon: Users, desc: "Check-in counters, kiosks and badge printers", count: registrationTemplates.length },
    { id: "srr", label: "Speaker Ready Room", icon: Grid, desc: "Preview stations and check-in desks for speakers", count: srrTemplates.length },
    { id: "room", label: "Rooms", icon: Layout, desc: "Equipment and staff for presentation rooms", count: roomTemplates.length },
  ]
  */
  const [currentStep, setCurrentStep] = useState(1)
  const [activeCategory, setActiveCategory] = useState<TemplateCategory>("registration")

  // Database add-ons selection state (quantities)
  const [addons, setAddons] = useState<Record<string, number>>({})

  // Global inputs
  const [inputs, setInputs] = useState({
    event_city_tier: "Tier 1 - Metro City",
    event_days: 3,
    simulationName: "Quote - " + new Date().toLocaleDateString(),
    preparedBy: "Super Admin",
    customer: "Venue Corp Client",
    refNumber: "SIM-" + Math.floor(Math.random() * 90000 + 10000),
    notes: ""
  })
  const [pdfTemplate, setPdfTemplate] = useState({
    companyName: "EVENTX",
    companyTagline: "Event Technology Solutions",
    logoUrl: "",
    stampUrl: "",
    stampLabel: "Approved",
    footerText: "Thank you for considering EventX for your event technology needs.",
    coverTitle: "Pricing Proposal",
    coverSubtitle: "Event Technology Quotation",
    solutionTitle: "Solution Configuration",
    solutionSubtitle: "Service & Infrastructure Overview",
    addOnsTitle: "Add-ons",
    addOnsSubtitle: "Additional Services Included",
    summaryTitle: "Commercial Summary",
    summarySubtitle: "Investment Overview",
    termsTitle: "Terms & Conditions",
    termsItems: "This quotation is valid for the period shown.\nPrices are in INR and inclusive of applicable taxes shown.\nPayment schedule and scope will be confirmed during onboarding.",
    nextStepsTitle: "Next Steps",
    nextStepsItems: "Review this proposal and confirm acceptance.\nWe will schedule a detailed planning call.\nResource allocation and logistics will be initiated.",
    validityDays: 14,
  })
  // Default each category to the global event duration so costs are right
  // out of the box; user can fine-tune per category with the +/- buttons.
  const [categoryDays, setCategoryDays] = useState<Record<TemplateCategory, number>>({
    registration: 3,
    srr: 3,
    room: 3
  })

  // Selected templates and their parameters
  const [selectedTemplates, setSelectedTemplates] = useState<Record<string, SelectedTemplateConfig>>({})

  // Margins parameters — everything starts at zero, so the suggested quote
  // equals the actual cost until the user chooses to add margins, fees or tax.
  const [margins, setMargins] = useState({
    overhead_pct: 0,
    contingency_pct: 0,
    margin_pct: 0,
    discount_pct: 0,
    gst_pct: 0
  })

  // Save Modal state
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [modalCategory, setModalCategory] = useState<TemplateCategory | null>(null)
  const [detailTemplate, setDetailTemplate] = useState<{ template: any; category: TemplateCategory } | null>(null)
  const [detailAddon, setDetailAddon] = useState<Addon | null>(null)
  const proposalIframeRef = useRef<HTMLIFrameElement>(null)
  const [carouselTick, setCarouselTick] = useState(0)
  useBodyScrollLock(Boolean(showSaveModal || showEditModal || modalCategory !== null || detailTemplate || detailAddon))

  // Event wizard — pre-Step 1 form to capture attendee/room/speaker ranges
  const [wizardDone, setWizardDone] = useState(false)
  // Every question we ask the user starts at 0 — they fill in real numbers,
  // consistent with margins (which also start at 0).
  const [wizard, setWizard] = useState({
    minAttendees: 0,
    maxAttendees: 0,
    roomCount: 0,
    deskCount: 0,
    minSpeakers: 0,
    maxSpeakers: 0,
    srrStations: 0,
  })
  const [questionIndex, setQuestionIndex] = useState(0)
  const [customAnswers, setCustomAnswers] = useState<Record<string, boolean>>({})

  // Named room list — lets different physical rooms (Room A, Room B, ...)
  // use different room templates. The count per template slug drives that
  // template's scale factor (hardware quantity, projected cost).
  const [roomAssignments, setRoomAssignments] = useState<RoomAssignment[]>([])

  // Keep all category day counts in sync with the global event_days whenever
  // the user updates it in the Edit modal.
  useEffect(() => {
    const d = inputs.event_days
    setCategoryDays({ registration: d, srr: d, room: d })
  }, [inputs.event_days])

  useEffect(() => {
    const id = window.setInterval(() => setCarouselTick((prev) => prev + 1), 3200)
    return () => window.clearInterval(id)
  }, [])

  // Preset options for the City Tier dropdown
  const cityTierOptions = ["Tier 1 - Metro City", "Tier 2 - City", "Tier 3 - Town"]

  const getAddonCommercialRange = (addon: Addon) => {
    const min = Number(addon.min_price_inr ?? addon.price_inr ?? addon.max_price_inr ?? 0)
    const max = Number(addon.max_price_inr ?? addon.price_inr ?? addon.min_price_inr ?? 0)
    return { min, max: Math.max(min, max) }
  }
  const getAddonCommercialAmount = (addon: Addon) => getAddonCommercialRange(addon).min

  const getAddonBillingLabel = (addon: Addon) =>
    (addon.billing_unit || "PER_EVENT").replace(/_/g, " ").toLowerCase()

  const getAddonOperationalCost = (addon: Addon, quantity = 1) => {
    const hardwareCost = (addon.hardware_spec || []).reduce((acc: number, spec: any) => {
      const hw = hardwareList.find((item: any) => item.id === spec.item_id)
      return acc + (Number(hw?.selling_price || 0) * Number(spec.quantity || 0) * Number(spec.days || 1))
    }, 0)
    const staffCost = (addon.staff_spec || []).reduce((acc: number, spec: any) => {
      const staff = staffRolesList.find((item: any) => item.id === spec.role_id)
      return acc + (Number(staff?.selling_per_day || 0) * Number(spec.quantity || 0) * Number(spec.days || 1))
    }, 0)
    const consumablesCost = Number(addon.consumables_cost || 0)

    return {
      hardware: hardwareCost * quantity,
      staff: staffCost * quantity,
      consumables: consumablesCost * quantity,
      total: (hardwareCost + staffCost + consumablesCost) * quantity,
    }
  }

  // The client-facing add-on price includes its configured commercial amount
  // plus the hardware and staff required to deliver one unit.
  const getAddonPrice = (addon: Addon) => {
    const operational = getAddonOperationalCost(addon)
    return getAddonCommercialAmount(addon) + operational.hardware + operational.staff
  }
  const getAddonPriceRange = (addon: Addon) => {
    const commercial = getAddonCommercialRange(addon)
    const operational = getAddonOperationalCost(addon)
    return {
      min: commercial.min + operational.hardware + operational.staff,
      max: commercial.max + operational.hardware + operational.staff,
    }
  }
  const getAddonPriceLabel = (addon: Addon) => {
    const range = getAddonPriceRange(addon)
    return range.min === range.max ? formatINR(range.min) : `${formatINR(range.min)} - ${formatINR(range.max)}`
  }

  const getTemplatePrice = (tpl: any) => {
    const hardwareCost = (tpl.hardware_allocation || []).reduce((acc: number, alloc: any) => {
      const rate = hardwarePricesMap[alloc.hardware_item_id] || 0
      return acc + alloc.quantity * rate
    }, 0)

    const staffCost = (tpl.staff_allocation || []).reduce((acc: number, alloc: any) => {
      const rate = staffPricesMap[alloc.staff_role_id] || 0
      return acc + alloc.quantity * rate
    }, 0)

    if (tpl.template_type === "registration") {
      const badgePrice = parseFloat(tpl.badge_per_piece_cost) || 0
      const minBadgeCost = (tpl.min_attendees || 0) * badgePrice
      const maxBadgeCost = (tpl.max_attendees || 0) * badgePrice
      return {
        min: hardwareCost + staffCost + minBadgeCost,
        max: hardwareCost + staffCost + maxBadgeCost,
      }
    }

    const operationalCost = hardwareCost + staffCost
    return { min: operationalCost, max: operationalCost }
  }

  const formatTemplatePrice = (price: { min: number; max: number }) => {
    if (price.min !== price.max) return `${formatINR(price.min)} - ${formatINR(price.max)}`
    return formatINR(price.min)
  }

  const getTemplateSpecRows = (tpl: any) => {
    const readSpec = (...keys: string[]) => {
      for (const key of keys) {
        const value = tpl[key] ?? tpl.specs?.[key]
        if (value !== undefined && value !== null && value !== "") return value
      }
      return 0
    }
    const hardwareCount = (tpl.hardware_allocation || []).reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0)
    const peopleCount = (tpl.staff_allocation || []).reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0)
    const rows = [
      { label: "Template Type", value: tpl.template_type, always: true },
      { label: "Hardware", value: `${hardwareCount} items`, always: true },
      { label: "People", value: `${peopleCount} pax`, always: true },
      { label: "Podiums", value: readSpec("podiums") || (tpl.name?.toLowerCase().includes("podium") ? 1 : 0) },
      { label: "Kiosks", value: readSpec("kiosks") },
      { label: "Counters", value: readSpec("reg_counters", "counters") },
      { label: "Printers", value: readSpec("badge_printers", "printers") },
      { label: "Preview Stations", value: readSpec("preview_stations") },
      { label: "Upload Stations", value: readSpec("upload_stations") },
      { label: "Wi-Fi Nodes", value: readSpec("access_points", "nodes") },
      { label: "Rooms", value: readSpec("rooms") },
      { label: "Capacity", value: readSpec("capacity", "default_capacity") },
      { label: "Check-ins / hr", value: readSpec("checkins_per_hour") },
      { label: "Venue add-ons", value: addonsCatalog.filter(addon => addon.template_types?.includes(tpl.template_type)).map(addon => addon.name).join(", ") },
    ]

    return rows.filter(row => row.always || (typeof row.value === "string" ? row.value.length > 0 : Number(row.value) > 0))
  }

  const isRecommended = (tpl: any, category: TemplateCategory): boolean => {
    if (category === "registration") {
      const minOk = !tpl.min_attendees || tpl.min_attendees <= wizard.minAttendees
      const maxOk = !tpl.max_attendees || tpl.max_attendees >= wizard.maxAttendees
      return minOk && maxOk
    }
    if (category === "srr") {
      const minOk = !tpl.min_speakers || tpl.min_speakers <= wizard.minSpeakers
      const maxOk = !tpl.max_speakers || tpl.max_speakers >= wizard.maxSpeakers
      return minOk && maxOk
    }
    if (category === "room") return (tpl.default_capacity ?? 0) > 0
    return true
  }

  // Lists
  const hardwareList = useMemo(() => hardwareData?.items ?? [], [hardwareData])
  const staffRolesList = useMemo(() => staffData?.items ?? [], [staffData])

  const roomTemplates = templatesData?.room_templates ?? []
  const registrationTemplates = templatesData?.registration_templates ?? []
  const srrTemplates = templatesData?.srr_templates ?? []

  const suggestedRegistrationTemplate = useMemo(() => registrationTemplates
    .filter((tpl: any) => (!tpl.min_attendees || tpl.min_attendees <= wizard.minAttendees) && (!tpl.max_attendees || tpl.max_attendees >= wizard.maxAttendees))
    .sort((a: any, b: any) => Number(a.max_attendees || Infinity) - Number(b.max_attendees || Infinity))[0],
  [registrationTemplates, wizard.minAttendees, wizard.maxAttendees])
  const suggestedSrrTemplate = useMemo(() => srrTemplates
    .filter((tpl: any) => (!tpl.min_speakers || tpl.min_speakers <= wizard.minSpeakers) && (!tpl.max_speakers || tpl.max_speakers >= wizard.maxSpeakers))
    .sort((a: any, b: any) => Number(a.max_speakers || Infinity) - Number(b.max_speakers || Infinity))[0],
  [srrTemplates, wizard.minSpeakers, wizard.maxSpeakers])

  useEffect(() => {
    setWizard(prev => ({
      ...prev,
      deskCount: Number(suggestedRegistrationTemplate?.reg_counters || 0),
      srrStations: Number(suggestedSrrTemplate?.preview_stations || suggestedSrrTemplate?.checkin_counters || 0),
    }))
  }, [suggestedRegistrationTemplate, suggestedSrrTemplate])

  const allTemplatesList = useMemo(() => {
    // The API does not return a template_type field, so we tag each template
    // with its category based on which list it came from. Everything downstream
    // (category breakdown, scaling, cost totals) relies on template_type./
    return [
      ...roomTemplates.map((t: any) => ({ ...t, template_type: t.template_type || "room" })),
      ...registrationTemplates.map((t: any) => ({ ...t, template_type: t.template_type || "registration" })),
      ...srrTemplates.map((t: any) => ({ ...t, template_type: t.template_type || "srr" })),
    ]
  }, [roomTemplates, registrationTemplates, srrTemplates])

  const activeTemplatesList = useMemo(() => {
    switch (activeCategory) {
      case "room": return roomTemplates
      case "registration": return registrationTemplates
      case "srr": return srrTemplates
      default: return []
    }
  }, [activeCategory, roomTemplates, registrationTemplates, srrTemplates])

  const categoriesList: Array<{ id: TemplateCategory; label: string; icon: typeof Users; desc: string; count: number }> = [
    { id: "registration", label: "Registration", icon: Users, desc: "Check-in counters, kiosks and badge printers", count: registrationTemplates.length },
    { id: "srr", label: "Speaker Ready Room", icon: Grid, desc: "Preview stations and check-in desks for speakers", count: srrTemplates.length },
    { id: "room", label: "Rooms", icon: Layout, desc: "Equipment and staff for presentation rooms", count: roomTemplates.length },
  ]

  const getCategoryIcon = (category: TemplateCategory) => {
    if (category === "registration") return Users
    if (category === "srr") return Grid
    return Layout
  }

  const hasSelectedTemplateInCategory = (category: TemplateCategory) =>
    allTemplatesList.some((template: any) => template.template_type === category && selectedTemplates[template.slug]?.selected)

  const getCategoryImages = (category: TemplateCategory) => {
    const source = category === "registration" ? registrationTemplates : category === "srr" ? srrTemplates : roomTemplates
    return source.map((template: any) => String(template.image_url || "").trim()).filter(Boolean)
  }

  const templateStepAddons = useMemo(
    () =>
      addonsCatalog.filter((addon) => {
        const types = addon.template_types || []
        const isTemplateAddon = types.includes("registration") || types.includes("srr")
        if (!isTemplateAddon) return false
        return (types.includes("registration") && hasSelectedTemplateInCategory("registration")) || (types.includes("srr") && hasSelectedTemplateInCategory("srr"))
      }),
    [addonsCatalog, allTemplatesList, selectedTemplates]
  )

  const secondaryStepAddons = useMemo(
    () =>
      addonsCatalog.filter((addon) => {
        const types = addon.template_types || []
        return !(types.includes("registration") || types.includes("srr"))
      }),
    [addonsCatalog]
  )

  const usePremiumTemplate = (template: any, category: TemplateCategory) => {
    if (category === "room") {
      const unassignedRoom = roomAssignments.find(room => !room.templateSlug)
      if (unassignedRoom) {
        changeRoomTemplate(unassignedRoom.id, template.slug)
      } else {
        addRoomAssignment(template.slug)
      }
    } else {
      // Single-select for registration & SRR: deselect all others in the category first.
      const currentlySelected = selectedTemplates[template.slug]?.selected || false
      setSelectedTemplates(prev => {
        const next = { ...prev }
        // Deselect every other template in the same category
        allTemplatesList.forEach((t: any) => {
          if (t.template_type === category && t.slug !== template.slug && next[t.slug]?.selected) {
            next[t.slug] = { ...next[t.slug], selected: false }
          }
        })
        // Toggle the clicked template
        if (next[template.slug]) {
          next[template.slug] = { ...next[template.slug], selected: !currentlySelected }
        }
        return next
      })
    }
    setDetailTemplate(null)
  }

  // Initialize templates configurations
  useEffect(() => {
    if (allTemplatesList.length > 0 && Object.keys(selectedTemplates).length === 0) {
      const initial: typeof selectedTemplates = {}
      allTemplatesList.forEach((t: any) => {
        initial[t.slug] = {
          selected: false,
          params: {
            // The API returns template specs flattened at the top level (not
            // under `specs`), so read those first and keep `specs` as a fallback.
            attendees: t.min_attendees ?? t.specs?.min_attendees ?? 1000,
            counters: t.reg_counters ?? t.specs?.reg_counters ?? 1,
            kiosks: t.kiosks ?? t.specs?.kiosks ?? 1,
            preview_stations: t.preview_stations ?? t.specs?.preview_stations ?? 1,
            upload_stations: t.upload_stations ?? t.specs?.upload_stations ?? 1,
            speakers: t.min_speakers ?? t.specs?.min_speakers ?? 1,
            rooms: t.rooms ?? t.specs?.rooms ?? 1,
            capacity: t.default_capacity ?? t.specs?.default_capacity ?? 1,
            access_points: t.access_points ?? t.specs?.access_points ?? 1
          }
        }
      })
      setSelectedTemplates(initial)
    }
  }, [allTemplatesList])

  const toggleTemplateSelection = (slug: string) => {
    const tpl = allTemplatesList.find((t: any) => t.slug === slug)
    const willBeSelected = !selectedTemplates[slug]?.selected

    setSelectedTemplates(prev => {
      const current = prev[slug]
      if (!current) return prev
      return {
        ...prev,
        [slug]: {
          ...current,
          selected: willBeSelected
        }
      }
    })

    // Room templates manage their room count via a named room list rather
    // than a single number — auto-seed/clear it alongside selection.
    if (tpl?.template_type === "room") {
      if (willBeSelected) {
        setRoomAssignments(prev => {
          const existingCount = prev.filter(r => r.templateSlug === slug).length
          return [...prev, { id: `room-${slug}-${Date.now()}`, name: `Room ${existingCount + 1}`, templateSlug: slug }]
        })
      } else {
        setRoomAssignments(prev => prev.filter(r => r.templateSlug !== slug))
      }
    }
  }

  const addRoomAssignment = (slug: string) => {
    setRoomAssignments(prev => {
      return [...prev, { id: `room-${slug}-${Date.now()}`, name: `Room ${prev.length + 1}`, templateSlug: slug }]
    })
    setSelectedTemplates(prev => {
      const current = prev[slug]
      if (!current) return prev
      return { ...prev, [slug]: { ...current, selected: true } }
    })
  }

  const renameRoomAssignment = (id: string, name: string) => {
    setRoomAssignments(prev => prev.map(r => (r.id === id ? { ...r, name } : r)))
  }

  const removeRoomAssignment = (id: string) => {
    const room = roomAssignments.find(r => r.id === id)
    const remaining = roomAssignments.filter(r => r.id !== id)
    setRoomAssignments(remaining)
    if (room) {
      const stillUsed = remaining.some(r => r.templateSlug === room.templateSlug)
      if (!stillUsed) {
        setSelectedTemplates(prev => {
          const current = prev[room.templateSlug]
          if (!current) return prev
          return { ...prev, [room.templateSlug]: { ...current, selected: false } }
        })
      }
    }
  }

  const changeRoomTemplate = (roomId: string, newSlug: string) => {
    const room = roomAssignments.find(r => r.id === roomId)
    if (!room) return
    const oldSlug = room.templateSlug
    const updated = roomAssignments.map(r => r.id === roomId ? { ...r, templateSlug: newSlug } : r)
    setRoomAssignments(updated)
    setSelectedTemplates(prev => {
      const next = { ...prev }
      if (oldSlug !== newSlug) {
        const oldStillUsed = updated.some(r => r.templateSlug === oldSlug)
        if (!oldStillUsed && next[oldSlug]) next[oldSlug] = { ...next[oldSlug], selected: false }
      }
      if (next[newSlug]) next[newSlug] = { ...next[newSlug], selected: true }
      return next
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

  const hardwareItemsMap = useMemo(() => {
    const m: Record<string, any> = {}
    hardwareList.forEach((h: any) => {
      m[h.id] = h
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

  const getHardwarePricingUnit = (hardwareItemId: string) =>
    String(hardwareItemsMap[hardwareItemId]?.pricing_unit || "PER_EVENT").toUpperCase()

  const getHardwareDayMultiplier = (hardwareItemId: string, days: number) =>
    getHardwarePricingUnit(hardwareItemId) === "PER_DAY" ? Math.max(1, Number(days) || 1) : 1

  const getHardwareLineCost = (hardwareItemId: string, quantity: number, days: number) => {
    const rate = hardwarePricesMap[hardwareItemId] || 0
    return quantity * rate * getHardwareDayMultiplier(hardwareItemId, days)
  }

  const getTemplateScaleFactor = (tpl: any, config: SelectedTemplateConfig) => {
    if (tpl.template_type === "room") {
      const assigned = roomAssignments.filter(r => r.templateSlug === tpl.slug).length
      return assigned > 0 ? assigned : Number(config.params.rooms || 1)
    }
    if (tpl.template_type === "registration") {
      return Math.ceil(Number(config.params.attendees || 1000) / 1000)
    }
    if (tpl.template_type === "srr") {
      return Math.ceil(Number(config.params.upload_stations || 4) / 4)
    }
    return 1
  }

  const setCategoryDayValue = (cat: TemplateCategory, value: number) => {
    setCategoryDays(prev => ({ ...prev, [cat]: Math.max(1, Math.round(value) || 1) }))
  }

  const categoryBreakdown = useMemo(() => {
    const map: Record<TemplateCategory, {
      id: TemplateCategory
      label: string
      days: number
      templates: number
      hardwareBase: number
      staffBase: number
      hardware: number
      staff: number
      total: number
    }> = {
      registration: { id: "registration", label: "Registration", days: categoryDays.registration, templates: 0, hardwareBase: 0, staffBase: 0, hardware: 0, staff: 0, total: 0 },
      srr: { id: "srr", label: "SRR", days: categoryDays.srr, templates: 0, hardwareBase: 0, staffBase: 0, hardware: 0, staff: 0, total: 0 },
      room: { id: "room", label: "Rooms", days: categoryDays.room, templates: 0, hardwareBase: 0, staffBase: 0, hardware: 0, staff: 0, total: 0 },
    }

    Object.entries(selectedTemplates).forEach(([slug, config]) => {
      if (!config.selected) return
      const tpl = allTemplatesList.find((t: any) => t.slug === slug)
      if (!tpl) return
      const category = tpl.template_type as TemplateCategory
      if (!map[category]) return
      const factor = getTemplateScaleFactor(tpl, config)
      const days = Math.max(1, Number(categoryDays[category]) || 1)

      map[category].templates += 1
        ; (tpl.hardware_allocation || []).forEach((alloc: any) => {
          map[category].hardwareBase += getHardwareLineCost(alloc.hardware_item_id, alloc.quantity * factor, days)
        })
        // Crew reflects the actual crew defined in the template — it is NOT
        // Room templates need crew × room count (each room has its own crew).
        // Other categories share crew regardless of scale factor.
        ; (tpl.staff_allocation || []).forEach((alloc: any) => {
          const rate = staffPricesMap[alloc.staff_role_id] || 0
          const staffQty = category === "room" ? alloc.quantity * factor : alloc.quantity
          map[category].staffBase += staffQty * rate
        })
    })

    return Object.values(map).map(item => ({
      ...item,
      days: Math.max(1, Number(item.days) || 1),
      hardware: item.hardwareBase,
      staff: item.staffBase * Math.max(1, Number(item.days) || 1),
      total: item.hardwareBase + (item.staffBase * Math.max(1, Number(item.days) || 1))
    }))
  }, [selectedTemplates, allTemplatesList, hardwarePricesMap, staffPricesMap, categoryDays, roomAssignments, hardwareItemsMap])

  // Per-template breakdown used by the proposal/PDF — name, description,
  // infrastructure specs, crew count and the hardware/crew cost for each
  // selected template (no individual hardware/crew types are exposed).
  const templateBreakdown = useMemo(() => {
    const rows: {
      slug: string
      name: string
      description: string
      category: TemplateCategory
      categoryLabel: string
      days: number
      instanceCount: number
      displayCrewCount: number
      crewCount: number
      hardwareCost: number
      crewCost: number
      total: number
      infra: { label: string; value: string | number }[]
    }[] = []

    Object.entries(selectedTemplates).forEach(([slug, config]) => {
      if (!config.selected) return
      const tpl = allTemplatesList.find((t: any) => t.slug === slug)
      if (!tpl) return
      const category = tpl.template_type as TemplateCategory
      const days = Math.max(1, Number(categoryDays[category]) || 1)
      const factor = getTemplateScaleFactor(tpl, config)
      const baseCrewCount = (tpl.staff_allocation || []).reduce((sum: number, alloc: any) => sum + Number(alloc.quantity || 0), 0)

      let hardwareCost = 0
        ; (tpl.hardware_allocation || []).forEach((alloc: any) => {
          hardwareCost += getHardwareLineCost(alloc.hardware_item_id, alloc.quantity * factor, days)
        })

      // Crew reflects the actual crew defined in the template — NOT multiplied
      // by the scale factor (so a room template's crew is its real crew, not
      // crew × number of rooms).
      let crewBase = 0
      let crewCount = 0
        ; (tpl.staff_allocation || []).forEach((alloc: any) => {
          const rate = staffPricesMap[alloc.staff_role_id] || 0
          const staffQty = category === "room" ? alloc.quantity * factor : alloc.quantity
          crewBase += staffQty * rate
          crewCount += Number(staffQty || 0)
        })

      // Infrastructure specs shown in the proposal — an explicit field set per
      // category so the PDF table is consistent and complete.
      let infra: { label: string; value: string | number }[]
      if (category === "registration") {
        infra = [
          { label: "Registration Type", value: tpl.registration_type || tpl.recommended_reg_type || "—" },
          { label: "Attendees Range", value: `${Number(tpl.min_attendees) || 0} - ${Number(tpl.max_attendees) || 0}` },
          { label: "Counters", value: Number(tpl.reg_counters) || 0 },
          { label: "Kiosks", value: Number(tpl.kiosks) || 0 },
          { label: "QR Scanner Stations", value: Number(tpl.qr_stations) || 0 },
          { label: "Badge Printing Stations", value: Number(tpl.badge_stations) || 0 },
          { label: "Badge Price (per badge)", value: formatINR(Number(tpl.badge_per_piece_cost) || 0) },
          { label: "Check-ins / hr", value: Number(tpl.checkins_per_hour) || 0 },
        ]
      } else if (category === "srr") {
        infra = [
          { label: "SRR Type", value: tpl.srr_type || tpl.recommended_event_size || "—" },
          { label: "Speaker Range", value: `${Number(tpl.min_speakers) || 0} - ${Number(tpl.max_speakers) || 0}` },
          { label: "Preview Stations", value: Number(tpl.preview_stations) || 0 },
          { label: "Check-in Counters", value: Number(tpl.checkin_counters) || 0 },
          { label: "Consultation Desks", value: Number(tpl.consultation_desks) || 0 },
          { label: "Printer Stations", value: Number(tpl.printer_stations) || 0 },
          { label: "Speakers / hr", value: Number(tpl.speakers_per_hour) || 0 },
        ]
      } else if (category === "room") {
        infra = [
          { label: "Room Type", value: tpl.room_type || "—" },
          { label: "Capacity", value: Number(tpl.default_capacity) || 0 },
          { label: "Podiums", value: Number(tpl.podiums) || 0 },
        ]

      } else {
        const generic = new Set(["Template Type", "Hardware", "People"])
        infra = getTemplateSpecRows(tpl).filter(r => !generic.has(r.label) && Number(r.value) > 0)
      }

      const crewCost = crewBase * days

      rows.push({
        slug,
        name: tpl.name,
        description: tpl.description || "",
        category,
        categoryLabel: categoriesList.find(c => c.id === category)?.label || category,
        days,
        instanceCount: Math.max(1, factor),
        displayCrewCount: Math.round(baseCrewCount),
        crewCount: Math.round(crewCount),
        hardwareCost,
        crewCost,
        total: hardwareCost + crewCost,
        infra,
      })
    })

    return rows
  }, [selectedTemplates, allTemplatesList, hardwarePricesMap, staffPricesMap, categoryDays, roomAssignments, hardwareItemsMap])

  // Group the per-template breakdown by category for the proposal view.
  const proposalCategories = useMemo(() => {
    return categoriesList
      .map(cat => {
        const templates = templateBreakdown.filter(t => t.category === cat.id)
        return {
          id: cat.id,
          label: cat.label,
          days: Math.max(1, Number(categoryDays[cat.id as TemplateCategory]) || 1),
          templates,
          hardwareCost: templates.reduce((acc, t) => acc + t.hardwareCost, 0),
          crewCost: templates.reduce((acc, t) => acc + t.crewCost, 0),
          total: templates.reduce((acc, t) => acc + t.total, 0),
        }
      })
      .filter(cat => cat.templates.length > 0)
  }, [templateBreakdown, categoryDays])

  // Per-room-assignment cost breakdown (each named room gets its own row).
  const roomBreakdown = useMemo(() => {
    return roomAssignments.map(room => {
      const tpl = allTemplatesList.find((t: any) => t.slug === room.templateSlug)
      if (!tpl) return null
      const days = Math.max(1, categoryDays.room)
      const hwCost = (tpl.hardware_allocation || []).reduce((acc: number, a: any) => acc + getHardwareLineCost(a.hardware_item_id, a.quantity, days), 0)
      const crewCost = (tpl.staff_allocation || []).reduce((acc: number, a: any) => acc + a.quantity * (staffPricesMap[a.staff_role_id] || 0), 0) * days
      const crewCount = (tpl.staff_allocation || []).reduce((sum: number, a: any) => sum + Number(a.quantity || 0), 0)
      const infra: { label: string; value: string | number }[] = [
        { label: "Room Type", value: tpl.room_type || "—" },
        { label: "Capacity", value: Number(tpl.default_capacity) || 0 },
        { label: "Podiums", value: Number(tpl.podiums) || 0 },
      ].filter(i => i.value !== "—" && i.value !== 0)

      return {
        roomId: room.id,
        roomName: room.name,
        templateSlug: room.templateSlug,
        templateName: tpl.name,
        hwCost,
        crewCost,
        crewCount,
        infra,
        total: hwCost + crewCost,
      }
    }).filter(Boolean) as {
      roomId: string; roomName: string; templateSlug: string; templateName: string;
      hwCost: number; crewCost: number; crewCount: number;
      infra: { label: string; value: string | number }[]; total: number;
    }[]
  }, [roomAssignments, allTemplatesList, hardwarePricesMap, staffPricesMap, categoryDays.room, hardwareItemsMap])

  // Aggregated allocations from selected templates
  const aggregatedHardware = useMemo(() => {
    const map: Record<string, AggregatedHardwareItem> = {}

    // 1. Templates hardware
    Object.entries(selectedTemplates).forEach(([slug, config]) => {
      if (!config.selected) return
      const tpl = allTemplatesList.find((t: any) => t.slug === slug)
      if (!tpl) return

      const factor = getTemplateScaleFactor(tpl, config)

        ; (tpl.hardware_allocation || []).forEach((alloc: any) => {
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

    return Object.values(map)
  }, [selectedTemplates, allTemplatesList, hardwareList, roomAssignments])

  const aggregatedStaff = useMemo(() => {
    const map: Record<string, AggregatedStaffItem> = {}

    // 1. Templates staff
    Object.entries(selectedTemplates).forEach(([slug, config]) => {
      if (!config.selected) return
      const tpl = allTemplatesList.find((t: any) => t.slug === slug)
      if (!tpl) return

      const days = categoryDays[tpl.template_type as TemplateCategory] || 1

      const staffScaleFactor = tpl.template_type === "room" ? getTemplateScaleFactor(tpl, config) : 1
        ; (tpl.staff_allocation || []).forEach((alloc: any) => {
          const st = staffRolesList.find((s: any) => s.id === alloc.staff_role_id)
          if (!st) return
          const qtyToAdd = alloc.quantity * staffScaleFactor
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
              days,
              sources: [tpl.name]
            }
          }
        })
    })

    return Object.values(map)
  }, [selectedTemplates, allTemplatesList, staffRolesList, categoryDays, roomAssignments])

  const savedHardwareAllocations = useMemo<SavedAllocationItem[]>(() => {
    return aggregatedHardware.map((item) => {
      const source = hardwareList.find((hardware: any) => hardware.id === item.id)
      const actualUnitCost = Number(source?.cost_price || 0)
      const askedUnitCost = Number(source?.selling_price || 0)
      return {
        id: item.id,
        name: item.name,
        qty: item.qty,
        category: item.category,
        unit: item.unit,
        sources: item.sources,
        actualUnitCost,
        askedUnitCost,
        actualTotalCost: actualUnitCost * item.qty,
        askedTotalCost: askedUnitCost * item.qty,
      }
    })
  }, [aggregatedHardware, hardwareList])

  const savedStaffAllocations = useMemo<SavedAllocationItem[]>(() => {
    return aggregatedStaff.map((item) => {
      const source = staffRolesList.find((role: any) => role.id === item.id)
      const actualUnitCost = Number(source?.cost_per_day || 0)
      const askedUnitCost = Number(source?.selling_per_day || 0)
      return {
        id: item.id,
        name: item.name,
        qty: item.qty,
        days: item.days,
        department: item.dept,
        sources: item.sources,
        actualUnitCost,
        askedUnitCost,
        actualTotalCost: actualUnitCost * item.qty * item.days,
        askedTotalCost: askedUnitCost * item.qty * item.days,
      }
    })
  }, [aggregatedStaff, staffRolesList])

  // Per-category resource aggregation used by the Step 3 category tabs.
  // Each category only aggregates hardware/staff from templates of that type.
  const aggregatedResourcesByCategory = useMemo(() => {
    const categories: TemplateCategory[] = ["registration", "srr", "room"]
    const result = {} as Record<TemplateCategory, { hardware: AggregatedHardwareItem[]; staff: AggregatedStaffItem[] }>

    for (const category of categories) {
      const hwMap: Record<string, AggregatedHardwareItem> = {}
      const stMap: Record<string, AggregatedStaffItem> = {}
      const days = categoryDays[category] || 1

      Object.entries(selectedTemplates).forEach(([slug, config]) => {
        if (!config.selected) return
        const tpl = allTemplatesList.find((t: any) => t.slug === slug)
        if (!tpl || tpl.template_type !== category) return
        const factor = getTemplateScaleFactor(tpl, config)

          ; (tpl.hardware_allocation || []).forEach((alloc: any) => {
            const hw = hardwareList.find((h: any) => h.id === alloc.hardware_item_id)
            if (!hw) return
            const qtyToAdd = alloc.quantity * factor
            if (hwMap[hw.id]) {
              hwMap[hw.id].qty += qtyToAdd
              if (!hwMap[hw.id].sources.includes(tpl.name)) hwMap[hw.id].sources.push(tpl.name)
            } else {
              hwMap[hw.id] = { id: hw.id, name: hw.name, category: hw.category_name || "Accessories", qty: qtyToAdd, unit: hw.pricing_unit || "PER_EVENT", sources: [tpl.name] }
            }
          })

        const catStaffFactor = category === "room" ? factor : 1
          ; (tpl.staff_allocation || []).forEach((alloc: any) => {
            const st = staffRolesList.find((s: any) => s.id === alloc.staff_role_id)
            if (!st) return
            const stQty = alloc.quantity * catStaffFactor
            if (stMap[st.id]) {
              stMap[st.id].qty += stQty
              stMap[st.id].days = Math.max(stMap[st.id].days, days)
              if (!stMap[st.id].sources.includes(tpl.name)) stMap[st.id].sources.push(tpl.name)
            } else {
              stMap[st.id] = { id: st.id, name: st.name, dept: st.team_category || st.department || "Operations", qty: stQty, days, sources: [tpl.name] }
            }
          })
      })

      result[category] = { hardware: Object.values(hwMap), staff: Object.values(stMap) }
    }

    return result
  }, [selectedTemplates, allTemplatesList, hardwareList, staffRolesList, categoryDays, roomAssignments])

  // Costs subtotals
  const costs = useMemo(() => {
    const rawHardware = categoryBreakdown.reduce((acc, item) => acc + item.hardware, 0)
    const rawStaff = categoryBreakdown.reduce((acc, item) => acc + item.staff, 0)

    const addonCommercialSubtotal = dbAddons.reduce((acc, item) => {
      const qty = addons[item.id] || 0
      return acc + (qty * getAddonPrice(item))
    }, 0)
    const addonOperational = dbAddons.reduce(
      (acc, item) => {
        const qty = addons[item.id] || 0
        if (qty <= 0) return acc
        const costs = getAddonOperationalCost(item, qty)
        return {
          hardware: acc.hardware + costs.hardware,
          staff: acc.staff + costs.staff,
          consumables: acc.consumables + costs.consumables,
        }
      },
      { hardware: 0, staff: 0, consumables: 0 }
    )

    // Add-on hardware and staff are already included in getAddonPrice(). Keep
    // template costs separate here so the grand total does not double-count them.
    const hardwareBase = rawHardware
    const staffBase = rawStaff
    const internalBase = hardwareBase + staffBase
    const overhead = internalBase * (margins.overhead_pct / 100)
    const contingency = internalBase * (margins.contingency_pct / 100)
    const profit = internalBase * (margins.margin_pct / 100)
    const internalFees = overhead + contingency + profit
    const hardwareShare = internalBase > 0 ? hardwareBase / internalBase : 0
    const adjustedHardware = hardwareBase + internalFees * hardwareShare
    const adjustedStaff = staffBase + internalFees * (1 - hardwareShare)
    const billSubtotal = adjustedHardware + adjustedStaff + addonCommercialSubtotal
    const discount = billSubtotal * (margins.discount_pct / 100)
    const preGst = billSubtotal - discount
    const gst = preGst * (margins.gst_pct / 100)
    const grandTotal = preGst + gst

    return {
      hardware: adjustedHardware,
      staff: adjustedStaff,
      rawHardware,
      rawStaff,
      addonOperationalHardware: addonOperational.hardware,
      addonOperationalStaff: addonOperational.staff,
      addonOperationalConsumables: addonOperational.consumables,
      addons: addonCommercialSubtotal,
      base: billSubtotal,
      overhead,
      contingency,
      profit,
      internalFees,
      discount,
      preGst,
      gst,
      total: grandTotal
    }
  }, [categoryBreakdown, dbAddons, addons, margins, hardwareList, staffRolesList])

  const internalPricingMultiplier = 1 + (
    margins.overhead_pct + margins.contingency_pct + margins.margin_pct
  ) / 100

  // Pie chart cost ratio data
  const chartData = useMemo(() => {
    const total = costs.hardware + costs.staff + costs.addons + costs.gst || 1
    return [
      { name: "Hardware", value: Math.round((costs.hardware / total) * 100), color: "#6366F1" },
      { name: "Crew Manpower", value: Math.round((costs.staff / total) * 100), color: "#F59E0B" },
      { name: "Add-ons", value: Math.round((costs.addons / total) * 100), color: "#10B981" },
      { name: "GST Taxes", value: Math.round((costs.gst / total) * 100), color: "#8B5CF6" }
    ].filter(i => i.value > 0)
  }, [costs])

  const handleSaveSimulation = async () => {
    const activeRule = rules.find((r) => r.is_default) || rules[0]
    const payload = {
      pricing_rule_id: activeRule?.id || "",
      name: inputs.simulationName,
      event_city_tier: inputs.event_city_tier,
      event_days: inputs.event_days,
      attendee_count: wizard.maxAttendees,
      room_count: roomAssignments.length || wizard.roomCount,
      counter_count: wizard.deskCount,
      srr_stations: wizard.srrStations,
      min_attendees: wizard.minAttendees,
      max_attendees: wizard.maxAttendees,
      desk_count: wizard.deskCount,
      min_speakers: wizard.minSpeakers,
      max_speakers: wizard.maxSpeakers,
      selected_hardware: aggregatedHardware.map(h => ({ hardware_item_id: h.id, quantity: h.qty })),
      selected_staff: aggregatedStaff.map(s => ({ staff_role_id: s.id, quantity: s.qty, days: s.days })),
      snapshot: {
        proposal_html: buildProposalHtml(),
        inputs,
        wizard,
        roomAssignments,
        templateBreakdown,
        proposalCategories,
        addons: addonsCatalog
          .filter(addon => (addons[addon.id] || 0) > 0)
          .map(addon => ({
            id: addon.id,
            name: addon.name,
            quantity: addons[addon.id] || 0,
            commercialAmount: getAddonCommercialAmount(addon) * (addons[addon.id] || 0),
            addonTotal: getAddonPrice(addon) * (addons[addon.id] || 0),
            templateTypes: addon.template_types || [],
          })),
        allocations: {
          hardware: savedHardwareAllocations,
          staff: savedStaffAllocations,
        },
        summary: {
          actualHardwareCost: savedHardwareAllocations.reduce((sum, item) => sum + item.actualTotalCost, 0),
          askedHardwareCost: savedHardwareAllocations.reduce((sum, item) => sum + item.askedTotalCost, 0),
          actualStaffCost: savedStaffAllocations.reduce((sum, item) => sum + item.actualTotalCost, 0),
          askedStaffCost: savedStaffAllocations.reduce((sum, item) => sum + item.askedTotalCost, 0),
          actualOperationalCost: savedHardwareAllocations.reduce((sum, item) => sum + item.actualTotalCost, 0) + savedStaffAllocations.reduce((sum, item) => sum + item.actualTotalCost, 0),
          askedOperationalCost: savedHardwareAllocations.reduce((sum, item) => sum + item.askedTotalCost, 0) + savedStaffAllocations.reduce((sum, item) => sum + item.askedTotalCost, 0),
          quotedHardwareCost: costs.hardware,
          quotedStaffCost: costs.staff,
          addonCommercialCost: costs.addons,
          grandTotal: costs.total,
        },
      },
    }

    await runSimulation.mutateAsync(payload)
    refetchSimulations()
    toast.success("Quote saved successfully!")
    setShowSaveModal(false)
  }

  // Builds the full proposal document as an HTML string. Used both for the
  // inline (iframe) preview on Step 6 and for printing / saving as PDF.
  const buildProposalHtmlLegacy = () => {
    // Margins are baked into hardware/crew costs in the PDF — only client
    // discount and GST are shown as separate line items to the client.
    const pdfHardwareScale = costs.rawHardware > 0 ? costs.hardware / costs.rawHardware : 1
    const pdfCrewScale = costs.rawStaff > 0 ? costs.staff / costs.rawStaff : 1
    const pdfScaleFactor = 1
    const pdfHardware = costs.hardware
    const pdfCrew = costs.staff
    const selectedAddons = addonsCatalog.filter(addon => (addons[addon.id] || 0) > 0)
    const addonsHtml = selectedAddons.map(addon => {
      const quantity = addons[addon.id] || 0
      const details = [
        ...(addon.inclusions || []).map(item => `<li>${item}</li>`),
        ...(addon.exclusions || []).map(item => `<li><strong>Excludes:</strong> ${item}</li>`),
      ].join("")
      return `<div class="tpl-card"><div class="tpl-head"><div><div class="tpl-name">${addon.name}</div><div class="tpl-desc">${addon.description || addon.short_description || ""}</div></div><div class="tpl-total">${formatINR(getAddonPrice(addon) * quantity)}</div></div>${details ? `<ul style="font-size:11px;line-height:1.7;color:#4B5563">${details}</ul>` : ""}<table class="spec-table"><tbody><tr><td class="k">Quantity</td><td class="v">${quantity}</td></tr><tr><td class="k">Unit price</td><td class="v">${formatINR(getAddonPrice(addon))}</td></tr><tr><td class="k">Applies to</td><td class="v">${(addon.template_types || ["other"]).join(", ")}</td></tr></tbody></table></div>`
    }).join("")

    // Category-wise sections. Each selected template renders a TABLE of its
    // infrastructure specs plus crew, hardware cost and crew cost rows.
    const categoriesHtml = proposalCategories.map(cat => {
      const templatesHtml = cat.templates.map(t => {
        const specRows = [
          ...t.infra.map(i => ({ label: i.label, value: `${i.value}` })),
          ...(t.category === "room" && t.instanceCount > 1 ? [{ label: "No. of Rooms", value: t.instanceCount }] : []),
          { label: "Crew", value: `${t.displayCrewCount} people` },
          { label: "Hardware Cost", value: formatINR(t.hardwareCost * pdfHardwareScale) },
          { label: "Crew Cost", value: formatINR(t.crewCost * pdfCrewScale) },
        ]
        const rowsHtml = specRows.map(r => `<tr><td class="k">${r.label}</td><td class="v">${r.value}</td></tr>`).join("")
        return `
          <div class="tpl-card">
            <div class="tpl-head">
              <div class="tpl-name">${t.name}${t.instanceCount > 1 ? ` × ${t.instanceCount}` : ""}</div>
              <div class="tpl-total">${formatINR((t.hardwareCost * pdfHardwareScale) + (t.crewCost * pdfCrewScale))}</div>
            </div>
            ${t.description ? `<div class="tpl-desc">${t.description}</div>` : ""}
            <table class="spec-table"><tbody>${rowsHtml}</tbody></table>
          </div>
        `
      }).join("")

      return `
        <div class="cat-section">
          <div class="cat-head">
            <span class="cat-label">${cat.label}</span>
            <span class="cat-meta">${cat.templates.reduce((sum, template) => sum + (template.instanceCount || 1), 0)} unit${cat.templates.reduce((sum, template) => sum + (template.instanceCount || 1), 0) === 1 ? "" : "s"} · ${formatINR(cat.total * pdfScaleFactor)}</span>
          </div>
          ${templatesHtml}
        </div>
      `
    }).join("")

    return `
      <html>
        <head>
          <title>${inputs.simulationName}</title>
          <style>
            body { font-family: 'Inter', Arial, sans-serif; padding: 40px; color: #1F2937; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #5B21B6; padding-bottom: 20px; }
            h1 { color: #5B21B6; margin: 0; font-size: 24px; font-weight: 800; }
            .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 30px 0; }
            .meta-card { background: #F9FAFB; padding: 15px; border-radius: 8px; font-size: 13px; border: 1px solid #E5E7EB; }
            .meta-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
            .section-title { margin: 30px 0 14px; font-size: 16px; color: #111827; }
            .cat-section { margin-bottom: 26px; page-break-inside: avoid; }
            .cat-head { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #EDE9FE; padding-bottom: 6px; margin-bottom: 12px; }
            .cat-label { font-size: 14px; font-weight: 800; color: #5B21B6; text-transform: uppercase; letter-spacing: 0.05em; }
            .cat-meta { font-size: 11px; color: #6B7280; font-weight: 600; }
            .tpl-card { border: 1px solid #E5E7EB; border-radius: 10px; padding: 14px 16px; margin-bottom: 10px; background: #FFFFFF; page-break-inside: avoid; }
            .tpl-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
            .tpl-name { font-size: 13px; font-weight: 700; color: #111827; }
            .tpl-desc { font-size: 11px; color: #6B7280; margin: 3px 0 10px; line-height: 1.4; }
            .tpl-total { font-size: 14px; font-weight: 800; color: #5B21B6; font-family: monospace; white-space: nowrap; }
            .spec-table { width: 100%; border-collapse: collapse; font-size: 12px; }
            .spec-table td { padding: 7px 10px; border: 1px solid #E5E7EB; }
            .spec-table td.k { background: #F9FAFB; color: #4B5563; font-weight: 600; width: 45%; }
            .spec-table td.v { color: #111827; font-weight: 600; font-family: monospace; }
            .summary-card { margin-top: 40px; border: 1px solid #E5E7EB; padding: 20px; border-radius: 12px; background-color: #FAFAFA; width: 380px; margin-left: auto; }
            .summary-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; }
            .summary-row.total { border-top: 2px solid #E5E7EB; padding-top: 10px; font-size: 16px; font-weight: 800; color: #5B21B6; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1>PRICING PROPOSAL</h1>
              <span style="font-size: 11px; text-transform: uppercase; color: #6B7280; font-weight: bold;">EventX Quote Workspace</span>
            </div>
            <div style="text-align: right; font-size: 12px; color: #4B5563;">
              <strong>Date:</strong> ${new Date().toLocaleDateString()}<br/>
              <strong>Ref:</strong> ${inputs.refNumber}
            </div>
          </div>

          <div class="meta-grid">
            <div class="meta-card">
              <h4 style="margin: 0 0 10px 0; color: #5B21B6;">Quote Details</h4>
              <div class="meta-row"><span>Quote Name:</span> <strong>${inputs.simulationName}</strong></div>
              <div class="meta-row"><span>Prepared For:</span> <strong>${inputs.customer}</strong></div>
              <div class="meta-row"><span>Prepared By:</span> <strong>${inputs.preparedBy}</strong></div>
              <div class="meta-row"><span>City Tier:</span> <strong>${inputs.event_city_tier}</strong></div>
            </div>
            <div class="meta-card">
              <h4 style="margin: 0 0 10px 0; color: #5B21B6;">Summary</h4>
              <div class="meta-row"><span>Categories:</span> <strong>${proposalCategories.length}</strong></div>
              <div class="meta-row"><span>Templates:</span> <strong>${templateBreakdown.length}</strong></div>
              <div class="meta-row"><span>Equipment Cost:</span> <strong>${formatINR(pdfHardware)}</strong></div>
              <div class="meta-row"><span>Crew Cost:</span> <strong>${formatINR(pdfCrew)}</strong></div>
            </div>
          </div>

          <h3 class="section-title">Infrastructure by Category</h3>
          ${categoriesHtml || `<p style="color:#9CA3AF; font-size:13px;">No templates selected.</p>`}
          ${addonsHtml ? `<h3 class="section-title">Selected Add-ons</h3>${addonsHtml}` : ""}

          <div class="summary-card">
            <div class="summary-row"><span>Equipment Cost:</span> <span style="font-family: monospace;">${formatINR(pdfHardware)}</span></div>
            <div class="summary-row"><span>Crew Cost:</span> <span style="font-family: monospace;">${formatINR(pdfCrew)}</span></div>
            ${costs.addons > 0 ? `<div class="summary-row"><span>Add-ons:</span> <span style="font-family: monospace;">${formatINR(costs.addons)}</span></div>` : ""}
            ${costs.discount > 0 ? `<div class="summary-row"><span>Client Discount:</span> <span style="font-family: monospace;">-${formatINR(costs.discount)}</span></div>` : ""}
            ${costs.gst > 0 ? `<div class="summary-row"><span>GST (Tax):</span> <span style="font-family: monospace;">${formatINR(costs.gst)}</span></div>` : ""}
            <div class="summary-row total">
              <span>Grand Quote Total:</span> <span style="font-family: monospace;">${formatINR(costs.total)}</span>
            </div>
          </div>
        </body>
      </html>
    `
  }

  const buildBrandedProposalHtml = () => {
    if (!Array.isArray(proposalCategories)) return buildProposalHtmlLegacy()
    const now = new Date()
    const totalStaff = templateBreakdown.reduce((sum, item) => sum + item.crewCount, 0)
    const pdfHardwareScale = costs.rawHardware > 0 ? costs.hardware / costs.rawHardware : 1
    const pdfCrewScale = costs.rawStaff > 0 ? costs.staff / costs.rawStaff : 1
    const esc = (value: unknown) =>
      String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
    const formatDate = (value: Date) => value.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })

    const parseLines = (value: string) =>
      value
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)

    const getBillingNoteForTemplate = (slug: string, days: number) => {
      const tpl = allTemplatesList.find((item: any) => item.slug === slug)
      const allocations = tpl?.hardware_allocation || []
      const hasPerDay = allocations.some((alloc: any) => getHardwarePricingUnit(alloc.hardware_item_id) === "PER_DAY")
      const hasUnitBased = allocations.some((alloc: any) => getHardwarePricingUnit(alloc.hardware_item_id) !== "PER_DAY")
      if (hasPerDay && hasUnitBased) return `Mixed billing (${days} day${days === 1 ? "" : "s"})`
      if (hasPerDay) return `Per day (${days} day${days === 1 ? "" : "s"})`
      return "Mixed billing"
    }

    const brandMarkup = pdfTemplate.logoUrl.trim()
      ? `<img src="${esc(pdfTemplate.logoUrl)}" alt="${esc(pdfTemplate.companyName)}" class="brand-logo" />`
      : `<div class="brand-mark">${esc(pdfTemplate.companyName.slice(0, 1) || "E")}</div>`

    const pageHeader = (title: string, subtitle: string) => `
      <div class="page-header">
        <div class="brand-left">${brandMarkup}<div><div class="brand-name">${esc(pdfTemplate.companyName)}</div><div class="brand-sub">${esc(pdfTemplate.companyTagline)}</div></div></div>
        <div class="doc-title"><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>
      </div>
    `

    const pageFooter = (pageNumber: number, totalPages: number) => `
      <div class="footer-bar"><span>${esc(pdfTemplate.footerText)}</span><span>Page ${pageNumber} of ${totalPages}</span></div>
    `

    const categorySummaryRows = proposalCategories.map((cat, index) => {
      const units = cat.templates.reduce((sum, template) => sum + (template.instanceCount || 1), 0)
      return `<tr><td>${String(index + 1).padStart(2, "0")}</td><td>${esc(cat.label)}</td><td>${cat.templates.length}</td><td>${units}</td><td class="money">${formatINR(cat.total)}</td></tr>`
    }).join("")

    const configSections = proposalCategories.map((cat) => {
      const cards = cat.templates.map((template) => {
        const imageUrl = allTemplatesList.find((item: any) => item.slug === template.slug)?.image_url?.trim?.() || ""
        const billing = getBillingNoteForTemplate(template.slug, template.days)
        const infraRows = [
          ...template.infra.map(item => ({ label: item.label, value: String(item.value) })),
          { label: "Crew", value: `${template.displayCrewCount} People` },
          { label: "Hardware Billing", value: billing },
          { label: "Total Price", value: formatINR((template.hardwareCost * pdfHardwareScale) + (template.crewCost * pdfCrewScale)) },
        ]
        const stats = infraRows.map(row => `<div class="config-stat"><span>${esc(row.label)}</span><strong>${esc(row.value)}</strong></div>`).join("")
        return `<div class="config-card"><div class="config-card-top"><div class="config-title-wrap"><h3>${esc(template.name)}</h3><p>${esc(template.description || cat.label)}</p></div><div class="config-price">${formatINR((template.hardwareCost * pdfHardwareScale) + (template.crewCost * pdfCrewScale))}</div></div><div class="config-body"><div class="config-image-wrap">${imageUrl ? `<img src="${esc(imageUrl)}" alt="${esc(template.name)}" class="config-image" />` : `<div class="config-image placeholder">${esc(cat.label)}</div>`}</div><div class="config-stats">${stats}</div></div></div>`
      }).join("")
      return {
        title: `${pdfTemplate.solutionTitle} · ${cat.label}`,
        subtitle: pdfTemplate.solutionSubtitle,
        body: `${cards}<div class="callout">Section break after ${esc(cat.label)}. This page contains only the selected pricing configuration for this category.</div>`
      }
    })

    const selectedAddons = addonsCatalog.filter(addon => (addons[addon.id] || 0) > 0)
    const addOnsSection = selectedAddons.length > 0 ? {
      title: pdfTemplate.addOnsTitle,
      subtitle: pdfTemplate.addOnsSubtitle,
      body: `<div class="addons-table"><table><thead><tr><th>Add-on</th><th>Description</th><th class="center">Qty</th><th class="money">Unit</th><th class="money">Total</th></tr></thead><tbody>${selectedAddons.map((addon) => {
        const qty = addons[addon.id] || 0
        return `<tr><td>${esc(addon.name)}</td><td>${esc(addon.description || addon.short_description || addon.key)}</td><td class="center">${qty}</td><td class="money">${formatINR(getAddonPrice(addon))}</td><td class="money">${formatINR(getAddonPrice(addon) * qty)}</td></tr>`
      }).join("")}</tbody></table></div>`
    } : null

    const sections = [
      {
        title: pdfTemplate.coverTitle,
        subtitle: pdfTemplate.coverSubtitle,
        body: `<div class="summary-shell"><div class="summary-panel"><div class="summary-line"><span>Equipment Cost</span><strong>${formatINR(costs.hardware)}</strong></div><div class="summary-line"><span>Crew Cost</span><strong>${formatINR(costs.staff)}</strong></div><div class="summary-line"><span>Add-ons</span><strong>${formatINR(costs.addons)}</strong></div><div class="summary-line"><span>Subtotal</span><strong>${formatINR(costs.base)}</strong></div>${costs.gst > 0 ? `<div class="summary-line"><span>GST (${margins.gst_pct}%)</span><strong>${formatINR(costs.gst)}</strong></div>` : ""}<div class="summary-total"><span>Grand Total</span><strong>${formatINR(costs.total)}</strong></div></div><div class="summary-table"><table><thead><tr><th>#</th><th>Category</th><th>Templates</th><th>Units</th><th class="money">Amount</th></tr></thead><tbody>${categorySummaryRows || `<tr><td colspan="5" class="empty">No categories selected.</td></tr>`}</tbody></table></div></div>`
      },
      ...configSections,
      ...(addOnsSection ? [addOnsSection] : []),
      {
        title: pdfTemplate.summaryTitle,
        subtitle: pdfTemplate.summarySubtitle,
        body: `<div class="final-grid"><div class="investment-table"><div class="row"><span>Quote Ref</span><strong>${esc(inputs.refNumber)}</strong></div><div class="row"><span>Prepared For</span><strong>${esc(inputs.customer)}</strong></div><div class="row"><span>Prepared By</span><strong>${esc(inputs.preparedBy)}</strong></div><div class="row"><span>Valid Until</span><strong>${esc(formatDate(new Date(now.getTime() + pdfTemplate.validityDays * 86400000)))}</strong></div><div class="row"><span>Total Staff</span><strong>${totalStaff}</strong></div><div class="row total"><span>Grand Total</span><strong>${formatINR(costs.total)}</strong></div></div><div class="terms-grid"><div class="terms-card"><h4>${esc(pdfTemplate.termsTitle)}</h4><ul>${parseLines(pdfTemplate.termsItems).map(item => `<li>${esc(item)}</li>`).join("")}</ul></div><div class="terms-card"><h4>${esc(pdfTemplate.nextStepsTitle)}</h4><ul>${parseLines(pdfTemplate.nextStepsItems).map(item => `<li>${esc(item)}</li>`).join("")}</ul></div></div><div class="stamp-row"><div><strong>${esc(inputs.simulationName)}</strong><div class="muted">${esc(inputs.event_city_tier)}</div></div>${pdfTemplate.stampUrl.trim() ? `<img src="${esc(pdfTemplate.stampUrl)}" alt="Stamp" class="stamp-image" />` : `<div class="stamp-badge">${esc(pdfTemplate.stampLabel)}</div>`}</div>`
      }
    ]

    const totalPages = sections.length
    const pagesHtml = sections.map((section, index) => `<div class="page">${pageHeader(section.title, section.subtitle)}${section.body}${pageFooter(index + 1, totalPages)}</div>`).join("")

    return `
      <html>
        <head>
          <title>${esc(inputs.simulationName)}</title>
          <style>
            :root { --ink:#191d4f; --muted:#68708e; --border:#d8def1; --soft:#f6f8ff; --accent:#4427b8; --accent-dark:#171d67; }
            * { box-sizing:border-box; } html, body { margin:0; padding:0; background:#f3f5fb; font-family:Arial, Helvetica, sans-serif; color:var(--ink); }
            body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
            .page { width:100%; max-width:1024px; min-height:1400px; margin:0 auto 24px; background:#fff; border:1px solid #d9dfef; position:relative; padding:28px 24px 66px; page-break-after:always; }
            .page:last-child { page-break-after:auto; }
            .page-header { display:flex; justify-content:space-between; gap:20px; align-items:flex-start; margin-bottom:22px; }
            .brand-left { display:flex; align-items:center; gap:14px; }
            .brand-mark, .brand-logo { width:52px; height:52px; border-radius:12px; object-fit:cover; background:linear-gradient(135deg,#5b33db,#25157b); color:#fff; display:flex; align-items:center; justify-content:center; font-size:26px; font-weight:800; }
            .brand-name { font-size:26px; font-weight:800; } .brand-sub { font-size:10px; color:var(--muted); text-transform:uppercase; margin-top:2px; }
            .doc-title { text-align:right; } .doc-title h1 { margin:0; font-size:24px; color:var(--accent-dark); text-transform:uppercase; } .doc-title p { margin:4px 0 0; color:var(--muted); text-transform:uppercase; font-size:14px; }
            .summary-shell, .final-grid { display:grid; gap:18px; }
            .summary-panel, .investment-table, .terms-card, .config-card, .summary-table table, .addons-table table { border:1px solid var(--border); border-radius:10px; overflow:hidden; background:#fff; }
            .summary-line, .investment-table .row { display:flex; justify-content:space-between; padding:12px 16px; border-top:1px solid var(--border); font-size:13px; }
            .summary-line:first-child, .investment-table .row:first-child { border-top:0; }
            .summary-total, .investment-table .total { display:flex; justify-content:space-between; padding:14px 16px; background:linear-gradient(90deg,#2d23a7,#5331dd); color:#fff; font-weight:800; }
            .summary-table table, .addons-table table { width:100%; border-collapse:collapse; }
            .summary-table th, .summary-table td, .addons-table th, .addons-table td { border:1px solid var(--border); padding:12px 14px; font-size:12px; }
            .summary-table thead, .addons-table thead { background:#151d67; color:#fff; }
            .money { text-align:right; white-space:nowrap; font-weight:700; } .center { text-align:center; } .empty { text-align:center; color:var(--muted); }
            .config-card { padding:16px; margin-bottom:16px; } .config-card-top { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; }
            .config-title-wrap h3 { margin:0; font-size:18px; color:var(--accent-dark); } .config-title-wrap p { margin:6px 0 0; font-size:12px; color:var(--muted); }
            .config-price { font-size:20px; font-weight:800; color:var(--accent-dark); }
            .config-body { display:grid; grid-template-columns:180px 1fr; gap:16px; margin-top:16px; }
            .config-image-wrap { height:132px; border-radius:8px; overflow:hidden; border:1px solid var(--border); background:var(--soft); }
            .config-image { width:100%; height:100%; object-fit:cover; display:block; } .placeholder { display:flex; align-items:center; justify-content:center; font-weight:700; color:var(--accent); }
            .config-stats { display:grid; grid-template-columns:1fr 1fr; gap:0 18px; } .config-stat { display:flex; justify-content:space-between; gap:14px; padding:10px 0; border-bottom:1px solid #e7ebf7; font-size:12px; }
            .config-stat span { color:#506081; } .callout { margin-top:14px; border:1px solid var(--border); background:var(--soft); border-radius:8px; padding:12px 14px; font-size:12px; color:#465071; }
            .terms-grid { display:grid; grid-template-columns:1fr 1fr; gap:18px; } .terms-card { padding:16px; } .terms-card h4 { margin:0 0 12px; color:var(--accent-dark); text-transform:uppercase; } .terms-card ul { margin:0; padding-left:18px; line-height:1.8; font-size:12px; color:#44506f; }
            .stamp-row { display:flex; justify-content:space-between; align-items:center; border:1px solid var(--border); border-radius:10px; padding:16px; background:#fff; } .muted { color:var(--muted); font-size:12px; margin-top:4px; }
            .stamp-image { width:120px; max-height:120px; object-fit:contain; } .stamp-badge { min-width:120px; padding:14px 18px; border-radius:999px; border:2px solid var(--accent); text-align:center; font-weight:800; color:var(--accent); }
            .footer-bar { position:absolute; left:0; right:0; bottom:0; background:#111a63; color:#fff; display:flex; justify-content:space-between; align-items:center; padding:12px 18px; font-size:12px; }
          </style>
        </head>
        <body>${pagesHtml}</body>
      </html>
    `
  }

  const buildProposalHtml = () => {
    const esc = (value: unknown) => String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;")
    const hardwareScale = costs.rawHardware > 0 ? costs.hardware / costs.rawHardware : 1
    const crewScale = costs.rawStaff > 0 ? costs.staff / costs.rawStaff : 1
    const selectedAddons = addonsCatalog.filter(addon => (addons[addon.id] || 0) > 0)
    const templateRows = templateBreakdown.map(template => {
      const hardware = template.hardwareCost * hardwareScale
      const crew = template.crewCost * crewScale
      const specs = template.infra.map(item => `<div class="spec"><span>${esc(item.label)}</span><strong>${esc(item.value)}</strong></div>`).join("")
      return `<section class="template"><div class="template-title"><div><small>${esc(template.categoryLabel)}</small><h2>${esc(template.name)}</h2><p>${esc(template.description)}</p></div><strong>${formatINR(hardware + crew)}</strong></div><div class="specs">${specs}<div class="spec"><span>Units</span><strong>${template.instanceCount}</strong></div><div class="spec"><span>Days</span><strong>${template.days}</strong></div><div class="spec"><span>Crew</span><strong>${template.crewCount}</strong></div></div><table><tbody><tr><td>Hardware</td><td>${formatINR(hardware)}</td></tr><tr><td>Crew</td><td>${formatINR(crew)}</td></tr><tr class="subtotal"><td>Template total</td><td>${formatINR(hardware + crew)}</td></tr></tbody></table></section>`
    }).join("")
    const addonRows = selectedAddons.map(addon => {
      const quantity = addons[addon.id] || 0
      const range = getAddonPriceRange(addon)
      const totalLabel = range.min === range.max
        ? formatINR(range.min * quantity)
        : `${formatINR(range.min * quantity)} - ${formatINR(range.max * quantity)}`
      return `<tr><td><strong>${esc(addon.name)}</strong><small>${esc(addon.description || addon.short_description || "")}</small></td><td>${quantity}</td><td>${getAddonPriceLabel(addon)}</td><td>${totalLabel}</td></tr>`
    }).join("")

    return `<!doctype html><html><head><title>Quotation cost preview</title><style>
      *{box-sizing:border-box}html,body{margin:0;background:#eef1f6;color:#17203b;font-family:Arial,sans-serif}body{padding:24px}.sheet{max-width:980px;margin:auto;background:#fff;padding:28px;border:1px solid #dce2ed}.title{margin:0 0 20px;font-size:24px}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:24px}.metric{padding:14px;border:1px solid #dce2ed;border-radius:8px}.metric span{display:block;color:#6b7280;font-size:11px}.metric strong{display:block;margin-top:6px;font-size:16px}.template{padding:18px;border:1px solid #dce2ed;border-radius:10px;margin:0 0 16px;break-inside:avoid}.template-title{display:flex;justify-content:space-between;gap:20px}.template-title small{color:#5b50b8;text-transform:uppercase;font-weight:700}.template-title h2{margin:4px 0;font-size:18px}.template-title p{margin:0;color:#69738b;font-size:12px}.template-title>strong{white-space:nowrap;font-size:18px}.specs{display:grid;grid-template-columns:repeat(3,1fr);gap:0 16px;margin:16px 0}.spec{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid #edf0f5;font-size:11px}.spec span{color:#69738b}table{width:100%;border-collapse:collapse}td,th{padding:10px;border:1px solid #dce2ed;font-size:12px;text-align:left}td:last-child,th:last-child{text-align:right}.subtotal{font-weight:700;background:#f5f7fb}.addons{margin-top:22px;break-inside:avoid}.addons h2{font-size:17px}.addons small{display:block;margin-top:3px;color:#69738b;font-weight:400}.total{margin-top:22px;border:1px solid #dce2ed}.total div{display:flex;justify-content:space-between;padding:11px 14px;border-top:1px solid #dce2ed;font-size:13px}.total div:first-child{border-top:0}.total .grand{background:#17203b;color:#fff;font-size:17px;font-weight:800}@media(max-width:700px){body{padding:0}.sheet{padding:16px}.summary,.specs{grid-template-columns:1fr 1fr}}@media print{body{padding:0;background:#fff}.sheet{max-width:none;border:0}.template{break-inside:avoid}}
    </style></head><body><main class="sheet"><h1 class="title">Quotation cost breakdown</h1><div class="summary"><div class="metric"><span>Selected templates</span><strong>${templateBreakdown.length}</strong></div><div class="metric"><span>Hardware</span><strong>${formatINR(costs.hardware)}</strong></div><div class="metric"><span>Crew</span><strong>${formatINR(costs.staff)}</strong></div><div class="metric"><span>Add-ons</span><strong>${formatINR(costs.addons)}</strong></div></div>${templateRows || `<section class="template">No templates selected.</section>`}${selectedAddons.length ? `<section class="addons"><h2>Add-on details</h2><table><thead><tr><th>Add-on</th><th>Qty</th><th>Unit cost</th><th>Total</th></tr></thead><tbody>${addonRows}</tbody></table></section>` : ""}<section class="total"><div><span>Equipment</span><strong>${formatINR(costs.hardware)}</strong></div><div><span>Crew</span><strong>${formatINR(costs.staff)}</strong></div><div><span>Add-ons</span><strong>${formatINR(costs.addons)}</strong></div>${costs.discount > 0 ? `<div><span>Discount</span><strong>-${formatINR(costs.discount)}</strong></div>` : ""}${costs.gst > 0 ? `<div><span>GST</span><strong>${formatINR(costs.gst)}</strong></div>` : ""}<div class="grand"><span>Grand total</span><strong>${formatINR(costs.total)}</strong></div></section></main></body></html>`
  }

  // Print / save the inline preview iframe as a PDF (no popup window).
  const handlePrintPDF = () => {
    const frame = proposalIframeRef.current
    if (frame?.contentWindow) {
      frame.contentWindow.focus()
      frame.contentWindow.print()
      return
    }
    // Fallback: open a print window if the iframe isn't available.
    const printWindow = window.open("", "_blank")
    if (!printWindow) return
    printWindow.document.write(buildProposalHtml())
    printWindow.document.close()
    printWindow.print()
  }

  // Memoized HTML for the inline proposal preview (rebuilt only when inputs change).
  const proposalHtml = useMemo(
    () => buildProposalHtml(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [proposalCategories, templateBreakdown, costs, inputs, addonsCatalog, addons, margins, allTemplatesList, wizard, pdfTemplate]
  )

  const questionnaireQuestions = [
    { key: "attendeeRange", prompt: "How many attendees are expected?", helper: "Choose the range that best represents the expected event size.", options: attendeeRangeOptions, value: wizard.maxAttendees, setValue: (value: number) => { const range = attendeeRangeOptions.find(option => option.value === value); setWizard(prev => ({ ...prev, minAttendees: range?.min ?? value, maxAttendees: range?.max ?? value })) } },
    { key: "speakerRange", prompt: "How many speakers are expected?", helper: "Choose the closest range and we’ll size the speaker-ready setup.", options: speakerRangeOptions, value: wizard.maxSpeakers, setValue: (value: number) => { const range = speakerRangeOptions.find(option => option.value === value); setWizard(prev => ({ ...prev, minSpeakers: range?.min ?? value, maxSpeakers: range?.max ?? value })) } },
    { key: "roomCount", prompt: "How many presentation rooms will be active?", helper: "You can assign a different room template to each room next.", options: roomOptions, value: wizard.roomCount, setValue: (value: number) => setWizard(prev => ({ ...prev, roomCount: value })) },
    { key: "eventDays", prompt: "How many event days should the quotation cover?", helper: "Daily hardware and staffing rates will use this duration.", options: dayOptions, value: inputs.event_days, setValue: (value: number) => setInputs(prev => ({ ...prev, event_days: value })) },
  ]
  const isReviewingAnswers = questionIndex >= questionnaireQuestions.length
  const activeQuestion = questionnaireQuestions[Math.min(questionIndex, questionnaireQuestions.length - 1)]
  const activeAnswerIsValid = activeQuestion.value > 0

  const completeQuestionnaire = () => {
    const count = Math.max(0, wizard.roomCount)
    setRoomAssignments(Array.from({ length: count }, (_, index) => ({
      id: `room-unassigned-${Date.now()}-${index}`,
      name: `Room ${index + 1}`,
      templateSlug: "",
    })))
    setWizardDone(true)
    setCurrentStep(2)
  }

  const stepLabels = [
    "Questionnaire",
    "Template Selection",
    "Other Add-ons",
    "Pricing & Margins",
    "Cost Summary",
    "Cost Preview"
  ]

  return (
    <PageContainer className="gap-0">
      <div className={styles.simulator}>
        <div className="mb-5 flex items-start justify-between border-b border-[var(--border-subtle)] pb-5">
          <div>
            <span className="mb-1 block text-[9px] font-semibold uppercase text-[var(--text-tertiary)]">Sales quote workspace</span>
            <h2 className="text-xl font-semibold text-[var(--text-primary)]">Quote</h2>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">Configure templates, resources, margins, and a client-ready quote.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowSaveModal(true)} className="h-9 gap-1.5 border-[var(--border-default)] bg-transparent text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]">
              <Save className="h-3.5 w-3.5" /> Save Quote
            </Button>
          </div>
        </div>

        {/* Wizard Progress Tracker */}
        <div className="mb-6 w-full overflow-x-auto border-y border-[var(--border-subtle)] py-3">
          <div className="flex min-w-[760px] items-center justify-between gap-2">
            {stepLabels.map((lbl, idx) => (
              <div key={lbl} className="flex flex-1 items-center gap-2">
                <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border text-[10px] font-semibold transition-colors
                ${currentStep === idx + 1 ? 'border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-surface)]' : currentStep > idx + 1 ? 'border-[var(--border-strong)] bg-[var(--bg-surface-2)] text-[var(--text-primary)]' : 'border-[var(--border-default)] bg-transparent text-[var(--text-tertiary)]'}`}>
                  {currentStep > idx + 1 ? "✓" : idx + 1}
                </div>
                <span className={`whitespace-nowrap text-[9px] font-semibold uppercase ${currentStep === idx + 1 ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)]'}`}>
                  {lbl}
                </span>
                {idx < stepLabels.length - 1 && <div className={`ml-1 h-px flex-1 ${currentStep > idx + 1 ? "bg-[var(--border-strong)]" : "bg-[var(--border-subtle)]"}`} />}
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          {/* Left Side: Step View */}
          <div className={`${currentStep === 1 || currentStep === 6 ? "xl:col-span-12" : "xl:col-span-9"} space-y-6`}>

            {/* STEP 1: Select & Configure Templates */}
            {currentStep === 1 && (
              <div className="space-y-6">

                <div className={`${styles.chatShell} mx-auto w-full max-w-3xl`}>
                  <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className={styles.assistantAvatar}><Sparkles className="h-4 w-4" /></div>
                      <div>
                        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Event configuration assistant</h3>
                        <p className="text-[10px] text-[var(--text-tertiary)]">{isReviewingAnswers ? "Review your event brief" : `Capacity planning · Question ${questionIndex + 1} of ${questionnaireQuestions.length}`}</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold text-[var(--text-secondary)]">{isReviewingAnswers ? "Ready" : `${Math.round(((questionIndex + 1) / questionnaireQuestions.length) * 100)}%`}</span>
                  </div>

                  <div className="space-y-4 p-5 sm:p-7">
                    <div className={`${styles.assistantMessage} ${questionIndex === 0 && !isReviewingAnswers ? "" : "hidden"}`}>
                      I’ll ask a few capacity questions, then recommend the smallest templates that fully cover your event.
                    </div>
                    {!isReviewingAnswers && <>
                    <div className={styles.assistantMessage}>
                      <strong className="block text-[var(--text-primary)]">{activeQuestion.prompt}</strong>
                      <span className="mt-1 block text-[10px] text-[var(--text-tertiary)]">{activeQuestion.helper}</span>
                    </div>

                    <form
                      className="ml-auto w-full max-w-sm space-y-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-4"
                      onSubmit={event => { event.preventDefault(); if (activeAnswerIsValid) setQuestionIndex(index => index + 1) }}
                    >
                      <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Select an answer</label>
                      <select
                        value={customAnswers[activeQuestion.key] ? "custom" : activeQuestion.value || ""}
                        onChange={event => {
                          if (event.target.value === "custom") {
                            setCustomAnswers(prev => ({ ...prev, [activeQuestion.key]: true }))
                            activeQuestion.setValue(0)
                          } else {
                            setCustomAnswers(prev => ({ ...prev, [activeQuestion.key]: false }))
                            activeQuestion.setValue(Number(event.target.value))
                          }
                        }}
                        className="h-11 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-sm font-semibold text-[var(--text-primary)] outline-none"
                      >
                        <option value="" disabled>Choose an option</option>
                        {activeQuestion.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                        <option value="custom">Custom…</option>
                      </select>
                      {customAnswers[activeQuestion.key] && (
                        <Input
                          autoFocus
                          type="number"
                          min={1}
                          value={activeQuestion.value || ""}
                          onChange={event => activeQuestion.setValue(Math.max(0, Number(event.target.value)))}
                          placeholder="Enter a custom value"
                          className="h-11 text-sm"
                        />
                      )}
                      <div className="flex items-center justify-between gap-3 pt-1">
                        <Button type="button" variant="ghost" disabled={questionIndex === 0} onClick={() => setQuestionIndex(index => Math.max(0, index - 1))} className="h-9 text-xs">
                          <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back
                        </Button>
                        <Button
                          type="submit"
                          disabled={!activeAnswerIsValid}
                          className="h-9 px-4 text-xs"
                        >
                          {questionIndex === questionnaireQuestions.length - 1 ? "Review answers" : "Next question"}<ArrowRight className="ml-1 h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </form>
                    </>}
                    {isReviewingAnswers && (
                      <form onSubmit={event => { event.preventDefault(); completeQuestionnaire() }} className="space-y-5">
                        <div className={styles.assistantMessage}>
                          <strong className="block text-[var(--text-primary)]">Review your event brief</strong>
                          <span className="mt-1 block text-[10px] text-[var(--text-tertiary)]">Confirm these answers before I recommend your templates.</span>
                        </div>
                        <div className="overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
                          {questionnaireQuestions.map((question, index) => (
                            <div key={question.key} className="flex items-center justify-between gap-4 border-b border-[var(--border-subtle)] px-4 py-3 last:border-b-0">
                              <div className="min-w-0">
                                <p className="truncate text-[10px] text-[var(--text-tertiary)]">{question.prompt}</p>
                                <p className="mt-0.5 text-sm font-semibold text-[var(--text-primary)]">{question.options.find(option => option.value === question.value)?.label ?? question.value.toLocaleString()}</p>
                              </div>
                              <Button type="button" variant="ghost" onClick={() => setQuestionIndex(index)} className="h-8 px-3 text-[10px]">Edit</Button>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <Button type="button" variant="ghost" onClick={() => setQuestionIndex(questionnaireQuestions.length - 1)} className="h-10 text-xs">
                            <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back
                          </Button>
                          <Button autoFocus type="submit" className="h-10 px-5 text-xs">
                            Confirm and continue <ArrowRight className="ml-1 h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </form>
                    )}
                  </div>
                </div>

              </div>
            )}

            {/* STEP 2: Select templates */}
            {currentStep === 2 && wizardDone && (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className={`${styles.stepSurface} p-4`}>
                    <span className="text-[9px] font-semibold uppercase text-[var(--text-tertiary)]">Registration suggestion</span>
                    <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{wizard.deskCount || "—"} registration counters</p>
                    <p className="mt-1 text-[10px] text-[var(--text-secondary)]">Based on {suggestedRegistrationTemplate?.name || "the selected attendee range"}.</p>
                  </div>
                  <div className={`${styles.stepSurface} p-4`}>
                    <span className="text-[9px] font-semibold uppercase text-[var(--text-tertiary)]">Speaker-ready suggestion</span>
                    <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{wizard.srrStations || "—"} SRR stations</p>
                    <p className="mt-1 text-[10px] text-[var(--text-secondary)]">Based on {suggestedSrrTemplate?.name || "the selected speaker range"}.</p>
                  </div>
                </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary block mb-3">Pick what you need</span>
                    <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {categoriesList.map(cat => {
                        const catTemplates = cat.id === "registration" ? registrationTemplates
                          : cat.id === "srr" ? srrTemplates
                            : roomTemplates
                        const categoryImages = getCategoryImages(cat.id)
                        const activeImage = categoryImages.length > 0 ? categoryImages[carouselTick % categoryImages.length] : ""
                        const matchCount = (catTemplates as any[]).filter(t => isRecommended(t, cat.id as TemplateCategory)).length
                        const selectedInCat = templateBreakdown.filter(t => t.category === cat.id)
                        const hasSelected = selectedInCat.length > 0 || (cat.id === "room" && roomAssignments.some(room => Boolean(room.templateSlug)))
                        return (
                          <Card
                            key={cat.id}
                            onClick={() => {
                              setActiveCategory(cat.id)
                              setModalCategory(cat.id)
                            }}
                            className={`${styles.categoryCard} group flex cursor-pointer select-none flex-col p-0 text-left ${hasSelected ? "border-[var(--border-strong)]" : ""}`}
                          >
                            <div className={styles.categoryVisual}>
                              {activeImage ? (
                                <>
                                  <img key={activeImage} src={activeImage} alt={cat.label} className={styles.categoryHeroImage} />
                                  <div className={styles.categoryImageScrim} />
                                </>
                              ) : null}
                              <div className="z-10 flex h-full w-full items-start justify-between p-4">
                                <div className="rounded-2xl border border-white/10 bg-black/35 p-3 text-white/70 backdrop-blur-sm transition-transform group-hover:scale-105">
                                  <cat.icon className="h-10 w-10" />
                                </div>
                                {categoryImages.length > 1 && (
                                  <div className="rounded-full border border-white/15 bg-black/50 px-2.5 py-1 text-[8px] font-semibold uppercase tracking-[0.24em] text-white/70 backdrop-blur-sm">
                                    {categoryImages.length} visuals
                                  </div>
                                )}
                              </div>
                              <div className="absolute right-3 top-3 z-10 flex flex-col items-end gap-1">
                                <span className="rounded-full border border-white/15 bg-black/70 px-2 py-1 text-[8px] font-semibold uppercase text-white/65">
                                  {cat.count} Templates
                                </span>
                                {matchCount > 0 && (
                                  <span className="rounded-full border border-white/15 bg-white px-2 py-1 text-[8px] font-semibold uppercase text-black">
                                    {matchCount} Match
                                  </span>
                                )}
                                {hasSelected && (
                                  <span className="rounded-full border border-white/25 bg-black/70 px-2 py-1 text-[8px] font-semibold uppercase text-white">
                                    Selected
                                  </span>
                                )}
                              </div>
                              <h4 className="absolute inset-x-4 bottom-4 z-10 text-base font-semibold text-white">{cat.label}</h4>
                            </div>
                            <div className="px-4 pt-4">
                              <span className="line-clamp-2 block min-h-10 text-xs leading-5 text-[var(--text-secondary)]">{cat.desc}</span>
                            </div>
                            <div className="mx-4 mt-auto flex items-center justify-between border-t border-[var(--border-subtle)] py-4 text-[9px] font-semibold uppercase text-[var(--text-secondary)]">
                              <span>View Templates</span>
                              <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
                            </div>
                            {/* Selected template summary — shown after templates are picked */}
                          </Card>
                        )
                      })}
                    </div>
                  </div>
              </div>
            )}

            {/* STEP 3: Add-ons */}
            {currentStep === 3 && (
              <div className={`${styles.stepSurface} overflow-hidden`}>
                <div className="flex flex-col gap-3 border-b border-white/10 bg-white/[0.025] p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h4 className="text-xs font-extrabold uppercase tracking-widest text-primary">Venue &amp; Other Add-ons</h4>
                    <p className="text-[10px] text-tertiary mt-1">Plan add-ons are excluded. Template targeting is shown on each add-on.</p>
                  </div>
                  <div className="text-right">
                    <span className="block text-[9px] uppercase tracking-widest font-black text-secondary">Selected add-ons</span>
                    <span className="text-sm font-black font-mono text-brand-primary">{formatINR(costs.addons)}</span>
                  </div>
                </div>

                {secondaryStepAddons.length === 0 ? (
                  <div className="p-8 text-center text-xs text-secondary">No secondary add-ons available. Template-specific station add-ons stay in step 1.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-5">
                    {secondaryStepAddons.map(addon => (
                      <QuoteAddonCard
                        key={addon.id}
                        addon={addon}
                        quantity={addons[addon.id] || 0}
                        onOpen={() => setDetailAddon(addon)}
                        onDecrease={() => setAddons(prev => ({ ...prev, [addon.id]: Math.max(0, (prev[addon.id] || 0) - 1) }))}
                        onIncrease={() => setAddons(prev => ({ ...prev, [addon.id]: (prev[addon.id] || 0) + 1 }))}
                        getAddonPrice={getAddonPrice}
                        getAddonPriceLabel={getAddonPriceLabel}
                        getAddonBillingLabel={getAddonBillingLabel}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* STEP 4: Pricing & Margins */}
            {currentStep === 4 && (
              <div className={`${styles.stepSurface} space-y-6 p-6`}>
                <h4 className="text-xs font-extrabold uppercase tracking-widest text-secondary flex items-center gap-1.5">
                  <Percent className="h-4 w-4 text-brand-primary" /> Pricing & Margins
                </h4>
                <p className="text-[10px] leading-5 text-white/45">Internal pricing adjustments are absorbed into hardware and crew totals. Only client discount and GST appear separately on the bill.</p>

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

                  <div>
                    <div className="flex justify-between text-xs mb-1 font-bold text-secondary">
                      <span>GST (Tax)</span>
                      <span className="text-brand-primary font-bold">{margins.gst_pct}%</span>
                    </div>
                    <input
                      type="range" min="0" max="28" value={margins.gst_pct}
                      onChange={e => setMargins(prev => ({ ...prev, gst_pct: parseInt(e.target.value) || 0 }))}
                      className="w-full accent-brand-primary"
                    />
                    <p className="text-[9px] text-tertiary mt-1">Set to 18 to add standard GST. Leave at 0 for a tax-free quote.</p>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 5: Cost Summary */}
            {currentStep === 5 && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className={`${styles.stepSurface} p-6 lg:col-span-8`}>
                  <h4 className="text-xs font-extrabold uppercase tracking-widest text-secondary mb-4">Pricing &amp; Cost Breakdown</h4>
                  <div className="space-y-3 text-xs font-semibold text-secondary">
                    <div className="flex justify-between border-b border-white/10 py-3">
                      <span>Equipment Cost</span>
                      <span className="font-mono text-primary font-bold">{formatINR(costs.hardware)}</span>
                    </div>
                    {costs.addonOperationalHardware > 0 && (
                      <div className="flex justify-between border-b border-white/10 py-3 text-[11px] text-white/55">
                        <span>Included in add-on total: hardware</span>
                        <span className="font-mono">{formatINR(costs.addonOperationalHardware)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-b border-white/10 py-3">
                      <span>Staff Cost</span>
                      <span className="font-mono text-primary font-bold">{formatINR(costs.staff)}</span>
                    </div>
                    {costs.addonOperationalStaff > 0 && (
                      <div className="flex justify-between border-b border-white/10 py-3 text-[11px] text-white/55">
                        <span>Included in add-on total: staff</span>
                        <span className="font-mono">{formatINR(costs.addonOperationalStaff)}</span>
                      </div>
                    )}
                    {costs.addons > 0 && (
                      <div className="flex justify-between border-b border-white/10 py-3">
                        <span>Add-ons (amount + hardware + staff)</span>
                        <span className="font-mono text-primary font-bold">{formatINR(costs.addons)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-b border-white/10 py-3">
                      <span>Subtotal</span>
                      <span className="font-mono text-brand-primary font-extrabold">{formatINR(costs.base)}</span>
                    </div>
                    {costs.discount > 0 && (
                      <div className="flex justify-between border-b border-white/10 py-3 text-rose-400">
                        <span>Client Discount</span>
                        <span className="font-mono font-bold">-{formatINR(costs.discount)}</span>
                      </div>
                    )}
                    {costs.gst > 0 && (
                      <div className="flex justify-between border-b border-white/10 py-3">
                        <span>GST ({margins.gst_pct}%)</span>
                        <span className="font-mono text-primary font-bold">{formatINR(costs.gst)}</span>
                      </div>
                    )}
                    <div className="flex justify-between py-3">
                      <span className="text-sm font-black text-primary">Grand Total Quote</span>
                      <span className="font-mono text-brand-primary font-extrabold text-base">{formatINR(costs.total)}</span>
                    </div>
                  </div>

                </div>

                {/* Cost Ratio Pie Chart */}
                <div className={`${styles.stepSurface} flex flex-col justify-between p-6 lg:col-span-4`}>
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

            {/* STEP 6: Cost Preview */}
            {currentStep === 6 && (
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                <div className="hidden">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-extrabold uppercase tracking-widest text-secondary">PDF Template Maker</h4>
                      <p className="mt-1 text-[10px] text-tertiary">Edit branding, footer, quote fields, terms, next steps, and stamp for the generated PDF.</p>
                    </div>
                    <Button onClick={handlePrintPDF} className="h-10 gap-1 bg-white text-xs font-semibold text-black hover:bg-white/85">
                      <Printer className="h-4 w-4" /> Download PDF
                    </Button>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-secondary">Quote Fields</span>
                      <Input value={inputs.simulationName} onChange={e => setInputs(prev => ({ ...prev, simulationName: e.target.value }))} placeholder="Quote name" className="bg-surface-2 border-border text-xs" />
                      <Input value={inputs.customer} onChange={e => setInputs(prev => ({ ...prev, customer: e.target.value }))} placeholder="Prepared for" className="bg-surface-2 border-border text-xs" />
                      <Input value={inputs.preparedBy} onChange={e => setInputs(prev => ({ ...prev, preparedBy: e.target.value }))} placeholder="Prepared by" className="bg-surface-2 border-border text-xs" />
                      <Input value={inputs.refNumber} onChange={e => setInputs(prev => ({ ...prev, refNumber: e.target.value }))} placeholder="Quote reference" className="bg-surface-2 border-border text-xs" />
                    </div>

                    <div className="space-y-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-secondary">Branding</span>
                      <Input value={pdfTemplate.companyName} onChange={e => setPdfTemplate(prev => ({ ...prev, companyName: e.target.value }))} placeholder="Company name" className="bg-surface-2 border-border text-xs" />
                      <Input value={pdfTemplate.companyTagline} onChange={e => setPdfTemplate(prev => ({ ...prev, companyTagline: e.target.value }))} placeholder="Company tagline" className="bg-surface-2 border-border text-xs" />
                      <Input value={pdfTemplate.logoUrl} onChange={e => setPdfTemplate(prev => ({ ...prev, logoUrl: e.target.value }))} placeholder="Logo image URL" className="bg-surface-2 border-border text-xs" />
                      <Input value={pdfTemplate.stampUrl} onChange={e => setPdfTemplate(prev => ({ ...prev, stampUrl: e.target.value }))} placeholder="Stamp image URL" className="bg-surface-2 border-border text-xs" />
                      <Input value={pdfTemplate.stampLabel} onChange={e => setPdfTemplate(prev => ({ ...prev, stampLabel: e.target.value }))} placeholder="Stamp label fallback" className="bg-surface-2 border-border text-xs" />
                      <Input value={pdfTemplate.footerText} onChange={e => setPdfTemplate(prev => ({ ...prev, footerText: e.target.value }))} placeholder="Footer thank-you text" className="bg-surface-2 border-border text-xs" />
                    </div>

                    <div className="space-y-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-secondary">Section Titles</span>
                      <Input value={pdfTemplate.coverTitle} onChange={e => setPdfTemplate(prev => ({ ...prev, coverTitle: e.target.value }))} placeholder="Cover title" className="bg-surface-2 border-border text-xs" />
                      <Input value={pdfTemplate.coverSubtitle} onChange={e => setPdfTemplate(prev => ({ ...prev, coverSubtitle: e.target.value }))} placeholder="Cover subtitle" className="bg-surface-2 border-border text-xs" />
                      <Input value={pdfTemplate.solutionTitle} onChange={e => setPdfTemplate(prev => ({ ...prev, solutionTitle: e.target.value }))} placeholder="Solution title" className="bg-surface-2 border-border text-xs" />
                      <Input value={pdfTemplate.addOnsTitle} onChange={e => setPdfTemplate(prev => ({ ...prev, addOnsTitle: e.target.value }))} placeholder="Add-ons title" className="bg-surface-2 border-border text-xs" />
                      <Input value={pdfTemplate.summaryTitle} onChange={e => setPdfTemplate(prev => ({ ...prev, summaryTitle: e.target.value }))} placeholder="Summary title" className="bg-surface-2 border-border text-xs" />
                    </div>

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <div className="space-y-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-secondary">Terms</span>
                        <Input value={pdfTemplate.termsTitle} onChange={e => setPdfTemplate(prev => ({ ...prev, termsTitle: e.target.value }))} placeholder="Terms title" className="bg-surface-2 border-border text-xs" />
                        <textarea value={pdfTemplate.termsItems} onChange={e => setPdfTemplate(prev => ({ ...prev, termsItems: e.target.value }))} rows={7} className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-primary" />
                      </div>
                      <div className="space-y-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-secondary">Next Steps</span>
                        <Input value={pdfTemplate.nextStepsTitle} onChange={e => setPdfTemplate(prev => ({ ...prev, nextStepsTitle: e.target.value }))} placeholder="Next steps title" className="bg-surface-2 border-border text-xs" />
                        <textarea value={pdfTemplate.nextStepsItems} onChange={e => setPdfTemplate(prev => ({ ...prev, nextStepsItems: e.target.value }))} rows={7} className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-primary" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 xl:col-span-12">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h4 className="text-xs font-extrabold uppercase tracking-widest text-secondary flex items-center gap-1.5">
                        <FileText className="h-4 w-4 text-brand-primary" /> Cost &amp; Configuration Preview
                      </h4>
                      <p className="text-[10px] text-tertiary mt-1">Selected templates, infrastructure, add-ons, and the exact cost breakdown only.</p>
                    </div>
                    <Button onClick={handlePrintPDF} className="h-10 gap-1.5 px-4 text-xs font-semibold">
                      <Printer className="h-4 w-4" /> Download PDF
                    </Button>
                  </div>
                  <div className="overflow-hidden rounded-lg border border-white/15 bg-white shadow-2xl shadow-black/40">
                    <iframe
                      ref={proposalIframeRef}
                      srcDoc={proposalHtml}
                      title="Proposal preview"
                      className="w-full h-[900px] bg-white"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Stepper Navigation Buttons */}
            {currentStep > 1 && <div className="flex justify-between border-t border-[var(--border-subtle)] pt-5">
              <Button
                variant="outline"
                disabled={currentStep === 1}
                onClick={() => setCurrentStep(prev => prev - 1)}
                className="h-10 gap-1 border-white/20 bg-transparent text-xs font-semibold text-white hover:bg-white/10 hover:text-white"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Previous Step
              </Button>

              {currentStep < stepLabels.length ? (
                <Button
                  onClick={() => setCurrentStep(prev => prev + 1)}
                  className="h-10 gap-1 bg-white px-5 text-xs font-semibold text-black hover:bg-white/85"
                >
                  Continue <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button
                  onClick={() => setShowSaveModal(true)}
                  className="h-10 gap-1 bg-white px-5 text-xs font-semibold text-black hover:bg-white/85"
                >
                  <Save className="h-3.5 w-3.5" /> Save Quotation
                </Button>
              )}
            </div>}

          </div>

          {/* Right Side: Sticky Financial Dashboard */}
          {currentStep !== 1 && currentStep !== 6 && (
          <aside className="sticky top-4 flex h-[560px] flex-col justify-between rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 xl:col-span-3">
            <div className="flex-1 overflow-y-auto min-h-0 pr-1 -mr-1">
              <div className="mb-4">
                <h3 className="text-xs font-extrabold uppercase tracking-widest text-secondary">
                  Pricing Snapshot
                </h3>
              </div>

              <div className="space-y-3 text-xs font-semibold text-secondary">
                {/* Category-wise breakdown */}
                <div className="space-y-2 pt-1">
                  <span className="text-[10px] uppercase tracking-widest font-black text-tertiary">Category Breakdown</span>
                  {categoryBreakdown.filter(cat => cat.templates > 0).length === 0 && (
                    <p className="text-[10px] text-tertiary font-medium">Select templates to see category-wise costs.</p>
                  )}
                  {categoryBreakdown.filter(cat => cat.templates > 0).map(cat => (
                    <div key={cat.id} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-2.5 space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="text-[11px] font-bold text-primary">{cat.label}</span>
                      </div>
                      <div className="flex justify-between text-[10px] font-medium">
                        <span>Hardware</span>
                        <span className="font-mono text-primary">{formatINR(cat.hardware * internalPricingMultiplier)}</span>
                      </div>
                      <div className="flex justify-between text-[10px] font-medium">
                        <span>Staff</span>
                        <span className="font-mono text-primary">{formatINR(cat.staff * internalPricingMultiplier)}</span>
                      </div>
                      <div className="flex justify-between text-[10px] font-bold text-primary border-t border-border/40 pt-1">
                        <span>Subtotal</span>
                        <span className="font-mono">{formatINR(cat.total * internalPricingMultiplier)}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="h-px bg-border/40 my-1" />
                <div className="flex justify-between">
                  <span>Total Equipment Cost</span>
                  <span className="font-mono text-primary">{formatINR(costs.hardware)}</span>
                </div>
                {costs.addonOperationalHardware > 0 && (
                  <div className="flex justify-between text-[10px] text-[var(--text-secondary)]">
                    <span>Included in add-on total: hardware</span>
                    <span className="font-mono">{formatINR(costs.addonOperationalHardware)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Total Staff Cost</span>
                  <span className="font-mono text-primary">{formatINR(costs.staff)}</span>
                </div>
                {costs.addonOperationalStaff > 0 && (
                  <div className="flex justify-between text-[10px] text-[var(--text-secondary)]">
                    <span>Included in add-on total: staff</span>
                    <span className="font-mono">{formatINR(costs.addonOperationalStaff)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Add-ons (amount + hardware + staff)</span>
                  <span className="font-mono text-primary">{formatINR(costs.addons)}</span>
                </div>
                {costs.discount > 0 && (
                  <div className="flex justify-between text-danger">
                    <span>Client Discount</span>
                    <span className="font-mono">-{formatINR(costs.discount)}</span>
                  </div>
                )}
                {costs.gst > 0 && (
                  <div className="flex justify-between">
                    <span>GST</span>
                    <span className="font-mono text-primary">{formatINR(costs.gst)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t border-[var(--border-subtle)]">
              <div className="flex justify-between items-baseline mb-2">
                <span className="text-xs font-bold text-primary">Suggested Quote</span>
                <span className="font-mono text-xl font-semibold text-[var(--text-primary)]">
                  {formatINR(costs.total)}
                </span>
              </div>
              <Button
                onClick={() => setShowSaveModal(true)}
                className="h-10 w-full gap-1.5 bg-[var(--text-primary)] text-xs font-semibold text-[var(--bg-surface)] hover:opacity-85"
              >
                <Save className="h-4 w-4" /> Save Estimate
              </Button>
            </div>
          </aside>
          )}

        </div>

        {/* Edit Quote Details Modal */}
        {showEditModal && typeof document !== "undefined" && createPortal(
          <div className={`${styles.themeScope} fixed inset-0 z-50 flex h-[100dvh] w-screen items-stretch justify-center overflow-hidden bg-black/75 p-0 backdrop-blur-sm overscroll-none sm:items-center sm:p-4`}>
            <div className="w-full max-w-md space-y-4 rounded-xl border border-white/15 bg-black p-6 text-white shadow-2xl">
              <h3 className="text-base font-bold text-primary">Edit Quote Details</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-secondary mb-1 block">Quote Name</label>
                  <Input
                    value={inputs.simulationName}
                    onChange={e => setInputs(prev => ({ ...prev, simulationName: e.target.value }))}
                    className="bg-surface-2 border-border text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs text-secondary mb-1 block">Prepared For</label>
                  <Input
                    value={inputs.customer}
                    onChange={e => setInputs(prev => ({ ...prev, customer: e.target.value }))}
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
                  <label className="text-xs text-secondary mb-1 block">City Tier</label>
                  <select
                    value={inputs.event_city_tier}
                    onChange={e => setInputs(prev => ({ ...prev, event_city_tier: e.target.value }))}
                    className="w-full h-9 rounded-md bg-surface-2 border border-border text-xs px-3 text-primary"
                  >
                    {cityTierOptions.map(tier => (
                      <option key={tier} value={tier}>{tier}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  onClick={() => setShowEditModal(false)}
                  className="bg-white text-xs font-semibold text-black hover:bg-white/85"
                >
                  Done
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Save Quote Modal Dialog */}
        {showSaveModal && typeof document !== "undefined" && createPortal(
          <div className={`${styles.themeScope} fixed inset-0 z-50 flex h-[100dvh] w-screen items-stretch justify-center overflow-hidden bg-black/75 p-0 backdrop-blur-sm overscroll-none sm:items-center sm:p-4`}>
            <div className="w-full max-w-md space-y-4 rounded-xl border border-white/15 bg-black p-6 text-white shadow-2xl">
              <h3 className="text-base font-bold text-primary">Save Estimate</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-secondary mb-1 block">Estimate Name *</label>
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
                  className="bg-white text-xs font-semibold text-black hover:bg-white/85"
                >
                  Confirm Save
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Template Selection Modal */}
        {modalCategory !== null && typeof document !== "undefined" && createPortal(
          <div className={`${styles.themeScope} fixed inset-0 z-50 flex h-[100dvh] w-screen items-stretch justify-center overflow-hidden bg-black/80 p-0 backdrop-blur-sm overscroll-none sm:items-center sm:p-4`}>
            <div className="flex h-[100dvh] w-full max-w-7xl flex-col overflow-hidden border border-white/15 bg-black text-white shadow-2xl animate-in fade-in zoom-in-95 duration-200 sm:h-[92dvh] sm:max-h-[92dvh] sm:rounded-xl">

              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/10 bg-[#080808] p-5">
                <div>
                  <h3 className="text-base font-black text-primary">
                    {categoriesList.find(c => c.id === modalCategory)?.label}
                  </h3>
                  <p className="text-[10px] text-tertiary mt-0.5">
                    {modalCategory === "room"
                      ? "Assign templates to each named room. Add rooms on the left, browse templates on the right."
                      : "Templates matching your event parameters are marked Recommended. Select what you need."}
                  </p>
                </div>
                <button
                  onClick={() => setModalCategory(null)}
                  className="p-2 hover:bg-surface-hover rounded-full text-secondary hover:text-primary transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Room Modal — 2-panel split */}
              {modalCategory === "room" ? (
                <div className="flex-1 flex overflow-hidden">

                  {/* Left: Room list */}
                  <div className="w-2/5 border-r border-border flex flex-col bg-surface-2/30">
                    <div className="p-4 border-b border-border/60 flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-secondary">Your Rooms ({roomAssignments.length})</span>
                      <button
                        type="button"
                      onClick={() => addRoomAssignment("")}
                        className="flex items-center gap-1 text-[10px] font-black text-brand-primary hover:text-brand-primary/80 transition-colors"
                      >
                        <Plus className="h-3 w-3" /> Add Room
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-2">
                      {roomAssignments.length === 0 && (
                        <p className="text-[10px] text-tertiary text-center py-8">No rooms added yet.<br />Click "+ Add Room" to start.</p>
                      )}
                      {roomAssignments.map((room, idx) => (
                        <div key={room.id} className="flex items-center gap-2 bg-[var(--bg-surface)] border border-border rounded-xl p-2.5">
                          <span className="text-[9px] text-tertiary font-bold w-5 text-center flex-shrink-0">{idx + 1}</span>
                          <Input
                            value={room.name}
                            onChange={e => renameRoomAssignment(room.id, e.target.value)}
                            className="h-7 text-[10px] bg-surface-2 border-border rounded-lg flex-1 min-w-0"
                            placeholder={`Room ${idx + 1}`}
                          />
                        <select
                          value={room.templateSlug}
                          onChange={e => changeRoomTemplate(room.id, e.target.value)}
                            className="h-7 text-[10px] bg-surface-2 border border-border rounded-lg px-1.5 text-secondary font-semibold flex-shrink-0 max-w-[120px]"
                        >
                          <option value="">Select template</option>
                          {(roomTemplates as any[]).map((t: any) => (
                              <option key={t.slug} value={t.slug}>{t.name}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => removeRoomAssignment(room.id)}
                            className="h-7 w-7 flex-shrink-0 rounded-lg bg-surface-3 border border-border flex items-center justify-center text-secondary hover:text-danger hover:border-danger/40 transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Running total */}
                    {roomAssignments.length > 0 && (
                      <div className="p-4 border-t border-border/60 space-y-1">
                        <div className="flex justify-between text-[10px] text-secondary font-semibold">
                          <span>{roomAssignments.length} room(s)</span>
                          <span className="font-mono text-brand-primary font-black">
                            {formatINR(roomAssignments.reduce((acc, room) => {
                              const tpl = allTemplatesList.find((t: any) => t.slug === room.templateSlug)
                              return acc + (tpl ? getTemplatePrice(tpl).min * categoryDays.room : 0)
                            }, 0))}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right: Room template cards — 2-col grid */}
                  <div className="flex-1 overflow-y-auto overscroll-contain p-5 bg-[var(--bg-main)]">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {(roomTemplates as any[]).map((tpl: any) => {
                        const roomsUsing = roomAssignments.filter(r => r.templateSlug === tpl.slug)
                        const isInUse = roomsUsing.length > 0
                        return (
                          <PremiumTemplateCard
                            key={tpl.slug}
                            template={tpl}
                            category="room"
                            Icon={Layout}
                            hardwarePricesMap={hardwarePricesMap}
                            staffPricesMap={staffPricesMap}
                            isSelected={isInUse}
                            onViewDetails={() => setDetailTemplate({ template: tpl, category: "room" })}
                            onUseTemplate={() => usePremiumTemplate(tpl, "room")}
                          />
                        )
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                /* Non-room template modal — 4-col grid with compact cards */
                <div className="flex-1 overflow-hidden bg-[var(--bg-main)]">
                  {(() => {
                    const modalTemplateCategory = modalCategory as Exclude<TemplateCategory, "room">
                    const modalTemplates = modalTemplateCategory === "registration" ? registrationTemplates : srrTemplates
                    const sortedTpls = [...modalTemplates].sort((a: any, b: any) =>
                      (isRecommended(b, modalTemplateCategory) ? 1 : 0) - (isRecommended(a, modalTemplateCategory) ? 1 : 0)
                    )
                    const firstNonRecIdx = sortedTpls.findIndex((t: any) => !isRecommended(t, modalTemplateCategory))
                    const stepAddonsForCategory = templateStepAddons.filter((addon) => (addon.template_types || []).includes(modalTemplateCategory))
                    const categoryHasSelection = hasSelectedTemplateInCategory(modalTemplateCategory)
                    return (
                      <div className="flex h-full flex-col lg:flex-row">
                        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6">
                          <div className="mb-4 flex items-center justify-between gap-3">
                            <div>
                              <span className="text-[9px] font-semibold uppercase tracking-[0.24em] text-white/40">Templates</span>
                              <h5 className="mt-1 text-sm font-semibold text-white">Browse and select templates</h5>
                            </div>
                            <span className="text-[10px] font-black text-white/55">{sortedTpls.length} options</span>
                          </div>

                          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                            {sortedTpls.map((tpl: any, idx: number) => {
                              const isSelected = selectedTemplates[tpl.slug]?.selected || false
                              const isRec = isRecommended(tpl, modalTemplateCategory)

                              return (
                                <div key={tpl.slug} className="contents">
                                  {idx === firstNonRecIdx && firstNonRecIdx > 0 && (
                                    <div className="col-span-full my-2 flex items-center gap-3">
                                      <div className="flex-1 h-px bg-border/50" />
                                      <span className="text-[9px] font-black uppercase tracking-widest text-tertiary">Other Templates</span>
                                      <div className="flex-1 h-px bg-border/50" />
                                    </div>
                                  )}
                                  <div className={`relative transition-all duration-200 ${isSelected
                                      ? "rounded-xl ring-2 ring-white shadow-[0_0_28px_8px_rgba(255,255,255,0.12)]"
                                      : ""
                                    }`}>
                                    {isSelected && (
                                      <div className="absolute -top-2.5 -right-2.5 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-white text-black shadow-xl">
                                        <Check className="h-3.5 w-3.5 stroke-[3]" />
                                      </div>
                                    )}
                                    <PremiumTemplateCard
                                      template={tpl}
                                      category={modalTemplateCategory}
                                      Icon={getCategoryIcon(modalTemplateCategory)}
                                      hardwarePricesMap={hardwarePricesMap}
                                      staffPricesMap={staffPricesMap}
                                      isSelected={isSelected}
                                      isRecommended={isRec}
                                      onViewDetails={() => setDetailTemplate({ template: tpl, category: modalTemplateCategory })}
                                      onUseTemplate={() => usePremiumTemplate(tpl, modalTemplateCategory)}
                                    />
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>

                        {(modalTemplateCategory === "registration" || modalTemplateCategory === "srr") && (
                          <aside className="flex w-full flex-col border-t border-white/10 bg-white/[0.02] lg:w-[380px] lg:border-l lg:border-t-0">
                            <div className="border-b border-white/10 p-5">
                              <span className="text-[9px] font-semibold uppercase tracking-[0.24em] text-white/40">Add-ons & billing</span>
                              <h5 className="mt-1 text-sm font-semibold text-white">
                                {modalTemplateCategory === "registration" ? "Additional registration counters & stations" : "Additional SRR stations"}
                              </h5>
                              <p className="mt-1 text-[10px] text-white/45">
                                These add-ons unlock extra stations only after a template is selected for this category.
                              </p>
                              <div className="mt-4 flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-white/55">Selected add-ons</span>
                                <span className="text-sm font-black text-brand-primary">{stepAddonsForCategory.filter(addon => (addons[addon.id] || 0) > 0).length}</span>
                              </div>
                            </div>

                            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
                              {!categoryHasSelection ? (
                                <div className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-center text-[11px] text-white/50">
                                  Select a {modalTemplateCategory === "registration" ? "registration template" : "speaker ready room template"} first to enable these add-ons.
                                </div>
                              ) : stepAddonsForCategory.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-center text-[11px] text-white/50">
                                  No template-specific add-ons are configured for this category yet.
                                </div>
                              ) : (
                                <div className="space-y-4">
                                  {stepAddonsForCategory.map((addon) => (
                                    <QuoteAddonCard
                                      key={addon.id}
                                      addon={addon}
                                      quantity={addons[addon.id] || 0}
                                      onOpen={() => setDetailAddon(addon)}
                                      onDecrease={() => setAddons(prev => ({ ...prev, [addon.id]: Math.max(0, (prev[addon.id] || 0) - 1) }))}
                                      onIncrease={() => setAddons(prev => ({ ...prev, [addon.id]: (prev[addon.id] || 0) + 1 }))}
                                      getAddonPrice={getAddonPrice}
                                      getAddonPriceLabel={getAddonPriceLabel}
                                      getAddonBillingLabel={getAddonBillingLabel}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          </aside>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* Footer */}
              <div className="p-4 border-t border-border bg-surface-2/60 flex justify-end">
                <Button
                  onClick={() => setModalCategory(null)}
                  className="h-10 rounded-md bg-white px-6 text-xs font-semibold text-black hover:bg-white/85"
                >
                  Done
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}
            <TemplateDetailSheet
              template={detailTemplate?.template ?? null}
              category={detailTemplate?.category ?? "registration"}
              Icon={getCategoryIcon(detailTemplate?.category ?? "registration")}
              hardwarePricesMap={hardwarePricesMap}
              staffPricesMap={staffPricesMap}
              open={!!detailTemplate}
              onOpenChange={(open) => {
                if (!open) setDetailTemplate(null)
              }}
              onUseTemplate={() => {
                if (detailTemplate) usePremiumTemplate(detailTemplate.template, detailTemplate.category)
              }}
            />
            <QuoteAddonDetailSheet
              addon={detailAddon}
              open={!!detailAddon}
              onOpenChange={(open) => {
                if (!open) setDetailAddon(null)
              }}
              quantity={detailAddon ? addons[detailAddon.id] || 0 : 0}
              onDecrease={() => {
                if (!detailAddon) return
                setAddons(prev => ({ ...prev, [detailAddon.id]: Math.max(0, (prev[detailAddon.id] || 0) - 1) }))
              }}
              onIncrease={() => {
                if (!detailAddon) return
                setAddons(prev => ({ ...prev, [detailAddon.id]: (prev[detailAddon.id] || 0) + 1 }))
              }}
              getAddonPrice={getAddonPrice}
              getAddonPriceLabel={getAddonPriceLabel}
              getAddonBillingLabel={getAddonBillingLabel}
              getAddonOperationalCost={getAddonOperationalCost}
            />
          </div>
    </PageContainer>
  )
}
function QuoteAddonCard({
  addon,
  quantity,
  onOpen,
  onDecrease,
  onIncrease,
  getAddonPrice,
  getAddonPriceLabel,
  getAddonBillingLabel,
}: {
  addon: Addon
  quantity: number
  onOpen: () => void
  onDecrease: () => void
  onIncrease: () => void
  getAddonPrice: (addon: Addon) => number
  getAddonPriceLabel: (addon: Addon) => string
  getAddonBillingLabel: (addon: Addon) => string
}) {
  const imageUrl = typeof addon.image_url === "string" && addon.image_url.trim() ? addon.image_url.trim() : undefined
  const targets = addon.template_types?.length ? addon.template_types.map((item) => (item === "srr" ? "SRR" : item)).join(" · ") : "Other"
  const subtotal = quantity * getAddonPrice(addon)

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onOpen()
        }
      }}
      className={`group relative flex min-h-[500px] cursor-pointer flex-col overflow-hidden rounded-3xl border bg-[#080808] text-white shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-md ${quantity > 0 ? "border-white/55" : "border-white/12 hover:border-white/30"}`}
    >
      <div className="relative h-[250px] overflow-hidden border-b border-white/10 bg-black">
        {imageUrl ? (
          <img src={imageUrl} alt={addon.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,.14),transparent_36%),linear-gradient(135deg,#050505,#1a1a1a)]">
            <div className="rounded-full border border-white/10 bg-white/5 p-4 text-white/55">
              <Grid className="h-7 w-7" />
            </div>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/85 to-transparent px-4 pb-4 pt-12 text-white">
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.2em]">Step add-on</span>
            <span className={`rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.2em] ${quantity > 0 ? "bg-white text-black" : "bg-white/10 text-white/55"}`}>
              {quantity > 0 ? "Selected" : "Available"}
            </span>
          </div>
          <h3 className="mt-3 truncate text-lg font-semibold">{addon.name}</h3>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="line-clamp-2 min-h-10 text-xs leading-5 text-white/65">{addon.short_description || addon.description || addon.key}</p>

        <div className="mt-3 grid grid-cols-3 border-y border-white/10 py-3">
          <div className="min-w-0 border-r border-white/10 px-1 text-center">
            <div className="truncate text-[9px] text-white/45">Billing</div>
            <div className="mt-1 truncate text-sm font-semibold text-white">{String(addon.billing_unit || "PER_EVENT").replaceAll("_", " ")}</div>
          </div>
          <div className="min-w-0 border-r border-white/10 px-1 text-center">
            <div className="truncate text-[9px] text-white/45">Quantity</div>
            <div className="mt-1 truncate text-sm font-semibold text-white">{quantity}</div>
          </div>
          <div className="min-w-0 px-1 text-center">
            <div className="truncate text-[9px] text-white/45">Target</div>
            <div className="mt-1 truncate text-sm font-semibold text-white">{targets || "Other"}</div>
          </div>
        </div>

        <div className="mt-4 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[9px] uppercase text-white/45">Price range</div>
            <div className="mt-1 truncate text-lg font-semibold text-white">{getAddonPriceLabel(addon)}</div>
          </div>
          <div className="text-right">
            <div className="text-[9px] uppercase text-white/45">{getAddonBillingLabel(addon)}</div>
            <div className="mt-1 text-sm font-semibold text-white">{subtotal > 0 ? formatINR(subtotal) : "Not added"}</div>
          </div>
        </div>

        <div className="mt-3 min-h-6">
          <p className="line-clamp-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">{targets}</p>
        </div>

        <div className="mt-auto grid grid-cols-[1fr_auto_auto] gap-2 pt-4">
          <Button type="button" variant="outline" onClick={(event) => { event.stopPropagation(); onOpen() }} className="h-10 rounded-md border-white/15 bg-transparent text-xs font-semibold text-white hover:bg-white/10 hover:text-white">
            View Details
          </Button>
          <Button type="button" size="icon" variant="ghost" disabled={quantity === 0} onClick={(event) => { event.stopPropagation(); onDecrease() }} className="h-10 w-10 rounded-md border border-white/15 text-white/75 hover:bg-white/10 hover:text-white disabled:opacity-30">
            <Minus className="h-4 w-4" />
          </Button>
          <Button type="button" size="icon" onClick={(event) => { event.stopPropagation(); onIncrease() }} className="h-10 w-10 rounded-md bg-white text-black hover:bg-white/85">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </article>
  )
}

function QuoteAddonDetailSheet({
  addon,
  open,
  onOpenChange,
  quantity,
  onDecrease,
  onIncrease,
  getAddonPrice,
  getAddonPriceLabel,
  getAddonBillingLabel,
  getAddonOperationalCost,
}: {
  addon: Addon | null
  open: boolean
  onOpenChange: (open: boolean) => void
  quantity: number
  onDecrease: () => void
  onIncrease: () => void
  getAddonPrice: (addon: Addon) => number
  getAddonPriceLabel: (addon: Addon) => string
  getAddonBillingLabel: (addon: Addon) => string
  getAddonOperationalCost: (addon: Addon, quantity?: number) => { hardware: number; staff: number; consumables: number; total: number }
}) {
  const imageUrl = typeof addon?.image_url === "string" && addon.image_url.trim() ? addon.image_url.trim() : undefined
  const inclusions = Array.isArray(addon?.inclusions) ? addon!.inclusions!.filter(Boolean) : []
  const exclusions = Array.isArray(addon?.exclusions) ? addon!.exclusions!.filter(Boolean) : []
  const operational = addon ? getAddonOperationalCost(addon, Math.max(quantity, 1)) : { hardware: 0, staff: 0, consumables: 0, total: 0 }
  const commercialMin = Number(addon?.min_price_inr ?? addon?.price_inr ?? addon?.max_price_inr ?? 0) * quantity
  const commercialMax = Math.max(commercialMin, Number(addon?.max_price_inr ?? addon?.price_inr ?? addon?.min_price_inr ?? 0) * quantity)
  const commercialLabel = commercialMin === commercialMax ? formatINR(commercialMin) : `${formatINR(commercialMin)} - ${formatINR(commercialMax)}`
  const totalMin = commercialMin + operational.hardware + operational.staff
  const totalMax = commercialMax + operational.hardware + operational.staff
  const totalLabel = totalMin === totalMax ? formatINR(totalMin) : `${formatINR(totalMin)} - ${formatINR(totalMax)}`

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)] sm:max-w-[560px]">
        {addon && (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="relative h-[40dvh] min-h-[280px] w-full overflow-hidden border-b border-[var(--border-default)] bg-black">
                {imageUrl ? (
                  <img src={imageUrl} alt={addon.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Grid className="h-14 w-14 text-white/35" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-black/20" />
              </div>

              <div className="space-y-4 p-5">
                <SheetHeader className="pr-8">
                  <div className="mb-1 flex items-center gap-2 text-[9px] uppercase text-[var(--text-tertiary)]">
                    <span>{addon.is_active === false ? "Inactive" : "Active"}</span>
                    <span>•</span>
                    <span>Quote add-on</span>
                  </div>
                  <SheetTitle className="text-xl">{addon.name}</SheetTitle>
                  <SheetDescription className="line-clamp-none text-xs leading-5 text-[var(--text-secondary)]">
                    {addon.description || addon.short_description || addon.key}
                  </SheetDescription>
                </SheetHeader>

                <section className="border-y border-[var(--border-default)] py-3">
                  <h3 className="mb-2 text-[10px] font-semibold uppercase text-[var(--text-tertiary)]">Detailed view</h3>
                  <div className="grid grid-cols-4 divide-x divide-[var(--border-default)]">
                    <div className="min-w-0 px-2 first:pl-0">
                      <div className="truncate text-[8px] text-[var(--text-tertiary)]">Billing</div>
                      <div className="mt-1 truncate text-xs font-semibold text-[var(--text-primary)]">{String(addon.billing_unit || "PER_EVENT").replaceAll("_", " ")}</div>
                    </div>
                    <div className="min-w-0 px-2">
                      <div className="truncate text-[8px] text-[var(--text-tertiary)]">Price</div>
                      <div className="mt-1 truncate text-xs font-semibold text-[var(--text-primary)]">{getAddonPriceLabel(addon)}</div>
                    </div>
                    <div className="min-w-0 px-2">
                      <div className="truncate text-[8px] text-[var(--text-tertiary)]">Quantity</div>
                      <div className="mt-1 truncate text-xs font-semibold text-[var(--text-primary)]">{quantity}</div>
                    </div>
                    <div className="min-w-0 px-2">
                      <div className="truncate text-[8px] text-[var(--text-tertiary)]">Target</div>
                      <div className="mt-1 truncate text-xs font-semibold text-[var(--text-primary)]">{(addon.template_types || ["other"]).map((item) => item === "srr" ? "SRR" : item).join(", ")}</div>
                    </div>
                  </div>
                </section>

                <div className="grid grid-cols-2 gap-5 border-b border-[var(--border-default)] pb-4">
                  <section>
                    <h3 className="mb-2.5 text-xs font-semibold text-[var(--text-primary)]">Inclusions</h3>
                    <DetailList items={inclusions} type="included" />
                  </section>
                  <section className="border-l border-[var(--border-default)] pl-5">
                    <h3 className="mb-2.5 text-xs font-semibold text-[var(--text-primary)]">Exclusions</h3>
                    <DetailList items={exclusions} type="excluded" />
                  </section>
                </div>

                <section>
                  <h3 className="mb-2 text-xs font-semibold text-[var(--text-primary)]">Cost breakdown</h3>
                  <div className="divide-y divide-[var(--border-default)] border-y border-[var(--border-default)]">
                    <div className="flex items-center justify-between py-2 text-xs">
                      <span className="text-[var(--text-secondary)]">Commercial charge</span>
                      <span className="font-mono font-semibold text-[var(--text-primary)]">{commercialLabel}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 text-xs">
                      <span className="text-[var(--text-secondary)]">Hardware cost</span>
                      <span className="font-mono font-semibold text-[var(--text-primary)]">{formatINR(operational.hardware)}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 text-xs">
                      <span className="text-[var(--text-secondary)]">Staff cost</span>
                      <span className="font-mono font-semibold text-[var(--text-primary)]">{formatINR(operational.staff)}</span>
                    </div>
                    <div className="flex items-center justify-between py-3 text-sm font-semibold">
                      <span>Total ({getAddonBillingLabel(addon)})</span>
                      <span className="font-mono">{totalLabel}</span>
                    </div>
                  </div>
                </section>
              </div>
            </div>

            <SheetFooter className="border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
              <div className="grid w-full grid-cols-[1fr_auto_auto] gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-11 rounded-md border-[var(--border-default)] bg-transparent text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-2)]">
                  Close
                </Button>
                <Button type="button" size="icon" variant="ghost" disabled={quantity === 0} onClick={onDecrease} className="h-11 w-11 rounded-md border border-[var(--border-default)]">
                  <Minus className="h-4 w-4" />
                </Button>
                <Button type="button" size="icon" onClick={onIncrease} className="h-11 w-11 rounded-md bg-black text-sm font-semibold text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/85">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function DetailList({ items, type }: { items: string[]; type: "included" | "excluded" }) {
  const ItemIcon = type === "included" ? Check : X

  if (items.length === 0) {
    return <p className="text-[10px] leading-4 text-[var(--text-tertiary)]">No items configured.</p>
  }

  return (
    <div className="space-y-1.5">
      {items.map((item) => (
        <div key={item} className="flex gap-2 text-[11px] leading-4 text-[var(--text-secondary)]">
          <ItemIcon className="mt-0.5 h-3 w-3 flex-shrink-0 text-[var(--text-secondary)]" />
          <span>{item}</span>
        </div>
      ))}
    </div>
  )
}

