"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Crown,
  Edit3,
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
  SubscriptionPlan,
  useCreatePlan,
  useFeatureMatrix,
  usePlanFeatures,
  useSubscriptionPlans,
  useUpdatePlan,
  useUpdatePlanFeatures,
} from "@/services/super-admin-service";

const fields: { key: keyof SubscriptionPlan; label: string }[] = [
  { key: "max_users", label: "Team members" },
  { key: "max_registrations", label: "Registrations" },
  { key: "max_speakers", label: "Speakers" },
  { key: "max_sessions", label: "Sessions" },
  { key: "max_rooms", label: "Rooms" },
  { key: "max_ticket_categories", label: "Ticket categories" },
  { key: "max_badge_templates", label: "Badge templates" },
  { key: "max_certificate_templates", label: "Certificate templates" },
  { key: "max_emails_per_event", label: "Emails / event" },
];

const blank: Partial<SubscriptionPlan> = {
  name: "",
  tagline: "",
  description: "",
  billing_model: "PER_EVENT",
  currency: "INR",
  price_per_event: 0,
  max_users: 5,
  max_registrations: 500,
  max_rooms: 2,
  max_emails_per_event: 10000,
  storage_quota_mb: 5120,
  display_order: 0,
  is_popular: false,
  is_active: true,
  color_hex: "#6366F1",
};

