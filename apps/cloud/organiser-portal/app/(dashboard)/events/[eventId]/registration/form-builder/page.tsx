"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  FormBuilderStudio,
  FormField,
  FormSettings,
} from "@eventos/form-builder-studio";
import { organiserFormService } from "@/services/form-template-service";
import { useEvent } from "@/hooks/useEvents";
import { RefreshCw } from "lucide-react";
import { useFormConfigSave } from "@/hooks/useFormConfigSave";
import { ScopedEventEditor } from "@/components/organizer/events/ScopedEventEditor";
import { loadRegistrationEditor, type RegistrationBlueprint } from "@/lib/registration-editor-load";

function RegistrationFormBuilderContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const eventId = (params?.eventId as string) || "";
  const templateId = searchParams.get("templateId") || "";
  const { data: event } = useEvent(eventId);
  const eventName = useRef(event?.name);
  eventName.current = event?.name;
  const { save, pending, isCurrent } = useFormConfigSave(eventId);
  const [formVersion, setFormVersion] = useState<number | null>(null);
  const [studioRevision, setStudioRevision] = useState(0);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [blueprintNotice, setBlueprintNotice] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const retryDeadline = useRef(0);
  const [retryAt, setRetryAt] = useState(0);
  const [retrySeconds, setRetrySeconds] = useState(0);
  const [fields, setFields] = useState<FormField[]>([]);
  const [settings, setSettings] = useState<FormSettings>({});
  const [isLive, setIsLive] = useState(true);
  const [categoryName, setCategoryName] = useState("Registration Form");
  const [formTitle, setFormTitle] = useState("Event Registration Form");
  // Tracks the EVENT-scoped copy created when a user edits a global template
  const [eventCopyTemplateId, setEventCopyTemplateId] = useState<string | null>(null);
  // Resolved actual DB UUID/slug of the source template (may differ from URL templateId which can be a local ID like 'tpl_standard_registration')
  const [resolvedSourceTemplateId, setResolvedSourceTemplateId] = useState<string | null>(null);
  // Original blueprint used when resetting back to default
  const [defaultBlueprint, setDefaultBlueprint] = useState<RegistrationBlueprint | null>(null);

  const loadFormConfig = useCallback(async () => {
    if (!eventId || Date.now() < retryDeadline.current) return;
    setRetryAt(0);
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const current = () => !controller.signal.aborted && request.current === controller && isCurrent();
    setLoading(true);
    setLoadError(null);
    setFormVersion(null);
    try {
      const result = await loadRegistrationEditor(eventId, templateId, {
        getEventFormConfig: () => organiserFormService.getEventFormConfig(eventId, controller.signal),
        getTemplate: id => organiserFormService.getTemplate(id, eventId, controller.signal),
      }, current);
      if (!current()) return;
      setFormVersion(result.version);
      setFields(result.fields);
      setSettings(result.settings);
      setIsLive(result.isLive);
      setFormTitle(result.title || (eventName.current ? `${eventName.current} — Registration Questionnaire` : "Event Registration Form"));
      setCategoryName(result.categoryName);
      setEventCopyTemplateId(result.eventCopyTemplateId);
      setResolvedSourceTemplateId(result.sourceTemplateId);
      setDefaultBlueprint(result.blueprint);
      setBlueprintNotice(result.blueprintNotice);
      setStudioRevision(previous => previous + 1);
    } catch (error: unknown) {
      if (!current()) return;
      const status = error && typeof error === "object" && "status" in error ? error.status : undefined;
      const retryAfter = error && typeof error === "object" && "retryAfter" in error ? error.retryAfter : undefined;
      if (status === 429 || (typeof retryAfter === "number" && retryAfter > 0)) {
        const seconds = typeof retryAfter === "number" && Number.isFinite(retryAfter)
          ? Math.min(86400, Math.max(1, Math.ceil(retryAfter))) : 60;
        retryDeadline.current = Date.now() + seconds * 1000;
        setRetryAt(retryDeadline.current);
      }
      setLoadError(status === 401 ? "Your session has expired. Sign in again." :
        status === 403 ? "You do not have access to this form." :
        status === 404 ? "The selected form template is unavailable in this event." :
        status === 429 ? "Too many requests. Wait before retrying." :
        "Form configuration is temporarily unavailable. No substitute template has been loaded.");
    } finally {
      if (current()) setLoading(false);
    }
  }, [eventId, templateId, isCurrent]);

  useEffect(() => {
    void loadFormConfig();
    return () => request.current?.abort();
  }, [loadFormConfig]);

  useEffect(() => {
    if (!retryAt) { setRetrySeconds(0); return; }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
      setRetrySeconds(remaining);
      if (!remaining) window.clearInterval(timer);
    };
    const timer = window.setInterval(tick, 1000);
    tick();
    return () => window.clearInterval(timer);
  }, [retryAt]);

  const handleSave = async (data: {
    fields: FormField[];
    settings: FormSettings;
    is_live: boolean;
  }) => {
    if (!eventId) return;
    try {
      // If we opened a specific template (templateId), save as an event-scoped copy.
      // On first save it creates a new EVENT-scoped row; on subsequent saves it updates it.
      const sourceId = eventCopyTemplateId || resolvedSourceTemplateId;
      const saved = await save(formVersion, {
        template_id: sourceId || undefined,
        fields: data.fields,
        is_live: data.is_live,
        settings: data.settings,
        terms_and_conditions: data.settings.terms_and_conditions || "",
      });
      if (!saved) return;
      setFormVersion(saved.version);
      setEventCopyTemplateId(saved.template_id || null);
      setIsLive(saved.is_live);
      toast.success("Registration form design saved and synchronized with event portal! 🚀");
    } catch (err: any) {
      if (isCurrent()) toast.error(err.message || "Failed to save form configuration. Your draft is retained.");
    }
  };

  const handleResetToDefault = async () => {
    // Resolve the original blueprint corresponding to this specific template
    const targetBlueprint = defaultBlueprint;
    if (!targetBlueprint || !isCurrent()) return;

    const resetFields = targetBlueprint.fields.map((f, idx) => ({
      ...f,
      sort_order: f.sort_order ?? idx,
    }));
    const resetSettings: FormSettings = {
      ...(targetBlueprint.settings || {}),
    };
    // Synchronize the reset blueprint with Event Form Config as well
    try {
      const saved = await save(formVersion, {
        template_id: eventCopyTemplateId || resolvedSourceTemplateId || undefined,
        fields: resetFields,
        is_live: isLive,
        settings: resetSettings,
        terms_and_conditions: resetSettings.terms_and_conditions || "",
      });
      if (!saved) return;
      setFormVersion(saved.version);
      setEventCopyTemplateId(saved.template_id || null);
      setFields(resetFields);
      setSettings(resetSettings);
      setFormTitle(targetBlueprint.name);
      setStudioRevision(previous => previous + 1);
      toast.info(`Reset layout to original "${targetBlueprint.name}" blueprint.`);
    } catch (error: any) {
      if (isCurrent()) toast.error(error.message || "Reset failed. Your draft is retained.");
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

  if (!formVersion) return <div role="alert">{loadError || "Form configuration is unavailable."} <button disabled={retrySeconds > 0}
    onClick={() => void loadFormConfig()}>{retrySeconds > 0 ? `Retry loading in ${retrySeconds}s` : "Retry loading"}</button></div>;

  return (
    <fieldset disabled={pending} aria-busy={pending} className="h-full w-full overflow-hidden min-w-0 border-0 p-0" style={pending ? { pointerEvents: "none" } : undefined}>
      <button type="button" onClick={() => void loadFormConfig()}>Discard draft and reload the current form</button>
      {blueprintNotice ? <p role="status">{blueprintNotice}</p> : null}
      <FormBuilderStudio
        key={studioRevision}
        initialFields={fields}
        initialSettings={settings}
        templateName={formTitle}
        categoryName={categoryName}
        isLive={isLive}
        mode="organiser-portal"
        onSave={handleSave}
        onBrowseTemplates={() => router.push(`/events/${eventId}/registration/templates`)}
        onResetToDefault={defaultBlueprint ? handleResetToDefault : undefined}
      />
    </fieldset>
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
      <ScopedFormBuilder />
    </Suspense>
  );
}

function ScopedFormBuilder() {
  const params = useParams();
  const search = useSearchParams();
  return <ScopedEventEditor eventId={String(params?.eventId || "")}>
    <RegistrationFormBuilderContent key={search.get("templateId") || "active"} />
  </ScopedEventEditor>;
}
