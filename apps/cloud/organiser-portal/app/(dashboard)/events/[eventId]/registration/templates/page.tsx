"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FormTemplateGallery,
  FormTemplate,
  FormCategory,
  FormRenderer,
} from "@eventos/form-builder-studio";
import { organiserFormService, type EventFormConfig } from "@/services/form-template-service";
import { useScopedCommand } from "@/hooks/useScopedCommand";
import { useFormConfigSave } from "@/hooks/useFormConfigSave";
import { ScopedEventEditor } from "@/components/organizer/events/ScopedEventEditor";
import { OrganiserPage } from "@/components/organizer/workspace/OrganiserPrimitives";
import {
  RefreshCw, Plus, Edit3, Layers, CheckCircle2,
  ArrowRight, X, Eye
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCataloguePageRequests } from "@/hooks/useCataloguePageRequests";
import { appendCataloguePage, nextCatalogueCursor } from "@/lib/catalogue-pages";
import { ScopedCommandFeedback } from "@/components/organizer/events/ScopedCommandFeedback";

export default function OrganiserRegistrationFormTemplatesPage() {
  const params = useParams();
  return <ScopedEventEditor eventId={String(params?.eventId || "")}><RegistrationTemplatesEditor /></ScopedEventEditor>;
}

function RegistrationTemplatesEditor() {
  const params = useParams();
  const router = useRouter();
  const eventId = (params?.eventId as string) || "";
  const { save, pending, isCurrent } = useFormConfigSave(eventId);
  const catalogue = useScopedCommand(eventId);

  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [categories, setCategories] = useState<FormCategory[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState<string>("");
  const [activeFormFieldsCount, setActiveFormFieldsCount] = useState<number>(0);
  const [eventFormConfig, setEventFormConfig] = useState<EventFormConfig | null>(null);
  const { run: readPage, pending: readPending, blocked: readBlocked, failure: readFailure, retryAt: readRetryAt } = useCataloguePageRequests(isCurrent);
  const loading = readPending.initial;
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [nextTemplateCursor, setNextTemplateCursor] = useState<string | null>(null);
  const [nextCategoryCursor, setNextCategoryCursor] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!eventId) return;
    await readPage("initial", signal => Promise.all([
        organiserFormService.listCategoryPage({ event_id: eventId, page_size: "100" }, signal),
        organiserFormService.listTemplatePage({ category_key: "registration", event_id: eventId, page_size: "50" }, signal),
        organiserFormService.getEventFormConfig(eventId, signal),
      ]), ([cats, tpls, formConfig]) => {
      const categoryCursor = nextCatalogueCursor(cats);
      const templateCursor = nextCatalogueCursor(tpls);
      setCategories(appendCataloguePage([], cats.items || []));
      setNextCategoryCursor(categoryCursor);
      setTemplates(appendCataloguePage([], tpls.items || []));
      setNextTemplateCursor(templateCursor);
      setEventFormConfig(formConfig);

      if (formConfig && formConfig.template_id) {
        setActiveTemplateId(String(formConfig.template_id));
        setActiveFormFieldsCount(Array.isArray(formConfig.fields) ? formConfig.fields.length : 0);
      } else {
        setActiveTemplateId("");
        setActiveFormFieldsCount(0);
      }
    }, err => {
      if (isCurrent()) {
        setEventFormConfig(null);
        toast.error(err.message || "Failed to load registration form templates");
      }
    });
  }, [eventId, readPage]);

  const loadMoreTemplates = async () => {
    if (!nextTemplateCursor || loading) return;
    await readPage("templates", signal => organiserFormService.listTemplatePage({ category_key: "registration",
      event_id: eventId, page_size: "50", cursor: nextTemplateCursor }, signal), page => {
      const cursor = nextCatalogueCursor(page, nextTemplateCursor);
      setTemplates(current => appendCataloguePage(current, page.items || []));
      setNextTemplateCursor(cursor);
    });
  };

  const loadMoreCategories = async () => {
    if (!nextCategoryCursor || loading) return;
    await readPage("categories", signal => organiserFormService.listCategoryPage({ event_id: eventId,
      page_size: "100", cursor: nextCategoryCursor }, signal), page => {
      const cursor = nextCatalogueCursor(page, nextCategoryCursor);
      setCategories(current => appendCataloguePage(current, page.items || []));
      setNextCategoryCursor(cursor);
    });
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleFetchTemplate = async (template: FormTemplate) => {
    if (!eventId || loading || readFailure.initial) return false;
    try {
      const sourceId = template.id.startsWith("tpl_") ? template.slug : template.id;
      const saved = await save(eventFormConfig?.version || null, {
        template_id: sourceId,
        fields: template.fields || [],
        settings: template.settings || {},
      });
      if (!saved) return false;
      setEventFormConfig(saved);
      setActiveTemplateId(saved.template_id || "");
      setActiveFormFieldsCount(saved.fields?.length || 0);
      toast.success(`"${template.name}" applied as active default for this event! 🎉`);
      return true;
    } catch (err: any) {
      if (isCurrent()) toast.error(err.message || "Failed to apply template. Reload if its version has changed.");
      return false;
    }
  };

  const handleEditTemplate = (template?: FormTemplate | null) => {
    if (!eventId) return;
    const tid = template?.id || eventFormConfig?.template_id || activeTemplateId || "";
    router.push(`/events/${eventId}/registration/form-builder${tid ? `?templateId=${tid}` : ""}`);
  };

  const handleCreateCustomTemplate = async (data: {
    name: string;
    category_key: string;
    description: string;
  }) => {
    try {
      const created = await catalogue.execute<FormTemplate>("post", "/forms/templates", {
        scope_type: "ORGANIZATION",
        name: data.name,
        category_key: data.category_key || "registration",
        description: data.description,
        fields: [],
      });
      if (!created || !catalogue.isCurrent()) return false;
      toast.success("Created custom registration template!");
      if (created && created.id) {
        router.push(`/events/${eventId}/registration/form-builder?templateId=${created.id}`);
      } else {
        loadData();
      }
    } catch (err: any) {
      if (catalogue.isCurrent()) toast.error(err.message || "Failed to create custom template");
      return false;
    }
  };

  // Find the active fetched template strictly - do NOT fallback to global blueprints
  const activeTemplate = activeTemplateId
    ? templates.find(
        (t) =>
          t.id === activeTemplateId ||
          t.slug === activeTemplateId ||
          (t.settings as any)?._source_template_id === activeTemplateId
      ) || null
    : null;

  const activeFormFields = eventFormConfig?.fields || [];
  const activeFormSettings = eventFormConfig?.settings || {};

  if (!loading && !eventFormConfig && !readFailure.initial) return <div role="alert">Current form configuration is unavailable. <button onClick={() => void loadData()}>Retry loading</button></div>;

  return (
    <fieldset disabled={pending || loading} aria-busy={pending} className="min-w-0 border-0 p-0" style={pending ? { pointerEvents: "none" } : undefined}>
    <OrganiserPage
      title="Registration Form Template"
      description="View and edit the active registration form for attendees, or browse the template library to fetch an alternative blueprint."
      actions={
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setIsLibraryOpen(true)}
            className="h-8 text-xs font-bold gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer shadow-sm shadow-indigo-600/30"
          >
            <Layers className="size-3.5" />
            Show Form Templates
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push(`/events/${eventId}/registration/form-builder`)}
            className="h-8 text-xs font-semibold gap-1.5 border-[var(--border-default)] cursor-pointer"
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
      <ScopedCommandFeedback failure={readFailure.initial} retryAt={readRetryAt.initial} />
      {readFailure.initial && !loading ? (
        <p role="status">The catalogue is unavailable. Reload it before choosing a template.</p>
      ) : loading && templates.length === 0 ? (
        <div className="p-16 flex flex-col items-center justify-center space-y-3 text-center">
          <RefreshCw className="size-8 text-indigo-500 animate-spin" />
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
            Loading Form Configuration...
          </p>
        </div>
      ) : activeTemplate ? (
        /* ── Side-by-Side: Active Template Details on Left, Live Form Preview on Right ── */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column (5 cols): Template Details & Actions */}
          <div className="lg:col-span-5 space-y-6">
            <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/60 backdrop-blur-sm shadow-xl space-y-6">
              <div className="space-y-3 pb-5 border-b border-zinc-800">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700">
                    {activeTemplate.category_name || "Registration Form"}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                    <CheckCircle2 className="size-3" />
                    Active Default on Event Portal
                  </span>
                </div>

                <h2 className="text-xl font-bold text-white tracking-tight">
                  {activeTemplate.name}
                </h2>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  {activeTemplate.description || "Active registration questionnaire layout applied to this event."}
                </p>

                {/* Action Buttons: Edit in Designer & Browse Library */}
                <div className="flex items-center gap-2.5 pt-2">
                  <Button
                    onClick={() => handleEditTemplate(activeTemplate)}
                    className="h-9 px-4 text-xs font-bold gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer shadow-md shadow-indigo-600/30"
                  >
                    <Edit3 className="size-3.5" />
                    <span>Edit in Designer</span>
                    <ArrowRight className="size-3.5" />
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => setIsLibraryOpen(true)}
                    className="h-9 px-3.5 text-xs font-semibold gap-1.5 border-zinc-700 bg-zinc-800/80 hover:bg-zinc-750 text-zinc-200 hover:text-white cursor-pointer"
                  >
                    <Layers className="size-3.5 text-indigo-400" />
                    <span>Change Template</span>
                  </Button>
                </div>
              </div>

              {/* Questions & Blueprint Attributes */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Total Questions</span>
                  <p className="text-lg font-black text-white">
                    {activeFormFields.length}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Required Fields</span>
                  <p className="text-lg font-black text-indigo-400">
                    {activeFormFields.filter((f: any) => f.is_required).length}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Form Scope</span>
                  <p className="text-xs font-bold text-zinc-300 mt-1">
                    Event &amp; Organisation Copy
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Attendee Portal</span>
                  <p className="text-xs font-bold text-emerald-400 mt-1 flex items-center gap-1">
                    <CheckCircle2 className="size-3" /> Live &amp; Linked
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column (7 cols): Live Form Interactive Preview Window */}
          <div className="lg:col-span-7">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 backdrop-blur-sm shadow-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-zinc-800 bg-zinc-950/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
                    <Eye className="size-3.5 text-indigo-400" />
                    Live Form Preview
                  </span>
                </div>
                <span className="text-[11px] text-zinc-500 font-medium">
                  Attendee View
                </span>
              </div>
              <div className="p-6 max-h-[750px] overflow-y-auto bg-zinc-950/30">
                <FormRenderer
                  fields={activeFormFields}
                  settings={activeFormSettings}
                  previewMode={true}
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ── Empty State: Prompt to Open Template Library ── */
        <div className="p-16 border-2 border-dashed border-zinc-800 rounded-2xl text-center space-y-4 bg-zinc-900/40 max-w-2xl">
          <Layers className="size-12 text-indigo-500/60 mx-auto" />
          <div>
            <h4 className="text-base font-bold text-white">No Registration Template Selected</h4>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto mt-1">
              No registration form is bound to this event. Choose a template to create and activate an event-owned form.
            </p>
          </div>
          <Button
            onClick={() => setIsLibraryOpen(true)}
            className="h-9 px-4 text-xs font-bold gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-600/30 cursor-pointer"
          >
            <Layers className="size-3.5" />
            Show Form Templates
          </Button>
        </div>
      )}

      {/* ── Dialogue Pop-up Window: Template Library ── */}
      {isLibraryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-5xl max-h-[90vh] bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="h-16 border-b border-zinc-800 px-6 flex items-center justify-between shrink-0 bg-zinc-900/90">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-indigo-600/10 border border-indigo-600/20 flex items-center justify-center">
                  <Layers className="size-5 text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Registration Template Library</h3>
                  <p className="text-xs text-zinc-400">
                    Preview and fetch pre-configured form blueprints. Fetching copies the design for this event and activates it as default.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsLibraryOpen(false)}
                className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-zinc-950/40">
              <FormTemplateGallery
                templates={templates}
                categories={categories}
                facilityCategory="registration"
                mode="organiser-portal"
                hideHeader={true}
                activeTemplateId={activeTemplateId}
                onFetchTemplate={async (template) => {
                  if (await handleFetchTemplate(template)) setIsLibraryOpen(false);
                }}
                onEditTemplate={(tpl) => {
                  setIsLibraryOpen(false);
                  handleEditTemplate(tpl);
                }}
                onSelectTemplate={async (template) => {
                  if (await handleFetchTemplate(template)) setIsLibraryOpen(false);
                }}
                onCreateCustomTemplate={handleCreateCustomTemplate}
              />
              <ScopedCommandFeedback failure={readFailure.templates} retryAt={readRetryAt.templates} />
              <ScopedCommandFeedback failure={readFailure.categories} retryAt={readRetryAt.categories} />
              {nextTemplateCursor ? <Button disabled={loading || Boolean(readFailure.initial) || readBlocked.templates} type="button" variant="outline" className="mt-4 w-full"
                onClick={() => void loadMoreTemplates()}>Load more templates</Button> : null}
              {nextCategoryCursor ? <Button disabled={loading || Boolean(readFailure.initial) || readBlocked.categories} type="button" variant="outline" className="mt-2 w-full"
                onClick={() => void loadMoreCategories()}>Load more categories</Button> : null}
            </div>
          </div>
        </div>
      )}
    </OrganiserPage>
    </fieldset>
  );
}
