"use client"

import { useEffect, useMemo, useState } from "react"
import { GripVertical, Plus, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  type FeatureCatalogItem,
  type FeatureCatalogPayload,
  useCreateFeatureCatalogItem,
  useDeleteFeatureCatalogItem,
  useFeaturesCatalog,
  useReorderFeatureCategories,
  useReorderFeatures,
  useUpdateFeatureCatalogItem,
} from "@/services/super-admin-service"

type DraftFeature = FeatureCatalogPayload & {
  new_category_name: string
}

const NEW_CATEGORY_VALUE = "__new__"
function normalizeFeatureKey(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function normalizeCategory(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function formatCategory(value: string) {
  return value.replace(/_/g, " ")
}

function toOptionalString(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function createEmptyDraft(category?: string): DraftFeature {
  return {
    key: "",
    name: "",
    description: "",
    category: category ?? "",
    category_order: null,
    feature_order: null,
    is_active: true,
    new_category_name: "",
  }
}

function draftFromFeature(feature: FeatureCatalogItem): DraftFeature {
  return {
    key: feature.key,
    name: feature.name,
    description: feature.description ?? "",
    category: feature.category,
    category_order: feature.category_order,
    feature_order: feature.feature_order,
    is_active: feature.is_active,
    new_category_name: "",
  }
}

export function EntitlementCatalogDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data: catalog = [] } = useFeaturesCatalog()
  const createFeature = useCreateFeatureCatalogItem()
  const updateFeature = useUpdateFeatureCatalogItem()
  const deleteFeature = useDeleteFeatureCatalogItem()
  const reorderCategories = useReorderFeatureCategories()
  const reorderFeatures = useReorderFeatures()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<DraftFeature>(createEmptyDraft())
  const [categorySelectValue, setCategorySelectValue] = useState<string>("")
  const [draggedCategory, setDraggedCategory] = useState<string | null>(null)
  const [draggedFeatureId, setDraggedFeatureId] = useState<string | null>(null)
  const [catalogCategoryFilter, setCatalogCategoryFilter] = useState<string>("")

  const groupedCatalog = useMemo(
    () =>
      [...catalog]
        .sort((a, b) => {
          if (a.category_order !== b.category_order) return a.category_order - b.category_order
          if (a.category !== b.category) return a.category.localeCompare(b.category)
          if (a.feature_order !== b.feature_order) return a.feature_order - b.feature_order
          return a.name.localeCompare(b.name)
        })
        .reduce<{ category: string; category_order: number; items: FeatureCatalogItem[] }[]>(
          (groups, item) => {
            const currentGroup = groups[groups.length - 1]
            if (currentGroup?.category === item.category) {
              currentGroup.items.push(item)
              return groups
            }
            groups.push({
              category: item.category,
              category_order: item.category_order,
              items: [item],
            })
            return groups
          },
          [],
        ),
    [catalog],
  )

  const categories = useMemo(() => groupedCatalog.map((group) => group.category), [groupedCatalog])
  const visibleGroups = useMemo(
    () =>
      !catalogCategoryFilter
        ? groupedCatalog
        : groupedCatalog.filter((group) => group.category === catalogCategoryFilter),
    [catalogCategoryFilter, groupedCatalog],
  )

  useEffect(() => {
    if (!categories.length) return
    if (!catalogCategoryFilter || !categories.includes(catalogCategoryFilter)) {
      setCatalogCategoryFilter(categories[0])
    }
  }, [catalogCategoryFilter, categories])

  useEffect(() => {
    if (!open) return

    if (selectedId) {
      const selectedFeature = catalog.find((item) => item.id === selectedId)
      if (selectedFeature) {
        setDraft(draftFromFeature(selectedFeature))
        setCategorySelectValue(selectedFeature.category)
        return
      }
    }

    const defaultCategory = categories[0] ?? ""
    setDraft(createEmptyDraft(defaultCategory))
    setCategorySelectValue(defaultCategory || NEW_CATEGORY_VALUE)
  }, [open, selectedId, catalog, categories])

  const startNewFeature = (category?: string) => {
    const nextCategory = category ?? categories[0] ?? ""
    setSelectedId(null)
    setDraft(createEmptyDraft(nextCategory))
    setCategorySelectValue(nextCategory || NEW_CATEGORY_VALUE)
  }

  const currentCategory =
    categorySelectValue === NEW_CATEGORY_VALUE ? draft.new_category_name : draft.category

  const saveFeature = async () => {
    const resolvedCategory = normalizeCategory(currentCategory)
    const resolvedName = draft.name.trim()
    const resolvedKey = normalizeFeatureKey(draft.key || `FEAT_${draft.name}`)

    if (!resolvedName) {
      toast.error("Feature name is required")
      return
    }

    if (!resolvedCategory) {
      toast.error("Choose a category or add a new one")
      return
    }

    if (!resolvedKey) {
      toast.error("Feature key is required")
      return
    }

    const payload: FeatureCatalogPayload = {
      key: resolvedKey,
      name: resolvedName,
      description: toOptionalString(draft.description),
      category: resolvedCategory,
      category_order: categorySelectValue === NEW_CATEGORY_VALUE ? null : draft.category_order,
      feature_order: draft.feature_order,
      is_active: draft.is_active,
    }

    if (selectedId) {
      const updated = await updateFeature.mutateAsync({ id: selectedId, data: payload })
      setSelectedId(updated.id)
      toast.success("Feature updated")
      return
    }

    const created = await createFeature.mutateAsync(payload)
    setSelectedId(created.id)
    setCategorySelectValue(created.category)
    toast.success("Feature added")
  }

  const removeFeature = async (featureId: string, featureName: string) => {
    if (!confirm(`Delete ${featureName}?`)) return
    await deleteFeature.mutateAsync(featureId)
    if (selectedId === featureId) {
      startNewFeature()
    }
    toast.success("Feature deleted")
  }

  const moveCategory = async (targetCategory: string) => {
    if (!draggedCategory || draggedCategory === targetCategory) return

    const reordered = [...categories]
    const fromIndex = reordered.indexOf(draggedCategory)
    const toIndex = reordered.indexOf(targetCategory)

    if (fromIndex < 0 || toIndex < 0) return

    const [moved] = reordered.splice(fromIndex, 1)
    reordered.splice(toIndex, 0, moved)

    await reorderCategories.mutateAsync(reordered)
    setDraggedCategory(null)
    toast.success("Category order updated")
  }

  const moveFeature = async (category: string, targetFeatureId: string, items: FeatureCatalogItem[]) => {
    if (!draggedFeatureId || draggedFeatureId === targetFeatureId) return

    const reordered = [...items]
    const fromIndex = reordered.findIndex((feature) => feature.id === draggedFeatureId)
    const toIndex = reordered.findIndex((feature) => feature.id === targetFeatureId)
    if (fromIndex < 0 || toIndex < 0) return

    const [moved] = reordered.splice(fromIndex, 1)
    reordered.splice(toIndex, 0, moved)

    await reorderFeatures.mutateAsync({
      category,
      featureIds: reordered.map((feature) => feature.id),
    })
    setDraggedFeatureId(null)
    toast.success("Feature order updated")
  }

  const busy =
    createFeature.isPending ||
    updateFeature.isPending ||
    deleteFeature.isPending ||
    reorderCategories.isPending ||
    reorderFeatures.isPending

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setSelectedId(null)
          setDraggedCategory(null)
          setDraggedFeatureId(null)
        }
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent className="max-w-7xl overflow-hidden border border-[var(--border-default)] bg-[var(--bg-surface)] p-0">
        <DialogHeader className="border-b border-[var(--border-default)] px-6 py-5">
          <DialogTitle className="text-xl font-semibold text-[var(--text-primary)]">
            Feature catalog
          </DialogTitle>
          <p className="text-sm text-[var(--text-secondary)]">
            Reorder categories on the left, then create or edit the full feature record on the
            right.
          </p>
        </DialogHeader>

        <div className="grid h-[78vh] gap-0 lg:grid-cols-[minmax(0,1.25fr)_420px]">
          <div className="border-r border-[var(--border-default)] bg-[var(--bg-surface-2)]/20 px-5 py-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-[var(--text-secondary)]">
                  Filter by category, drag categories or features to update order, and use the side
                  panel to edit the selected record.
                </p>
              </div>
              <div className="w-[220px]">
                <Select value={catalogCategoryFilter} onValueChange={setCatalogCategoryFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category} value={category}>
                        {formatCategory(category)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button className="gap-2" onClick={() => startNewFeature()}>
                <Plus className="h-4 w-4" />
                New feature
              </Button>
            </div>

            <ScrollArea className="h-[calc(78vh-92px)] pr-3">
              <div className="space-y-4">
                {visibleGroups.map((group) => (
                  <section
                    key={group.category}
                    draggable
                    onDragStart={() => setDraggedCategory(group.category)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => moveCategory(group.category)}
                    className="overflow-hidden rounded-3xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-[0_18px_45px_rgba(15,23,42,0.08)]"
                  >
                    <div className="flex items-center justify-between gap-3 border-b border-[var(--border-default)] bg-[var(--bg-surface-2)]/70 px-4 py-3">
                      <div className="flex items-center gap-3 text-[11px] text-[var(--text-secondary)]">
                        <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)]">
                          <GripVertical className="h-4 w-4" />
                        </div>
                        <span>Category order {group.category_order}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 rounded-full px-3 text-xs"
                        onClick={() => startNewFeature(group.category)}
                      >
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        Manage feature catalog
                      </Button>
                    </div>

                    <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_88px_96px] border-b border-[var(--border-default)] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      <span>Name</span>
                      <span>Key</span>
                      <span>Order</span>
                      <span>Action</span>
                    </div>

                    <div className="divide-y divide-[var(--border-default)]">
                      {group.items.map((item) => {
                        const selected = item.id === selectedId
                        return (
                          <div
                            key={item.id}
                            draggable
                            onDragStart={(event) => {
                              event.stopPropagation()
                              setDraggedFeatureId(item.id)
                            }}
                            onDragOver={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                            }}
                            onDrop={async (event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              await moveFeature(group.category, item.id, group.items)
                            }}
                            className={`grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_88px_96px] items-start gap-3 px-4 py-3 transition ${selected
                                ? "bg-[color-mix(in_oklab,var(--bg-surface-2)_76%,white_24%)] shadow-[inset_0_0_0_1px_var(--border-strong)]"
                                : "hover:bg-[var(--bg-surface-2)]/40"
                              }`}
                          >
                            <div className="flex items-start gap-3">
                              <button
                                type="button"
                                aria-label={`Drag ${item.name}`}
                                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-[var(--text-secondary)]"
                              >
                                <GripVertical className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedId(item.id)}
                                className="min-w-0 text-left"
                              >
                                <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                                  {item.name}
                                </p>
                                <p className="mt-1 line-clamp-2 text-xs text-[var(--text-secondary)]">
                                  {item.description || "No description"}
                                </p>
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSelectedId(item.id)}
                              className="truncate pt-0.5 text-left font-mono text-[11px] text-[var(--text-secondary)]"
                            >
                              {item.key}
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedId(item.id)}
                              className="pt-0.5 text-left text-xs text-[var(--text-secondary)]"
                            >
                              #{item.feature_order}
                            </button>
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 rounded-full px-3 text-xs"
                                onClick={() => setSelectedId(item.id)}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-full text-[var(--text-secondary)]"
                                aria-label={`Delete ${item.name}`}
                                onClick={() => removeFeature(item.id, item.name)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                ))}

                {!visibleGroups.length ? (
                  <div className="rounded-3xl border border-dashed border-[var(--border-default)] bg-[var(--bg-surface)] px-6 py-10 text-center">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      No features in this view
                    </p>
                    <p className="mt-2 text-xs text-[var(--text-secondary)]">
                      Change the category filter or create a new feature from the editor.
                    </p>
                  </div>
                ) : null}
              </div>
            </ScrollArea>
          </div>

          <aside className="bg-[var(--bg-surface)] px-6 py-5">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {selectedId ? "Edit feature" : "Add feature"}
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  Every editable DB field is managed here. Category order is controlled by dragging
                  the cards on the left.
                </p>
              </div>
              <Button variant="outline" className="rounded-full" onClick={() => startNewFeature()}>
                <Plus className="mr-2 h-4 w-4" />
                Blank form
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Category">
                <Select
                  value={categorySelectValue || NEW_CATEGORY_VALUE}
                  onValueChange={(value) => {
                    setCategorySelectValue(value)
                    setDraft((current) => ({
                      ...current,
                      category: value === NEW_CATEGORY_VALUE ? current.category : value,
                    }))
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category} value={category}>
                        {formatCategory(category)}
                      </SelectItem>
                    ))}
                    <SelectSeparator />
                    <SelectItem value={NEW_CATEGORY_VALUE}>+ Add new category</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Category order">
                <Input value={draft.category_order ?? ""} disabled placeholder="Managed by drag and drop" />
              </Field>

              {categorySelectValue === NEW_CATEGORY_VALUE ? (
                <div className="sm:col-span-2">
                  <Field label="New category name">
                    <Input
                      value={draft.new_category_name}
                      placeholder="COMMUNICATIONS"
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          new_category_name: event.target.value,
                        }))
                      }
                    />
                  </Field>
                </div>
              ) : null}

              <Field label="Feature name">
                <Input
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </Field>

              <Field label="Feature key">
                <Input
                  value={draft.key}
                  placeholder="FEAT_CUSTOM_REPORTS"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      key: event.target.value,
                    }))
                  }
                />
              </Field>

              <div className="sm:col-span-2">
                <Field label="Description">
                  <Textarea
                    className="min-h-[84px]"
                    value={draft.description ?? ""}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                  />
                </Field>
              </div>

              <Field label="Feature order">
                <Input
                  type="number"
                  value={draft.feature_order ?? ""}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      feature_order: event.target.value ? Number(event.target.value) : null,
                    }))
                  }
                />
              </Field>

              <div className="sm:col-span-2 grid gap-3 rounded-3xl border border-[var(--border-default)] bg-[var(--bg-surface-2)]/40 p-4">
                <Toggle
                  label="Active in catalog"
                  checked={draft.is_active}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      is_active: value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3 border-t border-[var(--border-default)] pt-4">
              <Button variant="outline" onClick={() => startNewFeature()}>
                Reset editor
              </Button>
              <div className="flex gap-2">
                {selectedId ? (
                  <Button
                    variant="outline"
                    className="border-red-200 text-red-600 hover:bg-red-50"
                    onClick={() => {
                      const selectedFeature = catalog.find((item) => item.id === selectedId)
                      if (!selectedFeature) return
                      void removeFeature(selectedFeature.id, selectedFeature.name)
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                ) : null}
                <Button onClick={() => void saveFeature()} disabled={busy}>
                  <Save className="mr-2 h-4 w-4" />
                  {selectedId ? "Save changes" : "Add feature"}
                </Button>
              </div>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
        {label}
      </span>
      {children}
    </label>
  )
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm text-[var(--text-primary)]">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  )
}
