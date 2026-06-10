"use client";

import { useState, useEffect } from "react";
import { useSubscriptionPlans, useCreatePlan, useUpdatePlan, useFeaturesCatalog, usePlanFeatures, useUpdatePlanFeatures, SubscriptionPlan } from "@/services/super-admin-service";
import { Sliders, Plus, Edit2, RefreshCw, CheckCircle2, XCircle, HardDrive, Users2, Calendar } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ── Plan Card ─────────────────────────────────────────────────

function PlanCard({ plan, onEdit }: { plan: SubscriptionPlan; onEdit: (p: SubscriptionPlan) => void }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/3 backdrop-blur-sm p-5 hover:border-white/10 transition-all group">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-black text-white">{plan.name}</p>
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${plan.is_active ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>
              {plan.is_active ? "ACTIVE" : "INACTIVE"}
            </span>
          </div>
          {plan.description && (
            <p className="text-[11px] text-white/30 mt-1">{plan.description}</p>
          )}
        </div>
        <button
          onClick={() => onEdit(plan)}
          className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/30 hover:text-white transition-all opacity-0 group-hover:opacity-100"
        >
          <Edit2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {[
          { label: "Max Events", value: plan.max_events, icon: Calendar },
          { label: "Max Users", value: plan.max_users, icon: Users2 },
          { label: "Max Registrations", value: plan.max_registrations.toLocaleString(), icon: Users2 },
          { label: "Storage", value: `${(plan.storage_quota_mb / 1024).toFixed(0)} GB`, icon: HardDrive },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl bg-white/3 border border-white/5 p-3">
            <p className="text-[9px] text-white/25 uppercase tracking-wider font-bold mb-1">{label}</p>
            <p className="text-[14px] font-black text-white/70 tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      {plan.stripe_product_id && (
        <p className="text-[10px] text-white/20 font-mono mt-3">Stripe: {plan.stripe_product_id}</p>
      )}
    </div>
  );
}

// ── Plan Form Dialog ──────────────────────────────────────────

const DEFAULT_PLAN: Partial<SubscriptionPlan> = {
  name: "", description: "", max_events: 3, max_users: 10,
  max_registrations: 1000, max_rooms: 10, storage_quota_mb: 10240, is_active: true,
};

