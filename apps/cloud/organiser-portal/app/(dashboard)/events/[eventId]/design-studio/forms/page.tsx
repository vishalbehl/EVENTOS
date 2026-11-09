"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FormTemplateGallery,
  FormTemplate,
  FormCategory,
} from "@eventos/form-builder-studio";
import { ScopedEventEditor } from "@/components/organizer/events/ScopedEventEditor";
import { ScopedCommandFeedback } from "@/components/organizer/events/ScopedCommandFeedback";
import { useEventTemplateCopy } from "@/hooks/useEventTemplateCopy";
import { organiserFormService } from "@/services/form-template-service";
import { OrganiserPage } from "@/components/organizer/workspace/OrganiserPrimitives";
import {
  RefreshCw, Plus, Layers, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCataloguePageRequests } from "@/hooks/useCataloguePageRequests";
import { appendCataloguePage, nextCatalogueCursor } from "@/lib/catalogue-pages";

export default function DesignStudioFormsPage() {
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
        organiserFormService.listTemplatePage({ event_id: eventId, page_size: "50" }, signal),
      ]), ([cats, tpls]) => {
      const categoryCursor = nextCatalogueCursor(cats);
      const templateCursor = nextCatalogueCursor(tpls);
      setCategories(appendCataloguePage([], cats.items || []));
      setNextCategoryCursor(categoryCursor);
      setTemplates(appendCataloguePage([], tpls.items || []));
      setNextTemplateCursor(templateCursor);

      // This cross-facility catalogue has no single operational selection.
      setActiveTemplateId("");
    }, err => {
      if (copy.isCurrent()) {
        setTemplates([]);
        setActiveTemplateId("");
        setLoadError(err.message || "Template catalogue unavailable.");
      }
    });
  }, [eventId, readPage]);

  const loadMoreTemplates = async () => {
    if (!nextTemplateCursor || loading) return;
    await readPage("templates", signal => organiserFormService.listTemplatePage({ event_id: eventId,
      page_size: "50", cursor: nextTemplateCursor }, signal), page => {
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
    if (["abstract", "registration", "speaker", "speaker_intake", "survey"].includes(template.category_key)) {
      const destination = template.category_key === "abstract" ? "abstracts/form-builder"
        : template.category_key === "registration" ? "registration/form-builder"
        : template.category_key === "survey" ? "surveys/templates" : "speakers/templates";
      router.push(`/events/${eventId}/${destination}?templateId=${encodeURIComponent(template.id)}`);
      return;
    }
    try {
      const copied = await copy.save(copy.selectTarget(template, templates), {
        name: template.name,
        fields: template.fields || [],
        settings: template.settings || {},
      });
      if (!copied || !copy.isCurrent()) return;
      setTemplates(current => [...current.filter(item => item.id !== copied.id), copied]);
      toast.success(`"${template.name}" saved as an event-scoped draft. It is not an active operational form.`);
    } catch (err: any) {
      if (!copy.isCurrent()) return;
      toast.error(err.message || "Failed to fetch template");
    }
  };

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
      const created = await copy.execute<FormTemplate>("post", "/forms/templates", {
        scope_type: "ORGANIZATION",
        name: data.name,
        category_key: data.category_key || "custom",
        description: data.description,
        fields: [],
      });
      if (!created || !copy.isCurrent()) return false;
      toast.success("Created custom form blueprint!");
      if (created && created.id) {
        router.push(`/events/${eventId}/registration/form-builder?templateId=${created.id}`);
      } else {
        loadData();
      }
    } catch (err: any) {
      if (copy.isCurrent()) toast.error(err.message || "Failed to create custom template");
      return false;
    }
  };

  const handleCreateCategory = async (name: string, description: string) => {
    try {
      const created = await copy.execute<FormCategory>("post", "/forms/categories", { name, description });
      if (!created || !copy.isCurrent()) return;
      setCategories(current => [...current.filter(item => item.id !== created.id), created]);
      toast.success("Created custom form category!");
    } catch (err: any) {
      toast.error(err.message || "Failed to create category");
      return false;
    }
  };

  const handleDeleteCategory = async (id: string) => {
    try {
      const category = categories.find(item => item.id === id);
      if (!category?.version) throw new Error("Reload the persisted category before deleting.");
      await copy.execute<void>("delete", `/forms/categories/${id}`, undefined, category.version);
      if (!copy.isCurrent()) return;
      setCategories(current => current.filter(item => item.id !== id));
      toast.success("Category deleted!");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete category");
    }
  };

  // Operational selections belong to their registration, abstract, speaker,
  // or survey aggregate; this catalogue deliberately has no universal active form.

  return (
    <OrganiserPage
      title="Form Studio & Blueprints"
      description="Design, customize, and manage questionnaire layouts across all event facilities — Registration, Abstracts, Speaker Intakes, Surveys, and Sponsor Forms."
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
            Open Blank Designer
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
      {loadError && !readFailure.initial ? <p role="alert">{loadError} Reload the catalogue before making changes.</p> : null}
      <ScopedCommandFeedback failure={readFailure.initial} retryAt={readRetryAt.initial} />
      {readFailure.initial && !loading ? (
        <p role="status">The catalogue is unavailable. Reload it before choosing a template.</p>
      ) : loading && templates.length === 0 ? (
        <div className="p-16 flex flex-col items-center justify-center space-y-3 text-center">
          <RefreshCw className="size-8 text-indigo-500 animate-spin" />
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
            Loading Form Studio Blueprints...
          </p>
        </div>
      ) : (
        <div className="p-16 border-2 border-dashed border-zinc-800 rounded-2xl text-center space-y-4 bg-zinc-900/40 max-w-2xl">
          <Layers className="size-12 text-indigo-500/60 mx-auto" />
          <div>
            <h4 className="text-base font-bold text-white">No universal operational form</h4>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto mt-1">
              Forms are activated in their Registration, Abstracts, Speakers, or Surveys workspace. Event copies shown here remain drafts until explicitly bound there.
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
                  <h3 className="text-base font-bold text-white">Form Studio Template Library</h3>
                  <p className="text-xs text-zinc-400">
                    Preview questionnaire blueprints, then continue in the owning facility to make an explicit operational selection.
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
                mode="organiser-portal"
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
                onCreateCategory={handleCreateCategory}
                onDeleteCategory={handleDeleteCategory}
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
