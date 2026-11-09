"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  FormBuilderStudio,
  FormField,
  FormTemplate,
  FormSettings,
  DEFAULT_FORM_TEMPLATES,
  abstractSchemaForSave,
} from "@eventos/form-builder-studio";
import { organiserFormService } from "@/services/form-template-service";
import { apiGet } from "@/lib/api-client";
import { AbstractForm } from "@/hooks/useAbstractWorkflow";
import { ScopedEventEditor } from "@/components/organizer/events/ScopedEventEditor";
import { ScopedCommandFeedback } from "@/components/organizer/events/ScopedCommandFeedback";
import { useEventTemplateCopy } from "@/hooks/useEventTemplateCopy";
import { RefreshCw } from "lucide-react";

function normalizeField(f: any, idx: number): FormField {
  return {
    ...f,
    id: f?.id ? String(f.id) : `field_${idx + 1}`,
    type: f?.type ? String(f.type) : "text",
    label: f?.label || f?.name || `Question ${idx + 1}`,
    name: f?.name || f?.key || `field_${idx + 1}`,
    sort_order: f?.sort_order ?? idx,
  };
}

function AbstractFormBuilderContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const eventId = (params?.eventId as string) || "";
  const templateId = searchParams.get("templateId") || "";
  const copy = useEventTemplateCopy(eventId);
  const [loadedTemplate, setLoadedTemplate] = useState<FormTemplate | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [fields, setFields] = useState<FormField[]>([]);
  const [settings, setSettings] = useState<FormSettings>({});
  const [isLive, setIsLive] = useState(true);
  const [categoryName, setCategoryName] = useState("Abstract Submission Form");
  const [formTitle, setFormTitle] = useState("Call for Abstracts Submission Form");
  const [currentAbstractForm, setCurrentAbstractForm] = useState<AbstractForm | null>(null);
  const [defaultBlueprint, setDefaultBlueprint] = useState<{
    name: string;
    fields: FormField[];
    settings: FormSettings;
  } | null>(null);

  const defaultAbstractBlueprint = DEFAULT_FORM_TEMPLATES.find((t) => t.category_key === "abstract") || DEFAULT_FORM_TEMPLATES[0];

  const loadGeneration = useRef(0);
  const loadFormConfig = useCallback(async () => {
    if (!eventId) return;
    const generation = ++loadGeneration.current;
    const current = () => copy.isCurrent() && generation === loadGeneration.current;
    setLoading(true);
    setLoadError(null);
    try {
      const active = await apiGet<AbstractForm>(`/events/${eventId}/abstracts/form`);
      if (!current()) return;
      let source = active.saved_template || null;
      let displayedFields = active.schema.fields;
      let displayedSettings = active.schema.settings;
      let title = active.title;
      if (templateId) {
        const requested = await organiserFormService.getTemplate(templateId, eventId);
        if (!current()) return;
        source = requested;
        if (requested.scope_type !== "EVENT") {
          const catalogue = await organiserFormService.listTemplatePage({
            category_key: "abstract",
            event_id: eventId,
            source_template_id: requested.id,
            page_size: "2",
          });
          if (!current()) return;
          if (catalogue.has_next || catalogue.items.length > 1) {
            throw new Error("Multiple event copies reference this template. Reconcile the catalogue before editing.");
          }
          source = copy.selectTarget(requested, catalogue.items);
        }
        displayedFields = requested.fields;
        displayedSettings = requested.settings;
        title = requested.name;
      }
      if (!current()) return;
      setCurrentAbstractForm(active);
      setLoadedTemplate(source);
      setFields(Array.isArray(displayedFields) ? displayedFields.map(normalizeField) : []);
      setSettings((displayedSettings || {}) as FormSettings);
      setIsLive(active.publish);
      setFormTitle(title);
      setCategoryName(source?.category_name || "Abstract Submission Form");
      setDefaultBlueprint({
        name: defaultAbstractBlueprint.name,
        fields: defaultAbstractBlueprint.fields,
        settings: defaultAbstractBlueprint.settings || {},
      });
    } catch (error: unknown) {
      if (current()) setLoadError(error instanceof Error ? error.message : "Abstract configuration unavailable.");
    } finally {
      if (current()) setLoading(false);
    }
  }, [eventId, templateId, copy.isCurrent, defaultAbstractBlueprint]);

  useEffect(() => {
    void loadFormConfig();
    return () => { loadGeneration.current += 1; };
  }, [loadFormConfig]);

  const handleSave = async (data: {
    fields: FormField[];
    settings: FormSettings;
    is_live: boolean;
  }) => {
    if (!eventId) return;
    try {
      if (loading || loadError || !currentAbstractForm) {
        throw new Error("Reload the current abstract form before saving.");
      }
      const updated = await copy.execute<AbstractForm>("put", `/events/${eventId}/abstracts/form`, {
        title: formTitle,
        schema: abstractSchemaForSave({ ...currentAbstractForm.schema, fields: data.fields, settings: data.settings }),
        is_active: true,
        publish: data.is_live,
        ...(loadedTemplate ? { source_template_id: loadedTemplate.id, source_version: loadedTemplate.version } : {}),
      }, currentAbstractForm.version);
      if (!updated || !copy.isCurrent()) return;
      setCurrentAbstractForm(updated);
      if (updated.saved_template) {
        setLoadedTemplate(updated.saved_template);
      }
      toast.success("Abstract submission form saved and synchronized with author portal! 🚀");
    } catch (err: any) {
      if (copy.isCurrent()) toast.error(err.message || "Failed to save abstract form configuration");
    }
  };

  const handleResetToDefault = async () => {
    if (copy.pending) return;
    const targetBlueprint = defaultBlueprint || {
      name: defaultAbstractBlueprint.name,
      fields: defaultAbstractBlueprint.fields,
      settings: defaultAbstractBlueprint.settings || {},
    };

    const resetFields = (targetBlueprint.fields as any[]).map(normalizeField);
    const resetSettings: FormSettings = {
      ...(targetBlueprint.settings || {}),
      enable_preview: true,
      enable_terms: false,
      enable_payment: false,
    };

    setFields(resetFields);
    setSettings(resetSettings);
    setFormTitle(targetBlueprint.name);

    toast.info("Default layout loaded as an unsaved draft. Save to apply it.");

  };

  if (loadError) return <p role="alert">{loadError} Reload this page before editing.</p>;

  if (loading) {
    return (
      <div className="p-16 flex flex-col items-center justify-center space-y-3 text-center min-h-[500px]">
        <RefreshCw className="size-8 text-[var(--pri,#4f46e5)] animate-spin" />
        <p className="text-xs font-bold text-[var(--text-secondary,#a1a1aa)] uppercase tracking-wider">
          Loading Abstract Form Studio...
        </p>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-hidden">
      <ScopedCommandFeedback failure={copy.failure} retryAt={copy.retryAt} />
      <FormBuilderStudio
        initialFields={fields}
        initialSettings={settings}
        templateName={formTitle}
        categoryName={categoryName}
        isLive={isLive}
        mode="organiser-portal"
        onSave={handleSave}
        onBrowseTemplates={() => router.push(`/events/${eventId}/abstracts/templates`)}
        onResetToDefault={handleResetToDefault}
      />
    </div>
  );
}

export default function AbstractFormBuilderPage() {
  const params = useParams();
  return (
    <Suspense
      fallback={
        <div className="p-16 flex flex-col items-center justify-center space-y-3 text-center min-h-[500px]">
          <RefreshCw className="size-8 text-[var(--pri,#4f46e5)] animate-spin" />
          <p className="text-xs font-bold text-[var(--text-secondary,#a1a1aa)] uppercase tracking-wider">
            Loading Abstract Form Studio...
          </p>
        </div>
      }
    >
      <ScopedEventEditor eventId={String(params?.eventId || "")}><AbstractFormBuilderContent /></ScopedEventEditor>
    </Suspense>
  );
}
