"use client";

import React, { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  useFeaturesCatalog,
  useCreateFeatureCatalogItem,
  useUpdateFeatureCatalogItem,
  useDeleteFeatureCatalogItem 
} from "@/services/super-admin-service";
import { 
  Sliders, Plus, Search, RefreshCw, Edit3, Trash2, HelpCircle, Save, X, PlusCircle, CheckCircle2, AlertTriangle
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { DataTable } from "@/components/super-admin/ui/DataTable";
import { useReactTable, getCoreRowModel, getPaginationRowModel, ColumnDef } from "@tanstack/react-table";
import { InlinePanel } from "@/components/super-admin/ui/InlinePanel";

const featureSchema = z.object({
  key: z.string().min(5, "Feature key is required").refine(
    (val) => {
      const v = val.toUpperCase();
      return v.startsWith("CORE_") || v.startsWith("ADV_") || v.startsWith("ENT_") || v.startsWith("ADDON_");
    },
    "Feature key must start with CORE_, ADV_, ENT_, or ADDON_"
  ),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional().default(""),
  category: z.string().default("core"),
  is_addon: z.boolean().default(false),
  is_billable: z.boolean().default(false),
  required_plan: z.string().optional().default(""),
});

type FeatureFormData = z.infer<typeof featureSchema>;

export default function FeatureCatalogPage() {
  const { data: features = [], isLoading, refetch: refetchCatalog } = useFeaturesCatalog();
  const createFeatureMutation = useCreateFeatureCatalogItem();
  const updateFeatureMutation = useUpdateFeatureCatalogItem();
  const deleteFeatureMutation = useDeleteFeatureCatalogItem();

  const [featureSearch, setFeatureSearch] = useState("");
  const [featureCategory, setFeatureCategory] = useState("all");

  const [showFeatureDrawer, setShowFeatureDrawer] = useState(false);
  const [editingFeatureId, setEditingFeatureId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<FeatureFormData>({
    resolver: zodResolver(featureSchema),
    defaultValues: {
      key: "",
      name: "",
      description: "",
      category: "core",
      is_addon: false,
      is_billable: false,
      required_plan: ""
    }
  });

  const onSaveFeature = async (data: FeatureFormData) => {
    try {
      const formattedData = {
        ...data,
        key: data.key.toUpperCase().trim()
      };

      if (editingFeatureId) {
        await updateFeatureMutation.mutateAsync({
          id: editingFeatureId,
          data: formattedData
        });
        toast.success("Feature catalog item updated successfully");
      } else {
        await createFeatureMutation.mutateAsync(formattedData);
        toast.success("Feature catalog item created successfully");
      }
      resetForm();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err?.message || "Failed to save feature catalog item");
    }
  };

  const resetForm = () => {
    reset({
      key: "",
      name: "",
      description: "",
      category: "core",
      is_addon: false,
      is_billable: false,
      required_plan: ""
    });
    setEditingFeatureId(null);
    setShowFeatureDrawer(false);
    refetchCatalog();
  };

  const handleEditFeature = (feat: any) => {
    setEditingFeatureId(feat.id);
    setValue("key", feat.key);
    setValue("name", feat.name);
    setValue("description", feat.description || "");
    setValue("category", feat.category || "core");
    setValue("is_addon", feat.is_addon || false);
    setValue("is_billable", feat.is_billable || false);
    setValue("required_plan", feat.required_plan || "");
    setShowFeatureDrawer(true);
  };

  const handleDeleteFeature = async (id: string) => {
    try {
      await deleteFeatureMutation.mutateAsync(id);
      toast.success("Feature catalog item deleted successfully");
      setConfirmDeleteId(null);
      refetchCatalog();
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete feature catalog item");
    }
  };

  const filteredFeatures = useMemo(() => {
    return features.filter((feat: any) => {
      const matchesSearch = 
        feat.key.toLowerCase().includes(featureSearch.toLowerCase()) ||
        feat.name.toLowerCase().includes(featureSearch.toLowerCase()) ||
        (feat.description && feat.description.toLowerCase().includes(featureSearch.toLowerCase()));

      const matchesCategory = 
        featureCategory === "all" || 
        feat.category.toLowerCase() === featureCategory.toLowerCase();

      return matchesSearch && matchesCategory;
    });
  }, [features, featureSearch, featureCategory]);

  const columns: ColumnDef<any>[] = useMemo(() => [
    {
      accessorKey: "key",
      header: "Feature Key",
      cell: ({ row }) => <span className="font-mono text-xs font-bold text-[var(--text-primary)]">{row.original.key}</span>,
    },
    {
      accessorKey: "name",
      header: "Display Name",
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--text-primary)] leading-tight">{row.original.name}</p>
          <p className="text-[10px] text-[var(--text-tertiary)] truncate max-w-[200px] mt-0.5">{row.original.description || "—"}</p>
        </div>
      ),
    },
    {
      accessorKey: "category",
      header: "Category",
      cell: ({ row }) => (
        <span className="text-[9px] font-bold font-mono uppercase px-1.5 py-0.5 bg-surface-2 border border-border rounded">
          {row.original.category || "core"}
        </span>
      ),
    },
    {
      accessorKey: "is_addon",
      header: "Availability",
      cell: ({ row }) => {
        const addon = row.original.is_addon;
        return (
          <span className={cn(
            "text-[9px] font-bold uppercase",
            addon ? "text-[var(--warning)]" : "text-[var(--success)]"
          )}>
            {addon ? "Add-On Option" : "Tier Standard"}
          </span>
        );
      },
    },
    {
      accessorKey: "is_billable",
      header: "Pricing Policy",
      cell: ({ row }) => (
        <span className="text-xs text-[var(--text-secondary)]">
          {row.original.is_billable ? "Metered Billable" : "Included"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const feat = row.original;
        const isConfirming = confirmDeleteId === feat.id;
        return (
          <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
            {isConfirming ? (
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  onClick={() => handleDeleteFeature(feat.id)}
                  className="h-7 px-2 bg-[var(--danger)] hover:bg-[var(--danger)]/90 text-white text-[9px] font-bold"
                >
                  Confirm
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmDeleteId(null)}
                  className="h-7 px-2 border-border text-[9px]"
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleEditFeature(feat)}
                  className="h-8 w-8 p-0 hover:bg-surface-hover/40"
                >
                  <Edit3 className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmDeleteId(feat.id)}
                  className="h-8 w-8 p-0 hover:bg-[var(--danger-muted)]/20"
                >
                  <Trash2 className="w-3.5 h-3.5 text-[var(--danger)]" />
                </Button>
              </>
            )}
          </div>
        );
      },
    },
  ], [confirmDeleteId]);

  const table = useReactTable({
    data: filteredFeatures,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <PageContainer>
      <SectionHeader
        title="Feature Catalog Matrix"
        description="Configure ecosystem-wide capability gates, assign metered billing tags, and allocate plan availability matrices."
        breadcrumb={["Console", "Settings", "Feature Catalog"]}
        actions={
          <div className="flex gap-2">
            <Button
              onClick={() => {
                resetForm();
                setShowFeatureDrawer(true);
              }}
              size="sm"
              className="bg-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/90 text-white font-semibold text-xs h-9 px-4 flex gap-1.5"
            >
              <PlusCircle className="w-3.5 h-3.5" /> Register Capability
            </Button>
            <Button
              variant="outline"
              onClick={() => refetchCatalog()}
              size="sm"
              className="border-border"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 text-[var(--text-tertiary)]", isLoading && "animate-spin")} />
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-10 gap-6 items-start">
        {/* Main Grid View */}
        <div className="lg:col-span-7 space-y-4">
          {/* Filters Toolbar */}
          <div className="rounded-xl border border-border bg-surface p-4 flex flex-wrap gap-4 items-center">
            <div className="relative max-w-xs w-full">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 transform -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                type="text"
                value={featureSearch}
                onChange={(e) => setFeatureSearch(e.target.value)}
                placeholder="Search capability keys..."
                className="w-full bg-surface border border-border rounded-xl pl-9 pr-4 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--brand-primary)]"
              />
            </div>

            <div className="flex items-center gap-1.5 bg-surface border border-border rounded-xl px-2.5">
              <span className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-wider font-bold pl-1">Category:</span>
              <select
                value={featureCategory}
                onChange={(e) => setFeatureCategory(e.target.value)}
                className="bg-transparent text-xs text-[var(--text-secondary)] py-1.5 focus:outline-none border-none cursor-pointer pr-4 font-bold"
              >
                <option value="all" className="bg-surface">All Categories</option>
                <option value="core" className="bg-surface">Core Infrastructure</option>
                <option value="advanced" className="bg-surface">Advanced Features</option>
                <option value="addons" className="bg-surface">Add-Ons</option>
                <option value="integrations" className="bg-surface">Integrations</option>
              </select>
            </div>
          </div>

          {/* DataTable */}
          <DataTable table={table} isLoading={isLoading} />
        </div>

        {/* Drawer Form Panel */}
        <div className="lg:col-span-3">
          <InlinePanel
            isOpen={showFeatureDrawer}
            onClose={resetForm}
            title={editingFeatureId ? "Modify Registered Capability" : "Register Capability"}
          >
            <form onSubmit={handleSubmit(onSaveFeature)} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Capability ID Key</label>
                <input
                  type="text"
                  placeholder="e.g. CORE_WEBINAR_VIDEO"
                  {...register("key")}
                  className="w-full rounded-xl bg-surface border border-border px-3 py-1.5 text-xs text-[var(--text-primary)] uppercase focus:outline-none focus:border-[var(--brand-primary)]"
                />
                {errors.key && <p className="text-[10px] text-[var(--danger)]">{errors.key.message}</p>}
                <span className="text-[9px] text-[var(--text-tertiary)] block">Must start with CORE_, ADV_, ENT_, or ADDON_</span>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Display Name</label>
                <input
                  type="text"
                  {...register("name")}
                  className="w-full rounded-xl bg-surface border border-border px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-primary)]"
                />
                {errors.name && <p className="text-[10px] text-[var(--danger)]">{errors.name.message}</p>}
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Description</label>
                <textarea
                  {...register("description")}
                  className="w-full h-16 rounded-xl bg-surface border border-border p-3 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-primary)]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Category</label>
                <select
                  {...register("category")}
                  className="w-full rounded-xl bg-surface border border-border px-3 py-1.5 text-xs text-[var(--text-secondary)] focus:outline-none cursor-pointer"
                >
                  <option value="core">Core Infrastructure</option>
                  <option value="advanced">Advanced Features</option>
                  <option value="addons">Add-Ons</option>
                  <option value="integrations">Integrations</option>
                </select>
              </div>

              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--text-primary)]">Is Add-On Option</span>
                  <input
                    type="checkbox"
                    {...register("is_addon")}
                    className="rounded border-border bg-surface text-[var(--brand-primary)] focus:ring-0 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--text-primary)]">Is Metered Billable</span>
                  <input
                    type="checkbox"
                    {...register("is_billable")}
                    className="rounded border-border bg-surface text-[var(--brand-primary)] focus:ring-0 cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-border/80">
                <Button type="button" variant="outline" onClick={resetForm} className="border-border text-xs h-9 px-4">
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting} className="bg-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/90 text-white font-semibold text-xs h-9 px-4 flex gap-1.5">
                  <Save className="w-3.5 h-3.5" /> {editingFeatureId ? "Update" : "Register"}
                </Button>
              </div>
            </form>
          </InlinePanel>
        </div>
      </div>
    </PageContainer>
  );
}
