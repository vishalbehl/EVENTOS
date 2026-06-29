"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  useSubscriptionPlans, 
  useCreatePlan, 
  useUpdatePlanLimits, 
  useUpdatePlanFeaturesBulk, 
  useAdminSubscriptions,
  useFeatureMatrix,
  useAddons,
  useCreateAddon,
  useUpdateAddon,
  useFeaturesCatalog,
  usePlanFeatures,
  usePlatformApplications,
  SubscriptionPlan,
  Addon,
  FeatureMatrixCategory,
  PlatformApplication
} from "@/services/super-admin-service";
import {   
  Plus, CheckCircle2, XCircle, Edit3, Settings, RefreshCw, Layers
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";

// ── Validation Schema ──────────────────────────────────────────
const planSchema = z.object({
  name: z.string().min(1, "Plan name is required"),
  tagline: z.string().optional().default(""),
  description: z.string().optional().default(""),
  max_events: z.number().min(1, "Must be at least 1 event"),
  max_users: z.number().min(2, "Must be at least 2 users"),
  max_registrations: z.number().optional(),
  max_rooms: z.number().optional(),
  max_speakers: z.number().optional(),
  max_sessions: z.number().optional(),
  storage_quota_mb: z.number().min(1024, "Storage must be at least 1024 MB (1 GB)"),
  currency: z.string().default("INR"),
  price_per_event_min: z.number().min(0),
  price_per_event_max: z.number().optional(),
  billing_model: z.string().default("PER_EVENT"),
  display_order: z.number().default(0),
  is_popular: z.boolean().default(false),
  color_hex: z.string().default("#64748B"),
  razorpay_plan_id: z.string().optional().default(""),
  stripe_product_id: z.string().optional().default(""),
  stripe_price_id: z.string().optional().default(""),
  is_active: z.boolean().default(true),
});

type PlanFormData = z.infer<typeof planSchema>;

// ── Helpers ────────────────────────────────────────────────────
function formatINR(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function SubscriptionPlansPage() {
  const { data: rawPlans = [], isLoading, refetch } = useSubscriptionPlans();
  const { data: featureMatrixData } = useFeatureMatrix();
  const { data: addonsData } = useAddons();
  const { data: applicationsData } = usePlatformApplications();
  const { data: featuresCatalogData } = useFeaturesCatalog();

  const featureMatrix = featureMatrixData || [];
  const addons = addonsData || [];
  const applications = applicationsData || [];
  const featuresCatalog = featuresCatalogData || [];

  const createAddonMutation = useCreateAddon();
  const updateAddonMutation = useUpdateAddon();

  // Addon dialog state
  const [isAddonDialogOpen, setIsAddonDialogOpen] = useState(false);
  const [editingAddon, setEditingAddon] = useState<Addon | null>(null);

  const [addonName, setAddonName] = useState("");
  const [addonKey, setAddonKey] = useState("");
  const [addonDescription, setAddonDescription] = useState("");
  const [addonPrice, setAddonPrice] = useState<number>(0);
  const [addonMinPrice, setAddonMinPrice] = useState<number>(0);
  const [addonMaxPrice, setAddonMaxPrice] = useState<number>(0);
  const [addonBillingUnit, setAddonBillingUnit] = useState("PER_EVENT");
  const [addonIsActive, setAddonIsActive] = useState(true);
  const [addonAvailablePlans, setAddonAvailablePlans] = useState<string[]>([]);
  const [addonOptionalPlan, setAddonOptionalPlan] = useState("");
  const [addonIncludedPlan, setAddonIncludedPlan] = useState("");
  const [addonFeatureIds, setAddonFeatureIds] = useState<string[]>([]);
  const [addonFeaturesSpec, setAddonFeaturesSpec] = useState<{ category: string; feature: string; value: string; price?: number }[]>([]);

  const openManageAddonDialog = (addon: Addon | null) => {
    setEditingAddon(addon);
    if (addon) {
      setAddonName(addon.name);
      setAddonKey(addon.key);
      setAddonDescription(addon.description || "");
      setAddonPrice(addon.price_inr || 0);
      setAddonMinPrice(addon.min_price_inr || 0);
      setAddonMaxPrice(addon.max_price_inr || 0);
      setAddonBillingUnit(addon.billing_unit || "PER_EVENT");
      setAddonIsActive(addon.is_active);
      setAddonAvailablePlans(addon.available_for_plans || []);
      setAddonOptionalPlan(addon.is_optional_for_plan || "");
      setAddonIncludedPlan(addon.included_in_plan || "");
      setAddonFeatureIds(addon.feature_ids || []);
      setAddonFeaturesSpec(addon.features_spec || []);
    } else {
      setAddonName("");
      setAddonKey("");
      setAddonDescription("");
      setAddonPrice(0);
      setAddonMinPrice(0);
      setAddonMaxPrice(0);
      setAddonBillingUnit("PER_EVENT");
      setAddonIsActive(true);
      setAddonAvailablePlans([]);
      setAddonOptionalPlan("");
      setAddonIncludedPlan("");
      setAddonFeatureIds([]);
      setAddonFeaturesSpec([]);
    }
    setIsAddonDialogOpen(true);
  };

  const handleAddSpecRow = () => {
    setAddonFeaturesSpec(prev => [...prev, { category: "", feature: "", value: "", price: 0 }]);
  };

  const handleUpdateSpecRow = (
    index: number,
    field: "category" | "feature" | "value" | "price",
    val: string | number
  ) => {
    setAddonFeaturesSpec(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: val } as any;
      return next;
    });
  };

  const handleRemoveSpecRow = (index: number) => {
    setAddonFeaturesSpec(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveAddon = async () => {
    if (!addonName || !addonKey) {
      toast.error("Name and Key are required");
      return;
    }
    
    // Filter out rows that are entirely blank or have empty required fields to avoid garbage data
    const cleanedSpecs = addonFeaturesSpec
      .filter((spec) => spec.category.trim() !== "" && spec.feature.trim() !== "")
      .map((spec) => ({
        category: spec.category,
        feature: spec.feature,
        value: spec.value,
        price: spec.price || 0,
      }));

    const payload = {
      name: addonName,
      key: addonKey.toUpperCase().trim(),
      description: addonDescription,
      price_inr: addonPrice,
      min_price_inr: addonMinPrice,
      max_price_inr: addonMaxPrice,
      billing_unit: addonBillingUnit,
      available_for_plans: addonAvailablePlans,
      is_optional_for_plan: addonOptionalPlan || null,
      included_in_plan: addonIncludedPlan || null,
      is_active: addonIsActive,
      features_spec: cleanedSpecs,
    };

    try {
      if (editingAddon) {
        await updateAddonMutation.mutateAsync({
          addonId: editingAddon.id,
          data: payload
        });
        toast.success("Add-on updated successfully");
      } else {
        await createAddonMutation.mutateAsync(payload);
        toast.success("Add-on created successfully");
      }
      setIsAddonDialogOpen(false);
      refetch();
    } catch {
      toast.error("Failed to save add-on");
    }
  };

  const groupedFeatures = useMemo(() => {
    const groups: Record<string, any[]> = {};
    featuresCatalog.forEach((f) => {
      const cat = f.category || "Other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(f);
    });
    return groups;
  }, [featuresCatalog]);

  const plans = useMemo(() => {
    const defaultPlanNames = ["Basic", "Professional", "Enterprise"];
    return rawPlans
      .filter((p) => defaultPlanNames.includes(p.name))
      .sort((a, b) => a.display_order - b.display_order);
  }, [rawPlans]);

  // Selected Plan State
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  // Active category navigation keys
  const [activeCategoryKey, setActiveCategoryKey] = useState<string | null>(null);
  const [activeEditCategoryKey, setActiveEditCategoryKey] = useState<string | null>(null);

  useEffect(() => {
    if (plans.length > 0 && !selectedPlanId) {
      setSelectedPlanId(plans[0].id);
    }
  }, [plans, selectedPlanId]);

  useEffect(() => {
    if (featureMatrix.length > 0) {
      if (!activeCategoryKey) setActiveCategoryKey(featureMatrix[0].category);
      if (!activeEditCategoryKey) setActiveEditCategoryKey(featureMatrix[0].category);
    }
  }, [featureMatrix, activeCategoryKey, activeEditCategoryKey]);

  const selectedPlan = useMemo(() => {
    return plans.find(p => p.id === selectedPlanId) || null;
  }, [plans, selectedPlanId]);

  // Limits, Pricing & General editing states
  const [isEditingLimits, setIsEditingLimits] = useState(false);
  const [isEditingPricing, setIsEditingPricing] = useState(false);
  const [isGeneralDialogOpen, setIsGeneralDialogOpen] = useState(false);
  const [editingPlanData, setEditingPlanData] = useState<Partial<SubscriptionPlan> | null>(null);

  const startEditingLimits = () => {
    if (!selectedPlan) return;
    setEditingPlanData({
      max_events: selectedPlan.max_events,
      max_users: selectedPlan.max_users,
      max_registrations: selectedPlan.max_registrations,
      max_speakers: selectedPlan.max_speakers,
      max_sessions: selectedPlan.max_sessions,
      max_rooms: selectedPlan.max_rooms,
      max_ticket_categories: selectedPlan.max_ticket_categories,
      max_badge_templates: selectedPlan.max_badge_templates,
      max_certificate_templates: selectedPlan.max_certificate_templates,
      storage_quota_mb: selectedPlan.storage_quota_mb,
    });
    setIsEditingLimits(true);
  };

  const startEditingPricing = () => {
    if (!selectedPlan) return;
    setEditingPlanData({
      price_per_event_min: selectedPlan.price_per_event_min,
      price_per_event_max: selectedPlan.price_per_event_max,
      billing_model: selectedPlan.billing_model,
      currency: selectedPlan.currency,
    });
    setIsEditingPricing(true);
  };

  const startEditingGeneral = () => {
    if (!selectedPlan) return;
    setEditingPlanData({
      name: selectedPlan.name,
      tagline: selectedPlan.tagline || "",
      description: selectedPlan.description || "",
      color_hex: selectedPlan.color_hex || "#64748B",
      display_order: selectedPlan.display_order,
      is_popular: selectedPlan.is_popular,
      is_active: selectedPlan.is_active,
    });
    setIsGeneralDialogOpen(true);
  };

  const updateLimitsMutation = useUpdatePlanLimits();
  const createPlanMutation = useCreatePlan();

  const savePlanLimits = async () => {
    if (!selectedPlan || !editingPlanData) return;
    try {
      await updateLimitsMutation.mutateAsync({
        planId: selectedPlan.id,
        data: editingPlanData
      });
      toast.success("Plan limits updated successfully");
      setIsEditingLimits(false);
      setEditingPlanData(null);
      refetch();
    } catch {
      toast.error("Failed to update limits");
    }
  };

  const savePlanPricing = async () => {
    if (!selectedPlan || !editingPlanData) return;
    try {
      await updateLimitsMutation.mutateAsync({
        planId: selectedPlan.id,
        data: editingPlanData
      });
      toast.success("Plan pricing updated successfully");
      setIsEditingPricing(false);
      setEditingPlanData(null);
      refetch();
    } catch {
      toast.error("Failed to update pricing");
    }
  };

  const savePlanGeneralSettings = async () => {
    if (!selectedPlan || !editingPlanData) return;
    try {
      await updateLimitsMutation.mutateAsync({
        planId: selectedPlan.id,
        data: editingPlanData
      });
      toast.success("Plan general settings updated successfully");
      setIsGeneralDialogOpen(false);
      setEditingPlanData(null);
      refetch();
    } catch {
      toast.error("Failed to update general settings");
    }
  };

  // Configure Features Modal Popup states
  const [featurePlanId, setFeaturePlanId] = useState<string | null>(null);
  const [localFeatures, setLocalFeatures] = useState<string[]>([]);
  const { data: enabledFeatureKeys, isLoading: isLoadingPlanFeatures } = usePlanFeatures(featurePlanId || "");

  useEffect(() => {
    if (featurePlanId && enabledFeatureKeys) {
      setLocalFeatures(enabledFeatureKeys);
    }
  }, [enabledFeatureKeys, featurePlanId]);

  const updatePlanFeaturesMutation = useUpdatePlanFeaturesBulk();

  const toggleFeature = (key: string) => {
    setLocalFeatures((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleSaveFeatures = async () => {
    if (!featurePlanId) return;
    try {
      await updatePlanFeaturesMutation.mutateAsync({
        planId: featurePlanId,
        featureKeys: localFeatures,
      });
      toast.success("Plan features updated successfully");
      setFeaturePlanId(null);
      refetch();
    } catch {
      toast.error("Failed to update plan features");
    }
  };

  const [showCreatePanel, setShowCreatePanel] = useState(false);

  // Create Form
  const { register, handleSubmit, reset } = useForm<PlanFormData>({
    resolver: zodResolver(planSchema),
    defaultValues: {
      name: "", tagline: "", description: "", max_events: 1, max_users: 2,
      max_registrations: 150, max_rooms: 5, max_speakers: 30, max_sessions: 25,
      storage_quota_mb: 10240, currency: "INR", price_per_event_min: 15000,
      price_per_event_max: 25000, billing_model: "PER_EVENT", display_order: 1,
      is_popular: false, color_hex: "#64748B", is_active: true
    }
  });

  const handleCreateSubmitAction = async (data: PlanFormData) => {
    try {
      await createPlanMutation.mutateAsync(data);
      toast.success("Subscription plan created successfully");
      reset();
      setShowCreatePanel(false);
      refetch();
    } catch {
      toast.error("Failed to create plan");
    }
  };

  return (
    <PageContainer>
      <SectionHeader
        title="Plans Management"
        description="Create and manage subscription plans, limits, and features."
        actions={
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              onClick={() => refetch()} 
              className="border-border hover:bg-surface-hover/30"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 mr-2", isLoading && "animate-spin")} />
              Refresh
            </Button>
            <Button
              onClick={() => setShowCreatePanel(!showCreatePanel)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl px-4 py-2"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Create Plan
            </Button>
          </div>
        }
      />

      {/* Create Plan Panel */}
      {showCreatePanel && (
        <div className="bg-surface border border-border rounded-2xl p-6 mb-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-border/60">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Create Subscription Plan</h3>
            <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-semibold">Configure Settings</span>
          </div>

          <form onSubmit={handleSubmit(handleCreateSubmitAction)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">Plan Name *</label>
                <input
                  type="text"
                  {...register("name")}
                  className="w-full rounded-xl bg-surface-2 border border-border px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]"
                  placeholder="e.g., Starter, Professional, Enterprise"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">Tagline</label>
                <input
                  type="text"
                  {...register("tagline")}
                  className="w-full rounded-xl bg-surface-2 border border-border px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">Description</label>
                <input
                  type="text"
                  {...register("description")}
                  className="w-full rounded-xl bg-surface-2 border border-border px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">Price Min (INR) *</label>
                <input type="number" {...register("price_per_event_min", { valueAsNumber: true })} className="w-full rounded-xl bg-surface-2 border border-border px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">Price Max (INR)</label>
                <input type="number" {...register("price_per_event_max", { valueAsNumber: true })} className="w-full rounded-xl bg-surface-2 border border-border px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">Display Order</label>
                <input type="number" {...register("display_order", { valueAsNumber: true })} className="w-full rounded-xl bg-surface-2 border border-border px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">Color Hex</label>
                <input type="text" {...register("color_hex")} className="w-full rounded-xl bg-surface-2 border border-border px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]" placeholder="#7C3AED" />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-6 gap-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">Max Events</label>
                <input type="number" {...register("max_events", { valueAsNumber: true })} className="w-full rounded-xl bg-surface-2 border border-border px-3 py-2 text-xs text-[var(--text-primary)] outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">Max Users</label>
                <input type="number" {...register("max_users", { valueAsNumber: true })} className="w-full rounded-xl bg-surface-2 border border-border px-3 py-2 text-xs text-[var(--text-primary)] outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">Registrations</label>
                <input type="number" {...register("max_registrations", { valueAsNumber: true })} className="w-full rounded-xl bg-surface-2 border border-border px-3 py-2 text-xs text-[var(--text-primary)] outline-none" placeholder="Unlimited" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">Max Rooms</label>
                <input type="number" {...register("max_rooms", { valueAsNumber: true })} className="w-full rounded-xl bg-surface-2 border border-border px-3 py-2 text-xs text-[var(--text-primary)] outline-none" placeholder="Unlimited" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">Speakers</label>
                <input type="number" {...register("max_speakers", { valueAsNumber: true })} className="w-full rounded-xl bg-surface-2 border border-border px-3 py-2 text-xs text-[var(--text-primary)] outline-none" placeholder="Unlimited" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">Sessions</label>
                <input type="number" {...register("max_sessions", { valueAsNumber: true })} className="w-full rounded-xl bg-surface-2 border border-border px-3 py-2 text-xs text-[var(--text-primary)] outline-none" placeholder="Unlimited" />
              </div>
            </div>

            <div className="flex gap-4 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowCreatePanel(false)} className="flex-1 rounded-xl">Cancel</Button>
              <Button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl">Save Plan Tier</Button>
            </div>
          </form>
        </div>
      )}

      {/* Plan Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {plans.map((plan) => {
          const isSelected = selectedPlanId === plan.id;
          const isPopular = plan.is_popular;
          const displayPrice = plan.price_per_event_min 
            ? `${formatINR(plan.price_per_event_min)}` 
            : "Custom Pricing";

          return (
            <div
              key={plan.id}
              onClick={() => {
                setSelectedPlanId(plan.id);
                setIsEditingLimits(false);
              }}
              style={{ borderTop: `4px solid ${plan.color_hex || "#64748B"}` }}
              className={cn(
                "flex flex-col bg-surface border rounded-2xl overflow-hidden p-5 transition-all duration-200 cursor-pointer shadow-sm relative group hover:shadow-md hover:scale-[1.01]",
                isSelected ? "border-[var(--brand-primary)] ring-1 ring-[var(--brand-primary)]" : "border-border"
              )}
            >
              {isPopular && (
                <div className="absolute top-3 right-3 bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full text-[9px] font-extrabold tracking-wide uppercase">
                  Popular
                </div>
              )}

              {/* Title & Tagline */}
              <div className="mt-1 mb-2">
                <h3 className="text-sm font-black text-[var(--text-primary)] uppercase tracking-wider">{plan.name}</h3>
                <p className="text-[10px] text-[var(--text-tertiary)] line-clamp-1 mt-0.5">{plan.tagline || "Active Pricing Tier"}</p>
              </div>

              {/* Price */}
              <div className="my-2.5">
                <span className="text-xl font-black text-[var(--text-primary)]">{displayPrice}</span>
                <span className="text-[10px] text-[var(--text-tertiary)]"> / event</span>
                <p className="text-[10px] text-[var(--text-tertiary)] leading-normal mt-1">{plan.description || "Deploy with full core feature set"}</p>
              </div>

              {/* Metrics */}
              <div className="flex items-center justify-between py-3 border-t border-border/40 mt-auto">
                <div>
                  <p className="text-base font-black text-[var(--text-primary)] tabular-nums">{plan.subscribers_count || 0}</p>
                  <p className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-widest font-extrabold">Subscribers</p>
                </div>
                <div className="flex items-center gap-1 bg-emerald-500/5 text-emerald-400 px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase border border-emerald-500/10">
                  <span className="w-1 h-1 rounded-full bg-emerald-400"></span>
                  Active
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Split Layout: Comparison Table (60%) vs Plan Details (40%) */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
        
        {/* Left Column (60%): Feature Entitlements Comparison Matrix */}
        <div className="lg:col-span-6">
          {/* Display Comparison Table */}
          <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border/20">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">Plan Feature Comparison</h3>
                <p className="text-[10px] text-[var(--text-tertiary)]">Scope verification matrix across all active subscription packages.</p>
              </div>
            </div>
            
            {/* Category Navigation Menu Bar */}
            {featureMatrix.length > 0 && (
              <div className="flex flex-wrap gap-1 p-1 bg-surface-2 border border-border/60 rounded-xl w-fit mt-4">
                {featureMatrix.map((cat) => (
                  <button
                    key={cat.category}
                    onClick={() => setActiveCategoryKey(cat.category)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-150",
                      activeCategoryKey === cat.category
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-surface-3/60"
                    )}
                  >
                    {cat.category_name}
                  </button>
                ))}
              </div>
            )}

            <div className="border border-border/60 rounded-xl mt-4">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-surface/95 backdrop-blur z-10 border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">Features</th>
                    {plans.map(p => (
                      <th key={p.id} className="px-4 py-3 text-[10px] font-extrabold uppercase tracking-wider text-center text-[var(--text-secondary)]">
                        {p.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {(() => {
                    const activeCat = featureMatrix.find(c => c.category === activeCategoryKey);
                    if (!activeCat) return (
                      <tr>
                        <td colSpan={plans.length + 1} className="px-4 py-8 text-center text-xs text-[var(--text-tertiary)]">
                          Select a category from the tabs menu to see details.
                        </td>
                      </tr>
                    );
                    
                    return activeCat.features.map((f, fIdx) => (
                      <tr key={f.key} className={cn("hover:bg-surface-hover/20 transition-colors", fIdx % 2 === 0 ? "bg-surface" : "bg-surface-2/10")}>
                        <td className="px-4 py-2.5">
                          <p className="text-xs font-semibold text-[var(--text-primary)]">{f.name}</p>
                          {f.description && <p className="text-[9px] text-[var(--text-tertiary)] leading-tight mt-0.5">{f.description}</p>}
                        </td>
                        {plans.map(p => {
                          let val = "❌";
                          if (p.name === "Basic") val = f.display_basic;
                          else if (p.name === "Professional") val = f.display_professional;
                          else if (p.name === "Enterprise") val = f.display_enterprise;

                          const isCheck = val === "✔" || val === "✅" || val === "Yes";
                          const isCross = val === "❌" || val === "No" || val === "None";

                          return (
                            <td key={p.id} className="px-4 py-2.5 text-center text-xs font-medium text-[var(--text-secondary)]">
                              {isCheck ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 mx-auto" />
                              ) : isCross ? (
                                <XCircle className="w-4 h-4 text-red-400/50 mx-auto" />
                              ) : (
                                <span className="font-mono text-[11px] font-bold text-[var(--text-secondary)] bg-surface-2 px-2 py-0.5 rounded border border-border/40">
                                  {val}
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column (40%): Plan Details & Quotas */}
        <div className="lg:col-span-4">
          {selectedPlan ? (
            <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm">
              
              {/* Header inside Panel */}
              <div className="flex items-center justify-between pb-3 border-b border-border/40">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-white font-black uppercase text-xs animate-fade-in"
                    style={{ backgroundColor: selectedPlan.color_hex || "#64748B" }}
                  >
                    {selectedPlan.name.slice(0, 2)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-black text-[var(--text-primary)] uppercase tracking-wide">{selectedPlan.name}</h4>
                      <span className="text-[9px] px-1.5 py-0.2 rounded-full font-extrabold uppercase border border-border bg-surface-2 text-[var(--text-secondary)]">
                        {selectedPlan.billing_model}
                      </span>
                    </div>
                    <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
                      {selectedPlan.price_per_event_min ? `${formatINR(selectedPlan.price_per_event_min)} min` : "Custom Price"}
                    </p>
                  </div>
                </div>
                
                <Button
                  variant="outline"
                  onClick={startEditingGeneral}
                  className="text-xs px-3 py-1 h-8 border-border text-[var(--text-secondary)] hover:bg-surface-hover hover:text-[var(--text-primary)] rounded-xl font-bold flex items-center gap-1.5 transition-all shadow-sm"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Edit {selectedPlan.name}
                </Button>
              </div>

              {/* Editing Form vs Display Tabs */}
              {isEditingLimits && editingPlanData ? (
                <div className="space-y-4 animate-fade-in mt-4">
                  <div className="flex items-center justify-between pb-1 border-b border-border/40">
                    <span className="text-[10px] font-black text-[var(--text-primary)] uppercase tracking-wider">Edit Plan Limits: {selectedPlan.name}</span>
                  </div>

                  <div className="space-y-3">
                    {/* Numerical Quotas */}
                    <div className="bg-surface-2/40 border border-border/60 rounded-xl p-3 space-y-3">
                      <p className="text-[9px] font-black uppercase text-indigo-400 tracking-wider">Quotas & Allocations</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[9px] font-bold text-[var(--text-tertiary)] uppercase block mb-1">Max Events</label>
                          <input
                            type="number"
                            value={editingPlanData.max_events ?? ""}
                            onChange={(e) => setEditingPlanData(prev => prev ? { ...prev, max_events: parseInt(e.target.value) || 0 } : null)}
                            className="w-full rounded-lg bg-surface border border-border px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-[var(--text-tertiary)] uppercase block mb-1">Max Users</label>
                          <input
                            type="number"
                            value={editingPlanData.max_users ?? ""}
                            onChange={(e) => setEditingPlanData(prev => prev ? { ...prev, max_users: parseInt(e.target.value) || 0 } : null)}
                            className="w-full rounded-lg bg-surface border border-border px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-[var(--text-tertiary)] uppercase block mb-1">Registrations</label>
                          <input
                            type="number"
                            value={editingPlanData.max_registrations ?? ""}
                            onChange={(e) => setEditingPlanData(prev => prev ? { ...prev, max_registrations: e.target.value ? parseInt(e.target.value) : undefined } : null)}
                            className="w-full rounded-lg bg-surface border border-border px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500"
                            placeholder="Unlimited"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-[var(--text-tertiary)] uppercase block mb-1">Speakers</label>
                          <input
                            type="number"
                            value={editingPlanData.max_speakers ?? ""}
                            onChange={(e) => setEditingPlanData(prev => prev ? { ...prev, max_speakers: e.target.value ? parseInt(e.target.value) : undefined } : null)}
                            className="w-full rounded-lg bg-surface border border-border px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500"
                            placeholder="Unlimited"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-[var(--text-tertiary)] uppercase block mb-1">Sessions</label>
                          <input
                            type="number"
                            value={editingPlanData.max_sessions ?? ""}
                            onChange={(e) => setEditingPlanData(prev => prev ? { ...prev, max_sessions: e.target.value ? parseInt(e.target.value) : undefined } : null)}
                            className="w-full rounded-lg bg-surface border border-border px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500"
                            placeholder="Unlimited"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-[var(--text-tertiary)] uppercase block mb-1">Rooms</label>
                          <input
                            type="number"
                            value={editingPlanData.max_rooms ?? ""}
                            onChange={(e) => setEditingPlanData(prev => prev ? { ...prev, max_rooms: e.target.value ? parseInt(e.target.value) : undefined } : null)}
                            className="w-full rounded-lg bg-surface border border-border px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500"
                            placeholder="Unlimited"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-[var(--text-tertiary)] uppercase block mb-1">Ticket Categories</label>
                          <input
                            type="number"
                            value={editingPlanData.max_ticket_categories ?? ""}
                            onChange={(e) => setEditingPlanData(prev => prev ? { ...prev, max_ticket_categories: e.target.value ? parseInt(e.target.value) : undefined } : null)}
                            className="w-full rounded-lg bg-surface border border-border px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500"
                            placeholder="Unlimited"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-[var(--text-tertiary)] uppercase block mb-1">Badge Templates</label>
                          <input
                            type="number"
                            value={editingPlanData.max_badge_templates ?? ""}
                            onChange={(e) => setEditingPlanData(prev => prev ? { ...prev, max_badge_templates: e.target.value ? parseInt(e.target.value) : undefined } : null)}
                            className="w-full rounded-lg bg-surface border border-border px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500"
                            placeholder="Unlimited"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-[var(--text-tertiary)] uppercase block mb-1">Cert Templates</label>
                          <input
                            type="number"
                            value={editingPlanData.max_certificate_templates ?? ""}
                            onChange={(e) => setEditingPlanData(prev => prev ? { ...prev, max_certificate_templates: e.target.value ? parseInt(e.target.value) : undefined } : null)}
                            className="w-full rounded-lg bg-surface border border-border px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500"
                            placeholder="Unlimited"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="text-[9px] font-bold text-[var(--text-tertiary)] uppercase block mb-1">Storage Quota (MB)</label>
                          <input
                            type="number"
                            value={editingPlanData.storage_quota_mb ?? ""}
                            onChange={(e) => setEditingPlanData(prev => prev ? { ...prev, storage_quota_mb: parseInt(e.target.value) || 0 } : null)}
                            className="w-full rounded-lg bg-surface border border-border px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions inside edit limits state */}
                  <div className="flex items-center gap-3 pt-2 border-t border-border/40 mt-4">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsEditingLimits(false);
                        setEditingPlanData(null);
                      }}
                      className="flex-1 rounded-xl text-xs h-9 border-border text-[var(--text-secondary)] hover:bg-surface-hover hover:text-[var(--text-primary)] font-semibold"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={savePlanLimits}
                      disabled={updateLimitsMutation.isPending}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs h-9 shadow-md"
                    >
                      {updateLimitsMutation.isPending ? "Saving..." : "Save Limits"}
                    </Button>
                  </div>
                </div>
              ) : isEditingPricing && editingPlanData ? (
                <div className="space-y-4 animate-fade-in mt-4">
                  <div className="flex items-center justify-between pb-1 border-b border-border/40">
                    <span className="text-[10px] font-black text-[var(--text-primary)] uppercase tracking-wider">Edit Plan Pricing: {selectedPlan.name}</span>
                  </div>

                  <div className="space-y-3">
                    {/* Pricing Config */}
                    <div className="bg-surface-2/40 border border-border/60 rounded-xl p-3 space-y-3">
                      <p className="text-[9px] font-black uppercase text-indigo-400 tracking-wider">Pricing Configuration</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[9px] font-bold text-[var(--text-tertiary)] uppercase block mb-1">Min Price (INR)</label>
                          <input
                            type="number"
                            value={editingPlanData.price_per_event_min ?? 0}
                            onChange={(e) => setEditingPlanData(prev => prev ? { ...prev, price_per_event_min: parseInt(e.target.value) || 0 } : null)}
                            className="w-full rounded-lg bg-surface border border-border px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-[var(--text-tertiary)] uppercase block mb-1">Max Price (INR)</label>
                          <input
                            type="number"
                            value={editingPlanData.price_per_event_max ?? ""}
                            onChange={(e) => setEditingPlanData(prev => prev ? { ...prev, price_per_event_max: e.target.value ? parseInt(e.target.value) : undefined } : null)}
                            className="w-full rounded-lg bg-surface border border-border px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500"
                            placeholder="None"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-[var(--text-tertiary)] uppercase block mb-1">Billing Model</label>
                          <select
                            value={editingPlanData.billing_model || "PER_EVENT"}
                            onChange={(e) => setEditingPlanData(prev => prev ? { ...prev, billing_model: e.target.value } : null)}
                            className="w-full rounded-lg bg-surface border border-border px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500"
                          >
                            <option value="PER_EVENT">PER_EVENT</option>
                            <option value="PER_MONTH">PER_MONTH</option>
                            <option value="CUSTOM">CUSTOM</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-[var(--text-tertiary)] uppercase block mb-1">Currency</label>
                          <input
                            type="text"
                            value={editingPlanData.currency || "INR"}
                            onChange={(e) => setEditingPlanData(prev => prev ? { ...prev, currency: e.target.value } : null)}
                            className="w-full rounded-lg bg-surface border border-border px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions inside edit pricing state */}
                  <div className="flex items-center gap-3 pt-2 border-t border-border/40 mt-4">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsEditingPricing(false);
                        setEditingPlanData(null);
                      }}
                      className="flex-1 rounded-xl text-xs h-9 border-border text-[var(--text-secondary)] hover:bg-surface-hover hover:text-[var(--text-primary)] font-semibold"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={savePlanPricing}
                      disabled={updateLimitsMutation.isPending}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs h-9 shadow-md"
                    >
                      {updateLimitsMutation.isPending ? "Saving..." : "Save Pricing"}
                    </Button>
                  </div>
                </div>
              ) : (
                // Display Mode
                <Tabs defaultValue="limits" className="w-full mt-4">
                  <TabsList className="w-full grid grid-cols-2 rounded-xl bg-surface-2 p-1 border border-border/40 h-10">
                    <TabsTrigger value="limits" className="text-[10px] font-extrabold uppercase tracking-widest rounded-lg py-1.5">Limits</TabsTrigger>
                    <TabsTrigger value="pricing" className="text-[10px] font-extrabold uppercase tracking-widest rounded-lg py-1.5">Pricing</TabsTrigger>
                  </TabsList>

                  <TabsContent value="limits" className="focus-visible:outline-none mt-4">
                    <div className="divide-y divide-border/40 border border-border/60 rounded-xl bg-surface-2/10">
                      {[
                        { label: "Max Events", val: selectedPlan.max_events },
                        { label: "Max Users", val: selectedPlan.max_users },
                        { label: "Registrations / Event", val: selectedPlan.max_registrations ?? "Unlimited" },
                        { label: "Storage Capacity", val: `${(selectedPlan.storage_quota_mb / 1024).toFixed(0)} GB` },
                        { label: "Max Speakers", val: selectedPlan.max_speakers ?? "Unlimited" },
                        { label: "Max Sessions", val: selectedPlan.max_sessions ?? "Unlimited" },
                        { label: "Max Rooms", val: selectedPlan.max_rooms ?? "Unlimited" },
                        { label: "Ticket Categories", val: selectedPlan.max_ticket_categories ?? "Unlimited" },
                        { label: "Badge Templates", val: selectedPlan.max_badge_templates ?? "Unlimited" },
                        { label: "Certificate Templates", val: selectedPlan.max_certificate_templates ?? "Unlimited" },
                      ].map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center px-4 py-2.5 text-xs">
                          <span className="font-semibold text-[var(--text-secondary)]">{item.label}</span>
                          <span className="font-mono font-bold text-[var(--text-primary)]">{item.val}</span>
                        </div>
                      ))}
                    </div>
                    {/* bottom actions when displaying limits */}
                    <div className="pt-4 border-t border-border/40 mt-4 flex flex-col gap-3">
                      <Button
                        variant="outline"
                        onClick={startEditingLimits}
                        className="w-full rounded-xl text-xs h-9 border-border text-[var(--text-secondary)] hover:bg-surface-hover hover:text-[var(--text-primary)] font-bold flex items-center justify-center gap-1.5"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Edit Limits
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setFeaturePlanId(selectedPlan.id)}
                        className="w-full rounded-xl text-xs h-9 border-border text-[var(--text-secondary)] hover:bg-surface-hover hover:text-[var(--text-primary)] font-bold flex items-center justify-center gap-1.5"
                      >
                        <Settings className="w-3.5 h-3.5" />
                        Configure Features
                      </Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="pricing" className="focus-visible:outline-none mt-4">
                    <div className="divide-y divide-border/40 border border-border/60 rounded-xl bg-surface-2/10">
                      {[
                        { label: "Billing Model", val: selectedPlan.billing_model },
                        { label: "Currency", val: selectedPlan.currency },
                        { label: "Min Event Price", val: selectedPlan.price_per_event_min ? formatINR(selectedPlan.price_per_event_min) : "Free" },
                        { label: "Max Event Price", val: selectedPlan.price_per_event_max ? formatINR(selectedPlan.price_per_event_max) : "Custom" },
                      ].map((item, idx) => (
                        <div key={idx} className="flex flex-col px-4 py-2.5 gap-0.5 text-xs">
                          <span className="font-semibold text-[var(--text-secondary)]">{item.label}</span>
                          <span className="font-bold text-[var(--text-primary)] mt-0.5 break-all">
                            {item.val}
                          </span>
                        </div>
                      ))}
                    </div>
                    {/* bottom actions when displaying pricing */}
                    <div className="pt-4 border-t border-border/40 mt-4">
                      <Button
                        variant="outline"
                        onClick={startEditingPricing}
                        className="w-full rounded-xl text-xs h-9 border-border text-[var(--text-secondary)] hover:bg-surface-hover hover:text-[var(--text-primary)] font-bold flex items-center justify-center gap-1.5"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Edit Pricing
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>
              )}
            </div>
          ) : (
            <div className="bg-surface border border-border rounded-2xl p-8 text-center text-xs text-[var(--text-tertiary)] min-h-[300px] flex items-center justify-center">
              No plan selected. Click on a plan card to inspect settings.
            </div>
          )}
        </div>
      </div>




      {/* Add-ons Section */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm mt-8 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">Optional Add-ons</h3>
            <p className="text-[10px] text-[var(--text-tertiary)]">Additional packages and services available for conference configuration.</p>
          </div>
          <Button
            onClick={() => openManageAddonDialog(null)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl px-4 py-2 h-9"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add Add-on
          </Button>
        </div>
        
        {addons.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl p-8 text-center text-xs text-[var(--text-tertiary)]">
            No platform add-ons found. Click "Add Add-on" to create one.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {addons.map(a => (
              <div key={a.id} className="border border-border rounded-xl p-4 bg-surface-2/40 flex flex-col justify-between hover:border-border/80 transition-all relative group">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-xs font-bold text-[var(--text-primary)]">{a.name}</h4>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[8px] uppercase font-semibold border-indigo-500/20 text-indigo-400 bg-indigo-500/5">
                        Add-on
                      </Badge>
                      <button
                        onClick={() => openManageAddonDialog(a)}
                        className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] p-1 rounded-md hover:bg-surface-3 transition-colors"
                        title="Edit Add-on"
                      >
                        <Edit3 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed mb-3">{a.description}</p>
                  
                  {a.features_spec && a.features_spec.length > 0 && (
                    <details className="mt-3 text-[10px] border border-border/40 rounded-lg bg-surface-2/60 transition-all group/details">
                      <summary className="px-2.5 py-1.5 font-bold text-[9px] uppercase tracking-wider text-[var(--text-secondary)] cursor-pointer select-none hover:bg-surface-3/50 flex items-center justify-between">
                        <span>Configuration Matrix</span>
                        <span className="text-[8px] px-1.5 py-0.2 rounded-full border border-border bg-surface font-mono text-[var(--text-tertiary)] group-open/details:hidden">
                          {a.features_spec.length} items
                        </span>
                      </summary>
                      <div className="p-2 border-t border-border/40 space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                        {Object.entries(
                          (a.features_spec || []).reduce((acc, curr) => {
                            const cat = curr.category || "General";
                            if (!acc[cat]) acc[cat] = [];
                            acc[cat].push(curr);
                            return acc;
                          }, {} as Record<string, { category: string; feature: string; value: string; price?: number }[]>)
                        ).map(([cat, specs]) => (
                          <div key={cat} className="space-y-1">
                            <div className="font-extrabold text-[8px] text-indigo-400 uppercase tracking-widest">{cat}</div>
                            <div className="space-y-0.5 divide-y divide-border/20">
                              {specs.map((spec, specIdx) => (
                                <div key={specIdx} className="flex justify-between py-1 text-[9px]">
                                  <span className="text-[var(--text-secondary)] font-medium">{spec.feature}</span>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[var(--text-primary)] font-semibold font-mono">{spec.value}</span>
                                    {spec.price !== undefined && spec.price > 0 && (
                                      <span className="text-emerald-400 font-bold font-mono text-[8px]">(+₹{spec.price.toLocaleString()})</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
                <div className="border-t border-border/40 pt-3 flex flex-col gap-1 mt-auto">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-[var(--text-primary)]">
                        {a.price_inr ? `₹${a.price_inr.toLocaleString()}` : "Custom Price"}
                        {a.billing_unit && <span className="text-[9px] font-normal text-[var(--text-tertiary)]"> / {a.billing_unit.replace('_', ' ').toLowerCase()}</span>}
                      </span>
                      {((a.min_price_inr !== undefined && a.min_price_inr > 0) || (a.max_price_inr !== undefined && a.max_price_inr > 0)) && (
                        <span className="text-[9px] text-[var(--text-tertiary)] font-medium mt-0.5">
                          Range: ₹{a.min_price_inr?.toLocaleString() || 0} - ₹{a.max_price_inr?.toLocaleString() || "Max"}
                        </span>
                      )}
                    </div>
                    <Badge variant={a.is_active ? "default" : "secondary"} className="text-[8px] h-4">
                      {a.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1 items-center justify-between mt-1 text-[9px] text-[var(--text-tertiary)] font-medium">
                    <span>Plans: {a.available_for_plans.length > 0 ? a.available_for_plans.join(", ") : "None"}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Core Platform Applications Registry */}
      {applications.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm mt-8 space-y-4">
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">Platform Applications & Core Registry</h3>
            <p className="text-[10px] text-[var(--text-tertiary)]">Integrated applications and functional modules enabled globally.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {applications.map(app => (
              <div key={app.id} className="border border-border rounded-xl p-4 bg-surface-2/40 flex flex-col justify-between hover:border-border/80 transition-all">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-xs font-bold text-[var(--text-primary)]">{app.name}</h4>
                    <Badge variant="outline" className={cn(
                      "text-[8px] uppercase font-semibold",
                      app.status === "active" 
                        ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/5"
                        : "border-amber-500/30 text-amber-400 bg-amber-500/5"
                    )}>
                      {app.status}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed mb-3">{app.description}</p>
                </div>
                <div className="border-t border-border/40 pt-3 flex items-center justify-between mt-auto">
                  <span className="text-[9px] text-[var(--text-tertiary)] font-medium uppercase tracking-wider">
                    Category: {app.category}
                  </span>
                  <span className="text-[9px] text-[var(--text-tertiary)] font-medium">
                    v{app.version}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit General Settings Dialog Modal */}
      <Dialog open={isGeneralDialogOpen} onOpenChange={setIsGeneralDialogOpen}>
        <DialogContent className="max-w-md bg-surface border border-border text-[var(--text-primary)] shadow-2xl p-6 rounded-2xl">
          <DialogHeader className="pb-4 border-b border-border/60">
            <DialogTitle className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-indigo-400" />
              Edit General Settings: {selectedPlan?.name}
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--text-tertiary)]">
              Modify the public-facing name, tagline, description, color tag, active status, and popularity badge for this plan tier.
            </DialogDescription>
          </DialogHeader>

          {editingPlanData && (
            <div className="space-y-4 py-2">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">Plan Name *</label>
                <input
                  type="text"
                  value={editingPlanData.name || ""}
                  onChange={(e) => setEditingPlanData(prev => prev ? { ...prev, name: e.target.value } : null)}
                  className="w-full rounded-xl bg-surface-2 border border-border px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">Tagline</label>
                <input
                  type="text"
                  value={editingPlanData.tagline || ""}
                  onChange={(e) => setEditingPlanData(prev => prev ? { ...prev, tagline: e.target.value } : null)}
                  className="w-full rounded-xl bg-surface-2 border border-border px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">Description</label>
                <textarea
                  value={editingPlanData.description || ""}
                  onChange={(e) => setEditingPlanData(prev => prev ? { ...prev, description: e.target.value } : null)}
                  className="w-full rounded-xl bg-surface-2 border border-border px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500 min-h-[70px]"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">Plan Theme Color</label>
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded-lg border border-border flex-shrink-0"
                    style={{ backgroundColor: editingPlanData.color_hex || "#64748B" }}
                  />
                  <input
                    type="color"
                    value={editingPlanData.color_hex || "#64748B"}
                    onChange={(e) => setEditingPlanData(prev => prev ? { ...prev, color_hex: e.target.value } : null)}
                    className="w-8 h-8 p-0 border-0 rounded-lg cursor-pointer bg-transparent"
                  />
                  <input
                    type="text"
                    value={editingPlanData.color_hex || ""}
                    onChange={(e) => setEditingPlanData(prev => prev ? { ...prev, color_hex: e.target.value } : null)}
                    placeholder="#64748B"
                    className="w-full rounded-xl bg-surface-2 border border-border px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">Display Order</label>
                  <input
                    type="number"
                    value={editingPlanData.display_order ?? 0}
                    onChange={(e) => setEditingPlanData(prev => prev ? { ...prev, display_order: parseInt(e.target.value) || 0 } : null)}
                    className="w-full rounded-xl bg-surface-2 border border-border px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">Highlight Popular</label>
                  <div className="flex items-center h-8">
                    <Switch
                      checked={editingPlanData.is_popular || false}
                      onCheckedChange={(val) => setEditingPlanData(prev => prev ? { ...prev, is_popular: val } : null)}
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-surface-2 border border-border rounded-xl mt-2">
                <span className="text-xs font-bold text-[var(--text-secondary)]">Is Plan Active</span>
                <Switch
                  checked={editingPlanData.is_active}
                  onCheckedChange={(val) => setEditingPlanData(prev => prev ? { ...prev, is_active: val } : null)}
                />
              </div>
            </div>
          )}

          <DialogFooter className="pt-4 border-t border-border/60 flex items-center justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsGeneralDialogOpen(false);
                setEditingPlanData(null);
              }}
              className="text-xs border-border hover:bg-surface-hover hover:text-[var(--text-primary)] font-semibold rounded-xl"
            >
              Cancel
            </Button>
            <Button
              onClick={savePlanGeneralSettings}
              disabled={updateLimitsMutation.isPending}
              className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md rounded-xl h-9 px-4"
            >
              {updateLimitsMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Manage Add-on Dialog Modal (Create / Edit) */}
      <Dialog open={isAddonDialogOpen} onOpenChange={(open) => { if (!open) setIsAddonDialogOpen(false); }}>
        <DialogContent className="max-w-4xl bg-surface border border-border text-[var(--text-primary)] shadow-2xl p-6 rounded-2xl">
          <DialogHeader className="pb-4 border-b border-border/60">
            <DialogTitle className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-400" />
              {editingAddon ? "Edit Platform Add-on" : "Create New Add-on"}
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--text-tertiary)]">
              {editingAddon ? "Modify pricing plans, active status, and feature associations for this optional add-on." : "Add a new pricing add-on packages to allow tenant self-serve upgrades."}
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="basic-info" className="w-full">
            <TabsList className="w-full grid grid-cols-2 rounded-xl bg-surface-2 p-1 border border-border/40 h-10 mb-4">
              <TabsTrigger value="basic-info" className="text-[10px] font-extrabold uppercase tracking-widest rounded-lg py-1.5">Basic Info & Features</TabsTrigger>
              <TabsTrigger value="config-matrix" className="text-[10px] font-extrabold uppercase tracking-widest rounded-lg py-1.5">Configuration Matrix</TabsTrigger>
            </TabsList>

            <TabsContent value="basic-info" className="focus-visible:outline-none">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-2 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                {/* Left Column: Details & General */}
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">Add-on Name *</label>
                    <input
                      type="text"
                      value={addonName}
                      onChange={(e) => setAddonName(e.target.value)}
                      className="w-full rounded-xl bg-surface-2 border border-border px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500"
                      placeholder="e.g. WhatsApp Broadcasts"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">Add-on Key (Unique, Uppercase) *</label>
                    <input
                      type="text"
                      value={addonKey}
                      onChange={(e) => setAddonKey(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
                      disabled={!!editingAddon}
                      className="w-full rounded-xl bg-surface-2 border border-border px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500 font-mono disabled:opacity-50"
                      placeholder="e.g. ADDON_WHATSAPP"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">Description</label>
                    <textarea
                      value={addonDescription}
                      onChange={(e) => setAddonDescription(e.target.value)}
                      className="w-full rounded-xl bg-surface-2 border border-border px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500 min-h-[120px]"
                      placeholder="Describe what this add-on unlocks..."
                    />
                  </div>
                </div>

                {/* Right Column: Pricing & Eligibility */}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">Price (INR)</label>
                      <input
                        type="number"
                        value={addonPrice}
                        onChange={(e) => setAddonPrice(parseInt(e.target.value) || 0)}
                        className="w-full rounded-xl bg-surface-2 border border-border px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">Billing Unit</label>
                      <select
                        value={addonBillingUnit}
                        onChange={(e) => setAddonBillingUnit(e.target.value)}
                        className="w-full rounded-xl bg-surface-2 border border-border px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500"
                      >
                        <option value="PER_EVENT">PER_EVENT</option>
                        <option value="PER_MONTH">PER_MONTH</option>
                        <option value="CUSTOM">CUSTOM</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">Min Price (INR)</label>
                      <input
                        type="number"
                        value={addonMinPrice}
                        onChange={(e) => setAddonMinPrice(parseInt(e.target.value) || 0)}
                        className="w-full rounded-xl bg-surface-2 border border-border px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">Max Price (INR)</label>
                      <input
                        type="number"
                        value={addonMaxPrice}
                        onChange={(e) => setAddonMaxPrice(parseInt(e.target.value) || 0)}
                        className="w-full rounded-xl bg-surface-2 border border-border px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-surface-2 border border-border rounded-xl">
                    <span className="text-xs font-bold text-[var(--text-secondary)]">Is Active / Listed</span>
                    <Switch
                      checked={addonIsActive}
                      onCheckedChange={setAddonIsActive}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-tertiary)] block">Eligible / Available for Plans</label>
                    <div className="flex flex-wrap gap-2">
                      {["Basic", "Professional", "Enterprise"].map((planName) => {
                        const isChecked = addonAvailablePlans.includes(planName);
                        return (
                          <button
                            key={planName}
                            type="button"
                            onClick={() => {
                              setAddonAvailablePlans(prev =>
                                prev.includes(planName)
                                  ? prev.filter(p => p !== planName)
                                  : [...prev, planName]
                              );
                            }}
                            className={cn(
                              "px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all",
                              isChecked
                                ? "bg-indigo-600/10 border-indigo-500 text-indigo-400"
                                : "bg-surface-2 border-border text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                            )}
                          >
                            {planName}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">Optional Overrides</label>
                      <select
                        value={addonOptionalPlan}
                        onChange={(e) => setAddonOptionalPlan(e.target.value)}
                        className="w-full rounded-xl bg-surface-2 border border-border px-3 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500"
                      >
                        <option value="">None (Standard Optional)</option>
                        <option value="Basic">Optional for Basic</option>
                        <option value="Professional">Optional for Professional</option>
                        <option value="Enterprise">Optional for Enterprise</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">Included Overrides</label>
                      <select
                        value={addonIncludedPlan}
                        onChange={(e) => setAddonIncludedPlan(e.target.value)}
                        className="w-full rounded-xl bg-surface-2 border border-border px-3 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500"
                      >
                        <option value="">None (Always Optional)</option>
                        <option value="Basic">Included in Basic</option>
                        <option value="Professional">Included in Professional</option>
                        <option value="Enterprise">Included in Enterprise</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="config-matrix" className="focus-visible:outline-none">
              <div className="space-y-4 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[var(--text-tertiary)]">Configure specifications for this add-on to show in the matrix.</span>
                  <Button
                    type="button"
                    onClick={handleAddSpecRow}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl px-3 py-1.5 h-8"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Add Specification Row
                  </Button>
                </div>

                {addonFeaturesSpec.length === 0 ? (
                  <div className="border border-dashed border-border rounded-xl p-8 text-center text-xs text-[var(--text-tertiary)] bg-surface-2/10">
                    No specifications configured. Click "Add Specification Row" to begin.
                  </div>
                ) : (
                  <div className="border border-border/60 rounded-xl overflow-hidden bg-surface-2/40 max-h-[45vh] overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-surface z-10 border-b border-border">
                        <tr>
                          <th className="px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] w-1/4">Category</th>
                          <th className="px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] w-1/4">Feature Name</th>
                          <th className="px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] w-1/6">Value / Option</th>
                          <th className="px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] w-1/6">Price (INR)</th>
                          <th className="px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] text-center w-12">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {addonFeaturesSpec.map((spec, index) => (
                          <tr key={index} className="hover:bg-surface-hover/10 transition-colors">
                            <td className="p-2">
                              <input
                                type="text"
                                value={spec.category}
                                onChange={(e) => handleUpdateSpecRow(index, "category", e.target.value)}
                                placeholder="e.g. Notifications"
                                className="w-full rounded-lg bg-surface border border-border px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={spec.feature}
                                onChange={(e) => handleUpdateSpecRow(index, "feature", e.target.value)}
                                placeholder="e.g. Bulk Broadcast"
                                className="w-full rounded-lg bg-surface border border-border px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={spec.value}
                                onChange={(e) => handleUpdateSpecRow(index, "value", e.target.value)}
                                placeholder="e.g. Included"
                                className="w-full rounded-lg bg-surface border border-border px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                value={spec.price || 0}
                                onChange={(e) => handleUpdateSpecRow(index, "price", parseInt(e.target.value) || 0)}
                                placeholder="0"
                                className="w-full rounded-lg bg-surface border border-border px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500"
                              />
                            </td>
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveSpecRow(index)}
                                className="text-red-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                                title="Remove Row"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="pt-4 border-t border-border/60 flex items-center justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setIsAddonDialogOpen(false)}
              className="text-xs border-border hover:bg-surface-hover hover:text-[var(--text-primary)] font-semibold rounded-xl"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveAddon}
              disabled={createAddonMutation.isPending || updateAddonMutation.isPending}
              className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md rounded-xl h-9 px-4"
            >
              {createAddonMutation.isPending || updateAddonMutation.isPending ? "Saving..." : editingAddon ? "Save Add-on" : "Create Add-on"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Configure Features Modal Popup Dialog */}
      <Dialog open={!!featurePlanId} onOpenChange={(open) => { if (!open) setFeaturePlanId(null); }}>
        <DialogContent className="max-w-3xl bg-surface border border-border text-[var(--text-primary)] shadow-2xl p-6 rounded-2xl flex flex-col max-h-[85vh]">
          <DialogHeader className="pb-4 border-b border-border/60 flex-shrink-0">
            <DialogTitle className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Settings className="w-5 h-5 text-indigo-400" />
              Configure Allowed Features: {plans.find(p => p.id === featurePlanId)?.name}
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--text-tertiary)]">
              Enable or disable specific features, modules, and integrations allowed for this plan tier.
            </DialogDescription>
          </DialogHeader>

          {isLoadingPlanFeatures ? (
            <div className="flex-1 py-8 flex items-center justify-center text-xs text-[var(--text-tertiary)] animate-pulse">
              Loading plan configurations...
            </div>
          ) : (
            <div className="flex-1 flex flex-col space-y-4 overflow-hidden mt-4">
              {/* Category Navigation Menu Bar */}
              {featureMatrix.length > 0 && (
                <div className="flex flex-wrap gap-1 p-1 bg-surface-2 border border-border/60 rounded-xl w-fit flex-shrink-0">
                  {featureMatrix.map((cat) => (
                    <button
                      key={cat.category}
                      type="button"
                      onClick={() => setActiveEditCategoryKey(cat.category)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-150",
                        activeEditCategoryKey === cat.category
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-surface-3/60"
                      )}
                    >
                      {cat.category_name}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex-1 overflow-y-auto border border-border/60 rounded-xl bg-surface-2/40 p-1 custom-scrollbar min-h-[300px]">
                <table className="w-full border-collapse text-left">
                  <thead className="sticky top-0 bg-surface z-10 border-b border-border">
                    <tr>
                      <th className="px-4 py-2.5 text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Feature</th>
                      <th className="px-4 py-2.5 text-xs font-bold text-center text-[var(--text-tertiary)] uppercase tracking-wider w-24">Allowed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {(() => {
                      const activeCat = featureMatrix.find(c => c.category === activeEditCategoryKey);
                      if (!activeCat) return (
                        <tr>
                          <td colSpan={2} className="px-4 py-8 text-center text-xs text-[var(--text-tertiary)]">
                            Select a category to edit allowed features.
                          </td>
                        </tr>
                      );

                      return activeCat.features.map((feat) => {
                        const isEnabled = localFeatures.includes(feat.key);
                        return (
                          <tr key={feat.key} className="hover:bg-surface-hover/20 transition-colors">
                            <td className="px-4 py-2.5">
                              <p className="text-xs font-semibold text-[var(--text-primary)]">{feat.name}</p>
                              {feat.description && (
                                <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5 leading-normal">
                                  {feat.description}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <Switch
                                checked={isEnabled}
                                onCheckedChange={() => toggleFeature(feat.key)}
                              />
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>

              <DialogFooter className="pt-4 border-t border-border/60 flex items-center justify-end gap-2 flex-shrink-0">
                <Button
                  variant="outline"
                  onClick={() => setFeaturePlanId(null)}
                  className="text-xs border-border hover:bg-surface-hover hover:text-[var(--text-primary)] font-semibold rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveFeatures}
                  disabled={updatePlanFeaturesMutation.isPending}
                  className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md rounded-xl h-9 px-4"
                >
                  {updatePlanFeaturesMutation.isPending ? "Saving..." : "Save Features"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