function PlanFormDialog({
  plan, onClose,
}: {
  plan: Partial<SubscriptionPlan> | null;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Partial<SubscriptionPlan>>(plan || DEFAULT_PLAN);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const { mutateAsync: create, isPending: creating } = useCreatePlan();
  const { mutateAsync: update, isPending: updating } = useUpdatePlan();
  const { data: features = [] } = useFeaturesCatalog();
  const { data: planFeatures = [] } = usePlanFeatures((plan as SubscriptionPlan)?.id || "");
  const { mutateAsync: saveFeatures } = useUpdatePlanFeatures();
  
  const isEdit = !!(plan as any)?.id;
  const isPending = creating || updating;

  const planFeaturesStr = planFeatures?.join(",") || "";
  useEffect(() => {
    setSelectedFeatures(planFeatures || []);
  }, [planFeaturesStr]);

  if (!plan) return null;

  const handleSave = async () => {
    try {
      if (isEdit) {
        const planId = (plan as SubscriptionPlan).id;
        await update({ id: planId, ...form });
        await saveFeatures({ planId, featureKeys: selectedFeatures });
        toast.success("Plan updated");
      } else {
        const result = await create(form);
        const newPlanId = (result as any)?.id;
        if (newPlanId) {
          await saveFeatures({ planId: newPlanId, featureKeys: selectedFeatures });
        }
        toast.success("Plan created");
      }
      onClose();
    } catch {
      toast.error("Failed to save plan");
    }
  };

  const field = (label: string, key: keyof SubscriptionPlan, type: "text" | "number" = "text") => (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-widest text-white/30 block mb-1.5">{label}</label>
      <input
        type={type}
        value={form[key] as any || ""}
        onChange={(e) => setForm((prev) => ({ ...prev, [key]: type === "number" ? +e.target.value : e.target.value }))}
        className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500/40 transition-all"
      />
    </div>
  );

  const categories = Array.from(new Set(features.map(f => f.category)));

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0e0e14] shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
          <h3 className="text-sm font-black text-white">{isEdit ? "Edit Plan" : "Create Plan"}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {field("Name", "name")}
            {field("Description", "description")}
            {field("Max Events", "max_events", "number")}
            {field("Max Users", "max_users", "number")}
            {field("Max Registrations", "max_registrations", "number")}
            {field("Max Rooms", "max_rooms", "number")}
            {field("Storage Quota (MB)", "storage_quota_mb", "number")}
            {field("Stripe Product ID", "stripe_product_id")}
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="is_active"
              checked={!!form.is_active}
              onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
              className="rounded border-white/10 bg-white/5 text-violet-600 focus:ring-0 focus:ring-offset-0"
            />
            <label htmlFor="is_active" className="text-[12px] text-white/50 cursor-pointer">Active</label>
          </div>

          {/* Feature Checklist */}
          <div className="space-y-3 pt-3 border-t border-white/10">
            <h4 className="text-[11px] font-black uppercase tracking-wider text-violet-400">Feature Entitlements</h4>
            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1 no-scrollbar">
              {categories.map(cat => (
                <div key={cat} className="space-y-2">
                  <h5 className="text-[9px] font-black text-white/40 uppercase tracking-widest">{cat}</h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {features.filter(f => f.category === cat).map(f => {
                      const isChecked = selectedFeatures.includes(f.key);
                      return (
                        <label key={f.key} className={cn(
                          "flex items-start gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer select-none",
                          isChecked 
                            ? "bg-violet-500/10 border-violet-500/30 text-white" 
                            : "bg-white/3 border-white/5 text-white/40 hover:border-white/10 hover:text-white/60"
                        )}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedFeatures(prev => [...prev, f.key]);
                              } else {
                                setSelectedFeatures(prev => prev.filter(k => k !== f.key));
                              }
                            }}
                            className="mt-0.5 rounded border-white/10 bg-white/5 text-violet-600 focus:ring-0 focus:ring-offset-0"
                          />
                          <div>
                            <p className="text-xs font-bold leading-tight">{f.name}</p>
                            {f.description && (
                              <p className="text-[9px] opacity-60 mt-0.5 font-medium leading-normal">{f.description}</p>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm text-white/40 hover:text-white font-bold transition-all">Cancel</button>
            <button onClick={handleSave} disabled={isPending} className="flex-1 py-2.5 rounded-xl bg-violet-500/10 border border-violet-500/30 text-sm text-violet-400 hover:bg-violet-500/20 font-bold transition-all disabled:opacity-40">
              {isPending ? "Saving…" : "Save Plan"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Main Component ────────────────────────────────────────────

export default function SubscriptionPlansPage() {
  const { data: plans = [], isLoading } = useSubscriptionPlans();
  const [dialog, setDialog] = useState<Partial<SubscriptionPlan> | null>(null);

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-violet-500/10 border border-violet-500/20">
            <Sliders className="w-6 h-6 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Subscription Plans</h1>
            <p className="text-[11px] text-white/35">{plans.length} plans configured</p>
          </div>
        </div>
        <button
          onClick={() => setDialog(DEFAULT_PLAN)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-500/10 border border-violet-500/30 text-sm font-bold text-violet-400 hover:bg-violet-500/20 transition-all"
        >
          <Plus className="w-4 h-4" />
          Create Plan
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-white/30 text-sm p-8">
          <RefreshCw className="w-4 h-4 animate-spin" /> Loading plans…
        </div>
      ) : plans.length === 0 ? (
        <div className="p-10 text-center text-white/20 text-sm rounded-2xl border border-white/5 bg-white/3">
          No subscription plans yet.{" "}
          <button onClick={() => setDialog(DEFAULT_PLAN)} className="text-violet-400 underline">Create one</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} onEdit={setDialog} />
          ))}
        </div>
      )}

      <PlanFormDialog plan={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}