export default function PlansPage() {
  const { data: plans = [], isLoading } = useSubscriptionPlans();
  const { data: matrix = [] } = useFeatureMatrix();
  const createPlan = useCreatePlan();
  const updatePlan = useUpdatePlan();
  const updateFeatures = useUpdatePlanFeatures();
  const [editing, setEditing] = useState<SubscriptionPlan | null | undefined>(
    undefined,
  );
  const [form, setForm] = useState<Partial<SubscriptionPlan>>(blank);
  const [featurePlan, setFeaturePlan] = useState<SubscriptionPlan | null>(null);
  const { data: currentFeatures } = usePlanFeatures(featurePlan?.id || "");
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [catalogOpen, setCatalogOpen] = useState(false);
  useEffect(() => {
    if (featurePlan && currentFeatures) setSelectedFeatures(currentFeatures);
  }, [featurePlan, currentFeatures]);
  const sorted = useMemo(
    () =>
      [...plans].sort(
        (a, b) => (a.display_order || 0) - (b.display_order || 0),
      ),
    [plans],
  );
  const open = (plan?: SubscriptionPlan) => {
    setEditing(plan || null);
    setForm(plan ? { ...plan } : { ...blank, display_order: plans.length });
  };
  const save = async () => {
    if (!form.name?.trim()) return toast.error("Plan name is required");
    try {
      editing
        ? await updatePlan.mutateAsync({ id: editing.id, ...form })
        : await createPlan.mutateAsync(form);
      toast.success(editing ? "Plan updated" : "Plan created");
      setEditing(undefined);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Could not save plan");
    }
  };

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
              Add feature
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
              onFeatures={() => setFeaturePlan(p)}
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
              </div>
            </div>
            <div>
              <h3 className="mb-3 text-sm font-semibold">Capacity limits</h3>
              <div className="grid gap-3 md:grid-cols-3">
                {fields.map((f) => (
                  <Field key={f.key} label={f.label}>
                    <Input
                      type="number"
                      min={0}
                      value={(form[f.key] as number) ?? ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          [f.key]:
                            e.target.value === "" ? undefined : +e.target.value,
                        })
                      }
                    />
                  </Field>
                ))}
                <Field label="Storage (MB)">
                  <Input
                    type="number"
                    min={0}
                    value={form.storage_quota_mb ?? 0}
                    onChange={(e) =>
                      setForm({ ...form, storage_quota_mb: +e.target.value })
                    }
                  />
                </Field>
              </div>
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
              <div className="ml-auto flex gap-2">
                <Button variant="outline" onClick={() => setEditing(undefined)}>
                  Cancel
                </Button>
                <Button
                  onClick={save}
                  disabled={createPlan.isPending || updatePlan.isPending}
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
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)]">
          <DialogHeader>
            <DialogTitle>{featurePlan?.name} entitlements</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            {matrix.map((category) => (
              <section
                key={category.category}
                className="overflow-hidden rounded-2xl border border-[var(--border-default)]"
              >
                <div className="border-b border-[var(--border-default)] bg-[var(--bg-surface-2)] px-4 py-3">
                  <h3 className="text-sm font-semibold">
                    {category.category_name}
                  </h3>
                </div>
                <div className="grid md:grid-cols-2">
                  {category.features.map((f, idx) => (
                    <label
                      key={f.key}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 p-4 hover:bg-[var(--bg-surface-2)]/60",
                        idx % 2 === 0 &&
                        "md:border-r md:border-[var(--border-default)]",
                      )}
                    >
                      <button
                        onClick={() =>
                          setSelectedFeatures((s) =>
                            s.includes(f.key)
                              ? s.filter((x) => x !== f.key)
                              : [...s, f.key],
                          )
                        }
                        className={cn(
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                          selectedFeatures.includes(f.key)
                            ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                            : "border-[var(--border-default)]",
                        )}
                        aria-label={`Toggle ${f.name}`}
                      >
                        {selectedFeatures.includes(f.key) && (
                          <Check className="h-3 w-3" />
                        )}
                      </button>
                      <span>
                        <span className="block text-sm font-medium">
                          {f.name}
                        </span>
                        <span className="text-xs text-[var(--text-tertiary)]">
                          {f.description}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </section>
            ))}
            <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[var(--border-default)] bg-[var(--bg-surface)] py-4">
              <Button variant="outline" onClick={() => setFeaturePlan(null)}>
                Cancel
              </Button>
              <Button
                className="bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90"
                disabled={updateFeatures.isPending}
                onClick={async () => {
                  if (!featurePlan) return;
                  await updateFeatures.mutateAsync({
                    planId: featurePlan.id,
                    featureKeys: selectedFeatures,
                  });
                  toast.success("Entitlements updated");
                  setFeaturePlan(null);
                }}
              >
                {updateFeatures.isPending ? "Saving…" : "Save entitlements"}
              </Button>
            </div>
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
}: {
  plan: SubscriptionPlan;
  index: number;
  onEdit: () => void;
  onFeatures: () => void;
}) {
  const Icon = index === 0 ? Layers3 : index === 1 ? Sparkles : Crown;
  const highlights = [
    `${plan.max_users ?? "Unlimited"} team members`,
    `${plan.max_registrations ?? "Unlimited"} registrations`,
    `${plan.max_speakers ?? "Unlimited"} speakers`,
    `${plan.max_sessions ?? "Unlimited"} sessions`,
    `${plan.max_rooms ?? "Unlimited"} rooms`,
    `${plan.max_ticket_categories ?? "Unlimited"} ticket categories`,
    `${plan.max_badge_templates ?? "Unlimited"} badge templates`,
    `${plan.max_certificate_templates ?? "Unlimited"} certificate templates`,
    `${plan.max_emails_per_event ?? "Unlimited"} emails / event`,
    `${Math.round((plan.storage_quota_mb || 0) / 1024)} GB storage`,
  ];
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
              ? formatINR(plan.price_per_event)
              : "Custom"}
          </span>
          <span className="ml-2 text-xs text-[var(--text-tertiary)]">
            {plan.price_per_event ? "/ event" : "pricing"}
          </span>
        </div>
        <ul className="space-y-3">
          {highlights.map((x) => (
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
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-[var(--border-default)] bg-[var(--bg-surface-2)]/40 px-6 py-3 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
        <span>{plan.subscribers_count || 0} subscribers</span>
        <span
          className={
            plan.is_active
              ? "text-[var(--text-primary)]"
              : "text-[var(--text-tertiary)]"
          }
        >
          {plan.is_active ? "Active" : "Inactive"}
        </span>
      </div>
    </article>
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
