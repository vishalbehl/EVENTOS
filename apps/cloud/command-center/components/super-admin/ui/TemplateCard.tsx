"use client"
import { type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatINR } from "@/services/super-admin-service"

export interface TemplateCardStatPill {
  label: string
  value: string | number
}

export interface TemplateCardChip {
  label: string
  color: "blue" | "purple" | "orange" | "teal" | "indigo" | "pink" | "emerald"
}

export interface TemplateCardCostRow {
  label: string
  amount: number
  color?: "amber" | "blue" | "default"
}

export interface TemplateCardTotalRow {
  label: string
  display: string
}

export interface TemplateCardProps {
  slug: string
  name: string
  version?: string
  description?: string
  imageUrl?: string | null
  isDefault?: boolean
  isActive?: boolean
  usageCount?: number
  typeBadge?: string
  featureBadge?: string
  Icon: LucideIcon
  gradientClass?: string
  statPills: TemplateCardStatPill[]
  infraChips?: TemplateCardChip[]
  costRows: TemplateCardCostRow[]
  totalRow: TemplateCardTotalRow
  onManage: () => void
}

const CHIP_COLORS: Record<TemplateCardChip["color"], string> = {
  blue: "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400",
  purple: "bg-purple-500/10 border-purple-500/20 text-purple-600 dark:text-purple-400",
  orange: "bg-orange-500/10 border-orange-500/20 text-orange-600 dark:text-orange-400",
  teal: "bg-teal-500/10 border-teal-500/20 text-teal-600 dark:text-teal-400",
  indigo: "bg-indigo-500/10 border-indigo-500/20 text-indigo-600 dark:text-indigo-400",
  pink: "bg-pink-500/10 border-pink-500/20 text-pink-600 dark:text-pink-400",
  emerald: "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400",
}

const COST_COLORS: Record<string, string> = {
  amber: "text-amber-600 dark:text-amber-400",
  blue: "text-blue-600 dark:text-blue-400",
  default: "text-secondary",
}

export function TemplateCard({
  slug,
  name,
  version,
  description,
  imageUrl,
  isDefault,
  isActive = true,
  usageCount = 0,
  typeBadge,
  featureBadge,
  Icon,
  gradientClass = "from-violet-500/20 via-purple-500/10 to-brand-primary/5",
  statPills,
  infraChips = [],
  costRows,
  totalRow,
  onManage,
}: TemplateCardProps) {
  const validImageUrl = typeof imageUrl === "string" && imageUrl.trim().length > 0
  const cardImageUrl = validImageUrl ? imageUrl.trim() : undefined

  return (
    <div
      key={slug}
      className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl shadow-sm flex flex-col hover:border-brand-primary/40 hover:shadow-md transition-all duration-200 relative overflow-hidden group"
    >
      {/* Image Banner */}
      <div className="relative w-full h-40 flex-shrink-0 overflow-hidden">
        {validImageUrl ? (
          <img
            src={cardImageUrl}
            alt={name}
            className="h-full w-full bg-black object-contain"
          />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${gradientClass} flex items-center justify-center`}>
            <Icon className="h-12 w-12 text-brand-primary/20" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
        <div className="absolute top-3 right-3 flex flex-col items-end gap-1">
          {isDefault && (
            <span className="text-[9px] bg-amber-400/90 text-amber-900 px-2 py-0.5 rounded-full font-black uppercase tracking-wide backdrop-blur-sm">
              Default
            </span>
          )}
          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm ${isActive ? "bg-success/80 text-white" : "bg-black/40 text-white/70"}`}>
            {isActive ? "Active" : "Inactive"}
          </span>
        </div>
        {typeBadge && (
          <div className="absolute bottom-3 left-3">
            <span className="text-[9px] bg-white/90 dark:bg-black/60 text-brand-primary border border-brand-primary/30 px-2 py-0.5 rounded-full font-black uppercase tracking-wide backdrop-blur-sm">
              {typeBadge}
            </span>
          </div>
        )}
      </div>

      {/* Card Body */}
      <div className="p-4 flex-1 flex flex-col gap-3">
        <div>
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-sm font-extrabold text-primary truncate leading-tight">{name}</h4>
            {featureBadge && (
              <span className="flex-shrink-0 text-[8px] bg-brand-primary/10 text-brand-primary border border-brand-primary/20 px-1.5 py-0.5 rounded-full font-black">
                {featureBadge}
              </span>
            )}
          </div>
          {version && (
            <span className="text-[10px] text-tertiary font-medium">v{version.replace("v", "")}</span>
          )}
          {description && (
            <p className="text-[10px] text-secondary line-clamp-1 leading-relaxed mt-0.5">{description}</p>
          )}
        </div>

        {/* 3-col stat pills */}
        <div className="grid grid-cols-3 gap-1.5">
          {statPills.slice(0, 3).map((s) => (
            <div key={s.label} className="bg-surface-2 rounded-xl p-2 text-center border border-border/40">
              <div className="text-[11px] font-extrabold text-primary font-mono">{s.value}</div>
              <div className="text-[8px] text-tertiary font-medium mt-0.5 leading-tight">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Infra chips */}
        {infraChips.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {infraChips.map((chip) => (
              <span key={chip.label} className={`text-[9px] border px-2 py-0.5 rounded-full font-bold ${CHIP_COLORS[chip.color]}`}>
                {chip.label}
              </span>
            ))}
          </div>
        )}

        {/* Cost table */}
        <div className="rounded-2xl border border-border/50 bg-surface-2/40 overflow-hidden text-xs mt-auto">
          {costRows.map((row, i) => (
            <div key={row.label} className={`flex justify-between px-3 py-1.5 ${i < costRows.length - 1 ? "border-b border-border/30" : ""}`}>
              <span className="text-secondary">{row.label}</span>
              <span className={`font-mono font-bold ${COST_COLORS[row.color ?? "default"]}`}>
                {formatINR(row.amount)}
              </span>
            </div>
          ))}
          <div className="flex justify-between px-3 py-2 bg-success/5 border-t border-border/30">
            <span className="text-success font-extrabold text-[11px]">{totalRow.label}</span>
            <span className="font-mono font-extrabold text-success text-[11px]">{totalRow.display}</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 pb-4 flex justify-between items-center">
        <span className="text-[9px] text-tertiary font-mono">Used {usageCount}x</span>
        <Button
          size="sm"
          variant="outline"
          onClick={onManage}
          className="text-xs h-7 font-bold border-border text-secondary hover:text-primary hover:border-brand-primary/40 bg-surface-2 rounded-xl"
        >
          Manage
        </Button>
      </div>
    </div>
  )
}
