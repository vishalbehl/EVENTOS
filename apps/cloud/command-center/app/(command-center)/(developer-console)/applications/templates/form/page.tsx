"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FormTemplateGallery, FormTemplate, FormCategory } from "@eventos/form-builder-studio";
import { platformFormService } from "@/services/form-template-service";
import { RefreshCw } from "lucide-react";

export default function CommandCenterFormTemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [categories, setCategories] = useState<FormCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [catsRes, tplsRes] = await Promise.all([
        platformFormService.listCategories().catch(() => [] as FormCategory[]),
        platformFormService.listTemplates().catch(() => [] as FormTemplate[]),
      ]);
      setCategories(catsRes || []);
      setTemplates(tplsRes || []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load form templates library");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSelectTemplate = (template: FormTemplate) => {
    router.push(`/applications/templates/form/builder?id=${template.id}`);
  };

  const handleCreateCustomTemplate = async (data: { name: string; category_key: string; description: string }) => {
    try {
      const res = await platformFormService.createTemplate({
        name: data.name,
        category_key: data.category_key,
        description: data.description,
        scope_type: "GLOBAL",
        is_default: false,
        fields: [],
      });
      toast.success("Created new form template blueprint!");
      router.push(`/applications/templates/form/builder?id=${res.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create template");
    }
  };

  const handleCreateCategory = async (name: string, description: string) => {
    try {
      await platformFormService.createCategory({ name, description });
      toast.success("Created new form category");
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to create category");
    }
  };

  const handleDeleteCategory = async (id: string) => {
    try {
      await platformFormService.deleteCategory(id);
      toast.success("Category deleted");
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete category");
    }
  };

  if (loading && templates.length === 0) {
    return (
      <div className="p-12 flex flex-col items-center justify-center space-y-3 text-center min-h-[400px]">
        <RefreshCw className="size-8 text-[var(--pri,#4f46e5)] animate-spin" />
        <p className="text-xs font-bold text-[var(--text-secondary,#a1a1aa)] uppercase tracking-wider">
          Loading Form Blueprint Gallery...
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <FormTemplateGallery
        templates={templates}
        categories={categories}
        mode="command-center"
        onSelectTemplate={handleSelectTemplate}
        onCreateCustomTemplate={handleCreateCustomTemplate}
        onCreateCategory={handleCreateCategory}
        onDeleteCategory={handleDeleteCategory}
      />
    </div>
  );
}
