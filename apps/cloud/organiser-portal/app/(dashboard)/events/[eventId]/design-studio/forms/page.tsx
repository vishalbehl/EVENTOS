"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FormTemplateGallery,
  FormTemplate,
  FormCategory,
  DEFAULT_FORM_TEMPLATES,
} from "@eventos/form-builder-studio";
import { organiserFormService } from "@/services/form-template-service";
import { OrganiserPage } from "@/components/organizer/workspace/OrganiserPrimitives";
import { RefreshCw, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DesignStudioFormsPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = (params?.eventId as string) || "";

  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [categories, setCategories] = useState<FormCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cats, tpls] = await Promise.all([
        organiserFormService.listCategories().catch(() => []),
        organiserFormService.listTemplates().catch(() => DEFAULT_FORM_TEMPLATES),
      ]);
      setCategories(cats || []);
      setTemplates(tpls && tpls.length > 0 ? tpls : DEFAULT_FORM_TEMPLATES);
    } catch (err: any) {
      toast.error(err.message || "Failed to load form templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleEditTemplate = (template: FormTemplate) => {
    if (!eventId) return;
    router.push(`/events/${eventId}/registration/form-builder?templateId=${template.id}`);
  };

  const handleCreateCustomTemplate = async (data: {
    name: string;
    category_key: string;
    description: string;
  }) => {
    try {
      const created = await organiserFormService.createCustomTemplate({
        name: data.name,
        category_key: data.category_key || "custom",
        description: data.description,
        fields: [],
      });
      toast.success("Created custom form blueprint!");
      if (created && created.id) {
        router.push(`/events/${eventId}/registration/form-builder?templateId=${created.id}`);
      } else {
        loadData();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to create custom template");
    }
  };

  const handleCreateCategory = async (name: string, description: string) => {
    try {
      await organiserFormService.createCategory({ name, description });
      toast.success("Created custom form category!");
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to create category");
    }
  };

  const handleDeleteCategory = async (id: string) => {
    try {
      await organiserFormService.deleteCategory(id);
      toast.success("Category deleted!");
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete category");
    }
  };

  return (
    <OrganiserPage
      title="Form Studio & Blueprints"
      description="Design, customize, and manage questionnaire layouts across all event facilities — Registration, Abstracts, Speaker Intakes, Surveys, and Sponsor Forms."
      actions={
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => router.push(`/events/${eventId}/registration/form-builder`)}
            className="h-8 text-xs font-bold gap-1.5 bg-[var(--pri)] text-[var(--primary-contrast)] hover:opacity-90 cursor-pointer shadow-xs"
          >
            <Plus className="size-3.5" />
            Open Form Designer
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={loadData}
            disabled={loading}
            className="h-8 text-xs font-semibold gap-1.5 border-[var(--border-default)] cursor-pointer"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      }
    >
      {loading && templates.length === 0 ? (
        <div className="p-12 flex flex-col items-center justify-center space-y-3 text-center">
          <RefreshCw className="size-8 text-[var(--pri,#4f46e5)] animate-spin" />
          <p className="text-xs font-bold text-[var(--text-secondary,#a1a1aa)] uppercase tracking-wider">
            Loading Form Studio Blueprints...
          </p>
        </div>
      ) : (
        <FormTemplateGallery
          templates={templates}
          categories={categories}
          mode="organiser-portal"
          onEditTemplate={handleEditTemplate}
          onSelectTemplate={handleEditTemplate}
          onCreateCustomTemplate={handleCreateCustomTemplate}
          onCreateCategory={handleCreateCategory}
          onDeleteCategory={handleDeleteCategory}
        />
      )}
    </OrganiserPage>
  );
}
