"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  FormBuilderStudio,
  FormTemplate,
  FormField,
  FormSettings,
  DEFAULT_FORM_TEMPLATES,
} from "@eventos/form-builder-studio";
import { platformFormService } from "@/services/form-template-service";
import { RefreshCw } from "lucide-react";

function FormBuilderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateId = searchParams.get("id");

  const [loading, setLoading] = useState(true);
  const [template, setTemplate] = useState<FormTemplate | null>(null);

  useEffect(() => {
    async function loadTemplate() {
      if (!templateId) {
        // Fallback default
        setTemplate(DEFAULT_FORM_TEMPLATES[0]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const res = await platformFormService.getTemplate(templateId);
        setTemplate(res);
      } catch (err: any) {
        // Fallback to local default if API fails
        const local = DEFAULT_FORM_TEMPLATES.find((t: FormTemplate) => t.id === templateId) || DEFAULT_FORM_TEMPLATES[0];
        setTemplate(local);
      } finally {
        setLoading(false);
      }
    }

    loadTemplate();
  }, [templateId]);

  const handleSave = async (data: {
    fields: FormField[];
    settings: FormSettings;
    is_live: boolean;
  }) => {
    if (!template) return;
    try {
      if (template.id && !template.id.startsWith("tpl_")) {
        await platformFormService.updateTemplate(template.id, {
          name: template.name,
          description: template.description,
          category_key: template.category_key,
          fields: data.fields,
          settings: data.settings,
        });
      } else {
        // Create new template record
        await platformFormService.createTemplate({
          name: template.name,
          category_key: template.category_key,
          description: template.description,
          fields: data.fields,
          settings: data.settings,
          scope_type: "GLOBAL",
        });
      }
      toast.success("Form blueprint saved and published successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to save template");
    }
  };

  if (loading || !template) {
    return (
      <div className="p-16 flex flex-col items-center justify-center space-y-3 text-center min-h-[500px]">
        <RefreshCw className="size-8 text-[var(--pri,#4f46e5)] animate-spin" />
        <p className="text-xs font-bold text-[var(--text-secondary,#a1a1aa)] uppercase tracking-wider">
          Loading Form Studio...
        </p>
      </div>
    );
  }

  return (
    <FormBuilderStudio
      initialFields={template.fields || []}
      initialSettings={template.settings || {}}
      templateName={template.name}
      categoryName={template.category_name || template.category_key}
      isLive={template.is_active}
      mode="command-center"
      onSave={handleSave}
      onBack={() => router.push("/applications/templates/form")}
      onBrowseTemplates={() => router.push("/applications/templates/form")}
    />
  );
}

export default function CommandCenterFormBuilderPage() {
  return (
    <Suspense
      fallback={
        <div className="p-16 flex flex-col items-center justify-center space-y-3 text-center min-h-[500px]">
          <RefreshCw className="size-8 text-[var(--pri,#4f46e5)] animate-spin" />
          <p className="text-xs font-bold text-[var(--text-secondary,#a1a1aa)] uppercase tracking-wider">
            Loading Form Studio...
          </p>
        </div>
      }
    >
      <FormBuilderContent />
    </Suspense>
  );
}
