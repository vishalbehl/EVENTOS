"use client"

import { type LucideIcon, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { formatINR } from "@/services/super-admin-service"
import {
  getTemplateCapacity,
  getTemplateCosts,
  getTemplateMetrics,
  type TemplatePriceMap,
} from "@/components/super-admin/ui/PremiumTemplateCard"

type TemplateCategory = "room" | "registration" | "srr"

interface TemplateDetailSheetProps {
  template: any | null
  category: TemplateCategory
  Icon: LucideIcon
  hardwarePricesMap: TemplatePriceMap
  staffPricesMap: TemplatePriceMap
  open: boolean
  onOpenChange: (open: boolean) => void
  onUseTemplate: () => void
  actionLabel?: string
}

function templateList(value: unknown) {
  return Array.isArray(value) ? value.filter(Boolean).map(String) : []
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

export function TemplateDetailSheet({
  template,
  category,
  Icon,
  hardwarePricesMap,
  staffPricesMap,
  open,
  onOpenChange,
  onUseTemplate,
  actionLabel = "Use Template",
}: TemplateDetailSheetProps) {
  const imageUrl = typeof template?.image_url === "string" && template.image_url.trim() ? template.image_url.trim() : undefined
  const costs = template ? getTemplateCosts(template, hardwarePricesMap, staffPricesMap) : { hardware: 0, crew: 0, consumables: 0, total: 0 }
  const metrics = template ? getTemplateMetrics(template, category) : []
  const inclusions = templateList(template?.inclusions)
  const exclusions = templateList(template?.exclusions)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)] sm:max-w-[560px]">
        {template && (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="relative h-[40dvh] min-h-[280px] w-full overflow-hidden border-b border-[var(--border-default)] bg-black">
                {imageUrl ? (
                  <img src={imageUrl} alt={template.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Icon className="h-14 w-14 text-white/35" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-black/20" />
              </div>

              <div className="space-y-4 p-5">
                <SheetHeader className="pr-8">
                  <div className="mb-1 flex items-center gap-2 text-[9px] uppercase text-[var(--text-tertiary)]">
                    <span>{template.is_active === false ? "Inactive" : "Active"}</span>
                    <span>•</span>
                    <span>v{String(template.version || "1.0").replace("v", "")}</span>
                  </div>
                  <SheetTitle className="text-xl">{template.name}</SheetTitle>
                  <SheetDescription className="line-clamp-none text-xs leading-5 text-[var(--text-secondary)]">
                    {template.description || template.short_description || "Template purchase details."}
                  </SheetDescription>
                </SheetHeader>

                <section className="border-y border-[var(--border-default)] py-3">
                  <h3 className="mb-2 text-[10px] font-semibold uppercase text-[var(--text-tertiary)]">Detailed view</h3>
                  <div className="grid grid-cols-5 divide-x divide-[var(--border-default)]">
                    <div className="min-w-0 px-2 first:pl-0">
                      <div className="truncate text-[8px] text-[var(--text-tertiary)]">Capacity</div>
                      <div className="mt-1 truncate text-xs font-semibold text-[var(--text-primary)]">{getTemplateCapacity(template, category)}</div>
                    </div>
                    {metrics.map((metric) => (
                      <div key={metric.label} className="min-w-0 px-2">
                        <div className="truncate text-[8px] text-[var(--text-tertiary)]">{metric.label}</div>
                        <div className="mt-1 truncate text-xs font-semibold text-[var(--text-primary)]">{metric.value}</div>
                      </div>
                    ))}
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
                    {[
                      ["Hardware", costs.hardware],
                      ["Crew", costs.crew],
                      ["Consumables", costs.consumables],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="flex items-center justify-between py-2 text-xs">
                        <span className="text-[var(--text-secondary)]">{label}</span>
                        <span className="font-mono font-semibold text-[var(--text-primary)]">{formatINR(Number(value))}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between py-3 text-sm font-semibold">
                      <span>Total estimated cost</span>
                      <span className="font-mono">{formatINR(costs.total)}</span>
                    </div>
                  </div>
                </section>
              </div>
            </div>

            <SheetFooter className="border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
              <Button type="button" onClick={onUseTemplate} className="h-11 w-full rounded-md bg-black text-sm font-semibold text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/85">
                {actionLabel}
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
