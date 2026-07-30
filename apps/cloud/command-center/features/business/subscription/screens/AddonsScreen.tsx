"use client"

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent } from "react"
import { ArrowRight, Check, CheckCircle2, Clock3, Cpu, Edit3, ImagePlus, Layers3, MapPin, Plus, Search, Trash2, Users, X } from "lucide-react"
import { toast } from "sonner"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader"
import { ConfirmDestructiveAction } from "@/components/super-admin/ui/ConfirmDestructiveAction"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import {
  Addon,
  type AddonFeatureAssignment,
  formatINR,
  useAddons,
  useAddonTemplateVersions,
  useCreateAddon,
  useDeleteAddon,
  useHardwareCatalog,
  useStaffCatalog,
  useSubscriptionPlans,
  useFeaturesCatalog,
  useUpdateAddon,
} from "@/services/super-admin-service"

type Kind = "PLAN" | "VENUE"
type Resource = { id: string; quantity: number; days: number }

type FormState = {
  name: string
  key: string
  addon_type: Kind
  short_description: string
  description: string
  image_url: string
  billing_unit: string
  price_unit: string
  scope_type: "ORGANIZATION" | "EVENT"
  consumption_model: "NON_CONSUMABLE" | "QUOTA" | "METERED"
  unit_type: string
  min_price_inr: string
  max_price_inr: string
  available_for_plans: string[]
  is_active: boolean
  lifecycle_status: "DRAFT" | "REVIEW" | "PUBLISHED" | "RETIRED"
  hardware: Resource[]
  staff: Resource[]
  inclusions: string[]
  exclusions: string[]
  consumables_cost: string
  template_types: string[]
  feature_assignments: AddonFeatureAssignment[]
}

const emptyForm = (kind: Kind): FormState => ({
  name: "",
  key: "",
  addon_type: kind,
  short_description: "",
  description: "",
  image_url: "",
  billing_unit: "PER_EVENT",
  price_unit: "",
  scope_type: "EVENT",
  consumption_model: "NON_CONSUMABLE",
  unit_type: "",
  min_price_inr: "",
  max_price_inr: "",
  available_for_plans: [],
  is_active: true,
  lifecycle_status: "DRAFT",
  hardware: [],
  staff: [],
  inclusions: [""],
  exclusions: [],
  consumables_cost: "0",
  template_types: [],
  feature_assignments: [],
})

