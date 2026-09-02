"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FormTemplateGallery,
  FormTemplate,
  FormCategory,
} from "@eventos/form-builder-studio";
import { organiserFormService } from "@/services/form-template-service";
import { OrganiserPage } from "@/components/organizer/workspace/OrganiserPrimitives";
import { RefreshCw, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OrganiserRegistrationFormTemplatesPage() {
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
        organiserFormService.listTemplates({ category_key: "registration" }).catch(() => []),
      ]);
      setCategories(cats || []);
      setTemplates(tpls || []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load registration form templates");
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
        category_key: data.category_key || "registration",
        description: data.description,
        fields: [],
      });
      toast.success("Created custom registration template!");
      if (created && created.id) {
        router.push(`/events/${eventId}/registration/form-builder?templateId=${created.id}`);
      } else {
        loadData();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to create custom template");
    }
  };

  return (
    <OrganiserPage
      title="Registration Form Blueprints"
      description="Choose a registration questionnaire template to customize, configure multi-page steps, and publish for attendee sign-up."
      actions={
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => router.push(`/events/${eventId}/registration/form-builder`)}
            className="h-8 text-xs font-bold gap-1.5 bg-[var(--pri)] text-[var(--primary-contrast)] hover:opacity-90 cursor-pointer shadow-xs"
          >
            <Plus className="size-3.5" />
            Create Blank Form
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
            Loading Registration Blueprints...
          </p>
        </div>
      ) : (
        <FormTemplateGallery
          templates={templates}
          categories={categories}
          facilityCategory="registration"
          mode="organiser-portal"
          onEditTemplate={handleEditTemplate}
          onSelectTemplate={handleEditTemplate}
          onCreateCustomTemplate={handleCreateCustomTemplate}
        />
      )}
    </OrganiserPage>
  );
}
