"use client"

import { type LucideIcon, ArrowRight, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatINR } from "@/services/super-admin-service"

type TemplateCategory = "room" | "registration" | "srr"

export type TemplatePriceMap = Record<string, number>

export interface PremiumTemplateCardProps {
  template: any
  category: TemplateCategory
  Icon: LucideIcon
  hardwarePricesMap: TemplatePriceMap
  staffPricesMap: TemplatePriceMap
  isSelected?: boolean
  isRecommended?: boolean
  recommendationLabel?: string
  secondaryActionLabel?: string
  primaryActionLabel?: string
  onViewDetails: () => void
  onUseTemplate: () => void
}

export function getTemplateCosts(template: any, hardwarePricesMap: TemplatePriceMap, staffPricesMap: TemplatePriceMap) {
  const hardware = (template.hardware_allocation || []).reduce((total: number, item: any) => {
    return total + Number(item.quantity || 0) * Number(hardwarePricesMap[item.hardware_item_id] || 0)
  }, 0)
  const crew = (template.staff_allocation || []).reduce((total: number, item: any) => {
    return total + Number(item.quantity || 0) * Number(staffPricesMap[item.staff_role_id] || 0)
  }, 0)
  const consumables = Number(template.consumables_cost || 0)
  const computedTotal = hardware + crew + consumables
  const storedTotal = Number(template.total_estimated_cost || 0)

  return { hardware, crew, consumables, total: storedTotal > 0 ? storedTotal : computedTotal }
}

export function getTemplateCapacity(template: any, category: TemplateCategory) {
  if (category === "registration") {
    return `${Number(template.min_attendees || 0).toLocaleString()} - ${Number(template.max_attendees || 0).toLocaleString()}`
  }
  if (category === "srr") {
    return `${Number(template.min_speakers || 0).toLocaleString()} - ${Number(template.max_speakers || 0).toLocaleString()}`
  }
  return Number(template.default_capacity || 0).toLocaleString()
}

export function getTemplateMetrics(template: any, category: TemplateCategory) {
  if (category === "registration") {
    return [
      { label: "Counters", value: Number(template.reg_counters || 0) },
      { label: "Kiosks", value: Number(template.kiosks || 0) },
      { label: "Badge stations", value: Number(template.badge_stations || 0) },
      { label: "QR stations", value: Number(template.qr_stations || 0) },
    ]
  }
  if (category === "srr") {
    return [
      { label: "Preview", value: Number(template.preview_stations || 0) },
      { label: "Check-in", value: Number(template.checkin_counters || 0) },
      { label: "Desks", value: Number(template.consultation_desks || 0) },
      { label: "Printers", value: Number(template.printer_stations || 0) },
    ]
  }
  return [
    { label: "Podiums", value: Number(template.podiums || 0) },
    { label: "Setup", value: `${Number(template.setup_time || 0)}h` },
    { label: "Teardown", value: `${Number(template.teardown_time || 0)}h` },
  ]
}

export function PremiumTemplateCard({
  template,
  category,
  Icon,
  hardwarePricesMap,
  staffPricesMap,
  isSelected,
  isRecommended,
  recommendationLabel = "Recommended",
  secondaryActionLabel = "View Details",
  primaryActionLabel = "Use Template",
  onViewDetails,
  onUseTemplate,
}: PremiumTemplateCardProps) {
  const imageUrl = typeof template.image_url === "string" && template.image_url.trim() ? template.image_url.trim() : undefined
  const costs = getTemplateCosts(template, hardwarePricesMap, staffPricesMap)
  const metrics = getTemplateMetrics(template, category).slice(0, 2)
  const description = template.short_description || template.description || "Operational template for event configuration."

  return (
    <article
      className={cn(
        "group relative flex min-h-[520px] flex-col overflow-hidden rounded-3xl border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-md",
        isSelected && "border-black/60 ring-1 ring-black/10 dark:border-white/40 dark:ring-white/15",
      )}
    >
      <div className="relative h-[270px] flex-shrink-0 overflow-hidden border-b border-[var(--border-default)] bg-black">
        {imageUrl ? (
          <img src={imageUrl} alt={template.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,.12),transparent_36%),linear-gradient(135deg,#050505,#1a1a1a)]">
            <Icon className="h-12 w-12 text-white/40" />
          </div>
        )}
        <div className="absolute left-2 top-2 rounded-full border border-white/15 bg-black/75 px-2 py-0.5 text-[8px] font-semibold uppercase text-white backdrop-blur">
          {template.is_active === false ? "Inactive" : "Active"}
        </div>
        {isRecommended && (
          <div className="absolute right-2 top-2 rounded-full border border-white/15 bg-white px-2 py-0.5 text-[8px] font-semibold uppercase text-black">
            {recommendationLabel}
          </div>
        )}
        {isSelected && (
          <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 rounded-full border border-black/20 bg-white px-2.5 py-1 text-[9px] font-semibold uppercase text-black shadow-lg">
            <CheckCircle2 className="h-3 w-3" /> Selected
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/85 to-transparent px-4 pb-4 pt-12">
          <h3 className="truncate text-lg font-semibold text-white">{template.name}</h3>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="line-clamp-2 min-h-10 text-xs leading-5 text-[var(--text-secondary)]">{description}</p>

        <div className="mt-3 grid grid-cols-3 border-y border-[var(--border-default)] py-3">
          <div className="min-w-0 border-r border-[var(--border-default)] px-1 text-center">
            <div className="truncate text-[9px] text-[var(--text-tertiary)]">Capacity</div>
            <div className="mt-1 truncate text-sm font-semibold text-[var(--text-primary)]">{getTemplateCapacity(template, category)}</div>
          </div>
          {metrics.map((metric, index) => (
            <div key={metric.label} className={cn("min-w-0 px-1 text-center", index === 0 && "border-r border-[var(--border-default)]")}>
              <div className="truncate text-[9px] text-[var(--text-tertiary)]">{metric.label}</div>
              <div className="mt-1 truncate text-sm font-semibold text-[var(--text-primary)]">{metric.value}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-end justify-between gap-2">
          <div>
            <div className="text-[9px] uppercase text-[var(--text-tertiary)]">Total estimated cost</div>
            <div className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{formatINR(costs.total)}</div>
          </div>
          {isSelected && <CheckCircle2 className="h-4 w-4 text-[var(--text-primary)]" />}
        </div>

        <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onViewDetails} className="h-10 rounded-md border-[var(--border-default)] bg-transparent text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]">
            {secondaryActionLabel}
          </Button>
          <Button type="button" onClick={onUseTemplate} className="h-10 rounded-md bg-black text-xs font-semibold text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/85">
            {primaryActionLabel}
            <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </div>
      </div>
    </article>
  )
}