export default function AddonsManagementPage() {
  const { data: addons = [], isLoading, isError, refetch } = useAddons()
  const { data: plans = [], isError: plansError, refetch: refetchPlans } = useSubscriptionPlans()
  const { data: featureCatalog = [], isError: catalogError, refetch: refetchCatalog } = useFeaturesCatalog()
  const { data: hardwareData, isError: hardwareError, refetch: refetchHardware } = useHardwareCatalog({ limit: 200 })
  const { data: staffData, isError: staffError, refetch: refetchStaff } = useStaffCatalog({ limit: 200 })
  const createAddon = useCreateAddon()
  const updateAddon = useUpdateAddon()
  const deleteAddon = useDeleteAddon()

  const [kind, setKind] = useState<Kind>("PLAN")
  const [search, setSearch] = useState("")
  const [editing, setEditing] = useState<Addon | null>(null)
  const [previewAddon, setPreviewAddon] = useState<Addon | null>(null)
  const [historyTarget, setHistoryTarget] = useState<Addon | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Addon | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [adminReason, setAdminReason] = useState("")
  const imageInputRef = useRef<HTMLInputElement>(null)
  const { data: historyData, isLoading: historyLoading } = useAddonTemplateVersions(historyTarget?.id || "")

  const hardware = hardwareData?.items ?? []
  const staff = staffData?.items ?? []
  const hardwareMap = useMemo(() => Object.fromEntries(hardware.map((item) => [item.id, item])), [hardware])
  const staffMap = useMemo(() => Object.fromEntries(staff.map((item) => [item.id, item])), [staff])
  const groupedHardware = useMemo(
    () =>
      hardware.reduce((acc: Record<string, typeof hardware>, item) => {
        const key = item.category_name || "Uncategorized"
        if (!acc[key]) acc[key] = []
        acc[key].push(item)
        return acc
      }, {}),
    [hardware]
  )
  const groupedStaff = useMemo(
    () =>
      staff.reduce((acc: Record<string, typeof staff>, item) => {
        const key = item.team_category || item.department || item.grade || "Operations"
        if (!acc[key]) acc[key] = []
        acc[key].push(item)
        return acc
      }, {}),
    [staff]
  )

  const visible = useMemo(
    () =>
      addons.filter(
        (a) =>
          (a.addon_type || "PLAN") === kind &&
          `${a.name} ${a.key} ${a.description || ""} ${a.short_description || ""}`
            .toLowerCase()
            .includes(search.toLowerCase())
      ),
    [addons, kind, search]
  )

  useEffect(() => {
    if (form && form.addon_type !== kind) {
      setForm((prev) => (prev ? { ...prev, addon_type: kind } : prev))
    }
  }, [kind, form])

  const openCreate = () => {
    setEditing(null)
    setAdminReason("")
    setForm(emptyForm(kind))
  }

  const openEdit = (a: Addon) => {
    setEditing(a)
    setForm({
      name: a.name,
      key: a.key,
      addon_type: a.addon_type || "PLAN",
      short_description: a.short_description || "",
      description: a.description || "",
      image_url: a.image_url || "",
      billing_unit: a.billing_unit || "PER_EVENT",
      price_unit: a.price_unit || "",
      scope_type: a.scope_type || "EVENT",
      consumption_model: a.consumption_model || "NON_CONSUMABLE",
      unit_type: a.unit_type || "",
      min_price_inr: String(a.min_price_inr ?? a.price_inr ?? ""),
      max_price_inr: String(a.max_price_inr ?? ""),
      available_for_plans: a.available_for_plans || [],
      is_active: a.is_active,
      lifecycle_status: a.lifecycle_status || (a.is_active ? "PUBLISHED" : "DRAFT"),
      hardware: (a.hardware_spec || []).map((x) => ({ id: x.item_id, quantity: x.quantity, days: x.days })),
      staff: (a.staff_spec || []).map((x) => ({ id: x.role_id, quantity: x.quantity, days: x.days })),
      inclusions: a.inclusions?.length ? a.inclusions : [""],
      exclusions: a.exclusions || [],
      consumables_cost: String(a.consumables_cost || 0),
      template_types: a.template_types || [],
      feature_assignments: a.feature_assignments || [],
    })
    setAdminReason("")
    setKind((a.addon_type || "PLAN") as Kind)
  }

  const setResource = (field: "hardware" | "staff", id: string, checked: boolean) =>
    setForm((current) =>
      current
        ? {
            ...current,
            [field]: checked ? [...current[field], { id, quantity: 1, days: 1 }] : current[field].filter((r) => r.id !== id),
          }
        : current
    )

  const updateResource = (field: "hardware" | "staff", id: string, key: "quantity" | "days", value: number) =>
    setForm((current) =>
      current
        ? {
            ...current,
            [field]: current[field].map((r) => (r.id === id ? { ...r, [key]: Math.max(1, value || 1) } : r)),
          }
        : current
    )

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !form) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setForm((current) => (current ? { ...current, image_url: String(ev.target?.result || "") } : current))
    }
    reader.readAsDataURL(file)
  }

  const save = async () => {
    if (!form || !form.name.trim() || !form.key.trim()) return toast.error("Name and catalog key are required")
    if (adminReason.trim().length < 12) return toast.error("Enter an administrative reason of at least 12 characters")

    const normalizedType = form.addon_type || kind
    const { hardware: _hardware, staff: _staff, ...catalogueFields } = form
    const payload = {
      ...catalogueFields,
      addon_type: normalizedType,
      key: form.key.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
      price_unit: form.price_unit || null,
      unit_type: form.unit_type || null,
      min_price_inr: form.min_price_inr ? Number(form.min_price_inr) : null,
      max_price_inr: form.max_price_inr ? Number(form.max_price_inr) : null,
      price_inr: form.min_price_inr ? Number(form.min_price_inr) : null,
      consumables_cost: Number(form.consumables_cost || 0),
      hardware_spec: normalizedType === "VENUE" ? _hardware.map((r) => ({ item_id: r.id, quantity: r.quantity, days: r.days })) : [],
      staff_spec: normalizedType === "VENUE" ? _staff.map((r) => ({ role_id: r.id, quantity: r.quantity, days: r.days })) : [],
      inclusions: form.inclusions.filter(Boolean),
      exclusions: form.exclusions.filter(Boolean),
      template_types: normalizedType === "VENUE" ? form.template_types : [],
    }

    try {
      if (editing) {
        await updateAddon.mutateAsync({ addonId: editing.id, data: payload, version: editing.version || 1, reason: adminReason.trim() })
      } else {
        await createAddon.mutateAsync({ data: payload, reason: adminReason.trim() })
      }
      toast.success(editing ? "Add-on updated" : "Add-on created")
      setForm(null)
      setEditing(null)
      setAdminReason("")
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Could not save add-on")
    }
  }

  if (isLoading) {
    return (
      <PageContainer>
        <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-8 text-sm text-[var(--text-secondary)]">
          Loading authoritative add-on catalogue…
        </div>
      </PageContainer>
    )
  }
  if (isError || plansError || catalogError || hardwareError || staffError) {
    return (
      <PageContainer>
        <div className="rounded-2xl border border-[var(--status-danger)]/30 bg-[var(--bg-surface)] p-8">
          <p className="font-semibold text-[var(--status-danger)]">Add-on configuration is unavailable</p>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Plans, add-ons, feature definitions, hardware, or staffing data could not be verified. No empty catalogue is being inferred.
          </p>
          <Button
            className="mt-5"
            variant="outline"
            onClick={() => {
              void Promise.all([refetch(), refetchPlans(), refetchCatalog(), refetchHardware(), refetchStaff()])
            }}
          >
            Retry
          </Button>
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <SectionHeader
        title="Add-on Catalog"
        description="Plan add-ons stay commercial-only. Venue add-ons can include hardware and staffing details."
        actions={
          <Button onClick={openCreate} className="h-10 gap-2 bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90">
            <Plus className="h-4 w-4" />
            Create add-on
          </Button>
        }
      />

      <div className="mb-6 grid gap-3 lg:grid-cols-[1fr_auto]">
        <div className="flex rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-1 shadow-sm">
          {(
            [
              { id: "PLAN", label: "Plan add-ons", icon: Layers3 },
              { id: "VENUE", label: "Venue add-ons", icon: MapPin },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setKind(tab.id)}
              className={cn(
                "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors",
                kind === tab.id
                  ? "bg-black text-white shadow-sm dark:bg-white dark:text-black"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]"
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
              <span className={cn("rounded-full px-2 py-0.5 text-[10px]", kind === tab.id ? "bg-white/10 text-white dark:bg-black/10 dark:text-black" : "bg-[var(--bg-surface-2)] text-[var(--text-secondary)]")}>
                {addons.filter((a) => (a.addon_type || "PLAN") === tab.id).length}
              </span>
            </button>
          ))}
        </div>

        <div className="relative min-w-72">
          <Search className="absolute left-3 top-3.5 h-4 w-4 text-[var(--text-tertiary)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search catalog…"
            className="h-12 border-[var(--border-default)] bg-[var(--bg-surface)] pl-10"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-80 animate-pulse rounded-3xl border border-[var(--border-default)] bg-[var(--bg-surface-2)]" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="flex min-h-80 flex-col items-center justify-center rounded-3xl border border-dashed border-[var(--border-default)] bg-[var(--bg-surface)]/60 text-center">
          <div className="mb-4 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 shadow-sm">
            <Layers3 className="h-7 w-7 text-[var(--text-secondary)]" />
          </div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">No {kind.toLowerCase()} add-ons yet</h3>
          <p className="mt-1 max-w-md text-sm text-[var(--text-secondary)]">
            This catalog starts empty by design. Create the first add-on with pricing, images, and the right commercial details.
          </p>
          <Button onClick={openCreate} className="mt-5 bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90">
            <Plus className="mr-2 h-4 w-4" />
            Create add-on
          </Button>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((addon) => (
            <AddonCard
              key={addon.id}
              addon={addon}
              hardwareMap={hardwareMap}
              staffMap={staffMap}
              onOpen={() => setPreviewAddon(addon)}
              onEdit={() => openEdit(addon)}
              onDelete={() => setDeleteTarget(addon)}
            />
          ))}
        </div>
      )}

      <ConfirmDestructiveAction
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Retire add-on?"
        description="This removes the add-on from future sale while preserving active contracts, audit lineage, and immutable revisions. Retired add-ons cannot be edited."
        confirmLabel="Retire add-on"
        resourceName={deleteTarget?.name}
        requireReason
        pending={deleteAddon.isPending}
        onConfirm={async (reason) => {
          if (!deleteTarget) return
          if (!reason) {
            toast.error("A reason is required to retire an add-on")
            return
          }
          await deleteAddon.mutateAsync({ addonId: deleteTarget.id, version: deleteTarget.version || 1, reason })
          toast.success("Add-on retired")
          setDeleteTarget(null)
        }}
      />

      <Dialog open={!!form} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto border-[var(--border-default)] bg-[var(--bg-surface)] p-0 text-[var(--text-primary)]">
          <DialogHeader className="sticky top-0 z-20 border-b border-[var(--border-default)] bg-[var(--bg-surface)]/95 px-6 py-5 backdrop-blur">
            <DialogTitle>{editing ? "Edit add-on" : "Create add-on"}</DialogTitle>
            <DialogDescription className="text-xs text-[var(--text-secondary)]">
              Build a manual catalog entry for either plan extensions or venue packages.
            </DialogDescription>
          </DialogHeader>

          {form && (
            <div className="space-y-8 p-6">
              <section className="grid gap-4 md:grid-cols-2">
                <Field label="Add-on name">
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </Field>
                <Field label="Catalog key">
                  <Input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="ADDON_PRIORITY_SUPPORT" />
                </Field>
                <Field label="Catalog type">
                  <select
                    value={form.addon_type}
                    onChange={(e) => setForm({ ...form, addon_type: e.target.value as Kind })}
                    className="h-10 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-sm"
                  >
                    <option value="PLAN">Plan add-on</option>
                    <option value="VENUE">Venue add-on</option>
                  </select>
                </Field>
                <Field label="Card description">
                  <Input value={form.short_description} onChange={(e) => setForm({ ...form, short_description: e.target.value })} />
                </Field>
                <Field label="Detailed description" wide>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="min-h-24 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-3 text-sm"
                  />
                </Field>
              </section>

              <section className="rounded-3xl border border-[var(--border-default)] bg-[var(--bg-surface-2)]/40 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-[var(--text-primary)]">Visual identity</h3>
                    <p className="text-xs text-[var(--text-secondary)]">Use an image so the card feels more like a commercial product tile.</p>
                  </div>
                  {form.image_url ? (
                    <Button type="button" variant="outline" onClick={() => setForm({ ...form, image_url: "" })} className="text-xs">
                      Remove image
                    </Button>
                  ) : null}
                </div>
                <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                {form.image_url ? (
                  <div className="relative h-56 overflow-hidden rounded-2xl border border-[var(--border-default)] bg-black">
                    <img src={form.image_url} alt="Add-on preview" className="h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
                    <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
                      <div className="text-white">
                        <p className="text-[10px] uppercase tracking-[0.28em] text-white/60">Preview</p>
                        <p className="text-lg font-semibold">{form.name || "Add-on card image"}</p>
                      </div>
                      <Button type="button" onClick={() => imageInputRef.current?.click()} className="bg-white text-black hover:bg-white/90">
                        Change image
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    className="flex h-56 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface-2)]"
                  >
                    <ImagePlus className="h-8 w-8" />
                    <span className="mt-2 text-sm font-semibold">Upload add-on image</span>
                    <span className="mt-1 text-[10px] uppercase tracking-[0.25em]">PNG, JPG, WebP</span>
                  </button>
                )}
              </section>

              <Section title="Commercial settings" subtitle="Set the sell range and plan availability.">
                <div className="grid gap-4 md:grid-cols-5">
                  <Field label="Billing unit">
                    <Input
                      type="text"
                      placeholder="e.g. PER_EVENT, PER_MONTH"
                      value={form.billing_unit}
                      onChange={(e) => setForm({ ...form, billing_unit: e.target.value })}
                    />
                  </Field>
                  <Field label="Price unit">
                    <Input
                      type="text"
                      placeholder="e.g. screen, room, day"
                      value={form.price_unit}
                      onChange={(e) => setForm({ ...form, price_unit: e.target.value })}
                    />
                  </Field>
                  <Field label="Minimum price">
                    <Input type="number" value={form.min_price_inr} onChange={(e) => setForm({ ...form, min_price_inr: e.target.value })} />
                  </Field>
                  <Field label="Maximum price">
                    <Input type="number" value={form.max_price_inr} onChange={(e) => setForm({ ...form, max_price_inr: e.target.value })} />
                  </Field>
                  <Field label="Consumables">
                    <Input type="number" value={form.consumables_cost} onChange={(e) => setForm({ ...form, consumables_cost: e.target.value })} />
                  </Field>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <Field label="Entitlement scope">
                    <select value={form.scope_type} onChange={(event) => setForm({ ...form, scope_type: event.target.value as FormState["scope_type"] })} className="h-10 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-sm">
                      <option value="EVENT">Per event</option>
                      <option value="ORGANIZATION">Organization-wide</option>
                    </select>
                  </Field>
                  <Field label="Consumption model">
                    <select value={form.consumption_model} onChange={(event) => setForm({ ...form, consumption_model: event.target.value as FormState["consumption_model"] })} className="h-10 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-sm">
                      <option value="NON_CONSUMABLE">Non-consumable unlock</option>
                      <option value="QUOTA">Quota allocation</option>
                      <option value="METERED">Metered usage</option>
                    </select>
                  </Field>
                  <Field label="Unit">
                    <Input value={form.unit_type} onChange={(event) => setForm({ ...form, unit_type: event.target.value })} placeholder="registrations, messages, GB" />
                  </Field>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {plans.map((plan) => (
                    <button
                      key={plan.id}
                      onClick={() =>
                        setForm({
                          ...form,
                          available_for_plans: form.available_for_plans.includes(plan.name)
                            ? form.available_for_plans.filter((x) => x !== plan.name)
                            : [...form.available_for_plans, plan.name],
                        })
                      }
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                        form.available_for_plans.includes(plan.name)
                          ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                          : "border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-2)]"
                      )}
                    >
                      {plan.name}
                    </button>
                  ))}
                </div>
              </Section>

              {form.addon_type === "PLAN" ? (
                <Section title="Capability assignments" subtitle="Unlock a feature, upgrade a tier, or add quota. The resolved preview is enforced by the same backend used by Organizer Portal.">
                  <div className="grid gap-3 lg:grid-cols-2">
                    {featureCatalog.filter((feature) => feature.is_active).map((feature) => {
                      const assignment = form.feature_assignments.find((item) => item.feature_key === feature.key)
                      return <div key={feature.key} className="rounded-xl border border-[var(--border-default)] p-3"><div className="flex items-start gap-3"><input type="checkbox" checked={Boolean(assignment)} onChange={(event) => setForm({ ...form, feature_assignments: event.target.checked ? [...form.feature_assignments, { feature_key: feature.key, name: feature.name, value_type: feature.value_type || "BOOLEAN", value: feature.default_value?.value ?? (feature.value_type === "BOOLEAN" ? true : feature.value_type === "LIMIT" ? 1 : feature.allowed_values?.[0] ?? ""), scope_type: feature.scope_type, operation: feature.value_type === "LIMIT" ? "INCREMENT" : "UNLOCK", validity_days: null, stackable: feature.value_type === "LIMIT", max_quantity: null, allowed_values: feature.allowed_values, unit: feature.unit, period: feature.period }] : form.feature_assignments.filter((item) => item.feature_key !== feature.key) })} className="mt-1" /><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{feature.name}</p><code className="text-[10px] text-[var(--text-tertiary)]">{feature.key} · {feature.value_type}</code>{assignment ? <AddonAssignmentEditor value={assignment} onChange={(next) => setForm({ ...form, feature_assignments: form.feature_assignments.map((item) => item.feature_key === feature.key ? next : item) })} /> : null}</div></div></div>
                    })}
                  </div>
                </Section>
              ) : null}

              {form.addon_type === "VENUE" ? (
                <>
                  <Section title="Template targeting" subtitle="Choose the simulator/template steps where this venue add-on is available.">
                    <div className="flex flex-wrap gap-2">{["registration","srr","room","other"].map(type=><button type="button" key={type} onClick={()=>setForm({...form,template_types:form.template_types.includes(type)?form.template_types.filter(value=>value!==type):[...form.template_types,type]})} className={cn("rounded-full border px-3 py-2 text-xs font-semibold capitalize",form.template_types.includes(type)?"border-black bg-black text-white dark:border-white dark:bg-white dark:text-black":"border-[var(--border-default)]")}>{type === "srr" ? "SRR" : type}</button>)}</div>
                  </Section>
                  <ResourcePickerGrouped
                    title="Hardware selection"
                    icon={Cpu}
                    items={hardware.map((x) => ({
                      id: x.id,
                      name: x.name,
                      meta: `${x.category_name} · ${formatINR(x.selling_price)}/${String(x.pricing_unit || "").toLowerCase().replace("per_", "")}`,
                    }))}
                    groupedItems={Object.fromEntries(
                      Object.entries(groupedHardware).map(([group, entries]) => [
                        group,
                        entries.map((x) => ({
                          id: x.id,
                          name: x.name,
                          meta: `${x.category_name} · ${formatINR(x.selling_price)}/${String(x.pricing_unit || "").toLowerCase().replace("per_", "")}`,
                        })),
                      ])
                    )}
                    selected={form.hardware}
                    onToggle={(id: string, checked: boolean) => setResource("hardware", id, checked)}
                    onUpdate={(id: string, key: "quantity" | "days", value: number) => updateResource("hardware", id, key, value)}
                  />
                  <ResourcePickerGrouped
                    title="Staffing selection"
                    icon={Users}
                    items={staff.map((x) => ({
                      id: x.id,
                      name: x.name,
                      meta: `${x.grade || "Crew"} · ${formatINR(x.selling_per_day)}/day`,
                    }))}
                    groupedItems={Object.fromEntries(
                      Object.entries(groupedStaff).map(([group, entries]) => [
                        group,
                        entries.map((x) => ({
                          id: x.id,
                          name: x.name,
                          meta: `${x.grade || "Crew"} · ${formatINR(x.selling_per_day)}/day`,
                        })),
                      ])
                    )}
                    selected={form.staff}
                    onToggle={(id: string, checked: boolean) => setResource("staff", id, checked)}
                    onUpdate={(id: string, key: "quantity" | "days", value: number) => updateResource("staff", id, key, value)}
                  />
                </>
              ) : (
                <section className="rounded-3xl border border-[var(--border-default)] bg-[var(--bg-surface-2)]/40 p-5">
                  <h3 className="font-semibold text-[var(--text-primary)]">Plan add-on scope</h3>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    Plan add-ons keep their catalog focused on pricing and commercial details. Hardware and staffing belong to venue add-ons only.
                  </p>
                </section>
              )}

              <div className="grid gap-6 md:grid-cols-2">
                <ListEditor label="Inclusions" items={form.inclusions} onChange={(next) => setForm({ ...form, inclusions: next })} />
                <ListEditor label="Exclusions" items={form.exclusions} onChange={(next) => setForm({ ...form, exclusions: next })} />
              </div>

              <Field label="Administrative reason">
                <textarea
                  value={adminReason}
                  onChange={(event) => setAdminReason(event.target.value)}
                  placeholder="Explain why this catalogue revision is required (minimum 12 characters)."
                  className="min-h-20 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-3 text-sm"
                />
              </Field>

              <div className="flex items-center justify-between border-t border-[var(--border-default)] pt-5">
                <div className="flex items-center gap-3">
                  <Switch checked={form.is_active} onCheckedChange={(checked) => setForm({ ...form, is_active: checked })} />
                  <span className="text-sm font-medium text-[var(--text-primary)]">Available for sale</span>
                  <select
                    aria-label="Add-on lifecycle"
                    value={form.lifecycle_status}
                    onChange={(event) => setForm({ ...form, lifecycle_status: event.target.value as FormState["lifecycle_status"] })}
                    className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-2 text-xs font-semibold"
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="REVIEW">In review</option>
                    {editing ? <option value="PUBLISHED">Published</option> : null}
                  </select>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setForm(null)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={save}
                    disabled={createAddon.isPending || updateAddon.isPending}
                    className="bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90"
                  >
                    {createAddon.isPending || updateAddon.isPending ? "Saving…" : "Save add-on"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AddonDetailSheet
        addon={previewAddon}
        hardwareMap={hardwareMap}
        staffMap={staffMap}
        open={!!previewAddon}
        onOpenChange={(open) => !open && setPreviewAddon(null)}
        onEdit={() => {
          if (!previewAddon) return
          setPreviewAddon(null)
          openEdit(previewAddon)
        }}
        onHistory={() => {
          if (!previewAddon) return
          setHistoryTarget(previewAddon)
        }}
      />

      <Dialog open={!!historyTarget} onOpenChange={(open) => !open && setHistoryTarget(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)]">
          <DialogHeader>
            <DialogTitle>{historyTarget?.name} revision history</DialogTitle>
            <DialogDescription>Immutable catalogue snapshots, including assignments and the recorded administrative reason.</DialogDescription>
          </DialogHeader>
          {historyLoading ? (
            <div className="h-40 animate-pulse rounded-2xl bg-[var(--bg-surface-2)]" />
          ) : historyData?.items.length ? (
            <div className="space-y-3">
              {historyData.items.map((revision, index) => {
                const previous = historyData.items[index + 1]
                const currentTemplate = revision.snapshot.template || {}
                const previousTemplate = previous?.snapshot.template || {}
                const changedFields = Object.keys(currentTemplate).filter((key) => JSON.stringify(currentTemplate[key]) !== JSON.stringify(previousTemplate[key]))
                return (
                  <article key={revision.id} className="rounded-2xl border border-[var(--border-default)] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2"><span className="font-semibold">Version {revision.version}</span><span className="rounded-full bg-[var(--bg-surface-2)] px-2 py-1 text-[10px] font-semibold">{revision.lifecycle_status}</span></div>
                      <time className="text-xs text-[var(--text-tertiary)]">{new Date(revision.created_at).toLocaleString()}</time>
                    </div>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">{revision.reason}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <span className="rounded-md border border-[var(--border-default)] px-2 py-1 text-[10px]">{revision.change_type}</span>
                      <span className="rounded-md border border-[var(--border-default)] px-2 py-1 text-[10px]">{revision.snapshot.assignments?.length || 0} assignments</span>
                      {changedFields.slice(0, 8).map((field) => <span key={field} className="rounded-md border border-[var(--border-default)] px-2 py-1 text-[10px]">Changed: {field}</span>)}
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-[var(--border-default)] p-8 text-center text-sm text-[var(--text-secondary)]">No immutable revisions are available.</p>
          )}
        </DialogContent>
      </Dialog>
    </PageContainer>
  )
}

function AddonAssignmentEditor({ value, onChange }: { value: AddonFeatureAssignment; onChange: (value: AddonFeatureAssignment) => void }) {
  return <div className="mt-3 grid grid-cols-2 gap-2"><select value={value.operation} onChange={(event) => onChange({ ...value, operation: event.target.value as AddonFeatureAssignment["operation"] })} className="rounded border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-2 text-xs"><option value="UNLOCK">Unlock</option><option value="REPLACE">Replace</option><option value="INCREMENT">Increment</option><option value="DECREMENT">Decrement</option></select>{value.value_type === "BOOLEAN" ? <select value={String(Boolean(value.value))} onChange={(event) => onChange({ ...value, value: event.target.value === "true" })} className="rounded border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-2 text-xs"><option value="true">Enabled</option><option value="false">Disabled</option></select> : value.value_type === "TIER" || value.value_type === "ENUM" ? <select value={String(value.value)} onChange={(event) => onChange({ ...value, value: event.target.value })} className="rounded border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-2 text-xs">{value.allowed_values?.map((option) => <option key={option}>{option}</option>)}</select> : <Input type="number" min={0} value={Number(value.value ?? 0)} onChange={(event) => onChange({ ...value, value: Number(event.target.value) })} />}<Input type="number" min={1} placeholder="Validity days" value={value.validity_days ?? ""} onChange={(event) => onChange({ ...value, validity_days: event.target.value ? Number(event.target.value) : null })} /><Input type="number" min={1} placeholder="Max quantity" value={value.max_quantity ?? ""} onChange={(event) => onChange({ ...value, max_quantity: event.target.value ? Number(event.target.value) : null })} /><label className="col-span-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={Boolean(value.stackable)} onChange={(event) => onChange({ ...value, stackable: event.target.checked })} />Stackable purchase</label></div>
}

function getAdjustedAddonPriceLabel(addon: Addon, hardwareMap?: Record<string, any>, staffMap?: Record<string, any>) {
  if (addon.billing_unit === "CUSTOM") return "Custom quote"
  if (addon.final_price !== undefined && addon.final_price !== null) {
    return formatINR(addon.final_price)
  }
  const minPrice = Number(addon.min_price_inr ?? addon.price_inr ?? addon.max_price_inr ?? 0)
  const maxPrice = Math.max(minPrice, Number(addon.max_price_inr ?? addon.price_inr ?? addon.min_price_inr ?? 0))
  const hardwareCost = hardwareMap ? (addon.hardware_spec || []).reduce((sum, row) => {
    const item = hardwareMap[row.item_id]
    return sum + Number(row.quantity || 0) * Number(row.days || 1) * Number(item?.selling_price || 0)
  }, 0) : 0
  const staffCost = staffMap ? (addon.staff_spec || []).reduce((sum, row) => {
    const item = staffMap[row.role_id]
    return sum + Number(row.quantity || 0) * Number(row.days || 1) * Number(item?.selling_per_day || 0)
  }, 0) : 0
  const totalMin = minPrice + hardwareCost + staffCost
  const totalMax = maxPrice + hardwareCost + staffCost
  return totalMin === totalMax ? formatINR(totalMin) : `${formatINR(totalMin)} - ${formatINR(totalMax)}`
}

function getAddonPriceLabel(addon: Addon) {
  if (addon.billing_unit === "CUSTOM") return "Custom quote"
  const minPrice = Number(addon.min_price_inr || addon.price_inr || 0)
  const maxPrice = Number(addon.max_price_inr || 0)
  return `${formatINR(minPrice)}${maxPrice ? ` – ${formatINR(maxPrice)}` : ""}`
}

function getAddonMeta(addon: Addon, hardwareMap: Record<string, any>, staffMap: Record<string, any>) {
  const isVenue = (addon.addon_type || "PLAN") === "VENUE"
  const hardware = isVenue ? (addon.hardware_spec || []).reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0) : 0
  const crew = isVenue ? (addon.staff_spec || []).reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0) : 0
  const targets = addon.template_types?.length ? addon.template_types.map((item) => (item === "srr" ? "SRR" : item)).join(" · ") : "Other"

  return { isVenue, hardware, crew, targets, price: getAdjustedAddonPriceLabel(addon, hardwareMap, staffMap) }
}

function AddonCard({ addon, hardwareMap, staffMap, onOpen, onEdit, onDelete }: any) {
  const { isVenue, hardware, crew, targets, price } = getAddonMeta(addon, hardwareMap, staffMap)
  const imageUrl = typeof addon.image_url === "string" && addon.image_url.trim() ? addon.image_url.trim() : undefined
  const description = addon.short_description || addon.description || "Commercial add-on package."
  const __legacyPrice =
    addon.billing_unit === "CUSTOM"
      ? "Custom quote"
      : `${formatINR(Number(addon.min_price_inr || addon.price_inr || 0))}${addon.max_price_inr ? ` – ${formatINR(Number(addon.max_price_inr))}` : ""}`

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
      className="group relative flex min-h-[520px] cursor-pointer flex-col overflow-hidden rounded-3xl border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-md"
    >
      <div className="relative h-[260px] flex-shrink-0 overflow-hidden border-b border-[var(--border-default)] bg-black">
        {imageUrl ? (
          <img src={imageUrl} alt={addon.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,.14),transparent_36%),linear-gradient(135deg,#050505,#1a1a1a)]">
            <div className="rounded-full border border-white/10 bg-white/5 p-4 text-white/55">
              {isVenue ? <MapPin className="h-7 w-7" /> : <Layers3 className="h-7 w-7" />}
            </div>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/85 to-transparent px-4 pb-4 pt-12 text-white">
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.2em]">
              {isVenue ? "Venue package" : "Plan extension"}
            </span>
            <span className={cn("rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.2em]", addon.lifecycle_status === "PUBLISHED" ? "bg-white text-black" : "bg-white/10 text-white/55")}>
              {addon.lifecycle_status || (addon.is_active ? "Published" : "Draft")}
            </span>
          </div>
          <h3 className="mt-3 truncate text-lg font-semibold">{addon.name}</h3>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="line-clamp-2 min-h-10 text-xs leading-5 text-[var(--text-secondary)]">{description}</p>

        <div className="mt-3 grid grid-cols-3 border-y border-[var(--border-default)] py-3">
          <div className="min-w-0 border-r border-[var(--border-default)] px-1 text-center">
            <div className="truncate text-[9px] text-[var(--text-tertiary)]">Billing</div>
            <div className="mt-1 truncate text-sm font-semibold text-[var(--text-primary)]">{String(addon.billing_unit || "PER_EVENT").replaceAll("_", " ")}</div>
          </div>
          <div className="min-w-0 border-r border-[var(--border-default)] px-1 text-center">
            <div className="truncate text-[9px] text-[var(--text-tertiary)]">{isVenue ? "Hardware" : "Access"}</div>
            <div className="mt-1 truncate text-sm font-semibold text-[var(--text-primary)]">{isVenue ? hardware : ((addon.available_for_plans || []).length ? "Scoped" : "Open")}</div>
          </div>
          <div className="min-w-0 px-1 text-center">
            <div className="truncate text-[9px] text-[var(--text-tertiary)]">{isVenue ? "Staff" : "Type"}</div>
            <div className="mt-1 truncate text-sm font-semibold text-[var(--text-primary)]">{isVenue ? crew : "Plan"}</div>
          </div>
        </div>

        <div className="mt-4 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[9px] uppercase text-[var(--text-tertiary)]">{isVenue ? "Price range" : "Commercial range"}</div>
            <div className="mt-1 truncate text-lg font-semibold text-[var(--text-primary)]">{price}</div>
          </div>
          <CheckCircle2 className="h-4 w-4 text-[var(--text-primary)] opacity-0 transition-opacity group-hover:opacity-100" />
        </div>

        <div className="mt-3 min-h-6">
          {isVenue ? <p className="line-clamp-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">{targets}</p> : null}
        </div>

        <div className="mt-auto grid grid-cols-[1fr_auto_auto] gap-2 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={(event) => {
              event.stopPropagation()
              onOpen()
            }}
            className="h-10 rounded-md border-[var(--border-default)] bg-transparent text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]"
          >
            View Details
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={(event) => {
              event.stopPropagation()
              onEdit()
            }}
            aria-label={`Edit ${addon.name}`}
            disabled={addon.lifecycle_status === "RETIRED"}
            className="h-10 w-10 rounded-md border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]"
          >
            <Edit3 className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={(event) => {
              event.stopPropagation()
              onDelete()
            }}
            aria-label={`Retire ${addon.name}`}
            disabled={addon.lifecycle_status === "RETIRED"}
            className="h-10 w-10 rounded-md border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-red-500/10 hover:text-red-500"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </article>
  )
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: any }) {
  return (
    <label className={wide ? "md:col-span-2" : ""}>
      <span className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)]">{label}</span>
      {children}
    </label>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: any }) {
  return (
    <section className="rounded-3xl border border-[var(--border-default)] bg-[var(--bg-surface-2)]/40 p-5">
      <h3 className="font-semibold text-[var(--text-primary)]">{title}</h3>
      <p className="mb-4 text-xs text-[var(--text-secondary)]">{subtitle}</p>
      {children}
    </section>
  )
}

