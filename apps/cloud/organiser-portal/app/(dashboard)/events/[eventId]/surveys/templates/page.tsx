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
import { ScopedEventEditor } from "@/components/organizer/events/ScopedEventEditor";
import { ScopedCommandFeedback } from "@/components/organizer/events/ScopedCommandFeedback";
import { useEventTemplateCopy } from "@/hooks/useEventTemplateCopy";
import { organiserFormService, type OperationalFormBinding } from "@/services/form-template-service";
import { OrganiserPage } from "@/components/organizer/workspace/OrganiserPrimitives";
import {
  RefreshCw, Plus, ArrowLeft, Edit3, Layers, CheckCircle2,
  ArrowRight, X, Eye
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCataloguePageRequests } from "@/hooks/useCataloguePageRequests";
import { appendCataloguePage, nextCatalogueCursor } from "@/lib/catalogue-pages";

export default function OrganiserSurveyFormTemplatesPage() {
  const params = useParams();
  return <ScopedEventEditor eventId={String(params?.eventId || "")}><TemplatePage /></ScopedEventEditor>;
}

function TemplatePage() {
  const params = useParams();
  const router = useRouter();
  const eventId = (params?.eventId as string) || "";

  const copy = useEventTemplateCopy(eventId);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [categories, setCategories] = useState<FormCategory[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState<string>("");
  const [binding, setBinding] = useState<OperationalFormBinding | null>(null);
  const { run: readPage, pending: readPending, blocked: readBlocked, failure: readFailure, retryAt: readRetryAt } = useCataloguePageRequests(copy.isCurrent);
  const loading = readPending.initial;
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [nextTemplateCursor, setNextTemplateCursor] = useState<string | null>(null);
  const [nextCategoryCursor, setNextCategoryCursor] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!eventId) return;
    setLoadError(null);
    await readPage("initial", signal => Promise.all([
        organiserFormService.listCategoryPage({ event_id: eventId, page_size: "100" }, signal),
        organiserFormService.listTemplatePage({ category_key: "survey", event_id: eventId, page_size: "50" }, signal),
        organiserFormService.getOperationalBinding(eventId, "SURVEY", signal),
      ]), ([cats, tpls, currentBinding]) => {
      const categoryCursor = nextCatalogueCursor(cats);
      const templateCursor = nextCatalogueCursor(tpls);
      setCategories(appendCataloguePage([], cats.items || []));
      setNextCategoryCursor(categoryCursor);
      setTemplates(appendCataloguePage([], tpls.items || []));
      setNextTemplateCursor(templateCursor);
      setBinding(currentBinding);
      setActiveTemplateId(currentBinding.template_id || "");
    }, err => {
      if (copy.isCurrent()) {
        setTemplates([]);
        setBinding(null);
        setActiveTemplateId("");
        setLoadError(err.message || "Template catalogue unavailable.");
      }
    });
  }, [eventId, readPage]);

  const loadMoreTemplates = async () => {
    if (!nextTemplateCursor || loading) return;
    await readPage("templates", signal => organiserFormService.listTemplatePage({ category_key: "survey",
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
    if (!eventId || loading || copy.pending || readFailure.initial || loadError) return;
    try {
      if (!binding) throw new Error("Reload the current survey form binding before saving.");
      const target = copy.selectTarget(template, templates);
      const updated = await copy.execute<OperationalFormBinding>("put",
        `/forms/templates/events/${eventId}/operational-bindings/SURVEY`, {
          source_template_id: target.id, source_version: target.version,
          name: template.name, fields: template.fields || [], settings: template.settings || {},
        }, binding.version);
      const copied = updated?.template;
      if (!updated || !copied || !copy.isCurrent()) return;
      setTemplates(current => [...current.filter(item => item.id !== copied.id), copied]);
      setBinding(updated);
      setActiveTemplateId(copied.id);
      toast.success(`"${template.name}" is now the operational survey form.`);
    } catch (err: any) {
      if (!copy.isCurrent()) return;
      toast.error(err.message || "Failed to fetch template");
    }
  };

  const handleEditTemplate = (template: FormTemplate) => {
    if (!eventId) return;
    router.push(`/events/${eventId}/design-studio/forms?templateId=${template.id}`);
  };

  const handleCreateCustomTemplate = async (data: {
    name: string;
    category_key: string;
    description: string;
  }) => {
    try {
      const created = await copy.execute<FormTemplate>("post", "/forms/templates", {
        scope_type: "ORGANIZATION",
        name: data.name,
        category_key: "survey",
        description: data.description,
        fields: [],
      });
      if (!created || !copy.isCurrent()) return false;
      toast.success("Created custom survey template!");
      if (created && created.id) {
        router.push(`/events/${eventId}/design-studio/forms?templateId=${created.id}`);
      } else {
        loadData();
      }
    } catch (err: any) {
      if (copy.isCurrent()) toast.error(err.message || "Failed to create custom template");
      return false;
    }
  };

  // The committed purpose binding is the only operational selection.
  const activeTemplate = activeTemplateId
    ? templates.find(
        (t) =>
          t.id === activeTemplateId ||
          t.slug === activeTemplateId ||
          (t.settings as any)?._source_template_id === activeTemplateId
      ) || null
    : null;

  return (
    <OrganiserPage
      title="Survey & CSAT Form Template"
      description="Manage the active attendee evaluation and CSAT survey form, or browse the template library to fetch an alternative feedback blueprint."
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
            onClick={() => router.push(`/events/${eventId}/design-studio/forms`)}
            className="h-8 text-xs font-semibold gap-1.5 border-[var(--border-default)] cursor-pointer"
          >
            <ArrowLeft className="size-3.5" />
            All Form Studio
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={loadData}
            disabled={loading || readBlocked.initial || copy.pending}
            className="h-8 text-xs font-semibold gap-1.5 border-[var(--border-default)] cursor-pointer"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      }
    >
      <ScopedCommandFeedback failure={copy.failure} retryAt={copy.retryAt} />
      {loadError && !readFailure.initial ? <p role="alert">{loadError} Reload the catalogue and operational binding before making changes.</p> : null}
      <ScopedCommandFeedback failure={readFailure.initial} retryAt={readRetryAt.initial} />
      {readFailure.initial && !loading ? (
        <p role="status">The catalogue is unavailable. Reload it before choosing a template.</p>
      ) : loading && templates.length === 0 ? (
        <div className="p-16 flex flex-col items-center justify-center space-y-3 text-center">
          <RefreshCw className="size-8 text-indigo-500 animate-spin" />
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
            Loading Survey Blueprints...
          </p>
        </div>
      ) : activeTemplate ? (
        /* ── Side-by-Side: Active Template Details on Left, Form Preview on Right ── */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column (5 cols): Template Details & Actions */}
          <div className="lg:col-span-5 space-y-6">
            <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/60 backdrop-blur-sm shadow-xl space-y-6">
              <div className="space-y-3 pb-5 border-b border-zinc-800">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700">
                    {activeTemplate.category_name || "Survey & CSAT"}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                    <CheckCircle2 className="size-3" />
                    Saved Survey Copy
                  </span>
                </div>

                <h2 className="text-xl font-bold text-white tracking-tight">
                  {activeTemplate.name}
                </h2>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  {activeTemplate.description || "Active evaluation questionnaire layout for attendee and faculty feedback."}
                </p>

                {/* Actions */}
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

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Evaluation Questions</span>
                  <p className="text-lg font-black text-white">
                    {activeTemplate.fields?.length || 0}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Required Questions</span>
                  <p className="text-lg font-black text-indigo-400">
                    {activeTemplate.fields?.filter((f) => f.is_required).length || 0}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Form Scope</span>
                  <p className="text-xs font-bold text-zinc-300 mt-1">
                    Event Copy
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Survey State</span>
                  <p className="text-xs font-bold text-emerald-400 mt-1 flex items-center gap-1">
                    <CheckCircle2 className="size-3" /> Ready for Attendees
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
                    Form Preview
                  </span>
                </div>
                <span className="text-[11px] text-zinc-500 font-medium">
                  Attendee Feedback View
                </span>
              </div>
              <div className="p-6 max-h-[750px] overflow-y-auto bg-zinc-950/30">
                <FormRenderer
                  fields={activeTemplate.fields || []}
                  settings={activeTemplate.settings || {}}
                  previewMode={true}
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-16 border-2 border-dashed border-zinc-800 rounded-2xl text-center space-y-4 bg-zinc-900/40 max-w-2xl">
          <Layers className="size-12 text-indigo-500/60 mx-auto" />
          <div>
            <h4 className="text-base font-bold text-white">No operational survey selected</h4>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto mt-1">
              Event copies are not activated implicitly. Choose a template to bind an event-owned survey form.
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
                  <h3 className="text-base font-bold text-white">Survey & CSAT Template Library</h3>
                  <p className="text-xs text-zinc-400">
                    Preview and fetch post-event evaluation questionnaires. Fetching copies the blueprint for this event.
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
                facilityCategory="survey"
                mode="organiser-portal"
                hideHeader={true}
                activeTemplateId={activeTemplateId}
                onFetchTemplate={async (template) => {
                  await handleFetchTemplate(template);
                }}
                onEditTemplate={(tpl) => {
                  setIsLibraryOpen(false);
                  handleEditTemplate(tpl);
                }}
                onSelectTemplate={async (template) => {
                  await handleFetchTemplate(template);
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
  );
}
