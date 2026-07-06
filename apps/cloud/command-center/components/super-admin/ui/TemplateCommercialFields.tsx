"use client"

import { type ClipboardEvent } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface TemplateCommercialFieldsProps {
  shortDescription: string
  totalEstimatedCost: string | number
  consumablesCost: string | number
  inclusions: string[]
  exclusions: string[]
  onChange: (field: string, value: unknown) => void
}

function parsePastedList(raw: string) {
  const normalized = raw.replace(/\r/g, "").trim()
  if (!normalized) return []

  const source = normalized.includes("\n")
    ? normalized.split("\n")
    : normalized.split(/\s*[;,]\s+/)

  return source
    .map((item) =>
      item
        .replace(/^\s*(?:[-*]|\u2022|\u25CF|\u25AA|\u25E6)\s*/, "")
        .replace(/^\s*\d+[\).\-\s]+/, "")
        .trim()
    )
    .filter(Boolean)
}

function ListEditor({
  label,
  items,
  onChange,
}: {
  label: string
  items: string[]
  onChange: (items: string[]) => void
}) {
  const updateItem = (index: number, value: string) => {
    const next = [...items]
    next[index] = value
    onChange(next)
  }

  const handlePaste = (index: number, event: ClipboardEvent<HTMLInputElement>) => {
    const parsed = parsePastedList(event.clipboardData.getData("text"))
    if (parsed.length <= 1) return

    event.preventDefault()
    const next = [...items]
    next.splice(index, 1, ...parsed)
    onChange(next)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-secondary">{label}</label>
        <Button type="button" variant="outline" onClick={() => onChange([...items, ""])} className="h-7 gap-1 border-border px-2 text-[10px] font-semibold">
          <Plus className="h-3 w-3" /> Add item
        </Button>
      </div>
      <div className="space-y-1.5">
        {items.map((item, index) => (
          <div key={`${label}-${index}`} className="flex gap-1.5">
            <Input
              value={item}
              onChange={(event) => updateItem(index, event.target.value)}
              onPaste={(event) => handlePaste(index, event)}
              placeholder={`${label.slice(0, -1)} item`}
              className="h-8 bg-surface-2 text-xs"
            />
            <Button
              type="button"
              variant="ghost"
              onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
              className="h-8 w-8 flex-shrink-0 p-0 text-tertiary hover:text-danger"
              aria-label={`Remove ${label.toLowerCase()} item ${index + 1}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        {items.length === 0 && <p className="py-2 text-[10px] text-tertiary">No items added.</p>}
      </div>
    </div>
  )
}

export function TemplateCommercialFields({
  shortDescription,
  totalEstimatedCost,
  consumablesCost,
  inclusions,
  exclusions,
  onChange,
}: TemplateCommercialFieldsProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-semibold text-secondary">Card Description</label>
        <Input
          value={shortDescription}
          onChange={(event) => onChange("short_description", event.target.value)}
          maxLength={255}
          placeholder="Short one-line description shown on the template card"
          className="bg-surface-2 text-xs"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-secondary">Total Estimated Cost</label>
          <Input type="number" min="0" step="0.01" value={totalEstimatedCost} onChange={(event) => onChange("total_estimated_cost", event.target.value)} className="bg-surface-2 text-xs" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-secondary">Consumables Cost</label>
          <Input type="number" min="0" step="0.01" value={consumablesCost} onChange={(event) => onChange("consumables_cost", event.target.value)} className="bg-surface-2 text-xs" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5 border-t border-border pt-4">
        <ListEditor label="Inclusions" items={inclusions} onChange={(items) => onChange("inclusions", items)} />
        <ListEditor label="Exclusions" items={exclusions} onChange={(items) => onChange("exclusions", items)} />
      </div>
    </div>
  )
}
