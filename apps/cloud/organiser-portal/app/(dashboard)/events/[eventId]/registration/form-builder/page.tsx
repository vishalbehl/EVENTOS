"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  FormBuilderStudio,
  FormField,
  FormSettings,
  DEFAULT_FORM_TEMPLATES,
} from "@eventos/form-builder-studio";
import { organiserFormService } from "@/services/form-template-service";
import { useEvent } from "@/hooks/useEvents";
import { RefreshCw } from "lucide-react";

function RegistrationFormBuilderContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const eventId = (params?.eventId as string) || "";
  const templateId = searchParams.get("templateId") || "";
  const { data: event } = useEvent(eventId);

  const [loading, setLoading] = useState(true);
  const [fields, setFields] = useState<FormField[]>([]);
  const [settings, setSettings] = useState<FormSettings>({});
  const [isLive, setIsLive] = useState(true);
  const [categoryName, setCategoryName] = useState("Registration Form");
  const [formTitle, setFormTitle] = useState("Event Registration Form");

  const loadFormConfig = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      if (templateId) {
        // Load specific template by ID
        try {
          const tpl = await organiserFormService.getTemplate(templateId);
          if (tpl && tpl.fields) {
            setFields(tpl.fields.map((f, idx) => ({ ...f, sort_order: f.sort_order ?? idx })));
            setSettings(tpl.settings || {});
            setCategoryName(tpl.category_name || tpl.category_key.replace(/_/g, " ").toUpperCase());
            setFormTitle(tpl.name);
            setLoading(false);
            return;
          }
        } catch {
          // Fallback to local default template match if API not found
          const localTpl = DEFAULT_FORM_TEMPLATES.find((t) => t.id === templateId);
          if (localTpl) {
            setFields(localTpl.fields.map((f, idx) => ({ ...f, sort_order: f.sort_order ?? idx })));
            setSettings(localTpl.settings || {});
            setCategoryName(localTpl.category_name || "Registration Form");
            setFormTitle(localTpl.name);
            setLoading(false);
            return;
          }
        }
      }

      // Default: Load existing Event Form Config
      const res = await organiserFormService.getEventFormConfig(eventId);
      if (res.fields && res.fields.length > 0) {
        const formattedFields = res.fields.map((f, idx) => ({
          ...f,
          sort_order: f.sort_order ?? idx,
        }));
        setFields(formattedFields);
      } else {
        setFields(DEFAULT_FORM_TEMPLATES[0].fields);
      }

      setIsLive(res.is_live !== undefined ? res.is_live : true);
      setSettings(res.settings || {
        terms_and_conditions: res.terms_and_conditions || "",
        enable_terms: true,
        enable_preview: true,
        enable_payment: true,
      });
      setFormTitle(event ? `${event.name} — Registration Questionnaire` : "Event Registration Form");
    } catch (err: any) {
      toast.error(err.message || "Failed to load form configuration");
      setFields(DEFAULT_FORM_TEMPLATES[0].fields);
    } finally {
      setLoading(false);
    }
  }, [eventId, templateId, event]);

  useEffect(() => {
    loadFormConfig();
  }, [loadFormConfig]);

  const handleSave = async (data: {
    fields: FormField[];
    settings: FormSettings;
    is_live: boolean;
  }) => {
    if (!eventId) return;
    try {
      await organiserFormService.saveEventFormConfig(eventId, {
        fields: data.fields,
        is_live: data.is_live,
        settings: data.settings,
        terms_and_conditions: data.settings.terms_and_conditions || "",
        template_id: templateId || undefined,
      });
      toast.success("Registration form configuration saved and synchronized!");
    } catch (err: any) {
      toast.error(err.message || "Failed to save form configuration");
    }
  };

  if (loading) {
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
    <div className="h-full w-full overflow-hidden">
      <FormBuilderStudio
        initialFields={fields}
        initialSettings={settings}
        templateName={formTitle}
        categoryName={categoryName}
        isLive={isLive}
        mode="organiser-portal"
        onSave={handleSave}
        onBrowseTemplates={() => router.push(`/events/${eventId}/registration/templates`)}
      />
    </div>
  );
}

export default function RegistrationFormBuilderPage() {
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
      <RegistrationFormBuilderContent />
    </Suspense>
  );
}