function ResourcePicker({ title, icon: Icon, items, groupedItems = {}, selected, onToggle, onUpdate }: any) {
  const available = items.filter((item: any) => !selected.some((row: any) => row.id === item.id))
  return (
    <Section title={title} subtitle="Select catalog resources and set the delivery quantity and duration.">
      <div className="space-y-2">
        {selected.map((row: any) => { const item = items.find((entry:any)=>entry.id===row.id); return <div key={row.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-2"><Icon className="h-4 w-4 text-[var(--text-secondary)]"/><select value={row.id} onChange={event=>{onToggle(row.id,false);onToggle(event.target.value,true)}} className="min-w-56 flex-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-2 text-xs"><option value={row.id}>{item?.name || "Catalog item"} · {item?.meta}</option>{available.map((entry:any)=><option key={entry.id} value={entry.id}>{entry.name} · {entry.meta}</option>)}</select><Input type="number" min={1} value={row.quantity} onChange={e=>onUpdate(row.id,"quantity",+e.target.value)} aria-label="Quantity" className="h-9 w-20"/><Input type="number" min={1} value={row.days} onChange={e=>onUpdate(row.id,"days",+e.target.value)} aria-label="Days" className="h-9 w-20"/><Button type="button" size="icon" variant="ghost" onClick={()=>onToggle(row.id,false)}><Trash2 className="h-4 w-4"/></Button></div> })}
        {available.length > 0 && <Button type="button" variant="outline" onClick={()=>onToggle(available[0].id,true)}><Plus className="mr-2 h-4 w-4"/>Add {title.toLowerCase().replace(" selection","")}</Button>}
        {items.length === 0 && <p className="py-6 text-center text-xs text-[var(--text-secondary)]">No catalog resources are available yet. Add hardware or staff in the pricing catalogs first.</p>}
      </div>
    </Section>
  )
}

function ResourcePickerGrouped({ title, icon: Icon, items, groupedItems = {}, selected, onToggle, onUpdate }: any) {
  const available = items.filter((item: any) => !selected.some((row: any) => row.id === item.id))

  return (
    <Section title={title} subtitle="Select catalog resources and set the delivery quantity and duration.">
      <div className="space-y-2">
        {selected.map((row: any) => {
          const item = items.find((entry: any) => entry.id === row.id)
          return (
            <div key={row.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-2">
              <Icon className="h-4 w-4 text-[var(--text-secondary)]" />
              <select
                value={row.id}
                onChange={(event) => {
                  onToggle(row.id, false)
                  onToggle(event.target.value, true)
                }}
                className="min-w-56 flex-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-2 text-xs"
              >
                <option value={row.id}>{item?.name || "Catalog item"} · {item?.meta}</option>
                {Object.keys(groupedItems).sort().map((group) => (
                  <optgroup key={group} label={group}>
                    {(groupedItems[group] || [])
                      .filter((entry: any) => entry.id !== row.id && available.some((candidate: any) => candidate.id === entry.id))
                      .map((entry: any) => (
                        <option key={entry.id} value={entry.id}>{entry.name} · {entry.meta}</option>
                      ))}
                  </optgroup>
                ))}
              </select>
              <Input type="number" min={1} value={row.quantity} onChange={e => onUpdate(row.id, "quantity", +e.target.value)} aria-label="Quantity" className="h-9 w-20" />
              <Input type="number" min={1} value={row.days} onChange={e => onUpdate(row.id, "days", +e.target.value)} aria-label="Days" className="h-9 w-20" />
              <Button type="button" size="icon" variant="ghost" onClick={() => onToggle(row.id, false)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )
        })}

        {available.length > 0 && (
          <Button type="button" variant="outline" onClick={() => onToggle(available[0].id, true)}>
            <Plus className="mr-2 h-4 w-4" />Add {title.toLowerCase().replace(" selection", "")}
          </Button>
        )}

        {items.length === 0 && <p className="py-6 text-center text-xs text-[var(--text-secondary)]">No catalog resources are available yet. Add hardware or staff in the pricing catalogs first.</p>}
      </div>
    </Section>
  )
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

function ListEditor({ label, items, onChange }: { label: string; items: string[]; onChange: (v: string[]) => void }) {
  const handlePaste = (index: number, event: ClipboardEvent<HTMLInputElement>) => {
    const parsed = parsePastedList(event.clipboardData.getData("text"))
    if (parsed.length <= 1) return

    event.preventDefault()
    const next = [...items]
    next.splice(index, 1, ...parsed)
    onChange(next)
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">{label}</h3>
        <Button size="sm" variant="outline" onClick={() => onChange([...items, ""])}>
          <Plus className="mr-1 h-3 w-3" />
          Add
        </Button>
      </div>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className="flex gap-2">
            <Input
              value={item}
              onChange={(e) => onChange(items.map((value, itemIndex) => (itemIndex === index ? e.target.value : value)))}
              onPaste={(event) => handlePaste(index, event)}
            />
            <Button size="icon" variant="ghost" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${label} item`}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}

function AddonDetailSheet({
  addon,
  hardwareMap,
  staffMap,
  open,
  onOpenChange,
  onEdit,
  onHistory,
}: {
  addon: Addon | null
  hardwareMap: Record<string, any>
  staffMap: Record<string, any>
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: () => void
  onHistory: () => void
}) {
  const imageUrl = typeof addon?.image_url === "string" && addon.image_url.trim() ? addon.image_url.trim() : undefined
  const isVenue = (addon?.addon_type || "PLAN") === "VENUE"
  const hardwareRows = addon?.hardware_spec || []
  const staffRows = addon?.staff_spec || []
  const inclusions = (addon?.inclusions || []).filter(Boolean)
  const exclusions = (addon?.exclusions || []).filter(Boolean)

  const hardwareCost = hardwareRows.reduce((sum, row) => {
    const item = hardwareMap[row.item_id]
    return sum + Number(row.quantity || 0) * Number(row.days || 1) * Number(item?.selling_price || 0)
  }, 0)
  const crewCost = staffRows.reduce((sum, row) => {
    const item = staffMap[row.role_id]
    return sum + Number(row.quantity || 0) * Number(row.days || 1) * Number(item?.selling_per_day || 0)
  }, 0)
  const consumables = Number(addon?.consumables_cost || 0)

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
                    {isVenue ? <MapPin className="h-14 w-14 text-white/35" /> : <Layers3 className="h-14 w-14 text-white/35" />}
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-black/20" />
              </div>

              <div className="space-y-4 p-5">
                <SheetHeader className="pr-8">
                  <div className="mb-1 flex items-center gap-2 text-[9px] uppercase text-[var(--text-tertiary)]">
                    <span>{addon.lifecycle_status || (addon.is_active === false ? "Inactive" : "Published")}</span>
                    <span>•</span>
                    <span>{isVenue ? "Venue package" : "Plan extension"}</span>
                  </div>
                  <SheetTitle className="text-xl">{addon.name}</SheetTitle>
                  <SheetDescription className="line-clamp-none text-xs leading-5 text-[var(--text-secondary)]">
                    {addon.description || addon.short_description || "Commercial add-on details."}
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
                      <div className="mt-1 truncate text-xs font-semibold text-[var(--text-primary)]">{getAdjustedAddonPriceLabel(addon, hardwareMap, staffMap)}</div>
                    </div>
                    <div className="min-w-0 px-2">
                      <div className="truncate text-[8px] text-[var(--text-tertiary)]">{isVenue ? "Hardware" : "Plans"}</div>
                      <div className="mt-1 truncate text-xs font-semibold text-[var(--text-primary)]">{isVenue ? hardwareRows.reduce((sum, row) => sum + Number(row.quantity || 0), 0) : (addon.available_for_plans || []).length}</div>
                    </div>
                    <div className="min-w-0 px-2">
                      <div className="truncate text-[8px] text-[var(--text-tertiary)]">{isVenue ? "Staff" : "Type"}</div>
                      <div className="mt-1 truncate text-xs font-semibold text-[var(--text-primary)]">{isVenue ? staffRows.reduce((sum, row) => sum + Number(row.quantity || 0), 0) : "Plan"}</div>
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
                    {[
                      ["Hardware", hardwareCost],
                      ["Crew", crewCost],
                      ["Consumables", consumables],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="flex items-center justify-between py-2 text-xs">
                        <span className="text-[var(--text-secondary)]">{label}</span>
                        <span className="font-mono font-semibold text-[var(--text-primary)]">{formatINR(Number(value))}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between py-3 text-sm font-semibold">
                      <span>Total range (commercial + hardware + staff)</span>
                      <span className="font-mono">{getAdjustedAddonPriceLabel(addon, hardwareMap, staffMap)}</span>
                    </div>
                  </div>
                </section>
              </div>
            </div>

            <SheetFooter className="grid grid-cols-2 border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
              <Button type="button" variant="outline" onClick={onHistory} className="h-11 w-full rounded-md text-sm font-semibold">
                <Clock3 className="mr-2 h-4 w-4" />
                Revision history
              </Button>
              <Button type="button" onClick={onEdit} disabled={addon.lifecycle_status === "RETIRED"} className="h-11 w-full rounded-md bg-black text-sm font-semibold text-white hover:bg-black/90 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-white/85">
                Edit add-on
                <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
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
