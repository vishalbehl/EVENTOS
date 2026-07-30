"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Crown,
  Edit3,
  History,
  Layers3,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { EntitlementCatalogDialog } from "@/components/super-admin/ui/EntitlementCatalogDialog";
import {
  formatINR,
  formatExactINR,
  SubscriptionPlan,
  type FeatureCatalogItem,
  useCreatePlan,
  useFeatureMatrix,
  useFeaturesCatalog,
  usePlanFeatures,
  useSubscriptionPlans,
  useUpdatePlan,
  useTypedPlanFeatures,
  useUpdateTypedPlanFeatures,
  usePlanTemplateVersions,
  type TypedFeatureAssignment,
} from "@/services/super-admin-service";

const blank: Partial<SubscriptionPlan> = {
  name: "",
  tagline: "",
  description: "",
  billing_model: "PER_EVENT",
  currency: "INR",
  price_per_event: 0,
  display_order: 0,
  is_popular: false,
  is_active: false,
  lifecycle_status: "DRAFT",
  color_hex: "#6366F1",
};

export default function PlansPage() {
  const {
    data: plans = [],
    isLoading,
    isError,
    refetch,
  } = useSubscriptionPlans();
  const {
    data: matrix = [],
    isError: matrixError,
    refetch: refetchMatrix,
  } = useFeatureMatrix();
  const createPlan = useCreatePlan();
  const updatePlan = useUpdatePlan();
  const updateFeatures = useUpdateTypedPlanFeatures();
  const [editing, setEditing] = useState<SubscriptionPlan | null | undefined>(
    undefined,
  );
  const [form, setForm] = useState<Partial<SubscriptionPlan>>(blank);
  const [featurePlan, setFeaturePlan] = useState<SubscriptionPlan | null>(null);
  const { data: currentFeatures } = usePlanFeatures(featurePlan?.id || "");
  const { data: typedFeatures } = useTypedPlanFeatures(featurePlan?.id || "");
  const { data: catalog = [] } = useFeaturesCatalog();
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<Record<string, TypedFeatureAssignment>>({});
  const catalogByKey = useMemo(() => {
    const map = new Map<string, FeatureCatalogItem>();
    for (const item of catalog) {
      map.set(item.key, item);
    }
    return map;
  }, [catalog]);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [planReason, setPlanReason] = useState("");
  const [featureReason, setFeatureReason] = useState("");
  const [historyPlan, setHistoryPlan] = useState<SubscriptionPlan | null>(null);
  const history = usePlanTemplateVersions(historyPlan?.id || "");

  useEffect(() => {
    if (!featurePlan) return;
    const allFeatureKeys = new Set<string>();
    for (const cat of matrix) {
      for (const feat of cat.features) {
        allFeatureKeys.add(feat.key);
      }
    }
    for (const item of catalog) {
      allFeatureKeys.add(item.key);
    }

    const initialAssignments: Record<string, TypedFeatureAssignment> = {};
    const existingMap = Object.fromEntries(
      (typedFeatures?.items || []).map((item) => [item.feature_key, item])
    );

    if (typedFeatures?.items?.length) {
      setSelectedFeatures(typedFeatures.items.map((i) => i.feature_key));
    } else if (currentFeatures?.length) {
      setSelectedFeatures(currentFeatures);
    } else {
      setSelectedFeatures([]);
    }

    const planDefaults: Record<string, number | null | undefined> = {
      LIMIT_ORGANIZER_USERS: featurePlan.max_users,
      LIMIT_REGISTRATIONS: featurePlan.max_registrations,
      LIMIT_SPEAKERS: featurePlan.max_speakers,
      LIMIT_SESSIONS: featurePlan.max_sessions,
      LIMIT_ROOMS: featurePlan.max_rooms,
      LIMIT_STORAGE: featurePlan.storage_quota_mb,
      FEAT_TICKET_CATEGORIES: featurePlan.max_ticket_categories,
      FEAT_BADGE_TEMPLATES: featurePlan.max_badge_templates,
      FEAT_CERTIFICATE_TEMPLATES: featurePlan.max_certificate_templates,
      FEAT_EMAIL_NOTIFICATIONS: featurePlan.max_emails_per_event,
    };

    for (const key of allFeatureKeys) {
      const definition = catalogByKey.get(key);
      const isLimit = key.startsWith("LIMIT_") || key === "FEAT_TICKET_CATEGORIES" || key === "FEAT_BADGE_TEMPLATES" || key === "FEAT_CERTIFICATE_TEMPLATES" || key === "FEAT_EMAIL_NOTIFICATIONS" || definition?.value_type === "LIMIT";
      const valType = definition?.value_type || (isLimit ? "LIMIT" : "BOOLEAN");
      const planDefaultValue = planDefaults[key];
      const existing = existingMap[key];
      const existingVal = existing?.value;

      let resolvedVal: any;
      if (valType === "LIMIT") {
        if (typeof existingVal === "number") {
          resolvedVal = existingVal;
        } else {
          resolvedVal = planDefaultValue ?? definition?.default_value?.value ?? 0;
        }
      } else if (valType === "BOOLEAN") {
        resolvedVal = typeof existingVal === "boolean"
          ? existingVal
          : Boolean(definition?.default_value?.value ?? false);
      } else {
        // For TIER/ENUM features: pick a candidate value, then normalize it against allowed_values.
        // The existing DB value may be stale (e.g. stored as boolean 'true' before the feature was
        // reclassified to TIER). If the candidate is not in allowed_values, fall back to the first
        // allowed value so we never submit an invalid string to the backend.
        const allowedVals = definition?.allowed_values ?? [];
        const firstAllowedVal = allowedVals[0] ?? "";
        const candidateVal = existingVal ?? planDefaultValue ?? definition?.default_value?.value ?? firstAllowedVal;
        resolvedVal = (allowedVals.length === 0 || allowedVals.includes(String(candidateVal)))
          ? candidateVal
          : firstAllowedVal;
      }

      if (existing) {
        initialAssignments[key] = {
          ...existing,
          value_type: valType,
          value: resolvedVal,
          // Always use the catalog's allowed_values — the API response may be empty for old records
          allowed_values: definition?.allowed_values ?? existing.allowed_values,
        };
      } else {
        initialAssignments[key] = {
          feature_key: key,
          name: definition?.name || key,
          value_type: valType,
          value: resolvedVal,
          scope_type: definition?.scope_type || (key.startsWith("FEAT_CUSTOM_DOMAIN") || key.startsWith("FEAT_CUSTOM_LOGIN") ? "ORGANIZATION" : "EVENT"),
          enforcement_mode: definition?.enforcement_mode ?? "HARD",
          hard_ceiling: null,
          allowed_values: definition?.allowed_values,
          unit: definition?.unit,
          period: definition?.period,
        };
      }
    }
    setAssignments(initialAssignments);
  }, [featurePlan, currentFeatures, typedFeatures, catalog, matrix, catalogByKey]);
  const sorted = useMemo(
    () =>
      [...plans].sort(
        (a, b) => (a.display_order || 0) - (b.display_order || 0),
      ),
    [plans],
  );
  const open = (plan?: SubscriptionPlan) => {
    setEditing(plan || null);
    setForm(
      plan
        ? {
            name: plan.name,
            tagline: plan.tagline,
            description: plan.description,
            billing_model: plan.billing_model,
            currency: plan.currency,
            price_per_event: plan.price_per_event,
            display_order: plan.display_order,
            is_popular: plan.is_popular,
            is_active: plan.is_active,
            lifecycle_status: plan.lifecycle_status,
            color_hex: plan.color_hex,
          }
        : { ...blank, display_order: plans.length },
    );
    setPlanReason("");
  };
  const openFeatures = (plan: SubscriptionPlan) => {
    setFeaturePlan(plan);
    setFeatureReason("");
  };
  const save = async () => {
    if (!form.name?.trim()) return toast.error("Plan name is required");
    if (planReason.trim().length < 12) return toast.error("An administrative reason of at least 12 characters is required");
    try {
      editing
        ? await updatePlan.mutateAsync({ id: editing.id, version: editing.version || 1, reason: planReason, data: form })
        : await createPlan.mutateAsync({ data: form, reason: planReason });
      toast.success(editing ? "Plan updated" : "Plan created");
      setEditing(undefined);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Could not save plan");
    }
  };

  if (isLoading) {
    return (
      <PageContainer>
        <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-8 text-sm text-[var(--text-secondary)]">
          Loading authoritative plan templates…
        </div>
      </PageContainer>
    );
  }
  if (isError || matrixError) {
    return (
      <PageContainer>
        <div className="rounded-2xl border border-[var(--status-danger)]/30 bg-[var(--bg-surface)] p-8">
          <p className="font-semibold text-[var(--status-danger)]">Plan configuration is unavailable</p>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            The catalogue request failed. No empty plan list or feature matrix is being shown.
          </p>
          <Button
            className="mt-5"
            variant="outline"
            onClick={() => {
              void Promise.all([refetch(), refetchMatrix()]);
            }}
          >
            Retry
          </Button>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <SectionHeader
        title="Plan Management"
        description="Design the commercial tiers that power your conference platform. Add-ons are now managed in their own catalog."
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setCatalogOpen(true)}
              className="h-10 gap-2"
            >
              <ShieldCheck className="h-4 w-4" />
              Manage feature catalog
            </Button>
            <Button
              onClick={() => open()}
              className="h-10 gap-2 bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90"
            >
              <Plus className="h-4 w-4" />
              Create plan
            </Button>
          </div>
        }
      />
      <div className="mb-6 flex items-center gap-3 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3 text-sm text-[var(--text-secondary)] shadow-sm">
        <ShieldCheck className="h-5 w-5 text-[var(--text-primary)]" />
        <span>
          Plan entitlements stay focused on platform access. Optional plan and
          venue packages live in{" "}
          <b className="text-[var(--text-primary)]">Add-on Catalog</b>.
        </span>
      </div>
      {isLoading ? (
        <div className="grid gap-6 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-[470px] animate-pulse rounded-3xl border border-[var(--border-default)] bg-[var(--bg-surface)]"
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {sorted.map((p, i) => (
            <PlanCard
              key={p.id}
              plan={p}
              index={i}
              onEdit={() => open(p)}
              onFeatures={() => openFeatures(p)}
              onHistory={() => setHistoryPlan(p)}
            />
          ))}
        </div>
      )}

      <Dialog
        open={editing !== undefined}
        onOpenChange={(o) => !o && setEditing(undefined)}
      >
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)]">
          <DialogHeader>
            <DialogTitle>
              {editing ? `Edit ${editing.name}` : "Create plan"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 pt-2">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Plan name">
                <Input
                  value={form.name || ""}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              <Field label="Tagline">
                <Input
                  value={form.tagline || ""}
                  onChange={(e) =>
                    setForm({ ...form, tagline: e.target.value })
                  }
                />
              </Field>
              <Field label="Description" wide>
                <textarea
                  value={form.description || ""}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  className="min-h-20 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-3 text-sm"
                />
              </Field>
            </div>
            <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface-2)]/40 p-4">
              <h3 className="mb-4 text-sm font-semibold">
                Commercial settings
              </h3>
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Price / event">
                  <Input
                    type="number"
                    value={form.price_per_event ?? ""}
                    onChange={(e) =>
                      setForm({ ...form, price_per_event: +e.target.value })
                    }
                  />
                </Field>
                <Field label="Display order">
                  <Input
                    type="number"
                    value={form.display_order ?? 0}
                    onChange={(e) =>
                      setForm({ ...form, display_order: +e.target.value })
                    }
                  />
                </Field>
                <Field label="Accent">
                  <Input
                    type="color"
                    value={form.color_hex || "#000000"}
                    onChange={(e) =>
                      setForm({ ...form, color_hex: e.target.value })
                    }
                    className="p-1"
                  />
                </Field>
                <Field label="Lifecycle">
                  <select
                    value={form.lifecycle_status || "DRAFT"}
                    onChange={(e) => setForm({ ...form, lifecycle_status: e.target.value as SubscriptionPlan["lifecycle_status"] })}
                    className="h-10 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-sm"
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="REVIEW">In review</option>
                    {editing ? <option value="PUBLISHED">Published</option> : null}
                    {editing ? <option value="RETIRED">Retired</option> : null}
                  </select>
                </Field>
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface-2)]/40 p-4 text-sm text-[var(--text-secondary)]">
              Feature access, tiers, quotas, enforcement modes, and hard ceilings are managed in the typed <b className="text-[var(--text-primary)]">Entitlements</b> editor. Legacy scalar plan columns are not commercial authority.
            </div>
            <div className="flex flex-wrap items-center gap-6 border-t border-[var(--border-default)] pt-5">
              <Toggle
                label="Active"
                checked={!!form.is_active}
                onChange={(v) => setForm({ ...form, is_active: v })}
              />
              <Toggle
                label="Recommended tier"
                checked={!!form.is_popular}
                onChange={(v) => setForm({ ...form, is_popular: v })}
              />
              <Field label="Administrative reason" wide>
                <textarea
                  value={planReason}
                  onChange={(event) => setPlanReason(event.target.value)}
                  minLength={12}
                  placeholder="Explain the approved commercial template change"
                  className="min-h-20 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-3 text-sm"
                />
              </Field>
              <div className="ml-auto flex gap-2">
                <Button variant="outline" onClick={() => setEditing(undefined)}>
                  Cancel
                </Button>
                <Button
                  onClick={save}
                  disabled={createPlan.isPending || updatePlan.isPending || planReason.trim().length < 12}
                  className="bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90"
                >
                  {createPlan.isPending || updatePlan.isPending
                    ? "Saving…"
                    : "Save plan"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!featurePlan}
        onOpenChange={(o) => !o && setFeaturePlan(null)}
      >
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)]">
          <DialogHeader>
            <DialogTitle>{featurePlan?.name} entitlements</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 pt-2">
            {matrix.map((category) => (
              <section
                key={category.category}
                className="overflow-hidden rounded-2xl border border-[var(--border-default)] shadow-xs"
              >
                <div className="border-b border-[var(--border-default)] bg-[var(--bg-surface-2)] px-4 py-3">
                  <h3 className="text-sm font-semibold">
                    {category.category_name}
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[var(--border-default)] bg-[var(--bg-surface-2)]/50 text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                        <th className="w-16 px-4 py-3.5 text-center">Status</th>
                        <th className="px-4 py-3.5">Capability</th>
                        <th className="w-24 px-4 py-3.5">Scope</th>
                        <th className="w-44 px-4 py-3.5">Value / Limit</th>
                        <th className="w-32 px-4 py-3.5">Hard Ceiling</th>
                        <th className="w-40 px-4 py-3.5">Enforcement</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-default)]">
                      {category.features.map((f) => {
                        const isEnabled = selectedFeatures.includes(f.key);
                        const definition = catalogByKey.get(f.key);
                        const assignment = assignments[f.key];
                        const isLimitKey = f.key.startsWith("LIMIT_") || f.key === "FEAT_TICKET_CATEGORIES" || f.key === "FEAT_BADGE_TEMPLATES" || f.key === "FEAT_CERTIFICATE_TEMPLATES" || f.key === "FEAT_EMAIL_NOTIFICATIONS";
                        const valueType = (definition?.value_type || (isLimitKey ? "LIMIT" : assignment?.value_type) || "BOOLEAN").toUpperCase();

                        return (
                          <tr
                            key={f.key}
                            className={cn(
                              "transition-colors hover:bg-[var(--bg-surface-2)]/40",
                              !isEnabled && "bg-[var(--bg-surface-2)]/20 opacity-60"
                            )}
                          >
                            <td className="px-4 py-3.5 text-center align-middle">
                              <Switch
                                checked={isEnabled}
                                onCheckedChange={(checked) => {
                                  setSelectedFeatures((prev) =>
                                    checked ? [...prev, f.key] : prev.filter((k) => k !== f.key)
                                  );
                                  if (checked) {
                                    setAssignments((current) => {
                                      if (current[f.key]) return current;
                                      return {
                                        ...current,
                                        [f.key]: {
                                          feature_key: f.key,
                                          name: definition?.name || f.name,
                                          value_type: definition?.value_type || "BOOLEAN",
                                          value:
                                            definition?.default_value?.value ??
                                            (definition?.value_type === "BOOLEAN"
                                              ? true
                                              : definition?.value_type === "LIMIT"
                                                ? 0
                                                : definition?.allowed_values?.[0] ?? ""),
                                          scope_type: definition?.scope_type || "EVENT",
                                          enforcement_mode: definition?.enforcement_mode ?? "HARD",
                                          hard_ceiling: null,
                                          allowed_values: definition?.allowed_values,
                                          unit: definition?.unit,
                                          period: definition?.period,
                                        },
                                      };
                                    });
                                  }
                                }}
                              />
                            </td>

                            <td className="px-4 py-3.5 align-middle">
                              <div className="text-sm font-semibold text-[var(--text-primary)]">
                                {f.name}
                              </div>
                              <div className="text-[11px] text-[var(--text-tertiary)]">
                                {f.description}
                              </div>
                              <code className="text-[9px] text-[var(--text-tertiary)] opacity-75">
                                {f.key} · {valueType}
                              </code>
                            </td>

                            <td className="px-4 py-3.5 align-middle">
                              <span className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2 py-1 text-[10px] font-semibold text-[var(--text-tertiary)]">
                                {assignment?.scope_type || definition?.scope_type || "EVENT"}
                              </span>
                            </td>

                            <td className="px-4 py-3.5 align-middle">
                              {isEnabled && assignment ? (
                                valueType === "BOOLEAN" ? (
                                  <select
                                    value={String(Boolean(assignment.value))}
                                    onChange={(e) =>
                                      setAssignments((current) => ({
                                        ...current,
                                        [f.key]: { ...current[f.key], value: e.target.value === "true" },
                                      }))
                                    }
                                    className="w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-1.5 text-xs font-medium"
                                  >
                                    <option value="true">Enabled</option>
                                    <option value="false">Disabled</option>
                                  </select>
                                ) : valueType === "TIER" || valueType === "ENUM" ? (
                                  <select
                                    value={String(assignment.value ?? "")}
                                    onChange={(e) =>
                                      setAssignments((current) => ({
                                        ...current,
                                        [f.key]: { ...current[f.key], value: e.target.value },
                                      }))
                                    }
                                    className="w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-1.5 text-xs font-medium"
                                  >
                                    {!assignment.value && <option value="" disabled>Select a value…</option>}
                                    {(assignment.allowed_values || definition?.allowed_values)?.map((option) => (
                                      <option key={option} value={option}>
                                        {option.replaceAll("_", " ")}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <Input
                                      type="number"
                                      min={0}
                                      value={Number(assignment.value ?? 0)}
                                      onChange={(e) =>
                                        setAssignments((current) => ({
                                          ...current,
                                          [f.key]: { ...current[f.key], value: Number(e.target.value) },
                                        }))
                                      }
                                      className="h-8 w-24 text-xs font-medium"
                                    />
                                    {assignment.unit ? (
                                      <span className="text-[10px] font-medium text-[var(--text-tertiary)]">
                                        {assignment.unit}
                                      </span>
                                    ) : null}
                                  </div>
                                )
                              ) : (
                                <span className="text-sm text-[var(--text-tertiary)] opacity-40">—</span>
                              )}
                            </td>

                            <td className="px-4 py-3.5 align-middle">
                              {isEnabled && assignment && valueType === "LIMIT" ? (
                                <Input
                                  type="number"
                                  min={0}
                                  placeholder="Unlimited"
                                  value={assignment.hard_ceiling ?? ""}
                                  onChange={(e) =>
                                    setAssignments((current) => ({
                                      ...current,
                                      [f.key]: {
                                        ...current[f.key],
                                        hard_ceiling: e.target.value === "" ? null : Number(e.target.value),
                                      },
                                    }))
                                  }
                                  className="h-8 w-24 text-xs font-medium"
                                />
                              ) : (
                                <span className="text-sm text-[var(--text-tertiary)] opacity-40">—</span>
                              )}
                            </td>

                            <td className="px-4 py-3.5 align-middle">
                              {isEnabled && assignment ? (
                                <select
                                  value={assignment.enforcement_mode || "HARD"}
                                  onChange={(e) =>
                                    setAssignments((current) => ({
                                      ...current,
                                      [f.key]: {
                                        ...current[f.key],
                                        enforcement_mode: e.target.value as TypedFeatureAssignment["enforcement_mode"],
                                      },
                                    }))
                                  }
                                  className="w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-1.5 text-xs font-medium"
                                >
                                  <option value="HARD">Hard Enforcement</option>
                                  <option value="SOFT_WARNING">Soft Warning</option>
                                  <option value="METERED_OVERAGE">Metered Overage</option>
                                </select>
                              ) : (
                                <span className="text-sm text-[var(--text-tertiary)] opacity-40">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
            <div className="sticky bottom-0 flex flex-col gap-3 border-t border-[var(--border-default)] bg-[var(--bg-surface)] py-4 sm:flex-row sm:items-end">
              <Field label="Administrative reason" wide>
                <Input
                  value={featureReason}
                  onChange={(event) => setFeatureReason(event.target.value)}
                  minLength={12}
                  placeholder="Explain this entitlement template revision"
                />
              </Field>
              <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setFeaturePlan(null)}>
                Cancel
              </Button>
              <Button
                className="bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90"
                disabled={updateFeatures.isPending || featureReason.trim().length < 12}
                onClick={async () => {
                  if (!featurePlan) return;
                  // Validate TIER/ENUM assignments before sending to the backend
                  const invalidEnumKeys: string[] = [];
                  const validAssignments = selectedFeatures.map((key) => assignments[key]).filter(Boolean).filter((a) => {
                    if (a.value_type === "TIER" || a.value_type === "ENUM") {
                      const allowed = a.allowed_values ?? [];
                      if (allowed.length > 0 && !allowed.includes(String(a.value ?? ""))) {
                        invalidEnumKeys.push(a.feature_key);
                        return false;
                      }
                    }
                    return true;
                  });
                  if (invalidEnumKeys.length > 0) {
                    toast.error(`Invalid value for: ${invalidEnumKeys.join(", ")}. Please select a valid option.`);
                    return;
                  }
                  await updateFeatures.mutateAsync({
                    planId: featurePlan.id,
                    planVersion: featurePlan.version || 1,
                    reason: featureReason,
                    assignments: validAssignments,
                  });
                  toast.success("Entitlements updated");
                  setFeaturePlan(null);
                }}
              >
                {updateFeatures.isPending ? "Saving…" : "Save entitlements"}
              </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(historyPlan)} onOpenChange={(open) => !open && setHistoryPlan(null)}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)]">
          <DialogHeader>
            <DialogTitle>{historyPlan?.name} version history</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            {history.isLoading ? <p className="text-sm text-[var(--text-tertiary)]">Loading immutable revisions…</p> : null}
            {history.isError ? <p className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">Version history is unavailable. No empty fallback was substituted.</p> : null}
            {history.data?.items.map((item, index) => {
              const previous = history.data?.items[index + 1];
              const currentAssignments = item.snapshot.assignments?.length ?? 0;
              const previousAssignments = previous?.snapshot.assignments?.length ?? 0;
              return (
                <article key={item.id} className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface-2)]/50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2"><b>Version {item.version}</b><span className="rounded-full border border-[var(--border-default)] px-2 py-0.5 text-[10px] uppercase">{item.lifecycle_status}</span></div>
                      <p className="mt-1 text-xs text-[var(--text-tertiary)]">{item.change_type.replaceAll("_", " ")} · {new Date(item.created_at).toLocaleString()}</p>
                    </div>
                    <span className="font-mono text-xs text-[var(--text-secondary)]">{currentAssignments} assignments{previous ? ` · ${currentAssignments - previousAssignments >= 0 ? "+" : ""}${currentAssignments - previousAssignments} vs v${previous.version}` : ""}</span>
                  </div>
                  <p className="mt-3 text-sm text-[var(--text-secondary)]">{item.reason}</p>
                </article>
              );
            })}
            {!history.isLoading && !history.isError && !history.data?.items.length ? <p className="text-sm text-[var(--text-tertiary)]">No immutable revisions are recorded.</p> : null}
          </div>
        </DialogContent>
      </Dialog>
      <EntitlementCatalogDialog open={catalogOpen} onOpenChange={setCatalogOpen} />
    </PageContainer>
  );
}

function PlanCard({
  plan,
  index,
  onEdit,
  onFeatures,
  onHistory,
}: {
  plan: SubscriptionPlan;
  index: number;
  onEdit: () => void;
  onFeatures: () => void;
  onHistory: () => void;
}) {
  const Icon = index === 0 ? Layers3 : index === 1 ? Sparkles : Crown;
  const typedEntitlements = useTypedPlanFeatures(plan.id);
  const highlights = (typedEntitlements.data?.items || [])
    .filter((item) => item.value !== false && item.value !== null && item.value !== undefined)
    .slice(0, 10)
    .map((item) => {
      const label = item.name || item.feature_key;
      if (item.value_type === "BOOLEAN") return label;
      const unit = item.unit ? ` ${item.unit}` : "";
      return `${label}: ${String(item.value)}${unit}`;
    });
  return (
    <article
      className={cn(
        "relative flex min-h-[560px] flex-col overflow-hidden rounded-3xl border bg-[var(--bg-surface)] transition-all duration-200 hover:-translate-y-1",
        plan.is_popular && "ring-1 ring-black/10 dark:ring-white/15",
      )}
      style={{ borderColor: `${plan.color_hex || "#6366F1"}55`, boxShadow: `0 18px 55px -32px ${plan.color_hex || "#6366F1"}` }}
    >
      <div className="absolute inset-x-0 top-0 h-24 bg-[linear-gradient(180deg,rgba(0,0,0,0.06),transparent)] dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.08),transparent)]" />
      <div className="relative flex flex-1 flex-col p-6">
        {plan.is_popular && (
          <span className="absolute right-5 top-5 rounded-full border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-[var(--text-primary)]">
            Recommended
          </span>
        )}
        <div className="mb-7 flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-[var(--text-primary)]">
          <Icon className="h-5 w-5" />
        </div>
        <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[var(--text-tertiary)]">
          Tier {String(index + 1).padStart(2, "0")}
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">
          {plan.name}
        </h2>
        <p className="mt-2 min-h-10 text-sm leading-5 text-[var(--text-secondary)]">
          {plan.tagline ||
            plan.description ||
            "A configurable enterprise service tier."}
        </p>
        <div className="my-6 border-y border-[var(--border-default)] py-5">
          <span className="font-mono text-2xl font-semibold text-[var(--text-primary)]">
            {plan.price_per_event
              ? formatExactINR(plan.price_per_event)
              : "Custom"}
          </span>
          <span className="ml-2 text-xs text-[var(--text-tertiary)]">
            {plan.price_per_event ? "/ event" : "pricing"}
          </span>
        </div>
        <ul className="space-y-3">
          {typedEntitlements.isLoading ? (
            <li className="text-sm text-[var(--text-tertiary)]">Loading typed entitlements…</li>
          ) : highlights.length === 0 ? (
            <li className="text-sm text-[var(--text-tertiary)]">No typed entitlements configured. This plan cannot be published.</li>
          ) : highlights.map((x) => (
            <li
              key={x}
              className="flex items-center gap-2.5 text-sm text-[var(--text-secondary)]"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-[var(--text-primary)]">
                <Check className="h-3 w-3" />
              </span>
              {x}
            </li>
          ))}
        </ul>
        <div className="mt-auto flex gap-2 pt-7">
          <Button
            onClick={onEdit}
            className="flex-1 bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90"
          >
            <Edit3 className="mr-2 h-4 w-4" />
            Edit plan
          </Button>
          <Button
            onClick={onFeatures}
            variant="outline"
            className="flex-1 border-[var(--border-default)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--bg-surface-2)]"
          >
            <ShieldCheck className="mr-2 h-4 w-4" />
            Entitlements
          </Button>
          <Button
            onClick={onHistory}
            variant="outline"
            size="icon"
            title="Version history"
            className="border-[var(--border-default)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--bg-surface-2)]"
          >
            <History className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-[var(--border-default)] bg-[var(--bg-surface-2)]/40 px-6 py-3 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
        <span>{plan.subscribers_count || 0} subscribers · v{plan.version || 1}</span>
        <span
          className={
            plan.is_active
              ? "text-[var(--text-primary)]"
              : "text-[var(--text-tertiary)]"
          }
        >
          {plan.lifecycle_status || (plan.is_active ? "PUBLISHED" : "DRAFT")}
        </span>
      </div>
    </article>
  );
}

function TypedAssignmentEditor({ value, onChange }: { value: TypedFeatureAssignment; onChange: (value: TypedFeatureAssignment) => void }) {
  return (
    <span className="mt-3 grid gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-2" onClick={(event) => event.stopPropagation()}>
      <span className="flex gap-2 text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]"><b>{value.value_type}</b><span>{value.scope_type}</span>{value.unit ? <span>{value.unit} / {value.period}</span> : null}</span>
      {value.value_type === "BOOLEAN" ? (
        <select value={String(Boolean(value.value))} onChange={(event) => onChange({ ...value, value: event.target.value === "true" })} className="rounded border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-1.5 text-xs"><option value="true">Enabled</option><option value="false">Disabled</option></select>
      ) : value.value_type === "TIER" || value.value_type === "ENUM" ? (
        <select value={String(value.value ?? "")} onChange={(event) => onChange({ ...value, value: event.target.value })} className="rounded border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-1.5 text-xs">{value.allowed_values?.map((option) => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}</select>
      ) : (
        <span className="grid grid-cols-2 gap-2"><Input aria-label={`${value.name} included limit`} type="number" min={0} value={Number(value.value ?? 0)} onChange={(event) => onChange({ ...value, value: Number(event.target.value) })} /><Input aria-label={`${value.name} hard ceiling`} type="number" min={0} placeholder="Hard ceiling" value={value.hard_ceiling ?? ""} onChange={(event) => onChange({ ...value, hard_ceiling: event.target.value === "" ? null : Number(event.target.value) })} /></span>
      )}
      <select value={value.enforcement_mode} onChange={(event) => onChange({ ...value, enforcement_mode: event.target.value as TypedFeatureAssignment["enforcement_mode"] })} className="rounded border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-1.5 text-xs"><option value="HARD">Hard enforcement</option><option value="SOFT_WARNING">Soft warning</option><option value="METERED_OVERAGE">Metered overage</option></select>
    </span>
  );
}
function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: any;
}) {
  return (
    <label className={wide ? "md:col-span-2" : ""}>
      <span className="mb-1.5 block text-xs font-semibold text-secondary">
        {label}
      </span>
      {children}
    </label>
  );
}
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium">
      <Switch checked={checked} onCheckedChange={onChange} />
      {label}
    </label>
  );
}
